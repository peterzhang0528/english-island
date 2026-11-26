import { land, PLACES, TEAM } from './buddy-coop-rules.js';

// Original, dependency-free procedural illustration. Logical tiles are also
// used for input and collision, so decorative water is never walkable.
export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  const project = (c, r) => ({ x: 430 + (c - r) * 31, y: 125 + (c + r) * 16 });
  const polygon = (points, color) => {
    ctx.fillStyle = color; ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath(); ctx.fill();
  };
  function cube(x, y, w, d, h, top, left, right) {
    polygon([[x - w, y], [x, y + d], [x, y + d + h], [x - w, y + h]], left);
    polygon([[x, y + d], [x + w, y], [x + w, y + h], [x, y + d + h]], right);
    polygon([[x, y - d], [x + w, y], [x, y + d], [x - w, y]], top);
  }
  function text(label, x, y, color = '#fff8e4', size = 12) {
    ctx.font = `600 ${size}px Arial`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(label, x, y);
  }
  function tree(c, r, variant = 0) {
    const { x, y } = project(c, r);
    ctx.fillStyle = '#234e4630'; ctx.beginPath(); ctx.ellipse(x + 14, y + 7, 30, 12, 0, 0, Math.PI * 2); ctx.fill();
    cube(x, y - 9, 6, 3, 18, '#b39769', '#917c51', '#73694b');
    cube(x, y - 39, 25, 13, 25, variant ? '#a6b771' : '#7eaa71', '#608d62', '#507d60');
    cube(x - 2, y - 61, 19, 10, 22, variant ? '#b4c47d' : '#99b879', '#739b65', '#648e62');
    cube(x + 3, y - 78, 12, 6, 17, '#b7c88b', '#89a970', '#7a9e69');
  }
  function star(x, y, radius, color) {
    const points = [];
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? radius * .25 : radius; points.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    polygon(points, color);
  }
  const displayed = {};
  function actor(who, at, name, color, time, still) {
    const p = displayed[who] ??= { c: at.c, r: at.r };
    if (!still) { p.c += (at.c - p.c) * .24; p.r += (at.r - p.r) * .24; }
    const { x, y } = project(p.c, p.r), moving = Math.abs(at.c - p.c) + Math.abs(at.r - p.r) > .08;
    const bob = moving ? Math.sin(time * 20) * 2 : Math.sin(time * 2 + x) * .6;
    ctx.fillStyle = '#25483f35'; ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    cube(x - 5, y - 10 + bob, 4, 2, 11, '#3d5752', '#3d5752', '#2d4643');
    cube(x + 5, y - 10 - bob, 4, 2, 11, '#3d5752', '#3d5752', '#2d4643');
    cube(x, y - 29 + bob, 12, 6, 19, color, color, '#365548');
    cube(x, y - 45 + bob, 11, 5.5, 15, '#f2d5ab', '#dbb68a', '#c59d76');
    cube(x, y - 49 + bob, 12, 6, 7, who === 'nova' ? '#60516a' : who === 'pip' ? '#b58d51' : '#6c5742', '#756049', '#534b40');
    ctx.fillStyle = '#38453e'; ctx.fillRect(x - 6, y - 40 + bob, 2, 3); ctx.fillRect(x + 3, y - 40 + bob, 2, 3);
    ctx.fillStyle = '#faf9eedd'; ctx.beginPath(); ctx.roundRect(x - 28, y - 77, 56, 18, 8); ctx.fill(); text(name, x, y - 64, '#395444', 9);
  }
  function draw(state, dt = 0) {
    const { width, height } = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(width * ratio), bh = Math.round(height * ratio);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    ctx.setTransform(canvas.width / 1000, 0, 0, canvas.height / 680, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 1000, 680); sky.addColorStop(0, '#b0cfc1'); sky.addColorStop(1, '#75b5b3'); ctx.fillStyle = sky; ctx.fillRect(0, 0, 1000, 680);
    const t = state.time;
    ctx.strokeStyle = '#e8f3dc45'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 100; i++) { const x = (i * 137.3) % 1050, y = (i * 73.7) % 700; ctx.beginPath(); ctx.ellipse(x + Math.sin(t * .4 + i) * 4, y, 7 + i % 11, 2, 0, 0, Math.PI); ctx.stroke(); }
    // Soft island shadows.
    ctx.fillStyle = '#316e6530';
    for (const [c, r, w, h] of [[3, 6, 227, 110], [11.5, 4, 215, 125]]) { const p = project(c, r); ctx.beginPath(); ctx.ellipse(p.x + 8, p.y + 30, w, h, 0, 0, Math.PI * 2); ctx.fill(); }
    const tiles = [];
    for (let c = 0; c <= 14; c++) for (let r = 0; r <= 9; r++) if (land(c, r, state.built)) tiles.push({ c, r });
    tiles.sort((a, b) => a.c + a.r - b.c - b.r);
    for (const { c, r } of tiles) {
      const p = project(c, r), bridge = c === 7 || c === 8;
      const edge = !bridge && [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([dc, dr]) => !land(c + dc, r + dr, false));
      cube(p.x, p.y, 31, 16, bridge ? 6 : 24, bridge ? '#c6a16a' : edge ? '#dfd5a4' : ['#afbd7a', '#a9b875', '#b4c180'][(c * 3 + r) % 3], bridge ? '#9d7950' : '#baa978', bridge ? '#886749' : '#9a9768');
      if (!edge && !bridge && (c * 11 + r * 7) % 9 === 0) { ctx.strokeStyle = '#819e6270'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x - 9, p.y - 5); ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x - 4, p.y - 5); ctx.stroke(); }
    }
    if (!state.built) { for (const c of [6.7, 8.3]) { const p = project(c, 5); cube(p.x, p.y, 18, 10, 7, '#b59a70', '#8b7856', '#786c50'); } text('BROKEN BRIDGE', 467, 348, '#405f52', 8); }
    // Island scenery, authored original geometry.
    for (const [c, r, v] of [[0, 3, 0], [1, 2, 1], [0, 6, 0], [4, 2, 1], [5, 3, 0], [2, 9, 1], [6, 9, 0], [10, 0, 0], [13, 1, 1], [14, 3, 0], [14, 7, 0], [9, 8, 1]]) tree(c, r, v);
    // Timber stack.
    const timber = project(2, 4);
    if (!state.wood) for (let i = 0; i < 3; i++) cube(timber.x + (i % 2) * 5, timber.y - i * 6, 21, 7, 5, '#c7a376', '#967b54', '#a5885c');
    // Switch and cable to lantern.
    const sw = project(10, 5), beacon = project(12, 2);
    ctx.strokeStyle = '#787d5188'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sw.x, sw.y); ctx.lineTo(beacon.x, beacon.y); ctx.stroke();
    cube(sw.x, sw.y - 2, 17, 8, 5, state.holding ? '#f2d281' : '#9a9b7f', '#767e60', '#687157');
    star(sw.x, sw.y - 3, 9, state.holding ? '#fff1bc' : '#d5d9bd');
    // Star lantern tower.
    cube(beacon.x, beacon.y - 3, 29, 15, 8, '#d6cbae', '#afa78d', '#9c9a7f');
    cube(beacon.x, beacon.y - 48, 16, 8, 46, '#e3d7b9', '#c9bc9e', '#afa68e');
    cube(beacon.x, beacon.y - 66, 19, 10, 21, '#c38e68', '#af7b57', '#936a51');
    cube(beacon.x, beacon.y - 100, 22, 11, 35, state.lit ? '#ffe6a3' : '#9fae91', state.lit ? '#f2c979' : '#839780', state.lit ? '#dfb669' : '#6d8474');
    cube(beacon.x, beacon.y - 109, 28, 14, 9, '#788c6b', '#5b765d', '#4f6956');
    star(beacon.x, beacon.y - 132, 16, state.lit ? '#fff0b7' : '#dedbb0');
    if (state.lit) {
      const glow = ctx.createRadialGradient(beacon.x, beacon.y - 98, 0, beacon.x, beacon.y - 98, 130); glow.addColorStop(0, '#ffe7a65c'); glow.addColorStop(1, '#ffe7a600'); ctx.fillStyle = glow; ctx.fillRect(beacon.x - 140, beacon.y - 238, 280, 280);
      for (let i = 0; i < 22; i++) star((i * 113 + 90) % 960 + 20, (i * 43 + 20) % 160 + 30, 3 + i % 4, '#fff7d5');
    }
    // Picnic blanket, sandwiches, basket.
    const picnic = project(12, 7);
    polygon([[picnic.x, picnic.y - 26], [picnic.x + 46, picnic.y - 2], [picnic.x, picnic.y + 22], [picnic.x - 46, picnic.y - 2]], '#e4d5b2');
    for (const n of [-1, 0, 1]) { ctx.strokeStyle = '#bd8d7066'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(picnic.x - 30 + n * 12, picnic.y - 8 - n * 6); ctx.lineTo(picnic.x + 12 + n * 12, picnic.y + 13 - n * 6); ctx.stroke(); }
    cube(picnic.x, picnic.y - 3, 9, 5, 8, '#bd986b', '#a78355', '#94794f');
    cube(picnic.x - 23, picnic.y - 8, 6, 3, 5, '#d9af63', '#ba8d4b', '#c79c51');
    // Small flowers.
    for (const [c, r] of [[3, 3], [5, 8], [9, 2], [13, 6], [10, 7]]) { const p = project(c, r); for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#edce93', '#eab595', '#eee4c0'][i]; ctx.beginPath(); ctx.arc(p.x + i * 7 - 7, p.y - 5 + i % 2 * 4, 3, 0, Math.PI * 2); ctx.fill(); } }
    const actors = [{ who: 'you', at: state.player, name: state.name, color: '#e9e2c4' }, ...Object.entries(state.actors).map(([who, at]) => ({ who, at, name: TEAM[who].name, color: TEAM[who].color }))];
    actors.sort((a, b) => a.at.c + a.at.r - b.at.c - b.at.r).forEach(a => actor(a.who, a.at, a.name, a.color, t, state.paused && dt !== -1));
    // Subtle map labels avoid obscuring the characters.
    for (const [key, title] of [['timber', 'TIMBER GROVE'], ['beacon', 'STAR LANTERN'], ['picnic', 'PICNIC CLEARING']]) { const p = project(PLACES[key].c, PLACES[key].r); text(title, p.x, p.y + (key === 'beacon' ? 45 : 42), '#48674e', 8); }
    text('S U N S E T   C O V E', 220, 565, '#e2eee0', 10);
    // Compass, with no interactive affordance.
    text('N', 915, 546, '#e4efe0', 9); star(915, 572, 20, '#e2eee09c');
  }
  function tileAt(event) {
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width * 1000 - 430, y = (event.clientY - rect.top) / rect.height * 680 - 125;
    return { c: Math.round((x / 31 + y / 16) / 2), r: Math.round((y / 16 - x / 31) / 2) };
  }
  return { draw, tileAt, reset() { for (const key of Object.keys(displayed)) delete displayed[key]; } };
}
