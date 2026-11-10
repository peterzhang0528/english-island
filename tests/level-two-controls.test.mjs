import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionFixture, loadControls, target, THREE } from './helpers/level-two.mjs';

test('task targets map correctly and skip harvested wheat', () => {
  const { api, state, sandbox } = actionFixture();
  for (const [step, key] of [[1, 'chicken'], [2, 'cow'], [4, 'table'], [5, 'zombie']]) {
    state.step = step;
    assert.equal(api.targetFor(), sandbox[key]);
  }
  state.step = 3;
  assert.equal(api.targetFor(), sandbox.wheat[0]);
  sandbox.wheat[0].userData.harvested = true;
  assert.equal(api.targetFor(), sandbox.wheat[1]);
  sandbox.wheat.forEach(bundle => { bundle.userData.harvested = true; });
  assert.equal(api.targetFor(), undefined);
});

for (const guard of ['paused', 'busy', 'title', 'summary', 'help']) {
  test(`${guard} blocks object actions`, async () => {
    const { api, state, sandbox, calls } = actionFixture();
    state.step = guard === 'title' ? 0 : 1;
    state.busy = guard === 'busy';
    sandbox.paused = guard === 'paused';
    sandbox.ui.summary.hidden = guard !== 'summary';
    sandbox.helpDialog.open = guard === 'help';
    await api.act(sandbox.chicken);
    assert.deepEqual(calls, []);
  });
}

test('an unrelated object can teach vocabulary without collecting an ingredient', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  await api.act(sandbox.table);
  assert.equal(state.step, 1);
  assert.equal(state.busy, false);
  assert.ok(calls.some(call => call[0] === 'learn' && call[1] === 'TABLE'));
  assert.ok(!calls.some(call => call[0] === 'action'));
});

test('each required object routes to its gameplay action', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  const expected = [[1, 'chicken', 'getEgg'], [2, 'cow', 'getMilk'], [3, 'wheat', 'harvest'], [4, 'table', 'makeCake'], [5, 'zombie', 'feedFriend']];
  for (const [step, key, handler] of expected) {
    state.step = step;
    calls.length = 0;
    const object = key === 'wheat' ? sandbox.wheat[0] : sandbox[key];
    await api.act(object);
    const actions = calls.filter(call => call[0] === 'action');
    assert.equal(actions.length, 1);
    assert.equal(actions[0][1], handler);
    if (key === 'wheat') assert.equal(actions[0][2], object);
  }
});

test('harvested bundles reject further actions', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  state.step = 3;
  sandbox.wheat[0].userData.harvested = true;
  await api.act(sandbox.wheat[0]);
  assert.deepEqual(calls, []);
});

test('rapid repeated input cannot start two ingredient actions', async () => {
  const { api, state, sandbox, calls, control } = actionFixture();
  let release;
  control.actionWait = new Promise(resolve => { release = resolve; });
  const first = api.act(sandbox.chicken);
  assert.equal(state.busy, true);
  await api.act(sandbox.chicken);
  assert.equal(calls.filter(call => call[0] === 'action').length, 1);
  release();
  await first;
});

test('a failed action restores controls and its target', async () => {
  const { api, state, sandbox, calls, errors } = actionFixture();
  sandbox.getEgg = async () => { throw new Error('controlled presentation failure'); };
  await api.act(sandbox.chicken);
  assert.equal(state.busy, false);
  assert.equal(errors.length, 1);
  assert.ok(calls.some(call => call[0] === 'target' && call[1] === 'chicken'));
});

test('the task button starts the introduction and is inert after completion', () => {
  const { api, state, calls } = actionFixture();
  state.step = 0;
  api.taskAction();
  assert.ok(calls.includes('start'));
  state.step = 6;
  calls.length = 0;
  api.taskAction();
  assert.deepEqual(calls, []);
});

test('help, external and visibility pauses cannot resume each other', () => {
  const { api, sandbox, pauseCalls } = actionFixture();
  api.pauseGame(true, 'help');
  assert.equal(sandbox.paused, true);
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

test('harvesting collects each bundle once and enters crafting after exactly three', async () => {
  const state = { step: 3, wheat: 0, busy: false }, learned = [], entered = [];
  const bundles = [0, 1, 2].map(() => {
    const group = target('wheat');
    group.userData.stalks = new THREE.Group();
    group.add(group.userData.stalks);
    return group;
  });
  const api = loadControls({
    THREE, state, M: { straw: new THREE.MeshLambertMaterial() }, sfx: { crack() {} },
    setTarget() {}, burst() {}, tween: async (_duration, update) => update(1, 1),
    learn: word => learned.push(word), updateRecipe() {}, say: async () => {},
    wait: async () => {}, goShot: async () => {}, updateStatus() {},
    enter: step => { state.step = step; state.busy = false; entered.push(step); },
    targetFor: () => bundles.find(group => !group.userData.harvested),
  }, ['harvest']);
  for (let index = 0; index < bundles.length; index++) {
    state.busy = true;
    await api.harvest(bundles[index]);
    assert.equal(state.wheat, index + 1);
    assert.equal(bundles[index].userData.stalks.visible, false);
    await api.harvest(bundles[index]);
    assert.equal(state.wheat, index + 1);
  }
  for (const bundle of bundles) await api.harvest(bundle);
  assert.equal(state.wheat, 3);
  assert.equal(state.step, 4);
  assert.deepEqual(entered, [4]);
  assert.equal(learned.length, 3);
});
