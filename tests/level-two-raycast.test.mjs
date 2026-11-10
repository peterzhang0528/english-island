import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { THREE, worldScript } from './helpers/level-two.mjs';
import { declares, ts } from './helpers/source.mjs';

function sceneFixture() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 150);
  scene.add(world, camera);
  // Ray intersections depend on geometry, not texture pixels. No canvas or WebGL is created.
  const texture = new THREE.Texture();
  const textures = new Proxy({}, { get: () => texture });
  const bounds = { left: 0, top: 0, width: 1440, height: 800 };
  const sandbox = { THREE, scene, world, camera, T: textures, touch: false, reduced: false, canvas: { getBoundingClientRect: () => bounds } };
  const { ast, declaration } = worldScript;
  const begin = ast.statements.findIndex(node => declares(node, 'BOX'));
  const end = ast.statements.findIndex(node => declares(node, 'tweens'));
  assert.ok(begin >= 0 && end > begin, 'The real scene construction section must exist');
  const geometry = ast.statements.slice(begin, end).map(node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'sign') return 'function sign() {}';
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'bubbleTexture') return 'function bubbleTexture() { return new THREE.Texture(); }';
    return node.getText(ast);
  }).join('\n');
  const controls = ['SHOTS', 'cam', 'shotPosition', 'UP', 'RIGHT', 'applyCamera', 'ray', 'pointer', 'pickAt'];
  vm.runInContext([
    declaration('lam'), declaration('tex'), declaration('M'), geometry,
    ...controls.map(declaration),
    'globalThis.api = { chicken, cow, wheat, table, zombie, cake, cam, shotPosition, applyCamera, pickAt };',
  ].join('\n'), vm.createContext(sandbox));

  function useShot(name) {
    const shot = sandbox.api.shotPosition(name);
    sandbox.api.cam.pos.copy(shot.pos);
    sandbox.api.cam.look.copy(shot.look);
    sandbox.api.cam.fov = shot.fov;
    sandbox.api.applyCamera();
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
  }
  function centerRay(object) {
    const point = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
    assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, 'The target must be inside the viewport');
    return sandbox.api.pickAt((point.x + 1) * bounds.width / 2, (1 - point.y) * bounds.height / 2);
  }
  return { ...sandbox.api, camera, bounds, useShot, centerRay };
}

for (const [width, height] of [[1440, 800], [368, 648], [298, 376]]) {
  test(`real scene targets can be clicked at ${width}×${height}`, () => {
    const fixture = sceneFixture();
    fixture.bounds.width = width;
    fixture.bounds.height = height;
    fixture.camera.aspect = width / height;
    for (const kind of ['chicken', 'cow', 'wheat', 'table', 'zombie']) {
      fixture.useShot(kind);
      const objects = kind === 'wheat' ? fixture.wheat : [fixture[kind]];
      for (const object of objects) assert.equal(fixture.centerRay(object), object, `${kind} must receive the center click`);
    }
  });
}

test('an invisible cake cannot intercept workbench clicks', () => {
  const fixture = sceneFixture();
  fixture.camera.aspect = fixture.bounds.width / fixture.bounds.height;
  fixture.useShot('table');
  assert.equal(fixture.cake.visible, false);
  assert.equal(fixture.centerRay(fixture.table), fixture.table);
});
