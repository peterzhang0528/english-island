import vm from 'node:vm';
import * as THREE from '../../public/game/js/vendor/three.module.min.js';
import { parseGameScript } from './source.mjs';

export const worldScript = parseGameScript('js/world3.js');
export { THREE };

// Exercise actual game declarations while replacing presentation and browser boundaries.
// This is not an end-to-end browser simulation.
export function loadControls(sandbox, names) {
  const code = names.map(name => worldScript.declaration(name)).join('\n');
  vm.runInContext(`${code}\nglobalThis.api = { ${names.join(', ')} };`, vm.createContext(sandbox));
  return sandbox.api;
}

export function target(kind, word = kind === 'cone' ? 'PINE CONE' : kind === 'wood' ? 'LOG' : kind.toUpperCase()) {
  const group = new THREE.Group();
  group.userData = { kind, word, collected: false };
  group.position.set(0, 0.5, 0);
  return group;
}

export function actionFixture() {
  const calls = [], pauseCalls = [], errors = [];
  const player = new THREE.Group();
  player.position.set(0, 0.5, 0);
  const pineCones = [target('cone'), target('cone'), target('cone')];
  pineCones.forEach((item, index) => { item.position.set(index, 0.5, 0); item.userData.index = index; });
  const fallenLogs = [target('wood'), target('wood')];
  fallenLogs.forEach((item, index) => { item.position.set(index, 0.5, 2); item.userData.index = index; });
  const table = target('table');
  table.position.set(0, 0.5, -2);
  const sheep = target('sheep');
  sheep.position.set(2, 0.5, 2);
  const bird = target('bird');
  bird.position.set(-2, 0.5, 2);
  const state = { step: 1, busy: false, cones: 0, logs: 0, house: false, watched: false, invited: false, hinted: {}, words: [], sentences: [] };
  const control = { actionWait: null, range: true };
  const sandbox = {
    THREE, state, paused: false, down: { drag: true }, player,
    pineCones, fallenLogs, table, sheep, bird, birdhouse: target('birdhouse'),
    helpDialog: { open: false }, ui: { summary: { hidden: true } },
    ZH: { 'PINE CONE': '松果', LOG: '木头', BIRDHOUSE: '鸟屋', BIRD: '小鸟', SHEEP: '小羊' },
    pauseReasons: new Set(),
    voice: { stop() { calls.push('stop'); }, setPaused(value) { pauseCalls.push(value); } },
    sfx: { unlock() { calls.push('unlock'); }, paused: false },
    setTarget(object) { calls.push(['target', object?.userData.kind]); },
    updateStatus() { calls.push('status'); },
    updateQuests() { calls.push('quests'); },
    updateWayfinder() { calls.push('wayfinder'); },
    learn(word) { calls.push(['learn', word]); },
    speak(word) { calls.push(['speak', word]); },
    start() { calls.push('start'); },
    say: async (en) => { calls.push(['say', en]); },
    inRange() { return control.range; },
    canBuild() { return state.cones >= 3 && state.logs >= 2 && !state.house; },
    canInvite() { return state.house && !state.invited; },
    objectPosition(object) { return object.getWorldPosition(new THREE.Vector3()); },
    console: { error(...args) { errors.push(args); } },
  };
  for (const name of ['collectCone', 'collectLog', 'buildBirdhouse', 'watchAnimal', 'inviteBird']) {
    sandbox[name] = async (...args) => {
      if (name === 'buildBirdhouse' && !sandbox.canBuild()) { calls.push(['blocked', name]); return; }
      if (name === 'inviteBird' && !sandbox.canInvite()) { calls.push(['blocked', name]); return; }
      calls.push(['action', name]);
      if (control.actionWait) await control.actionWait;
      state.busy = false;
      return args;
    };
  }
  const api = loadControls(sandbox, ['targetFor', 'act', 'taskAction', 'pauseGame', 'nextHintId']);
  return { api, sandbox, state, calls, pauseCalls, errors, control, pineCones, fallenLogs, table, sheep, bird, player };
}
