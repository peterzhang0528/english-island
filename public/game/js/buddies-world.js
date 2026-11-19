// Buddy Island scene: a small free-walk voxel island with the player, Mia and Leo.
// Game rules live in buddies-game.js; this file only draws and moves the player.
import * as THREE from './vendor/three.module.min.js';
import { BUDDIES } from './buddies-contract.js';
import { ISLAND_RADIUS, PLACES, PLAYER_SPEED, SPAWN, clampToIsland } from './buddies-map.js';

const POND = { x: PLACES.bridge.x, z: PLACES.bridge.z, r: 2.6 };
// Solid things the player walks around. Companions ignore them; they only stand next to places.
export const OBSTACLES = Object.freeze([
  { x: PLACES.tree.x, z: PLACES.tree.z, r: 1.1 }, { x: PLACES.lighthouse.x, z: PLACES.lighthouse.z, r: 1.9 },
  { x: PLACES.rock.x, z: PLACES.rock.z, r: 1.7 }, { x: PLACES.chest.x, z: PLACES.chest.z, r: 1 },
]);

/** Moves a point by a step, keeping it on the island and outside solid props. */
export function walk(point, dx, dz) {
  let next = clampToIsland({ x: point.x + dx, z: point.z + dz });
  for (const o of OBSTACLES) {
    const ox = next.x - o.x, oz = next.z - o.z, d = Math.hypot(ox, oz), min = o.r + .55;
    if (d < min) next = d < 1e-6 ? { x: o.x + min, z: o.z } : { x: o.x + ox / d * min, z: o.z + oz / d * min };
  }
  return clampToIsland(next);
}

export function createBuddyScene() {
  const scene = new THREE.Scene(), root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color('#bfe0e6');
  scene.fog = new THREE.Fog('#dcecdf', 48, 120);
  const unit = new THREE.BoxGeometry(1, 1, 1), materials = new Map(), textures = [];
  const mat = color => { if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color })); return materials.get(color); };
  const box = (parent, color, x, y, z, w, h, d) => { const mesh = new THREE.Mesh(unit, mat(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const group = (x, z, parent = root) => { const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g); return g; };
  const outward = (place, by) => { const l = Math.hypot(place.x, place.z) || 1; return { x: place.x + place.x / l * by, z: place.z + place.z / l * by }; };

  // Ground: one instanced tile per square metre.
  const tiles = [];
  let seed = 20261114; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x++) for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z++) {
    const d = Math.hypot(x, z); if (d > ISLAND_RADIUS + .2) continue;
    const pond = Math.hypot(x - POND.x, z - POND.z) < POND.r;
    tiles.push({ x, z, y: pond ? -.62 : -.5, color: pond ? '#7fc1cf' : d > ISLAND_RADIUS - 2.6 ? ['#ecdcae', '#e6d4a2'][Math.floor(rnd() * 2)] : ['#8fbf78', '#88b871', '#96c57e', '#8cbb74'][Math.floor(rnd() * 4)] });
  }
  const ground = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: '#ffffff' }), tiles.length);
  const matrix = new THREE.Matrix4(), tint = new THREE.Color();
  tiles.forEach((tile, index) => { matrix.makeTranslation(tile.x, tile.y, tile.z); ground.setMatrixAt(index, matrix); ground.setColorAt(index, tint.set(tile.color)); });
  ground.receiveShadow = true; root.add(ground);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(170, 40), new THREE.MeshLambertMaterial({ color: '#7cc3d1' }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.42; root.add(sea);
  for (let index = 0; index < 5; index++) { const cloud = group(-46 + index * 22, -50 + (index % 2) * 14); cloud.position.y = 20 + (index % 3) * 3; for (let j = 0; j < 4; j++) box(cloud, '#ffffff', j * 2, j === 1 ? .6 : 0, 0, 3, 1.2, 2.6).castShadow = false; }

  // Places. Each model sits on its place point; you "arrive" by standing near it.
  const places = {};
  { const g = places.tree = group(PLACES.tree.x, PLACES.tree.z); box(g, '#9a7049', 0, 1.6, 0, 1, 3.2, 1); box(g, '#5f9d58', 0, 4.4, 0, 4.4, 2.6, 4.4); box(g, '#6eac64', 0, 6, 0, 2.8, 1.4, 2.8);
    for (const [x, y, z] of [[2.25, 4, .8], [-2.25, 4.6, -.6], [.9, 3.6, 2.25], [-1, 4.9, -2.25], [2.25, 5, -1.2]]) box(g, '#df5548', x, y, z, .5, .5, .5); }
  { const p = outward(PLACES.boat, 6), g = places.boat = group(p.x, p.z); g.rotation.y = Math.atan2(PLACES.boat.x, PLACES.boat.z) + Math.PI / 2;
    box(g, '#a8774b', 0, .1, 0, 5, .9, 2.2); box(g, '#8f6039', 2.9, .3, 0, .9, 1.1, 1.6); box(g, '#8f6039', -2.9, .3, 0, .9, 1.1, 1.6); box(g, '#7d5633', 0, 2.6, 0, .25, 4.4, .25); box(g, '#f6f1e3', .9, 2.9, 0, 1.6, 2.8, .12); box(g, '#e98a6b', 0, 4.95, 0, .9, .4, .1);
    const pier = group(0, 0); const a = outward(PLACES.boat, 2.4); for (let i = 0; i < 4; i++) { const q = outward(PLACES.boat, 1.2 + i * 1.1); box(pier, '#c69a66', q.x, -.02, q.z, 1.5, .16, 1.5); } pier.userData.end = a; }
  { const g = places.bridge = group(POND.x, POND.z); for (let i = -3; i <= 3; i++) box(g, '#c69a66', i, .12 + (3 - Math.abs(i)) * .09, 0, 1, .2, 2.2); for (const z of [-1.1, 1.1]) { box(g, '#9a7049', 0, .75, z, 6.6, .14, .14); for (const x of [-3, 0, 3]) box(g, '#9a7049', x, .45, z, .2, .9, .2); } }
  { const g = places.lighthouse = group(PLACES.lighthouse.x, PLACES.lighthouse.z); box(g, '#b9b5ac', 0, .3, 0, 3.4, .6, 3.4); for (let i = 0; i < 5; i++) box(g, i % 2 ? '#e0685a' : '#f6f1e3', 0, 1.5 + i * 1.8, 0, 2.6 - i * .2, 1.8, 2.6 - i * .2);
    box(g, '#3f4b56', 0, 10.3, 0, 2.4, .3, 2.4); box(g, '#ffe7a1', 0, 11.2, 0, 1.3, 1.5, 1.3); box(g, '#e0685a', 0, 12.2, 0, 2, .5, 2); }
  { const g = places.sheep = group(PLACES.sheep.x, PLACES.sheep.z); g.userData.sheep = [];
    for (const [x, z, turn] of [[-1.3, .2, .5], [1.2, -.8, -1.1], [.4, 1.6, 2.4]]) { const s = group(x, z, g); s.rotation.y = turn; box(s, '#f6f3ee', 0, .85, 0, 1, .8, 1.5); box(s, '#f0d9cc', 0, 1.05, .95, .62, .6, .5); for (const [lx, lz] of [[-.3, -.5], [.3, -.5], [-.3, .5], [.3, .5]]) box(s, '#5a5048', lx, .25, lz, .2, .5, .2); g.userData.sheep.push(s); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .4; box(g, '#b98d5b', Math.cos(a) * 3.1, .4, Math.sin(a) * 3.1, .22, .8, .22); } }
  { const g = places.flowers = group(PLACES.flowers.x, PLACES.flowers.z); const colors = ['#ef6f66', '#ffd45c', '#8fa9ff', '#f39ac0'];
    for (let i = 0; i < 16; i++) { const a = i * 2.4, r = .5 + (i % 5) * .5, x = Math.cos(a) * r, z = Math.sin(a) * r; box(g, '#5a9a4c', x, .3, z, .12, .6, .12); box(g, colors[i % 4], x, .7, z, .42, .3, .42); } }
  { const g = places.rock = group(PLACES.rock.x, PLACES.rock.z); box(g, '#9b9ca0', 0, 1.1, 0, 3, 2.2, 2.6); box(g, '#a9aaae', .5, 2.5, -.2, 1.8, .9, 1.6); box(g, '#8a8b91', -1.4, .5, .9, 1.2, 1, 1.2); }
  { const g = places.chest = group(PLACES.chest.x, PLACES.chest.z); g.rotation.y = Math.atan2(-PLACES.chest.x, -PLACES.chest.z); box(g, '#a8774b', 0, .45, 0, 1.6, .9, 1.1); box(g, '#8f6039', 0, 1.05, 0, 1.7, .35, 1.2); box(g, '#f2c84b', 0, .75, .58, .3, .36, .1); box(g, '#f2c84b', -.75, .5, 0, .12, 1, 1.14); box(g, '#f2c84b', .75, .5, 0, .12, 1, 1.14); }
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 4 + rnd() * 18, x = Math.cos(a) * r, z = Math.sin(a) * r; if (Object.values(PLACES).some(p => Math.hypot(p.x - x, p.z - z) < 4)) continue; box(root, '#74a862', x, .18, z, .5, .36, .5).castShadow = false; }

  function label(text, color) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96; const g = canvas.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.roundRect(8, 14, 240, 68, 30); g.fill();
    g.fillStyle = color; g.font = '700 44px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false })); sprite.scale.set(2.2, .82, 1); sprite.renderOrder = 5; return sprite;
  }
  function kid({ shirt, hair, pants, name, long }) {
    const g = group(0, 0), body = new THREE.Group(); g.add(body);
    const part = (color, x, y, z, w, h, d) => { const pivot = new THREE.Group(); pivot.position.set(x, y, z); body.add(pivot); box(pivot, color, 0, -h / 2, 0, w, h, d); return pivot; };
    box(body, shirt, 0, 1.35, 0, .9, 1, .5);
    box(body, '#f3cfae', 0, 2.25, 0, .8, .8, .8); box(body, hair, 0, 2.72, -.03, .88, .24, .88); box(body, hair, 0, 2.3, -.42, .88, .7, .1);
    if (long) { box(body, hair, -.45, 2.1, -.1, .1, .9, .6); box(body, hair, .45, 2.1, -.1, .1, .9, .6); }
    box(body, '#2f3a3a', -.2, 2.28, .41, .12, .14, .04); box(body, '#2f3a3a', .2, 2.28, .41, .12, .14, .04); box(body, '#c9776b', 0, 2.02, .41, .26, .07, .04);
    const limbs = [part('#f3cfae', -.6, 1.82, 0, .28, .95, .3), part('#f3cfae', .6, 1.82, 0, .28, .95, .3), part(pants, -.22, .86, 0, .36, .86, .4), part(pants, .22, .86, 0, .36, .86, .4)];
    const tag = name ? label(name, shirt) : null; if (tag) { tag.position.y = 3.6; g.add(tag); }
    return { group: g, body, limbs, phase: 0, bounce: 0 };
  }
  const actors = {
    player: kid({ shirt: '#f2c84b', hair: '#3a3230', pants: '#5c6b8a', name: 'You' }),
    mia: kid({ shirt: BUDDIES.mia.color, hair: '#8a5a33', pants: '#7d6aa8', name: 'Mia', long: true }),
    leo: kid({ shirt: BUDDIES.leo.color, hair: '#d9b25f', pants: '#4f6d52', name: 'Leo' }),
  };
  for (const who of Object.keys(actors)) actors[who].group.position.set(SPAWN[who].x, 0, SPAWN[who].z);

  const marker = new THREE.Group(); marker.visible = false; root.add(marker);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 40), new THREE.MeshBasicMaterial({ color: '#fff3b5', transparent: true, opacity: .85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .06; marker.add(ring);
  const arrow = box(marker, '#ffd45c', 0, 0, 0, .7, .7, .7); arrow.rotation.set(Math.PI / 4, 0, Math.PI / 4); arrow.castShadow = false;
  const apples = new Map(), sparks = [];
  const sun = new THREE.DirectionalLight('#fff0d4', 2); sun.position.set(-22, 36, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 110 }); sun.shadow.normalBias = .05;
  scene.add(new THREE.HemisphereLight('#f1f6ea', '#7d8468', 1.8), sun);
  let clock = 0, markerHeight = 4;
  const ghosts = new Map();

  return {
    scene, root, actors, places, apples, marker, tileCount: tiles.length,
    /** Turns a tall landmark see-through while it stands between the camera and the player. */
    fade(id, on) {
      const place = places[id]; if (!!place.userData.faded === on) return; place.userData.faded = on;
      place.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (!mesh.userData.solid) { mesh.userData.solid = mesh.material; if (!ghosts.has(mesh.material)) ghosts.set(mesh.material, Object.assign(mesh.material.clone(), { transparent: true, opacity: .28, depthWrite: false })); }
        mesh.material = on ? ghosts.get(mesh.userData.solid) : mesh.userData.solid;
      });
    },
    /** Marks the place the current game is about, or hides the marker. */
    focus(id) {
      const place = PLACES[id]; marker.visible = !!place; if (!place) return;
      marker.position.set(place.x, 0, place.z); markerHeight = { lighthouse: 13.6, tree: 7.6, boat: 2.4 }[id] ?? 3.6;
    },
    spawnApple(id, x, z) { if (apples.has(id)) return; const apple = group(x, z); box(apple, '#df5548', 0, .45, 0, .6, .6, .6); box(apple, '#5a9a4c', 0, .85, 0, .12, .22, .12); apples.set(id, apple); },
    removeApple(id) { const apple = apples.get(id); if (apple) { root.remove(apple); apples.delete(id); } },
    setHidden(who, hidden) { actors[who].body.scale.y = hidden ? .55 : 1; actors[who].group.children.forEach(child => { if (child.isSprite) child.visible = !hidden; }); },
    cheer(who = 'player') { const at = actors[who].group.position; for (let i = 0; i < 14; i++) { const s = box(root, ['#ffd45c', '#ef6f66', '#8fa9ff', '#ffffff'][i % 4], at.x, 2.6, at.z, .22, .22, .22); s.castShadow = false; sparks.push({ mesh: s, vx: (rnd() - .5) * 5, vy: 4 + rnd() * 3, vz: (rnd() - .5) * 5, life: 1.1 }); } for (const actor of Object.values(actors)) actor.bounce = .7; },
    /** positions: { player, mia, leo } each { x, z, moving, heading } */
    update(dt, positions) {
      clock += dt;
      for (const who of Object.keys(actors)) {
        const actor = actors[who], p = positions[who]; if (!p) continue;
        actor.group.position.x = p.x; actor.group.position.z = p.z;
        let turn = p.heading - actor.group.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); actor.group.rotation.y += turn * Math.min(1, dt * 12);
        actor.phase = p.moving ? actor.phase + dt * 11 : actor.phase * Math.max(0, 1 - dt * 10);
        const swing = Math.sin(actor.phase) * .75; actor.limbs[0].rotation.x = swing; actor.limbs[1].rotation.x = -swing; actor.limbs[2].rotation.x = -swing; actor.limbs[3].rotation.x = swing;
        actor.bounce = Math.max(0, actor.bounce - dt); actor.group.position.y = Math.abs(Math.sin(actor.bounce * 9)) * .5 * Math.min(1, actor.bounce * 3);
      }
      arrow.position.y = markerHeight + Math.sin(clock * 3) * .35; arrow.rotation.y = clock * 1.5; ring.scale.setScalar(1 + Math.sin(clock * 3) * .06);
      for (const apple of apples.values()) apple.rotation.y = clock * 1.4;
      places.sheep.userData.sheep.forEach((s, i) => { s.position.y = Math.max(0, Math.sin(clock * 1.3 + i * 2)) * .12; });
      for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.life -= dt; s.vy -= 12 * dt; s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt; if (s.life <= 0) { root.remove(s.mesh); sparks.splice(i, 1); } }
    },
    dispose() { unit.dispose(); ground.material.dispose(); sea.geometry.dispose(); sea.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); for (const m of materials.values()) m.dispose(); for (const m of ghosts.values()) m.dispose(); for (const t of textures) t.dispose(); actors.player.group.traverse(o => { if (o.isSprite) o.material.dispose(); }); sun.shadow.map?.dispose(); scene.clear(); },
  };
}

const TALL = [['tree', 3.4], ['lighthouse', 2.2]];

/** Browser wrapper: renderer, follow camera, keyboard/drag/stick input and the frame loop. */
export function createBuddyWorld(canvas, { onFrame = () => null } = {}) {
  const view = canvas.ownerDocument.defaultView;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, view.matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const world = createBuddyScene(), camera = new THREE.PerspectiveCamera(52, 1, .1, 400);
  const player = { ...SPAWN.player, heading: Math.PI, moving: false };
  const keys = new Set(), stick = { x: 0, y: 0 };
  let yaw = 0, drag = null, paused = false, disposed = false, last = 0;
  const KEYMAP = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
  const onKey = event => { if (!(event.code in KEYMAP) || event.target?.closest?.('input,textarea,dialog')) return; if (event.type === 'keydown') keys.add(event.code); else keys.delete(event.code); event.preventDefault(); };
  const clearKeys = () => keys.clear();
  view.addEventListener('keydown', onKey); view.addEventListener('keyup', onKey); view.addEventListener('blur', clearKeys);
  const down = event => { drag = { id: event.pointerId, x: event.clientX }; canvas.setPointerCapture?.(event.pointerId); };
  const move = event => { if (!drag || drag.id !== event.pointerId) return; yaw -= (event.clientX - drag.x) * .006; drag.x = event.clientX; };
  const up = event => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function resize() { const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); }
  const observer = new view.ResizeObserver(resize); observer.observe(canvas); resize();
  renderer.setAnimationLoop(now => {
    if (disposed) return;
    const dt = Math.min(.5, last ? (now - last) / 1000 : 0); last = now;
    // A slow device still plays in real time: long frames are simulated in short steps.
    for (let left = paused ? 0 : dt; left > 1e-4; left -= .1) {
      const step = Math.min(.1, left);
      let x = stick.x, y = stick.y; for (const code of keys) { x += KEYMAP[code][0]; y += KEYMAP[code][1]; }
      const length = Math.hypot(x, y); player.moving = length > .12;
      if (player.moving) {
        const scale = Math.min(1, length) / length * PLAYER_SPEED * step, sin = Math.sin(yaw), cos = Math.cos(yaw);
        // Forward is away from the camera; right is the camera's right.
        const dx = (x * cos - y * sin) * scale, dz = (-x * sin - y * cos) * scale;
        Object.assign(player, walk(player, dx, dz)); player.heading = Math.atan2(dx, dz);
      }
      const positions = onFrame(step, player) || {};
      world.update(step, { ...positions, player });
    }
    const target = new THREE.Vector3(player.x, 1.6, player.z);
    camera.position.lerp(new THREE.Vector3(player.x + Math.sin(yaw) * 13, 9.5, player.z + Math.cos(yaw) * 13), last && !paused ? Math.min(1, dt * 6) : 1);
    camera.lookAt(target);
    for (const [id, radius] of TALL) {
      // Distance from the landmark to the sight line between camera and player, on the ground plane.
      const ax = camera.position.x, az = camera.position.z, bx = player.x - ax, bz = player.z - az, place = PLACES[id];
      const along = Math.min(1, Math.max(0, ((place.x - ax) * bx + (place.z - az) * bz) / (bx * bx + bz * bz || 1)));
      world.fade(id, Math.hypot(place.x - ax - bx * along, place.z - az - bz * along) < radius);
    }
    renderer.render(world.scene, camera);
  });
  const projected = new THREE.Vector3();
  return {
    world, player, camera,
    setStick(x, y) { stick.x = x; stick.y = y; },
    setPaused(value) { paused = !!value; if (paused) { keys.clear(); stick.x = stick.y = 0; } },
    /** Screen position (CSS pixels inside the canvas) above an actor's head, or null when behind the camera. */
    project(who) {
      const at = world.actors[who].group.position; projected.set(at.x, 4.3, at.z).project(camera);
      if (projected.z > 1) return null;
      return { x: (projected.x + 1) / 2 * canvas.clientWidth, y: (1 - projected.y) / 2 * canvas.clientHeight };
    },
    dispose() { if (disposed) return; disposed = true; renderer.setAnimationLoop(null); observer.disconnect(); view.removeEventListener('keydown', onKey); view.removeEventListener('keyup', onKey); view.removeEventListener('blur', clearKeys); world.dispose(); renderer.dispose(); },
  };
}
