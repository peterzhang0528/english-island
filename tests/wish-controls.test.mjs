import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { validateWishPlan, validateWishRequest, isWishAnswerCorrect } from '../public/game/js/wish-contract.js';
import { parseGameScript, readGameFile } from './helpers/source.mjs';

const examples = JSON.parse(readGameFile('wish-examples.json')).examples;
const source = parseGameScript('js/world-wish.js').declaration('createWishController').replace(/^export\s+/, '');
const plain = value => JSON.parse(JSON.stringify(value));
const sandbox = { validateWishPlan, isWishAnswerCorrect, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(`${source}\nglobalThis.make = createWishController;`, sandbox);

function fixture({ plan = examples[0].plan, request } = {}) {
  const calls = [], requests = [], visualDone = new Set();
  const control = { failLoad: false, failComplete: false, waitComplete: null };
  const world = {
    load(value) { calls.push(['load', value.seed]); if (control.failLoad) throw new Error('Controlled renderer failure'); visualDone.clear(); },
    focus(id) { calls.push(['focus', id]); },
    async complete(id) {
      calls.push(['complete', id]);
      if (control.failComplete) throw new Error('Controlled completion failure');
      if (control.waitComplete) await control.waitComplete;
      const fresh = !visualDone.has(id); visualDone.add(id); return fresh;
    },
    setPaused(value) { calls.push(['pause', value]); }, dispose() { calls.push(['dispose']); },
  };
  const controller = sandbox.make({
    world, request: async (body, signal) => { requests.push({ body: plain(body), signal }); return request ? request(body, signal) : { source: 'ai', plan: structuredClone(plan) }; },
    pauseAudio(value) { calls.push(['audioPause', value]); },
  });
  return { controller, state: controller.state, calls, requests, control, visualDone };
}

async function finishCurrent(controller) {
  const quest = controller.currentQuest();
  return quest.kind === 'find' ? controller.select(quest.targetId) : controller.answer(`${quest.answer.toUpperCase()}!`);
}

test('unavailable AI preserves the wish and never substitutes a preset response', async () => {
  const f = fixture(); f.controller.availability(false); f.controller.setDraft('我想帮小羊回家');
  assert.equal(await f.controller.generate(), false);
  assert.equal(f.requests.length, 0);
  assert.equal(f.state.draft, '我想帮小羊回家');
  assert.equal(f.state.plan, null);
  assert.match(f.state.error, /AI伙伴还在准备中/);
  assert.equal(f.controller.useExample(examples[0].plan), true);
  assert.equal(f.state.source, 'example');
  assert.equal(f.state.phase, 'preview');
  assert.equal(f.state.draft, '我想帮小羊回家');
});

test('successful wish refinements send bounded, valid history without duplicating the current message', async () => {
  const f = fixture(); f.controller.availability(true);
  for (let turn = 0; turn < 5; turn++) assert.equal(await f.controller.generate(`愿望 ${turn}\n帮朋友`), true);
  assert.equal(f.state.history.length, 6);
  assert.equal(f.state.source, 'ai');
  assert.equal(f.state.draft, '愿望 4\n帮朋友', 'Editing text is not cleared or normalized in the input');
  for (let index = 0; index < f.requests.length; index++) {
    const { body } = f.requests[index];
    assert.equal(validateWishRequest(body).ok, true);
    assert.ok(body.history.length <= 6);
    assert.equal(body.message, `愿望 ${index} 帮朋友`);
    assert.ok(!body.history.some(item => item.content === body.message));
    assert.equal(Boolean(body.previousPlan), index > 0);
  }
});

for (const result of [{ source: 'example', plan: examples[0].plan }, { source: 'ai', plan: { version: 1 } }, null]) {
  test(`an invalid generation result (${result?.source || 'empty'}) cannot replace the current preview`, async () => {
    const f = fixture({ request: async () => result });
    f.controller.availability(true); f.controller.useExample(examples[0].plan); f.controller.setDraft('再加一朵花');
    const oldPlan = f.state.plan;
    assert.equal(await f.controller.generate(), false);
    assert.equal(f.state.plan, oldPlan);
    assert.equal(f.state.source, 'example');
    assert.equal(f.state.draft, '再加一朵花');
    assert.equal(f.state.history.length, 0);
    assert.equal(f.state.generating, false);
    assert.ok(f.state.error);
  });
}

test('cancelling generation ignores a late response and retains the text', async () => {
  let resolve;
  const f = fixture({ request: () => new Promise(done => { resolve = done; }) });
  f.controller.availability(true); f.controller.setDraft('想去海边');
  const pending = f.controller.generate();
  f.controller.cancelGeneration();
  assert.equal(f.requests[0].signal.aborted, true);
  resolve({ source: 'ai', plan: examples[0].plan });
  assert.equal(await pending, false);
  assert.equal(f.state.plan, null);
  assert.equal(f.state.draft, '想去海边');
  assert.equal(f.state.generating, false);
});

test('the newest generation wins when responses arrive out of order', async () => {
  const responses = [];
  const f = fixture({ request: () => new Promise(resolve => responses.push(resolve)) }); f.controller.availability(true);
  const first = f.controller.generate('想去海边'), second = f.controller.generate('改去雪地');
  responses[1]({ source: 'ai', plan: examples[1].plan }); await second;
  responses[0]({ source: 'ai', plan: examples[0].plan }); await first;
  assert.equal(f.state.plan, examples[1].plan);
  assert.equal(f.state.draft, '改去雪地');
  assert.equal(f.state.history.length, 2);
});

test('choosing an explicit example cancels an outstanding AI response', async () => {
  let resolve;
  const f = fixture({ request: () => new Promise(done => { resolve = done; }) }); f.controller.availability(true);
  const pending = f.controller.generate('想看星星'); f.controller.useExample(examples[2].plan);
  resolve({ source: 'ai', plan: examples[0].plan }); await pending;
  assert.equal(f.state.source, 'example');
  assert.equal(f.state.plan, examples[2].plan);
});

for (const example of examples) {
  test(`${example.id}: only matching find, typed say and solved riddle advance the three tasks`, async () => {
    const f = fixture({ plan: example.plan }); f.controller.useExample(example.plan);
    assert.equal(f.controller.start(), true);
    for (let index = 0; index < 3; index++) {
      const quest = f.controller.currentQuest();
      assert.equal(f.state.questIndex, index);
      if (quest.kind === 'find') {
        const other = example.plan.objects.find(object => object.id !== quest.targetId);
        assert.equal(await f.controller.answer(quest.answer), false);
        assert.equal(await f.controller.select(other.id), false);
      } else {
        assert.equal(await f.controller.select(quest.targetId), false, 'Clicking cannot replace a typed answer');
        assert.equal(await f.controller.answer('not-the-answer'), false);
        f.controller.hint(); assert.equal(f.state.hint, true);
      }
      assert.equal(f.state.questIndex, index);
      assert.equal(await finishCurrent(f.controller), true);
      assert.equal(f.state.done.length, index + 1);
      assert.equal(f.state.questIndex, index + 1);
      assert.equal(f.state.hint, false);
    }
    assert.equal(f.state.phase, 'complete');
    assert.equal(f.state.busy, false);
    for (const quest of example.plan.quests) assert.ok(f.state.words.includes(quest.answer.toUpperCase()));
    assert.equal(await f.controller.select(example.plan.quests[0].targetId), false);
    assert.equal(f.calls.filter(call => call[0] === 'complete').length, 3);
  });
}

test('rapid repeated input cannot complete two quests through one pending world operation', async () => {
  const f = fixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  let release; f.control.waitComplete = new Promise(resolve => { release = resolve; });
  const first = finishCurrent(f.controller);
  assert.equal(f.state.busy, true);
  assert.equal(await finishCurrent(f.controller), false);
  assert.equal(f.calls.filter(call => call[0] === 'complete').length, 1);
  release(); await first;
  assert.equal(f.state.questIndex, 1);
});

test('a visual completion failure is retryable and does not spend a quest', async () => {
  const f = fixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  f.control.failComplete = true;
  assert.equal(await finishCurrent(f.controller), false);
  assert.equal(f.state.questIndex, 0);
  assert.equal(f.state.busy, false);
  f.control.failComplete = false;
  assert.equal(await finishCurrent(f.controller), true);
  assert.equal(f.state.questIndex, 1);
});

test('renderer failure retains the preview and allows rebuilding the same map', () => {
  const f = fixture(); f.controller.setDraft('帮朋友找到家'); f.control.failLoad = true;
  f.controller.useExample(examples[0].plan);
  assert.equal(f.state.phase, 'preview');
  assert.equal(f.state.renderReady, false);
  assert.equal(f.controller.start(), false);
  assert.equal(f.state.draft, '帮朋友找到家');
  f.control.failLoad = false;
  assert.equal(f.controller.retryMap(), true);
  assert.equal(f.controller.start(), true);
});

test('a rebuilt map restores its completed visual targets and current task', async () => {
  const f = fixture(); f.controller.useExample(examples[0].plan); f.controller.start(); await finishCurrent(f.controller);
  f.controller.worldError();
  assert.equal(await finishCurrent(f.controller), false);
  assert.equal(f.controller.retryMap(), true);
  assert.equal(f.state.questIndex, 1);
  assert.ok(f.visualDone.has(examples[0].plan.quests[0].targetId));
  assert.equal(f.calls.at(-1)[0], 'focus');
  assert.equal(f.calls.at(-1)[1], examples[0].plan.quests[1].targetId);
});

test('help, external, modal and visibility pauses cannot resume one another', async () => {
  const f = fixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  f.controller.setPaused(true, 'external'); f.controller.setPaused(true, 'help'); f.controller.setPaused(false, 'help');
  assert.equal(f.state.paused, true);
  assert.equal(await finishCurrent(f.controller), false);
  f.controller.setPaused(true, 'visibility'); f.controller.setPaused(false, 'external');
  assert.equal(f.state.paused, true);
  f.controller.setPaused(false, 'visibility');
  assert.equal(f.state.paused, false);
  assert.deepEqual(f.calls.filter(call => call[0] === 'audioPause').map(call => call[1]), [true, false]);
  assert.equal(await finishCurrent(f.controller), true);
});

test('changing an unfinished map requires explicit confirmation and preserves conversation input', async () => {
  const f = fixture(); f.controller.availability(true); await f.controller.generate('我想去海边'); f.controller.start(); await finishCurrent(f.controller);
  const history = plain(f.state.history);
  assert.equal(f.controller.enterChat(), false);
  assert.equal(await f.controller.generate('偷偷换图'), false);
  assert.equal(f.state.questIndex, 1);
  assert.equal(f.controller.enterChat(true), true);
  assert.equal(f.state.phase, 'chat');
  assert.equal(f.state.draft, '我想去海边');
  assert.deepEqual(plain(f.state.history), history);
  assert.equal(f.state.done.length, 0);
});

test('a completed map can return to K without losing the latest wish', async () => {
  const f = fixture(); f.controller.setDraft('给小羊一个家'); f.controller.useExample(examples[0].plan); f.controller.start();
  for (let index = 0; index < 3; index++) await finishCurrent(f.controller);
  assert.equal(f.controller.enterChat(), true);
  assert.equal(f.state.phase, 'chat');
  assert.equal(f.state.draft, '给小羊一个家');
});

test('disposing a pending generation prevents it from reviving the world', async () => {
  let resolve;
  const f = fixture({ request: () => new Promise(done => { resolve = done; }) }); f.controller.availability(true);
  const pending = f.controller.generate('一张新地图'); f.controller.dispose();
  resolve({ source: 'ai', plan: examples[0].plan }); await pending;
  assert.equal(f.state.plan, null);
  assert.equal(f.calls.filter(call => call[0] === 'load').length, 0);
  assert.equal(f.calls.filter(call => call[0] === 'dispose').length, 1);
});

test('a confirmed restart resets to preview while retaining every pause reason', async () => {
  const f = fixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  await finishCurrent(f.controller);
  f.controller.setPaused(true, 'help'); f.controller.setPaused(true, 'external');
  assert.equal(f.controller.restart(), true);
  assert.equal(f.state.phase, 'preview'); assert.equal(f.state.questIndex, 0); assert.equal(f.state.done.length, 0); assert.equal(f.state.words.length, 0);
  assert.equal(f.state.paused, true); assert.equal(f.controller.start(), false);
  f.controller.setPaused(false, 'external'); assert.equal(f.state.paused, true); assert.equal(f.controller.start(), false);
  f.controller.setPaused(false, 'help'); assert.equal(f.state.paused, false);
  assert.equal(f.state.phase, 'preview', 'Resume does not automatically begin the task');
  assert.equal(f.controller.start(), true); assert.equal(f.state.phase, 'play');
});

// These are event-boundary checks, not a browser/layout simulation. The real UI function
// registers its handlers against a minimal DOM surface, while network/WebGL/audio stay mocked.
async function uiFixture({ fetchImpl } = {}) {
  const html = readGameFile('wish.html'), elements = new Map(), messages = [], audio = [], listeners = {}, worldCalls = [], requests = [];
  const worldControl = { failLoad: false };
  let document;
  function element(tagName = 'DIV') {
    const handlers = {};
    return { tagName, dataset: {}, children: [], hidden: false, disabled: false, value: '', textContent: '', open: false,
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      trigger(type, event = {}) { return Promise.all((handlers[type] || []).map(fn => fn({ preventDefault() {}, ...event }))); },
      replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); },
      setAttribute(name, value) { this[name] = value; }, focus() { document.activeElement = this; }, scrollIntoView() {},
      showModal() { this.open = true; }, close() { this.open = false; void this.trigger('close'); },
    };
  }
  for (const match of html.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"/g)) elements.set(`#${match[2]}`, element(match[1].toUpperCase()));
  elements.set('.map-pane', element('SECTION'));
  document = { activeElement: null, hidden: false,
    querySelector(selector) { if (selector === 'dialog[open]') return [...elements.values()].find(item => item.tagName === 'DIALOG' && item.open); const found = elements.get(selector); assert.ok(found, `UI selector ${selector} exists`); return found; },
    createElement(tag) { return element(tag.toUpperCase()); }, addEventListener(type, fn) { listeners[`document:${type}`] = fn; },
  };
  const parent = { postMessage(data, origin) { messages.push({ data: plain(data), origin }); } };
  const window = { addEventListener(type, fn) { listeners[type] = fn; } };
  const world = { load() { worldCalls.push(['load']); if (worldControl.failLoad) throw new Error('Controlled map failure'); }, focus(id) { worldCalls.push(['focus', id]); }, complete(id) { worldCalls.push(['complete', id]); return true; }, setPaused(value) { worldCalls.push(['pause', value]); }, dispose() { worldCalls.push(['dispose']); } };
  const voice = { ready: Promise.resolve(), has: word => word === 'BOAT', say(word) { audio.push(word); return Promise.resolve(); }, stop() {}, setPaused() {} };
  const globals = { document, parent, window, location: { origin: 'https://island.invalid' },
    matchMedia: () => ({ matches: false }), URL, AbortController, queueMicrotask,
    setTimeout: () => 1, clearTimeout() {}, validateWishPlan, isWishAnswerCorrect,
    voice, sfx: { muted: false, paused: false, unlock() {} }, createWishWorld: () => world,
    fetch: async (url, options = {}) => { requests.push({ url: String(url), ...options }); return fetchImpl ? fetchImpl(url, options) : { ok: true, json: async () => String(url).endsWith('wish-examples.json') ? { examples } : { available: false } }; },
  };
  const script = parseGameScript('js/world-wish.js');
  const init = script.declaration('initWishUI').replace(/^export\s+/, '').replaceAll('import.meta.url', JSON.stringify('https://island.invalid/game/js/world-wish.js'));
  vm.runInNewContext(`${source}\n${script.declaration('WISH_TASK_LABELS')}\n${init}\nglobalThis.ready = initWishUI();`, globals);
  const ui = await globals.ready;
  await new Promise(resolve => setImmediate(resolve));
  return { ...ui, elements, messages, audio, listeners, parent, document, window, voice, worldCalls, worldControl, requests,
    command(command, override = {}) { listeners.message({ origin: globals.location.origin, source: parent, data: { type: 'island-command', command }, ...override }); },
  };
}

test('wish parent commands require both the same origin and the parent window', async () => {
  const f = await uiFixture(); f.controller.useExample(examples[0].plan);
  f.command('start', { origin: 'https://elsewhere.invalid' }); f.command('start', { source: {} });
  assert.equal(f.state.phase, 'preview');
  f.command('start'); assert.equal(f.state.phase, 'play');
  f.command('pause'); f.command('act'); assert.equal(f.state.questIndex, 0);
  f.command('help'); f.command('resume'); assert.equal(f.state.paused, true, 'External resume must not dismiss help');
  f.command('help'); assert.equal(f.state.paused, false);
  f.controller.dispose();
});

for (const helpOpen of [false, true]) {
  test(`parent pause → restart → resume resets once and waits for Play${helpOpen ? ' while help remains open' : ''}`, async () => {
    const f = await uiFixture(); f.controller.useExample(examples[0].plan); f.controller.start();
    f.controller.setDraft('保留我的愿望'); await finishCurrent(f.controller);
    assert.equal(f.state.questIndex, 1); assert.ok(f.state.words.length > 0);
    if (helpOpen) f.command('help');
    f.command('pause'); f.messages.length = 0; f.worldCalls.length = 0;
    f.command('restart');
    assert.equal(f.state.phase, 'preview'); assert.equal(f.state.questIndex, 0);
    assert.equal(f.state.done.length, 0); assert.equal(f.state.words.length, 0); assert.equal(f.state.draft, '保留我的愿望');
    assert.equal(f.state.paused, true); assert.equal(f.elements.get('#wish-play').disabled, true);
    assert.equal(f.messages.length, 1, 'The accepted restart publishes one reset status');
    assert.equal(f.messages[0].data.step, 0); assert.equal(f.messages[0].data.paused, true);
    assert.deepEqual(f.worldCalls, [['load'], ['pause', true], ['focus', null]], 'Only a paused preview is rebuilt');
    f.command('start'); assert.equal(f.state.phase, 'preview', 'Local start remains guarded while paused');
    f.command('resume');
    assert.equal(f.state.paused, helpOpen); assert.equal(f.state.phase, 'preview');
    assert.equal(f.worldCalls.filter(call => call[0] === 'load').length, 1, 'Resume does not rebuild or start a second time');
    if (helpOpen) {
      assert.equal(f.elements.get('#help-dialog').open, true); assert.equal(f.elements.get('#wish-play').disabled, true);
      assert.equal(f.messages.length, 1, 'An unrelated resume cannot clear help or publish a false unpaused status');
      assert.ok(!f.worldCalls.some(call => call[0] === 'pause' && call[1] === false));
      f.command('help');
    }
    assert.equal(f.elements.get('#wish-play').disabled, false);
    await f.elements.get('#wish-play').trigger('click');
    assert.equal(f.state.phase, 'play'); assert.equal(f.state.questIndex, 0);
    assert.equal(f.worldCalls.filter(call => call[0] === 'complete').length, 0, 'No task completes during confirmation or resuming');
    f.controller.dispose();
  });
}

test('spaces in text fields, focused controls and open dialogs never perform a task', async () => {
  const f = await uiFixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  let prevented = 0;
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']) {
    f.document.activeElement = { tagName }; f.listeners.keydown({ key: ' ', preventDefault() { prevented++; } });
  }
  f.document.activeElement = { isContentEditable: true }; f.listeners.keydown({ key: ' ', preventDefault() { prevented++; } });
  assert.equal(f.state.questIndex, 0); assert.equal(prevented, 0);
  f.command('help'); f.document.activeElement = null; f.listeners.keydown({ key: ' ', preventDefault() { prevented++; } });
  assert.equal(f.state.questIndex, 0); assert.equal(prevented, 0);
  f.command('help'); f.listeners.keydown({ key: ' ', preventDefault() { prevented++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.questIndex, 1); assert.equal(prevented, 1);
  f.controller.dispose();
});

test('bonus status keeps main completion false and reports three quests in their actual order', async () => {
  const f = await uiFixture(); f.controller.useExample(examples[2].plan); f.controller.start();
  for (let index = 0; index < 3; index++) await finishCurrent(f.controller);
  const { data, origin } = f.messages.at(-1);
  assert.equal(origin, 'https://island.invalid'); assert.equal(data.level, 10); assert.equal(data.mode, 'wish');
  assert.equal(data.step, 4); assert.equal(data.completed, false); assert.equal(data.bonusCompleted, true);
  const labels = { find: '寻找目标', say: '练习英语', riddle: '解开谜语' };
  assert.deepEqual(data.steps, ['说出愿望', ...examples[2].plan.quests.map(quest => labels[quest.kind])]);
  assert.ok(f.messages.every(item => item.data.completed === false));
  f.controller.dispose();
});

test('only registered vocabulary receives a speaker, with no dynamic dialogue spoken', async () => {
  const f = await uiFixture(); f.controller.useExample(examples[0].plan); f.controller.start();
  assert.deepEqual(f.audio, []);
  await finishCurrent(f.controller);
  const pocket = f.elements.get('#word-pocket');
  assert.equal(pocket.children[0].tagName, 'SPAN', 'Unregistered LIGHTHOUSE must have no audio button');
  const say = f.elements.get('#say-word'), speaker = say.children.find(child => child.tagName === 'BUTTON');
  assert.ok(speaker); await speaker.trigger('click');
  assert.deepEqual(f.audio, ['BOAT']);
  f.command('pause'); await speaker.trigger('click'); assert.deepEqual(f.audio, ['BOAT']);
  f.controller.dispose();
});

const settleUI = () => new Promise(resolve => setImmediate(resolve));

for (const [code, expected] of [
  ['RATE_LIMITED', /一分钟/], ['AI_REFUSED', /轻松友好/], ['INVALID_REQUEST', /280/], ['AI_TIMEOUT', /有点久/],
  ['UNKNOWN_ERROR', /没有接上/], [{ toString: {} }, /没有接上/],
]) {
  test(`generation error ${typeof code === 'string' ? code : 'invalid code'} preserves the editable wish and preview, then retry succeeds`, async () => {
    let fail = true;
    const f = await uiFixture({ fetchImpl: async (_url, options) => {
      if (options.method !== 'POST') return { ok: true, json: async () => ({ available: true }) };
      return fail ? { ok: false, json: async () => ({ error: { code, message: 'untrusted-server-text' } }) } : { ok: true, json: async () => ({ source: 'ai', plan: examples[1].plan }) };
    } });
    f.controller.useExample(examples[0].plan);
    const input = f.elements.get('#wish-message'); input.value = '把海边改成雪地'; await input.trigger('input');
    await f.elements.get('#wish-form').trigger('submit'); await settleUI();
    assert.match(f.elements.get('#wish-error').textContent, expected);
    assert.ok(!f.elements.get('#wish-error').textContent.includes('untrusted-server-text'));
    assert.equal(input.value, '把海边改成雪地'); assert.equal(f.state.plan, examples[0].plan); assert.equal(f.state.history.length, 0);
    assert.equal(f.elements.get('#wish-generate').disabled, false); assert.equal(f.elements.get('#wish-play').disabled, false);
    fail = false; await f.elements.get('#wish-form').trigger('submit'); await settleUI();
    assert.equal(f.state.plan, examples[1].plan); assert.equal(f.state.source, 'ai'); assert.equal(f.elements.get('#wish-error').hidden, true);
    assert.equal(input.value, '把海边改成雪地'); assert.equal(f.state.history.length, 2);
    const sent = f.requests.filter(item => item.method === 'POST'); assert.equal(sent.length, 2);
    assert.equal(validateWishRequest(JSON.parse(sent[1].body)).ok, true);
    f.controller.dispose();
  });
}

test('map retry cannot dispose the world during a new generation and later restores current progress', async () => {
  let release;
  const f = await uiFixture({ fetchImpl: async (_url, options) => options.method === 'POST' ? new Promise(resolve => { release = resolve; }) : { ok: true, json: async () => ({ available: true }) } });
  f.controller.useExample(examples[0].plan); f.controller.worldError();
  const input = f.elements.get('#wish-message'); input.value = '再来一点星星'; await input.trigger('input');
  await f.elements.get('#wish-form').trigger('submit'); await settleUI();
  assert.equal(f.state.generating, true); assert.equal(f.elements.get('#map-retry').disabled, true);
  f.worldCalls.length = 0; await f.elements.get('#map-retry').trigger('click');
  assert.deepEqual(f.worldCalls, [], 'A blocked retry does not destroy the old renderer');
  release({ ok: false, json: async () => ({ error: { code: 'AI_UNAVAILABLE' } }) }); await settleUI();
  await f.elements.get('#map-retry').trigger('click'); assert.equal(f.state.renderReady, true);
  await f.elements.get('#wish-play').trigger('click'); await finishCurrent(f.controller);
  f.controller.worldError(); f.worldControl.failLoad = true;
  await f.elements.get('#map-retry').trigger('click'); assert.equal(f.state.renderReady, false); assert.equal(f.state.questIndex, 1);
  f.worldControl.failLoad = false; await f.elements.get('#map-retry').trigger('click');
  assert.equal(f.state.renderReady, true); assert.equal(f.state.questIndex, 1);
  assert.equal(f.worldCalls.at(-1)[1], examples[0].plan.quests[1].targetId);
  assert.equal(input.value, '再来一点星星');
  f.controller.dispose();
});

test('change-wish confirmation cancels safely or returns to an editable conversation with its history', async () => {
  const f = await uiFixture({ fetchImpl: async (_url, options) => ({ ok: true, json: async () => options.method === 'POST' ? { source: 'ai', plan: examples[0].plan } : { available: true } }) });
  const input = f.elements.get('#wish-message'); input.value = '去有灯塔的海边'; await input.trigger('input');
  await f.elements.get('#wish-form').trigger('submit'); await settleUI();
  await f.elements.get('#wish-play').trigger('click'); await finishCurrent(f.controller);
  const history = plain(f.state.history);
  await f.elements.get('#change-idea').trigger('click'); assert.equal(f.state.paused, true);
  await f.elements.get('#confirm-cancel').trigger('click');
  assert.equal(f.state.phase, 'play'); assert.equal(f.state.questIndex, 1); assert.equal(f.state.paused, false);
  await f.elements.get('#change-idea').trigger('click'); f.command('pause');
  await f.elements.get('#confirm-accept').trigger('click');
  assert.equal(f.state.phase, 'chat'); assert.equal(f.state.paused, true, 'Local confirmation must retain a parent pause');
  assert.equal(f.state.questIndex, 0); assert.equal(input.value, '去有灯塔的海边'); assert.deepEqual(plain(f.state.history), history);
  assert.equal(f.document.activeElement, input); f.command('resume'); assert.equal(f.elements.get('#wish-generate').disabled, false);
  f.controller.dispose();
});

test('returning to the celebration asks before losing a task and sends one close after confirmation', async () => {
  const f = await uiFixture(); f.controller.useExample(examples[0].plan); f.controller.start(); await finishCurrent(f.controller);
  const closes = () => f.messages.filter(item => item.data.type === 'island-wish-close');
  await f.elements.get('#wish-exit').trigger('click'); assert.equal(closes().length, 0);
  await f.elements.get('#confirm-cancel').trigger('click'); assert.equal(f.state.questIndex, 1); assert.equal(closes().length, 0);
  await f.elements.get('#wish-exit').trigger('click'); await f.elements.get('#confirm-accept').trigger('click');
  assert.equal(closes().length, 1); assert.equal(closes()[0].origin, 'https://island.invalid');
  await f.elements.get('#confirm-accept').trigger('click'); assert.equal(closes().length, 1, 'One confirmation cannot send a duplicate close');
  f.controller.dispose();
});

test('returning during generation aborts the request and a late response cannot replace the map', async () => {
  let release;
  const f = await uiFixture({ fetchImpl: async (_url, options) => options.method === 'POST' ? new Promise(resolve => { release = resolve; }) : { ok: true, json: async () => ({ available: true }) } });
  const input = f.elements.get('#wish-message'); input.value = '下一张新地图'; await input.trigger('input');
  await f.elements.get('#wish-form').trigger('submit'); await settleUI();
  await f.elements.get('#wish-exit').trigger('click');
  assert.equal(f.requests.find(item => item.method === 'POST').signal.aborted, true);
  assert.equal(f.messages.filter(item => item.data.type === 'island-wish-close').length, 1);
  release({ ok: true, json: async () => ({ source: 'ai', plan: examples[0].plan }) }); await settleUI();
  assert.equal(f.state.plan, null); assert.equal(f.state.generating, false); assert.equal(input.value, '下一张新地图');
  f.controller.dispose();
});
