import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGameFile } from './helpers/source.mjs';
import { BUDDY_IDS } from '../public/game/js/buddies-contract.js';
import { ISLAND_RADIUS, PLACES, PLACE_IDS, SPAWN } from '../public/game/js/buddies-map.js';
import { OBSTACLES, createBuddyScene, walk } from '../public/game/js/buddies-world.js';
import { SESSION_LIMIT_SECONDS, STAGE_KEY, formatClock, readStage } from '../public/game/js/world-buddies.js';

test('the island scene has the player, both companions and every landmark', () => {
  const world = createBuddyScene();
  try {
    assert.deepEqual(Object.keys(world.actors).sort(), ['leo', 'mia', 'player']);
    for (const id of PLACE_IDS) assert.ok(world.places[id], `${id} is built`);
    assert.ok(world.tileCount > 1500, 'the island is big enough to walk around');
    const { mia, leo, player } = world.actors;
    assert.notEqual(mia.group.uuid, leo.group.uuid);
    world.update(.1, { player: { ...SPAWN.player, moving: true, heading: 0 }, mia: { x: 3, z: 4, moving: true, heading: 1 }, leo: { x: -5, z: 6, moving: false, heading: 0 } });
    assert.equal(mia.group.position.x, 3); assert.equal(mia.group.position.z, 4); assert.equal(leo.group.position.x, -5); assert.equal(player.group.position.z, SPAWN.player.z);
  } finally { world.dispose(); }
});

test('apples, hiding, the place marker and cheers can be added and removed', () => {
  const world = createBuddyScene();
  try {
    world.spawnApple('apple-0-1', 2, 3); world.spawnApple('apple-0-2', 4, 5);
    assert.equal(world.apples.size, 2);
    world.removeApple('apple-0-1'); world.removeApple('missing'); assert.deepEqual([...world.apples.keys()], ['apple-0-2']);
    world.focus('boat'); assert.equal(world.marker.visible, true); assert.equal(world.marker.position.x, PLACES.boat.x);
    world.focus(null); assert.equal(world.marker.visible, false);
    world.setHidden('leo', true); assert.ok(world.actors.leo.body.scale.y < 1, 'a hiding companion crouches behind the landmark');
    world.setHidden('leo', false); assert.equal(world.actors.leo.body.scale.y, 1);
    const canopy = world.places.tree.children[1], solid = canopy.material;
    world.fade('tree', true); assert.ok(canopy.material.transparent && canopy.material.opacity < .5, 'a tree in front of the player turns see-through');
    assert.equal(world.places.lighthouse.children[0].material.transparent, false, 'other landmarks stay solid');
    world.fade('tree', false); assert.equal(canopy.material, solid);
    world.cheer('player');
    for (let index = 0; index < 40; index++) world.update(.1, {});
  } finally { world.dispose(); }
});

test('walking stays on the island and goes around solid landmarks', () => {
  let point = { ...SPAWN.player };
  for (let index = 0; index < 400; index++) point = walk(point, 0, .3);
  assert.ok(Math.hypot(point.x, point.z) <= ISLAND_RADIUS + 1e-6);
  for (const obstacle of OBSTACLES) {
    let walker = { x: obstacle.x - obstacle.r - 3, z: obstacle.z + .1 };
    for (let index = 0; index < 80; index++) {
      walker = walk(walker, .15, 0);
      assert.ok(Math.hypot(walker.x - obstacle.x, walker.z - obstacle.z) >= obstacle.r + .5, 'the player never ends up inside a landmark');
    }
    assert.ok(walker.x > obstacle.x, 'the player slides past instead of getting stuck');
  }
  for (const id of PLACE_IDS) {
    const place = PLACES[id], solid = OBSTACLES.find(obstacle => obstacle.x === place.x && obstacle.z === place.z);
    if (solid) assert.ok(place.r > solid.r + .8, `${id} can be reached from outside its solid part`);
  }
});

test('page helpers remember the stage and cap a voice session', () => {
  const storage = value => ({ getItem: key => (key === STAGE_KEY ? value : null) });
  assert.equal(readStage(storage('2')), 2); assert.equal(readStage(storage('3')), 3);
  for (const bad of [null, '0', '4', 'abc', '1.5']) assert.equal(readStage(storage(bad)), 1);
  assert.equal(readStage({ getItem() { throw Error('blocked'); } }), 1);
  assert.equal(formatClock(0), '0:00'); assert.equal(formatClock(75.9), '1:15'); assert.equal(formatClock(-3), '0:00');
  assert.ok(SESSION_LIMIT_SECONDS >= 5 * 60 && SESSION_LIMIT_SECONDS <= 20 * 60, 'two voice sessions are billed per minute, so a play session is bounded');
});

test('the page labels the demo, keeps the key out of the browser and offers both companions', () => {
  const html = readGameFile('buddies.html'), ui = readGameFile('js/world-buddies.js'), client = readGameFile('js/buddies-live.js');
  for (const id of ['buddy-world', 'start-live', 'start-demo', 'mic-button', 'end-button', 'caption-log', 'chips', 'bubble-mia', 'bubble-leo', 'stage-pick', 'buddy-fallback']) assert.ok(html.includes(`id="${id}"`), id);
  assert.equal([...html.matchAll(/name="stage"/g)].length, 3);
  assert.match(html, /演示/); assert.match(ui, /DEMO · scripted lines, not AI/);
  for (const source of [html, ui, client]) assert.doesNotMatch(source, /sk-[A-Za-z0-9]|OPENAI_API_KEY|api\.openai\.com|Authorization/);
  assert.doesNotMatch(client, /['"]session\.start['"]/, 'the server request starts the session');
  for (const id of BUDDY_IDS) assert.ok(html.includes(`bubble-${id}`));
});
