import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionFixture, loadControls, target, THREE } from './helpers/level-three.mjs';

const stages = [
  [1, 'soilBed', 'prepareSoil', 'prepared'],
  [2, 'seedPacket', 'plantSeeds', 'planted'],
  [3, 'wateringCan', 'waterPlants', 'watered'],
  [4, 'sunCrank', 'growFlowers', 'grown'],
  [5, 'bee', 'welcomeBee', 'shared'],
];

test('garden task button and object clicks share the required target for every stage', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  for (const [step, key, handler] of stages) {
    state.step = step;
    assert.equal(api.targetFor(), sandbox[key]);
    calls.length = 0;
    api.taskAction();
    await Promise.resolve();
    assert.deepEqual(calls.filter(call => call[0] === 'action'), [['action', handler]]);
  }
});

for (const guard of ['paused', 'busy', 'summary', 'help']) {
  test(`${guard} blocks both garden control entry points`, async () => {
    const { api, state, sandbox, calls } = actionFixture();
    state.busy = guard === 'busy';
    sandbox.paused = guard === 'paused';
    sandbox.ui.summary.hidden = guard !== 'summary';
    sandbox.helpDialog.open = guard === 'help';
    await api.act(sandbox.soilBed);
    api.taskAction();
    assert.deepEqual(calls, []);
  });
}

test('the garden title starts only through its task action and completed tasks are inert', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  state.step = 0;
  await api.act(sandbox.soilBed);
  assert.deepEqual(calls, []);
  api.taskAction();
  assert.deepEqual(calls, ['start']);
  state.step = 6;
  calls.length = 0;
  api.taskAction();
  assert.equal(api.targetFor(), undefined);
  assert.deepEqual(calls, []);
});

test('exploring a flower teaches vocabulary without progressing the garden task', async () => {
  const { api, state, calls } = actionFixture();
  await api.act(target('flower'));
  assert.equal(state.step, 1);
  assert.equal(state.busy, false);
  assert.equal(state.prepared, false);
  assert.deepEqual(calls, [['learn', 'FLOWER'], ['speak', 'flower']]);
});

test('each completed garden operation rejects repeated input', async () => {
  const { api, state, sandbox, calls } = actionFixture();
  for (const [step, key, , flag] of stages) {
    state.step = step;
    state[flag] = true;
    await api.act(sandbox[key]);
    api.taskAction();
  }
  assert.deepEqual(calls, []);
});

test('rapid garden input cannot start two operations', async () => {
  const { api, state, sandbox, calls, control } = actionFixture();
  let release;
  control.actionWait = new Promise(resolve => { release = resolve; });
  const first = api.act(sandbox.soilBed);
  assert.equal(state.busy, true);
  api.taskAction();
  await api.act(sandbox.soilBed);
  assert.equal(calls.filter(call => call[0] === 'action').length, 1);
  release();
  await first;
});

test('a failed garden operation restores its target and controls', async () => {
  const { api, state, sandbox, calls, errors } = actionFixture();
  sandbox.prepareSoil = async () => { throw new Error('controlled presentation failure'); };
  await api.act(sandbox.soilBed);
  assert.equal(state.busy, false);
  assert.equal(errors.length, 1);
  assert.ok(calls.some(call => call[0] === 'target' && call[1] === 'soil'));
});

test('garden help, visibility and external pauses cannot resume each other', () => {
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

test('garden operation handlers enforce prerequisites and remain idempotent', async () => {
  for (let index = 0; index < stages.length; index++) {
    const [, , handler, flag] = stages[index];
    const state = { [flag]: true };
    // With no presentation services supplied, either guard must return before effects.
    const api = loadControls({ state }, [handler]);
    await api[handler]();
    if (index > 0) {
      state[flag] = false;
      state[stages[index - 1][3]] = false;
      await api[handler]();
      assert.equal(state[flag], false);
    }
  }
});

test('one operation per garden stage completes the whole bed and restores reusable objects', async () => {
  const state = { step: 1, busy: true }, entries = [], reveals = [], learned = [];
  const world = new THREE.Group(), soilBed = target('soil'), shovel = target('soil');
  const seedPacket = target('seed'), wateringCan = target('water'), bee = target('bee');
  const bedCenters = [-1.35, 0, 1.35].map(x => new THREE.Vector3(x, 1.18, -7.2));
  const plantedSeeds = bedCenters.map(() => new THREE.Group());
  const sprouts = bedCenters.map(() => new THREE.Group());
  const flowers = bedCenters.map(() => {
    const flower = target('flower');
    flower.userData.head = new THREE.Group();
    flower.add(flower.userData.head);
    return flower;
  });
  const ridges = new THREE.Group();
  for (let index = 0; index < 3; index++) ridges.add(new THREE.Mesh());
  shovel.position.set(-2.7, 0.73, -5.7);
  seedPacket.position.set(-4.35, 2.02, -4.5);
  wateringCan.position.set(3.9, 1.39, -4.5);
  const homes = [shovel, seedPacket, wateringCan].map(object => object.position.clone());
  const M = { soil: {}, seed: {}, wet: {}, coral: {}, gold: {}, violet: {} };
  let summaries = 0;
  const api = loadControls({
    THREE, state, world, M, soilBed, shovel, seedPacket, wateringCan, bee, bedCenters,
    ridges, plantedSeeds, sprouts, flowers, beeHome: new THREE.Vector3(2.2, 2.65, -6.1),
    crankWheel: new THREE.Group(), shade: new THREE.Group(), sunlight: { intensity: 2.1 },
    friend: new THREE.Group(), arms: [new THREE.Group(), new THREE.Group()],
    stage: { dataset: {} }, ui: { journal: { hidden: false } },
    sfx: { tok() {}, pop() {}, creak() {}, levelup() {} },
    box(parent, _material, x, y, z) { const object = new THREE.Group(); object.position.set(x, y, z); parent.add(object); return object; },
    // Drive animation boundaries using real Three transforms, without WebGL or a fake DOM.
    tween: async (_duration, update) => { for (const fraction of [0, 0.5, 1]) update(fraction, fraction); },
    say: async () => {}, wait: async () => {}, goShot: async () => {},
    burst() {}, makeDrops() {}, setTarget() {}, updateJournal() {}, updateStatus() {},
    learn(word) { learned.push(word); }, reveal: async word => { reveals.push(word); },
    enter(step) { state.step = step; state.busy = false; entries.push(step); },
    showSummary() { summaries++; },
  }, stages.map(stage => stage[2]));

  for (const [step, , handler, flag] of stages) {
    assert.equal(state.step, step);
    state.busy = true;
    await api[handler]();
    assert.equal(state[flag], true);
    assert.equal(state.step, step + 1);
    assert.equal(state.busy, false);
  }
  assert.deepEqual(entries, [2, 3, 4, 5]);
  assert.deepEqual(reveals, ['DIG', 'PLANT', 'WATER', 'FLOWER']);
  assert.ok(learned.includes('GROW'));
  assert.ok(learned.includes('BEE'));
  assert.equal(world.children.length, 0, 'Temporary falling seeds are removed');
  assert.ok(ridges.children.every(ridge => ridge.material === M.wet));
  assert.ok(plantedSeeds.every(seed => !seed.visible));
  assert.ok(sprouts.every(sprout => !sprout.visible));
  assert.ok(flowers.every(flower => flower.visible && flower.scale.y === 1 && flower.userData.head.scale.y === 1));
  for (const [index, object] of [shovel, seedPacket, wateringCan].entries()) assert.ok(object.position.distanceTo(homes[index]) < 1e-10);
  assert.equal(bee.visible, true);
  assert.equal(summaries, 1);
});
