import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as THREE from '../public/game/js/vendor/three.module.min.js';

const source = readFileSync(new URL('../public/game/js/world.js', import.meta.url), 'utf8');

function obb(mesh) {
  mesh.updateWorldMatrix(true, true);
  const { width, height, depth } = mesh.geometry.parameters;
  const e = new THREE.Vector3(width / 2, height / 2, depth / 2);
  const rotation = mesh.getWorldQuaternion(new THREE.Quaternion());
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
    .map(axis => axis.applyQuaternion(rotation));
  return { center: mesh.getWorldPosition(new THREE.Vector3()), axes, e };
}

// Positive means the boxes are separated by that distance along some axis.
function separation(a, b) {
  const offset = b.center.clone().sub(a.center);
  const axes = [...a.axes, ...b.axes];
  for (const left of a.axes) for (const right of b.axes) {
    const cross = new THREE.Vector3().crossVectors(left, right);
    if (cross.lengthSq() > 1e-10) axes.push(cross.normalize());
  }
  let best = -Infinity;
  for (const axis of axes) {
    const radius = box => box.e.x * Math.abs(box.axes[0].dot(axis))
      + box.e.y * Math.abs(box.axes[1].dot(axis))
      + box.e.z * Math.abs(box.axes[2].dot(axis));
    best = Math.max(best, Math.abs(offset.dot(axis)) - radius(a) - radius(b));
  }
  return best;
}

function distanceToBox(mesh, point) {
  mesh.updateWorldMatrix(true, true);
  const local = mesh.worldToLocal(point.clone());
  const { width, height, depth } = mesh.geometry.parameters;
  const half = new THREE.Vector3(width / 2, height / 2, depth / 2);
  const closest = new THREE.Vector3(
    THREE.MathUtils.clamp(local.x, -half.x, half.x),
    THREE.MathUtils.clamp(local.y, -half.y, half.y),
    THREE.MathUtils.clamp(local.z, -half.z, half.z),
  );
  return local.distanceTo(closest);
}

function loadDoor() {
  const start = source.indexOf('// 门：');
  const end = source.indexOf('// 羊、云');
  assert.ok(start >= 0 && end > start, 'The chapter-one door construction must stay marked in world.js');
  const world = new THREE.Group();
  const material = new THREE.MeshLambertMaterial();
  const sandbox = {
    THREE,
    world,
    M: { planks: material, log: material, door: material },
    tag(object, kind, word, extra = {}) {
      object.userData = { kind, word, ...extra };
      return object;
    },
    block(mat, x, y, z) {
      const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      object.position.set(x, y, z);
      world.add(object);
      return object;
    },
  };
  vm.runInContext(source.slice(start, end), vm.createContext(sandbox));
  const hinge = world.children.find(object => object.isGroup);
  const door = hinge?.children.find(object => object.isMesh && object.userData.kind === 'door');
  const frame = world.children.filter(object => object.isMesh);
  assert.ok(hinge && door && frame.length === 7, 'The real door, hinge and seven frame blocks must be built');
  return { hinge, door, frame };
}

test('the first door stays clear of the frame and grass while it swings open', () => {
  const angle = source.match(/hinge\.rotation\.y = -k \* ([0-9.]+)/);
  assert.ok(angle, 'The door must still swing with the existing tween');
  assert.equal(Number(angle[1]), 1.95);
  assert.match(source, /sfx\.creak\(\)/);
  assert.match(source, /Open the door!/);

  const { hinge, door, frame } = loadDoor();
  const grass = [];
  for (const x of [-1, 0, 1]) for (const z of [2, 3, 4]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    block.position.set(x, 0, z);
    grass.push(block);
  }

  hinge.rotation.y = 0;
  hinge.updateWorldMatrix(true, true);
  const closed = new THREE.Box3().setFromObject(door);
  assert.ok(closed.min.x < -0.4 && closed.max.x > 0.4, 'The closed door still covers the doorway');
  assert.ok(closed.min.x > -0.5 && closed.max.x < 0.5, 'The closed door stays inside the posts');
  assert.ok(closed.min.y > 0.5 && closed.max.y < 2.5, 'The closed door stays between the ground and the lintel');
  assert.ok(closed.min.z > 2.5, 'The closed door sits in front of the frame instead of inside it');

  let frameGap = Infinity;
  let groundGap = Infinity;
  for (let step = 0; step <= 40; step += 1) {
    hinge.rotation.y = -Number(angle[1]) * (step / 40);
    hinge.updateWorldMatrix(true, true);
    const doorBox = obb(door);
    for (const block of frame) frameGap = Math.min(frameGap, separation(doorBox, obb(block)));
    for (const block of grass) groundGap = Math.min(groundGap, separation(doorBox, obb(block)));
  }
  assert.ok(frameGap >= 0.02, `Door entered the frame (gap ${frameGap})`);
  assert.ok(groundGap >= 0.01, `Door entered the grass (gap ${groundGap})`);

  hinge.rotation.y = -Number(angle[1]);
  hinge.updateWorldMatrix(true, true);
  const start = new THREE.Vector3(0.7, 1.62, 7.8);
  const end = new THREE.Vector3(0, 1.62, -1.4);
  let cameraGap = Infinity;
  for (let step = 0; step <= 40; step += 1) cameraGap = Math.min(cameraGap, distanceToBox(door, start.clone().lerp(end, step / 40)));
  assert.ok(cameraGap >= 0.25, `The walk into the island passes through the open door (gap ${cameraGap})`);
});
