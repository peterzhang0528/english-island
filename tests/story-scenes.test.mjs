import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import * as THREE from '../public/game/js/vendor/three.module.min.js';
import { createStoryScene } from '../public/game/js/story-scenes.js';
import { gameURL, parseGameScript } from './helpers/source.mjs';

const chapters = JSON.parse(readFileSync(new URL('story-chapters.json', gameURL), 'utf8'));
const engine = parseGameScript('js/world-story.js');
const controls = ['normalizeShot', 'resolveTarget', 'visibleInScene', 'pickAt'];
const controlSource = controls.map(engine.declaration).join('\n');
const viewports = [[1440, 800], [368, 648], [298, 376]];
const instantPresentation = {
  async tween(_seconds, update) {
    // Exercise intermediate and final transforms, without replacing game geometry.
    for (const progress of [0, .25, .5, .75, 1]) update(progress, progress);
  },
  burst() {},
};

function fingerprint(root) {
  const values = [];
  root.traverse(object => values.push([
    object.uuid, object.visible, object.parent?.uuid,
    ...object.position.toArray(), ...object.rotation.toArray().slice(0, 3), ...object.scale.toArray(),
    object.material?.uuid,
  ]));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function finiteTransforms(root) {
  root.traverse(object => assert.ok([
    ...object.position.toArray(), ...object.rotation.toArray().slice(0, 3), ...object.scale.toArray(),
  ].every(Number.isFinite), `Invalid transform on ${object.name || object.type}`));
}

function fixture(chapter) {
  const story = createStoryScene(chapter), scene = new THREE.Scene();
  scene.add(story.root);
  function frame(index, width, height) {
    const camera = new THREE.PerspectiveCamera(57, width / height, .1, 150);
    const sandbox = {
      THREE, scene, camera, hot: story.hotspots, ray: new THREE.Raycaster(), pointer: new THREE.Vector2(),
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) },
    };
    vm.runInContext(`${controlSource}\nglobalThis.api = { ${controls.join(', ')} };`, vm.createContext(sandbox));
    const shot = sandbox.api.normalizeShot(story.shots[index]);
    camera.position.copy(shot.pos); camera.lookAt(shot.look); camera.fov = shot.fov;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(story.targets[index]).getCenter(new THREE.Vector3()).project(camera);
    return { camera, center, api: sandbox.api, x: (center.x + 1) * width / 2, y: (1 - center.y) * height / 2 };
  }
  return { story, scene, frame };
}

function belongsTo(object, target) {
  for (let parent = object; parent; parent = parent.parent) if (parent === target) return true;
  return false;
}

function opaqueAndVisible(object) {
  if (!object.isMesh) return false;
  for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some(material => material.visible && (!material.transparent || material.opacity > .4));
}

function hasVisibleGeometry(story, target, camera) {
  const candidates = [];
  target.traverse(object => { if (opaqueAndVisible(object)) candidates.push(object); });
  // A transparent interaction box must not make a completely obscured item pass.
  return candidates.some(object => {
    const point = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
    if (Math.abs(point.x) > .95 || Math.abs(point.y) > .95) return false;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
    const nearest = ray.intersectObject(story.root, true).find(hit => opaqueAndVisible(hit.object));
    return nearest && belongsTo(nearest.object, target);
  });
}

for (const chapter of chapters) {
  test(`chapter ${chapter.id}: five visual operations and targets work across desktop and mobile`, async () => {
    const { story, frame } = fixture(chapter);
    assert.equal(story.targets.length, 5);
    assert.equal(story.shots.length, 5);
    assert.ok(story.root.userData.terrainCells > 0 && story.root.userData.terrainCells <= 2000);
    const initial = fingerprint(story.root);
    await story.perform(4, instantPresentation);
    assert.equal(fingerprint(story.root), initial, 'Later operations must wait for their prerequisites');

    for (let index = 0; index < 5; index++) {
      const target = story.targets[index];
      assert.equal(target.userData.stageIndex, index);
      assert.equal(target.userData.word, chapter.stages[index].word);
      assert.ok(story.hotspots.includes(target));
      for (const [width, height] of viewports) {
        const view = frame(index, width, height);
        const description = `chapter ${chapter.id}, stage ${index}, ${width}×${height}`;
        assert.ok(Math.abs(view.center.x) < 1 && Math.abs(view.center.y) < 1, `${description}: target outside view`);
        assert.equal(view.api.pickAt(view.x, view.y), target, `${description}: another target intercepts the click`);
        assert.ok(hasVisibleGeometry(story, target, view.camera), `${description}: scenery hides the physical target`);
        target.visible = false;
        assert.notEqual(view.api.pickAt(view.x, view.y), target, `${description}: hidden target intercepts a click`);
        target.visible = true;
      }
      const before = fingerprint(story.root);
      await story.perform(index, instantPresentation);
      const after = fingerprint(story.root);
      assert.notEqual(after, before, 'Each completed task must leave an actual visual change');
      await story.perform(index, instantPresentation);
      assert.equal(fingerprint(story.root), after, 'Completed operations must not replay');
      finiteTransforms(story.root);
      story.tick(10, .016);
      finiteTransforms(story.root);
    }
  });

  test(`chapter ${chapter.id}: parallel input cannot run a second visual operation`, async () => {
    const { story } = fixture(chapter);
    let release, calls = 0;
    const services = {
      burst() {},
      async tween(_seconds, update) {
        calls++;
        if (calls === 1) await new Promise(resolve => { release = resolve; });
        update(1, 1);
      },
    };
    const first = story.perform(0, services);
    assert.equal(calls, 1);
    const waiting = fingerprint(story.root);
    await story.perform(0, services);
    await story.perform(1, services);
    assert.equal(calls, 1);
    assert.equal(fingerprint(story.root), waiting);
    release();
    await first;
    finiteTransforms(story.root);
    // A failed or blocked reentry must not prevent the next legitimate stage.
    const beforeNext = fingerprint(story.root);
    await story.perform(1, instantPresentation);
    assert.notEqual(fingerprint(story.root), beforeNext);
  });
}

test('reduced motion leaves optional scenery animations still', async () => {
  const chapter = chapters.find(item => item.id === 8);
  const story = createStoryScene(chapter, { reduced: true });
  for (let index = 0; index < 5; index++) await story.perform(index, instantPresentation);
  const before = fingerprint(story.root);
  story.tick(100, .1);
  assert.equal(fingerprint(story.root), before);
});
