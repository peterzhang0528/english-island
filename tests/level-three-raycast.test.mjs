import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { THREE, worldScript } from './helpers/level-three.mjs';
import { declares, ts } from './helpers/source.mjs';

function sceneFixture(width = 1440, height = 800) {
  const scene = new THREE.Scene(), world = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(57, width / height, 0.1, 160);
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
  assert.ok(begin >= 0 && end > begin, 'The island scene construction must exist');
  const geometry = ast.statements.slice(begin, end).map(node => node.getText(ast)).join('\n');
  const controls = ['SHOTS', 'cam', 'shotPosition', 'UP', 'RIGHT', 'applyCamera', 'lookAtObject', 'ray', 'pointer', 'pickAt'];
  vm.runInContext([
    declaration('lam'), declaration('tex'), declaration('M'), geometry,
    ...controls.map(declaration),
    'globalThis.api = { pineCones, fallenLogs, table, sheep, bird, birdhouse, cam, applyCamera, lookAtObject, pickAt };',
  ].join('\n'), vm.createContext(sandbox));

  function reveal(object) {
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const offsets = [
      [4.2, 2.8, 5.2], [-4.2, 2.8, 5.2], [5.2, 3.2, -4.2], [-5, 3.4, -4],
      [0, 3.6, 6.4], [0, 3.6, -6.4], [6.4, 3.2, 0], [-6.4, 3.2, 0],
      [3.5, 4.4, 3.5], [-3.5, 4.4, 3.5],
    ];
    for (const [x, y, z] of offsets) {
      sandbox.api.cam.mode = 'shot';
      sandbox.api.cam.yaw = 0;
      sandbox.api.cam.pitch = 0;
      sandbox.api.cam.fov = 56;
      sandbox.api.cam.look.copy(center);
      sandbox.api.cam.pos.set(center.x + x, center.y + y, center.z + z);
      sandbox.api.applyCamera();
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const point = center.clone().project(camera);
      if (Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1) continue;
      const hit = sandbox.api.pickAt((point.x + 1) * width / 2, (1 - point.y) * height / 2);
      if (hit === object) return hit;
    }
    return null;
  }

  return { ...sandbox.api, reveal, scene };
}

for (const [width, height] of [[1440, 800], [368, 648], [298, 376]]) {
  test(`open-island quest targets can be clicked at ${width}×${height}`, () => {
    const fixture = sceneFixture(width, height);
    const targets = [
      ['pine cone', fixture.pineCones[0]],
      ['log', fixture.fallenLogs[0]],
      ['table', fixture.table],
      ['sheep', fixture.sheep],
      ['bird', fixture.bird],
    ];
    for (const [name, object] of targets) {
      const hit = fixture.reveal(object);
      assert.equal(hit?.userData?.kind, object.userData.kind, `${name} must be in view`);
      assert.ok(hit === object, `${name} must receive the click at ${width}×${height}`);
    }
  });
}

test('a hidden birdhouse does not intercept earlier workshop clicks', () => {
  const fixture = sceneFixture();
  assert.equal(fixture.birdhouse.visible, false);
  const tableHit = fixture.reveal(fixture.table);
  assert.equal(tableHit?.userData?.kind, 'table');
  assert.ok(tableHit === fixture.table);
  fixture.birdhouse.visible = true;
  const houseHit = fixture.reveal(fixture.birdhouse);
  assert.equal(houseHit?.userData?.kind, 'birdhouse');
  assert.ok(houseHit === fixture.birdhouse);
});
