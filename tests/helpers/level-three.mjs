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

export function target(kind, word = kind.toUpperCase()) {
  const group = new THREE.Group();
  group.userData = { kind, word };
  return group;
}

export function actionFixture() {
  const calls = [], pauseCalls = [], errors = [];
  const state = { step: 1, busy: false, prepared: false, planted: false, watered: false, grown: false, shared: false };
  const control = { actionWait: null };
  const sandbox = {
    THREE, state, paused: false, down: { drag: true },
    helpDialog: { open: false }, ui: { summary: { hidden: true } },
    soilBed: target('soil'), seedPacket: target('seed'), wateringCan: target('water'),
    sunCrank: target('sun'), bee: target('bee'),
    ZH: { FLOWER: '花朵' }, pauseReasons: new Set(),
    voice: { stop() { calls.push('stop'); }, setPaused(value) { pauseCalls.push(value); } },
    sfx: { unlock() { calls.push('unlock'); }, paused: false },
    setTarget(object) { calls.push(['target', object?.userData.kind]); },
    updateStatus() { calls.push('status'); },
    learn(word) { calls.push(['learn', word]); },
    speak(word) { calls.push(['speak', word]); },
    start() { calls.push('start'); },
    console: { error(...args) { errors.push(args); } },
  };
  for (const name of ['prepareSoil', 'plantSeeds', 'waterPlants', 'growFlowers', 'welcomeBee']) {
    sandbox[name] = async () => {
      calls.push(['action', name]);
      if (control.actionWait) await control.actionWait;
      state.busy = false;
    };
  }
  const api = loadControls(sandbox, ['targetFor', 'act', 'taskAction', 'pauseGame']);
  return { api, sandbox, state, calls, pauseCalls, errors, control };
}
