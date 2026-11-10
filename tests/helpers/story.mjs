import vm from 'node:vm';
import * as THREE from '../../public/game/js/vendor/three.module.min.js';
import { createStoryScene } from '../../public/game/js/story-scenes.js';
import { parseGameScript, readGameFile } from './source.mjs';

export const storyScript = parseGameScript('js/world-story.js');
export const chapters = JSON.parse(readGameFile('story-chapters.json'));
export { THREE };

// Execute production declarations with only browser, audio and timing boundaries replaced.
// This does not create a browser, a WebGL renderer, or claim an end-to-end playthrough.
export function loadStoryControls(sandbox, names) {
  const code = names.map(name => storyScript.declaration(name)).join('\n');
  vm.runInContext(`${code}\nglobalThis.api = { ${names.join(', ')} };`, vm.createContext(sandbox));
  return sandbox.api;
}

export function target(index, word) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  object.position.set(index * 2, 1, -3);
  object.userData = { stageIndex: index, word };
  return object;
}

export function storyFixture(chapter = chapters[0], { realScene = false, realStart = false } = {}) {
  const state = { level: chapter.id, step: 1, words: [], sentences: [], busy: false, current: null, completedStages: Array(5).fill(false), completed: false, started: null, elapsed: 0, error: null };
  const calls = [], errors = [], pauseCalls = [], messages = [], storage = new Map();
  const control = { actionWait: null, failRevealOnce: false, failEndingOnce: false, tweenCalls: 0, summaries: 0 };
  const scene = new THREE.Scene();
  let story;
  if (realScene) story = createStoryScene(chapter, { reduced: false, touch: false });
  else {
    const root = new THREE.Group(), targets = chapter.stages.map((item, index) => target(index, item.word));
    targets.forEach(object => root.add(object));
    story = { root, targets, shots: targets.map((_, index) => ({ index })), intro: { intro: true }, finishShot: { finish: true }, async perform() {} };
  }
  scene.add(story.root);
  const perform = story.perform.bind(story);
  story.perform = async (index, services) => {
    calls.push(['perform', index]);
    if (control.actionWait) await control.actionWait;
    return perform(index, services);
  };
  const elements = new Map();
  const classList = { add() {}, remove() {}, toggle() {} };
  const sandbox = {
    THREE, chapter, level: chapter.id, state, scene, story, gameTime: 42,
    paused: false, down: { drag: true }, pauseReasons: new Set(),
    helpDialog: { open: false },
    ui: { summary: { hidden: true }, journal: { hidden: true }, title: { classList }, en: { textContent: '' }, zh: { textContent: '' } },
    stage: { dataset: {}, classList }, canvas: { focus() {} },
    $(selector) { if (!elements.has(selector)) elements.set(selector, { hidden: false }); return elements.get(selector); },
    sfx: { unlock() { calls.push(['unlock']); }, ambience() {}, levelup() { calls.push(['levelup']); }, paused: false },
    voice: { stop() { calls.push(['stop']); }, setPaused(value) { pauseCalls.push(value); } },
    setTarget(object) { calls.push(['target', object?.userData.stageIndex ?? null]); },
    updateJournal() { calls.push(['journal']); }, updateStatus() { calls.push(['status']); },
    goShot: async shot => { calls.push(['shot', shot]); }, wait: async () => {}, burst() {},
    // Run real scene transformations through start, intermediate and end points.
    tween: async (_seconds, update) => { control.tweenCalls++; for (const fraction of [0, .25, .5, .75, 1]) update(fraction, fraction); },
    learn(word) { if (!word) return false; calls.push(['learn', word]); if (!state.words.includes(word)) state.words.push(word); return true; },
    speak: async word => { calls.push(['speak', word]); },
    say: async phrase => {
      calls.push(['say', phrase.en]);
      if (control.failEndingOnce && phrase === chapter.ending) { control.failEndingOnce = false; throw new Error('Controlled ending failure'); }
      state.current = phrase;
    },
    reveal: async word => {
      calls.push(['reveal', word]);
      if (control.failRevealOnce) { control.failRevealOnce = false; throw new Error('Controlled reveal failure'); }
      sandbox.learn(word);
    },
    showSummary() { control.summaries++; calls.push(['summary']); },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    window: {}, parent: { postMessage(data, origin) { messages.push({ data, origin }); } },
    location: { origin: 'https://island.invalid', href: '' },
    console: { error(...args) { errors.push(args); } },
    start() { calls.push(['start']); },
  };
  const names = ['targetFor', 'visibleInScene', 'act', 'taskAction', 'pauseGame', 'performStage', 'enter', 'finish', 'REWARDS_KEY', 'readRewards', 'saveReward', 'navigate'];
  if (realStart) names.push('start');
  const api = loadStoryControls(sandbox, names);
  return { api, sandbox, state, calls, errors, pauseCalls, messages, storage, control, scene, story, elements };
}

export async function settleActions(fixture) {
  for (let count = 0; count < 100 && fixture.state.busy; count++) await Promise.resolve();
  if (fixture.state.busy) throw new Error('Story action did not settle at the replaced async boundaries');
  // The production ending releases busy before its final short wait and summary.
  await Promise.resolve();
  await Promise.resolve();
}
