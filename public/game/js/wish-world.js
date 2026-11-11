import * as THREE from './vendor/three.module.min.js';
import { createTextures } from './textures.js';
import { validateWishPlan } from './wish-contract.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const THEMES = {
  forest: { sky: '#bddcda', fog: '#dbe9dc', ground: '#8eb878', edge: '#92765a', leaf: '#689c63', accent: '#e3b982', water: '#82bbc5' },
  beach: { sky: '#b1dfe8', fog: '#e8efdf', ground: '#e9d7ac', edge: '#c5ac81', leaf: '#75a567', accent: '#deaa8d', water: '#75c3cd' },
  snow: { sky: '#c4d8e5', fog: '#eff3ee', ground: '#eef2e8', edge: '#a5b6bd', leaf: '#749c94', accent: '#b6a4c4', water: '#a2cdd6' },
  night: { sky: '#354864', fog: '#637184', ground: '#758e92', edge: '#6c727e', leaf: '#738fa1', accent: '#e0c58b', water: '#607f9d' },
  farm: { sky: '#c7dfd9', fog: '#f0edda', ground: '#a7ba75', edge: '#9e7c56', leaf: '#82975d', accent: '#d7977d', water: '#8dbfc1' },
};

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function isWishVisible(object, scene) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === scene) return true;
  }
  return false;
}

function targetOf(object) {
  for (let current = object; current; current = current.parent) if (current.userData.wishId) return current;
  return null;
}

export function pickWishTarget(world, camera, ndc) {
  world.scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  for (const hit of ray.intersectObjects([...world.targets.values()], true)) {
    if (!isWishVisible(hit.object, world.scene)) continue;
    const target = targetOf(hit.object);
    if (!target) continue;
    // A generous target volume must not make a solid object in front clickable through.
    ray.far = Math.max(0, hit.distance - .0001);
    const blocked = ray.intersectObject(world.root, true).some(front => blocksWishSelection(front.object, world.scene));
    return blocked ? null : target.userData.wishId;
  }
  return null;
}

function opaque(object, scene) {
  if (!object.isMesh || !isWishVisible(object, scene)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some(material => material.visible && (!material.transparent || material.opacity > .45));
}

function blocksWishSelection(object, scene) {
  if (!opaque(object, scene)) return false;
  for (let current = object; current; current = current.parent) {
    if (current.userData.wishId || current.userData.ignoreWishOcclusion) return false;
  }
  return true;
}

// Pure scene construction: the browser wrapper below owns rendering and pointer input.
// The same scene and camera helpers are used directly by the real Three.js geometry tests.
export function createWishScene(plan, { reduced = false } = {}) {
  const checked = validateWishPlan(plan);
  if (!checked.ok) throw new Error(`Invalid wish map: ${checked.errors.join('; ')}`);
  const theme = THEMES[plan.biome], random = seeded(plan.seed);
  const scene = new THREE.Scene(), root = new THREE.Group();
  root.name = `wish-${plan.biome}-${plan.seed}`;
  scene.add(root);
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 39, 95);
  const targets = new Map(), layout = [], completed = new Set(), movements = [];
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const geometry = item => { resources.geometries.add(item); return item; };
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const ringGeometry = geometry(new THREE.RingGeometry(.83, 1, 48));
  const textures = typeof document === 'undefined' ? {} : createTextures(THREE, plan.seed);
  Object.values(textures).forEach(texture => { if (texture?.isTexture) resources.textures.add(texture); });
  function material(color, texture, basic = false, options = {}) {
    const item = basic ? new THREE.MeshBasicMaterial({ color, ...options }) : new THREE.MeshLambertMaterial({ color, ...(textures[texture] ? { map: textures[texture] } : {}), ...options });
    resources.materials.add(item);
    return item;
  }
  const M = {
    ground: material(theme.ground, plan.biome === 'beach' || plan.biome === 'snow' ? null : 'grassTop'),
    edge: material(theme.edge, 'dirt'), wood: material('#d1aa77', 'planks'), log: material('#967556', 'logSide'),
    leaf: material(theme.leaf, 'leaves'), stone: material('#abb8b6', 'stone'), wool: material('#faf5e7', 'wool'),
    white: material('#fff9e9'), cream: material('#f3e2bb'), dark: material('#34434b'), coral: material(theme.accent),
    gold: material('#edc76d'), teal: material('#81b7b3'), blue: material('#96bfd0'), green: material('#87ae78'),
    pink: material('#e9b7b0'), brown: material('#80664f'), soil: material('#8d7055'), purple: material('#b4a4c7'),
    water: material(theme.water, null, false, { transparent: true, opacity: .86 }),
    glow: material('#ffe6a3', null, true), marker: material('#ffd36c', null, true, { side: THREE.DoubleSide, transparent: true, opacity: .94, depthWrite: false }),
    hit: material('#ffffff', null, true, { transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  };
  function group(parent = root, x = 0, y = 0, z = 0) {
    const object = new THREE.Group(); object.position.set(x, y, z); parent.add(object); return object;
  }
  function box(parent, mat, x, y, z, w = 1, h = 1, d = 1) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function cells(parent, points, mat, size = [1, 1, 1]) {
    if (!points.length) return null;
    const mesh = new THREE.InstancedMesh(boxGeometry, mat, points.length), matrix = new THREE.Matrix4();
    points.forEach((point, index) => mesh.setMatrixAt(index, matrix.compose(V(...point), new THREE.Quaternion(), V(...size))));
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function tree(parent, style = plan.biome) {
    const g = group(parent);
    if (style === 'beach') {
      for (let i = 0; i < 5; i++) box(g, M.log, i * .1, .36 + i * .55, 0, .43, .65, .43);
      for (let i = 0; i < 5; i++) {
        const leaf = group(g, .4, 2.9, 0); leaf.rotation.y = i * Math.PI * 2 / 5;
        for (let j = 0; j < 3; j++) box(leaf, M.leaf, 0, -.11 * j, .48 + .53 * j, .48 - j * .08, .17, .7);
      }
      box(g, M.brown, .33, 2.65, .35, .28, .3, .28);
    } else if (style === 'snow') {
      box(g, M.log, 0, 1.5, 0, .5, 3, .5);
      for (let i = 0; i < 4; i++) {
        const width = 2.8 - i * .6;
        box(g, M.leaf, 0, 1.45 + i * .57, 0, width, .7, width);
        box(g, M.white, 0, 1.84 + i * .57, 0, width * .94, .1, width * .94);
      }
    } else {
      box(g, M.log, 0, 1.45, 0, .6, 2.9, .6);
      box(g, M.leaf, 0, 2.8, 0, 2.65, 1.3, 2.35);
      box(g, M.leaf, -.65, 2.3, .25, 1.65, 1.1, 1.7);
      box(g, M.leaf, .5, 3.55, -.2, 1.8, .55, 1.65);
    }
    return g;
  }
  function flower(parent, x = 0, z = 0, color = M.pink, size = 1) {
    const g = group(parent, x, 0, z); g.scale.setScalar(size);
    box(g, M.green, 0, .48, 0, .1, .96, .1);
    box(g, M.green, -.19, .34, 0, .37, .1, .19).rotation.z = -.3;
    for (const [xx, yy] of [[-.23, 0], [.23, 0], [0, -.23], [0, .23]]) box(g, color, xx, 1 + yy, 0, .29, .29, .16);
    box(g, M.gold, 0, 1, .09, .23, .23, .1);
    return g;
  }
  function fence(parent, width) {
    for (let x = -width / 2; x <= width / 2; x += 1.3) box(parent, M.wood, x, .64, 0, .16, 1.28, .16);
    for (const y of [.38, .94]) box(parent, M.wood, 0, y, 0, width, .11, .13);
  }
  function makeObject(kind, parent) {
    const g = group(parent);
    if (kind === 'tree') tree(g);
    if (kind === 'flower') {
      box(g, M.soil, 0, .06, 0, 1.7, .12, 1.3);
      flower(g, -.48, .15, M.coral, .9); flower(g, .05, -.2, M.pink, 1.35); flower(g, .5, .15, M.purple);
    }
    if (kind === 'sheep') {
      for (const x of [-.44, .44]) for (const z of [-.54, .54]) box(g, M.brown, x, .32, z, .23, .64, .23);
      box(g, M.wool, 0, .98, 0, 1.32, .95, 1.6);
      box(g, M.wool, 0, 1.2, .95, .8, .75, .65); box(g, M.cream, 0, 1.04, 1.3, .6, .38, .05);
      for (const x of [-.21, .21]) { box(g, M.dark, x, 1.29, 1.3, .1, .12, .04); box(g, M.cream, x * 2.5, 1.25, .99, .3, .18, .17); }
      box(g, M.pink, 0, .99, 1.34, .17, .08, .04); box(g, M.wool, 0, 1.05, -.94, .3, .24, .3);
    }
    if (kind === 'boat') {
      box(g, M.water, 0, -.06, 0, 4.25, .1, 4.8);
      box(g, M.brown, 0, .22, 0, 1.6, .4, 2.9); box(g, M.wood, 0, .43, 0, 2.1, .27, 3.3);
      for (const x of [-1, 1]) box(g, M.wood, x, .73, 0, .17, .48, 3.2);
      box(g, M.wood, 0, .63, 1.63, 1.4, .38, .48); box(g, M.wood, 0, .78, .55, 2.1, .14, .36);
      box(g, M.log, 0, 2.2, -.25, .13, 3.6, .13);
      for (let i = 0; i < 6; i++) box(g, i % 2 ? M.cream : M.white, .2 + i * .12, 3.65 - i * .38, -.22, .38 + i * .25, .4, .08);
      box(g, M.coral, .3, 4.02, -.25, .65, .29, .07);
    }
    if (kind === 'house') {
      box(g, M.cream, 0, 1.3, 0, 3.25, 2.6, 2.6);
      for (let i = 0; i < 5; i++) box(g, plan.biome === 'snow' ? M.white : M.coral, 0, 2.7 + i * .26, 0, 3.7 - i * .61, .3, 3.05);
      box(g, M.wood, -.6, .9, 1.34, .84, 1.8, .09); box(g, M.gold, -.35, .87, 1.41, .12, .12, .07);
      box(g, M.white, .83, 1.52, 1.34, .92, .9, .08); box(g, M.blue, .83, 1.52, 1.4, .72, .7, .05);
      box(g, M.white, .83, 1.52, 1.44, .07, .73, .04); box(g, M.white, .83, 1.52, 1.44, .73, .07, .04);
      box(g, M.stone, -.92, 3.45, -.6, .49, 1.36, .6); box(g, M.stone, -.6, .09, 1.6, 1.16, .18, .5);
    }
    if (kind === 'bridge') {
      box(g, M.water, 0, -.12, 0, 4.9, .15, 3.7);
      for (let i = 0; i < 9; i++) box(g, M.wood, -1.8 + i * .45, .37 + Math.sin(i / 8 * Math.PI) * .2, 0, .41, .19, 1.9);
      for (const z of [-1, 1]) { const rail = group(g, 0, .3, z); fence(rail, 4); }
      for (const x of [-2, 2]) box(g, M.stone, x, .03, 0, .55, .4, 2.25);
    }
    if (kind === 'lighthouse') {
      for (let i = 0; i < 5; i++) box(g, i % 2 ? M.coral : M.white, 0, .39 + i * .78, 0, 1.5 - i * .08, .78, 1.5 - i * .08);
      box(g, M.wood, 0, .67, .79, .55, 1.34, .08); box(g, M.gold, .17, .65, .86, .08, .08, .06);
      box(g, M.wood, 0, 4.03, 0, 1.85, .2, 1.85); box(g, M.glow, 0, 4.46, 0, .86, .67, .86);
      for (const x of [-.67, .67]) for (const z of [-.67, .67]) box(g, M.brown, x, 4.47, z, .1, .77, .1);
      box(g, M.coral, 0, 4.91, 0, 1.78, .18, 1.78); box(g, M.coral, 0, 5.1, 0, 1.2, .22, 1.2);
    }
    if (kind === 'cake') {
      box(g, M.white, 0, .15, 0, 2.05, .15, 1.85);
      box(g, M.cream, 0, .59, 0, 1.8, .76, 1.6); box(g, M.pink, 0, .58, 0, 1.84, .14, 1.64);
      box(g, M.white, 0, 1.01, 0, 1.86, .16, 1.66);
      for (const x of [-.6, 0, .6]) for (const z of [-.5, .5]) box(g, M.coral, x, 1.18, z, .23, .22, .23);
      box(g, M.teal, 0, 1.38, 0, .1, .58, .1); box(g, M.glow, 0, 1.76, 0, .16, .21, .16);
    }
    if (kind === 'flag') {
      box(g, M.stone, 0, .12, 0, 1.2, .24, 1.2); box(g, M.log, 0, 1.92, 0, .14, 3.84, .14);
      for (let i = 0; i < 5; i++) box(g, i % 2 ? M.gold : M.coral, .23 + i * .29, 3.15 - i * .015, Math.sin(i * .7) * .05, .32, 1, .09);
      box(g, M.gold, 0, 3.96, 0, .24, .24, .24);
    }
    if (kind === 'stone') {
      box(g, M.stone, 0, .47, 0, 1.8, .94, 1.5); box(g, M.stone, -.56, .25, .6, 1.1, .5, .9);
      box(g, M.stone, .35, 1.01, -.16, 1.17, .4, 1.02); box(g, plan.biome === 'snow' ? M.white : M.leaf, -.47, .98, .06, .53, .06, .48);
    }
    if (kind === 'key') {
      box(g, M.stone, 0, .16, 0, 1.45, .32, 1.2);
      const key = group(g, -.28, .65, .12); key.rotation.z = -.25;
      box(key, M.gold, 0, .48, 0, .18, 1.1, .16); box(key, M.gold, .2, .12, 0, .4, .15, .16); box(key, M.gold, .2, .35, 0, .4, .15, .16);
      for (const x of [-.32, .32]) box(key, M.gold, x, 1.23, 0, .18, .62, .18);
      for (const y of [.93, 1.53]) box(key, M.gold, 0, y, 0, .64, .18, .18);
    }
    if (kind === 'chest') {
      box(g, M.wood, 0, .59, 0, 1.9, 1.18, 1.35); box(g, M.brown, 0, .97, 0, 1.96, .09, 1.41);
      box(g, M.wood, 0, 1.28, 0, 1.84, .27, 1.3);
      for (const x of [-.62, .62]) { box(g, M.gold, x, .6, .7, .13, 1.16, .05); box(g, M.gold, x, 1.43, 0, .13, .05, 1.34); }
      box(g, M.gold, 0, .93, .75, .3, .4, .1); box(g, M.dark, 0, .91, .81, .07, .16, .02);
    }
    return g;
  }

  const terrain = group(); terrain.name = 'voxel-island';
  const top = [], edge = [], path = [];
  const shapePhase = random() * Math.PI * 2;
  for (let x = -15; x <= 15; x++) for (let z = -15; z <= 12; z++) {
    const radius = (x / 14.6) ** 2 + ((z + 1.5) / 13.1) ** 2;
    const border = .96 + Math.sin(x * .7 + shapePhase) * .025 + Math.cos(z * .8) * .02;
    if (radius > border) continue;
    const isPath = (Math.abs(x) <= 1 && z > -9) || (Math.abs(z + 1) <= 1 && Math.abs(x) < 10);
    (isPath ? path : top).push([x, 0, z]);
    if (radius > .72) edge.push([x, -.72, z]);
  }
  cells(terrain, top, M.ground); cells(terrain, edge, M.edge, [1, .5, 1]); cells(terrain, path, plan.biome === 'snow' ? M.blue : M.cream, [1, .99, 1]);
  const terrainCells = top.length + edge.length + path.length;
  root.userData.terrainCells = terrainCells;
  box(root, M.water, 0, -.45, 0, 150, .08, 150).receiveShadow = false;
  const scenery = group(); scenery.name = `${plan.biome}-scenery`;
  if (plan.biome === 'farm') {
    for (const x of [-10.6, 10.6]) {
      box(scenery, M.soil, x, .57, -3, 2.1, .14, 9);
      for (let z = -6; z <= 0; z += .7) for (const offset of [-.6, 0, .6]) {
        box(scenery, M.green, x + offset, .97, z, .08, .72, .08);
        box(scenery, M.gold, x + offset, 1.35, z, .18, .32, .18);
      }
    }
    const backFence = group(scenery, 0, .5, -12); fence(backFence, 16);
  } else {
    for (const [x, z] of [[-10, -7], [10.5, -6], [-8.7, -10], [8.8, -10]]) {
      const vegetation = group(scenery, x, .5, z); vegetation.scale.setScalar(.78 + random() * .18); tree(vegetation);
    }
  }
  if (plan.biome === 'snow') {
    for (let i = 0; i < 5; i++) box(scenery, M.white, -5 + i * 2.5, .8 + (i % 2) * .35, -12, 2.6, 1.6 + (i % 2) * .7, 2.8);
  } else if (plan.biome === 'beach') {
    for (const x of [-8, 7]) { const umbrella = group(scenery, x, .5, 7); box(umbrella, M.log, 0, 1.3, 0, .12, 2.6, .12); box(umbrella, M.coral, 0, 2.6, 0, 2.2, .15, 2.2); box(umbrella, M.cream, 0, 2.75, 0, 1.3, .16, 1.3); }
  } else if (plan.biome === 'night') {
    for (let i = 0; i < 8; i++) { const angle = i / 8 * Math.PI * 2, x = Math.cos(angle) * 11, z = Math.sin(angle) * 9 - 1; box(scenery, M.log, x, .92, z, .16, .84, .16); box(scenery, M.glow, x, 1.47, z, .46, .42, .46); }
  } else {
    for (let i = 0; i < 10; i++) { const x = (i % 2 ? -1 : 1) * (9.5 + random()), z = 2 + Math.floor(i / 2) * 1.1; const bed = group(scenery, x, .5, z); flower(bed, 0, 0, i % 2 ? M.pink : M.coral, .6); }
  }

  // K is a friendly small robot, not a task target. The pixel K is geometry, not a downloaded image.
  const friend = group(root, 0, .5, .1); friend.name = 'companion-k';
  for (const x of [-.24, .24]) box(friend, M.teal, x, .26, .05, .34, .5, .48);
  box(friend, M.cream, 0, .96, 0, .92, .95, .58);
  box(friend, M.teal, 0, 1.8, 0, 1.04, .76, .72);
  box(friend, M.white, 0, 1.78, .38, .88, .54, .06);
  for (const x of [-.22, .22]) box(friend, M.dark, x, 1.83, .43, .13, .13, .04);
  box(friend, M.pink, 0, 1.61, .43, .21, .05, .04); box(friend, M.gold, 0, 2.34, 0, .16, .3, .16);
  const arm = group(friend, -.62, 1.22, 0); box(arm, M.teal, 0, -.16, 0, .25, .65, .3); arm.rotation.z = -.45;
  const waveArm = group(friend, .62, 1.22, 0); box(waveArm, M.teal, 0, -.16, 0, .25, .65, .3); waveArm.rotation.z = 1.1;
  for (const [x, y] of [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 0], [2, 1], [2, 3], [2, 4]]) box(friend, M.teal, -.1 + x * .09, .76 + y * .09, .31, .08, .08, .035);

  const slots = [[-6.4, -5.8], [0, -7.8], [6.4, -5.8], [-7.6, .6], [7.6, .6], [-5.2, 6.2], [.2, 7.1], [5.4, 6.2]];
  for (let index = slots.length - 1; index > 0; index--) { const other = Math.floor(random() * (index + 1)); [slots[index], slots[other]] = [slots[other], slots[index]]; }
  for (const [index, object] of plan.objects.entries()) {
    const [sx, sz] = slots[index], x = sx + (random() - .5) * .45, z = sz + (random() - .5) * .4;
    const target = makeObject(object.kind, root); target.position.set(x, .5, z); target.rotation.y = (random() - .5) * .28;
    target.name = `wish-object-${object.id}`;
    target.userData = { wishId: object.id, kind: object.kind, word: object.word, labelZh: object.labelZh, completed: false };
    target.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(target), local = bounds.clone().applyMatrix4(target.matrixWorld.clone().invert());
    const center = local.getCenter(V()), size = local.getSize(V());
    const hit = box(target, M.hit, center.x, center.y, center.z, Math.max(.5, size.x), Math.max(.5, size.y), Math.max(.5, size.z));
    hit.name = 'wish-hit-volume'; hit.castShadow = hit.receiveShadow = false;
    const badge = group(target, center.x, local.max.y + .48, center.z); badge.name = 'completion-badge'; badge.visible = false;
    box(badge, M.green, 0, 0, 0, .62, .5, .16);
    box(badge, M.white, -.13, -.01, .1, .12, .22, .04).rotation.z = .7;
    box(badge, M.white, .06, .04, .1, .12, .36, .04).rotation.z = -.7;
    target.userData.badge = badge; target.userData.baseY = target.position.y;
    target.userData.bounds = { center: center.toArray(), size: size.toArray(), top: local.max.y };
    targets.set(object.id, target); layout.push({ id: object.id, kind: object.kind, position: target.position.toArray(), rotation: target.rotation.y });
  }

  const marker = group(); marker.name = 'focused-object-marker'; marker.visible = false; marker.userData.ignoreWishOcclusion = true;
  const ring = new THREE.Mesh(ringGeometry, M.marker); ring.rotation.x = -Math.PI / 2; marker.add(ring);
  const arrow = new THREE.Mesh(geometry(new THREE.ConeGeometry(.16, .27, 4)), M.marker); arrow.rotation.z = Math.PI; marker.add(arrow);
  const weather = group(); weather.name = `weather-${plan.weather}`; weather.userData.ignoreWishOcclusion = true;
  let rain = null;
  if (plan.weather === 'rain') {
    const coords = [];
    for (let index = 0; index < 110; index++) { const x = (random() - .5) * 28, y = 2 + random() * 12, z = (random() - .5) * 24; coords.push(x, y, z, x - .08, y - .36, z); }
    const rainGeometry = geometry(new THREE.BufferGeometry()); rainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
    const rainMaterial = new THREE.LineBasicMaterial({ color: '#c3dce2', transparent: true, opacity: .38 }); resources.materials.add(rainMaterial);
    rain = new THREE.LineSegments(rainGeometry, rainMaterial); rain.frustumCulled = false; weather.add(rain);
    scene.background.lerp(new THREE.Color('#7d929f'), .26);
  }
  if (plan.weather === 'stars' || plan.biome === 'night') {
    const stars = [];
    for (let index = 0; index < 130; index++) stars.push([(random() - .5) * 100, 14 + random() * 32, -25 - random() * 38]);
    cells(weather, stars, M.glow, [.12, .12, .12]);
    const moon = group(weather, -16, 19, -29); box(moon, M.glow, 0, 0, 0, 2.7, 2.7, .4); box(moon, M.glow, -.4, 0, 0, 2.7, 3.3, .3);
  } else {
    for (let index = 0; index < 4; index++) { const cloud = group(weather, -23 + index * 14, 11 + index % 2 * 2, -24); for (let j = 0; j < 4; j++) box(cloud, M.white, j * 1.2, j === 1 ? .3 : 0, 0, 1.8, .7, 1.6); }
  }
  const hemisphere = new THREE.HemisphereLight(plan.biome === 'night' ? '#b6cce3' : '#eff5e8', '#7b8065', plan.biome === 'night' ? 1.5 : 1.8);
  const sun = new THREE.DirectionalLight(plan.biome === 'night' ? '#f3ddbb' : '#fff0d4', plan.biome === 'night' ? 1.55 : 2);
  sun.position.set(-16, 28, 17); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 1, far: 75 }); sun.shadow.normalBias = .045; sun.shadow.bias = -.0003;
  scene.add(hemisphere, sun);
  let focusId = null, disposed = false;
  const world = {
    scene, root, targets, layout, seed: plan.seed, plan, terrainCells, marker, resources,
    focus(id) {
      focusId = targets.has(id) ? id : null;
      marker.visible = Boolean(focusId);
      this.tick(0, 0);
      return focusId !== null;
    },
    complete(id) {
      if (disposed || !targets.has(id) || completed.has(id)) return false;
      const target = targets.get(id); completed.add(id); target.userData.completed = true; target.userData.badge.visible = true;
      if (!reduced) movements.push({ object: target, elapsed: 0 });
      return true;
    },
    tick(time, delta) {
      if (disposed) return;
      if (!reduced) {
        waveArm.rotation.z = 1.1 + Math.sin(time * 2) * .16;
        friend.position.y = .5 + Math.sin(time * 1.8) * .025;
        for (let index = movements.length - 1; index >= 0; index--) {
          const move = movements[index]; move.elapsed += delta;
          const progress = Math.min(1, move.elapsed / .65);
          move.object.position.y = move.object.userData.baseY + Math.sin(progress * Math.PI) * .24;
          if (progress >= 1) movements.splice(index, 1);
        }
        if (rain) { const positions = rain.geometry.attributes.position; for (let index = 0; index < positions.count; index += 2) { let y = positions.getY(index) - delta * 7; if (y < .7) y += 13; positions.setY(index, y); positions.setY(index + 1, y - .36); } positions.needsUpdate = true; }
      }
      const target = targets.get(focusId);
      marker.visible = Boolean(target && isWishVisible(target, scene));
      if (marker.visible) {
        const center = target.localToWorld(V(...target.userData.bounds.center));
        const size = target.userData.bounds.size, radius = Math.max(.82, Math.max(size[0], size[2]) * .67);
        ring.position.set(center.x, .56, center.z); ring.scale.setScalar(radius * (reduced ? 1 : 1 + Math.sin(time * 3) * .045));
        arrow.position.set(center.x, target.position.y + target.userData.bounds.top + .72 + (reduced ? 0 : Math.sin(time * 3) * .08), center.z);
      }
    },
    dispose() {
      if (disposed) return; disposed = true; movements.length = 0;
      for (const resource of resources.geometries) resource.dispose();
      for (const resource of resources.materials) resource.dispose();
      for (const resource of resources.textures) resource.dispose();
      root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      sun.shadow.map?.dispose(); scene.clear(); targets.clear();
    },
    get disposed() { return disposed; },
  };
  scene.updateMatrixWorld(true);
  return world;
}

export function getWishCameraShot(world, objectId, aspect = 1) {
  aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const target = world.targets.get(objectId);
  world.scene.updateMatrixWorld(true);
  if (!target) {
    const distance = Math.max(31, 25 / Math.min(1, aspect));
    return { pos: [distance * .46, distance * .65, distance * .74], look: [0, 1, -1], fov: 50 };
  }
  const data = target.userData.bounds, center = target.localToWorld(V(...data.center)), size = V(...data.size);
  const fov = 52, halfFov = THREE.MathUtils.degToRad(fov / 2);
  const horizontal = Math.max(size.x, size.z), vertical = size.y;
  const distance = Math.max(6.2, (Math.max(vertical * 1.18, horizontal / Math.min(aspect, 1.25)) / 2) / Math.tan(halfFov) + Math.max(size.x, size.z) * .72);
  const outward = Math.atan2(target.position.x, target.position.z);
  const candidates = [outward, 0, Math.PI / 3, -Math.PI / 3, Math.PI, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI / 2, -Math.PI / 2];
  let best = null, bestScore = -Infinity;
  const testCamera = new THREE.PerspectiveCamera(fov, aspect, .1, 180), ray = new THREE.Raycaster();
  const samples = [];
  target.traverse(object => { if (opaque(object, world.scene)) samples.push(new THREE.Box3().setFromObject(object).getCenter(V())); });
  for (const [index, angle] of candidates.entries()) {
    const pos = center.clone().add(V(Math.sin(angle) * distance * .86, distance * .51, Math.cos(angle) * distance * .86));
    testCamera.position.copy(pos); testCamera.lookAt(center); testCamera.updateMatrixWorld(true);
    const centerId = pickWishTarget(world, testCamera, new THREE.Vector2(0, 0));
    let visible = 0;
    for (const point of samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 8)) === 0)) {
      const projected = point.clone().project(testCamera);
      if (Math.abs(projected.x) > .94 || Math.abs(projected.y) > .9) continue;
      ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), testCamera);
      const first = ray.intersectObject(world.root, true).find(hit => opaque(hit.object, world.scene));
      if (first && targetOf(first.object) === target) visible++;
    }
    const score = (centerId === objectId ? 100 : 0) + visible * 3 - index * .12;
    if (score > bestScore) { bestScore = score; best = { pos: pos.toArray(), look: center.toArray(), fov }; }
  }
  return best;
}

export function createWishWorld(canvas, { onSelect = () => {}, onError = () => {} } = {}) {
  if (!canvas?.getContext) throw new TypeError('A canvas is required for the wish map');
  const view = canvas.ownerDocument?.defaultView || window;
  const reduced = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
  const touch = view.matchMedia?.('(pointer: coarse)').matches || false;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) { onError(error); throw error; }
  renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, touch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 180);
  const cameraState = { position: V(18, 19, 26), look: V(0, 1, -1), yaw: 0, pitch: 0 };
  let world = null, focusedId = null, paused = false, disposed = false, drag = null;
  let transition = null, last = null, elapsed = 0, dirty = true;
  const listeners = [], originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  function listen(type, callback, options) { canvas.addEventListener(type, callback, options); listeners.push([type, callback, options]); }
  function applyCamera() {
    const offset = cameraState.position.clone().sub(cameraState.look);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += cameraState.yaw;
    spherical.phi = Math.max(.3, Math.min(1.38, spherical.phi + cameraState.pitch));
    camera.position.copy(cameraState.look).add(offset.setFromSpherical(spherical));
    camera.lookAt(cameraState.look); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
  function setShot(shot, animate = true) {
    const next = { position: V(...shot.pos), look: V(...shot.look), fov: shot.fov };
    if (animate && !reduced) {
      // Begin from the displayed camera, so a new focus during a drag never snaps backwards.
      transition = { elapsed: 0, fromPosition: camera.position.clone(), fromLook: cameraState.look.clone(), fromFov: camera.fov, ...next };
      cameraState.position.copy(camera.position); cameraState.yaw = cameraState.pitch = 0;
    } else {
      transition = null; cameraState.position.copy(next.position); cameraState.look.copy(next.look);
      cameraState.yaw = cameraState.pitch = 0; camera.fov = next.fov; applyCamera();
    }
    dirty = true;
  }
  function resize() {
    if (disposed) return;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    renderer.setSize(width, height, false); camera.aspect = width / height;
    if (world) setShot(getWishCameraShot(world, focusedId, camera.aspect), false);
    else applyCamera();
    dirty = true;
  }
  function pickAt(clientX, clientY) {
    if (!world || disposed) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    return pickWishTarget(world, camera, new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1));
  }
  function clearDrag() {
    if (drag && canvas.hasPointerCapture?.(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
  }
  listen('pointerdown', event => {
    if (disposed || paused || !world || drag || (event.button !== undefined && event.button !== 0)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: cameraState.yaw, pitch: cameraState.pitch, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
  });
  listen('pointermove', event => {
    if (disposed || paused || !world) return;
    if (!drag) { if (!touch) canvas.style.cursor = pickAt(event.clientX, event.clientY) ? 'pointer' : 'grab'; return; }
    if (drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 7) drag.moved = true;
    if (drag.moved) {
      transition = null; cameraState.yaw = drag.yaw - dx * .005;
      cameraState.pitch = Math.max(-.5, Math.min(.5, drag.pitch - dy * .003));
      dirty = true; applyCamera();
    }
  });
  listen('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const tap = !drag.moved; clearDrag();
    if (!tap || paused || disposed) return;
    const id = pickAt(event.clientX, event.clientY);
    if (id) onSelect(id);
  });
  listen('pointercancel', clearDrag);
  listen('lostpointercapture', () => { drag = null; });
  listen('webglcontextlost', event => {
    event.preventDefault(); paused = true; clearDrag();
    onError(new Error('地图画面暂时中断，请重新打开地图。'));
  });
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  renderer.setAnimationLoop(now => {
    if (disposed) return;
    const delta = last === null ? 0 : Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!world) return;
    if (!paused) {
      elapsed += delta;
      if (transition) {
        transition.elapsed += delta;
        const fraction = Math.min(1, transition.elapsed / .65), eased = fraction * fraction * (3 - 2 * fraction);
        cameraState.position.lerpVectors(transition.fromPosition, transition.position, eased);
        cameraState.look.lerpVectors(transition.fromLook, transition.look, eased);
        camera.fov = transition.fromFov + (transition.fov - transition.fromFov) * eased;
        if (fraction === 1) transition = null;
      }
      world.tick(elapsed, delta); applyCamera(); dirty = true;
    }
    if (dirty) {
      try { renderer.render(world.scene, camera); dirty = false; }
      catch (error) { paused = true; dirty = false; onError(error); }
    }
  });
  function assertActive() { if (disposed) throw new Error('This wish map has been disposed'); }
  const api = {
    load(plan) {
      assertActive();
      let next;
      try { next = createWishScene(plan, { reduced }); }
      catch (error) { onError(error); throw error; }
      const previous = world, previousFocus = focusedId, previousElapsed = elapsed;
      const previousShot = { pos: camera.position.toArray(), look: cameraState.look.toArray(), fov: camera.fov };
      try {
        const shot = getWishCameraShot(next, null, camera.aspect);
        world = next; focusedId = null; elapsed = 0; last = null; clearDrag();
        setShot(shot, false); renderer.render(world.scene, camera); dirty = false;
      } catch (error) {
        world = previous; focusedId = previousFocus; elapsed = previousElapsed; last = null;
        setShot(previousShot, false); next.dispose();
        if (previous) { try { renderer.render(previous.scene, camera); } catch {} }
        onError(error); throw error;
      }
      previous?.dispose();
      return { scene: world.scene, camera, targets: world.targets, layout: world.layout, seed: world.seed, pickAt };
    },
    focus(id) {
      if (disposed || !world) return false;
      if (id !== null && !world.targets.has(id)) return false;
      focusedId = id; world.focus(id); clearDrag();
      setShot(getWishCameraShot(world, id, camera.aspect));
      return true;
    },
    complete(id) {
      if (disposed || !world) return false;
      const changed = world.complete(id); dirty ||= changed; return changed;
    },
    setPaused(value) {
      if (disposed) return;
      paused = Boolean(value); last = null; if (paused) clearDrag(); dirty = true;
    },
    snapshot() {
      assertActive(); if (!world) return null;
      const target = new THREE.WebGLRenderTarget(1200, 800), aspect = camera.aspect, previous = renderer.getRenderTarget();
      target.texture.colorSpace = THREE.SRGBColorSpace;
      try {
        camera.aspect = 1.5; camera.updateProjectionMatrix();
        renderer.setRenderTarget(target); renderer.render(world.scene, camera);
        const bytes = new Uint8Array(1200 * 800 * 4); renderer.readRenderTargetPixels(target, 0, 0, 1200, 800, bytes);
        const output = canvas.ownerDocument.createElement('canvas'); output.width = 1200; output.height = 800;
        const context = output.getContext('2d'), frame = context.createImageData(1200, 800);
        for (let y = 0; y < 800; y++) frame.data.set(bytes.subarray((799 - y) * 4800, (800 - y) * 4800), y * 4800);
        context.putImageData(frame, 0, 0); return output.toDataURL('image/png');
      } finally { renderer.setRenderTarget(previous); camera.aspect = aspect; camera.updateProjectionMatrix(); target.dispose(); dirty = true; }
    },
    dispose() {
      if (disposed) return;
      clearDrag(); disposed = true; observer.disconnect();
      for (const [type, callback, options] of listeners) canvas.removeEventListener(type, callback, options);
      renderer.setAnimationLoop(null); world?.dispose(); world = null;
      renderer.dispose(); canvas.style.touchAction = originalTouchAction; canvas.style.cursor = '';
    },
    get debug() { return { world, scene: world?.scene, camera, targets: world?.targets, layout: world?.layout, seed: world?.seed, pickAt, paused, disposed }; },
  };
  return api;
}
