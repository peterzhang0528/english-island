import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chapters, loadStoryControls, settleActions, storyFixture, target } from './helpers/story.mjs';

const performed = fixture => fixture.calls.filter(call => call[0] === 'perform').map(call => call[1]);

for (const guard of ['busy', 'paused', 'help', 'summary']) {
  test(`story ${guard} guard protects both object and action-button entry points`, async () => {
    const fixture = storyFixture();
    fixture.state.busy = guard === 'busy';
    fixture.sandbox.paused = guard === 'paused';
    fixture.sandbox.helpDialog.open = guard === 'help';
    fixture.sandbox.ui.summary.hidden = guard !== 'summary';
    await fixture.api.act(fixture.story.targets[0]);
    fixture.api.taskAction();
    assert.deepEqual(fixture.calls, []);
  });
}

test('story title starts through its action entry, while object clicks and uncompleted final states are inert', async () => {
  const fixture = storyFixture();
  fixture.state.step = 0;
  await fixture.api.act(fixture.story.targets[0]);
  assert.deepEqual(fixture.calls, []);
  fixture.api.taskAction();
  assert.deepEqual(fixture.calls, [['start']]);
  fixture.calls.length = 0;
  fixture.state.step = 6;
  fixture.api.taskAction();
  assert.equal(fixture.api.targetFor(), null);
  assert.deepEqual(fixture.calls, []);
});

test('closing the adventure card exposes a reopen action and preserves newly discovered words', () => {
  const fixture = storyFixture();
  const { state, sandbox, elements } = fixture;
  Object.assign(state, { step: 6, completed: true, words: ['PLANK'], sentences: [], elapsed: 60 });
  sandbox.ui.summary.hidden = false;
  sandbox.ui.say = { hidden: true };
  sandbox.ui.journal.style = {};
  sandbox.ui.pocket = { hidden: false, offsetTop: 12, offsetHeight: 24, children: [], append(chip) { this.children.push(chip); } };
  sandbox.stage.clientWidth = 368;
  sandbox.ZH = { PLANK: '木板', TREE: '树' };
  sandbox.wordChip = word => ({ word });
  sandbox.configureCollection = () => {};
  sandbox.explorePhrase = { en: 'What else can you find?', zh: '继续探索。' };
  sandbox.sfx.pop = () => {};
  sandbox.lastStatus = '';
  const chips = { children: [], replaceChildren(...items) { this.children = items; } };
  elements.set('#sum-words', chips);
  elements.set('#sum-next', { focus() {} });
  const api = loadStoryControls(sandbox, ['taskAction', 'closeSummary', 'showSummary', 'learn', 'updateStatus']);

  api.closeSummary();
  assert.equal(sandbox.ui.summary.hidden, true);
  assert.equal(elements.get('#task-action').hidden, false);
  assert.equal(elements.get('#action-label').textContent, '查看冒险卡');
  assert.equal(api.learn('TREE'), true);
  api.taskAction();
  assert.equal(sandbox.ui.summary.hidden, false);
  assert.equal(elements.get('#task-action').hidden, true);
  assert.deepEqual(state.words, ['PLANK', 'TREE']);
  assert.deepEqual(chips.children.map(chip => chip.word), ['PLANK', 'TREE']);
  assert.match(elements.get('#sum-stats').innerHTML, /<b>2<\/b> 个英语词/);
  assert.deepEqual(performed(fixture), [], 'Reopening a card must not replay a task');
});

for (const guard of ['paused', 'busy', 'help', 'summary']) {
  test(`${guard} prevents the completed story from reopening its card`, () => {
    const fixture = storyFixture();
    fixture.state.step = 6;
    fixture.state.completed = true;
    fixture.state.busy = guard === 'busy';
    fixture.sandbox.paused = guard === 'paused';
    fixture.sandbox.helpDialog.open = guard === 'help';
    fixture.sandbox.ui.summary.hidden = guard !== 'summary';
    fixture.api.taskAction();
    assert.equal(fixture.control.summaries, 0);
    assert.deepEqual(fixture.calls, []);
  });
}

test('production story opening resists reentry and hands off to the first task', async () => {
  const fixture = storyFixture(chapters[0], { realStart: true });
  fixture.state.step = 0;
  const opening = fixture.api.start();
  assert.equal(fixture.state.busy, true);
  await fixture.api.start();
  await opening;
  assert.equal(fixture.state.step, 1);
  assert.equal(fixture.state.busy, false);
  assert.equal(fixture.state.started, 42);
  assert.equal(fixture.calls.filter(call => call[0] === 'say' && call[1] === chapters[0].opening.en).length, 1);
  assert.equal(fixture.sandbox.ui.journal.hidden, false);
  assert.deepEqual(fixture.state.completedStages, [false, false, false, false, false]);
});

test('a visible future target can teach its word but cannot skip a story task', async () => {
  const fixture = storyFixture();
  await fixture.api.act(fixture.story.targets[3]);
  assert.deepEqual(performed(fixture), []);
  assert.equal(fixture.state.step, 1);
  assert.equal(fixture.state.busy, false);
  assert.deepEqual(fixture.state.words, [chapters[0].stages[3].word]);
});

test('hidden, hidden-ancestor, detached and null targets cannot act or teach words', async () => {
  const fixture = storyFixture();
  fixture.story.targets[0].visible = false;
  await fixture.api.act(fixture.story.targets[0]);
  fixture.api.taskAction();
  fixture.story.targets[0].visible = true;
  fixture.story.root.visible = false;
  await fixture.api.act(fixture.story.targets[0]);
  fixture.story.root.visible = true;
  await fixture.api.act(target(0, chapters[0].stages[0].word));
  await fixture.api.act(null);
  assert.deepEqual(fixture.calls, []);
});

test('story tasks require all prerequisites and reject already completed actions', async () => {
  const fixture = storyFixture();
  fixture.state.step = 3;
  fixture.state.completedStages[0] = true;
  await fixture.api.act(fixture.story.targets[2]);
  fixture.api.taskAction();
  fixture.state.completedStages[1] = true;
  fixture.state.completedStages[2] = true;
  await fixture.api.act(fixture.story.targets[2]);
  fixture.api.taskAction();
  assert.deepEqual(fixture.calls, []);
});

test('rapid story clicks start exactly one operation before its async boundary resolves', async () => {
  const fixture = storyFixture();
  let release;
  fixture.control.actionWait = new Promise(resolve => { release = resolve; });
  const first = fixture.api.act(fixture.story.targets[0]);
  assert.equal(fixture.state.busy, true);
  fixture.api.taskAction();
  await fixture.api.act(fixture.story.targets[0]);
  assert.deepEqual(performed(fixture), [0]);
  release();
  await first;
  assert.equal(fixture.state.step, 2);
  assert.equal(fixture.state.busy, false);
});

for (const chapter of chapters) {
  test(`chapter ${chapter.id}: five production stage runners drive the real scene to completion`, async () => {
    const fixture = storyFixture(chapter, { realScene: true });
    for (let index = 0; index < 5; index++) {
      assert.equal(fixture.state.step, index + 1);
      assert.equal(fixture.api.targetFor(), fixture.story.targets[index]);
      await fixture.api.act(fixture.story.targets[index]);
      assert.equal(fixture.state.completedStages[index], true);
      assert.equal(fixture.state.step, index + 2);
      assert.equal(fixture.state.busy, false);
      assert.equal(fixture.state.error, null);
    }
    assert.deepEqual(performed(fixture), [0, 1, 2, 3, 4]);
    assert.deepEqual(fixture.calls.filter(call => call[0] === 'reveal').map(call => call[1]), chapter.stages.map(item => item.word));
    for (const item of chapter.stages) assert.ok(fixture.calls.some(call => call[0] === 'say' && call[1] === item.result.en));
    assert.ok(fixture.calls.some(call => call[0] === 'say' && call[1] === chapter.ending.en));
    assert.ok(fixture.calls.some(call => call[0] === 'say' && call[1] === chapter.next.en));
    assert.equal(fixture.state.completed, true);
    assert.equal(fixture.control.summaries, 1);
    assert.deepEqual(fixture.errors, []);
    const saved = JSON.parse(fixture.storage.get(fixture.api.REWARDS_KEY));
    assert.equal(saved[chapter.id].name, chapter.reward.name);
    assert.deepEqual(saved[chapter.id].words, fixture.state.words);
  });
}

test('a consumed hidden target can be retried after reveal fails, without repeating scene changes', async () => {
  const fixture = storyFixture(chapters[0], { realScene: true });
  fixture.control.failRevealOnce = true;
  await fixture.api.act(fixture.story.targets[0]);
  assert.equal(fixture.story.targets[0].visible, false, 'Bridge planks are consumed by the real first action');
  assert.equal(fixture.state.step, 1);
  assert.equal(fixture.state.completedStages[0], false);
  assert.equal(fixture.state.busy, false);
  assert.match(fixture.state.error, /动作按钮/);
  assert.equal(fixture.errors.length, 1);
  const previousTweenCalls = fixture.control.tweenCalls;
  fixture.api.taskAction();
  await settleActions(fixture);
  assert.equal(fixture.state.step, 2);
  assert.equal(fixture.state.completedStages[0], true);
  assert.equal(fixture.state.error, null);
  assert.deepEqual(performed(fixture), [0, 0]);
  assert.equal(fixture.control.tweenCalls, previousTweenCalls, 'Scene idempotency avoids animating consumed planks twice');
});

test('error recovery does not permit hidden wrong targets or a normal hidden target', async () => {
  const fixture = storyFixture();
  fixture.state.error = 'A recoverable failure';
  fixture.story.targets[1].visible = false;
  await fixture.api.act(fixture.story.targets[1]);
  assert.deepEqual(fixture.calls, []);
  fixture.state.error = null;
  fixture.story.targets[0].visible = false;
  fixture.api.taskAction();
  assert.deepEqual(fixture.calls, []);
});

test('an ending failure resumes only the ending, even if the final consumed target is hidden', async () => {
  const fixture = storyFixture(chapters.at(-1), { realScene: true });
  for (let index = 0; index < 4; index++) await fixture.api.act(fixture.story.targets[index]);
  fixture.control.failEndingOnce = true;
  await fixture.api.act(fixture.story.targets[4]);
  assert.equal(fixture.state.step, 5);
  assert.equal(fixture.state.completed, false);
  assert.ok(fixture.state.completedStages.every(Boolean));
  assert.match(fixture.state.error, /动作按钮/);
  assert.equal(fixture.control.summaries, 0);
  fixture.story.targets[4].visible = false;
  const previousTweenCalls = fixture.control.tweenCalls;
  fixture.api.taskAction();
  await settleActions(fixture);
  assert.equal(fixture.state.completed, true);
  assert.equal(fixture.state.step, 6);
  assert.equal(fixture.control.summaries, 1);
  assert.deepEqual(performed(fixture), [0, 1, 2, 3, 4]);
  assert.equal(fixture.control.tweenCalls, previousTweenCalls);
});

test('story help, visibility and external pause reasons compose without early resume', () => {
  const fixture = storyFixture();
  fixture.api.pauseGame(true, 'help');
  fixture.api.pauseGame(true, 'external');
  fixture.api.pauseGame(false, 'help');
  assert.equal(fixture.sandbox.paused, true);
  assert.equal(fixture.sandbox.down, null);
  fixture.api.pauseGame(true, 'visibility');
  fixture.api.pauseGame(false, 'external');
  assert.equal(fixture.sandbox.paused, true);
  fixture.api.pauseGame(false, 'visibility');
  fixture.api.pauseGame(false, 'visibility');
  assert.equal(fixture.sandbox.paused, false);
  assert.equal(fixture.sandbox.sfx.paused, false);
  assert.deepEqual(fixture.pauseCalls, [true, false]);
});

test('unavailable or malformed local storage cannot prevent story completion', async () => {
  const fixture = storyFixture(chapters[0], { realScene: true });
  fixture.sandbox.localStorage = { getItem() { throw new Error('Storage unavailable'); }, setItem() { throw new Error('Storage unavailable'); } };
  assert.equal(Object.keys(fixture.api.readRewards()).length, 0);
  for (let index = 0; index < 5; index++) await fixture.api.act(fixture.story.targets[index]);
  assert.equal(fixture.state.completed, true);
  assert.equal(fixture.control.summaries, 1);
  for (const invalid of ['{', '[]', 'null', 'false', '7']) {
    fixture.sandbox.localStorage = { getItem() { return invalid; } };
    assert.equal(Object.keys(fixture.api.readRewards()).length, 0);
  }
});

test('embedded navigation accepts only integer chapter IDs 1–10 and uses the current origin', () => {
  const fixture = storyFixture();
  for (const invalid of [0, -1, 11, 1.5, '4', null, undefined, NaN, Infinity]) fixture.api.navigate(invalid);
  assert.deepEqual(fixture.messages, []);
  assert.deepEqual(fixture.calls, []);
  for (let next = 1; next <= 10; next++) fixture.api.navigate(next);
  assert.equal(fixture.messages.length, 10);
  fixture.messages.forEach(({ data, origin }, index) => {
    assert.equal(data.type, 'island-navigate');
    assert.equal(data.level, index + 1);
    assert.equal(origin, 'https://island.invalid');
  });
});

test('standalone navigation preserves the three original routes and all seven story chapter URLs', () => {
  const stops = [], self = {}, sandbox = { window: self, parent: self, voice: { stop() { stops.push(true); } }, location: { href: '' } };
  const api = loadStoryControls(sandbox, ['navigate']);
  const paths = ['./index.html', './day2.html', './day3.html', ...Array.from({ length: 7 }, (_, index) => `./story.html?level=${index + 4}`)];
  paths.forEach((path, index) => { api.navigate(index + 1); assert.equal(sandbox.location.href, path); });
  const current = sandbox.location.href;
  api.navigate(99);
  assert.equal(sandbox.location.href, current);
  assert.equal(stops.length, 10);
});


test('the finale music task plays its shared melody before speaking the word', async () => {
  const fixture = storyFixture(chapters.at(-1));
  fixture.state.step = 4;
  fixture.state.completedStages.splice(0, 5, true, true, true, false, false);
  fixture.sandbox.wait = async seconds => { fixture.calls.push(['wait', seconds]); };
  await fixture.api.act(fixture.story.targets[3]);
  assert.deepEqual(fixture.calls.filter(call => ['perform', 'levelup', 'wait', 'reveal'].includes(call[0])), [
    ['perform', 3], ['levelup'], ['wait', .65], ['reveal', 'MUSIC'],
  ]);
  assert.equal(fixture.state.step, 5);
});
