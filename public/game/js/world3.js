// Chapter 03: an open island morning. Walk freely, finish quests in a flexible order, and keep the task list on screen.
import * as THREE from './vendor/three.module.min.js';
import { createTextures } from './textures.js';
import { sfx } from './sfx.js';
import { voice } from './voice.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), canvas = $('#world');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const ZH = {
 'PINE CONE':'松果', LOG:'木头', TREE:'树', TABLE:'工作台', BIRDHOUSE:'鸟屋', BIRD:'小鸟',
 SHEEP:'小羊', FRIEND:'朋友', FLOWER:'花', WATER:'水', CLOUD:'云', SUN:'太阳', GRASS:'草'
};
const ORDER = ['PINE CONE','LOG','BIRDHOUSE','BIRD','SHEEP','FRIEND','TREE','TABLE','FLOWER','WATER'];
const QUEST = {
 cones:{need:3,word:'PINE CONE'},
 logs:{need:2,word:'LOG'},
 house:{need:1,word:'BIRDHOUSE'},
 watch:{need:1,word:'BIRD'},
 invite:{need:1,word:'BIRD'}
};
const state = {
 step:0, words:[], sentences:[], busy:false, current:null,
 cones:0, logs:0, house:false, watched:false, invited:false,
 started:0, elapsed:0, hinted:{}
};
let paused = false, gameTime = 0, previousTime = performance.now(), finishedShot = null, lastStatus = '';
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#d7ead8', 32, 86);
const camera = new THREE.PerspectiveCamera(58, 1, .1, 160);
const world = new THREE.Group(); scene.add(world, camera);
const T = createTextures(THREE);
const lam = color => new THREE.MeshLambertMaterial({color});
const tex = map => new THREE.MeshLambertMaterial({map});
const M = {
 grass:[tex(T.grassSide),tex(T.grassSide),tex(T.grassTop),tex(T.dirt),tex(T.grassSide),tex(T.grassSide)],
 dirt:tex(T.dirt), wood:tex(T.planks), log:tex(T.logSide), leaves:tex(T.leaves), stone:tex(T.stone),
 table:[tex(T.craftSide),tex(T.craftSide),tex(T.craftTop),tex(T.planks),tex(T.craftSide),tex(T.craftSide)],
 cream:lam('#fff4d5'), white:lam('#fffdf1'), brown:lam('#694e3e'), dark:lam('#29382d'),
 red:lam('#cf6750'), leaf:lam('#73a353'), pine:lam('#3f6a3a'), straw:lam('#dcae48'), gold:lam('#ffe083'),
 green:lam('#86ae68'), teal:lam('#55a4a0'), pants:lam('#6475a3'), blue:lam('#4d7eb8'), peach:lam('#f0c7a4'),
 cone:lam('#8b5a2b'), water:new THREE.MeshLambertMaterial({map:T.water,transparent:true,opacity:.86}),
 cloud:new THREE.MeshBasicMaterial({color:'#fffdf0'})
};
const BOX = new THREE.BoxGeometry(1,1,1), hot = [];
const HEIGHT = new Map(), BLOCKED = new Set(), WATER = new Set();
const cellKey = (x,z) => `${Math.round(x)},${Math.round(z)}`;
let seed = 41;
const rnd = () => (seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
function box(parent, material, x,y,z, w=1,h=1,d=1) {
 const mesh = new THREE.Mesh(BOX,material); mesh.position.set(x,y,z); mesh.scale.set(w,h,d);
 mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function target(group,kind,word) { group.userData={...group.userData,kind,word}; hot.push(group); return group; }
function groupAt(x,y,z) { const g=new THREE.Group(); g.position.set(x,y,z); world.add(g); return g; }
function instances(positions,material,scale=[1,1,1]) {
 const mesh=new THREE.InstancedMesh(BOX,material,positions.length), matrix=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(...scale);
 positions.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(new THREE.Vector3(...p),q,s)));
 mesh.castShadow=true; mesh.receiveShadow=true; world.add(mesh); return mesh;
}
function blockAround(x,z,radius=0.8) {
 for (let ix=Math.floor(x-radius); ix<=Math.ceil(x+radius); ix++) {
  for (let iz=Math.floor(z-radius); iz<=Math.ceil(z+radius); iz++) {
   if (Math.hypot(ix-x, iz-z) <= radius+0.15) BLOCKED.add(cellKey(ix,iz));
  }
 }
}
function heightAt(x,z) { return HEIGHT.get(cellKey(x,z)) ?? 0; }
function blockedAt(x,z) {
 if (Math.hypot(x, z) > 16.8) return true;
 const key=cellKey(x,z);
 return BLOCKED.has(key) || WATER.has(key);
}

// A slightly open meadow with a pond, pine grove, and a clear workshop lawn.
const skyGeo=new THREE.SphereGeometry(110,24,16), colors=[];
const top=new THREE.Color('#89c0ea'), horizon=new THREE.Color('#eef3d4');
for (let i=0;i<skyGeo.attributes.position.count;i++) {
 const y=skyGeo.attributes.position.getY(i)/110;
 const c=horizon.clone().lerp(top, Math.max(0,y));
 colors.push(c.r,c.g,c.b);
}
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false})));
scene.add(new THREE.HemisphereLight('#f4f5e4','#6f8a54',1.45));
const sun=new THREE.DirectionalLight('#fff1c8',2.25); sun.position.set(-16,28,12); sun.castShadow=true;
sun.shadow.mapSize.set(touch?1024:2048, touch?1024:2048);
Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:1,far:70});
sun.shadow.bias=-.0004; sun.shadow.normalBias=.04; scene.add(sun);

const grass=[], dirt=[], path=[], pond=[];
for (let x=-14;x<=14;x++) for (let z=-14;z<=13;z++) {
 const edge=Math.hypot(x,z)>12.4;
 const h=edge?Math.max(0, Math.round((Math.sin(x*.31)+Math.cos(z*.29)+1.1)*.55)):0;
 const water=x>6&&x<12&&z>4&&z<10&&Math.hypot(x-9,z-7)<2.6;
 HEIGHT.set(cellKey(x,z), water?0:h);
 if (water) { pond.push([x,.2,z]); dirt.push([x,-.6,z]); WATER.add(cellKey(x,z)); }
 else if ((Math.abs(x)<1.2&&z>-4&&z<8) || (z===-1&&x>-5&&x<5) || (x===-4&&z>-8&&z<2)) path.push([x,0,z]);
 else grass.push([x,h,z]);
 if (edge) for (let y=-1;y<h;y++) dirt.push([x,y,z]);
}
instances(grass,M.grass); instances(dirt,M.dirt); instances(path,M.dirt,[1,.99,1]);
target(instances(pond,M.water,[1,.18,1]),'water','WATER');

function pineTree(x,z,height=6) {
 const g=groupAt(x,.5,z), logs=[], leaves=[];
 for (let y=.5;y<height;y++) logs.push([0,y,0]);
 for (let y=height-1;y<=height+1;y++) {
  const span = y===height+1?1:1.2;
  for (let xx=-1;xx<=1;xx++) for (let zz=-1;zz<=1;zz++) {
   if (Math.hypot(xx,zz)>span) continue;
   leaves.push([xx,y,zz]);
  }
 }
 for (const [list,material] of [[logs,M.log],[leaves,M.pine]]) {
  const mesh=new THREE.InstancedMesh(BOX,material,list.length), matrix=new THREE.Matrix4();
  list.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...p)));
  mesh.castShadow=mesh.receiveShadow=true; g.add(mesh);
 }
 blockAround(x,z,1.05); target(g,'tree','TREE'); return g;
}
[[-9,-3,7],[-12,2,6],[10,-7,7],[12,1,6],[-7,-11,6],[8,9,5],[-13,-8,7]].forEach(p=>pineTree(...p));
function leafTree(x,z,height=4) {
 const g=groupAt(x,.5,z), logs=[], leaves=[];
 for (let y=.5;y<height;y++) logs.push([0,y,0]);
 for (let y=height-1;y<=height+1;y++) for (let xx=-1;xx<=1;xx++) for (let zz=-1;zz<=1;zz++) {
  if (y===height+1&&Math.abs(xx)+Math.abs(zz)>1) continue; leaves.push([xx,y,zz]);
 }
 for (const [list,material] of [[logs,M.log],[leaves,M.leaves]]) {
  const mesh=new THREE.InstancedMesh(BOX,material,list.length), matrix=new THREE.Matrix4();
  list.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...p)));
  mesh.castShadow=mesh.receiveShadow=true; g.add(mesh);
 }
 blockAround(x,z,.9); target(g,'tree','TREE');
}
[[5,-14,4],[-3,12,4],[14,-12,5],[-15,8,4]].forEach(p=>leafTree(...p));

const clouds=[];
for (let i=0;i<4;i++) {
 const g=groupAt(-28+i*10, 16+rnd()*4, -24+rnd()*10);
 for (let k=0;k<5;k++) box(g,M.cloud,(k-2)*1.6,rnd()*.35,rnd(),2.4,.75,1.7);
 target(g,'cloud','CLOUD'); clouds.push(g);
}
const flowers=[];
for (let i=0;i<22;i++) {
 const x=rnd()*28-14, z=rnd()*26-14;
 if (Math.hypot(x,z)<2.5 || WATER.has(cellKey(x,z)) || (Math.abs(x)<2&&z>-3&&z<8)) continue;
 const g=groupAt(x,.5,z);
 box(g,M.leaf,0,.2,0,.07,.45,.07);
 box(g,i%3===0?M.red:M.gold,0,.48,0,.27,.15,.27);
 target(g,'flower','FLOWER'); flowers.push(g);
}

const table=target(groupAt(0,.5,-2),'table','TABLE');
box(table,M.table[2],0,.86,0,1.55,.12,1.55);
box(table,M.wood,0,.4,0,1.5,.8,1.5);
for (const [x,z] of [[-.58,-.58],[.58,-.58],[-.58,.58],[.58,.58]]) box(table,M.wood,x,.18,z,.16,.36,.16);
blockAround(0,-2,1.1);

const birdhouse=target(groupAt(.35,1.55,-1.35),'birdhouse','BIRDHOUSE');
box(birdhouse,M.straw,0,.35,0,.7,.08,.7);
box(birdhouse,M.wood,0,.85,0,.55,.8,.5);
box(birdhouse,M.brown,0,1.35,0,.78,.16,.7);
box(birdhouse,M.dark,0,.8,.28,.18,.18,.04);
box(birdhouse,M.wood,0,0,0,.12,.7,.12);
birdhouse.visible=false;

function coneModel() {
 const g=new THREE.Group();
 box(g,M.cone,0,.16,0,.22,.28,.22);
 box(g,M.brown,0,.34,0,.16,.16,.16);
 box(g,M.straw,0,.08,0,.26,.08,.26);
 return g;
}
const pineCones=[[-8.2,-1.8],[-11.1,2.7],[9.2,-5.8]].map(([x,z],index)=>{
 const g=target(groupAt(x,.5,z),'cone','PINE CONE');
 g.add(coneModel());
 g.userData.index=index; g.userData.collected=false;
 return g;
});

function logModel() {
 const g=new THREE.Group();
 box(g,M.log,0,.22,0,1.4,.36,.36);
 box(g,M.brown,-.72,.22,0,.08,.34,.34);
 box(g,M.brown,.72,.22,0,.08,.34,.34);
 return g;
}
const fallenLogs=[[3.6,4.1],[-3.4,-8.2]].map(([x,z],index)=>{
 const g=target(groupAt(x,.5,z),'wood','LOG');
 g.add(logModel());
 g.rotation.y=index?-.5:.4;
 g.userData.index=index; g.userData.collected=false;
 return g;
});

const sheep=target(groupAt(6.2,.5,2.4),'sheep','SHEEP');
box(sheep,M.white,0,0.85,0,1.05,.7,1.35);
for (const x of [-.32,.32]) for (const z of [-.45,.45]) box(sheep,M.cream,x,.28,z,.22,.55,.24);
const sheepHead=new THREE.Group(); sheepHead.position.set(0,1.15,.85); sheep.add(sheepHead);
box(sheepHead,M.cream,0,0,0,.55,.5,.55);
for (const x of [-.18,.18]) box(sheepHead,M.dark,x,.06,.28,.08,.08,.03);
box(sheepHead,M.pink,0,-.12,.3,.2,.08,.08);
for (const x of [-.32,.32]) box(sheepHead,M.cream,x,.28,-.05,.14,.22,.1);
blockAround(6.2,2.4,.7);

const bird=target(groupAt(2.2,2.7,-6.1),'bird','BIRD');
box(bird,M.red,0,0,0,.42,.32,.5);
box(bird,M.red,.02,.22,.18,.28,.22,.28);
box(bird,M.gold,.02,.16,.34,.12,.08,.16);
for (const x of [-.08,.08]) box(bird,M.dark,x,.26,.3,.05,.05,.03);
const wingL=new THREE.Group(); wingL.position.set(-.28,0,0); bird.add(wingL); box(wingL,M.red,0,0,0,.12,.08,.36);
const wingR=new THREE.Group(); wingR.position.set(.28,0,0); bird.add(wingR); box(wingR,M.red,0,0,0,.12,.08,.36);
bird.userData.wings=[wingL,wingR]; bird.userData.home=new THREE.Vector3(2.2,2.7,-6.1);

const friend=target(groupAt(-2.6,.5,-0.4),'friend','FRIEND'); friend.scale.setScalar(1.08); friend.rotation.y=.4;
box(friend,M.teal,0,.96,0,.68,.78,.4); box(friend,M.cream,0,.9,.215,.48,.65,.04); box(friend,M.red,0,1.06,.245,.1,.1,.02);
for (const x of [-.18,.18]) box(friend,M.pants,x,.3,0,.3,.6,.36);
const friendHead=new THREE.Group(); friendHead.position.y=1.69; friend.add(friendHead);
box(friendHead,M.green,0,0,0,.74,.71,.66); box(friendHead,M.leaf,0,.28,-.03,.76,.16,.64);
for (const x of [-.2,.2]) { box(friendHead,M.dark,x,.04,.34,.11,.12,.025); box(friendHead,M.pink,x,-.09,.34,.14,.07,.025); }
box(friendHead,M.dark,0,-.14,.343,.2,.08,.02);
const arms=[-.49,.49].map(x=>{ const g=new THREE.Group(); g.position.set(x,1.23,0); friend.add(g); box(g,M.green,0,-.22,.1,.26,.65,.28); return g; });
blockAround(-2.6,-0.4,.7);

const player=groupAt(0,.5,7);
box(player,M.blue,0,.95,0,.62,.8,.38);
for (const x of [-.16,.16]) box(player,M.pants,x,.32,0,.28,.64,.32);
const playerHead=new THREE.Group(); playerHead.position.y=1.66; player.add(playerHead);
box(playerHead,M.peach,0,0,0,.62,.62,.58);
box(playerHead,M.brown,0,.28,0,.66,.22,.6);
for (const x of [-.16,.16]) box(playerHead,M.dark,x,.05,.3,.08,.08,.03);
box(playerHead,M.pink,0,-.16,.3,.16,.06,.03);
const playerArms=[-.46,.46].map(x=>{ const g=new THREE.Group(); g.position.set(x,1.2,0); player.add(g); box(g,M.peach,0,-.2,0,.22,.55,.22); return g; });
player.userData.kind='player';

const ring=new THREE.Mesh(new THREE.RingGeometry(.65,.78,48), new THREE.MeshBasicMaterial({color:'#ffcf55',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));
ring.rotation.x=-Math.PI/2; ring.visible=false; scene.add(ring);
const arrow=new THREE.Mesh(new THREE.ConeGeometry(.16,.27,4), new THREE.MeshBasicMaterial({color:'#ffdb73'}));
arrow.rotation.z=Math.PI; arrow.visible=false; scene.add(arrow);
let ringTarget=null, ringSize=1;
function setTarget(object,size=1){ ringTarget=object; ringSize=size; ring.visible=arrow.visible=!!object; }

const tweens=[], particles=[];
function tween(seconds,fn){ return new Promise(resolve=>tweens.push({start:gameTime,duration:reduced?Math.min(seconds,.18):seconds,fn,resolve})); }
const wait=seconds=>tween(seconds,()=>{});
function burst(position,count=16,material=M.gold){
 for(let i=0;i<count;i++){
  const m=new THREE.Mesh(BOX,material); m.scale.setScalar(.1+rnd()*.06); m.position.copy(position); scene.add(m);
  particles.push({m,v:new THREE.Vector3((rnd()-.5)*3,1+rnd()*3,(rnd()-.5)*3),life:1.1+rnd()*.6});
 }
}
function bubbleTexture(text,color='#5e7047') {
 const c=document.createElement('canvas'); c.width=512; c.height=160; const g=c.getContext('2d');
 g.fillStyle='#fffbed'; g.beginPath(); g.roundRect(8,8,496,124,25); g.fill();
 g.beginPath(); g.moveTo(230,130); g.lineTo(247,156); g.lineTo(270,130); g.fill();
 g.fillStyle=color; g.font='800 43px Arial, sans-serif'; g.textAlign='center'; g.fillText(text,256,85);
 const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
function wordSprite(word,position){
 const t=bubbleTexture(word,'#8d6a24');
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));
 sprite.position.copy(position); sprite.scale.set(2.1,.65,1); sprite.renderOrder=5; scene.add(sprite);
 void tween(1.6,(k,raw)=>{ sprite.position.y=position.y+k*.7; sprite.material.opacity=raw<.7?1:(1-raw)/.3; }).then(()=>{ scene.remove(sprite); t.dispose(); sprite.material.dispose(); });
}

const SHOTS={
 intro:{pos:[7.4,6.4,12.2],look:[0,1.4,-1],fov:60},
 follow:{pos:[0,5.6,16],look:[0,1.4,7],fov:58}
};
const cam={pos:new THREE.Vector3(...SHOTS.intro.pos),look:new THREE.Vector3(...SHOTS.intro.look),yaw:0,pitch:.12,fov:60,shot:'intro',mode:'intro'};
function shotPosition(name){
 const s=SHOTS[name]||SHOTS.intro, pos=new THREE.Vector3(...s.pos), look=new THREE.Vector3(...s.look);
 if(camera.aspect<.85){ const offset=pos.clone().sub(look); offset.y=0; pos.addScaledVector(offset,.22); }
 return {pos,look,fov:s.fov+(camera.aspect<.85?8:0)};
}
async function goShot(name,duration=1.2){
 const to=shotPosition(name), from={pos:cam.pos.clone(),look:cam.look.clone(),fov:cam.fov,yaw:cam.yaw,pitch:cam.pitch};
 cam.shot=name; cam.mode='shot';
 await tween(duration,k=>{
  cam.pos.lerpVectors(from.pos,to.pos,k); cam.look.lerpVectors(from.look,to.look,k);
  cam.fov=from.fov+(to.fov-from.fov)*k; cam.yaw=from.yaw*(1-k); cam.pitch=from.pitch+(to===from?0:(.12-from.pitch)*k);
 });
}
const UP=new THREE.Vector3(0,1,0), RIGHT=new THREE.Vector3();
function followCamera(){
 const dist=9.4*(camera.aspect<.85?1.12:1);
 const height=5.1+cam.pitch*3.2;
 const px=player.position.x+Math.sin(cam.yaw)*dist;
 const pz=player.position.z+Math.cos(cam.yaw)*dist;
 cam.pos.set(px, player.position.y+height, pz);
 cam.look.set(player.position.x, player.position.y+1.35, player.position.z);
 cam.fov=58+(camera.aspect<.85?8:0);
}
function applyCamera(){
 if(cam.mode==='follow') followCamera();
 const direction=cam.look.clone().sub(cam.pos);
 if(cam.mode!=='follow'){ direction.applyAxisAngle(UP,cam.yaw); RIGHT.crossVectors(direction,UP).normalize(); direction.applyAxisAngle(RIGHT,cam.pitch); }
 camera.position.copy(cam.pos); camera.lookAt(camera.position.clone().add(direction));
 camera.fov=cam.fov; camera.updateProjectionMatrix();
}
function lookAtObject(object){
 const center=new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
 cam.mode='shot'; cam.shot='look'; cam.yaw=0; cam.pitch=0; cam.fov=56;
 cam.look.copy(center);
 cam.pos.set(center.x+4.2, center.y+2.8, center.z+5.2);
 applyCamera();
}

const FRIEND_AVATAR='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#e3ead4"/><path fill="#88ad68" d="M13 10h38v40H13z"/><path fill="#6e9753" d="M13 10h38v9H13z"/><path fill="#31472b" d="M21 27h6v6h-6zm16 0h6v6h-6zM27 41h10v3H27z"/><path fill="#e9b49a" d="M18 36h9v4h-9zm19 0h9v4h-9z"/><path fill="#55a4a0" d="M9 50h46v14H9z"/><path fill="#fff4d5" d="M24 50h16v14H24z"/></svg>');
const ui={say:$('#say'),en:$('#say-en'),zh:$('#say-zh'),pocket:$('#pocket'),title:$('#title'),summary:$('#summary'),journal:$('#journal')};
function speak(text,{interrupt=false}={}){ return voice.say(text,{interrupt}); }
function say(en,zh,{speaker='JJ',remember=true,interrupt=true}={}){
 state.current={en,zh,speaker};
 const avatar=ui.say.querySelector('img');
 avatar.src=speaker==='JJ'?'./assets/guide.svg':FRIEND_AVATAR;
 avatar.alt=speaker==='JJ'?'英语伙伴 JJ':'友善的小僵尸';
 ui.say.querySelector('.guide-avatar > span').textContent=speaker==='JJ'?'JJ':'Z';
 ui.en.textContent=en; ui.zh.textContent=zh; ui.say.hidden=false;
 ui.say.classList.toggle('zombie-speaking',speaker!=='JJ');
 $('#guide-label').textContent=speaker==='JJ'?'YOUR GUIDE · 你的冒险伙伴':'YOUR NEW FRIEND · 你的新朋友';
 ui.say.classList.remove('bump'); void ui.say.offsetWidth; ui.say.classList.add('bump');
 if(remember&&!state.sentences.includes(en)) state.sentences.push(en);
 return speak(en,{interrupt});
}
function wordChip(word){ const li=document.createElement('li'); li.dataset.say=word.toLowerCase(); li.setAttribute('role','button'); li.tabIndex=0; const b=document.createElement('b'), i=document.createElement('i'); b.textContent=word; i.textContent=ZH[word]||''; li.append(b,i); return li; }
function learn(word,position=null){ if(!state.words.includes(word)){ state.words.push(word); ui.pocket.append(wordChip(word)); ui.pocket.hidden=false; sfx.pop(); } if(position) wordSprite(word,position); updateStatus(); }
function objectPosition(object){ return object.getWorldPosition(new THREE.Vector3()); }
function inRange(object,radius=3.4){ if(!object) return false; const a=player.position, b=objectPosition(object); return Math.hypot(a.x-b.x, a.z-b.z)<=radius; }
function canBuild(){ return state.cones>=3 && state.logs>=2 && !state.house; }
function canInvite(){ return state.house && !state.invited; }
function questsDone(){ return {cones:state.cones, logs:state.logs, house:state.house?1:0, watch:state.watched?1:0, invite:state.invited?1:0}; }
function questComplete(){ return state.cones>=3 && state.logs>=2 && state.house && state.watched && state.invited; }
function completedCount(){ return [state.cones>=3, state.logs>=2, state.house, state.watched, state.invited].filter(Boolean).length; }

function updateQuests(){
 const items={
  cones:{done:state.cones>=3, open:state.cones<3, label:`捡松果 · ${state.cones}/3`},
  logs:{done:state.logs>=2, open:state.logs<2, label:`收集木头 · ${state.logs}/2`},
  house:{done:state.house, open:canBuild(), locked:!state.house && !canBuild(), label:state.house?'鸟屋做好啦':'在工作台上做鸟屋'},
  watch:{done:state.watched, open:!state.watched, label:state.watched?'已经观察过啦':'走近看看小动物'},
  invite:{done:state.invited, open:canInvite(), locked:!state.invited && !canInvite(), label:state.invited?'小鸟住进来啦':'邀请小鸟住进鸟屋'}
 };
 for (const [id,info] of Object.entries(items)) {
  const li=$('#quest-'+id); if(!li) continue;
  li.classList.toggle('done', info.done);
  li.classList.toggle('active', !!info.open && !info.done);
  li.classList.toggle('locked', !!info.locked);
  const mark=li.querySelector('i'); if(mark) mark.textContent=info.done?'✓':(info.locked?'·':'○');
  const small=li.querySelector('small'); if(small) small.textContent=info.label;
 }
}

function targetFor(){
 if(state.step===0||state.step===6) return undefined;
 const options=[];
 if(state.cones<3) pineCones.filter(g=>!g.userData.collected).forEach(g=>options.push(g));
 if(state.logs<2) fallenLogs.filter(g=>!g.userData.collected).forEach(g=>options.push(g));
 if(canBuild()) options.push(table);
 if(!state.watched) options.push(sheep, bird);
 else if(canInvite()) options.push(bird);
 if(!options.length) return undefined;
 const nearby=options.filter(object=>inRange(object));
 const pool=nearby.length?nearby:options;
 let best=pool[0], bestDist=Infinity;
 for (const object of pool) {
  const p=objectPosition(object);
  const d=Math.hypot(player.position.x-p.x, player.position.z-p.z);
  if(d<bestDist){ best=object; bestDist=d; }
 }
 return best;
}

function updateWayfinder(){
 if(state.step===0 || state.step===6 || !ui.summary.hidden){ setTarget(null); return; }
 const object=targetFor();
 setTarget(object, object===sheep||object===table?1.7: object===bird?1.1:1);
}

async function reveal(word,object){
 learn(word); $('#loot-en').textContent=word; $('#loot-zh').textContent=ZH[word]||''; $('#loot').hidden=false; $('#loot').classList.add('in');
 const pos=objectPosition(object); burst(pos,18); sfx.ding(); await speak(word.toLowerCase(),{interrupt:true}); await wait(.45);
 $('#loot').hidden=true; $('#loot').classList.remove('in');
}

async function start(){
 if(state.step!==0||state.busy||paused) return;
 state.busy=true; state.started=gameTime; sfx.unlock(); sfx.ambience(); void voice.warm();
 ui.title.classList.add('hide'); stage.classList.add('playing'); canvas.focus({preventScroll:true});
 ui.journal.hidden=false; $('#ask-friend').hidden=false; if(touch) $('#joy').hidden=false;
 updateQuests(); updateStatus();
 await goShot('intro', reduced?0.2:1.1);
 learn('FRIEND', objectPosition(friend));
 await say("Let's explore the island!",'欢迎来到开放小岛！你可以自由走动，按任务板一件一件完成。');
 await say('Collect three pine cones.','先去松树下捡三个松果；木头也可以一起收集。',{remember:true,interrupt:false});
 state.step=1; stage.dataset.step='1'; cam.mode='follow'; cam.yaw=0; cam.pitch=.12; state.busy=false;
 updateWayfinder(); updateStatus();
}

async function collectCone(object){
 if(!object||object.userData.collected||state.cones>=3) return;
 object.userData.collected=true; state.cones+=1;
 sfx.pop(); await reveal('PINE CONE', object);
 await say('A pine cone!','一个松果！',{interrupt:false});
 await tween(.45,k=>{ object.scale.setScalar(1-k); object.position.y=.5+k*.8; });
 object.visible=false;
 if(state.cones>=3 && !state.hinted.conesDone){ state.hinted.conesDone=true; if(state.logs<2) void say('We need two logs.','松果齐了。如果还缺木头，就去捡地上的原木吧。',{remember:false,interrupt:false}); }
 afterQuest();
}
async function collectLog(object){
 if(!object||object.userData.collected||state.logs>=2) return;
 object.userData.collected=true; state.logs+=1;
 sfx.pop(); await reveal('LOG', object);
 await say('You got a log!','一根木头！',{interrupt:false});
 await tween(.45,k=>{ object.scale.setScalar(1-k); object.position.y=.5+k*.8; });
 object.visible=false;
 afterQuest();
}
async function buildBirdhouse(){
 if(state.house) return;
 if(!canBuild()){
  if(state.cones<3) await say('Collect three pine cones.','还需要更多松果，才能做鸟屋。',{remember:false});
  else await say('We need two logs.','还需要更多木头，才能做鸟屋。',{remember:false});
  return;
 }
 sfx.tok(); sfx.pop();
 await say('Build a birdhouse on the table.','把松果和木头放到工作台上，做一座小鸟屋。');
 await tween(.8,k=>{ table.position.y=.5+Math.sin(k*Math.PI)*.08; });
 birdhouse.visible=true; birdhouse.scale.setScalar(.2);
 await tween(.7,k=>birdhouse.scale.setScalar(.2+k*.8));
 await reveal('BIRDHOUSE', birdhouse);
 await say('A birdhouse!','一座鸟屋！',{interrupt:false});
 state.house=true; afterQuest();
}
async function watchAnimal(object){
 const word=object?.userData.word==='SHEEP'?'SHEEP':'BIRD';
 if(!state.watched){
  await reveal(word, object);
  await say('Watch the animals.','悄悄看一看小岛上的小动物。',{interrupt:false});
  if(word==='BIRD') await say('A bird!','是一只小鸟！',{interrupt:false});
  state.watched=true;
 } else {
  learn(word, objectPosition(object));
  await speak(word.toLowerCase(),{interrupt:true});
 }
 afterQuest();
}
async function inviteBird(){
 if(state.invited) return;
 if(!state.house){ await say('Build a birdhouse on the table.','先做好鸟屋，再邀请小鸟住进来。',{remember:false}); return; }
 const start=bird.position.clone(), end=birdhouse.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.55,.15));
 await tween(1.1,(k,raw)=>{
  bird.position.lerpVectors(start,end,k); bird.position.y+=Math.sin(raw*Math.PI)*.8;
  bird.userData.wings.forEach((wing,i)=>wing.rotation.z=Math.sin(raw*Math.PI*8)*(i?-.5:.5));
 });
 bird.userData.wings.forEach(w=>w.rotation.z=0);
 await reveal('BIRD', bird);
 await say('The bird likes the birdhouse!','小鸟喜欢这座鸟屋！');
 state.invited=true; afterQuest();
}

function afterQuest(){
 updateQuests(); updateWayfinder(); updateStatus();
 if(questComplete() && state.step!==6){
  state.step=6; stage.dataset.step='6'; setTarget(null);
  void (async()=>{ await say('You finished every quest!','今天的任务都完成啦！'); showSummary(); })();
 }
}

// A light English-speaking friend hook. Not a dialogue tree, and not multiplayer.
const FRIEND_HINTS={
 cones:["Look under the trees.",'松树下面有松果。'],
 logs:["We need more wood.",'去捡一捡地上的木头吧。'],
 house:["Let's build it together.",'材料齐了，来工作台一起做鸟屋。'],
 watch:["Let's watch the animals.",'走近小羊或小鸟，看一看它们。'],
 invite:["Invite the bird home.",'点小鸟，请它住进新房子。']
};
function nextHintId(){
 if(state.cones<3) return 'cones';
 if(state.logs<2) return 'logs';
 if(!state.house) return 'house';
 if(!state.watched) return 'watch';
 if(!state.invited) return 'invite';
 return null;
}
async function askFriend(){
 if(paused||state.busy||state.step===0||!ui.summary.hidden) return;
 const id=nextHintId();
 if(!id){ await say("You're welcome, my friend!",'你已经完成了今天的任务。',{speaker:'friend',remember:false}); return; }
 if(!state.hinted.hello){ state.hinted.hello=true; await say('I can help you.','我可以帮你。跟着金色光圈走就好。',{speaker:'friend'}); }
 const [en,zh]=FRIEND_HINTS[id];
 await say(en,zh,{speaker:'friend'});
 const object=targetFor(); if(object) setTarget(object, object===table||object===sheep?1.7:1);
}

async function act(object){
 if(paused||state.busy||!ui.summary.hidden||helpDialog.open||state.step===0||!object) return;
 const kind=object.userData.kind;
 if(kind==='flower'||kind==='water'||kind==='cloud'||kind==='tree'||kind==='sun'){
  learn(object.userData.word); await speak((object.userData.word||'').toLowerCase(),{interrupt:true}); return;
 }
 if(kind==='friend'){ await askFriend(); return; }
 const needsRange=['cone','wood','table','birdhouse','sheep','bird'].includes(kind);
 if(needsRange && !inRange(object)){ await say('Come closer, then tap it.','先走近一点，再点那个发光的目标。',{remember:false}); setTarget(object); return; }
 if(kind==='cone'){ if(object.userData.collected||state.cones>=3) return; state.busy=true; try{ await collectCone(object); }catch(error){ console.error(error); object.userData.collected=false; state.cones=Math.max(0,state.cones-1); setTarget(object); } finally{ state.busy=false; updateStatus(); } return; }
 if(kind==='wood'){ if(object.userData.collected||state.logs>=2) return; state.busy=true; try{ await collectLog(object); }catch(error){ console.error(error); object.userData.collected=false; state.logs=Math.max(0,state.logs-1); setTarget(object); } finally{ state.busy=false; updateStatus(); } return; }
 if(kind==='table'||kind==='birdhouse'){ if(state.house) return; if(!canBuild()){ await buildBirdhouse(); return; } state.busy=true; try{ await buildBirdhouse(); }catch(error){ console.error(error); setTarget(table); } finally{ state.busy=false; updateStatus(); } return; }
 if(kind==='sheep' || (kind==='bird' && !state.watched)){ state.busy=true; try{ await watchAnimal(object); }catch(error){ console.error(error); setTarget(object); } finally{ state.busy=false; updateStatus(); } return; }
 if(kind==='bird'){ if(state.invited) return; if(!canInvite()){ await inviteBird(); return; } state.busy=true; try{ await inviteBird(); }catch(error){ console.error(error); setTarget(bird); } finally{ state.busy=false; updateStatus(); } return; }
}

function taskAction(){
 if(paused||state.busy||!ui.summary.hidden||helpDialog.open) return;
 if(state.step===0){ void start(); return; }
 if(state.step===6) return;
 const object=targetFor();
 if(object) void act(object);
}

const ray=new THREE.Raycaster(), pointer=new THREE.Vector2(); let down=null;
function pickAt(x,y){
 const r=canvas.getBoundingClientRect();
 pointer.set((x-r.left)/r.width*2-1, -(y-r.top)/r.height*2+1);
 ray.setFromCamera(pointer,camera);
 const hits=ray.intersectObjects(hot,true);
 for(const hit of hits){
  let object=hit.object, visible=true;
  for(let p=object;p;p=p.parent) if(!p.visible) visible=false;
  if(!visible) continue;
  while(object&&!object.userData.kind) object=object.parent;
  if(object && object.userData.kind!=='player') return object;
 }
 return null;
}

const held=new Set();
const joy={active:false,x:0,y:0,id:null};
function moveVector(){
 let x=0, z=0;
 if(held.has('w')||held.has('arrowup')) z-=1;
 if(held.has('s')||held.has('arrowdown')) z+=1;
 if(held.has('a')||held.has('arrowleft')) x-=1;
 if(held.has('d')||held.has('arrowright')) x+=1;
 if(joy.active){ x+=joy.x; z+=joy.y; }
 const len=Math.hypot(x,z);
 if(len>1){ x/=len; z/=len; }
 return {x,z,len:Math.min(1,len)};
}
function tryMove(dt){
 if(state.step===0||state.step===6||paused||!ui.summary.hidden||helpDialog.open) return;
 const move=moveVector();
 if(move.len<0.08) return;
 const yaw=cam.mode==='follow'?cam.yaw:0;
 const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
 const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 const speed=5.4*move.len;
 const dx=(-forward.x*move.z + right.x*move.x)*speed*dt;
 const dz=(-forward.z*move.z + right.z*move.x)*speed*dt;
 const nextX=player.position.x+dx, nextZ=player.position.z+dz;
 if(!blockedAt(nextX, player.position.z)) player.position.x=nextX;
 if(!blockedAt(player.position.x, nextZ)) player.position.z=nextZ;
 player.position.y=.5+heightAt(player.position.x, player.position.z);
 const face=Math.atan2(dx,dz);
 if(Math.hypot(dx,dz)>0.0001) player.rotation.y=face;
 playerArms.forEach((arm,i)=>arm.rotation.x=Math.sin(gameTime*10)*(i?-.45:.45));
 updateWayfinder();
}

canvas.addEventListener('pointerdown',e=>{
 if(paused) return; sfx.unlock();
 down={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:cam.yaw,pitch:cam.pitch,drag:false};
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!down){ if(!touch) canvas.style.cursor=pickAt(e.clientX,e.clientY)?'pointer':'grab'; return; }
 if(e.pointerId!==down.id) return;
 const dx=e.clientX-down.x, dy=e.clientY-down.y;
 if(Math.hypot(dx,dy)>7) down.drag=true;
 if(down.drag&&state.step>0&&!paused){
  cam.yaw=down.yaw-dx*.005;
  cam.pitch=Math.max(-.25, Math.min(.45, down.pitch-dy*.003));
 }
});
canvas.addEventListener('pointerup',e=>{
 if(!down||e.pointerId!==down.id) return;
 const wasDrag=down.drag; down=null;
 if(canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
 if(!wasDrag){ const object=pickAt(e.clientX,e.clientY); if(object) void act(object); }
});
canvas.addEventListener('pointercancel',()=>{ down=null; });

const joyEl=$('#joy'), knob=$('#joy-knob');
function setJoy(clientX,clientY){
 const r=joyEl.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
 let x=(clientX-cx)/(r.width/2), y=(clientY-cy)/(r.height/2);
 const len=Math.hypot(x,y); if(len>1){ x/=len; y/=len; }
 joy.x=x; joy.y=y;
 knob.style.transform=`translate(calc(-50% + ${x*22}px), calc(-50% + ${y*22}px))`;
}
if(joyEl){
 joyEl.addEventListener('pointerdown',e=>{ joy.active=true; joy.id=e.pointerId; joyEl.setPointerCapture(e.pointerId); setJoy(e.clientX,e.clientY); e.preventDefault(); sfx.unlock(); });
 joyEl.addEventListener('pointermove',e=>{ if(joy.active&&e.pointerId===joy.id) setJoy(e.clientX,e.clientY); });
 const endJoy=()=>{ joy.active=false; joy.x=0; joy.y=0; joy.id=null; knob.style.transform='translate(-50%,-50%)'; };
 joyEl.addEventListener('pointerup',endJoy); joyEl.addEventListener('pointercancel',endJoy);
}

$('#title button').addEventListener('click',()=>void start());
$('#task-action').addEventListener('click',taskAction);
$('#say-spk').addEventListener('click',()=>{ if(state.current) void speak(state.current.en,{interrupt:true}); });
$('#ask-friend').addEventListener('click',()=>void askFriend());
for (const container of [ui.pocket, ui.summary]) {
 container.addEventListener('click',event=>{ const item=event.target.closest('[data-say]'); if(item) void speak(item.dataset.say,{interrupt:true}); });
 container.addEventListener('keydown',event=>{ if((event.key==='Enter'||event.key===' ')&&event.target.matches('li[data-say]')){ event.preventDefault(); event.target.click(); } });
}

function snapshotWorld(){ applyCamera(); renderer.render(scene,camera); const shot=document.createElement('canvas'); shot.width=952; shot.height=506; shot.getContext('2d').drawImage(canvas,0,0,952,506); return shot; }
function showSummary(){
 finishedShot=snapshotWorld();
 const seconds=Math.max(1,Math.round(state.elapsed));
 $('#sum-stats').textContent=`用时 ${Math.floor(seconds/60)} 分 ${String(seconds%60).padStart(2,'0')} 秒 · 完成 ${completedCount()} 个任务 · 发现 ${state.words.length} 个单词`;
 const list=$('#sum-words'); list.innerHTML='';
 for (const word of state.words) list.append(wordChip(word));
 ui.summary.hidden=false; $('#ask-friend').hidden=true; $('#joy').hidden=true; updateStatus(); sfx.levelup();
}
function makeCard(){
 const button=$('#sum-card'); button.disabled=true; button.textContent='正在制作卡片…';
 try {
  const c=document.createElement('canvas'); c.width=1080; c.height=1540; const g=c.getContext('2d');
  g.fillStyle='#f3f8ef'; g.fillRect(0,0,1080,1540); g.fillStyle='#8fb07a'; g.fillRect(0,0,1080,14);
  g.fillStyle='#6f8c63'; g.font='800 23px Arial, sans-serif'; g.fillText('ENGLISH ISLAND / DAY THREE',64,80);
  g.fillStyle='#36513b'; g.font='800 58px "PingFang SC", sans-serif'; g.fillText('我的小岛探索',64,160);
  g.font='25px "PingFang SC", sans-serif'; g.fillStyle='#8a9a7c'; g.fillText(`${new Date().toLocaleDateString('zh-CN')} · 开放小岛探险家达成`,64,215);
  finishedShot??=snapshotWorld(); g.save(); g.beginPath(); g.roundRect(64,258,952,506,23); g.clip(); g.drawImage(finishedShot,64,258,952,506); g.restore();
  g.fillStyle='#36513b'; g.font='800 31px "PingFang SC", sans-serif'; g.fillText(`在小岛上发现的 ${state.words.length} 个单词`,64,829);
  let x=64,y=862;
  for (const word of state.words) {
   g.font='800 26px Arial, sans-serif'; const ew=g.measureText(word).width;
   g.font='21px "PingFang SC", sans-serif'; const width=ew+g.measureText(ZH[word]||'').width+54;
   if(x+width>1016){ x=64; y+=70; }
   g.fillStyle='#e5eddc'; g.beginPath(); g.roundRect(x,y,width,54,9); g.fill();
   g.fillStyle='#5c7751'; g.font='800 26px Arial, sans-serif'; g.fillText(word,x+17,y+35);
   g.fillStyle='#8a9a79'; g.font='21px "PingFang SC", sans-serif'; g.fillText(ZH[word]||'',x+ew+33,y+34);
   x+=width+12;
  }
  g.fillStyle='#ccd9c2'; g.fillRect(64,1300,952,2);
  g.fillStyle='#5b7751'; g.font='800 35px Arial, sans-serif'; g.fillText('“You finished every quest!”',64,1371);
  g.fillStyle='#8a9a7c'; g.font='25px "PingFang SC", sans-serif'; g.fillText('自由走动，一件一件完成今天的任务。',64,1431);
  g.font='22px "PingFang SC", sans-serif'; g.fillText('英语方块岛 · 一起发现，一起长大。',64,1487);
  const url=c.toDataURL('image/png'); $('#sum-img').src=url; $('#sum-img').hidden=false;
  const link=$('#sum-dl'); link.href=url; link.download=`english-island-day-three-${Date.now()}.png`; link.hidden=false;
  button.textContent='卡片已生成 ↓'; sfx.ding(); $('#sum-img').scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
 } catch(error){ console.error(error); button.textContent='生成失败，点击重试'; }
 finally { button.disabled=false; }
}
function goPrevious(){ voice.stop(); if(parent!==window) parent.postMessage({type:'island-navigate',level:2},location.origin); else location.href='./day2.html'; }
$('#sum-card').addEventListener('click',()=>void makeCard());
$('#sum-again').addEventListener('click',()=>location.reload());
$('#sum-previous').addEventListener('click',goPrevious);
$('#back-level').addEventListener('click',goPrevious);
$('#sum-close').addEventListener('click',()=>{
 ui.summary.hidden=true; canvas.focus({preventScroll:true});
 if(touch) $('#joy').hidden=false; $('#ask-friend').hidden=false;
 void say('What else can you find?','还可以在小岛上走走，点花朵、水面、树和朋友，继续发现英语。',{remember:false});
 updateStatus();
});

const helpDialog=$('#help-dialog'), pauseReasons=new Set();
function showHelp(){ if(!helpDialog.open) helpDialog.showModal(); pauseGame(true,'help'); }
function pauseGame(value,reason='external'){
 if(value) pauseReasons.add(reason); else pauseReasons.delete(reason);
 const next=pauseReasons.size>0; if(paused===next) return;
 paused=next; down=null; sfx.paused=next; voice.setPaused(next); updateStatus();
}
helpDialog.addEventListener('close',()=>{ pauseGame(false,'help'); canvas.focus({preventScroll:true}); });
$('#help-close').addEventListener('click',()=>helpDialog.close());
$('#help-done').addEventListener('click',()=>helpDialog.close());
$('#help-button').addEventListener('click',showHelp);
helpDialog.addEventListener('click',e=>{ if(e.target===helpDialog){ const r=helpDialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) helpDialog.close(); } });
function updateSound(){ $('#snd').textContent=`声音：${sfx.muted?'关':'开'}`; $('#snd').setAttribute('aria-pressed', sfx.muted?'true':'false'); }
$('#snd').addEventListener('click',()=>{ sfx.muted=!sfx.muted; if(sfx.muted) voice.stop(); sfx.unlock(); updateSound(); updateStatus(); });
$('#restart-button').addEventListener('click',()=>location.reload());
if(window===parent){ stage.classList.add('standalone'); $('.standalone-tools').hidden=false; }

window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='island-command') return;
 const data=event.data;
 if(data.command==='start') void start();
 if(data.command==='act') taskAction();
 if(data.command==='mute') $('#snd').click();
 if(data.command==='restart') location.reload();
 if(data.command==='help'){ if(helpDialog.open) helpDialog.close(); else showHelp(); }
 if(data.command==='summary') showSummary();
 if(data.command==='speak'&&typeof data.word==='string') void speak(data.word.toLowerCase(),{interrupt:true});
 if(data.command==='hint'||data.command==='ask-friend') void askFriend();
 if(data.command==='pause') pauseGame(true);
 if(data.command==='resume') pauseGame(false);
});
window.addEventListener('keydown',event=>{
 if(event.defaultPrevented) return;
 const key=event.key;
 if(['w','a','s','d','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)){
  if(!['BUTTON','A','INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){
   event.preventDefault(); held.add(key.toLowerCase());
  }
 }
 if(event.key===' '&&!event.repeat&&!['BUTTON','A','INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){ event.preventDefault(); taskAction(); }
 if(event.key==='h'||event.key==='H'){ if(!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) void askFriend(); }
 if(event.key==='Escape'&&helpDialog.open) helpDialog.close();
});
window.addEventListener('keyup',event=>held.delete(event.key.toLowerCase()));
document.addEventListener('visibilitychange',()=>pauseGame(document.hidden,'visibility'));

function actionLabel(){
 if(state.busy) return '跟着英语提示，看看会发生什么…';
 const object=targetFor();
 if(!object) return '在小岛上走走看看';
 const near=inRange(object);
 if(object.userData.kind==='cone') return near?'捡起松果':`走近松果 · ${state.cones}/3`;
 if(object.userData.kind==='wood') return near?'捡起木头':`走近木头 · ${state.logs}/2`;
 if(object.userData.kind==='table'||object.userData.kind==='birdhouse') return near?'做一座鸟屋':'走近工作台做鸟屋';
 if(object.userData.kind==='sheep') return near?'观察小羊':'走近小羊看一看';
 if(object.userData.kind==='bird') return near?(state.watched&&state.house?'邀请小鸟回家':'观察小鸟'):'走近小鸟看一看';
 return '走近发光的目标';
}
function updateStatus(){
 const pocketBottom=ui.pocket.offsetTop+ui.pocket.offsetHeight;
 ui.journal.style.top=Math.max(stage.clientWidth<=700?78:67, pocketBottom+12)+'px';
 const button=$('#task-action');
 button.hidden=state.step===0||state.step===6||!ui.summary.hidden;
 button.disabled=state.busy||paused;
 $('#action-label').textContent=actionLabel();
 const data={
  type:'island-status', level:3, ready:true,
  step:state.step===6?6:completedCount(),
  busy:state.busy, words:[...state.words], muted:sfx.muted,
  completed:state.step===6, paused,
  quests:questsDone(),
  questFlags:{
   cones:state.cones>=3?'done': 'active',
   logs:state.logs>=2?'done':'active',
   house:state.house?'done':(canBuild()?'active':'locked'),
   watch:state.watched?'done':'active',
   invite:state.invited?'done':(canInvite()?'active':'locked')
  }
 };
 const json=JSON.stringify(data);
 if(json!==lastStatus){ lastStatus=json; parent.postMessage(data,location.origin); }
}

function resize(){
 const w=stage.clientWidth, h=stage.clientHeight; if(!w||!h) return;
 renderer.setSize(w,h,false); camera.aspect=w/h;
 if(cam.mode!=='follow' && state.step===0 && !state.busy){
  const s=shotPosition(cam.shot); cam.pos.copy(s.pos); cam.look.copy(s.look); cam.fov=s.fov;
 }
 camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize(); updateSound(); updateQuests(); updateStatus();

renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05, Math.max(0,(now-previousTime)/1000)); previousTime=now;
 if(!paused){
  gameTime+=dt; if(state.started!==null && state.step>0 && state.step<6) state.elapsed+=dt;
  for(let i=tweens.length-1;i>=0;i--){
   const t=tweens[i], raw=Math.min(1,(gameTime-t.start)/t.duration), k=raw<.5?4*raw**3:1-(-2*raw+2)**3/2;
   t.fn(k,raw); if(raw>=1){ tweens.splice(i,1); t.resolve(); }
  }
  for(let i=particles.length-1;i>=0;i--){
   const p=particles[i]; p.life-=dt; p.v.y-=5*dt; p.m.position.addScaledVector(p.v,dt);
   p.m.rotation.x+=dt*3; p.m.rotation.y+=dt*4;
   if(p.life<=0){ scene.remove(p.m); particles.splice(i,1); }
  }
  clouds.forEach((cloud,i)=>{ cloud.position.x+=Math.sin(gameTime*.08+i)*.004; });
  if(!state.invited){
   bird.position.y=bird.userData.home.y+Math.sin(gameTime*2.2)*.18;
   bird.userData.wings.forEach((wing,i)=>wing.rotation.z=Math.sin(gameTime*6)*(i?-.35:.35));
  }
  sheepHead.rotation.y=Math.sin(gameTime*.7)*.25;
  arms[1].rotation.z=-.15+Math.sin(gameTime*1.4)*.12;
  if(!state.busy) tryMove(dt);
  else playerArms.forEach(arm=>arm.rotation.x=0);
  if(ringTarget){
   const pos=objectPosition(ringTarget); ring.position.set(pos.x, pos.y+.08, pos.z);
   ring.scale.setScalar(ringSize*(1+Math.sin(gameTime*3)*.06));
   arrow.position.set(pos.x, pos.y+1.55+Math.sin(gameTime*3)*.12, pos.z);
  }
 }
 applyCamera();
 if((renderer.info.render.frame & 1)===0) renderer.shadowMap.needsUpdate=true;
 renderer.render(scene,camera);
});

window.__yf={
 level:3,state,ORDER,ZH,start,taskAction,showSummary,makeCard,pauseGame,goShot,askFriend,
 cam,scene,camera,hot,player,friend,table,birdhouse,bird,sheep,pineCones,fallenLogs,flowers,
 inRange,canBuild,canInvite,targetFor,collectCone,collectLog,buildBirdhouse,watchAnimal,inviteBird,lookAtObject,
 tap(kind){ const object=kind==='cone'?pineCones.find(g=>!g.userData.collected):kind==='wood'?fallenLogs.find(g=>!g.userData.collected):hot.find(g=>g.userData.kind===kind||g.userData.word===kind); return object?act(object):Promise.resolve(); },
 get paused(){ return paused; }
};
// Future hook for an English-speaking helper. This is not a multiplayer or full chat API.
window.islandAskFriend=askFriend;
window.addEventListener('pagehide',()=>{ voice.stop(); renderer.setAnimationLoop(null); renderer.dispose(); });
