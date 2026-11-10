import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { THREE, worldScript } from './helpers/level-three.mjs';
import { declares, ts } from './helpers/source.mjs';

function sceneFixture(width = 1440, height = 800) {
  const scene = new THREE.Scene(), world = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(57, width / height, 0.1, 150);
  scene.add(world, camera);
  const texture = new THREE.Texture();
  const bounds = { left: 0, top: 0, width, height };
  const sandbox = {
    THREE, scene, world, camera, touch: false, reduced: false,
    T: new Proxy({}, { get: () => texture }),
    canvas: { getBoundingClientRect: () => bounds },
  };
  const { ast, declaration } = worldScript;
  const begin = ast.statements.findIndex(node => declares(node, 'BOX'));
  const end = ast.statements.findIndex(node => declares(node, 'tweens'));
  assert.ok(begin >= 0 && end > begin, 'The garden scene construction must exist');
  // Keep actual geometry. Drawing sign text and textures does not affect target rays.
  const geometry = ast.statements.slice(begin, end).map(node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'sign') return 'function sign() {}';
    return node.getText(ast);
  }).join('\n');
  const controls = ['SHOTS', 'cam', 'shotPosition', 'UP', 'RIGHT', 'applyCamera', 'ray', 'pointer', 'pickAt'];
  vm.runInContext([
    declaration('lam'), declaration('tex'), declaration('M'), geometry,
    ...controls.map(declaration),
    'globalThis.api = { soilBed, seedPacket, wateringCan, sunCrank, bee, flowers, cam, shotPosition, applyCamera, pickAt };',
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
    return sandbox.api.pickAt((point.x + 1) * width / 2, (1 - point.y) * height / 2);
  }
  return { ...sandbox.api, useShot, centerRay, scene };
}

for (const [width, height] of [[1440, 800], [368, 648], [298, 376]]) {
  test(`garden task targets can be clicked at ${width}×${height}`, () => {
    const fixture = sceneFixture(width, height);
    for (const [shot, key] of [['soil', 'soilBed'], ['seed', 'seedPacket'], ['water', 'wateringCan'], ['sun', 'sunCrank'], ['bee', 'bee']]) {
      if (shot === 'bee') {
        // At the sharing stage the flowers have grown and the bee has appeared.
        fixture.flowers.forEach(flower => { flower.visible = true; });
        fixture.bee.visible = true;
      }
      fixture.useShot(shot);
      assert.equal(fixture.centerRay(fixture[key]), fixture[key], `${shot} must receive the click`);
    }
  });
}

test('hidden garden growth and bee targets cannot intercept earlier clicks', () => {
  const fixture = sceneFixture();
  fixture.useShot('soil');
  assert.ok(fixture.flowers.every(flower => !flower.visible));
  assert.equal(fixture.bee.visible, false);
  assert.equal(fixture.centerRay(fixture.soilBed), fixture.soilBed);
  fixture.useShot('bee');
  assert.notEqual(fixture.centerRay(fixture.bee), fixture.bee);
  fixture.bee.visible = true;
  fixture.scene.updateMatrixWorld(true);
  assert.equal(fixture.centerRay(fixture.bee), fixture.bee);
});
