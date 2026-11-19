// Buddy Island director: pure game rules, no DOM, audio or Three.js.
// It decides what Mia and Leo do and what they should talk about. The page turns
// `say` events into GPT-Live notes (or labelled demo speech) and renders positions.
import { BUDDIES, otherBuddy } from './buddies-contract.js';
import { HIDING_PLACES, PLACES, PLACE_IDS, SPAWN, clampToIsland, distance } from './buddies-map.js';

const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
const cap = text => text.charAt(0).toUpperCase() + text.slice(1);
const name = who => BUDDIES[who].name;

export function normalizeSpeech(text) {
  return String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Speech recognition sometimes writes Chinese as pinyin. These syllables are common in spoken Chinese and are not English words.
const PINYIN = new Set(('ni hao wo bu hui shuo shi zhe ge yi liang san wu liu jiu zai mei dou yao qu lai xie dui zhi dao xiang xi huan chi zen shei shui jiao xue xing zi ren guo zhong ying yu hua lao tong peng jia xiao duo shao zhen xian jin tian zuo nian yue kuai qian piao gao wei shen hai gei gen cong xia qing wen ting kan wan dong mai neng ke nar zher nali zheli'
  + ' women nimen tamen shenme zenme weishenme pengyou xiexie zaijian duibuqi meiguanxi keyi zhidao xihuan yingyu zhongwen hanyu laoshi mingzi').split(' '));
/** True when recognized Latin letters are really Chinese written as pinyin. */
export function isPinyin(words) {
  const tokens = String(words ?? '').split(' ').filter(Boolean);
  return tokens.length >= 2 && tokens.filter(token => PINYIN.has(token)).length * 2 >= tokens.length;
}
/** Not English: letters from another script, tone-marked pinyin, or plain pinyin. */
export function isForeignSpeech(text) {
  const raw = String(text ?? '');
  return /(?=\p{L})\P{Script=Latin}/u.test(raw) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/iu.test(raw) || isPinyin(normalizeSpeech(raw));
}
export function mentions(heard, phrase) { return ` ${heard} `.includes(` ${phrase} `); }
/** Fallback speaking time when the page cannot tell that a line has finished. */
export function lineSeconds(text) { return Math.min(14, 2.5 + String(text).split(/\s+/).length * 0.55); }

const REPLIES = [
  [['hi', 'hello', 'hey'], 'Hi! Nice to meet you!'],
  [['wait'], "Okay! We'll wait for you!"],
  [['where'], 'Over here! Come on!'],
  [['fun', 'again', 'cool'], 'Yeah! So much fun!'],
  [['thank you', 'thanks'], "You're welcome!"],
  [['yes', 'okay', 'ok'], 'Awesome! Come on!'],
];

/** replies: false when live companions answer the player's voice themselves. */
export function createBuddyDirector({ emit = () => {}, random = Math.random, stage = 1, replies = true } = {}) {
  const buddy = who => ({ x: SPAWN[who].x, z: SPAWN[who].z, tx: SPAWN[who].x, tz: SPAWN[who].z, speed: 0, follow: null, gap: 2.4, hidden: false, moving: false, heading: 0, rest: 0, apple: null });
  const state = {
    time: 0, stage: [1, 2, 3].includes(stage) ? stage : 1, round: '', rounds: 0, hides: 0,
    player: { ...SPAWN.player }, busy: false, buddies: { mia: buddy('mia'), leo: buddy('leo') },
    heard: [], spoken: 0, hits: 0, foreign: false, reply: null, words: [], apples: [], open: null,
  };
  const pick = list => list[Math.floor(random() * list.length)];
  const shuffle = list => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
  const say = (who, text, fact = '', secret = false) => ({ do: 'say', who, text, key: true, fact, secret });
  const banter = (who, text) => ({ do: 'say', who, text, key: false, fact: '', secret: false });
  const wait = seconds => ({ do: 'wait', left: seconds });
  const run = update => ({ do: 'run', update });
  const near = (a, b, r) => distance(a, b) <= r;
  const go = (who, target, speed = 5.4) => { const b = state.buddies[who], p = clampToIsland(target); b.follow = null; b.tx = p.x; b.tz = p.z; b.speed = speed; };
  const follow = (who, whom, gap = 2.6) => { const b = state.buddies[who]; b.follow = whom; b.gap = gap; b.speed = 5.8; };
  // Buddies wait on the inland side of a place and hide on its seaward side.
  const around = (place, slot) => { const a = Math.atan2(-place.z, -place.x) + (slot ? .75 : -.75); return { x: place.x + Math.cos(a) * 1.9, z: place.z + Math.sin(a) * 1.9 }; };
  const behind = place => { const a = Math.atan2(place.z, place.x); return clampToIsland({ x: place.x + Math.cos(a) * 2.6, z: place.z + Math.sin(a) * 2.6 }, .8); };
  const goal = (text, place) => emit({ type: 'goal', text, place: place ?? null });
  const chips = phrases => emit({ type: 'chips', phrases });
  const cheer = () => emit({ type: 'cheer' });
  const round = (id, title) => { state.round = id; emit({ type: 'round', id, title }); };
  const learn = word => { if (!state.words.includes(word)) { state.words.push(word); emit({ type: 'word', word }); } };
  function setStage(next) { if (next > state.stage) { state.stage = next; emit({ type: 'stage', stage: next }); } }
  function hit() { state.hits++; if (state.stage === 2 && state.hits >= 4) setStage(3); }
  function speak(line) { state.open = { who: line.who, left: lineSeconds(line.text) }; emit({ type: 'say', who: line.who, text: line.text, key: line.key, fact: line.fact, secret: line.secret }); }
  function trySay(line) { if (state.open || state.busy) return false; speak(line); return true; }
  function heardSince(since, phrases) {
    for (const entry of state.heard) {
      if (entry.used || entry.at < since) continue;
      const found = phrases.find(phrase => mentions(entry.words, phrase));
      if (found) { entry.used = true; return found; }
    }
    return null;
  }
  function nudger(lines, fact, every = 10) {
    let left = every, index = 0;
    return dt => { left -= dt; if (left > 0) return; const [who, text] = lines[index % lines.length]; if (trySay(say(who, text, fact))) { index++; left = every; } };
  }
  const nearestBuddy = () => distance(state.player, state.buddies.mia) <= distance(state.player, state.buddies.leo) ? 'mia' : 'leo';

  function* welcome() {
    round('welcome', 'Say hi');
    goal('Walk over to Mia and Leo.');
    chips(['Hi!', 'Hello!']);
    go('leo', { x: 4, z: -1 }, 6); go('mia', { x: -3, z: 5 }, 6);
    yield banter('leo', "Tag! You're it, Mia!");
    follow('mia', 'leo', 1.6);
    yield banter('mia', "Hey! No fair! I'm gonna get you!");
    go('mia', SPAWN.mia, 4); go('leo', SPAWN.leo, 4);
    const fact = 'A new kid just joined your game. The new kid is standing on the beach, a little far away from you two.';
    yield say('mia', "Ooh, look! A new kid! Hi! I'm Mia!", fact);
    yield say('leo', "Hey! I'm Leo! Come play with us!", fact);
    const nudge = nudger([['mia', 'Come here! Over here!'], ['leo', 'Walk to us! This way!'], ['mia', "Don't be shy! Come on!"]], 'The new kid is still standing far away from you two.', 9);
    yield run(dt => { if (near(state.player, state.buddies.mia, 5) || near(state.player, state.buddies.leo, 5)) return true; nudge(dt); });
    cheer();
    yield say('mia', "Yay! You're here! Let's play!", 'The new kid walked over and is standing right next to you two now.');
  }

  function* askWord(who, place) {
    const short = place.quiz, wrong = PLACES[pick(PLACE_IDS.filter(id => id !== place.id))].quiz;
    const options = random() < .5 ? [short, wrong] : [wrong, short];
    chips([`${cap(short)}!`, `${place.plural ? "They're" : "It's"} the ${place.word}.`]);
    const since = state.time;
    yield say(who, `${place.plural ? 'What are these' : 'What is this'}? ${cap(options[0])} or ${options[1]}?`, `You are all standing at the ${place.word}. Give the new kid an easy chance to name it.`);
    let left = 9;
    const got = yield run(dt => { if (heardSince(since, place.say)) return true; left -= dt; if (left <= 0) return false; });
    if (got) { hit(); cheer(); yield say(who, `Yes! The ${place.word}! Nice!`, `The new kid said "${short}" in English. That is right.`); }
    else yield say(who, `${place.plural ? "They're" : "It's"} the ${place.word}. ${cap(short)}!`, 'The new kid stayed quiet. That is okay. Say the name yourself and keep playing.');
    chips([]);
  }

  function* trip(leader, place, first) {
    const friend = otherBuddy(leader);
    goal(`Follow ${name(leader)} to the ${place.word}.`, place.id);
    yield say(leader, first ? `Follow me! Let's go to the ${place.word}!` : `Now follow me! To the ${place.word}!`, `You are playing follow-the-leader. ${name(leader)} is the leader and is running to the ${place.word}.`);
    go(leader, around(place, 0), 5.2); go(friend, around(place, 1), 4.6);
    const nudge = nudger([[friend, `This way! The ${place.word} ${place.plural ? "are" : "is"} over here!`], [leader, `Come on! To the ${place.word}!`]], `The new kid has not reached the ${place.word} yet.`);
    yield run(dt => { if (near(state.player, place, place.r)) return true; nudge(dt); });
    learn(place.word); cheer();
    yield say(friend, `You made it! ${place.plural ? 'These are' : 'This is'} the ${place.word}!`, `The new kid reached the ${place.word}.`);
    if (state.stage >= 2) yield* askWord(leader, place);
  }

  function* playerLeads(asker) {
    const friend = otherBuddy(asker), options = shuffle(PLACE_IDS).slice(0, 3).map(id => PLACES[id]);
    goal('Your turn! Say where to go.');
    chips(options.map(place => `Let's go to the ${place.word}!`));
    const since = state.time;
    follow('mia', 'player'); follow('leo', 'player', 3.4);
    yield say(asker, 'Your turn! Where do we go now?', 'It is the new kid’s turn to be the leader and pick a place on the island.');
    let left = 14, chosen = null;
    yield run(dt => {
      for (const id of PLACE_IDS) if (heardSince(since, PLACES[id].say)) { chosen = PLACES[id]; return true; }
      left -= dt; if (left <= 0) return false;
    });
    chips([]);
    if (!chosen) { yield* trip(friend, pick(options), false); return; }
    hit();
    goal(`You are the leader! Take Mia and Leo to the ${chosen.word}.`, chosen.id);
    yield say(friend, `The ${chosen.word}! Okay, let's go!`, `The new kid picked the ${chosen.word}. Now the new kid leads and you two follow.`);
    const nudge = nudger([[asker, `We're right behind you! To the ${chosen.word}!`]], `You are following the new kid to the ${chosen.word}.`, 12);
    yield run(dt => { if (near(state.player, chosen, chosen.r)) return true; nudge(dt); });
    learn(chosen.word); cheer();
    yield say(asker, "We're here! You are a great leader!", `The new kid led everyone to the ${chosen.word}.`);
  }

  function* followRound() {
    round('follow', 'Follow the leader');
    let leader = state.rounds % 2 ? 'leo' : 'mia';
    const places = shuffle(PLACE_IDS).slice(0, 2).map(id => PLACES[id]);
    for (const [index, place] of places.entries()) { yield* trip(leader, place, index === 0); leader = otherBuddy(leader); }
    if (state.stage >= 3) yield* playerLeads(leader);
    // After one full game of listening and moving, the companions start offering single words.
    setStage(2);
  }

  function* appleRound() {
    round('apples', 'Apple hunt');
    const total = 6, tree = PLACES.tree;
    let picked = 0, pending = null, since = state.time;
    state.apples = [];
    yield say('mia', "I'm hungry! Let's pick apples!", 'Apples fell on the grass all around the apple tree. You all want to pick six apples together.');
    for (let index = 0; index < total; index++) {
      const angle = index / total * Math.PI * 2 + random(), radius = 4.5 + random() * 5;
      const apple = { id: `apple-${state.rounds}-${index}`, ...clampToIsland({ x: tree.x + Math.cos(angle) * radius, z: tree.z + Math.sin(angle) * radius }, 2), taken: false };
      state.apples.push(apple); emit({ type: 'spawn', kind: 'apple', id: apple.id, x: apple.x, z: apple.z });
    }
    const status = () => { goal(`Pick apples near the apple tree: ${picked} / ${total}. Walk over an apple.`, 'tree'); if (state.stage >= 2 && picked < total) chips([`${cap(NUMBERS[picked + 1])}!`]); };
    status();
    yield say('leo', 'Six apples! Run to an apple to pick it!', 'The apples are on the grass near the apple tree. You pick one by running over it.');
    const take = (apple, by) => {
      apple.taken = true; picked++; emit({ type: 'remove', id: apple.id });
      const number = cap(NUMBERS[picked]), speaker = by === 'player' ? pick(['mia', 'leo']) : by;
      pending = by === 'player'
        ? say(speaker, `${number}! Nice one!`, `The new kid picked an apple. That makes ${NUMBERS[picked]} of six.`)
        : say(speaker, `${number}!`, `${name(by)} picked an apple. That makes ${NUMBERS[picked]} of six.`);
      if (picked > 1 && heardSince(since, [NUMBERS[picked], NUMBERS[picked - 1]])) hit();
      since = state.time; status();
    };
    yield run(dt => {
      for (const apple of state.apples) if (!apple.taken && near(state.player, apple, 1.7)) take(apple, 'player');
      for (const who of ['mia', 'leo']) {
        const b = state.buddies[who];
        if (b.rest > 0) { b.rest -= dt; continue; }
        if (!b.apple || b.apple.taken) {
          const taken = state.buddies[otherBuddy(who)].apple;
          b.apple = state.apples.filter(apple => !apple.taken && apple !== taken).sort((a, c) => distance(b, a) - distance(b, c))[0] ?? null;
          if (b.apple) go(who, b.apple, 3.6);
        } else if (near(b, b.apple, 1.1)) { take(b.apple, who); b.apple = null; b.rest = 3 + random() * 3; }
      }
      if (pending && trySay(pending)) pending = null;
      if (picked >= total) return true;
    });
    for (const who of ['mia', 'leo']) { state.buddies[who].apple = null; state.buddies[who].rest = 0; }
    state.apples = []; chips([]); learn('apple'); cheer();
    go('mia', around(tree, 0)); go('leo', around(tree, 1));
    yield say('leo', 'Six apples! We did it! Yum!', 'All six apples are picked. Everyone eats an apple together.');
  }

  function* hideRound() {
    round('hide', 'Hide and seek');
    const hider = state.hides++ % 2 ? 'leo' : 'mia', seeker = otherBuddy(hider);
    const spot = PLACES[pick(HIDING_PLACES.filter(id => !near(state.player, PLACES[id], 12)).concat(HIDING_PLACES).slice(0, 3))];
    const place = behind(spot);
    goal(`Hide and seek! ${name(hider)} hides. Count with ${name(seeker)}.`);
    yield say(seeker, `Let's play hide and seek! ${name(hider)} hides. We count!`, `You start a game of hide and seek. ${name(hider)} hides. ${name(seeker)} and the new kid count, then look for ${name(hider)}.`);
    go(hider, place, 8); follow(seeker, 'player');
    chips(['One, two, three!', 'Ready or not!']);
    // The seeker is not told the hiding place, so the search is real for both companions.
    yield say(seeker, 'One, two, three, four, five! Ready or not, here we come!', `${name(hider)} ran off to hide. You do not know where. Count to five out loud, then start looking.`, true);
    let left = 6;
    yield run(dt => { left -= dt; if (near(state.buddies[hider], place, .6) || left <= 0) return true; });
    const h = state.buddies[hider]; h.x = place.x; h.z = place.z; h.hidden = true; emit({ type: 'hide', who: hider, place: spot.id });
    goal(`Find ${name(hider)}! "Warmer" means closer. "Colder" means farther.`);
    chips([`Where is ${name(hider)}?`, 'I found you!']);
    const since = state.time;
    let last = distance(state.player, place), timer = 0, quiet = 0;
    yield run(dt => {
      const d = distance(state.player, place);
      if (d < 3.6) return true;
      timer += dt; quiet += dt;
      if (timer >= 4 && Math.abs(d - last) > 3) {
        const closer = d < last;
        if (trySay(say(seeker, closer ? (d < 9 ? 'Hot! Super hot!' : 'Warmer! Warmer!') : 'Colder! Brr, colder!', closer ? `You can tell the new kid is getting closer to ${name(hider)}.` : `You can tell the new kid is walking away from ${name(hider)}.`, true))) { last = d; timer = 0; quiet = 0; }
      } else if (quiet >= 16 && trySay(say(hider, `Psst! I'm near the ${spot.word}!`, `Nobody has found you yet. Give a little hint: you are hiding near the ${spot.word}.`, true))) quiet = 0;
    });
    h.hidden = false; emit({ type: 'show', who: hider }); chips([]); cheer(); learn(spot.word);
    if (heardSince(since, ['found you', 'found'])) hit();
    yield say(hider, `You found me! I was behind the ${spot.word}!`, `The new kid found ${name(hider)} hiding behind the ${spot.word}.`);
    yield banter(seeker, 'Good job! That was fast!');
  }

  function* raceRound() {
    round('race', 'Race');
    const place = shuffle(PLACE_IDS).slice(0, 3).map(id => PLACES[id]).sort((a, b) => distance(state.player, b) - distance(state.player, a))[0];
    const caller = pick(['mia', 'leo']), friend = otherBuddy(caller);
    follow('mia', 'player', 2.2); follow('leo', 'player', 3);
    goal(`Get ready to race to the ${place.word}!`, place.id);
    yield say(caller, `Let's race to the ${place.word}!`, `You are all going to race to the ${place.word}. The first one there wins.`);
    chips(['Ready, set, go!']);
    yield say(friend, 'Ready... set... GO!', 'Start the race now with: ready, set, go.');
    goal(`Race to the ${place.word}! Go, go, go!`, place.id);
    go('mia', around(place, 0), 5.1); go('leo', around(place, 1), 4.7);
    let winner = null;
    yield run(() => {
      if (near(state.player, place, place.r)) winner = 'player';
      else for (const who of ['mia', 'leo']) if (near(state.buddies[who], place, 2.4)) winner = who;
      if (winner) return true;
    });
    chips([]); learn(place.word);
    if (winner === 'player') { cheer(); yield say(caller, 'You win! You are so fast!', `The new kid won the race to the ${place.word}.`); return; }
    yield say(winner, 'I win! Good race!', `${name(winner)} got to the ${place.word} first.`);
    const nudge = nudger([[otherBuddy(winner), `Come on! The ${place.word} ${place.plural ? "are" : "is"} right here!`]], `The new kid is still on the way to the ${place.word}.`);
    yield run(dt => { if (near(state.player, place, place.r)) return true; nudge(dt); });
    cheer();
    yield say(otherBuddy(winner), 'You made it! Good race!', `The new kid reached the ${place.word} too.`);
  }

  function* breather() {
    const first = pick(['mia', 'leo']);
    goal('Take a little break with Mia and Leo.');
    chips(state.stage >= 2 ? ['That was fun!', "Let's play again!"] : []);
    follow('mia', 'player', 2.4); follow('leo', 'player', 3.2);
    yield banter(first, pick(['That was fun!', 'Phew! I need a break!', 'This island is so cool!']));
    yield banter(otherBuddy(first), pick(["Yeah! Let's play more!", 'Me too! What now?', 'I know a good game!']));
    yield wait(2);
    chips([]);
  }

  function* main() {
    yield* welcome();
    while (true) for (const play of [followRound, appleRound, hideRound, raceRound]) {
      yield* play();
      state.rounds++; emit({ type: 'progress', rounds: state.rounds });
      yield* breather();
    }
  }

  function moveBuddies(dt) {
    for (const who of ['mia', 'leo']) {
      const b = state.buddies[who];
      let target = { x: b.tx, z: b.tz }, stop = .15;
      if (b.follow) { target = b.follow === 'player' ? state.player : state.buddies[b.follow]; stop = b.gap; }
      const dx = target.x - b.x, dz = target.z - b.z, length = Math.hypot(dx, dz);
      b.moving = !b.hidden && length > stop && b.speed > 0;
      if (!b.moving) continue;
      const stride = Math.min(length - stop + .01, b.speed * dt);
      b.x += dx / length * stride; b.z += dz / length * stride; b.heading = Math.atan2(dx, dz);
    }
  }

  const script = main();
  let current = null;
  function advance(value) { const next = script.next(value); current = next.done ? null : next.value; }

  return {
    state,
    start() { if (!current) advance(); },
    /** snapshot: { player: {x, z}, busy: someone is talking and the next line should wait } */
    tick(dt, snapshot = {}) {
      if (!current || !(dt > 0)) return;
      dt = Math.min(dt, .25);
      state.time += dt;
      if (snapshot.player) state.player = clampToIsland(snapshot.player, 0);
      state.busy = !!snapshot.busy;
      moveBuddies(dt);
      if (state.open && (state.open.left -= dt) <= 0) state.open = null;
      // Scripted reactions are for the demo; a live companion answers the player's voice on its own.
      if (!replies) { state.foreign = false; state.reply = null; }
      else if (state.foreign && trySay(banter(nearestBuddy(), "Huh? I don't get it. Can you say it in English?"))) state.foreign = false;
      else if (state.reply && trySay(banter(nearestBuddy(), state.reply))) state.reply = null;
      for (let guard = 0; guard < 12 && current; guard++) {
        const command = current;
        if (command.do === 'say') {
          if (!command.started) { if (!trySay(command)) return; command.started = true; return; }
          if (state.open) return;
          advance();
        } else if (command.do === 'wait') {
          if ((command.left -= dt) > 0) return;
          advance();
        } else {
          const result = command.update(dt);
          if (result === undefined) return;
          advance(result);
        }
        dt = 0;
      }
    },
    /** The page calls this when a companion has finished saying the current line. */
    lineDone(who) { if (state.open && (!who || state.open.who === who)) state.open = null; },
    /** Player speech (a transcript) or a tapped phrase. Returns whether usable English was heard. */
    heard(text) {
      const words = normalizeSpeech(text);
      if (!words || isPinyin(words)) { if (isForeignSpeech(text)) { state.foreign = true; emit({ type: 'foreign' }); } return false; }
      state.heard.push({ words, at: state.time, used: false });
      if (state.heard.length > 40) state.heard.shift();
      state.spoken++;
      emit({ type: 'heard', text: words });
      setStage(2);
      const reply = REPLIES.find(([phrases]) => phrases.some(phrase => mentions(words, phrase)));
      if (reply) state.reply = reply[1];
      return true;
    },
  };
}
