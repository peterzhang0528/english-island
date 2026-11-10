import assert from 'node:assert/strict';
import vm from 'node:vm';
import { test } from 'node:test';
import { parseGameScript } from './helpers/source.mjs';

const script = parseGameScript('js/world.js');
function listener(prefix) {
  const node = script.ast.statements.find(statement => statement.getText(script.ast).startsWith(prefix));
  assert.ok(node, `Production listener was not found: ${prefix}`);
  return node.getText(script.ast);
}

// Run the real bridge, pause transition, help-close listener and status update.
// Only browser events, the clock and audio output are substituted; no renderer is created.
function fixture() {
  let now = 1000;
  const events = {}, helpEvents = {}, audio = [], statuses = [];
  const parent = { postMessage(data, origin) { statuses.push({ data, origin }); } };
  const taskButton = { hidden: false, disabled: false };
  const label = { textContent: '' };
  const helpDialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; helpEvents.close(); },
    addEventListener(name, callback) { helpEvents[name] = callback; },
  };
  const sandbox = {
    paused: false, pausedAt: 0, lastStatus: '', lootOn: false,
    performance: { now: () => now },
    tweens: [{ t0: 100 }, { t0: 250 }],
    state: { step: 1, busy: false, words: [], hits: 1, stones: 0, chops: 0, lastAct: 0 },
    sfx: { muted: false, paused: false },
    voice: { setPaused(value) { audio.push(value); } },
    window: { addEventListener(name, callback) { events[name] = callback; } },
    location: { origin: 'https://island.invalid' }, parent,
    helpDialog, taskButton, ui: { summary: { hidden: true } },
    $(selector) { assert.equal(selector, '#action-label'); return label; },
  };
  const declarations = ['pauseReasons', 'pauseGame', 'showHelp', 'taskLabels', 'updateStatus'].map(name => script.declaration(name));
  vm.runInContext([
    ...declarations,
    listener('helpDialog.addEventListener("close"'),
    listener('window.addEventListener("message"'),
  ].join('\n'), vm.createContext(sandbox));
  const send = (command, overrides = {}) => events.message({
    origin: sandbox.location.origin, source: parent,
    data: { type: 'island-command', command }, ...overrides,
  });
  return { sandbox, send, audio, statuses, taskButton, helpDialog, time(value) { now = value; } };
}

test('the first-level bridge accepts pause/resume only from the same-origin parent', () => {
  const f = fixture();
  const invalid = [
    { origin: 'https://other.invalid' },
    { source: {} },
    { data: { type: 'another-message', command: 'pause' } },
  ];
  for (const event of invalid) f.send('pause', event);
  assert.equal(f.sandbox.paused, false);
  assert.deepEqual(f.audio, []);
  f.send('pause');
  for (const event of invalid) f.send('resume', event);
  assert.equal(f.sandbox.paused, true);
  assert.deepEqual(f.audio, [true]);
  f.send('resume');
  assert.equal(f.sandbox.paused, false);
  assert.deepEqual(f.audio, [true, false]);
});

test('repeated external commands compensate tween time only once and update action/status controls', () => {
  const f = fixture();
  f.send('pause');
  assert.equal(f.taskButton.disabled, true);
  assert.equal(f.sandbox.sfx.paused, true);
  assert.equal(f.statuses.at(-1).data.paused, true);
  f.time(1300);
  f.send('pause');
  assert.equal(f.sandbox.pausedAt, 1000, 'A repeated pause must preserve the start of the pause');
  f.time(2000);
  f.send('resume');
  assert.deepEqual(f.sandbox.tweens.map(tween => tween.t0), [1100, 1250]);
  assert.equal(f.sandbox.state.lastAct, 2000);
  assert.equal(f.taskButton.disabled, false);
  assert.equal(f.sandbox.sfx.paused, false);
  assert.equal(f.statuses.at(-1).data.paused, false);
  assert.equal(f.statuses.at(-1).origin, 'https://island.invalid');
  f.time(3000);
  f.send('resume');
  assert.deepEqual(f.sandbox.tweens.map(tween => tween.t0), [1100, 1250]);
  assert.equal(f.sandbox.state.lastAct, 2000);
  assert.deepEqual(f.audio, [true, false]);
  assert.equal(f.statuses.length, 2);
});

for (const firstClosed of ['help', 'external']) {
  test(`closing ${firstClosed} cannot resume the other first-level pause reason`, () => {
    const f = fixture();
    f.send('help');
    assert.equal(f.helpDialog.open, true);
    f.time(1100);
    f.send('pause');
    f.time(1200);
    f.send(firstClosed === 'help' ? 'help' : 'resume');
    assert.equal(f.sandbox.paused, true);
    assert.equal(f.taskButton.disabled, true);
    assert.equal(f.helpDialog.open, firstClosed === 'external');
    assert.deepEqual(f.audio, [true]);
    assert.deepEqual(f.sandbox.tweens.map(tween => tween.t0), [100, 250]);
    f.time(1400);
    f.send(firstClosed === 'help' ? 'resume' : 'help');
    assert.equal(f.sandbox.paused, false);
    assert.equal(f.helpDialog.open, false);
    assert.deepEqual(f.sandbox.tweens.map(tween => tween.t0), [500, 650]);
    assert.deepEqual(f.audio, [true, false]);
  });
}

test('resuming a busy first-level task keeps its action button disabled', () => {
  const f = fixture();
  f.sandbox.state.busy = true;
  f.send('pause');
  f.send('resume');
  assert.equal(f.sandbox.paused, false);
  assert.equal(f.taskButton.disabled, true);
  assert.equal(f.statuses.at(-1).data.busy, true);
});
