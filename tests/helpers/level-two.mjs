import vm from 'node:vm';
import * as THREE from '../../public/game/js/vendor/three.module.min.js';
import { parseGameScript } from './source.mjs';

export const worldScript = parseGameScript('js/world2.js');
export { THREE };

// Extract the real declarations without loading WebGL or replacing the whole game.
// These tests cover control boundaries; they do not claim browser gameplay coverage.
export function loadControls(sandbox, names) {
  const context = vm.createContext(sandbox);
  const code = names.map(name => worldScript.declaration(name)).join('\n');
  vm.runInContext(`${code}\nglobalThis.api = { ${names.join(', ')} };`, context);
  return sandbox.api;
}

export function target(kind, word = kind.toUpperCase()) {
  const group = new THREE.Group();
  group.userData = { kind, word };
  return group;
}

export function actionFixture() {
  const calls = [], pauseCalls = [], errors = [];
  const state = { step: 1, busy: false, words: [] };
  const control = { actionWait: null };
  const sandbox = {
    THREE, state, paused: false, down: { drag: true },
    helpDialog: { open: false }, ui: { summary: { hidden: true } },
    chicken: target('chicken'), cow: target('cow'), table: target('table'), zombie: target('zombie'),
    wheat: [target('wheat'), target('wheat'), target('wheat')],
    ZH: { TREE: '树', TABLE: '工作台' }, pauseReasons: new Set(),
    voice: { stop() { calls.push('stop'); }, setPaused(value) { pauseCalls.push(value); } },
    sfx: { unlock() { calls.push('unlock'); }, paused: false },
    setTarget(object) { calls.push(['target', object?.userData.kind]); },
    updateStatus() { calls.push('status'); },
    learn(word) { calls.push(['learn', word]); },
    speak(word) { calls.push(['speak', word]); },
    start() { calls.push('start'); },
    console: { error(...args) { errors.push(args); } },
  };
  for (const name of ['getEgg', 'getMilk', 'harvest', 'makeCake', 'feedFriend']) {
    sandbox[name] = async object => {
      calls.push(['action', name, object]);
      if (control.actionWait) await control.actionWait;
      state.busy = false;
    };
  }
  const api = loadControls(sandbox, ['targetFor', 'act', 'taskAction', 'pauseGame']);
  return { api, sandbox, state, calls, pauseCalls, errors, control };
}
