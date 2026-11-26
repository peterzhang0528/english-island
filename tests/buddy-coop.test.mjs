import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdventure, PROFILES, validProfile, PLACES, findPath, land } from '../public/game/js/buddy-coop-rules.js';

function fixture(profile = PROFILES[0], today = '2026-11-26') {
  const messages = [];
  const game = createAdventure({ profile, today, emit: message => messages.push(message) });
  const advance = (seconds = 8) => { for (let i = 0; i < seconds * 20; i++) game.tick(.05); };
  const walk = place => { assert.ok(game.walkTo(place)); advance(); };
  return { game, state: game.state, messages, advance, walk };
}

test('cooperation changes the world only after player actions and teammate arrival', () => {
  const { game, state, advance, walk, messages } = fixture();
  game.start();
  assert.match(messages[0].text, /Alex.*paper bridge/);
  game.send('Buddy, build the bridge');
  assert.equal(state.building, false, 'cannot build without wood');
  game.interact(); assert.equal(state.wood, false, 'cannot collect from far away');
  assert.equal(game.walkTo(PLACES.beacon), false, 'water blocks the far island');
  walk(PLACES.timber); game.interact(); game.interact();
  assert.equal(state.wood, true);
  game.send('Can you fix the bridge, Buddy?');
  assert.equal(state.built, false, 'a request is not instant completion');
  assert.equal(state.building, true);
  advance(); assert.equal(state.built, true);
  walk(PLACES.beacon); game.interact();
  assert.equal(state.lit, false, 'player needs teammate power');
  game.send('Nova, hold the switch, please.');
  assert.equal(state.holding, false, 'Nova must arrive at the switch');
  advance(); assert.equal(state.holding, true);
  game.interact(); assert.equal(state.lit, true);
  game.interact(); assert.equal(state.complete, false, 'lantern is not the picnic');
  walk(PLACES.picnic); game.interact(); game.interact();
  assert.equal(state.complete, true);
  assert.equal(messages.filter(m => /Same team, new adventure/.test(m.text)).length, 1);
});

test('pause freezes movement, building, companion actions, and chat', () => {
  const { game, state, advance, walk, messages } = fixture();
  game.start(); walk(PLACES.timber); game.interact(); game.send('build the bridge');
  state.paused = true;
  const before = JSON.stringify(state), count = messages.length;
  advance(); game.send('hi'); game.interact(); game.walkTo(PLACES.bridge);
  assert.equal(JSON.stringify(state), before); assert.equal(messages.length, count);
  state.paused = false; advance(); assert.equal(state.built, true);
});

test('only exact, unexpired synthetic fixtures produce a classroom memory', () => {
  for (const profile of PROFILES) {
    assert.ok(validProfile(profile, '2026-12-03'));
    const { game, messages } = fixture(profile); game.start(); game.send('remember our class?');
    assert.ok(messages.some(m => m.text.includes(profile.displayName) && m.text.includes(profile.classCue.activity)));
  }
  for (const profile of [{ ...PROFILES[0], displayName: 'Untrusted name' }, { ...PROFILES[0], synthetic: false }, null, {}, 'bad']) {
    assert.equal(validProfile(profile, '2026-11-26'), null);
  }
  const { game, state, messages } = fixture(PROFILES[0], '2026-12-04');
  game.start(); game.send('remember our class');
  assert.equal(state.name, 'Explorer'); assert.equal(state.memory, null);
  assert.ok(messages.every(m => !m.text.includes('paper bridge')));
});

test('map paths never walk on water or bypass a broken bridge', () => {
  assert.deepEqual(findPath({ c: 3, r: 7 }, PLACES.beacon, false), []);
  const path = findPath({ c: 3, r: 7 }, PLACES.beacon, true);
  assert.ok(path.length > 0);
  for (const tile of path) assert.ok(land(tile.c, tile.r, true));
  assert.deepEqual(findPath({ c: 3, r: 7 }, { c: -100, r: -100 }, true), []);
});

test('unrecognized chat is honest, not silently treated as success', () => {
  const { game, state, messages } = fixture(); game.start();
  game.send('Tell me an entirely new story about the moon.');
  assert.match(messages.at(-1).text, /scripted demo teammate/);
  assert.equal(state.built, false); assert.equal(state.lit, false);
});

test('recalling a paper bridge after collecting planks does not order construction', () => {
  const { game, state, messages, walk } = fixture(); game.start();
  walk(PLACES.timber); game.interact();
  game.send('Remember the paper bridge we made in class?');
  assert.equal(state.building, false);
  assert.match(messages.at(-1).text, /pretend class.*paper bridge/);
});
