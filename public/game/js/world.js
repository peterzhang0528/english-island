// world.js v11 — 「一个下午」：家长用 3 分钟亲手经历孩子在 Minecraft 里的第一课。
// 第一人称开放小世界；屏幕上只留 JJ 的一句话。每一步只点一下：推门 → 敲树 3 下得原木 → 工作台自动拼出木板和木棍
// → 捡 3 块石头 → 工作台拼出石斧 → 砍 3 下树倒 → 傍晚，记录卡。所有几何、贴图、音效都在代码里生成。
import * as THREE from "./vendor/three.module.min.js";
import { createTextures } from "./textures.js";
import { sfx } from "./sfx.js";
import { voice } from "./voice.js";

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), canvas = $("#world");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = matchMedia("(pointer: coarse)").matches;
const ZH = { DOOR: "门", TREE: "树", LOG: "原木", PLANK: "木板", STICK: "木棍", STONE: "石头", AXE: "斧头", CHOP: "砍", TIMBER: "树倒啦", FLOWER: "花", SHEEP: "羊", WATER: "水", CLOUD: "云", SUN: "太阳", GRASS: "草", TABLE: "工作台" };
const ORDER = ["DOOR", "TREE", "LOG", "PLANK", "STICK", "STONE", "AXE", "CHOP", "TIMBER"];
let paused = false, pausedAt = 0;
const state = { step: 0, words: [], sentences: [], hits: 0, stones: 0, chops: 0, busy: false, lastAct: performance.now(), started: 0, current: null };

// ---------- 渲染器 ----------
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" }); }
catch (e) { stage.classList.add("no-webgl"); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 240); scene.add(camera);
const T = createTextures(THREE);

// 天空：顶点着色大球；paintSky(k) 从白天(0)过渡到傍晚(1)
const DAY = { top: "#5aa9ff", mid: "#dcefff", low: "#fff0d6", fog: "#dcefff", hemiSky: "#cfe6ff", hemiGround: "#6f8f4a", sun: "#fff3dc", sunI: 2.1 };
const DUSK = { top: "#6d6bd6", mid: "#ffb48a", low: "#ffd79a", fog: "#ffc39a", hemiSky: "#e7b6c8", hemiGround: "#6a5a3a", sun: "#ffb46a", sunI: 1.6 };
const skyGeo = new THREE.SphereGeometry(160, 24, 16); skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })); scene.add(sky);
scene.fog = new THREE.Fog(DAY.fog, 28, 95);
const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI); sun.castShadow = true; scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
const SUN_OFF = new THREE.Vector3(-20, 30, 12), SUN_OFF_DUSK = new THREE.Vector3(-34, 11, 8);
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
let dusk = 0;
function paintSky(k) {
  dusk = k; const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
  const top = mix(DAY.top, DUSK.top, k), mid = mix(DAY.mid, DUSK.mid, k), low = mix(DAY.low, DUSK.low, k);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 160; const c = y > 0 ? mid.clone().lerp(top, Math.min(1, y * 1.6)) : mid.clone().lerp(low, Math.min(1, -y * 2.5)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true; scene.fog.color.copy(mix(DAY.fog, DUSK.fog, k));
  hemi.color.copy(mix(DAY.hemiSky, DUSK.hemiSky, k)); hemi.groundColor.copy(mix(DAY.hemiGround, DUSK.hemiGround, k));
  sun.color.copy(mix(DAY.sun, DUSK.sun, k)); sun.intensity = DAY.sunI + (DUSK.sunI - DAY.sunI) * k;
}
paintSky(0);

// ---------- 材质 ----------
const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ map, ...extra });
const M = {
  grass: [lam(T.grassSide), lam(T.grassSide), lam(T.grassTop), lam(T.dirt), lam(T.grassSide), lam(T.grassSide)],
  dirt: lam(T.dirt), stone: lam(T.stone), deep: lam(T.deep), planks: lam(T.planks), leaves: lam(T.leaves),
  log: [lam(T.logSide), lam(T.logSide), lam(T.logTop), lam(T.logTop), lam(T.logSide), lam(T.logSide)], logSide: lam(T.logSide),
  table: [lam(T.craftSide), lam(T.craftSide), lam(T.craftTop), lam(T.planks), lam(T.craftSide), lam(T.craftSide)],
  cloud: new THREE.MeshBasicMaterial({ color: "#ffffff" }), water: lam(T.water, { transparent: true, opacity: 0.82 }), door: lam(T.door),
  wool: lam(T.wool), face: lam(T.sheepFace), skin: new THREE.MeshLambertMaterial({ color: "#efc3a0" }),
  flowerR: lam(T.flowerRed, { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), flowerY: lam(T.flowerYellow, { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), flowerB: lam(T.flowerBlue, { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  tall: lam(T.tallGrass, { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }), wing: lam(T.butterfly, { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  stick: new THREE.MeshLambertMaterial({ color: "#8a5a33" }), iron: new THREE.MeshLambertMaterial({ color: "#9b9ca0" }), strap: new THREE.MeshLambertMaterial({ color: "#4a2f17" }),
};
// 风：草丛和花随时间摆动（顶点着色器里按 uv.y 加权，根部不动）
const uT = { value: 0 };
for (const m of [M.tall, M.flowerR, M.flowerY, M.flowerB]) m.onBeforeCompile = (sh) => { sh.uniforms.uT = uT;
  sh.vertexShader = sh.vertexShader.replace("void main() {", "uniform float uT;\nvoid main() {").replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed.x += sin(uT * 1.7 + position.x * 0.8 + position.z * 1.1) * 0.07 * uv.y;"); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
const hot = []; const world = new THREE.Group(); scene.add(world);
const tag = (o, kind, word, extra = {}) => { o.userData = { kind, word, ...extra }; hot.push(o); return o; };
let seed = 11; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

// ---------- 地形 ----------
const SIZE = 24, H = {};
const hill = (x, z) => { const d = Math.hypot(x, z + 6); const n = Math.sin(x * 0.33 + 1.3) * Math.cos(z * 0.27 - 0.7) + Math.sin(x * 0.11 - z * 0.17) * 1.4; return d < 11 ? 0 : Math.max(0, Math.min(5, Math.round((n + 1.3) * Math.min(1, (d - 11) / 9)))); };
const POND = new Set(); for (let x = 5; x <= 11; x++) for (let z = -15; z <= -9; z++) if (Math.hypot(x - 8, z + 12) < 3.3) POND.add(`${x},${z}`);
const PATH = new Set(["0,1", "0,0", "0,-1", "-1,-2", "-1,-3", "-2,-4", "1,-2", "1,-3", "2,-4", "3,-5", "4,-6", "5,-7"]);
for (let x = -SIZE; x <= SIZE; x++) for (let z = -SIZE; z <= SIZE; z++) H[`${x},${z}`] = POND.has(`${x},${z}`) ? -1 : hill(x, z);
const hAt = (x, z) => H[`${x},${z}`] ?? 0;
const L = { grass: [], dirt: [], water: [], path: [] };
for (let x = -SIZE; x <= SIZE; x++) for (let z = -SIZE; z <= SIZE; z++) {
  const h = hAt(x, z), key = `${x},${z}`;
  if (POND.has(key)) { L.water.push([x, -0.1, z]); L.dirt.push([x, -1, z]); continue; }
  (PATH.has(key) ? L.path : L.grass).push([x, h, z]);
  const low = Math.min(hAt(x + 1, z), hAt(x - 1, z), hAt(x, z + 1), hAt(x, z - 1), Math.abs(x) === SIZE || Math.abs(z) === SIZE ? -3 : h);
  for (let y = h - 1; y >= Math.max(-3, low); y--) L.dirt.push([x, y, z]);
}
const instanced = (list, material, kind, word, geo = BOX, parent = world) => {
  const im = new THREE.InstancedMesh(geo, material, list.length), m = new THREE.Matrix4();
  list.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true; parent.add(im); if (kind) tag(im, kind, word); return im;
};
instanced(L.grass, M.grass, "block", "GRASS"); instanced(L.dirt, M.dirt); instanced(L.path, M.dirt, "block", "GRASS");
instanced(L.water, M.water, "block", "WATER", new THREE.BoxGeometry(1, 0.8, 1));
const groundY = (x, z) => hAt(Math.round(x), Math.round(z)) + 0.5;
const block = (mat, x, y, z, kind, word, extra, parent = world) => { const o = new THREE.Mesh(BOX, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); if (kind) tag(o, kind, word, extra); return o; };
function mergeGeos(geos) { const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g)), out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) { const size = parts[0].attributes[name].itemSize, arr = new Float32Array(parts.reduce((s, p) => s + p.attributes[name].array.length, 0)); let o = 0; for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; } out.setAttribute(name, new THREE.BufferAttribute(arr, size)); }
  return out; }
function merged(list, mat, kind, word, extra = {}, geo = BOX, parent = world) { if (!list.length) return null; const o = new THREE.Mesh(mergeGeos(list.map(([x, y, z]) => geo.clone().translate(x, y, z))), mat); o.castShadow = o.receiveShadow = true; parent.add(o); if (kind) tag(o, kind, word, { merged: true, ...extra }); else o.userData.merged = true; return o; }
const cross = (() => { const p = new THREE.PlaneGeometry(1, 1), a = p.clone().rotateY(Math.PI / 4), b = p.clone().rotateY(-Math.PI / 4), g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a.attributes.position.array, ...b.attributes.position.array], 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute([...a.attributes.uv.array, ...b.attributes.uv.array], 2));
  g.setIndex([...a.index.array, ...b.index.array.map((i) => i + 4)]); g.computeVertexNormals(); return g; })();

// ---------- 树：A 是任务树（整组可倒），其余风景 ----------
const leafShape = (h) => { const out = []; const top = h - 1;
  for (let dy = -1; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && (dy === 0 || rnd() < 0.5)) continue; if (!dx && !dz) continue; out.push([dx, top + dy, dz]); }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push([dx, top + 1, dz]);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.push([dx, top + 2, dz]); return out; };
const treeA = new THREE.Group(); treeA.position.set(-3, hAt(-3, -6) + 0.5, -6); world.add(treeA);
treeA.trunk = Array.from({ length: 5 }, (_, y) => block(M.log, 0, 0.5 + y, 0, "trunk", "TREE", {}, treeA));
treeA.leaves = instanced(leafShape(5).map(([x, y, z]) => [x, y + 0.5, z]), M.leaves, "leaves", "TREE", BOX, treeA);
for (const [x, z, h] of [[-9, -11, 5], [7, -21, 6], [-15, -6, 4], [13, -8, 5], [-7, -19, 6], [1, -25, 5], [16, -17, 4], [-18, -16, 5], [-12, 3, 4], [12, 3, 5], [-20, -1, 5], [19, -4, 4], [-5, -27, 6], [22, -12, 5]]) {
  const base = hAt(x, z) + 1; merged(Array.from({ length: h }, (_, y) => [x, base + y, z]), M.logSide, "trunk", "TREE");
  instanced(leafShape(h).map(([dx, dy, dz]) => [x + dx, base + dy, z + dz]), M.leaves, "leaves", "TREE");
}
world.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.map === T.logSide)) o.receiveShadow = false; });

// 工作台、石头、花、草丛
const table = block(M.table, 2, groundY(2, -5) + 0.5, -5, "table", "TABLE");
const TABLE_TOP = new THREE.Vector3(2, groundY(2, -5) + 1.0, -5);
const rocks = [[6, -8], [7, -8], [6, -9]].map(([x, z]) => block(M.stone, x, groundY(x, z) + 0.5, z, "rock", "STONE"));
rocks.push(block(M.stone, 6, groundY(6, -8) + 1.5, -8, "rock", "STONE"));
{ const FL = { R: [], Y: [], B: [] }, TG = [];
  for (let i = 0; i < 70; i++) { const x = Math.round(rnd() * 40 - 20), z = Math.round(-rnd() * 28 + 1); if (POND.has(`${x},${z}`) || PATH.has(`${x},${z}`) || (x > -5 && x < 9 && z > -11 && z < 0) || (Math.abs(x) < 4 && z > -1)) continue; FL[["R", "Y", "B"][Math.floor(rnd() * 3)]].push([x, groundY(x, z) + 0.5, z]); }
  for (let i = 0; i < 260; i++) { const x = Math.round(rnd() * 44 - 22), z = Math.round(-rnd() * 40 + 6); if (POND.has(`${x},${z}`) || PATH.has(`${x},${z}`) || (Math.abs(x - 2) < 1.6 && Math.abs(z + 5) < 1.6) || (Math.abs(x) < 4 && z > -1) || (Math.abs(x - 6.5) < 1.6 && Math.abs(z + 8.5) < 1.6)) continue; TG.push([x + rnd() * 0.4 - 0.2, groundY(x, z) + 0.35, z + rnd() * 0.4 - 0.2]); }
  merged(FL.R, M.flowerR, "flower", "FLOWER", {}, cross); merged(FL.Y, M.flowerY, "flower", "FLOWER", {}, cross); merged(FL.B, M.flowerB, "flower", "FLOWER", {}, cross);
  const tg = merged(TG, M.tall, "block", "GRASS", {}, cross.clone().scale(0.8, 0.8, 0.8)); tg.castShadow = false; }

// 门：立在草地上的一扇门（童话式入口，推开就走进去）
const hinge = new THREE.Group(); hinge.position.set(-0.5, 1.5, 2); world.add(hinge);
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.18), [M.planks, M.planks, M.planks, M.planks, M.door, M.door]); door.position.x = 0.5; door.castShadow = true; hinge.add(door); tag(door, "door", "DOOR");
for (const y of [1, 2]) { block(M.log, -1, y, 2); block(M.log, 1, y, 2); } for (const x of [-1, 0, 1]) block(M.planks, x, 3, 2);

// 羊、云、太阳、蝴蝶、花粉
const sheepList = [];
function sheep(x, z) {
  const g = new THREE.Group(); g.position.set(x, groundY(x, z) + 0.75, z); world.add(g);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.8), M.wool); body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.5), [M.face, M.wool, M.wool, M.wool, M.wool, M.wool]); head.position.set(0.75, 0.3, 0); head.castShadow = true; g.add(head);
  const legs = [-0.4, 0.4].flatMap((lx) => [-0.25, 0.25].map((lz) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), M.skin); l.position.set(lx, -0.6, lz); g.add(l); return l; }));
  [body, head, ...legs].forEach((m) => tag(m, "sheep", "SHEEP"));
  sheepList.push({ g, legs, head, home: g.position.clone(), target: g.position.clone(), wait: rnd() * 2, phase: rnd() * 6 });
}
sheep(4, -10); sheep(-8, -13); sheep(10, -5);
// 傍晚的悬念：远处冒出一只饿肚子的僵尸（自绘方块小人），引出"明天给它做蛋糕"——和真实陪玩录像是同一个任务
const zombie = (() => { const g = new THREE.Group(); const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const fc = document.createElement("canvas"); fc.width = fc.height = 8; const fx = fc.getContext("2d"); fx.fillStyle = "#5E9A4A"; fx.fillRect(0, 0, 8, 8); fx.fillStyle = "#3F6E31"; fx.fillRect(0, 0, 8, 2); fx.fillStyle = "#14240F"; fx.fillRect(1, 3, 2, 1); fx.fillRect(5, 3, 2, 1); fx.fillStyle = "#2C4A22"; fx.fillRect(3, 5, 2, 1);
  const ft = new THREE.CanvasTexture(fc); ft.magFilter = THREE.NearestFilter; ft.colorSpace = THREE.SRGBColorSpace; const skin = lam("#5E9A4A");
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), [skin, skin, lam("#3F6E31"), skin, new THREE.MeshLambertMaterial({ map: ft }), skin]); head.position.y = 1.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), lam("#2F8F8A")); body.position.y = 0.92;
  const legs = [-0.16, 0.16].map((x) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.56, 0.32), lam("#3B4B9C")); l.position.set(x, 0.28, 0); return l; });
  const arms = [-0.46, 0.46].map((x) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.78), skin); a.position.set(x, 1.12, 0.36); return a; });
  [head, body, ...legs, ...arms].forEach((m) => { m.castShadow = true; g.add(m); }); g.visible = false; g.scale.setScalar(1.25); return g; })();
scene.add(zombie);
const clouds = [], CLOUD_BOX = new THREE.BoxGeometry(2.4, 0.7, 1.9);
for (let i = 0; i < 8; i++) { const g = new THREE.Group(); const n = 7 + Math.floor(rnd() * 6), puffs = []; for (let k = 0; k < n; k++) puffs.push([rnd() * 6 - 3, rnd() * 0.4, rnd() * 3.4 - 1.7]);
  const m = merged(puffs, M.cloud, "cloud", "CLOUD", {}, CLOUD_BOX, g); m.castShadow = false; g.position.set(-46 + i * 13, 18 + rnd() * 6, -34 + rnd() * 34); world.add(g); clouds.push({ g, v: 0.3 + rnd() * 0.25 }); }
const sunMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 0.3), new THREE.MeshBasicMaterial({ color: "#fff6c4", fog: false })); sunMesh.position.set(-60, 64, -74); scene.add(sunMesh); tag(sunMesh, "sun", "SUN");
const flies = [];
for (let i = 0; i < 4; i++) { const g = new THREE.Group(); const w = new THREE.PlaneGeometry(0.28, 0.28);
  const l = new THREE.Mesh(w, M.wing), r = new THREE.Mesh(w, M.wing); l.position.x = -0.14; r.position.x = 0.14; r.scale.x = -1; const lp = new THREE.Group(), rp = new THREE.Group(); lp.add(l); rp.add(r); g.add(lp, rp); g.rotation.x = -Math.PI / 3;
  world.add(g); flies.push({ g, lp, rp, c: new THREE.Vector3(-4 + rnd() * 10, 1.4 + rnd(), -4 - rnd() * 7), a: rnd() * 6, s: 0.5 + rnd() * 0.4 }); }
const pollen = (() => { const n = 240, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = rnd() * 36 - 18; p[i * 3 + 1] = rnd() * 7; p[i * 3 + 2] = -rnd() * 28 + 4; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: "#fff2b8", size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false })); world.add(pts); return pts; })();

// 光环标记、裂纹、手与斧头
const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 40), new THREE.MeshBasicMaterial({ color: "#FFC52C", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
let ringAt = null; const ringOn = (o, s = 1) => { ringAt = o ? { o, s } : null; ring.visible = !!o; };
const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ map: T.cracks[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); crack.visible = false; scene.add(crack);
function axeModel(scale = 1) { const g = new THREE.Group();
  const bx = (w, h, d, mat, x, y, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  bx(0.1, 0.96, 0.1, M.stick, 0, 0.14);                 // 木柄
  bx(0.12, 0.08, 0.12, M.strap, 0, -0.3);               // 柄尾
  bx(0.46, 0.2, 0.2, M.stone, 0.05, 0.6);               // 斧头主体（石头）
  bx(0.22, 0.42, 0.17, M.stone, 0.24, 0.47);            // 斧刃（向下延伸）
  bx(0.14, 0.14, 0.14, M.stone, 0.3, 0.24);             // 刃尖收窄
  bx(0.12, 0.16, 0.2, M.stone, -0.22, 0.6);             // 斧背
  bx(0.14, 0.07, 0.14, M.strap, 0, 0.46);               // 绑带上
  bx(0.14, 0.07, 0.14, M.strap, 0, 0.72);               // 绑带下
  g.scale.setScalar(scale); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; }
const hand = new THREE.Group(); hand.position.set(0.46, -0.42, -0.9); hand.rotation.set(0.3, -0.5, 0); hand.visible = false; camera.add(hand);
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), M.skin); arm.position.z = 0.1; hand.add(arm);
const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.26), new THREE.MeshLambertMaterial({ color: "#2D8CFF" })); sleeve.position.z = 0.42; hand.add(sleeve);
const handAxe = axeModel(0.9); handAxe.position.set(0, 0.02, -0.2); handAxe.rotation.set(0.2, 0, -0.1); handAxe.visible = false; hand.add(handAxe);

// ---------- 补间、特效 ----------
const tweens = [];
const ease = { out: (k) => 1 - Math.pow(1 - k, 3), inout: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), in: (k) => k * k * k, back: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) };
function tween(dur, fn, { ease: e = ease.inout, done, delay = 0 } = {}) {
  return new Promise((res) => { const d = reduced ? Math.min(dur, 0.25) : dur; tweens.push({ t0: performance.now() + delay * 1000, d: d * 1000, fn, e, done: () => { done?.(); res(); } }); });
}
function updateTweens(now) { for (let i = tweens.length - 1; i >= 0; i--) { const w = tweens[i]; if (now < w.t0) continue; const raw = Math.min(1, (now - w.t0) / w.d); w.fn(w.e(raw), raw); if (raw >= 1) { tweens.splice(i, 1); w.done(); } } }
const wait = (s) => new Promise((resolve) => {
  let remaining = (reduced ? Math.min(s, 0.2) : s) * 1000, previous = performance.now();
  const tick = () => { const now = performance.now(); if (!paused) remaining -= now - previous; previous = now; if (remaining <= 0 && !paused) resolve(); else setTimeout(tick, 35); }; tick();
});
const fx = []; const CHIP = new THREE.BoxGeometry(0.14, 0.14, 0.14);
function chips(pos, mat, n = 10, spread = 2.6) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(CHIP, mat); m.position.copy(pos); scene.add(m);
  fx.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * 2.6 + 1, (Math.random() - 0.5) * spread), life: 0.9 + Math.random() * 0.5, spin: Math.random() * 8 }); } }
function updateFx(dt) { for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.life -= dt; f.v.y -= 9 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * dt; f.m.scale.setScalar(Math.max(0.01, Math.min(1, f.life * 2)));
  if (f.life <= 0) { scene.remove(f.m); fx.splice(i, 1); } } }
function shake(obj, amp = 0.08, dur = 0.35) { const o = obj.position.clone(); return tween(dur, (k, raw) => { const a = amp * (1 - raw); obj.position.set(o.x + (Math.random() - 0.5) * a * 2, o.y, o.z + (Math.random() - 0.5) * a * 2); }, { ease: (k) => k, done: () => obj.position.copy(o) }); }
// 单词从动作发生处冒出来：3D 精灵（Nunito 大字 + 中文），上浮后淡出
function wordSprite(en, zh, pos) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256; const g = c.getContext("2d"); g.textAlign = "center"; g.lineJoin = "round";
  g.font = '900 108px Nunito, "PingFang SC", sans-serif'; g.lineWidth = 16; g.strokeStyle = "rgba(20,30,50,.85)"; g.strokeText(en, 256, 128); g.fillStyle = "#FFD54A"; g.fillText(en, 256, 128);
  g.font = '700 54px "PingFang SC", "Microsoft YaHei", sans-serif'; g.lineWidth = 12; g.strokeText(zh, 256, 206); g.fillStyle = "#fff"; g.fillText(zh, 256, 206);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.position.copy(pos); s.renderOrder = 10;
  const d = camera.position.distanceTo(pos), sc = Math.max(1.2, Math.min(3.2, d * 0.42)) * (innerWidth < innerHeight ? 0.62 : 1); s.scale.set(sc, sc / 2, 1); s.center.set(0.5, 0); scene.add(s);
  tween(1.7, (k, raw) => { s.position.y = pos.y + k * 1.1; s.material.opacity = raw < 0.6 ? 1 : 1 - (raw - 0.6) / 0.4; const b = raw < 0.15 ? ease.back(raw / 0.15) : 1; s.scale.set(sc * b, (sc / 2) * b, 1); }, { ease: ease.out, done: () => { scene.remove(s); t.dispose(); } });
}
// 小方块从 from 飞到镜头前再缩没（“捡到了”）
function flyToPocket(mat, from, geo = BOX, scale = 0.42) {
  const m = new THREE.Mesh(geo, mat); m.scale.setScalar(scale); m.position.copy(from); scene.add(m); const p0 = from.clone();
  return tween(0.8, (k, raw) => { const to = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.9)); to.y -= 0.35 - raw * 0.5; m.position.lerpVectors(p0, to, k); m.position.y += Math.sin(raw * Math.PI) * 0.8; m.rotation.y += 0.15; m.rotation.x += 0.1; m.scale.setScalar(scale * (1 - Math.max(0, raw - 0.75) * 4)); }, { ease: ease.inout, done: () => scene.remove(m) });
}
function swing(withAxe) { hand.visible = true; handAxe.visible = !!withAxe; arm.visible = sleeve.visible = true; const r0 = hand.rotation.x;
  return tween(withAxe ? 0.32 : 0.28, (k, raw) => { hand.rotation.x = r0 + Math.sin(raw * Math.PI) * -0.9; hand.position.z = -0.9 - Math.sin(raw * Math.PI) * 0.25; }, { ease: (k) => k, done: () => { hand.rotation.x = r0; hand.position.z = -0.9; hand.visible = false; } }); }

// ---------- 镜头 ----------
const EYE = 1.62;
const SHOTS = {
  door: { pos: [0.7, EYE, 7.8], look: [0, 1.7, 2], fov: 52, back: 0.35 },
  inside: { pos: [0, EYE, -1.4], look: [-1.5, 1.5, -6], fov: 60, walk: true },
  tree: { pos: [0.3, EYE, -1.5], look: [-3, 1.9, -6], fov: 60, walk: true, back: 0.35 },
  table: { pos: [2, EYE + 0.05, -2.1], look: [2, 1.35, -5], fov: 58, walk: true, back: 0.4 },
  rocks: { pos: [3.8, EYE, -5.4], look: [6.4, 1.2, -8.4], fov: 62, walk: true, back: 0.5 },
  chop: { pos: [0.5, EYE, -1.6], look: [-3, 2.2, -6], fov: 62, walk: true, back: 0.4 },
  final: { pos: [6, 6.5, 2.5], look: [-2, 1.5, -8], fov: 55, orbit: true },
};
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60, yaw: 0, pitch: 0, orbit: false, bob: 0, shot: null, sway: 0 };
const portrait = () => camera.aspect < 0.85;
const shotVec = (s) => { const pos = new THREE.Vector3(...s.pos), look = new THREE.Vector3(...s.look); if (portrait() && s.back) { const d = pos.clone().sub(look); d.y = 0; pos.add(d.multiplyScalar(s.back)); } return { pos, look, fov: s.fov + (portrait() ? 14 : 0) }; };
function goShot(name, dur = 1.9) {
  const s = SHOTS[name], to = shotVec(s), from = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov }, yaw0 = cam.yaw, pitch0 = cam.pitch; cam.shot = name; cam.orbit = false;
  const dist = from.pos.distanceTo(to.pos);
  return tween(dur, (k, raw) => { cam.pos.lerpVectors(from.pos, to.pos, k); cam.look.lerpVectors(from.look, to.look, k); cam.fov = from.fov + (to.fov - from.fov) * k; cam.yaw = yaw0 * (1 - k); cam.pitch = pitch0 * (1 - k);
    cam.bob = s.walk && !reduced ? Math.abs(Math.sin(raw * Math.PI * dist * 0.9)) * 0.05 * Math.sin(raw * Math.PI) : 0; }, { done: () => { cam.bob = 0; cam.orbit = !!s.orbit && !reduced; } });
}
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3();
function applyCamera(t) {
  if (cam.orbit || SHOTS[cam.shot]?.orbit) { const p = cam.pos.clone().sub(cam.look).applyAxisAngle(UP, cam.yaw).add(cam.look); camera.position.copy(p); camera.lookAt(cam.look); }
  else { const dir = cam.look.clone().sub(cam.pos).applyAxisAngle(UP, cam.yaw); RIGHT.crossVectors(dir, UP).normalize(); dir.applyAxisAngle(RIGHT, cam.pitch); camera.position.copy(cam.pos); camera.position.y += cam.bob + (state.step === 0 && !reduced ? Math.sin(t * 0.7) * 0.03 : 0); camera.lookAt(camera.position.clone().add(dir)); }
  camera.fov = cam.fov; camera.updateProjectionMatrix();
}
{ const s = shotVec(SHOTS.door); cam.pos.copy(s.pos); cam.look.copy(s.look); cam.fov = s.fov; cam.shot = "door"; }

// ---------- 语音：预生成的 JJ 配音（js/voice.js + audio/），说完才 resolve，用来给剧情定节奏 ----------
function speak(text, _rate = 0.92, { interrupt = false } = {}) { return voice.say(text, { interrupt }); }
function stopSpeaking() { voice.stop(); }
// ---------- 屏幕上的一句话、词袋 ----------
const ui = { say: $("#say"), en: $("#say-en"), zh: $("#say-zh"), pocket: $("#pocket"), title: $("#title"), summary: $("#summary") };
function say(en, zh, { remember = true, speakIt = true, interrupt = false } = {}) {
  ui.en.textContent = en; ui.zh.textContent = zh; ui.say.classList.remove("bump"); void ui.say.offsetWidth; ui.say.classList.add("bump"); ui.say.hidden = false;
  state.current = { en, zh }; if (remember && !state.sentences.includes(en)) state.sentences.push(en); return speakIt ? speak(en, 0.92, { interrupt }) : Promise.resolve();
}
function learn(word, pos, { speakIt = true } = {}) {
  const fresh = !state.words.includes(word); if (fresh) state.words.push(word);
  if (pos) wordSprite(word, ZH[word] || "", pos.clone()); if (fresh) { sfx.pop(); addChip(word); }
  if (speakIt) speak(word.toLowerCase(), 0.85, { interrupt: true }); return fresh;
}
function addChip(word) { const li = document.createElement("li"); if (T.icons[word]) { const img = document.createElement("img"); img.src = T.icons[word].toDataURL(); img.alt = ""; li.append(img); }
  const b = document.createElement("b"); b.textContent = word; const i = document.createElement("i"); i.textContent = ZH[word] || ""; li.append(b, i); li.dataset.say = word.toLowerCase(); li.setAttribute("role", "button"); li.tabIndex = 0; ui.pocket.append(li); ui.pocket.hidden = false; }
ui.pocket.addEventListener("click", (e) => { const li = e.target.closest("[data-say]"); if (li) speak(li.dataset.say, 0.85, { interrupt: true }); });
$("#say-spk").addEventListener("click", () => { if (state.current) speak(state.current.en, 0.9, { interrupt: true }); });

// ---------- 得到产物：切到纯色背景，物品转着发金光，单词念两遍（像游戏里拿到神器） ----------
const lootScene = new THREE.Scene(); lootScene.background = new THREE.Color("#1B2E5C");
const lootCam = new THREE.PerspectiveCamera(22, 1, 0.1, 40); lootCam.position.set(0, 0.55, 9.3); lootCam.lookAt(0, 0.55, 0);
lootScene.add(new THREE.HemisphereLight("#fff8e0", "#4a3a14", 1.6)); { const k = new THREE.DirectionalLight("#ffffff", 2.4); k.position.set(2, 3, 5); lootScene.add(k); }
const radialTex = (size, draw) => { const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); g.translate(size / 2, size / 2); draw(g, size / 2); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const raysTex = radialTex(1024, (g, r) => { const grad = g.createRadialGradient(0, 0, r * 0.08, 0, 0, r); grad.addColorStop(0, "rgba(255,214,74,.95)"); grad.addColorStop(0.4, "rgba(255,214,74,.4)"); grad.addColorStop(1, "rgba(255,214,74,0)"); g.fillStyle = grad;
  for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, (i * Math.PI) / 9, (i * Math.PI) / 9 + Math.PI / 18); g.closePath(); g.fill(); } });
const glowTex = radialTex(256, (g, r) => { const grad = g.createRadialGradient(0, 0, 0, 0, 0, r); grad.addColorStop(0, "rgba(255,245,200,1)"); grad.addColorStop(0.45, "rgba(255,214,74,.5)"); grad.addColorStop(1, "rgba(255,214,74,0)"); g.fillStyle = grad; g.fillRect(-r, -r, 2 * r, 2 * r); });
const lootRays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: raysTex, transparent: true, depthWrite: false })); lootRays.position.set(0, 0.55, -1.5); lootScene.add(lootRays);
const lootGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false })); lootGlow.scale.setScalar(3.4); lootGlow.position.set(0, 0.55, -0.8); lootScene.add(lootGlow);
const lootHold = new THREE.Group(); lootHold.position.y = 0.55; lootScene.add(lootHold);
// 合成格：像游戏里的 3×3 配方表，配料按真实配方摆好，再聚到中间变成产物
const GRID = 1.08;
const gridTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 384; const g = c.getContext("2d"); const cell = 128, pad = 8;
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) { g.fillStyle = "#101E40"; g.fillRect(q * cell + pad, r * cell + pad, cell - 2 * pad, cell - 2 * pad); g.fillStyle = "#2C4578"; g.fillRect(q * cell + pad, r * cell + pad, cell - 2 * pad, 6); g.fillRect(q * cell + pad, r * cell + pad, 6, cell - 2 * pad); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
const lootRig = new THREE.Group(); lootRig.visible = false; lootScene.add(lootRig);   // 配方表 + 箭头 + 产物槽，桌面横排、手机竖排
const lootGrid = new THREE.Mesh(new THREE.PlaneGeometry(3 * GRID, 3 * GRID), new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })); lootGrid.position.z = -0.3;
const gridBox = new THREE.Group(); gridBox.add(lootGrid); lootRig.add(gridBox);
const lootIn = new THREE.Group(); gridBox.add(lootIn);
const cellPos = (col, row) => new THREE.Vector3((col - 1) * GRID, (1 - row) * GRID, 0);
const arrowTex = (() => { const c = document.createElement("canvas"); c.width = 192; c.height = 96; const g = c.getContext("2d"); g.fillStyle = "#FFD54A"; g.fillRect(0, 36, 120, 24); for (let i = 0; i < 4; i++) g.fillRect(108 + i * 18, 12 + i * 12, 18, 72 - i * 24); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
const lootArrow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false })); lootRig.add(lootArrow);
const slotTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.fillStyle = "#101E40"; g.fillRect(4, 4, 120, 120); g.fillStyle = "#FFD54A"; g.fillRect(4, 4, 120, 6); g.fillRect(4, 4, 6, 120); g.fillRect(4, 118, 120, 6); g.fillRect(118, 4, 6, 120); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
const lootSlot = new THREE.Mesh(new THREE.PlaneGeometry(GRID * 1.15, GRID * 1.15), new THREE.MeshBasicMaterial({ map: slotTex, transparent: true, depthWrite: false })); lootSlot.position.z = -0.3;
const slotBox = new THREE.Group(); slotBox.add(lootSlot); lootRig.add(slotBox);
const slotShadow = new THREE.Group(); slotBox.add(slotShadow);
function layoutLoot() { const mob = camera.aspect < 1, gs = mob ? 0.68 : 0.9;
  gridBox.position.set(mob ? 0 : -1.3, 0.55 + (mob ? 0.78 : 0), 0); gridBox.scale.setScalar(gs);
  lootArrow.position.set(mob ? 0 : 0.62, 0.55 + (mob ? -1.2 : 0), -0.1); lootArrow.rotation.z = mob ? -Math.PI / 2 : 0; lootArrow.scale.setScalar(gs);
  slotBox.position.set(mob ? 0 : 1.6, 0.55 + (mob ? -2.0 : 0), 0); slotBox.scale.setScalar(gs); return gs; }
let lootFade = 0;
const silhouette = (mesh) => { const g = mesh.clone(true); const dark = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.45 }); g.traverse((o) => { if (o.isMesh) o.material = dark; }); return g; };
const sparkTex = radialTex(64, (g, r) => { const grad = g.createRadialGradient(0, 0, 0, 0, 0, r); grad.addColorStop(0, "rgba(255,250,220,1)"); grad.addColorStop(0.5, "rgba(255,214,74,.6)"); grad.addColorStop(1, "rgba(255,214,74,0)"); g.fillStyle = grad; g.fillRect(-r, -r, 2 * r, 2 * r); });
const sparks = new THREE.Group();
for (let i = 0; i < 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false })); sp.userData = { a: (i / 16) * Math.PI * 2, r: 1.5 + (i % 4) * 0.3, v: 0.4 + (i % 3) * 0.2, ph: i * 0.7 }; sp.scale.setScalar(0.18 + (i % 3) * 0.06); sparks.add(sp); }
lootScene.add(sparks);
let lootOn = false;
const lootUi = $("#loot"), flash = $("#flash");
async function reveal(word, mesh, sentence = null, recipe = null) {
  // 仪式：白闪 →（有配方：配料按格子一个个蹦出来，再吸到中间，闪一下）→ 东西慢慢转出来 → 大字弹出、JJ 念一遍 → 中文浮现 → 停一拍 → 白闪回世界 → 解释一句
  const w = word.toLowerCase();
  $("#loot-en").textContent = word; $("#loot-zh").textContent = ZH[word] || ""; lootUi.classList.remove("in", "zh"); lootUi.hidden = true;
  stopSpeaking(); if (!recipe) sfx.levelup();
  flash.classList.add("on"); await wait(0.2);
  lootOn = true; stage.classList.add("reveal"); flash.classList.remove("on");
  let fromSlot = null;
  if (recipe) {
    const gs = layoutLoot(); lootRig.visible = true; [lootGrid, lootSlot].forEach((m) => (m.material.opacity = 1)); lootFade = 0; lootIn.clear(); slotShadow.clear();
    const bb = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()), fit = 0.72 / Math.max(bb.x, bb.y, bb.z, 0.01);   // 产物按槽的大小缩放
    slotShadow.scale.setScalar(fit); slotShadow.add(silhouette(mesh));   // 产物槽里先是一个黑影：告诉人"会变出一样东西"
    recipe.forEach((it) => { it.mesh.position.copy(cellPos(it.col, it.row)); it.mesh.scale.setScalar(0.01); it.mesh.userData.s = it.s || 0.5; lootIn.add(it.mesh); });
    recipe.forEach((it, i) => setTimeout(() => sfx.click(), i * 220));
    await Promise.all(recipe.map((it, i) => tween(0.45, (k) => it.mesh.scale.setScalar(Math.max(0.01, it.mesh.userData.s * k)), { ease: ease.back, delay: i * 0.22 })));
    await wait(0.6); sfx.craft();
    const target = gridBox.worldToLocal(slotBox.getWorldPosition(new THREE.Vector3())); const p0 = recipe.map((it) => it.mesh.position.clone());
    recipe.forEach((it, i) => setTimeout(() => sfx.tok(), 250 + i * 90));
    await Promise.all(recipe.map((it, i) => tween(0.55, (k) => { it.mesh.position.lerpVectors(p0[i], target, ease.in(k)); it.mesh.position.y += Math.sin(k * Math.PI) * 0.5; it.mesh.rotation.y = k * Math.PI * 2; it.mesh.scale.setScalar(Math.max(0.01, it.mesh.userData.s * (1 - k * 0.9))); }, { delay: i * 0.09 })));
    lootIn.clear(); slotShadow.clear(); sfx.levelup();
    flash.classList.add("on"); await wait(0.14); flash.classList.remove("on");
    fromSlot = { pos: slotBox.getWorldPosition(new THREE.Vector3()), s: fit * gs };
  }
  lootHold.add(mesh); lootHold.scale.setScalar(0.01); lootHold.rotation.set(0.25, 0, 0); lootHold.position.set(0, 0.55, 0);
  if (fromSlot) {   // 产物先在槽里弹出来，停一拍，再飞到正中放大；配方表随之淡出
    lootHold.position.copy(fromSlot.pos); await tween(0.45, (k) => lootHold.scale.setScalar(Math.max(0.01, fromSlot.s * k)), { ease: ease.back }); await wait(0.5);
    const q0 = fromSlot.pos.clone(), q1 = new THREE.Vector3(0, 0.55, 0);
    await tween(0.6, (k) => { lootHold.position.lerpVectors(q0, q1, k); lootHold.scale.setScalar(fromSlot.s + (1 - fromSlot.s) * k); lootFade = k; [lootGrid, lootSlot].forEach((m) => (m.material.opacity = 1 - k)); lootGlow.scale.setScalar(3.4 + k * 1.2); });
    lootRig.visible = false;
  } else await tween(0.8, (k) => lootHold.scale.setScalar(k), { ease: ease.back });
  await wait(0.7);
  learn(word, null, { speakIt: false });
  lootUi.hidden = false; void lootUi.offsetWidth; lootUi.classList.add("in");
  await speak(w, 0.85, { interrupt: true });
  await wait(0.5); lootUi.classList.add("zh");
  await wait(1.3);
  flash.classList.add("on"); await wait(0.2); lootHold.remove(mesh); lootOn = false; lootUi.hidden = true; stage.classList.remove("reveal"); flash.classList.remove("on");
  if (sentence) { await wait(0.3); await say(sentence[0], sentence[1]); await wait(0.6); }
}

// ---------- 剧情：每一步只点一下 ----------
const INSTR = {
  1: ["Look! A tree. Tap the tree!", "看，一棵树。点一下树！"],
  2: ["Put the log on the table.", "把原木放到工作台上。"],
  3: ["We need stone. Tap the rocks!", "我们需要石头。点一下那些石头！"],
  4: ["Tap the table!", "点一下工作台！"],
  5: ["Now chop the tree. Fast!", "现在砍树。好快！"],
};
const ROCK_RING = new THREE.Vector3(6.5, groundY(6.5, -8.5) + 0.02, -8.5);
const targets = { 1: () => [treeA.trunk[0], 1.3], 2: () => [table, 1.3], 3: () => [ROCK_RING, 1.9], 4: () => [table, 1.3], 5: () => [treeA.trunk[0], 1.3] };
function enter(step) { state.step = step; stage.dataset.step = step; state.lastAct = performance.now(); const [en, zh] = INSTR[step] || []; if (en) say(en, zh, { remember: false }); const tg = targets[step]?.(); ringOn(tg ? tg[0] : null, tg ? tg[1] : 1); }

async function openDoor() {
  if (state.step !== 0 || state.busy) return; state.busy = true; state.started = performance.now(); sfx.unlock(); sfx.ambience(); voice.warm();
  ui.title.classList.add("hide"); stage.classList.add("playing"); canvas.focus({ preventScroll: true });
  learn("DOOR", new THREE.Vector3(0, 2.4, 1.6), { speakIt: false }); await speak("door"); await wait(0.3);
  say("Open the door!", "打开这扇门！"); sfx.creak(); await tween(1.0, (k) => { hinge.rotation.y = -k * 1.95; }, { ease: ease.out });
  await goShot("inside", 2.2); await wait(0.5);
  await say("Hi! I'm JJ. Welcome to my world.", "你好！我是 JJ。欢迎来到我的世界。"); await wait(0.8);
  await goShot("tree", 1.8); state.busy = false; enter(1);
}
async function punch(o) {
  if (state.busy) return; state.busy = true; state.lastAct = performance.now();
  swing(false); await wait(0.12); sfx.tok(); shake(treeA, 0.07, 0.3); const p = o.getWorldPosition(new THREE.Vector3()); chips(p, M.logSide, 6, 1.8);
  state.hits++; crack.visible = true; crack.position.copy(p); crack.material.map = T.cracks[Math.min(3, state.hits)]; crack.material.needsUpdate = true;
  if (state.hits === 1) learn("TREE", p.clone().add(new THREE.Vector3(0, 0.9, 0)));
  if (state.hits < 3) { state.busy = false; return; }
  crack.visible = false; sfx.crack(); ringOn(null); await flyToPocket(M.log, p.clone()); await wait(0.3);
  await reveal("LOG", new THREE.Mesh(BOX, M.log), ["You got a log!", "你拿到一块原木了！"]);
  await goShot("table", 2.0); state.busy = false; enter(2);
}
const item = (mat, geo = BOX, s = 0.34) => { const m = new THREE.Mesh(geo, mat); m.scale.setScalar(s); m.castShadow = true; scene.add(m); return m; };
const STICK_GEO = new THREE.BoxGeometry(0.08, 0.5, 0.08);
const flyIn = (m, from, to, dur = 0.6) => tween(dur, (k, raw) => { m.position.lerpVectors(from, to, k); m.position.y += Math.sin(raw * Math.PI) * 0.45; }, { ease: ease.inout });
async function craftWood() {
  state.busy = true; ringOn(null); const top = TABLE_TOP.clone().add(new THREE.Vector3(0, 0.3, 0));
  const log = item(M.log); log.position.copy(top); log.scale.setScalar(0.01); sfx.click(); await tween(0.4, (k) => log.scale.setScalar(0.42 * k), { ease: ease.back });
  await speak("log", 0.85, { interrupt: true }); await wait(0.5); scene.remove(log);
  // 配方 1：一块原木 → 木板
  await reveal("PLANK", new THREE.Mesh(BOX, M.planks), ["One log makes four planks.", "一块原木能做四块木板。"], [{ mesh: new THREE.Mesh(BOX, M.log), col: 1, row: 1 }]);
  // 配方 2：两块木板上下叠 → 木棍
  { const st = new THREE.Mesh(STICK_GEO, M.stick); st.scale.setScalar(3); st.rotation.z = 0.45;
    await reveal("STICK", st, ["Two planks make sticks.", "两块木板能做木棍。"], [{ mesh: new THREE.Mesh(BOX, M.planks), col: 1, row: 0 }, { mesh: new THREE.Mesh(BOX, M.planks), col: 1, row: 1 }]); }
  await wait(0.3); state.busy = false; enter(3); goShot("rocks", 2.0);
}
async function hitRock(o) {
  if (state.busy) return; state.busy = true; state.lastAct = performance.now();
  swing(false); await wait(0.1); sfx.tok(); const p = o.getWorldPosition(new THREE.Vector3()); chips(p, M.stone, 8, 2.2); await shake(o, 0.05, 0.2);
  world.remove(o); hot.splice(hot.indexOf(o), 1); rocks.splice(rocks.indexOf(o), 1); state.stones++;
  if (state.stones === 1) { await flyToPocket(M.stone, p.clone(), BOX, 0.36); await wait(0.2); await reveal("STONE", new THREE.Mesh(BOX, M.stone)); }
  else { flyToPocket(M.stone, p.clone(), BOX, 0.36); speak("stone", 0.85, { interrupt: true }); }
  if (state.stones < 3) { state.busy = false; return; }
  ringOn(null); await wait(1.2); await say("Three stones! Back to the table.", "三块石头！回到工作台。"); await wait(0.5);
  await goShot("table", 2.2); state.busy = false; enter(4);
}
async function craftAxe() {
  state.busy = true; ringOn(null); const top = TABLE_TOP.clone().add(new THREE.Vector3(0, 0.35, 0));
  await say("Let's see what we can make!", "看看能做出什么！", { remember: false }); await wait(0.3);
  // 石斧配方（和游戏里一样）：石 石 / 石 棍 / · 棍
  const stick = () => new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.17), M.stick);
  const recipe = [{ mesh: new THREE.Mesh(BOX, M.stone), col: 0, row: 0 }, { mesh: new THREE.Mesh(BOX, M.stone), col: 1, row: 0 }, { mesh: new THREE.Mesh(BOX, M.stone), col: 0, row: 1 }, { mesh: stick(), col: 1, row: 1, s: 1 }, { mesh: stick(), col: 1, row: 2, s: 1 }];
  { const ax = axeModel(1.7); ax.position.set(0.1, -0.35, 0); ax.rotation.z = -0.42; await reveal("AXE", ax, ["You made an axe!", "你做出一把斧头了！"], recipe); }
  // 回到世界：斧头从桌上飞进手里
  const axe3 = axeModel(0.9); axe3.position.copy(top).add(new THREE.Vector3(0.05, -0.2, 0)); scene.add(axe3);
  const q0 = axe3.position.clone(); await tween(0.7, (k) => { const to = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.8)); to.y -= 0.4; axe3.position.lerpVectors(q0, to, k); axe3.scale.setScalar(0.9 * (1 - k * 0.7)); }, { done: () => scene.remove(axe3) });
  await wait(0.3); state.busy = false; enter(5); goShot("chop", 2.0);
}
async function chop(o) {
  if (state.busy) return; state.busy = true; state.lastAct = performance.now();
  swing(true); await wait(0.1); sfx.crack(); shake(treeA, 0.1, 0.3); const p = o.getWorldPosition(new THREE.Vector3()); chips(p, M.planks, 12, 3);
  state.chops++; if (state.chops === 1) { learn("CHOP", p.clone().add(new THREE.Vector3(0, 0.9, 0))); }
  if (state.chops < 3) { state.busy = false; return; }
  ringOn(null); await fell(); state.busy = false;
}
async function fell() {
  sfx.timber(); say("Timber!", "树倒啦！", { remember: false, interrupt: true });
  await tween(1.5, (k) => { treeA.rotation.z = k * 1.5; }, { ease: ease.in });
  sfx.thud(); cam.bob = 0; const top = treeA.localToWorld(new THREE.Vector3(0, 5, 0)); chips(top, M.leaves, 26, 5); treeA.remove(treeA.leaves); treeA.leaves.visible = false;
  await tween(0.5, (k) => { treeA.rotation.z = 1.5 + Math.sin(k * Math.PI) * 0.06; }, { ease: ease.out });
  learn("TIMBER", top.clone().add(new THREE.Vector3(0, 0.6, 0)), { speakIt: false }); await wait(1.2);
  await say("Good job! That's day one.", "太棒了！这就是孩子的第一天。"); state.step = 6; stage.dataset.step = 6;
  tween(3.2, (k) => paintSky(k), { ease: ease.inout }); await goShot("final", 3.0); await wait(0.3);
  { const zx = -3.2, zz = -9.5, gy = groundY(zx, zz); zombie.position.set(zx, gy - 2.4, zz); zombie.rotation.y = Math.atan2(camera.position.x - zx, camera.position.z - zz); zombie.visible = true; sfx.thud();
    await tween(1.1, (k) => { zombie.position.y = gy - 2.4 * (1 - k); }, { ease: ease.out }); chips(zombie.position.clone().add(new THREE.Vector3(0, 0.3, 0)), M.dirt || M.planks, 10, 2.5); }
  await say("Tomorrow, let's make a cake for the zombie!", "明天，我们给这只僵尸做个蛋糕！", { remember: false }); await wait(0.6); showSummary();
}
function explore(o, pos) {
  const w = o.userData.word; if (!w) return;
  if (o.userData.kind === "sheep") { sfx.baa(); const g = o.parent; tween(0.4, (k) => { g.position.y = groundY(g.position.x, g.position.z) + 0.75 + Math.sin(k * Math.PI) * 0.5; }); }
  learn(w, pos);
}

// ---------- 总结与记录卡 ----------
function showSummary() {
  if (!ui.summary.hidden) return;
  const mins = Math.max(1, Math.round((performance.now() - state.started) / 60000));
  $("#sum-stats").innerHTML = `<b>${state.words.length}</b> 个英语词 · <b>${state.sentences.length}</b> 句话 · 约 <b>${mins}</b> 分钟`;
  $("#sum-words").innerHTML = state.words.map((w) => `<li data-say="${w.toLowerCase()}" role="button" tabindex="0"><b>${w}</b><i>${ZH[w] || ""}</i></li>`).join("");
  $("#sum-sents").innerHTML = state.sentences.map((s) => `<li data-say="${s.replace(/"/g, "&quot;")}" role="button" tabindex="0">${s}</li>`).join("");
  ui.summary.hidden = false; ui.summary.scrollTop = 0; ui.say.hidden = true;
}
ui.summary.addEventListener("click", (e) => { const b = e.target.closest("[data-say]"); if (b) speak(b.dataset.say, 0.9, { interrupt: true }); });
$("#sum-again").addEventListener("click", () => location.reload());
$("#sum-close").addEventListener("click", (e) => { e.preventDefault(); ui.summary.classList.add("out"); setTimeout(() => { ui.summary.hidden = true; ui.summary.classList.remove("out"); ui.say.hidden = false; say("What else can you find?", "拖动看看四周，点击小羊、花朵和水，继续发现单词。", { remember: false }); }, 260); });
$("#sum-card").addEventListener("click", makeCard);
$("#sum-book").addEventListener("click", (e) => { e.preventDefault(); ui.summary.hidden = true; ui.say.hidden = false; });
let shot = null;
function snapshotWorld() {
  const w = 1280, h = 668, rt = new THREE.WebGLRenderTarget(w, h, { samples: 2 });
  const asp = camera.aspect; camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px); renderer.setRenderTarget(null); rt.dispose();
  camera.aspect = asp; camera.updateProjectionMatrix();
  const c = document.createElement("canvas"); c.width = w; c.height = h; const img = c.getContext("2d").createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // WebGL 自下而上，翻转
  c.getContext("2d").putImageData(img, 0, 0); shot = c;
}
async function makeCard() {
  const btn = $("#sum-card"); btn.disabled = true; btn.textContent = "正在制作卡片…";
  try {
    try { await document.fonts.load('900 54px Nunito'); } catch (_) {}
    const W = 1080, c = document.createElement("canvas"), g = c.getContext("2d");
    c.width = W; c.height = 1500;
    g.fillStyle = "#F7F5EC"; g.fillRect(0, 0, W, c.height);
    g.fillStyle = "#E3AD36"; g.fillRect(0, 0, W, 14);
    g.fillStyle = "#6F8051"; g.font = '900 24px Nunito, sans-serif'; g.fillText("ENGLISH ISLAND / DAY ONE", 64, 80);
    g.fillStyle = "#26382B"; g.font = '900 60px Nunito, "PingFang SC", sans-serif'; g.fillText("我的森林冒险", 64, 166);
    g.font = '500 26px "PingFang SC", sans-serif'; g.fillStyle = "#75816E";
    g.fillText(new Date().toLocaleDateString("zh-CN") + " · 森林小匠人达成", 64, 216);
    if (!shot) snapshotWorld();
    g.save(); g.beginPath(); g.roundRect(64, 264, 952, 500, 24); g.clip(); g.drawImage(shot, 0, 0, shot.width, shot.height, 64, 264, 952, 500); g.restore();
    g.fillStyle = "#26382B"; g.font = '900 32px "PingFang SC", sans-serif'; g.fillText(`收集了 ${state.words.length} 个新单词`, 64, 832);
    let x = 64, y = 868;
    for (const w of state.words) {
      g.font = '900 28px Nunito, sans-serif'; const ew = g.measureText(w).width;
      g.font = '500 22px "PingFang SC", sans-serif'; const tw = ew + g.measureText(ZH[w] || "").width + 54;
      if (x + tw > W - 64) { x = 64; y += 78; }
      g.fillStyle = "#E8EDDE"; g.beginPath(); g.roundRect(x, y, tw, 58, 10); g.fill();
      g.fillStyle = "#34462E"; g.font = '900 28px Nunito, sans-serif'; g.fillText(w, x + 18, y + 38);
      g.fillStyle = "#69785D"; g.font = '500 22px "PingFang SC", sans-serif'; g.fillText(ZH[w] || "", x + ew + 33, y + 37); x += tw + 14;
    }
    g.fillStyle = "#C8D0BC"; g.fillRect(64, 1288, 952, 2);
    g.fillStyle = "#34462E"; g.font = '900 36px "PingFang SC", sans-serif'; g.fillText("一把斧头，一场冒险，一点点成长。", 64, 1360);
    g.fillStyle = "#75816E"; g.font = '500 25px "PingFang SC", sans-serif'; g.fillText("英语小岛 · 让每一次发现，都成为一个新单词。", 64, 1420);
    const url = c.toDataURL("image/png"); const out = $("#sum-img"); out.src = url; out.hidden = false;
    const a = $("#sum-dl"); a.href = url; a.download = `english-island-day-one-${Date.now()}.png`; a.hidden = false;
    btn.textContent = "卡片已生成 ↓"; sfx.ding();
    out.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  } catch (error) { console.error(error); btn.textContent = "生成失败，点击重试"; }
  finally { btn.disabled = false; }
}

// ---------- 交互 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null, dragging = false;
function pickAt(x, y) { const r = canvas.getBoundingClientRect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(hot, false)[0] || null; }
const hitPos = (h) => { const p = new THREE.Vector3(); if (h.object.userData.merged) return h.point.clone(); if (h.instanceId != null) { const m = new THREE.Matrix4(); h.object.getMatrixAt(h.instanceId, m); p.setFromMatrixPosition(m); h.object.localToWorld(p); } else h.object.getWorldPosition(p); return p; };
function act(o, pos) {
  const kind = o.userData.kind; state.lastAct = performance.now();
  if (state.step === 0) { if (kind === "door") openDoor(); return; }
  if (state.busy || paused) return;
  if (kind === "trunk" && o.parent === treeA) { if (state.step === 1) return punch(o); if (state.step === 5) return chop(o); }
  if (kind === "leaves" && o.parent === treeA && (state.step === 1 || state.step === 5)) { const tr = treeA.trunk[2]; return state.step === 1 ? punch(tr) : chop(tr); }
  if (kind === "rock" && state.step === 3) return hitRock(o);
  if (kind === "table") { if (state.step === 2) return craftWood(); if (state.step === 4) return craftAxe(); }
  if (kind === "door") { if (!state.words.includes("DOOR")) learn("DOOR", pos); return; }
  explore(o, pos);
}
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, t: performance.now() }; dragging = false; sfx.unlock(); });
window.addEventListener("pointermove", (e) => {
  if (down && e.buttons) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 6) dragging = true;
    if (dragging && state.step >= 1) { const orbit = SHOTS[cam.shot]?.orbit; cam.yaw = down.yaw + dx * (orbit ? 0.006 : -0.0038); if (!orbit) cam.pitch = Math.max(-0.5, Math.min(0.45, down.pitch + dy * -0.003)); cam.orbit = false; } return; }
  if (isTouch) return; const h = pickAt(e.clientX, e.clientY); canvas.style.cursor = h ? "pointer" : "grab";
});
window.addEventListener("pointerup", (e) => {
  if (!down) return; const wasDrag = dragging, dt = performance.now() - down.t; down = null; state.lastAct = performance.now();
  if (wasDrag) { setTimeout(() => { if (SHOTS[cam.shot]?.orbit && !reduced) cam.orbit = true; }, 2500); return; }
  if (dt > 700 || e.target !== canvas) return;
  const h = pickAt(e.clientX, e.clientY); if (!h) return; const pos = hitPos(h); pos.y += 0.8; act(h.object, pos);
});
$("#title button").addEventListener("click", () => openDoor());
$("#snd").addEventListener("click", (e) => { sfx.muted = !sfx.muted; e.currentTarget.setAttribute("aria-pressed", String(sfx.muted)); e.currentTarget.classList.toggle("off", sfx.muted); if (sfx.muted) stopSpeaking(); });

// ---------- 主循环 ----------
let last = performance.now(), running = true, t = 0, frame = 0;
function resize() { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; if (cam.shot && !tweens.length) cam.fov = shotVec(SHOTS[cam.shot]).fov; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage); resize();
new IntersectionObserver((es) => { running = es[0].isIntersecting; if (running) last = performance.now(); }, { threshold: 0.05 }).observe(canvas);
document.addEventListener("visibilitychange", () => { last = performance.now(); });
const tmpV = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!running || paused) return; t += dt; uT.value = t;
  updateTweens(now); updateFx(dt); if (cam.orbit) cam.yaw += 0.05 * dt; applyCamera(t);
  if (lootOn) { lootHold.rotation.y = Math.sin(t * 1.4) * 0.6; lootHold.rotation.x = Math.sin(t * 0.9) * 0.08; if (lootRig.visible) { layoutLoot(); lootIn.children.forEach((m, i) => { m.rotation.x = 0.35; m.rotation.y = Math.sin(t * 1.2 + i) * 0.35; }); slotShadow.rotation.y = Math.sin(t * 1.4) * 0.6; lootArrow.material.opacity = (1 - lootFade) * (0.7 + Math.sin(t * 6) * 0.3); } lootRays.rotation.z -= dt * 0.35; lootGlow.material.opacity = 0.85 + Math.sin(t * 5) * 0.15; sparks.children.forEach((sp) => { const u = sp.userData, a = u.a + t * u.v; sp.position.set(Math.cos(a) * u.r, 0.55 + Math.sin(t * 1.7 + u.ph) * 0.5, -0.4 + Math.sin(a) * 0.3); sp.material.opacity = 0.5 + 0.5 * Math.sin(t * 4 + u.ph); }); lootCam.aspect = camera.aspect; lootCam.position.z = camera.aspect < 1 ? 13.6 : 9.3; lootCam.updateProjectionMatrix(); renderer.render(lootScene, lootCam); return; }
  renderer.shadowMap.needsUpdate = frame < 3 || tweens.length > 0 || cam.orbit || frame % 4 === 0; frame++;
  sun.target.position.copy(cam.look); sun.position.copy(cam.look).add(tmpV.lerpVectors(SUN_OFF, SUN_OFF_DUSK, dusk));
  for (const c of clouds) { c.g.position.x += c.v * dt; if (c.g.position.x > 56) c.g.position.x = -56; }
  for (const s of sheepList) { const d = s.target.clone().sub(s.g.position); d.y = 0;
    if (d.length() < 0.1) { s.wait -= dt; if (s.wait <= 0) { s.target.copy(s.home).add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5)); s.target.y = groundY(s.target.x, s.target.z) + 0.75; s.wait = 1 + Math.random() * 3; } s.legs.forEach((l) => (l.rotation.x *= 0.8)); }
    else { d.normalize(); s.g.position.addScaledVector(d, 0.6 * dt); s.g.position.y += (groundY(s.g.position.x, s.g.position.z) + 0.75 - s.g.position.y) * 0.2; s.g.rotation.y = Math.atan2(-d.z, d.x); s.phase += dt * 10; s.legs.forEach((l, i) => (l.rotation.x = Math.sin(s.phase + (i % 2) * Math.PI) * 0.5)); }
    s.head.position.y = 0.3 + Math.sin(t * 2 + s.phase) * 0.03; }
  for (const f of flies) { f.a += dt * f.s; f.g.position.set(f.c.x + Math.sin(f.a) * 2.2, f.c.y + Math.sin(f.a * 2.3) * 0.5, f.c.z + Math.cos(f.a * 0.8) * 2.2); f.g.rotation.z = -f.a; const w = Math.sin(t * 16 + f.a) * 0.9; f.lp.rotation.y = w; f.rp.rotation.y = -w; }
  { const p = pollen.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 3) { p[i] += Math.sin(t * 0.6 + i) * 0.004; p[i + 1] += (Math.sin(t * 0.9 + i * 0.3) * 0.5 + 0.15) * dt * 0.4; if (p[i + 1] > 7) p[i + 1] = 0.2; } pollen.geometry.attributes.position.needsUpdate = true; }
  if (ringAt) { if (ringAt.o.isVector3) ring.position.copy(ringAt.o); else { ringAt.o.getWorldPosition(ring.position); ring.position.y -= 0.48; } const k = (1 + Math.sin(t * 3.2) * 0.14) * ringAt.s; ring.scale.setScalar(k); ring.material.opacity = 0.55 + Math.sin(t * 3.2) * 0.35; }
  sunMesh.lookAt(camera.position);
  if (state.step >= 1 && state.step <= 5 && !state.busy && now - state.lastAct > 11000) { const [en, zh] = INSTR[state.step]; say(en, zh, { remember: false }); state.lastAct = now; }
  renderer.render(scene, camera);
});
stage.classList.add("ready");
// 调试句柄（浏览器自动化验收用，无 UI 入口）：tap(kind) 等价于家长点了那个东西
window.__yf = { state, openDoor, goShot, cam, hot, ORDER, treeA, table, rocks, showSummary,
  tap(kind) { const o = kind === "tree" ? treeA.trunk[1] : kind === "table" ? table : kind === "rock" ? rocks.at(-1) : kind === "door" ? door : hot.find((h) => h.userData.kind === kind || h.userData.word === kind); if (!o) throw new Error("no " + kind); const p = o.getWorldPosition(new THREE.Vector3()); p.y += 0.8; return act(o, p); } };

// Isolated game-to-app bridge: only accept same-origin messages from the embedding app.
const helpDialog = $("#help-dialog");
function pauseGame(value) {
  if (paused === value) return;
  if (value) { paused = true; pausedAt = performance.now(); }
  else { const elapsed = performance.now() - pausedAt; for (const w of tweens) w.t0 += elapsed; paused = false; state.lastAct = performance.now(); }
  sfx.paused = value; voice.setPaused(value);
}
function showHelp() { pauseGame(true); helpDialog.showModal(); }
helpDialog.addEventListener("close", () => pauseGame(false));
const taskButton = $("#task-action");
const taskLabels = { 1: "敲一敲树", 2: "制作木板与木棍", 3: "收集石头", 4: "合成石斧", 5: "挥动斧头" };
function taskAction() {
  if (state.busy || helpDialog.open || !ui.summary.hidden || paused) return;
  if (state.step === 0) { openDoor(); return; }
  const kind = ({ 1: "tree", 2: "table", 3: "rock", 4: "table", 5: "tree" })[state.step];
  if (kind) window.__yf.tap(kind);
}
taskButton.addEventListener("click", taskAction);
$("#help-close").addEventListener("click", () => helpDialog.close());
$("#help-done").addEventListener("click", () => helpDialog.close());
helpDialog.addEventListener("click", (e) => { if (e.target === helpDialog) { const r = helpDialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) helpDialog.close(); } });
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== "island-command") return;
  const command = event.data.command;
  if (command === "start") openDoor();
  if (command === "mute") $("#snd").click();
  if (command === "restart") location.reload();
  if (command === "help") { if (helpDialog.open) helpDialog.close(); else showHelp(); }
  if (command === "act") taskAction();
  if (command === "summary" && state.step === 6) showSummary();
  if (command === "speak" && typeof event.data.word === "string") speak(event.data.word.toLowerCase(), 0.9, { interrupt: true });
});
window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (e.key === " " && !e.repeat && !["BUTTON", "A", "INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { e.preventDefault(); taskAction(); }
  if (e.key === "Escape") { if (helpDialog.open) helpDialog.close(); }
});
for (const container of [ui.pocket, ui.summary]) container.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-say]")) { e.preventDefault(); e.target.click(); }
});
let lastStatus = "";
function updateStatus() {
  const active = state.step >= 1 && state.step <= 5;
  taskButton.hidden = !active || lootOn || !ui.summary.hidden;
  taskButton.disabled = state.busy;
  const count = state.step === 1 ? state.hits : state.step === 3 ? state.stones : state.step === 5 ? state.chops : null;
  $("#action-label").textContent = state.busy ? "跟着 JJ，看看会发生什么…" : (taskLabels[state.step] || "") + (count === null ? "" : ` · ${count}/3`);
  const status = { type: "island-status", ready: true, step: state.step, busy: state.busy, words: [...state.words], muted: sfx.muted, completed: state.step === 6, hits: state.hits, stones: state.stones, chops: state.chops };
  const next = JSON.stringify(status);
  if (next !== lastStatus) { lastStatus = next; parent.postMessage(status, location.origin); }
}
setInterval(updateStatus, 150); updateStatus();
window.addEventListener("pagehide", () => { voice.stop(); renderer.setAnimationLoop(null); renderer.dispose(); });

$("#sum-next-level").addEventListener("click", () => {
  voice.stop();
  if (parent !== window) parent.postMessage({ type: "island-navigate", level: 2 }, location.origin);
  else location.href = "./day2.html";
});
