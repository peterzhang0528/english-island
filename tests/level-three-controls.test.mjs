import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionFixture, loadControls, target, THREE } from './helpers/level-three.mjs';

test('quest objects can be collected in either order before the birdhouse unlocks', async () => {
  const { api, state, pineCones, fallenLogs, table, calls } = actionFixture();
  assert.equal(api.targetFor()?.userData.kind, 'cone');
  await api.act(fallenLogs[0]);
  assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', 'collectLog']]);
  state.logs = 2; state.cones = 0; calls.length = 0;
  await api.act(pineCones[0]);
  assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', 'collectCone']]);
  state.cones = 2; state.logs = 2; calls.length = 0;
  await api.act(table);
  assert.equal(calls.some(call => call[0] === 'action' && call[1] === 'buildBirdhouse'), false);
  state.cones = 3; calls.length = 0;
  await api.act(table);
  assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', 'buildBirdhouse']]);
});

test('watching animals is available before the birdhouse, but inviting a bird is not', async () => {
  const { api, state, sheep, bird, calls } = actionFixture();
  await api.act(sheep);
  assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', 'watchAnimal']]);
  calls.length = 0; state.watched = true;
  await api.act(bird);
  assert.equal(calls.some(call => call[0] === 'action'), false);
  state.house = true; calls.length = 0;
  await api.act(bird);
  assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', 'inviteBird']]);
});

test('out-of-range quest taps ask the player to walk closer and do not finish the quest', async () => {
  const { api, state, control, pineCones, calls } = actionFixture();
  control.range = false;
  await api.act(pineCones[0]);
  assert.equal(state.cones, 0);
  assert.equal(pineCones[0].userData.collected, false);
  assert.equal(calls.some(call => call[0] === 'action'), false);
  assert.deepEqual(calls.filter(call => call[0] === 'say'), [['say', 'Come closer, then tap it.']]);
  assert.ok(calls.some(call => call[0] === 'target' && call[1] === 'cone'));
});

for (const guard of ['paused', 'busy', 'summary', 'help']) {
  test(`${guard} blocks both island control entry points`, async () => {
    const { api, state, sandbox, calls, pineCones } = actionFixture();
    state.busy = guard === 'busy';
    sandbox.paused = guard === 'paused';
    sandbox.ui.summary.hidden = guard !== 'summary';
    sandbox.helpDialog.open = guard === 'help';
    await api.act(pineCones[0]);
    api.taskAction();
    assert.deepEqual(calls, []);
  });
}

test('the island title starts only through its task action and a finished island ignores further tasks', async () => {
  const { api, state, sandbox, calls, pineCones } = actionFixture();
  state.step = 0;
  await api.act(pineCones[0]);
  assert.deepEqual(calls, []);
  api.taskAction();
  assert.deepEqual(calls, ['start']);
  state.step = 6;
  calls.length = 0;
  api.taskAction();
  assert.equal(api.targetFor(), undefined);
  assert.deepEqual(calls, []);
});

test('exploring a flower teaches vocabulary without progressing a quest', async () => {
  const { api, state, calls } = actionFixture();
  await api.act(target('flower', 'FLOWER'));
  assert.equal(state.cones, 0);
  assert.equal(state.logs, 0);
  assert.equal(state.house, false);
  assert.equal(state.busy, false);
  assert.deepEqual(calls, [['learn', 'FLOWER'], ['speak', 'flower']]);
});

test('repeated collection and a finished birdhouse stay inert', async () => {
  const { api, state, pineCones, table, calls } = actionFixture();
  pineCones[0].userData.collected = true;
  await api.act(pineCones[0]);
  state.house = true;
  await api.act(table);
  assert.deepEqual(calls, []);
});

test('rapid island input cannot start two operations', async () => {
  const { api, state, pineCones, calls, control } = actionFixture();
  let release;
  control.actionWait = new Promise(resolve => { release = resolve; });
  const first = api.act(pineCones[0]);
  assert.equal(state.busy, true);
  api.taskAction();
  await api.act(pineCones[1]);
  assert.equal(calls.filter(call => call[0] === 'action').length, 1);
  release();
  await first;
});

test('a failed collection restores the cone and controls', async () => {
  const { api, state, sandbox, pineCones, calls, errors } = actionFixture();
  sandbox.collectCone = async () => { throw new Error('controlled presentation failure'); };
  await api.act(pineCones[0]);
  assert.equal(state.busy, false);
  assert.equal(errors.length, 1);
  assert.ok(calls.some(call => call[0] === 'target' && call[1] === 'cone'));
});

test('island help, visibility and external pauses cannot resume each other', () => {
  const { api, sandbox, pauseCalls } = actionFixture();
  api.pauseGame(true, 'help');
  assert.equal(sandbox.down, null);
  assert.equal(sandbox.sfx.paused, true);
  api.pauseGame(true, 'external');
  api.pauseGame(false, 'help');
  assert.equal(sandbox.paused, true);
  api.pauseGame(true, 'visibility');
  api.pauseGame(false, 'external');
  assert.equal(sandbox.paused, true);
  api.pauseGame(false, 'visibility');
  assert.equal(sandbox.paused, false);
  assert.equal(sandbox.sfx.paused, false);
  assert.deepEqual(pauseCalls, [true, false]);
});

test('quest handlers enforce material prerequisites and remain idempotent', async () => {
  const state = { cones: 0, logs: 0, house: true, invited: true, watched: true };
  const api = loadControls({ state, say: async () => {}, reveal: async () => {}, tween: async () => {}, afterQuest() {} }, ['collectCone', 'collectLog', 'buildBirdhouse', 'inviteBird']);
  const cone = target('cone'); cone.userData.collected = true;
  await api.collectCone(cone);
  const log = target('wood'); log.userData.collected = true;
  await api.collectLog(log);
  await api.buildBirdhouse();
  await api.inviteBird();
  assert.equal(state.house, true);
  assert.equal(state.invited, true);

  const locked = { cones: 1, logs: 0, house: false, invited: false };
  const building = loadControls({
    state: locked,
    canBuild() { return false; },
    say: async () => { locked.said = true; },
  }, ['buildBirdhouse']);
  await building.buildBirdhouse();
  assert.equal(locked.house, false);
  assert.equal(locked.said, true);
});

test('completing materials, the birdhouse, watching and inviting finishes the island', async () => {
  const state = { step: 1, busy: true, cones: 2, logs: 1, house: false, watched: false, invited: false, hinted: {}, words: [], elapsed: 0 };
  const pine = target('cone'); const log = target('wood');
  const table = target('table'); const birdhouse = target('birdhouse'); birdhouse.visible = false; birdhouse.scale.set(1, 1, 1);
  const sheep = target('sheep'); const bird = target('bird');
  bird.position.set(2, 2.7, -6); bird.userData.wings = [new THREE.Group(), new THREE.Group()];
  birdhouse.position.set(0.35, 1.55, -1.35);
  const learned = [], reveals = [], said = [];
  let summaries = 0;
  const api = loadControls({
    THREE, state, table, birdhouse, bird,
    sfx: { pop() {}, tok() {}, ding() {}, levelup() {} },
    tween: async (_duration, update) => { if (update) for (const fraction of [0, 0.5, 1]) update(fraction, fraction); },
    say: async (en) => { said.push(en); },
    wait: async () => {},
    burst() {},
    learn(word) { learned.push(word); },
    reveal: async word => { reveals.push(word); },
    objectPosition(object) { return object.position.clone(); },
    canBuild() { return state.cones >= 3 && state.logs >= 2 && !state.house; },
    canInvite() { return state.house && !state.invited; },
    afterQuest() {
      if (state.cones >= 3 && state.logs >= 2 && state.house && state.watched && state.invited && state.step !== 6) {
        state.step = 6;
        summaries++;
      }
    },
  }, ['collectCone', 'collectLog', 'buildBirdhouse', 'watchAnimal', 'inviteBird']);

  state.busy = true; await api.collectCone(pine);
  assert.equal(state.cones, 3); assert.equal(pine.visible, false);
  state.busy = true; await api.collectLog(log);
  assert.equal(state.logs, 2); assert.equal(log.visible, false);
  state.busy = true; await api.buildBirdhouse();
  assert.equal(state.house, true); assert.equal(birdhouse.visible, true);
  state.busy = true; await api.watchAnimal(sheep);
  assert.equal(state.watched, true);
  state.busy = true; await api.inviteBird();
  assert.equal(state.invited, true);
  assert.equal(state.step, 6);
  assert.equal(summaries, 1);
  assert.ok(reveals.includes('PINE CONE'));
  assert.ok(reveals.includes('LOG'));
  assert.ok(reveals.includes('BIRDHOUSE'));
  assert.ok(said.includes('A pine cone!') || reveals.includes('PINE CONE'));
});

test('the friend hint hook points at the next unfinished quest', () => {
  const { api, state } = actionFixture();
  assert.equal(api.nextHintId(), 'cones');
  state.cones = 3;
  assert.equal(api.nextHintId(), 'logs');
  state.logs = 2;
  assert.equal(api.nextHintId(), 'house');
  state.house = true;
  assert.equal(api.nextHintId(), 'watch');
  state.watched = true;
  assert.equal(api.nextHintId(), 'invite');
  state.invited = true;
  assert.equal(api.nextHintId(), null);
});
