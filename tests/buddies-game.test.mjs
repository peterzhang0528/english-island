import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBuddyDirector, isForeignSpeech, lineSeconds, mentions, normalizeSpeech } from '../public/game/js/buddies-game.js';
import { HIDING_PLACES, ISLAND_RADIUS, PLACES, PLACE_IDS, PLAYER_SPEED, SPAWN, clampToIsland, distance } from '../public/game/js/buddies-map.js';

function seeded(seed = 7) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

/** Plays the game with a simple bot: it walks wherever the current goal points and may say the offered phrases. */
function play({ seconds, stage = 1, talk = false, walk = true, replies = true, seed = 7, pace = 1, until = () => false }) {
  const events = [], player = { ...SPAWN.player };
  let focus = null, chips = [], sinceTalk = 0;
  const director = createBuddyDirector({ random: seeded(seed), stage, replies, emit: event => {
    events.push({ ...event, at: director?.state.time ?? 0 });
    if (event.type === 'goal') focus = event.place;
    if (event.type === 'chips') { chips = event.phrases; sinceTalk = 0; }
  } });
  director.start();
  const dt = .1;
  for (let time = 0; time < seconds && !until(director.state, events); time += dt) {
    const state = director.state;
    let target = null;
    if (walk) {
      const apple = state.apples.filter(item => !item.taken).sort((a, b) => distance(player, a) - distance(player, b))[0];
      const hider = ['mia', 'leo'].find(who => state.buddies[who].hidden);
      if (apple) target = apple; else if (hider) target = state.buddies[hider]; else if (focus) target = PLACES[focus]; else target = state.buddies.mia;
    }
    if (target && distance(player, target) > .8) {
      const length = distance(player, target), step = Math.min(length, PLAYER_SPEED * pace * dt);
      Object.assign(player, clampToIsland({ x: player.x + (target.x - player.x) / length * step, z: player.z + (target.z - player.z) / length * step }));
    }
    if (talk && chips.length && (sinceTalk += dt) > 1.5) { director.heard(chips[chips.length - 1]); sinceTalk = -Infinity; }
    director.tick(dt, { player });
    if (state.open && state.open.left < lineSeconds('x x x') - 1.5) director.lineDone(state.open.who);   // lines take about 1.5 s here
  }
  return { director, events, player, of: type => events.filter(event => event.type === type) };
}

test('speech is normalised to plain English words and other languages are noticed', () => {
  assert.equal(normalizeSpeech('  The APPLE-tree!! '), 'the apple tree');
  assert.equal(normalizeSpeech("I'm  here."), "i'm here");
  assert.equal(normalizeSpeech('苹果树'), ''); assert.equal(normalizeSpeech(null), '');
  assert.equal(isForeignSpeech('我不知道'), true); assert.equal(isForeignSpeech('こんにちは'), true); assert.equal(isForeignSpeech('I do not know'), false);
  assert.equal(isForeignSpeech('Привет'), true); assert.equal(isForeignSpeech('Nǐ hǎo'), true);
  assert.equal(isForeignSpeech('Ni hao. Wo bu hui shuo ying yu. Wo men qu nali wan'), true); assert.equal(isForeignSpeech('Xie xie'), true);
  for (const english of ['Hi', 'Boat!', 'Can you see me', 'You can run', 'I like the sheep', 'Come here', 'No no no', 'Me too', 'He ran to the tree', 'Wait for me', 'Ten apples', 'I want the apple', 'Yes', 'We won'])
    assert.equal(isForeignSpeech(english), false, english);
  assert.equal(mentions('go to the boat now', 'boat'), true); assert.equal(mentions('a sailboat', 'boat'), false);
  assert.ok(lineSeconds('Hi!') < lineSeconds('One two three four five six seven')); assert.ok(lineSeconds('word '.repeat(200)) <= 14);
});

test('the island map keeps every landmark, spawn and hiding place on land and apart', () => {
  assert.equal(PLACE_IDS.length, 8);
  for (const id of PLACE_IDS) {
    const place = PLACES[id];
    assert.equal(place.id, id); assert.ok(Math.hypot(place.x, place.z) < ISLAND_RADIUS - 1, id);
    assert.ok(place.say.includes(place.quiz) && place.say.every(word => word === normalizeSpeech(word)), `${id} can be matched in speech`);
    for (const other of PLACE_IDS) if (other !== id) assert.ok(distance(place, PLACES[other]) > 6, `${id} and ${other} overlap`);
  }
  for (const id of HIDING_PLACES) assert.ok(PLACES[id]);
  assert.ok(distance(SPAWN.player, SPAWN.mia) > 10, 'the player starts away from the companions and has to walk over');
  const edge = clampToIsland({ x: 100, z: 0 }); assert.ok(Math.hypot(edge.x, edge.z) <= ISLAND_RADIUS);
});

test('Mia and Leo first play with each other, then notice the new kid and call them over', () => {
  const { events, of, director } = play({ seconds: 40, walk: false });
  const says = of('say');
  assert.deepEqual(says.slice(0, 4).map(event => event.who), ['leo', 'mia', 'mia', 'leo']);
  assert.match(says[0].text, /Tag/); assert.equal(says[0].fact, '', 'banter between the two needs no game fact');
  assert.match(says[2].fact, /new kid just joined/);
  assert.ok(says.slice(4).length >= 2 && says.slice(4).every(event => /Come|Walk|shy/.test(event.text)), 'they keep calling a player who stands still');
  assert.equal(director.state.round, 'welcome'); assert.equal(of('cheer').length, 0);
  assert.deepEqual(events.find(event => event.type === 'chips').phrases, ['Hi!', 'Hello!']);
});

test('one line is open at a time and a busy voice holds the next line back', () => {
  const says = [];
  const director = createBuddyDirector({ random: seeded(), emit: event => { if (event.type === 'say') says.push(event); } });
  director.start(); director.tick(.1, { player: SPAWN.player });
  assert.equal(says.length, 1);
  for (let index = 0; index < 10; index++) director.tick(.1, { player: SPAWN.player });
  assert.equal(says.length, 1, 'the first line is still being spoken');
  director.lineDone('mia'); director.tick(.1, { player: SPAWN.player }); assert.equal(says.length, 1, 'another speaker cannot close the line');
  director.lineDone('leo'); director.tick(.1, { player: SPAWN.player, busy: true }); assert.equal(says.length, 1, 'somebody is still talking');
  director.tick(.1, { player: SPAWN.player }); assert.equal(says.length, 2);
  for (let index = 0; index < 200; index++) director.tick(.1, { player: SPAWN.player, busy: true });
  director.tick(.1, { player: SPAWN.player }); assert.equal(says.length, 3, 'a line that never reports back still times out');
});

test('a listening player can finish every game by moving only', () => {
  const { director, of, events } = play({ seconds: 900, until: state => state.rounds >= 4 });
  assert.equal(director.state.rounds, 4, 'follow, apples, hide and seek and race all finish');
  assert.deepEqual(of('round').map(event => event.id), ['welcome', 'follow', 'apples', 'hide', 'race']);
  assert.equal(director.state.spoken, 0);
  assert.equal(of('spawn').length, 6); assert.equal(of('remove').length, 6);
  assert.deepEqual(of('hide').map(event => event.who), ['mia']); assert.deepEqual(of('show').map(event => event.who), ['mia']);
  assert.ok(director.state.words.includes('apple') && director.state.words.length >= 4);
  assert.ok(of('cheer').length >= 5);
  const speakers = new Set(of('say').map(event => event.who)); assert.deepEqual([...speakers].sort(), ['leo', 'mia']);
  for (const event of of('say')) { assert.ok(event.text.length <= 90, event.text); assert.doesNotMatch(event.text + (event.fact ?? ''), /[\u3400-\u9fff]/u); }
  const firstRound = events.filter(event => event.at < of('round')[2].at);
  assert.ok(!firstRound.some(event => event.type === 'say' && /\?/.test(event.text) && /What|Where/.test(event.text)), 'nobody quizzes the player during the first listening game');
  assert.deepEqual(of('stage').map(event => event.stage), [2], 'after one full game the companions start offering single words');
});

test('scripted lines agree with plural places such as the flowers and the sheep', () => {
  const places = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    // A slow walker makes the companions call out the place while they wait.
    const { of } = play({ seconds: 500, stage: 2, seed, pace: .25, until: state => state.rounds >= 2 });
    for (const { text } of of('say')) {
      assert.doesNotMatch(text, /\b(flowers|sheep) is\b|\b(this is|it's) the (flowers|sheep)\b/i, text);
      const called = text.match(/The (flowers|sheep) are over here/); if (called) places.add(called[1]);
    }
  }
  assert.deepEqual([...places].sort(), ['flowers', 'sheep']);
});

test('hide and seek keeps the hiding place secret from the seeker', () => {
  const { of } = play({ seconds: 900, until: state => state.rounds >= 3 });
  const hide = of('hide')[0], spot = PLACES[hide.place].word;
  const beforeFound = of('say').filter(event => event.at <= of('show')[0].at);
  for (const event of beforeFound.filter(line => !line.secret)) assert.ok(!`${event.fact ?? ''}`.includes(`near the ${spot}`), 'shared facts do not reveal the spot');
  assert.ok(beforeFound.some(event => event.secret && /Count to five/.test(event.fact)));
  assert.ok(of('say').some(event => event.text.includes(`behind the ${spot}`)));
});

test('speaking English moves the player from words to sentences and to leading the game', () => {
  const { director, of } = play({ seconds: 1500, talk: true, until: (state, events) => state.rounds >= 5 });
  assert.deepEqual(of('stage').map(event => event.stage), [2, 3]);
  assert.ok(director.state.spoken >= 6 && director.state.hits >= 4);
  assert.ok(of('say').some(event => /or .+\?$/.test(event.text)), 'stage 2 offers an either-or word choice');
  assert.ok(of('say').some(event => event.text === 'Your turn! Where do we go now?'), 'stage 3 lets the player lead');
  assert.ok(of('goal').some(event => /You are the leader/.test(event.text)));
  assert.ok(of('chips').some(event => event.phrases.some(phrase => /^Let's go to the /.test(phrase))));
});

test('Chinese gets a puzzled English answer in the demo and no scripted answer when live', () => {
  const run = replies => {
    const says = [], other = [];
    const director = createBuddyDirector({ random: seeded(), replies, emit: event => (event.type === 'say' ? says : other).push(event) });
    director.start();
    const step = () => { director.tick(.1, { player: SPAWN.player }); director.lineDone(); };
    step(); says.length = 0;
    assert.equal(director.heard('你好，我听不懂'), false); step();
    const afterChinese = says.map(event => event.text); says.length = 0; step(); says.length = 0;
    assert.equal(director.heard('Hello!'), true); step();
    return { afterChinese, afterHello: says.map(event => event.text), other, state: director.state };
  };
  const demo = run(true);
  assert.deepEqual(demo.afterChinese, ["Huh? I don't get it. Can you say it in English?"]);
  assert.deepEqual(demo.afterHello, ['Hi! Nice to meet you!']);
  assert.ok(demo.other.some(event => event.type === 'foreign')); assert.equal(demo.state.spoken, 1); assert.equal(demo.state.stage, 2);
  const live = run(false);
  assert.ok(!live.afterChinese.some(text => /English/.test(text)) && !live.afterHello.includes('Hi! Nice to meet you!'), 'live companions answer by themselves');
  assert.equal(live.state.spoken, 1);
});

test('companions stay on the island and near the player while following', () => {
  const { director } = play({ seconds: 600, until: state => state.rounds >= 4 });
  for (const who of ['mia', 'leo']) { const buddy = director.state.buddies[who]; assert.ok(Math.hypot(buddy.x, buddy.z) <= ISLAND_RADIUS + .01, who); assert.equal(buddy.hidden, false); }
});
