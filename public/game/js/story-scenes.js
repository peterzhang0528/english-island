// Chapters 04–10: independent voxel sets sharing only small construction helpers.
// This module owns geometry and visual actions; the story engine owns time, sound and UI.
import * as THREE from './vendor/three.module.min.js';
import { createTextures } from './textures.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PALETTES = {
  4: ['#b5d9e4', '#e0eddf'], 5: ['#b8dce9', '#f2edda'], 6: ['#bbd9cc', '#e7eedb'],
  7: ['#8acbdd', '#dcefee'], 8: ['#9caecb', '#d8d9e5'], 9: ['#b5c7d4', '#e0e5df'],
  10: ['#c9d8df', '#fff0d7'],
};

function context(chapter, options) {
  const root = new THREE.Group(), hotspots = [], targets = [], shots = [], actions = [], animated = [];
  root.name = `chapter-${chapter.id}-world`;
  // The shared texture helper only draws local pixels. Headless geometry checks need no canvas.
  const T = typeof document === 'undefined' ? {} : createTextures(THREE, 1400 + chapter.id);
  const solid = color => new THREE.MeshLambertMaterial({ color });
  const textured = (key, color) => T[key] ? new THREE.MeshLambertMaterial({ map: T[key] }) : solid(color);
  const M = {
    grass: textured('grassTop', '#86b873'), dirt: textured('dirt', '#99785a'), wood: textured('planks', '#c59a66'),
    log: textured('logSide', '#a18159'), leaves: textured('leaves', '#689c59'), stone: textured('stone', '#a6afb2'),
    wool: textured('wool', '#f4f0df'), cream: solid('#fff0d2'), white: solid('#fffdf3'), dark: solid('#35414a'),
    brown: solid('#7c6048'), sand: solid('#e6d4a8'), teal: solid('#75a8a2'), blue: solid('#89aecb'),
    green: solid('#86ac6e'), coral: solid('#d99380'), red: solid('#ce7768'), gold: solid('#eac673'),
    pink: solid('#e9b7aa'), violet: solid('#b2a2c4'), leaf: solid('#659668'), skin: solid('#e6bf9f'),
    navy: solid('#647f9a'), straw: solid('#d6b577'), roof: solid('#7998a3'), rain: solid('#a6c8d8'),
    water: new THREE.MeshLambertMaterial({ color: '#80bfcb', transparent: true, opacity: .84 }),
    glass: new THREE.MeshLambertMaterial({ color: '#d9e9e4', transparent: true, opacity: .2, depthWrite: false }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffe6a0' }),
    cloud: new THREE.MeshLambertMaterial({ color: '#f6f2e8' }),
    hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  };
  let randomSeed = chapter.id * 811;
  const random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
  function group(x = 0, y = 0, z = 0, parent = root) {
    const object = new THREE.Group(); object.position.set(x, y, z); parent.add(object); return object;
  }
  function box(parent, material, x, y, z, w = 1, h = 1, d = 1) {
    const object = new THREE.Mesh(BOX, material); object.position.set(x, y, z); object.scale.set(w, h, d);
    object.castShadow = object.receiveShadow = true; parent.add(object); return object;
  }
  function instances(points, material, size = [1, 1, 1], parent = root) {
    if (!points.length) return null;
    const mesh = new THREE.InstancedMesh(BOX, material, points.length), matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion(), scale = V(...size);
    points.forEach((point, index) => mesh.setMatrixAt(index, matrix.compose(V(...point), rotation, scale)));
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function terrain(kind = 'meadow') {
    const cells = { grass: [], dirt: [], water: [], sand: [], stone: [] };
    for (let x = -17; x <= 17; x++) for (let z = -22; z <= 13; z++) {
      const coast = kind === 'coast' || kind === 'lighthouse';
      const sea = coast && (x > 1 || z < -13 || x < -14);
      const river = kind === 'bridge' && Math.abs(x - Math.sin(z * .2) * .3) < 2;
      const creek = kind === 'meadow' && x > 10 && x < 14;
      if (sea || river || creek) cells.water.push([x, -.13, z]);
      else {
        const town = kind === 'town' || kind === 'festival' || kind === 'rain';
        const paving = town && Math.abs(x) < 10 && z > -13 && z < 8;
        const beach = coast || (kind === 'bridge' && Math.abs(x) < 3);
        const height = kind === 'meadow' && (Math.abs(x) > 7 || z < -13) ? Math.max(0, Math.round((Math.sin(x * .4) + Math.cos(z * .4)) * .75)) : 0;
        cells[paving ? 'stone' : beach ? 'sand' : 'grass'].push([x, height, z]);
        if (height || Math.abs(x) === 17 || z === -22 || z === 13) cells.dirt.push([x, height - 1, z]);
      }
    }
    for (const [name, points] of Object.entries(cells)) {
      const mesh=instances(points, M[name], name === 'water' ? [1, .12, 1] : [1, 1, 1]);
      if(name==='water'&&mesh){mesh.userData.word='WATER';hotspots.push(mesh);}
    }
    if(kind==='coast'||kind==='lighthouse')box(root,M.water,0,-.25,-8,115,.06,110);
    root.userData.terrainCells = Object.values(cells).reduce((sum, list) => sum + list.length, 0);
  }
  function mark(object, index, offset = [5, 3.7, 7.5]) {
    object.userData.stageIndex = index; object.userData.word = chapter.stages[index].word;
    object.name = `target-${index}-${chapter.stages[index].word.toLowerCase()}`;
    targets[index] = object; hotspots.push(object); root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object), center = bounds.getCenter(new THREE.Vector3());
    // Treat the whole recognizable item as clickable, including gaps in a gate or a rope coil.
    // Invisible ancestor checks in the engine also disable this volume when an item is collected.
    const local = bounds.clone().applyMatrix4(object.matrixWorld.clone().invert());
    const size = local.getSize(new THREE.Vector3()), point = local.getCenter(new THREE.Vector3());
    const volume = box(object, M.hit, point.x, point.y, point.z, Math.max(.3,size.x), Math.max(.18,size.y), Math.max(.3,size.z));
    volume.castShadow = volume.receiveShadow = false; volume.name = 'interaction-volume';
    shots[index] = { pos: center.clone().add(V(...offset)).toArray(), look: center.toArray(), fov: 53 };
    return object;
  }
  function tree(x, z, height = 4, pine = false) {
    const g = group(x, .5, z); box(g, M.log, 0, height * .48, 0, .65, height, .65);
    const points = [];
    if (pine) {
      for (let layer = 0; layer < 4; layer++) { const radius = 1.7 - layer * .36; points.push([0, height * .6 + layer * .65, 0]); box(g, M.leaves, 0, height * .6 + layer * .65, 0, radius * 2, .75, radius * 2); }
    } else {
      for (let y = 0; y < 3; y++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (y < 2 || Math.abs(a) + Math.abs(b) < 2) points.push([a * .9, height - .5 + y * .75, b * .9]);
      instances(points, M.leaves, [1.15, 1.05, 1.15], g);
    }
    g.userData.word='TREE';hotspots.push(g);return g;
  }
  function flower(parent, x, y, z, material = M.coral, scale = 1) {
    const g = group(x, y, z, parent); g.scale.setScalar(scale);
    box(g, M.leaf, 0, .38, 0, .07, .76, .07); box(g, M.leaf, .13, .29, 0, .27, .08, .14).rotation.z = -.4;
    for (const [a, b] of [[-.19, 0], [.19, 0], [0, -.19], [0, .19]]) box(g, material, a, .79 + b, 0, .23, .23, .13);
    box(g, M.gold, 0, .79, .06, .18, .18, .1);g.userData.word='FLOWER';hotspots.push(g);return g;
  }
  function flowers(parent, radius = 1, count = 7) {
    for (let i = 0; i < count; i++) { const angle = i * 2.4; flower(parent, Math.cos(angle) * radius * .5, 0, Math.sin(angle) * radius * .4, [M.coral, M.gold, M.violet][i % 3], .8 + random() * .35); }
  }
  function basket(parent, x = 0, y = 0, z = 0) {
    const g = group(x, y, z, parent); box(g, M.wood, 0, .24, 0, 1.15, .48, .8);
    for (const side of [-1, 1]) { box(g, M.brown, side * .56, .6, 0, .09, .75, .1); box(g, M.straw, 0, .2, side * .41, 1.18, .065, .035); }
    box(g, M.brown, 0, .96, 0, 1.14, .09, .1); return g;
  }
  function crate(parent, x, y, z, size = 1) {
    const g = group(x, y, z, parent); g.scale.setScalar(size); box(g, M.wood, 0, .4, 0, 1, .8, .9);
    for (const side of [-1, 1]) { box(g, M.brown, side * .36, .42, .465, .09, .84, .04); box(g, M.straw, 0, .65, side * .46, 1.04, .08, .04); }
    return g;
  }
  function table(parent, x, y, z, width = 3, depth = 1.5) {
    const g = group(x, y, z, parent); box(g, M.wood, 0, 1.05, 0, width, .2, depth);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(g, M.brown, a * (width / 2 - .2), .5, b * (depth / 2 - .2), .16, 1, .16);
    return g;
  }
  function house(x, z, color = M.cream, width = 4, height = 3) {
    const g = group(x, .5, z); box(g, color, 0, height / 2, 0, width, height, 3.2);
    for (let i = 0; i < 4; i++) box(g, M.roof, 0, height + .15 + i * .3, 0, width + .5 - i * .65, .32, 3.8);
    box(g, M.wood, -.55, .95, 1.62, .9, 1.9, .08); box(g, M.gold, -.25, 1, 1.7, .1, .1, .08);
    for (const xx of [-1.25, 1.15]) { box(g, M.cream, xx, 1.95, 1.65, .9, .9, .08); box(g, M.blue, xx, 1.95, 1.71, .66, .66, .05); box(g, M.white, xx, 1.95, 1.75, .05, .7, .03); }
    box(g, M.stone, 1, height + 1.2, -.7, .6, 1.8, .6); return g;
  }
  function person(x, y, z, color = M.teal, green = false, parent = root) {
    const g = group(x, y, z, parent), skin = green ? M.green : M.skin;
    box(g, color, 0, 1.03, 0, .68, .8, .4); box(g, M.cream, 0, 1.06, .22, .34, .63, .035);
    const legs = [-.18, .18].map(a => { const leg = group(a, .63, 0, g); box(leg, M.navy, 0, -.3, 0, .27, .6, .33); return leg; });
    const arms = [-.48, .48].map(a => { const arm = group(a, 1.3, 0, g); box(arm, skin, 0, -.25, .02, .25, .65, .26); return arm; });
    const head = group(0, 1.82, 0, g); box(head, skin, 0, 0, 0, .73, .72, .64);
    box(head, green ? M.straw : M.brown, 0, .36, 0, .82, .13, .72);
    if (green) box(head, M.straw, 0, .48, 0, .56, .2, .52);
    for (const a of [-.19, .19]) { box(head, M.dark, a, .04, .33, .09, .11, .03); box(head, M.pink, a, -.1, .335, .14, .06, .03); }
    box(head, M.dark, 0, -.18, .34, .16, .035, .03);
    g.userData.arms = arms; g.userData.legs = legs;g.userData.word='FRIEND';hotspots.push(g);return g;
  }
  function sheep(x, y, z, parent = root) {
    const g = group(x, y, z, parent); box(g, M.wool, 0, .85, 0, 1.15, .94, 1.55);
    for (const a of [-.42, .42]) for (const b of [-.54, .54]) box(g, M.brown, a, .29, b, .23, .58, .25);
    box(g, M.wool, 0, 1.05, .95, .73, .72, .6); box(g, M.skin, 0, .91, 1.27, .55, .4, .04);
    for (const a of [-.2, .2]) { box(g, M.dark, a, 1.12, 1.27, .09, .1, .03); box(g, M.skin, a * 2.2, 1.16, .97, .24, .18, .14); }
    box(g, M.pink, 0, .84, 1.3, .16, .09, .04); box(g, M.wool, 0, .94, -.91, .25, .22, .3); return g;
  }
  function boat(x, y, z, parent = root, scale = 1) {
    const g = group(x, y, z, parent); g.scale.setScalar(scale);
    box(g, M.wood, 0, .12, 0, 2.2, .24, 3.2); box(g, M.brown, 0, -.1, 0, 1.65, .24, 2.7);
    for (const a of [-1, 1]) box(g, M.wood, a * 1.04, .43, 0, .18, .64, 3.15);
    box(g, M.wood, 0, .43, -1.48, 2.15, .64, .18); box(g, M.wood, 0, .35, 1.65, 1.4, .48, .5); box(g, M.gold, 0, .32, 1.98, .7, .35, .2);
    for (const zz of [-.7, .7]) box(g, M.wood, 0, .53, zz, 2.1, .16, .37);
    const mast = group(0, .4, -.3, g); box(mast, M.log, 0, 1.8, 0, .12, 3.6, .12);
    const sail = group(.08, 3.2, 0, mast); for (let row = 0; row < 6; row++) box(sail, row % 2 ? M.cream : M.white, .17 + row * .12, -row * .38, 0, .35 + row * .24, .4, .06);
    sail.visible = false; g.userData.sail = sail; g.userData.mast = mast; return g;
  }
  function clouds(count = 5) {
    for (let i = 0; i < count; i++) { const g = group(-22 + i * 11, 13 + i % 3, -23 - (i % 2) * 4); const p = [];
      for (let k = 0; k < 5; k++) p.push([k * 1.2, (k === 2 ? .3 : 0), (k % 2) * .3]); instances(p, M.cloud, [1.9, .65, 1.5], g);g.userData.word='CLOUD';hotspots.push(g); }
  }
  function fence(x, z, width = 8) {
    const g = group(x, .5, z); for (let a = -width / 2; a <= width / 2; a += 1.6) box(g, M.wood, a, .65, 0, .14, 1.3, .14);
    for (const yy of [.4, .95]) box(g, M.wood, 0, yy, 0, width, .12, .1); return g;
  }
  async function move(object, destination, tween, seconds = 1.4, hop = 0) {
    const from = object.position.clone(), to = Array.isArray(destination) ? V(...destination) : destination;
    await tween(seconds, (k, raw = k) => { object.position.lerpVectors(from, to, k); object.position.y += Math.sin(raw * Math.PI) * hop; });
    object.position.copy(to);
  }
  const c = { chapter, root, hotspots, targets, shots, actions, animated, M, group, box, instances, terrain, mark, tree,
    flower, flowers, basket, crate, table, house, person, sheep, boat, clouds, fence, move, random, options };
  c.intro = { pos: [11, 8, 13], look: [0, 1.5, -5], fov: 57 };
  c.finishShot = { pos: [10, 8, 11], look: [0, 1.5, -5], fov: 57 };
  return c;
}

function bridgeScene(c) {
  const { root, M, group, box, mark, terrain, tree, flowers, person, move, actions } = c;
  terrain('bridge'); c.clouds(); [[-10,-13],[-11,4],[9,-15],[12,5],[7,-9]].forEach(([x,z])=>tree(x,z,4.4));
  const bridge = group(0, .6, -4), deck = group(0, 0, 0, bridge), ropes = group(0, 0, 0, bridge);
  for (const xx of [-3.3, 3.3]) box(bridge, M.stone, xx, -.1, 0, .65, .9, 2.7);
  for (const zz of [-1.13, 1.13]) { box(bridge, M.log, 0, -.03, zz, 6.5, .25, .22); for (const xx of [-3, 0, 3]) box(bridge, M.log, xx, .72, zz, .16, 1.5, .16); }
  for (let i=0;i<13;i++) {
    if(i>=5&&i<=7)box(deck, M.wood, -3+i*.5, .19, 0, .46, .19, 2.35);
    else box(bridge,M.wood,-3+i*.5,.19,0,.46,.19,2.35);
  }
  deck.visible=false;
  for(const zz of [-1.14,1.14]) for(let i=0;i<16;i++) box(ropes,M.straw,-3+i*.4,1.16-Math.sin(i/15*Math.PI)*.18,zz,.45,.07,.07);
  ropes.visible=false;
  const nails=group(0,0,0,bridge);for(const xx of[-.5,0,.5])for(const zz of[-.8,.8])box(nails,M.dark,xx,.31,zz,.09,.045,.09);nails.visible=false;
  const planks=group(-5.3,.5,-.5);for(let i=0;i<3;i++)box(planks,M.wood,(i%2)*.12,.12+i*.18,0,2.2,.15,.64);
  const coil=group(-5.5,.65,-7.5);for(let layer=0;layer<3;layer++)for(let side=0;side<4;side++){const a=side*Math.PI/2;box(coil,M.straw,Math.sin(a)*.4,.12+layer*.13,Math.cos(a)*.4,side%2?.12:.92,.11,side%2?.92:.12);}
  const hammer=group(-3.6,1.35,-1.4);box(hammer,M.brown,0,0,0,.13,1.15,.14);box(hammer,M.stone,0,.55,0,.73,.3,.32);hammer.rotation.z=-.35;
  const cart=group(-7.2,.65,-4);box(cart,M.wood,0,.55,0,1.8,.16,2.1);for(const xx of[-.95,.95])box(cart,M.wood,xx,.88,0,.14,.65,2.1);
  cart.rotation.y=-Math.PI/2;
  box(cart,M.wood,0,.88,-1,1.9,.65,.12);for(const xx of[-.78,.78])box(cart,M.brown,xx,.53,1.7,.1,.1,1.55);
  const wheels=[];for(const xx of[-1,1])for(const zz of[-.65,.65]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.16,8),M.brown);w.rotation.z=Math.PI/2;w.position.set(xx,.23,zz);cart.add(w);wheels.push(w);}
  const bouquet=group(0,.7,0,cart);flowers(bouquet,1.2,9);const walker=person(-4.6,.5,-5.6,M.teal,true);c.house(9,-10,M.cream,4,3);
  mark(planks,0);mark(coil,1,[-4,3,-6]);mark(hammer,2);mark(bridge,3,[6,4,7]);mark(cart,4,[5,3,6]);
  actions[0]=async({tween})=>{const boards=[...deck.children];deck.visible=true;boards.forEach((board,i)=>{board.position.y=2.4+i*.08;board.scale.x=.05;});await tween(1.8,(k,raw=k)=>boards.forEach((board,i)=>{const p=Math.max(0,Math.min(1,(raw-i*.035)/.55));board.position.y=.19+(1-p)*2.3;board.scale.x=.46*Math.max(.03,p);}));boards.forEach(board=>{board.position.y=.19;board.scale.x=.46;});planks.visible=false;};
  actions[1]=async({tween})=>{await move(coil,[0,1.8,-4],tween,1.2,.6);ropes.visible=true;ropes.scale.x=.02;await tween(.9,k=>ropes.scale.x=Math.max(.02,k));coil.visible=false;};
  actions[2]=async({tween,burst})=>{const home=hammer.position.clone();await move(hammer,[0,1.7,-3.5],tween,1,.3);nails.visible=true;await tween(1.5,(_k,r)=>{hammer.rotation.z=-.5+Math.sin(r*Math.PI*6)*.7;hammer.position.x=-.7+r*1.4;nails.position.y=(1-r)*.25;});hammer.rotation.z=-.35;burst?.(V(0,1,-4),18,M.straw);await move(hammer,home,tween,.7);};
  actions[3]=async({tween})=>{await move(walker,[-3.2,.82,-4],tween,.9);await tween(2.4,(k,r)=>{walker.position.x=-3.2+k*7.8;walker.position.y=.82+Math.abs(Math.sin(r*Math.PI*8))*.08;walker.userData.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(r*Math.PI*8+i*Math.PI)*.3);});walker.position.y=.5;walker.userData.legs.forEach(leg=>leg.rotation.x=0);for(const x of[-3.2,3.2]){const flag=group(x,2.45,-4);box(flag,M.leaf,0,0,0,.35,.3,.07);} };
  actions[4]=async({tween})=>{await tween(3.3,(k,r)=>{const x=-7.2+k*13.6;cart.position.x=x;cart.position.y=.65+Math.max(0,Math.min(1,(x+4)/.8,(4-x)/.8))*.355;wheels.forEach(w=>w.rotation.x=-r*18);});cart.position.set(6.4,.65,-4);};
  c.intro={pos:[10,8,12],look:[0,1,-4],fov:58};c.finishShot={pos:[1,7,12],look:[1.5,1,-4],fov:57};
}

function marketScene(c) {
  const {M,group,box,mark,terrain,flowers,basket,table,house,person,move,actions}=c;
  terrain('town');c.clouds();house(-8,-11,M.coral,5,3.8);house(0,-14,M.cream,5,4.4);house(8,-11,M.teal,4,3.5);
  function stall(x,z,color){const g=group(x,.5,z);table(g,0,0,0,3.5,1.8);for(const a of[-1.6,1.6])box(g,M.brown,a,1.85,-.65,.13,3.7,.13);for(let i=0;i<8;i++){box(g,i%2?M.cream:color,-1.75+i*.5,3.55,0,.5,.12,2.5);box(g,i%2?M.cream:color,-1.75+i*.5,3.37,1.2,.5,.4,.08);}return g;}
  stall(-5,-5,M.teal);stall(5,-5,M.red);stall(2,-10,M.gold);
  person(-5,.5,-6.2,M.violet,true);person(5,.5,-6.2,M.coral);person(2,.5,-11.1,M.teal);
  const bouquet=group(-6,1.7,-3.7);flowers(bouquet,1.1,8);box(bouquet,M.cream,0,.25,0,.7,.42,.5);
  const hamper=basket(c.root,-3.9,1.65,-4);const trade=table(c.root,-.6,.5,-2,2.8,1.6);
  const apples=group(4.4,1.74,-4);box(apples,M.red,0,.22,0,.52,.48,.5);box(apples,M.brown,0,.51,0,.055,.16,.055);box(apples,M.leaf,.12,.56,0,.23,.06,.12);
  for(let i=0;i<6;i++){box(c.root,M.green,5.6+(i%2)*.4,1.8,-4.9-Math.floor(i/2)*.35,.31,.3,.31);}
  const bread=group(2,1.76,-9);box(bread,M.straw,0,.12,0,1.15,.38,.55);for(const x of[-.35,0,.35])box(bread,M.cream,x,.32,0,.08,.035,.4).rotation.y=-.3;
  const map=group(-1.8,1.8,-8.1);box(map,M.cream,0,0,0,.75,.06,1.05);for(let i=0;i<5;i++)box(map,M.teal,-.27+i*.12,.045,Math.sin(i)*.25,.1,.02,.1);
  const mapFold=group(.38,.04,0,map);box(mapFold,M.cream,.38,0,0,.75,.05,1.05);box(mapFold,M.red,.6,.04,-.2,.18,.025,.18).rotation.y=.7;mapFold.rotation.z=Math.PI;table(c.root,-1.8,.5,-8.1,2.2,1.5);
  for(const x of[-12,12])c.tree(x,3,3.8);for(let i=0;i<9;i++){const pennant=box(c.root,[M.teal,M.coral,M.gold][i%3],-6+i*1.5,5-Math.sin(i/8*Math.PI)*.6,-5,.55,.6,.05);pennant.rotation.z=.12;}
  mark(bouquet,0);mark(hamper,1);mark(apples,2);mark(bread,3,[-5,4,6]);mark(map,4,[4,4,6]);
  actions[0]=async({tween})=>{await move(bouquet,[-5.3,1.75,-5],tween,1.5,.7);bouquet.rotation.y=.4;};
  actions[1]=async({tween})=>move(hamper,[-.6,1.65,-2],tween,1.5,.8);
  actions[2]=async({tween})=>{await move(apples,[-.86,2.15,-2],tween,1.5,1);};
  actions[3]=async({tween})=>{await move(bread,[-.3,2.24,-2.1],tween,1.7,.8);bread.rotation.y=.65;};
  actions[4]=async({tween,burst})=>{await move(map,[-.5,2.6,-1],tween,1.2,.6);await tween(1.1,k=>{map.rotation.x=-k*.7;mapFold.rotation.z=Math.PI*(1-k);map.scale.setScalar(1+k*.35);});burst?.(map.position.clone(),14,M.gold);};
  c.intro={pos:[11,9,12],look:[0,2,-5.5],fov:58};c.finishShot={pos:[8,6,8],look:[-.4,2,-3.5],fov:56};
}

function meadowScene(c) {
  const{M,group,box,mark,terrain,person,sheep,move,actions}=c;terrain('meadow');c.clouds();
  [[-10,-5],[-8,-14],[6,-16],[8,5],[-12,6]].forEach(([x,z])=>c.tree(x,z,4.5,true));
  c.fence(-4.6,-3,6);c.fence(4.6,-3,6);c.fence(0,-10,14);c.house(-10,-10,M.cream,4,2.8);
  const tracks=group(0,.53,1.5);const trackPieces=[];for(let i=0;i<7;i++)for(const side of[-1,1])trackPieces.push(box(tracks,M.brown,side*.2,0,-i*.55,.16,.035,.25));
  const gate=group(-1.5,.5,-3);for(const yy of[.42,1.12])box(gate,M.wood,1.5,yy,0,3,.14,.15);for(const xx of[0,1,2,3])box(gate,M.wood,xx,.75,0,.14,1.5,.16);box(gate,M.gold,2.8,.9,.12,.12,.12,.08);
  const lamb=sheep(2,.5,-6.5);lamb.rotation.y=-.3;const little=sheep(4.4,.5,-7.5);little.scale.setScalar(.65);
  const hay=group(-3.3,.5,-.7);box(hay,M.straw,0,.45,0,1.6,.9,1.15);for(const x of[-.45,.45])box(hay,M.brown,x,.46,0,.09,.93,1.18);
  const wool=group(4.1,1.95,-.4);box(wool,M.wool,0,0,0,1,.75,.85);box(wool,M.coral,0,.4,0,.14,.07,.86);box(wool,M.coral,0,0,.44,.14,.78,.04);c.crate(c.root,4.1,.5,-.4,1.3);
  const farmer=person(-3.3,.5,-6.2,M.teal,true);const delivery=c.basket(c.root,-5,.5,2);for(let i=0;i<30;i++){const x=c.random()*15-7.5,z=c.random()*17-10;if(Math.abs(x)<3||Math.abs(z+3)<1)continue;c.flower(c.root,x,.5,z,[M.gold,M.violet][i%2],.6);}
  mark(tracks,0,[4,5,6]);mark(gate,1,[5,3,7]);mark(lamb,2);mark(hay,3);mark(wool,4,[-4,3.5,6]);
  actions[0]=async({tween})=>{await tween(1.4,(_k,r)=>trackPieces.forEach((piece,i)=>{if(r>i/trackPieces.length){piece.material=M.gold;piece.position.y=.045;}}));};
  actions[1]=async({tween})=>{await tween(1.3,k=>gate.rotation.y=-k*Math.PI*.54);};
  actions[2]=async({tween})=>{await move(lamb,[0,.5,-4.3],tween,1.3,.18);await move(lamb,[0,.5,-.8],tween,1.7,.18);lamb.rotation.y=.3;await move(little,[2,.5,-4],tween,1.2,.15);};
  actions[3]=async({tween})=>{await move(hay,[0,.5,.9],tween,1.3,.5);await tween(1.2,(_k,r)=>{lamb.rotation.x=Math.sin(r*Math.PI)*.2;hay.scale.y=1-.18*r;});lamb.rotation.x=0;};
  actions[4]=async({tween,burst})=>{await move(wool,[-5,1.1,2],tween,1.7,1.1);burst?.(wool.position.clone(),14,M.cream);farmer.userData.arms[1].rotation.z=-1;};
  c.intro={pos:[11,8,13],look:[0,1,-3.5],fov:57};c.finishShot={pos:[9,6,9],look:[-.5,1,-1.5],fov:56};
}

function bayScene(c) {
  const{M,group,box,mark,terrain,boat,move,actions}=c;terrain('coast');c.clouds();
  for(let z=-9;z<=2;z+=.5)box(c.root,M.wood,.2,.55,z,2.6,.2,.45);for(const x of[-1,1.4])for(const z of[-8,-4,0])box(c.root,M.log,x,.1,z,.22,1.6,.22);
  c.house(-8,-9,M.teal,4,3);c.tree(-10,0,4.5);const sailor=c.person(-3.6,.5,-8,M.teal,true);
  const wood=group(-4.5,.5,-1);for(let i=0;i<4;i++)box(wood,M.wood,0,.15+i*.19,0,1.8,.17,.65);
  const folded=group(-4,1.7,-5);for(let i=0;i<4;i++)box(folded,i%2?M.cream:M.wool,0,i*.09,0,1.6-i*.15,.08,.9);c.table(c.root,-4,.5,-5,2.4,1.5);
  const vessel=boat(2.8,.2,-5);const repairs=group(0,0,0,vessel);for(const a of[-1,1])box(repairs,M.gold,a*1.13,.46,0,.08,.36,2.5);repairs.visible=false;
  const wind=group(-.1,2.7,-9);box(c.root,M.wood,-.1,1.6,-9,.12,2.3,.12);const wheel=group(0,0,0,wind);for(let i=0;i<4;i++){const blade=group(0,0,0,wheel);blade.rotation.z=i*Math.PI/2;box(blade,[M.coral,M.gold,M.teal,M.cream][i],.25,.4,0,.55,.8,.08);}box(wind,M.gold,0,0,.1,.2,.2,.15);
  const island=group(10,.1,-15);box(island,M.sand,0,.15,0,7,.5,5);box(island,M.grass,0,.53,0,5.5,.3,3.8);
  const palm=group(1.3,.65,-.5,island);for(let i=0;i<5;i++)box(palm,M.log,i*.15,i*.7,0,.5,.75,.5);for(let i=0;i<5;i++){const leaf=group(.7,3.4,0,palm);leaf.rotation.y=i*Math.PI*.4;box(leaf,M.leaf,1,.1,0,2.6,.25,.65);}
  const landingFlag=group(-1.5,.65,.3,island);box(landingFlag,M.wood,0,1,0,.1,2,.1);const flag=box(landingFlag,M.coral,.45,1.75,0,.9,.55,.07);flag.visible=false;
  const distantTower=group(-.7,.7,-1.05,island);for(let i=0;i<4;i++)box(distantTower,i%2?M.cream:M.red,0,.45+i*.85,0,.95,.85,.9);box(distantTower,M.roof,0,3.65,0,1.2,.18,1.15);box(distantTower,M.gold,0,3.3,0,.65,.45,.6);
  mark(wood,0);mark(folded,1);mark(vessel,2,[6,4,8]);mark(wind,3,[-5,3,7]);mark(island,4,[9,7,12]);
  actions[0]=async({tween})=>{await move(wood,[.2,.85,-4.5],tween,1.5,.7);await tween(.8,k=>repairs.scale.y=Math.max(.05,k));repairs.visible=true;wood.visible=false;};
  actions[1]=async({tween})=>{await move(folded,[2.8,3.9,-5.3],tween,1.7,.6);folded.visible=false;vessel.userData.sail.visible=true;await tween(1,k=>vessel.userData.sail.scale.y=Math.max(.05,k));};
  actions[2]=async({tween})=>{await move(sailor,[.2,.65,-5],tween,1.2);await move(sailor,[2.8,.8,-4.5],tween,1.1,.4);vessel.attach(sailor);};
  actions[3]=async({tween})=>{await tween(2.8,(k,r)=>{wheel.rotation.z=-r*Math.PI*8;vessel.userData.sail.rotation.y=Math.sin(r*Math.PI)*.25;vessel.position.set(2.8+k*4,.2,-5-k*4);});};
  actions[4]=async({tween,burst})=>{await move(vessel,[9,.2,-11.5],tween,2.4);flag.visible=true;flag.scale.x=.05;await tween(.6,k=>flag.scale.x=.9*Math.max(.05,k));burst?.(V(8.5,2,-14.7),20,M.gold);};
  c.animated.push((time)=>{vessel.rotation.z=Math.sin(time*1.7)*.025;vessel.rotation.x=Math.sin(time*1.3)*.018;});
  c.intro={pos:[13,10,12],look:[1,1.5,-6],fov:58};c.finishShot={pos:[19,9,1],look:[9.5,2,-13],fov:57};
}

function lighthouseScene(c) {
  const{M,group,box,mark,terrain,person,boat,move,actions}=c;terrain('lighthouse');c.clouds(4);
  const cliff=group(-2,0,-7);for(let i=0;i<4;i++)box(cliff,M.stone,0,.4+i*.65,0,9-i*.3,.7,9-i*.2);box(cliff,M.grass,0,2.9,0,8,.3,8);
  const tower=group(-1,3.1,-8);for(let i=0;i<7;i++)box(tower,i%3===1?M.red:M.cream,0,.5+i,0,3.4-i*.12,1,3.3-i*.1);
  box(tower,M.stone,0,7.2,0,4,.3,3.9);box(tower,M.roof,0,9.3,0,4.1,.3,4);box(tower,M.roof,0,9.65,0,3.1,.4,3);box(tower,M.gold,0,10,0,.2,.5,.2);
  for(const x of[-1.55,1.55])for(const z of[-1.5,1.5])box(tower,M.brown,x,8.2,z,.12,1.9,.12);
  const lantern=group(-1,11.3,-8);box(lantern,M.dark,0,0,0,.8,1,.8);const flame=box(lantern,M.glow,0,.03,0,.56,.78,.56);flame.visible=false;
  const glass=box(tower,M.glass,0,8.2,0,3.1,1.8,3);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(3.6,15,20,1,true),new THREE.MeshBasicMaterial({color:'#ffe7a0',transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide}));beam.rotation.x=-Math.PI/2;beam.position.z=7.5;const beamPivot=group(-1,11.3,-8);beamPivot.add(beam);beamPivot.visible=false;
  const stairs=group(-5.3,.5,-1.7);for(let i=0;i<7;i++)box(stairs,M.stone,i*.56,.18+i*.18,-i*.35,1.3,.36+i*.36,.8);for(let i=0;i<7;i++)box(stairs,M.cream,i*.56,.39+i*.36,-i*.35,1.3,.06,.8);
  const keeper=person(-5.4,.5,-.4,M.navy,true);
  const key=group(-3.6,5.1,-6);const ring=new THREE.Mesh(new THREE.TorusGeometry(.26,.09,4,8),M.gold);key.add(ring);box(key,M.gold,0,-.5,0,.12,.65,.12);box(key,M.gold,.13,-.65,0,.23,.12,.12);c.table(c.root,-3.6,3.1,-6,1.3,1);
  const door=group(-1.72,3.2,-6.31);box(door,M.wood,.7,1.1,0,1.4,2.2,.12);box(door,M.gold,1.16,1.05,.1,.12,.12,.08);box(tower,M.dark,0,1.2,1.68,1.5,2.4,.06);
  const bell=group(2.3,5,-5.7);for(const x of[-.72,.72])box(c.root,M.brown,2.3+x,4.3,-5.7,.14,2.6,.15);box(c.root,M.wood,2.3,5.6,-5.7,1.65,.16,.2);
  const bellBody=group(0,0,0,bell);box(bellBody,M.gold,0,-.1,0,.65,.65,.65);box(bellBody,M.gold,0,-.45,0,.93,.14,.9);box(bellBody,M.brown,0,-.56,0,.14,.18,.14);box(bell,M.straw,0,-1.1,0,.045,.9,.045);
  const ships=[boat(8,.2,3,c.root,.55),boat(12,.2,-2,c.root,.45)];ships.forEach(s=>s.userData.sail.visible=true);
  mark(stairs,0,[6,5,8]);mark(key,1,[-4,3,6]);mark(door,2,[3,2,7]);mark(lantern,3,[7,4,10]);mark(bell,4,[4,3,7]);
  actions[0]=async({tween})=>{await move(keeper,[-1.9,3.1,-4.2],tween,2.5);};
  actions[1]=async({tween})=>{await move(key,[-.65,4.25,-6],tween,1.3,.4);await tween(.7,k=>key.rotation.z=k*Math.PI/2);key.visible=false;};
  actions[2]=async({tween})=>{await tween(1.3,k=>door.rotation.y=-k*Math.PI*.6);};
  actions[3]=async({tween})=>{flame.visible=true;beamPivot.visible=true;await tween(1.4,k=>{flame.scale.set(.56*Math.max(.1,k),.78*Math.max(.1,k),.56*Math.max(.1,k));beam.material.opacity=.13*k;});};
  actions[4]=async({tween,burst})=>{await tween(1.8,(_k,r)=>bellBody.rotation.z=Math.sin(r*Math.PI*6)*.3*(1-r*.5));bellBody.rotation.z=0;await Promise.all(ships.map((ship,i)=>move(ship,[3.5+i*2,.2,-1-i*2.7],tween,2.2)));burst?.(V(2.3,5,-5.7),16,M.gold);};
  c.animated.push(time=>{if(beamPivot.visible)beamPivot.rotation.y=time*.32;ships.forEach((ship,i)=>ship.rotation.z=Math.sin(time*1.2+i)*.03);});
  c.intro={pos:[12,12,13],look:[-1,6,-7],fov:59};c.finishShot={pos:[15,12,12],look:[-1,6,-7],fov:58};
}

function rainScene(c) {
  const{M,group,box,mark,terrain,house,person,move,actions}=c;terrain('rain');
  house(-7,-11,M.cream,4,3);house(7,-12,M.teal,4.5,3.7);c.tree(-11,2,4);c.tree(11,0,4);
  for(const [x,z,w,d]of[[-1,-1,3,1.5],[4,1,2.5,2],[-5,4,2,1],[1,-8,2,1]])box(c.root,M.water,x,.515,z,w,.025,d);
  const cloud=group(0,8,-7);const cloudy=new THREE.MeshLambertMaterial({color:'#9caab6'});for(let i=0;i<7;i++)box(cloud,cloudy,(i-3)*1.1,(i%3)*.2,0,1.6,.9,1.5);
  const drops=[];for(let i=0;i<18;i++)drops.push(box(cloud,M.rain,(i%6-2.5)*1.1,-1.2-Math.floor(i/6)*1.1,.1,.045,.4,.045));
  const rainbow=group(0,5,-15);for(let band=0;band<4;band++)for(let i=0;i<18;i++){const a=i/17*Math.PI;box(rainbow,[M.coral,M.gold,M.green,M.blue][band],Math.cos(a)*(6-band*.35),Math.sin(a)*(4-band*.3),0,.48,.38,.1);}rainbow.visible=false;
  const shelter=group(-4,.5,-5);box(shelter,M.cream,0,1.15,-.7,3.8,2.3,.3);for(const x of[-1.7,1.7])box(shelter,M.wood,x,1.5,.6,.16,3,.16);
  const roof=group(-4,3.5,-5);for(let i=0;i<5;i++){const tile=box(roof,M.roof,-1.6+i*.8,0,0,.78,.18,3);if(i===1||i===3){tile.position.y=-.55;tile.rotation.z=.35;}}const roofTiles=[...roof.children];
  const cargo=c.crate(c.root,1.9,.5,-.5,1.4);box(cargo,M.coral,0,.43,.475,.16,.86,.04);const porch=group(-4,.5,-2.6);box(porch,M.wood,0,.18,0,3.8,.36,1.6);
  const umbrella=group(5,1,-4.5);box(umbrella,M.brown,0,.7,0,.07,1.5,.07);const canopy=group(0,1.45,0,umbrella);for(let i=0;i<8;i++){const panel=group(0,0,0,canopy);panel.rotation.y=i*Math.PI/4;box(panel,i%2?M.gold:M.coral,.5,0,0,1.15,.15,.55);box(panel,M.cream,.93,-.11,0,.28,.26,.5);}canopy.scale.set(.15,1,.15);
  const friend=person(4.7,.5,-7,M.violet);person(5.7,.5,-7,M.teal,true);
  const letter=group(0,1.75,-8.2);box(letter,M.cream,0,0,0,1.2,.065,.8);const flap=group(0,.045,-.4,letter);box(flap,M.white,0,0,.2,1.2,.04,.4);box(flap,M.coral,0,.04,.25,.25,.025,.25).rotation.y=Math.PI/4;
  const invitation=group(0,0,0,letter);box(invitation,M.white,0,0,0,1,.035,.7);for(let i=0;i<3;i++)box(invitation,[M.coral,M.gold,M.teal][i],-.3+i*.3,.04,0,.16,.025,.16);invitation.visible=false;c.table(c.root,0,.5,-8.2,2,1.4);
  const mail=c.basket(c.root,-1.8,.5,2);for(let i=0;i<3;i++){const p=group(-1.8+(i-1)*.22,1.1,2);box(p,M.cream,0,0,0,.45,.5,.06);p.visible=false;mail.userData.letters??=[];mail.userData.letters.push(p);}
  mark(cloud,0,[7,3,10]);mark(roof,1,[5,4,7]);mark(cargo,2);mark(umbrella,3);mark(letter,4,[4,4,6]);
  actions[0]=async({tween})=>{await tween(2.2,(k,r)=>{cloud.position.x=-k*20;drops.forEach(drop=>drop.visible=r<.5);});cloud.visible=false;rainbow.visible=true;};
  actions[1]=async({tween})=>{await tween(1.5,k=>roofTiles.forEach((tile,i)=>{if(i===1||i===3){tile.position.y=-.55*(1-k);tile.rotation.z=.35*(1-k);}}));};
  actions[2]=async({tween})=>{await move(cargo,[-4,.5,-4.6],tween,1.7,.7);};
  actions[3]=async({tween})=>{await tween(.9,k=>canopy.scale.set(.15+k*.85,1,.15+k*.85));await move(umbrella,[5.2,1.55,-7],tween,1.3,.5);friend.userData.arms[0].rotation.z=.8;};
  actions[4]=async({tween,burst})=>{await tween(.8,k=>flap.rotation.x=-k*Math.PI*.9);invitation.visible=true;await tween(1,k=>{invitation.position.y=.08+k*.8;invitation.rotation.x=-k*.7;});await move(letter,[-1.8,1.25,2],tween,1.8,1.2);mail.userData.letters.forEach(p=>p.visible=true);burst?.(letter.position.clone(),18,M.gold);};
  c.animated.push(time=>{if(cloud.visible)drops.forEach((drop,i)=>drop.position.y=-1.2-((time*3+i*.3)%3.5));});
  c.intro={pos:[12,10,13],look:[0,3,-5],fov:58};c.finishShot={pos:[10,8,12],look:[-.5,2,-5],fov:58};
}

function festivalScene(c) {
  const{M,group,box,mark,terrain,flowers,person,move,actions}=c;terrain('festival');c.clouds();
  c.house(-10,-10,M.coral,4,3.7);c.house(10,-11,M.teal,4,3.7);c.tree(-10,3,4.5);c.tree(10,3,4.5);c.tree(0,-15,5);
  const arch=group(0,.5,-10);for(const x of[-5.2,5.2])box(arch,M.wood,x,2.6,0,.25,5.2,.25);box(arch,M.wood,0,5.1,0,10.7,.25,.3);
  for(let i=0;i<13;i++){const pennant=box(arch,[M.coral,M.gold,M.teal,M.violet][i%4],-4.8+i*.8,4.8-Math.sin(i/12*Math.PI)*.8,.12,.55,.6,.06);pennant.rotation.z=i%2?.1:-.1;}
  const flag=group(-5.4,.5,-2.6);box(flag,M.wood,0,2.4,0,.14,4.8,.14);const cloth=group(.08,1,0,flag);for(let i=0;i<4;i++)box(cloth,[M.coral,M.gold,M.teal,M.violet][i],.55,-i*.2,0,1.1,.2,.06);
  const table=c.table(c.root,0,.5,-4,5.4,2.5);const covering=box(table,M.cream,0,1.18,0,5.5,.045,2.6);covering.visible=false;
  for(const x of[-1.8,0,1.8]){const plate=box(table,M.white,x,1.23,.55,.7,.06,.6);plate.visible=false;}
  const centerpiece=group(0,1.22,-.55,table);box(centerpiece,M.teal,0,.15,0,.45,.3,.35);flowers(centerpiece,.5,5);centerpiece.visible=false;
  const cake=group(4,1.6,-1);box(cake,M.brown,0,.25,0,1.6,.5,1.35);box(cake,M.cream,0,.57,0,1.7,.16,1.43);for(const x of[-.5,0,.5])box(cake,M.red,x,.74,.15,.22,.22,.22);box(cake,M.gold,0,.95,-.2,.07,.45,.07);c.table(c.root,4,.5,-1,2.4,1.8);
  const music=group(5.2,1.7,-6);box(music,M.wood,0,0,0,1.5,.4,1.1);const disc=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.04,24),M.dark);disc.position.y=.25;music.add(disc);box(music,M.gold,0,.28,0,.16,.03,.16);box(music,M.brown,.55,.6,-.25,.07,.75,.07);
  for(let i=0;i<4;i++)box(music,M.gold,.55-i*.13,.95+i*.05,-.25,.2+i*.16,.15+i*.1,.2+i*.16);c.table(c.root,5.2,.5,-6,2.1,1.6);
  const friends=group(0,.5,-8.2);const people=[person(-2.8,0,0,M.teal,true,friends),person(-.9,0,0,M.coral,false,friends),person(.9,0,0,M.violet,false,friends),person(2.8,0,0,M.gold,false,friends)];
  const gardens=[group(-3,.5,-6.6),group(3,.5,-6.6),group(-5,.5,1)];gardens.forEach(g=>flowers(g,1.5,9));
  // Objects from earlier adventures are real display pieces around the festival.
  const memories=c.table(c.root,-5,.5,-6.5,2.7,1.4);const axe=group(-.6,1.65,0,memories);box(axe,M.brown,0,0,0,.12,.8,.12);box(axe,M.stone,.16,.4,0,.5,.28,.12);axe.rotation.z=-.4;
  const modelBoat=c.boat(.55,1.2,0,memories,.25);modelBoat.userData.sail.visible=true;
  const modelBridge=group(0,1.3,.3,memories);for(let i=0;i<5;i++)box(modelBridge,M.wood,-.4+i*.2,0,0,.18,.08,.4);
  const confetti=group(0,7,-4);for(let i=0;i<54;i++){const paper=box(confetti,[M.coral,M.gold,M.teal,M.violet][i%4],(c.random()-.5)*10,c.random()*3,(c.random()-.5)*5,.1,.16,.035);paper.rotation.z=c.random()*Math.PI;}confetti.visible=false;
  let dancing=false,playing=false;
  mark(flag,0,[5,3,7]);mark(table,1,[6,5,8]);mark(cake,2);mark(music,3,[-5,3.7,7.5]);mark(friends,4,[7,7,8]);
  actions[0]=async({tween})=>{await tween(1.5,k=>cloth.position.y=1+k*3.25);};
  actions[1]=async({tween})=>{covering.visible=true;covering.scale.x=.05;await tween(1.2,k=>covering.scale.x=5.5*Math.max(.01,k));table.children.slice(6).forEach(object=>object.visible=true);};
  actions[2]=async({tween})=>{await move(cake,[0,1.76,-4.2],tween,1.7,.9);const slices=[-1.8,0,1.8].map(x=>{const slice=group(0,2.05,-4.2);box(slice,M.brown,0,.1,0,.5,.2,.45);box(slice,M.cream,0,.25,0,.54,.09,.48);box(slice,M.red,0,.35,0,.15,.15,.15);return{slice,to:V(x,1.8,-3.45)};});await Promise.all(slices.map(({slice,to})=>move(slice,to,tween,1,.35)));cake.scale.setScalar(.76);};
  actions[3]=async({tween})=>{playing=true;await tween(1.5,(_k,r)=>disc.rotation.y=r*Math.PI*10);};
  actions[4]=async({tween,burst})=>{const homes=people.map(p=>p.position.clone());await tween(2.1,(k,r)=>people.forEach((p,i)=>{p.position.lerpVectors(homes[i],V((i-1.5)*1.5,0,i%2?1.8:.5),k);p.position.y=Math.abs(Math.sin(r*Math.PI*4))*.14;p.userData.arms[1].rotation.z=-.9-k*.3;}));people.forEach(p=>p.position.y=0);dancing=true;confetti.visible=true;burst?.(V(0,4.6,-4),36,M.gold);await tween(2,(_k,r)=>{confetti.position.y=7-r*4;confetti.children.forEach((p,i)=>p.rotation.z+=.06*(i%2?1:-1));});};
  c.animated.push((time,dt)=>{if(playing)disc.rotation.y-=dt*5;if(dancing)people.forEach((p,i)=>{p.position.y=Math.abs(Math.sin(time*2.4+i))*.12;p.userData.arms[1].rotation.z=-1+Math.sin(time*3+i)*.18;});});
  c.intro={pos:[12,9,13],look:[0,2,-5],fov:58};c.finishShot={pos:[11,9,12],look:[0,2.2,-5],fov:58};
}

const BUILDERS = { 4: bridgeScene, 5: marketScene, 6: meadowScene, 7: bayScene, 8: lighthouseScene, 9: rainScene, 10: festivalScene };

export function createStoryScene(chapter, { touch = false, reduced = false } = {}) {
  if (!BUILDERS[chapter?.id] || chapter.stages?.length !== 5) throw new Error('A story scene requires a supported chapter and five stages');
  const c = context(chapter, { touch, reduced }); BUILDERS[chapter.id](c);
  c.root.updateMatrixWorld(true);
  const finished = new Set(); let running = false;
  return {
    root: c.root, hotspots: c.hotspots, targets: c.targets, intro: c.intro, shots: c.shots, finishShot: c.finishShot,
    skyColor: PALETTES[chapter.id][0], fogColor: PALETTES[chapter.id][1],
    async perform(index, services) {
      if (!Number.isInteger(index) || index < 0 || index >= 5 || running || finished.has(index)) return;
      if (index > 0 && !finished.has(index - 1)) return;
      running = true;
      try { await c.actions[index](services); finished.add(index); c.root.updateMatrixWorld(true); }
      finally { running = false; }
    },
    tick(time, dt) { if (!reduced && !running) for (const update of c.animated) update(time, dt); },
  };
}
