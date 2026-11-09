// textures.js — 程序化 16×16 像素方块贴图（全部自绘，不含 Mojang 素材）。
// 只在运行时用 canvas 画一次，零图片请求；贴图用 NearestFilter 保持像素感。
// v10：调色更柔和（低对比噪点、偏暖），新增草丛、蝴蝶、斧头部件用色。
export function createTextures(THREE, seed = 20261009) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const canvas = (w = 16, h = 16) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const ctxOf = (c) => c.getContext("2d");
  const px = (g, x, y, color, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
  const noise = (g, w, h, palette) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px(g, x, y, pick(palette)); };
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const GREEN = ["#79c95a", "#72c154", "#7fcf60", "#6fbd52", "#76c657"];
  const DARKGREEN = ["#4f9e3e", "#55a644", "#4a9639", "#5aac48"];
  const BROWN = ["#9a6a40", "#92633a", "#a27146", "#8d5f37"];
  const GRAY = ["#9b9ca0", "#92939a", "#a4a5a9", "#8a8b91"];
  const BARK = ["#a67a4e", "#9c7147", "#b08555", "#946a42"];
  const PLANK = ["#c99a5e", "#c09256", "#d1a267", "#bb8d51"];
  const WOOL = ["#f6f3ee", "#efebe4", "#e9e4dc", "#faf8f4"];

  const c = {};
  c.grassTop = canvas(); noise(ctxOf(c.grassTop), 16, 16, GREEN);
  c.dirt = canvas(); noise(ctxOf(c.dirt), 16, 16, BROWN);
  for (let i = 0; i < 5; i++) px(ctxOf(c.dirt), Math.floor(rnd() * 16), Math.floor(rnd() * 16), "#7a5130");
  c.grassSide = canvas(); { const g = ctxOf(c.grassSide); noise(g, 16, 16, BROWN);
    for (let x = 0; x < 16; x++) { const d = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0); for (let y = 0; y < d; y++) px(g, x, y, y === d - 1 ? pick(DARKGREEN) : pick(GREEN)); } }
  c.stone = canvas(); { const g = ctxOf(c.stone); noise(g, 16, 16, GRAY);
    for (let i = 0; i < 5; i++) px(g, Math.floor(rnd() * 14), Math.floor(rnd() * 14), pick(["#b0b1b6", "#7f8086"]), 2 + Math.floor(rnd() * 2), 1 + Math.floor(rnd() * 2)); }
  c.logSide = canvas(); { const g = ctxOf(c.logSide); for (let x = 0; x < 16; x++) { const col = pick(BARK); for (let y = 0; y < 16; y++) px(g, x, y, rnd() < 0.12 ? pick(BARK) : col); }
    px(g, 4, 6, "#6b4728", 1, 3); px(g, 11, 10, "#6b4728", 1, 2); }
  c.logTop = canvas(); { const g = ctxOf(c.logTop); noise(g, 16, 16, BARK);
    const rings = ["#d6ad75", "#bf9560", "#d6ad75", "#bf9560", "#ccA26b"]; for (let r = 5; r >= 1; r--) { g.fillStyle = rings[r]; g.fillRect(8 - r - 1, 8 - r - 1, r * 2 + 2, r * 2 + 2); } px(g, 7, 7, "#a67a4e", 2, 2); }
  c.planks = canvas(); { const g = ctxOf(c.planks); for (let b = 0; b < 4; b++) { const col = pick(PLANK); for (let y = b * 4; y < b * 4 + 4; y++) for (let x = 0; x < 16; x++) px(g, x, y, rnd() < 0.1 ? pick(PLANK) : col); px(g, 0, b * 4 + 3, "#8e6234", 16, 1); px(g, (b % 2) * 8 + 3, b * 4, "#8e6234", 1, 3); } }
  c.leaves = canvas(); { const g = ctxOf(c.leaves); noise(g, 16, 16, DARKGREEN); for (let i = 0; i < 26; i++) px(g, Math.floor(rnd() * 16), Math.floor(rnd() * 16), pick(["#3f8a31", "#74c45c"])); }
  c.craftTop = canvas(); { const g = ctxOf(c.craftTop); g.drawImage(c.planks, 0, 0); px(g, 2, 2, "#7a5330", 12, 12); px(g, 3, 3, "#d9b47c", 10, 10);
    for (let i = 1; i < 3; i++) { px(g, 3 + i * 3 + (i - 1), 3, "#7a5330", 1, 10); px(g, 3, 3 + i * 3 + (i - 1), "#7a5330", 10, 1); } }
  c.craftSide = canvas(); { const g = ctxOf(c.craftSide); g.drawImage(c.planks, 0, 0); px(g, 0, 0, "#a67a4e", 16, 2);
    px(g, 3, 5, "#6a6a70", 2, 7); px(g, 2, 4, "#9a9aa0", 4, 2); px(g, 10, 4, "#e2e2e6", 2, 8); px(g, 9, 4, "#9a9aa0", 1, 8); for (let y = 4; y < 12; y += 2) px(g, 12, y, "#a9a9af"); }
  c.door = canvas(16, 32); { const g = ctxOf(c.door); for (let x = 0; x < 16; x++) { const col = pick(PLANK); for (let y = 0; y < 32; y++) px(g, x, y, rnd() < 0.08 ? pick(PLANK) : col); if (x % 4 === 3) px(g, x, 0, "#8e6234", 1, 32); }
    px(g, 1, 1, "#9a6c3a", 14, 1); px(g, 1, 30, "#9a6c3a", 14, 1); px(g, 1, 1, "#9a6c3a", 1, 30); px(g, 14, 1, "#9a6c3a", 1, 30);
    for (const wx of [3, 9]) { px(g, wx, 4, "#4a3520", 4, 7); px(g, wx + 1, 5, "#cfeaff", 2, 5); px(g, wx + 1, 7, "#4a3520", 2, 1); }
    px(g, 11, 17, "#c9c9c9", 2, 2); px(g, 11, 17, "#f0f0f0"); }
  c.wool = canvas(); noise(ctxOf(c.wool), 16, 16, WOOL);
  c.sheepFace = canvas(); { const g = ctxOf(c.sheepFace); noise(g, 16, 16, WOOL); px(g, 3, 6, "#f0d9cc", 10, 10); px(g, 4, 8, "#222", 2, 2); px(g, 10, 8, "#222", 2, 2); px(g, 5, 8, "#fff"); px(g, 11, 8, "#fff"); px(g, 7, 13, "#dba59a", 2, 1); }
  c.deep = canvas(); { const g = ctxOf(c.deep); noise(g, 16, 16, ["#4a4150", "#443b4a", "#514757", "#3f3745"]); for (let i = 0; i < 4; i++) px(g, Math.floor(rnd() * 13), Math.floor(rnd() * 15), "#5c5262", 2 + Math.floor(rnd() * 2), 1); }
  c.water = canvas(); noise(ctxOf(c.water), 16, 16, ["#4f93e6", "#579bea", "#62a6f0", "#4a8bdd"]);
  const flower = (petal, center) => { const f = canvas(); const g = ctxOf(f); px(g, 7, 8, "#4f9e3e", 2, 8); px(g, 5, 11, "#5aac48", 2, 1); px(g, 9, 12, "#5aac48", 2, 1);
    px(g, 5, 3, petal, 6, 6); px(g, 6, 2, petal, 4, 8); px(g, 4, 4, petal, 8, 4); px(g, 7, 5, center, 2, 2); return f; };
  c.flowerRed = flower("#ef5d55", "#ffe68a"); c.flowerYellow = flower("#ffd54a", "#c2672a"); c.flowerBlue = flower("#8aa9ff", "#fff1a8");
  // 草丛（十字面片用，透明底）
  c.tallGrass = canvas(); { const g = ctxOf(c.tallGrass); for (let i = 0; i < 7; i++) { const x = 1 + i * 2 + Math.floor(rnd() * 2), h = 6 + Math.floor(rnd() * 8); const col = pick([...GREEN, ...DARKGREEN]); for (let y = 15; y > 15 - h; y--) px(g, x + (y < 15 - h + 3 && rnd() < 0.5 ? (rnd() < 0.5 ? 1 : -1) : 0), y, col); } }
  // 蝴蝶翅膀（单侧，透明底）
  c.butterfly = canvas(); { const g = ctxOf(c.butterfly); px(g, 2, 2, "#ffb13b", 10, 6); px(g, 3, 8, "#ffb13b", 8, 5); px(g, 4, 3, "#ffd27a", 4, 3); px(g, 5, 9, "#ffd27a", 3, 2); px(g, 2, 2, "#5a3a16", 10, 1); px(g, 11, 3, "#5a3a16", 1, 5); px(g, 10, 12, "#5a3a16", 1, 1); }
  // 裂纹 4 档（透明底）
  c.cracks = []; for (let k = 0; k < 4; k++) { const cc = canvas(); const g = ctxOf(cc); const lines = k + 2;
    for (let l = 0; l < lines; l++) { let x = 6 + Math.floor(rnd() * 4), y = 6 + Math.floor(rnd() * 4); const steps = 5 + k * 3;
      for (let i = 0; i < steps; i++) { px(g, x, y, "rgba(30,20,10,0.8)"); x += rnd() < 0.5 ? -1 : 1; if (rnd() < 0.6) y += rnd() < 0.5 ? -1 : 1; x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y)); } }
    c.cracks.push(cc); }

  // 物品图标（词袋、记录卡用）：等距小方块 / 像素精灵
  const isoCube = (top, side, size = 64) => {
    const o = canvas(size, size); const g = ctxOf(o); g.imageSmoothingEnabled = false; const u = size / 2;
    g.save(); g.transform(1, 0.5, -1, 0.5, u, 0); g.drawImage(top, 0, 0, u, u); g.restore();
    g.save(); g.transform(1, 0.5, 0, 1, 0, u * 0.5); g.drawImage(side, 0, 0, u, u); g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, 0, u, u); g.restore();
    g.save(); g.transform(1, -0.5, 0, 1, u, u); g.drawImage(side, 0, 0, u, u); g.fillStyle = "rgba(0,0,0,0.36)"; g.fillRect(0, 0, u, u); g.restore();
    return o;
  };
  const sprite = (draw) => { const o = canvas(); draw(ctxOf(o)); return o; };
  const stick = sprite((g) => { for (let i = 0; i < 10; i++) { px(g, 3 + i, 12 - i, "#8a5a33"); px(g, 4 + i, 12 - i, "#b88552"); } });
  const axe = sprite((g) => { for (let i = 0; i < 9; i++) { px(g, 2 + i, 13 - i, "#8a5a33"); px(g, 3 + i, 13 - i, "#b88552"); }
    const head = [[8, 2, 5], [7, 3, 7], [8, 4, 6], [9, 5, 5], [10, 6, 3]]; for (const [x, y, w] of head) px(g, x, y, "#9b9ca0", w, 1);
    px(g, 9, 2, "#c4c5c9", 3, 1); px(g, 8, 3, "#c4c5c9", 2, 1); px(g, 11, 7, "#6e6f75", 2, 1); });
  const doorIcon = sprite((g) => { g.drawImage(c.door, 0, 0, 16, 32, 4, 0, 8, 16); });
  const treeIcon = sprite((g) => { px(g, 7, 9, "#a67a4e", 2, 7); px(g, 3, 3, "#55a644", 10, 7); px(g, 5, 1, "#55a644", 6, 2); px(g, 4, 4, "#74c45c", 3, 2); });
  const tapIcon = sprite((g) => { px(g, 6, 3, "#f2c9a8", 3, 9); px(g, 4, 7, "#f2c9a8", 8, 6); px(g, 5, 1, "#ffd54a", 5, 1); px(g, 4, 2, "#ffd54a", 1, 1); px(g, 10, 2, "#ffd54a", 1, 1); });
  const fallIcon = sprite((g) => { for (let i = 0; i < 10; i++) px(g, 2 + i, 11 - Math.floor(i / 2), "#a67a4e", 1, 2); px(g, 10, 3, "#55a644", 5, 5); });
  c.icons = { DOOR: doorIcon, TREE: treeIcon, LOG: isoCube(c.logTop, c.logSide), PLANK: isoCube(c.planks, c.planks), STONE: isoCube(c.stone, c.stone), STICK: stick, AXE: axe, TABLE: isoCube(c.craftTop, c.craftSide), CHOP: tapIcon, TIMBER: fallIcon };

  const T = {};
  for (const k of ["grassTop", "grassSide", "dirt", "stone", "deep", "logSide", "logTop", "planks", "leaves", "craftTop", "craftSide", "door", "wool", "sheepFace", "water", "flowerRed", "flowerYellow", "flowerBlue", "tallGrass", "butterfly"]) T[k] = tex(c[k]);
  T.cracks = c.cracks.map(tex);
  T.icons = c.icons; T.canvases = c;
  return T;
}
