import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { parseGameScript, readGameFile } from './helpers/source.mjs';
import { createStoryScene } from '../public/game/js/story-scenes.js';

const chapter = JSON.parse(readGameFile('story-chapters.json')).find(c => c.id === 10);
const script = parseGameScript('js/world-story.js');
function entryFixture(overrides = {}) {
  const messages = [], location = { origin: 'https://island.invalid', href: '' };
  const frameParent = { postMessage(message, origin) { messages.push({ message, origin }); } };
  const sandbox = { level: 10, state: { completed: true, busy: false }, paused: false, helpDialog: { open: false }, voice: { stop() {} }, location, parent: frameParent, window: {}, ...overrides };
  vm.runInNewContext(`${script.declaration('openWish')}\nopenWish();`, sandbox);
  return { sandbox, messages, location };
}

test('the AI companion only appears after all five real celebration actions', async () => {
  const scene = createStoryScene(chapter);
  const portal = scene.hotspots.find(object => object.userData.wishPortal);
  assert.ok(portal);
  assert.equal(portal.visible, false);
  for (let index = 0; index < 5; index++) {
    assert.equal(portal.visible, false);
    await scene.perform(index, { tween: async (_seconds, fn) => fn(1, 1), burst() {} });
  }
  assert.equal(portal.visible, true);
  assert.equal(scene.targets.length, 5, 'The optional portal is not an extra required stage');
});

test('only a completed tenth chapter can open the wish map', () => {
  for (const overrides of [
    { level: 9 }, { state: { completed: false, busy: false } },
    { state: { completed: true, busy: true } }, { paused: true }, { helpDialog: { open: true } },
  ]) assert.deepEqual(entryFixture(overrides).messages, []);
  const result = entryFixture();
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].message.type, 'island-wish-open');
  assert.equal(result.messages[0].origin, 'https://island.invalid');
  assert.equal(result.location.href, '');
});

test('standalone celebration opens the standalone bonus without requiring the parent website', () => {
  const standalone = {};
  const result = entryFixture({ window: standalone, parent: standalone });
  assert.equal(result.location.href, './wish.html');
  assert.equal(result.messages.length, 0);
});

test('returning to the celebration synchronizes sound before resuming and preserves help pause', () => {
  for (const saved of ['1', '0', null, 'unavailable']) {
    const calls = [], sound = { muted: saved !== '1' }, reasons = new Set(['external', 'help']);
    const sandbox = {
      sfx: sound, voice: { stop() { calls.push('stop'); } },
      sessionStorage: { getItem() { if (saved === 'unavailable') throw new Error('blocked'); return saved; } },
      updateSound() { calls.push(['sound', sound.muted]); },
      pauseGame(value, reason = 'external') { assert.equal(value, false); reasons.delete(reason); calls.push(['resume', sound.muted]); },
      updateStatus() { calls.push(['status', sound.muted]); },
    };
    vm.runInNewContext(`${script.declaration('resumeGame')}\nresumeGame();`, sandbox);
    assert.equal(sound.muted, saved !== '0');
    assert.deepEqual([...reasons], ['help']);
    assert.deepEqual(calls.slice(-3), [['sound', sound.muted], ['resume', sound.muted], ['status', sound.muted]]);
    assert.equal(calls.includes('stop'), sound.muted);
  }
});
