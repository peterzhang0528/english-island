import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from '../public/game/js/vendor/three.module.min.js';
import { BIOMES, OBJECT_WORDS, validateWishPlan } from '../public/game/js/wish-contract.js';
import { createWishScene, getWishCameraShot, isWishVisible, pickWishTarget } from '../public/game/js/wish-world.js';

const examples = JSON.parse(readFileSync(new URL('../public/game/wish-examples.json', import.meta.url), 'utf8')).examples;
const kinds = Object.keys(OBJECT_WORDS);
const viewports = [[1440, 800], [368, 648], [298, 376], [320, 235], [390, 270]];

function planFor(biome, count, offset = 0, seed = 42017) {
  const plan = structuredClone(examples[0].plan);
  plan.biome = biome; plan.seed = seed;
  plan.weather = ['clear', 'rain', 'stars'][offset % 3];
  plan.objects = Array.from({ length: count }, (_, index) => {
    const kind = kinds[(index + offset) % kinds.length];
    return { id: `object_${index}`, kind, word: OBJECT_WORDS[kind], labelZh: `物件${index + 1}` };
  });
  plan.quests.forEach((quest, index) => {
    quest.targetId = plan.objects[index].id; quest.answer = plan.objects[index].word.toLowerCase();
  });
  assert.equal(validateWishPlan(plan).ok, true);
  return plan;
}

function viewFor(world, id, width, height) {
  const shot = getWishCameraShot(world, id, width / height);
  const camera = new THREE.PerspectiveCamera(shot.fov, width / height, .1, 180);
  camera.position.fromArray(shot.pos); camera.lookAt(new THREE.Vector3(...shot.look));
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); world.scene.updateMatrixWorld(true);
  return camera;
}

function physicalMesh(object, world) {
  if (!object.isMesh || !isWishVisible(object, world.scene)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some(material => material.visible && (!material.transparent || material.opacity > .45));
}

function belongsTo(object, target) {
  for (let current = object; current; current = current.parent) if (current === target) return true;
  return false;
}

function visiblePhysicalTarget(world, target, camera) {
  const meshes = [];
  target.traverse(object => { if (physicalMesh(object, world)) meshes.push(object); });
  return meshes.some(mesh => {
    const position = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).project(camera);
    if (Math.abs(position.x) > .94 || Math.abs(position.y) > .94) return false;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(position.x, position.y), camera);
    const first = ray.intersectObject(world.root, true).find(hit => physicalMesh(hit.object, world));
    return first && belongsTo(first.object, target);
  });
}

function transforms(root) {
  const values = [];
  root.traverse(object => {
    const components = [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3), ...object.scale.toArray()];
    assert.ok(components.every(Number.isFinite), `${object.name || object.type}: non-finite transform`);
    values.push([object.visible, ...components]);
  });
  return JSON.stringify(values);
}

for (const [biomeIndex, biome] of BIOMES.entries()) {
  for (const count of [4, 8]) {
    test(`${biome} wish map: ${count} real targets are visible and pickable on five viewport sizes`, () => {
      const plan = planFor(biome, count, biomeIndex * 2 + (count === 8 ? 1 : 0));
      const world = createWishScene(plan);
      try {
        assert.equal(world.targets.size, count);
        assert.ok(world.terrainCells > 0 && world.terrainCells <= 1500);
        assert.equal(world.layout.length, count);
        assert.ok(world.root.getObjectByName('companion-k'));
        assert.ok(world.root.getObjectByName(`${biome}-scenery`));
        for (const [id, target] of world.targets) {
          assert.equal(target.userData.word, plan.objects.find(object => object.id === id).word);
          assert.ok(target.getObjectByName('wish-hit-volume'));
          assert.equal(world.focus(id), true);
          assert.equal(world.marker.visible, true);
          for (const [width, height] of viewports) {
            const camera = viewFor(world, id, width, height);
            const point = target.localToWorld(new THREE.Vector3(...target.userData.bounds.center)).project(camera);
            assert.ok(Math.abs(point.x) < .01 && Math.abs(point.y) < .01, `${id} must be framed centrally`);
            assert.equal(pickWishTarget(world, camera, new THREE.Vector2(0, 0)), id, `${biome}, ${count} objects, ${id}, ${width}×${height}`);
            assert.equal(visiblePhysicalTarget(world, target, camera), true, `${id}: transparent hit volume cannot hide an obscured physical object`);
            target.visible = false;
            assert.notEqual(pickWishTarget(world, camera, new THREE.Vector2(0, 0)), id);
            target.visible = true;
          }
        }
        transforms(world.root);
      } finally { world.dispose(); }
    });
  }
}

test('wish maps render every agreed object kind, including actual geometric differences', () => {
  const signatures = new Map();
  for (const offset of [0, 6]) {
    const world = createWishScene(planFor('forest', 6, offset));
    for (const target of world.targets.values()) {
      const values = [];
      target.traverse(object => {
        if (physicalMesh(object, world)) values.push([...object.position.toArray(), ...object.scale.toArray()]);
      });
      signatures.set(target.userData.kind, JSON.stringify(values));
    }
    world.dispose();
  }
  assert.deepEqual([...signatures.keys()].sort(), [...kinds].sort());
  assert.equal(new Set(signatures.values()).size, kinds.length, 'Object kinds must not be the same placeholder with different names');
});

test('all preset wish adventures frame and pick their three actual quest objects', () => {
  for (const { plan } of examples) {
    const world = createWishScene(plan);
    try {
      for (const quest of plan.quests) {
        const camera = viewFor(world, quest.targetId, 368, 648);
        assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), quest.targetId);
        assert.equal(visiblePhysicalTarget(world, world.targets.get(quest.targetId), camera), true);
      }
    } finally { world.dispose(); }
  }
});

test('a beach umbrella blocks the treasure behind it after a real mobile orbit', () => {
  const plan = examples.find(example => example.id === 'lighthouse').plan;
  const world = createWishScene(plan);
  try {
    const target = world.targets.get('treasure');
    for (const yaw of [-.35, -.7, -1.05]) {
      const shot = getWishCameraShot(world, 'treasure', 320 / 235);
      const look = new THREE.Vector3(...shot.look), offset = new THREE.Vector3(...shot.pos).sub(look);
      const orbit = new THREE.Spherical().setFromVector3(offset); orbit.theta += yaw;
      orbit.phi = Math.max(.3, Math.min(1.38, orbit.phi));
      const camera = new THREE.PerspectiveCamera(shot.fov, 320 / 235, .1, 180);
      camera.position.copy(look).add(offset.setFromSpherical(orbit)); camera.lookAt(look); camera.updateMatrixWorld(true);
      world.scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(), camera);
      const targetHit = ray.intersectObject(target, true)[0];
      const foreground = ray.intersectObject(world.root, true).find(hit => physicalMesh(hit.object, world));
      assert.ok(targetHit, 'The treasure remains behind this screen point');
      assert.ok(foreground && foreground.distance < targetHit.distance);
      assert.equal(belongsTo(foreground.object, target), false, 'A separate physical umbrella is in front');
      assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), null, 'Do not teach or complete a hidden treasure through the umbrella');
      const umbrella = foreground.object.parent;
      umbrella.visible = false;
      assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), 'treasure', 'An invisible foreground ancestor must not block selection');
      umbrella.visible = true;
    }
    const restored = viewFor(world, 'treasure', 320, 235);
    assert.equal(pickWishTarget(world, restored, new THREE.Vector2()), 'treasure', 'Focusing the task again restores a clear, completable view');
  } finally { world.dispose(); }
});

test('gold guidance and weather geometry never block a visible task target', () => {
  const world = createWishScene(planFor('forest', 4));
  try {
    const id = world.layout[0].id;
    const camera = viewFor(world, id, 320, 235);
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(), camera);
    const foreground = ray.ray.at(1, new THREE.Vector3());
    world.focus(id);
    const arrow = world.marker.children.find(object => object.geometry.type === 'ConeGeometry');
    arrow.position.copy(foreground); arrow.scale.setScalar(4); world.scene.updateMatrixWorld(true);
    assert.ok(ray.intersectObject(arrow).length, 'Actual guidance geometry must cross the test ray');
    assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), id);
    world.marker.visible = false;

    const weather = world.root.getObjectByName('weather-clear');
    const cloud = weather.children[0]; cloud.position.copy(foreground); world.scene.updateMatrixWorld(true);
    assert.ok(ray.intersectObject(cloud, true).length, 'Actual cloud geometry must cross the test ray');
    assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), id);
  } finally { world.dispose(); }
});

test('repeated tall and wide objects remain individually selectable on a crowded wish map', () => {
  for (const kind of ['lighthouse', 'house', 'boat', 'bridge']) {
    const plan = planFor('beach', 8, 0, 91823);
    plan.objects.forEach(object => { object.kind = kind; object.word = OBJECT_WORDS[kind]; });
    plan.quests.forEach(quest => { quest.answer = kind; });
    const world = createWishScene(plan);
    try {
      for (const [id, target] of world.targets) for (const [width, height] of [[1440, 800], [320, 680]]) {
        const camera = viewFor(world, id, width, height);
        assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), id, `${kind} ${id} ${width}×${height}`);
        assert.equal(visiblePhysicalTarget(world, target, camera), true);
      }
    } finally { world.dispose(); }
  }
});

test('the seed reproduces the same geometry layout while new seeds and biomes change the world', () => {
  const base = planFor('forest', 8, 0, 0), first = createWishScene(base), same = createWishScene(structuredClone(base));
  const changed = createWishScene({ ...base, seed: 2147483647 });
  const beach = createWishScene({ ...base, biome: 'beach' });
  try {
    assert.deepEqual(first.layout, same.layout);
    assert.equal(first.terrainCells, same.terrainCells);
    assert.equal(transforms(first.root), transforms(same.root));
    assert.notDeepEqual(first.layout, changed.layout);
    assert.notEqual(transforms(first.root), transforms(beach.root));
    assert.notEqual(first.scene.background.getHex(), beach.scene.background.getHex());
  } finally { [first, same, changed, beach].forEach(world => world.dispose()); }
});

test('hidden ancestors and detached targets cannot intercept pointer selection or show a marker', () => {
  const world = createWishScene(planFor('forest', 4));
  try {
    const [id, target] = world.targets.entries().next().value;
    const camera = viewFor(world, id, 368, 648);
    world.focus(id);
    world.root.visible = false; world.tick(1, .016);
    assert.equal(world.marker.visible, false);
    assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), null);
    world.root.visible = true; world.root.remove(target); world.tick(2, .016);
    assert.equal(world.marker.visible, false);
    assert.notEqual(pickWishTarget(world, camera, new THREE.Vector2()), id);
    world.root.add(target); world.tick(3, .016);
    assert.equal(world.marker.visible, true);
    world.focus(null);
    assert.equal(world.marker.visible, false);
  } finally { world.dispose(); }
});

test('completing an object is idempotent, leaves it explorable, and never advances a quest', () => {
  const plan = planFor('farm', 8), original = JSON.stringify(plan), world = createWishScene(plan);
  try {
    assert.equal(world.complete('missing'), false);
    for (const [id, target] of world.targets) {
      const before = transforms(target);
      assert.equal(world.complete(id), true);
      assert.equal(target.userData.completed, true);
      assert.equal(target.userData.badge.visible, true);
      assert.notEqual(transforms(target), before);
      assert.equal(world.complete(id), false);
      world.tick(.325, .325); assert.ok(target.position.y > target.userData.baseY);
      world.tick(.65, .325); assert.equal(target.position.y, target.userData.baseY);
      const camera = viewFor(world, id, 368, 648);
      assert.equal(pickWishTarget(world, camera, new THREE.Vector2()), id);
    }
    assert.equal(JSON.stringify(plan), original, 'Scene completion must not mutate the AI plan or its quests');
  } finally { world.dispose(); }
});

test('reduced motion keeps weather, the companion and completion poses still', () => {
  const plan = planFor('night', 4); plan.weather = 'rain';
  const world = createWishScene(plan, { reduced: true });
  try {
    world.focus(plan.objects[0].id); world.complete(plan.objects[0].id);
    const before = transforms(world.root);
    const rain = world.root.getObjectByName('weather-rain').children.find(object => object.isLineSegments);
    const positions = Array.from(rain.geometry.attributes.position.array);
    world.tick(200, 1);
    assert.equal(transforms(world.root), before);
    assert.deepEqual(Array.from(rain.geometry.attributes.position.array), positions);
  } finally { world.dispose(); }
});

test('disposing a wish map releases all owned geometry/materials and is safe to repeat', () => {
  const world = createWishScene(planFor('snow', 8));
  let geometryDisposals = 0, materialDisposals = 0;
  world.resources.geometries.forEach(geometry => geometry.addEventListener('dispose', () => geometryDisposals++));
  world.resources.materials.forEach(material => material.addEventListener('dispose', () => materialDisposals++));
  world.complete(world.layout[0].id);
  world.dispose(); world.dispose(); world.tick(20, .1);
  assert.equal(world.disposed, true);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.targets.size, 0);
  assert.equal(world.complete(world.layout[0].id), false);
  assert.equal(geometryDisposals, world.resources.geometries.size);
  assert.equal(materialDisposals, world.resources.materials.size);
});

test('invalid maps fail before scene construction', () => {
  const plan = planFor('forest', 4);
  assert.throws(() => createWishScene({ ...plan, biome: 'unsupported' }), /Invalid wish map/);
  assert.throws(() => createWishScene({ ...plan, objects: plan.objects.slice(0, 3) }), /Invalid wish map/);
  assert.throws(() => createWishScene({ ...plan, seed: -1 }), /Invalid wish map/);
});
