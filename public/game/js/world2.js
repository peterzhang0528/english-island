// Chapter 02: a friendly farm, a simple cake, and a first English thank-you.
import * as THREE from './vendor/three.module.min.js';
import { createTextures } from './textures.js';
import { sfx } from './sfx.js';
import { voice } from './voice.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), canvas = $('#world');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const ZH = { ZOMBIE:'僵尸', HUNGRY:'饿了', CHICKEN:'小鸡', EGG:'鸡蛋', COW:'奶牛', MILK:'牛奶', WHEAT:'麦子', CAKE:'蛋糕', FRIEND:'朋友', TREE:'树', FLOWER:'花', WATER:'水', CLOUD:'云', TABLE:'工作台' };
const ORDER = ['ZOMBIE','HUNGRY','CHICKEN','EGG','COW','MILK','WHEAT','CAKE','FRIEND'];
const state = { step:0, words:[], sentences:[], busy:false, current:null, egg:0, milk:0, wheat:0, cake:false, started:0, elapsed:0 };
let paused = false, gameTime = 0, previousTime = performance.now(), finishedShot = null;
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#dce8ca',28,78);
const camera = new THREE.PerspectiveCamera(57,1,.1,150);
const world = new THREE.Group(); scene.add(world,camera);
const T = createTextures(THREE);
const lam = color => new THREE.MeshLambertMaterial({color});
const tex = map => new THREE.MeshLambertMaterial({map});
const M = {
 grass:[tex(T.grassSide),tex(T.grassSide),tex(T.grassTop),tex(T.dirt),tex(T.grassSide),tex(T.grassSide)],
 dirt:tex(T.dirt), wood:tex(T.planks), log:tex(T.logSide), leaves:tex(T.leaves), stone:tex(T.stone),
 table:[tex(T.craftSide),tex(T.craftSide),tex(T.craftTop),tex(T.planks),tex(T.craftSide),tex(T.craftSide)],
 cream:lam('#fff4d5'), white:lam('#fffdf1'), brown:lam('#694e3e'), dark:lam('#29382d'), pink:lam('#edb1a0'),
 red:lam('#cf6750'), leaf:lam('#73a353'), straw:lam('#dcae48'), gold:lam('#ffe083'), cake:lam('#c99156'),
 green:lam('#86ae68'), teal:lam('#55a4a0'), pants:lam('#6475a3'), water:new THREE.MeshLambertMaterial({map:T.water,transparent:true,opacity:.86}),
 cloud:new THREE.MeshBasicMaterial({color:'#fffdf0'})
};
const BOX = new THREE.BoxGeometry(1,1,1), hot = [];
let seed = 29;
const rnd = () => (seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
function box(parent, material, x,y,z, w=1,h=1,d=1) {
 const mesh = new THREE.Mesh(BOX,material); mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function target(group,kind,word) { group.userData={...group.userData,kind,word};hot.push(group);return group; }
function groupAt(x,y,z) {const g=new THREE.Group();g.position.set(x,y,z);world.add(g);return g;}
function instances(positions,material,scale=[1,1,1]) {
 const mesh=new THREE.InstancedMesh(BOX,material,positions.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(...scale);
 positions.forEach((p,i)=>mesh.setMatrixAt(i,matrix.compose(new THREE.Vector3(...p),q,s)));
 mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);return mesh;
}
// Soft blue-to-cream sky and the same textured voxel ground as chapter one.
const skyGeo=new THREE.SphereGeometry(100,24,16),colors=[];
const top=new THREE.Color('#83b9e5'),horizon=new THREE.Color('#ecedd2');
for(let i=0;i<skyGeo.attributes.position.count;i++){const y=skyGeo.attributes.position.getY(i)/100;const c=horizon.clone().lerp(top,Math.max(0,y));colors.push(c.r,c.g,c.b);}
skyGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
scene.add(new THREE.Mesh(skyGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false})));
scene.add(new THREE.HemisphereLight('#f3f4e1','#738a52',1.5));
const sun=new THREE.DirectionalLight('#fff2ca',2.4);sun.position.set(-14,26,14);sun.castShadow=true;
sun.shadow.mapSize.set(touch?1024:2048,touch?1024:2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,near:1,far:65});sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;scene.add(sun);
const grass=[],dirt=[],path=[],pond=[];
for(let x=-22;x<=22;x++)for(let z=-23;z<=15;z++){
 const edge=Math.hypot(x,z+5)>16;
 const h=edge?Math.max(0,Math.round((Math.sin(x*.37)+Math.cos(z*.34)+1.2)*.65)):0;
 const water=x>7&&x<13&&z>-8&&z<-3&&Math.hypot(x-10,z+6)<2.7;
 if(water){pond.push([x,.2,z]);dirt.push([x,-.6,z]);}
 else if((Math.abs(x)<1.2&&z>-9&&z<4)||(z===-3&&x>-5&&x<5)||(x===4&&z>-12&&z<-3))path.push([x,0,z]);
 else grass.push([x,h,z]);
 if(edge)for(let y=-1;y<h;y++)dirt.push([x,y,z]);
}
instances(grass,M.grass);instances(dirt,M.dirt);instances(path,M.dirt,[1,.99,1]);
target(instances(pond,M.water,[1,.18,1]),'water','WATER');
function tree(x,z,height=4){
 const g=groupAt(x,.5,z),logs=[],leaves=[];
 for(let y=.5;y<height;y++)logs.push([0,y,0]);
 for(let y=height-1;y<=height+1;y++)for(let xx=-1;xx<=1;xx++)for(let zz=-1;zz<=1;zz++){if(y===height+1&&Math.abs(xx)+Math.abs(zz)>1)continue;leaves.push([xx,y,zz]);}
 for(const [list,material]of [[logs,M.log],[leaves,M.leaves]]){const mesh=new THREE.InstancedMesh(BOX,material,list.length),matrix=new THREE.Matrix4();list.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...p)));mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);}
 target(g,'tree','TREE');
}
[[-10,-5,4],[-13,-13,5],[-6,-16,4],[7,-18,5],[14,-12,4],[15,0,5],[-14,4,4],[-4,-21,5],[1,-19,4],[12,-19,4]].forEach(p=>tree(...p));
const clouds=[];
for(let i=0;i<7;i++){const g=groupAt(-33+i*11,15+rnd()*4,-27+rnd()*8);for(let k=0;k<5;k++)box(g,M.cloud,(k-2)*1.6,rnd()*.35,rnd(),2.4,.75,1.7);target(g,'cloud','CLOUD');clouds.push(g);}
for(let i=0;i<65;i++){const x=rnd()*29-14,z=rnd()*27-18;if((Math.abs(x)<7&&z>-14&&z<1)||(x>7&&x<13&&z>-9&&z<-2))continue;const g=groupAt(x,.5,z);box(g,M.leaf,0,.2,0,.07,.45,.07);box(g,i%3===0?M.red:M.gold,0,.48,0,.27,.15,.27);target(g,'flower','FLOWER');}
// Fences, orchard and a small red barn give this chapter its own silhouette.
function fence(x,z,length,axis='x'){
 const g=groupAt(x,.5,z);for(let i=0;i<=length;i+=2){box(g,M.wood,axis==='x'?i:0,.55,axis==='z'?i:0,.18,1.1,.18);}
 for(const y of [.38,.78])box(g,M.wood,axis==='x'?length/2:0,y,axis==='z'?length/2:0,axis==='x'?length:.12,.12,axis==='z'?length:.12);
}
fence(-9,-14,16);fence(-9,-14,12,'z');fence(8,-14,4,'z');
const barn=groupAt(-8,.5,-12);
box(barn,M.red,0,1.6,0,3.5,3.2,3);box(barn,M.wood,0,1,.06+1.5,1.4,2,.12);
for(const x of [-1.65,1.65])box(barn,M.cream,x,1.6,1.55,.14,3.2,.14);
for(let i=0;i<4;i++)box(barn,M.brown,0,3.25+i*.35,0,4.2-i*.9,.4,3.7);
box(barn,M.cream,0,2.5,1.59,1.7,.16,.14);
function sign(text,x,y,z,w=2.7,h=.65){
 const c=document.createElement('canvas');c.width=640;c.height=160;const g=c.getContext('2d');g.fillStyle='#f3e6bc';g.fillRect(0,0,640,160);g.strokeStyle='#b7a47c';g.lineWidth=12;g.strokeRect(6,6,628,148);g.fillStyle='#596744';g.font='800 64px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,320,86);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshLambertMaterial({map:t,side:THREE.DoubleSide}));m.position.set(x,y,z);world.add(m);return m;
}
sign('SUNNY FARM',-8,3.2,-10.4,3,.65);
// The chicken's wings are hinged so every egg comes with a happy flap.
const chicken=target(groupAt(-4.6,.5,-3.8),'chicken','CHICKEN');
box(chicken,M.white,0,.62,0,.78,.65,.95);const chickenHead=new THREE.Group();chickenHead.position.set(0,1,.37);chicken.add(chickenHead);
box(chickenHead,M.white,0,0,0,.5,.5,.5);box(chickenHead,M.gold,0,-.06,.32,.25,.13,.22);box(chickenHead,M.red,0,-.22,.29,.12,.22,.1);box(chickenHead,M.red,0,.31,0,.14,.16,.35);
for(const x of [-.255,.255])box(chickenHead,M.dark,x,.04,.08,.025,.09,.08);
const wings=[-.46,.46].map(x=>{const g=new THREE.Group();g.position.set(x,.76,0);chicken.add(g);box(g,M.cream,0,-.15,0,.16,.4,.68);return g;});
for(const x of [-.22,.22]){box(chicken,M.gold,x,.19,.12,.09,.35,.09);box(chicken,M.gold,x,.035,.21,.22,.07,.31);}
const nest=groupAt(-4.1,.53,-2.95);box(nest,M.straw,0,.08,0,.9,.16,.7);for(const x of [-.46,.46])box(nest,M.straw,x,.18,0,.1,.23,.76);
function eggModel(){const g=new THREE.Group();box(g,M.cream,0,0,0,.32,.38,.32);box(g,M.white,0,.22,0,.24,.1,.24);box(g,M.cream,0,-.22,0,.24,.08,.24);return g;}
const egg=eggModel();egg.position.set(0,.4,0);nest.add(egg);target(nest,'chicken','EGG');
// A soft brown-and-cream cow, complete with ears, horns and a little bell.
const cow=target(groupAt(4.3,.5,-6.4),'cow','COW');cow.rotation.y=-.35;
box(cow,M.white,0,1.05,0,1.15,.95,1.85);
for(const x of [-.42,.42])for(const z of [-.62,.62]){box(cow,M.brown,x,.4,z,.25,.8,.29);box(cow,M.dark,x,.09,z,.27,.18,.31);}
box(cow,M.brown,-.585,1.13,-.45,.03,.61,.62);box(cow,M.brown,.585,1.2,.28,.03,.5,.67);box(cow,M.brown,.2,1.535,-.35,.6,.03,.71);
const cowHead=new THREE.Group();cowHead.position.set(0,1.5,1.02);cow.add(cowHead);
box(cowHead,M.white,0,0,0,.88,.8,.7);box(cowHead,M.pink,0,-.22,.38,.83,.32,.25);
for(const x of [-.22,.22]){box(cowHead,M.dark,x,.12,.359,.09,.1,.02);box(cowHead,M.brown,x,-.2,.512,.075,.065,.02);box(cowHead,M.cream,x,.5,-.08,.12,.27,.14);}
for(const x of [-.57,.57]){box(cowHead,M.brown,x,.1,0,.3,.19,.3);box(cowHead,M.pink,x,.2,0,.22,.03,.19);}
box(cow,M.pink,0,.55,.35,.55,.22,.45);box(cow,M.gold,0,.96,.94,.16,.22,.13);
const cowTail=new THREE.Group();cowTail.position.set(0,1.3,-.96);cow.add(cowTail);box(cowTail,M.brown,0,-.35,0,.09,.72,.09);box(cowTail,M.dark,0,-.73,0,.17,.2,.16);
function milkModel(){const g=new THREE.Group();box(g,M.stone,0,0,0,.5,.55,.5);box(g,M.white,0,.28,0,.43,.02,.43);for(const x of [-.29,.29])box(g,M.brown,x,.35,0,.07,.45,.07);box(g,M.brown,0,.58,0,.58,.07,.07);return g;}
const milk=milkModel();milk.position.set(3,.82,-5.15);milk.visible=false;world.add(milk);
// Three clearly separated bundles; each can only be harvested once.
const wheat=[];
for(let i=0;i<3;i++){
 const g=target(groupAt(4.2+i*1.18,.5,-10.6),'wheat','WHEAT');g.userData.index=i;box(g,M.dirt,0,.06,0,1.06,.12,1.3);
 const stalks=new THREE.Group();g.add(stalks);g.userData.stalks=stalks;
 for(let k=0;k<7;k++){const x=(k%3-1)*.27,z=(Math.floor(k/3)-1)*.35,y=.76+rnd()*.23;box(stalks,M.straw,x,y/2,z,.06,y,.06);box(stalks,M.gold,x,y+.12,z,.16,.32,.13);box(stalks,M.straw,x+.12,y-.08,z,.22,.06,.08).rotation.z=.6;}
 wheat.push(g);
}
// A sheltered outdoor kitchen. The awning stays behind the working surface.
const kitchen=groupAt(-.4,.5,-8.4);
for(const x of [-1.65,1.65])box(kitchen,M.log,x,1.85,-.65,.18,3.7,.18);
for(let i=0;i<8;i++){box(kitchen,i%2?M.cream:M.red,-1.75+i*.5,3.65,-.5,.5,.15,2.15);box(kitchen,i%2?M.cream:M.red,-1.75+i*.5,3.43,.57,.5,.42,.1);}
const table=target(new THREE.Group(),'table','TABLE');table.position.set(0,0,.42);kitchen.add(table);
box(table,M.table,0,1.08,0,2.4,.48,1.5);for(const x of [-.95,.95])for(const z of [-.52,.52])box(table,M.wood,x,.45,z,.2,.9,.2);
sign('CAKE CLUB',-.4,3.17,-8.98,2.4,.5);
function cakeModel(){const g=new THREE.Group();box(g,M.cream,0,-.35,0,1.35,.1,1.15);box(g,M.cake,0,-.08,0,1.15,.45,.95);box(g,M.white,0,.21,0,1.2,.19,1);for(const x of [-.42,-.12,.2,.43])box(g,M.white,x,.08,.49,.17,.22,.035);for(const x of [-.3,.3])for(const z of [-.23,.23]){box(g,M.red,x,.36,z,.19,.15,.19);box(g,M.leaf,x,.46,z,.12,.04,.11);}return g;}
const cake=cakeModel();cake.position.set(-.4,2.2,-7.98);cake.visible=false;world.add(cake);target(cake,'table','CAKE');
// Yesterday's stranger is today's friend: rounded expression, blush and a tiny apron.
const zombie=target(groupAt(-3.2,.5,-7.9),'zombie','ZOMBIE');zombie.scale.setScalar(1.15);zombie.rotation.y=.12;
box(zombie,M.teal,0,.96,0,.68,.78,.4);box(zombie,M.cream,0,.9,.215,.48,.65,.04);box(zombie,M.red,0,1.06,.245,.1,.1,.02);
for(const x of [-.18,.18])box(zombie,M.pants,x,.3,0,.3,.6,.36);
const zombieHead=new THREE.Group();zombieHead.position.y=1.69;zombie.add(zombieHead);
box(zombieHead,M.green,0,0,0,.74,.71,.66);box(zombieHead,M.leaf,0,.28,-.03,.76,.16,.64);
const eyes=[];
for(const x of [-.2,.2]){eyes.push(box(zombieHead,M.dark,x,.04,.34,.11,.12,.025));box(zombieHead,M.pink,x,-.09,.34,.14,.07,.025);}
box(zombieHead,M.dark,0,-.18,.342,.2,.045,.02);const smile=box(zombieHead,M.dark,0,-.14,.343,.11,.1,.02);smile.visible=false;
const arms=[-.49,.49].map(x=>{const g=new THREE.Group();g.position.set(x,1.23,0);zombie.add(g);box(g,M.green,0,-.22,.1,.26,.65,.28);return g;});
function bubbleTexture(text,color='#5e7047') {const c=document.createElement('canvas');c.width=512;c.height=160;const g=c.getContext('2d');g.fillStyle='#fffbed';g.beginPath();g.roundRect(8,8,496,124,25);g.fill();g.beginPath();g.moveTo(230,130);g.lineTo(247,156);g.lineTo(270,130);g.fill();g.fillStyle=color;g.font='800 43px Arial, sans-serif';g.textAlign='center';g.fillText(text,256,85);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
const hunger=new THREE.Sprite(new THREE.SpriteMaterial({map:bubbleTexture("I'm hungry."),depthTest:false}));hunger.position.set(-3.2,3.58,-7.9);hunger.scale.set(2.3,.72,1);world.add(hunger);
const ring=new THREE.Mesh(new THREE.RingGeometry(.65,.78,48),new THREE.MeshBasicMaterial({color:'#ffcf55',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
const arrow=new THREE.Mesh(new THREE.ConeGeometry(.16,.27,4),new THREE.MeshBasicMaterial({color:'#ffdb73'}));arrow.rotation.z=Math.PI;arrow.visible=false;scene.add(arrow);
let ringTarget=null,ringSize=1;
function setTarget(object,size=1){ringTarget=object;ringSize=size;ring.visible=arrow.visible=!!object;}
const tweens=[],particles=[];
function tween(seconds,fn){return new Promise(resolve=>tweens.push({start:gameTime,duration:reduced?Math.min(seconds,.18):seconds,fn,resolve}));}
const wait=seconds=>tween(seconds,()=>{});
function burst(position,count=16,material=M.gold){for(let i=0;i<count;i++){const m=new THREE.Mesh(BOX,material);m.scale.setScalar(.1+rnd()*.06);m.position.copy(position);scene.add(m);particles.push({m,v:new THREE.Vector3((rnd()-.5)*3,1+rnd()*3,(rnd()-.5)*3),life:1.1+rnd()*.6});}}
function wordSprite(word,position){const t=bubbleTexture(word,'#8d6a24');const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));sprite.position.copy(position);sprite.scale.set(2.1,.65,1);sprite.renderOrder=5;scene.add(sprite);void tween(1.6,(k,raw)=>{sprite.position.y=position.y+k*.7;sprite.material.opacity=raw<.7?1:(1-raw)/.3;}).then(()=>{scene.remove(sprite);t.dispose();sprite.material.dispose();});}
const SHOTS={
 intro:{pos:[5.8,4.8,4.6],look:[-1.8,1.5,-7],fov:58},
 zombie:{pos:[-.1,2.8,-3.1],look:[-3.1,1.65,-7.8],fov:54},
 chicken:{pos:[-1.8,2.25,.05],look:[-4.55,1.1,-3.6],fov:55},
 cow:{pos:[.7,2.7,-1.8],look:[4.2,1.6,-6],fov:56},
 wheat:{pos:[3.3,3.1,-6.7],look:[5.4,1.05,-10.6],fov:57},
 table:{pos:[2.2,3.1,-3.8],look:[-.4,1.75,-8],fov:54},
 final:{pos:[6.8,6.3,1.8],look:[-.4,1.5,-7.5],fov:58}
};
const cam={pos:new THREE.Vector3(...SHOTS.intro.pos),look:new THREE.Vector3(...SHOTS.intro.look),yaw:0,pitch:0,fov:58,shot:'intro'};
function shotPosition(name){const s=SHOTS[name],pos=new THREE.Vector3(...s.pos),look=new THREE.Vector3(...s.look);if(camera.aspect<.85){const offset=pos.clone().sub(look);offset.y=0;pos.addScaledVector(offset,.25);}return{pos,look,fov:s.fov+(camera.aspect<.85?10:0)};}
async function goShot(name,duration=1.35){const to=shotPosition(name),from={pos:cam.pos.clone(),look:cam.look.clone(),fov:cam.fov,yaw:cam.yaw,pitch:cam.pitch};cam.shot=name;await tween(duration,k=>{cam.pos.lerpVectors(from.pos,to.pos,k);cam.look.lerpVectors(from.look,to.look,k);cam.fov=from.fov+(to.fov-from.fov)*k;cam.yaw=from.yaw*(1-k);cam.pitch=from.pitch*(1-k);});}
const UP=new THREE.Vector3(0,1,0),RIGHT=new THREE.Vector3();
function applyCamera(){const direction=cam.look.clone().sub(cam.pos).applyAxisAngle(UP,cam.yaw);RIGHT.crossVectors(direction,UP).normalize();direction.applyAxisAngle(RIGHT,cam.pitch);camera.position.copy(cam.pos);camera.lookAt(camera.position.clone().add(direction));camera.fov=cam.fov;camera.updateProjectionMatrix();}
// Instruction and discovery UI. Inventory is earned only by its matching action.
const FRIEND_AVATAR='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#e3ead4"/><path fill="#88ad68" d="M13 10h38v40H13z"/><path fill="#6e9753" d="M13 10h38v9H13z"/><path fill="#31472b" d="M21 27h6v6h-6zm16 0h6v6h-6zM27 41h10v3H27z"/><path fill="#e9b49a" d="M18 36h9v4h-9zm19 0h9v4h-9z"/><path fill="#55a4a0" d="M9 50h46v14H9z"/><path fill="#fff4d5" d="M24 50h16v14H24z"/></svg>');
const ui={say:$('#say'),en:$('#say-en'),zh:$('#say-zh'),pocket:$('#pocket'),title:$('#title'),summary:$('#summary'),recipe:$('#recipe')};
function speak(text,{interrupt=false}={}){return voice.say(text,{interrupt});}
function say(en,zh,{speaker='JJ',remember=true,interrupt=true}={}){
 state.current={en,zh};const avatar=ui.say.querySelector('img');avatar.src=speaker==='JJ'?'./assets/guide.svg':FRIEND_AVATAR;avatar.alt=speaker==='JJ'?'英语伙伴 JJ':'友善的小僵尸';ui.say.querySelector('.guide-avatar > span').textContent=speaker==='JJ'?'JJ':'Z';ui.en.textContent=en;ui.zh.textContent=zh;ui.say.hidden=false;
 ui.say.classList.toggle('zombie-speaking',speaker!=='JJ');$('#guide-label').textContent=speaker==='JJ'?'YOUR GUIDE · 你的冒险伙伴':'YOUR NEW FRIEND · 你的新朋友';
 ui.say.classList.remove('bump');void ui.say.offsetWidth;ui.say.classList.add('bump');
 if(remember&&!state.sentences.includes(en))state.sentences.push(en);return speak(en,{interrupt});
}
function wordChip(word){const li=document.createElement('li');li.dataset.say=word.toLowerCase();li.setAttribute('role','button');li.tabIndex=0;const b=document.createElement('b'),i=document.createElement('i');b.textContent=word;i.textContent=ZH[word]||'';li.append(b,i);return li;}
function learn(word,position=null){if(!state.words.includes(word)){state.words.push(word);ui.pocket.append(wordChip(word));ui.pocket.hidden=false;sfx.pop();}if(position)wordSprite(word,position);updateStatus();}
function updateRecipe(){for(const [name,count,total,label]of[['egg',state.egg,1,'鸡蛋'],['milk',state.milk,1,'牛奶'],['wheat',state.wheat,3,'麦子']]){const item=$('#ingredient-'+name);item.classList.toggle('collected',count===total);item.querySelector('small').textContent=`${label} · ${count}/${total}`;item.querySelector('i').textContent=count===total?'✓':'○';}ui.recipe.classList.toggle('ready',state.egg===1&&state.milk===1&&state.wheat===3);}
const INSTR={
 1:['Look! A chicken. Tap the chicken!','看，一只小鸡！点一下小鸡，拿到鸡蛋。'],
 2:['Find the cow. We need milk!','找到奶牛，我们需要一桶牛奶！'],
 3:['We need three bundles of wheat.','还需要三束麦子。点麦田收割吧！'],
 4:['Put the egg, milk, and wheat on the table.','把鸡蛋、牛奶和三束麦子放到工作台上。'],
 5:['Give the cake to our hungry friend.','把蛋糕送给肚子饿的新朋友吧。']
};
const targetFor=()=>({1:chicken,2:cow,3:wheat.find(g=>!g.userData.harvested),4:table,5:zombie})[state.step];
function enter(step){state.step=step;stage.dataset.step=String(step);state.busy=false;setTarget(targetFor(),step===2?1.9:step===4?1.8:step===5?1.3:1);updateRecipe();updateStatus();if(INSTR[step])void say(...INSTR[step],{remember:false});}
async function reveal(word,object){
 learn(word);$('#loot-en').textContent=word;$('#loot-zh').textContent=ZH[word]||'';$('#loot').hidden=false;$('#loot').classList.add('in');
 const pos=object.getWorldPosition(new THREE.Vector3());burst(pos,20);sfx.ding();await speak(word.toLowerCase(),{interrupt:true});await wait(.5);$('#loot').hidden=true;$('#loot').classList.remove('in');
}
async function flyToPocket(object){
 object.updateWorldMatrix(true,false);const from=object.getWorldPosition(new THREE.Vector3());scene.attach(object);const initialScale=object.scale.clone();
 await tween(.7,(k,raw)=>{const to=camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.1));to.y-=.35;object.position.lerpVectors(from,to,k);object.position.y+=Math.sin(raw*Math.PI)*.65;object.rotation.y+=.05;object.scale.copy(initialScale).multiplyScalar(1-.99*k);});object.visible=false;
}
async function start(){
 if(state.step!==0||state.busy||paused)return;state.busy=true;state.started=gameTime;sfx.unlock();sfx.ambience();void voice.warm();ui.title.classList.add('hide');stage.classList.add('playing');canvas.focus({preventScroll:true});updateStatus();
 await goShot('zombie');learn('ZOMBIE');
 await Promise.all([say('Hello, my friend!','你好呀，我的新朋友！'),tween(1.4,(_k,r)=>{arms[1].rotation.z=-.9-Math.sin(r*Math.PI*6)*.35;})]);arms[1].rotation.z=0;
 learn('HUNGRY');await say("I'm hungry.",'我的肚子饿啦。',{speaker:'friend'});await say("Let's make a cake!",'那我们一起做个蛋糕吧！');
 ui.recipe.hidden=false;await goShot('chicken');learn('CHICKEN');enter(1);
}
async function getEgg(){
 if(state.egg)return;
 sfx.pop();await tween(.65,(_k,r)=>{wings.forEach((wing,i)=>wing.rotation.z=(i?1:-1)*Math.sin(r*Math.PI*4)*.8);egg.position.y=.4+Math.sin(r*Math.PI)*.5;});wings.forEach(w=>w.rotation.z=0);
 await reveal('EGG',egg);await say('An egg! Thank you, chicken!','一颗鸡蛋！谢谢你，小鸡！');await flyToPocket(egg);state.egg=1;updateRecipe();
 await goShot('cow');learn('COW');enter(2);
}
async function getMilk(){
 if(state.milk)return;milk.visible=true;milk.scale.setScalar(.1);sfx.pop();
 await tween(.8,(k,r)=>{milk.scale.setScalar(.1+k*.9);cowHead.rotation.x=Math.sin(r*Math.PI*2)*.14;});cowHead.rotation.x=0;
 await reveal('MILK',milk);await say('Milk! Thank you, cow!','牛奶！谢谢你，奶牛！');await flyToPocket(milk);state.milk=1;updateRecipe();await goShot('wheat');enter(3);
}
async function harvest(object){
 if(object.userData.harvested)return;
 object.userData.harvested=true;setTarget(null);const stalks=object.userData.stalks;const pos=object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1,0));sfx.crack();burst(pos,12,M.straw);
 await tween(.5,k=>{stalks.rotation.z=-k*.6;stalks.scale.y=1-k*.85;});stalks.visible=false;state.wheat++;learn('WHEAT',pos);updateRecipe();
 const count=['One!','Two!','Three!'][state.wheat-1];await say(count,`第 ${state.wheat} 束麦子！已收集 ${state.wheat}/3。`);
 if(state.wheat===3){await wait(.2);await goShot('table');enter(4);}else{state.busy=false;setTarget(targetFor());updateStatus();}
}
async function makeCake(){
 if(state.egg!==1||state.milk!==1||state.wheat!==3){enter(state.egg!==1?1:state.milk!==1?2:3);return;}
 const ingredients=[eggModel(),milkModel(),new THREE.Group()];
 for(const dx of [-.12,0,.12]){box(ingredients[2],M.straw,dx,0,0,.06,.6,.06);box(ingredients[2],M.gold,dx,.3,0,.13,.23,.1);}
 const center=new THREE.Vector3(-.4,1.98,-7.98);
 ingredients.forEach((g,i)=>{g.position.copy(center).add(new THREE.Vector3((i-1)*.7,0,0));g.scale.setScalar(.8);world.add(g);});
 await say('Mix, mix, mix!','鸡蛋、牛奶、麦子——搅一搅！');sfx.craft();
 await tween(1.25,(k,r)=>ingredients.forEach((g,i)=>{const angle=i*Math.PI*2/3+r*Math.PI*4;g.position.set(center.x+Math.cos(angle)*(1-k)*.9,center.y+Math.sin(r*Math.PI)*.65,center.z+Math.sin(angle)*(1-k)*.6);g.rotation.y=r*Math.PI*3;g.scale.setScalar(.8*(1-k));}));ingredients.forEach(g=>world.remove(g));
 cake.visible=true;cake.scale.setScalar(.01);await tween(.65,k=>cake.scale.setScalar(k));await reveal('CAKE',cake);state.cake=true;updateStatus();await say('A cake! We made a cake!','一个蛋糕！我们亲手做好啦！');
 await goShot('zombie');enter(5);
}
async function feedFriend(){
 if(!state.cake)return;hunger.visible=false;setTarget(null);const from=cake.position.clone();
 const to=zombie.localToWorld(new THREE.Vector3(0,1.28,.62));
 await tween(1.1,(k,r)=>{cake.position.lerpVectors(from,to,k);cake.position.y+=Math.sin(r*Math.PI)*.7;cake.rotation.y=r*Math.PI*2;arms.forEach(a=>a.rotation.x=-k*.7);});
 await tween(.75,(_k,r)=>{cake.scale.setScalar(Math.max(.01,1-r));zombieHead.rotation.x=Math.sin(r*Math.PI*4)*.15;});cake.visible=false;zombieHead.rotation.x=0;smile.visible=true;
 burst(zombie.position.clone().add(new THREE.Vector3(0,2.4,0)),28,M.pink);sfx.levelup();learn('FRIEND');
 await Promise.all([say('Yummy! Thank you!','真好吃！谢谢你！',{speaker:'friend'}),tween(1.6,(_k,r)=>{zombie.position.y=.5+Math.abs(Math.sin(r*Math.PI*3))*.22;arms[1].rotation.z=-.9-Math.sin(r*Math.PI*6)*.25;})]);zombie.position.y=.5;arms.forEach(a=>{a.rotation.x=0;a.rotation.z=0;});
 await say("You're welcome, my friend!",'不客气，我的朋友！');ui.recipe.hidden=true;await goShot('final',1.7);state.step=6;stage.dataset.step='6';state.busy=false;updateStatus();await wait(.5);showSummary();
}
async function act(object){
 if(paused||state.busy||state.step===0||!ui.summary.hidden||helpDialog.open)return;
 const kind=object.userData.kind,required=({1:'chicken',2:'cow',3:'wheat',4:'table',5:'zombie'})[state.step];
 if(kind!==required){if(ZH[object.userData.word]){learn(object.userData.word,object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.5,0)));void speak(object.userData.word.toLowerCase(),{interrupt:true});}return;}
 if(kind==='wheat'&&object.userData.harvested)return;
 state.busy=true;setTarget(null);voice.stop();sfx.unlock();updateStatus();
 try{if(state.step===1)await getEgg();else if(state.step===2)await getMilk();else if(state.step===3)await harvest(object);else if(state.step===4)await makeCake();else if(state.step===5)await feedFriend();}
 catch(error){console.error('Farm action failed',error);state.busy=false;setTarget(targetFor());updateStatus();}
}
function taskAction(){if(paused||state.busy||!ui.summary.hidden||helpDialog.open)return;if(state.step===0){void start();return;}const object=targetFor();if(object)void act(object);}
// Pointer drag rotates the view; a tap is ray-cast against actual visible objects.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
function pickAt(x,y){const r=canvas.getBoundingClientRect();pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(hot,true);for(const hit of hits){let object=hit.object,visible=true;for(let p=object;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;while(object&&!object.userData.kind)object=object.parent;if(object)return object;}return null;}
canvas.addEventListener('pointerdown',e=>{if(paused)return;sfx.unlock();down={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:cam.yaw,pitch:cam.pitch,drag:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!down){if(!touch)canvas.style.cursor=pickAt(e.clientX,e.clientY)?'pointer':'grab';return;}if(e.pointerId!==down.id)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>7)down.drag=true;if(down.drag&&!state.busy&&state.step>0&&!paused){cam.yaw=Math.max(-1,Math.min(1,down.yaw-dx*.004));cam.pitch=Math.max(-.4,Math.min(.4,down.pitch-dy*.003));}});
canvas.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;const wasDrag=down.drag;down=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!wasDrag){const object=pickAt(e.clientX,e.clientY);if(object)void act(object);}});
canvas.addEventListener('pointercancel',()=>{down=null;});
$('#title button').addEventListener('click',()=>void start());$('#task-action').addEventListener('click',taskAction);
$('#say-spk').addEventListener('click',()=>{if(state.current)void speak(state.current.en,{interrupt:true});});
for(const container of [ui.pocket,ui.summary]){container.addEventListener('click',event=>{const item=event.target.closest('[data-say]');if(item)void speak(item.dataset.say,{interrupt:true});});container.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('li[data-say]')){event.preventDefault();event.target.click();}});}
// The completion card captures the real farm, with readable learned-word labels.
function showSummary(){if(state.step!==6)return;voice.stop();$('#sum-stats').innerHTML=`<b>${state.words.length}</b> 个英语词 · <b>${state.sentences.length}</b> 句话 · 约 <b>${Math.max(1,Math.round(state.elapsed/60))}</b> 分钟`;$('#sum-words').replaceChildren(...state.words.map(wordChip));ui.summary.hidden=false;ui.say.hidden=true;$('#sum-card').focus({preventScroll:true});updateStatus();}
function snapshotWorld(){
 const w=1280,h=680,rt=new THREE.WebGLRenderTarget(w,h),aspect=camera.aspect;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setRenderTarget(rt);renderer.render(scene,camera);const pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,pixels);renderer.setRenderTarget(null);rt.dispose();camera.aspect=aspect;camera.updateProjectionMatrix();
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),image=g.createImageData(w,h);for(let y=0;y<h;y++)image.data.set(pixels.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);g.putImageData(image,0,0);return c;
}
async function makeCard(){const button=$('#sum-card');button.disabled=true;button.textContent='正在制作卡片…';try{
 const c=document.createElement('canvas');c.width=1080;c.height=1480;const g=c.getContext('2d');g.fillStyle='#f8f5e9';g.fillRect(0,0,1080,1480);g.fillStyle='#e5bd64';g.fillRect(0,0,1080,14);
 g.fillStyle='#788758';g.font='800 23px Arial, sans-serif';g.fillText('ENGLISH ISLAND / DAY TWO',64,80);g.fillStyle='#34452f';g.font='800 58px "PingFang SC", sans-serif';g.fillText('我的农场冒险',64,160);g.font='25px "PingFang SC", sans-serif';g.fillStyle='#899277';g.fillText(`${new Date().toLocaleDateString('zh-CN')} · 农场小厨师达成`,64,215);
 finishedShot??=snapshotWorld();g.save();g.beginPath();g.roundRect(64,258,952,506,23);g.clip();g.drawImage(finishedShot,64,258,952,506);g.restore();g.fillStyle='#34452f';g.font='800 31px "PingFang SC", sans-serif';g.fillText(`收集了 ${state.words.length} 个新单词`,64,829);
 let x=64,y=862;for(const word of state.words){g.font='800 26px Arial, sans-serif';const ew=g.measureText(word).width;g.font='21px "PingFang SC", sans-serif';const width=ew+g.measureText(ZH[word]||'').width+54;if(x+width>1016){x=64;y+=70;}g.fillStyle='#e8ecd9';g.beginPath();g.roundRect(x,y,width,54,9);g.fill();g.fillStyle='#51663d';g.font='800 26px Arial, sans-serif';g.fillText(word,x+17,y+35);g.fillStyle='#859170';g.font='21px "PingFang SC", sans-serif';g.fillText(ZH[word]||'',x+ew+33,y+34);x+=width+12;}
 g.fillStyle='#d1d8bf';g.fillRect(64,1228,952,2);g.fillStyle='#52693f';g.font='800 31px Arial, sans-serif';g.fillText('“Yummy! Thank you!”',64,1292);g.fillText('“You’re welcome, my friend!”',64,1342);g.fillStyle='#899277';g.font='24px "PingFang SC", sans-serif';g.fillText('一个蛋糕，一个朋友，一点点成长。',64,1413);
 const url=c.toDataURL('image/png');$('#sum-img').src=url;$('#sum-img').hidden=false;const link=$('#sum-dl');link.href=url;link.download=`english-island-day-two-${Date.now()}.png`;link.hidden=false;button.textContent='卡片已生成 ↓';sfx.ding();$('#sum-img').scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
 }catch(error){console.error(error);button.textContent='生成失败，点击重试';}finally{button.disabled=false;}}
function goFirst(){voice.stop();if(parent!==window)parent.postMessage({type:'island-navigate',level:1},location.origin);else location.href='./index.html';}
$('#sum-card').addEventListener('click',()=>void makeCard());$('#sum-again').addEventListener('click',()=>location.reload());$('#sum-first').addEventListener('click',goFirst);$('#back-level').addEventListener('click',goFirst);
$('#sum-close').addEventListener('click',()=>{ui.summary.hidden=true;canvas.focus({preventScroll:true});void say('What else can you find?','拖动看看四周，点小鸡、奶牛、花朵和水，继续发现英语。',{remember:false});updateStatus();});
// Help, explicit pause and browser visibility compose without resuming each other.
const helpDialog=$('#help-dialog'),pauseReasons=new Set();
function pauseGame(value,reason='external'){if(value)pauseReasons.add(reason);else pauseReasons.delete(reason);const next=pauseReasons.size>0;if(paused===next)return;paused=next;down=null;sfx.paused=next;voice.setPaused(next);updateStatus();}
function showHelp(){pauseGame(true,'help');if(!helpDialog.open)helpDialog.showModal();}
helpDialog.addEventListener('close',()=>{pauseGame(false,'help');canvas.focus({preventScroll:true});});$('#help-close').addEventListener('click',()=>helpDialog.close());$('#help-done').addEventListener('click',()=>helpDialog.close());$('#help-button').addEventListener('click',showHelp);
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog){const r=helpDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)helpDialog.close();}});
function updateSound(){const b=$('#snd');b.setAttribute('aria-pressed',String(sfx.muted));b.setAttribute('aria-label',sfx.muted?'打开声音':'关闭声音');b.textContent=sfx.muted?'声音：关':'声音：开';}
$('#snd').addEventListener('click',()=>{sfx.muted=!sfx.muted;if(sfx.muted)voice.stop();sfx.unlock();updateSound();updateStatus();});$('#restart-button').addEventListener('click',()=>location.reload());
if(window===parent){stage.classList.add('standalone');$('.standalone-tools').hidden=false;}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='island-command')return;const data=event.data;
 if(data.command==='start')void start();if(data.command==='act')taskAction();if(data.command==='mute')$('#snd').click();if(data.command==='restart')location.reload();if(data.command==='help'){if(helpDialog.open)helpDialog.close();else showHelp();}if(data.command==='summary')showSummary();if(data.command==='speak'&&typeof data.word==='string')void speak(data.word.toLowerCase(),{interrupt:true});if(data.command==='pause')pauseGame(true);if(data.command==='resume')pauseGame(false);
});
window.addEventListener('keydown',event=>{if(event.defaultPrevented)return;if(event.key===' '&&!event.repeat&&!['BUTTON','A','INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){event.preventDefault();taskAction();}if(event.key==='Escape'&&helpDialog.open)helpDialog.close();});
document.addEventListener('visibilitychange',()=>pauseGame(document.hidden,'visibility'));
let lastStatus='';
function updateStatus(){const pocketBottom=ui.pocket.offsetTop+ui.pocket.offsetHeight;ui.recipe.style.top=Math.max(stage.clientWidth<=700?78:67,pocketBottom+12)+'px';const button=$('#task-action');button.hidden=state.step===0||state.step===6||!ui.summary.hidden;button.disabled=state.busy||paused;const labels={1:'从小鸡那里拿鸡蛋',2:'给小桶装牛奶',3:`收割麦子 · ${state.wheat}/3`,4:'一起合成蛋糕',5:'把蛋糕送给朋友'};$('#action-label').textContent=state.busy?'跟着 JJ，看看会发生什么…':labels[state.step]||'';
 const data={type:'island-status',level:2,ready:true,step:state.step,busy:state.busy,words:[...state.words],muted:sfx.muted,completed:state.step===6,egg:state.egg,milk:state.milk,wheat:state.wheat,cake:state.cake,paused};const json=JSON.stringify(data);if(json!==lastStatus){lastStatus=json;parent.postMessage(data,location.origin);}}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;if(!state.busy){const s=shotPosition(cam.shot);cam.pos.copy(s.pos);cam.look.copy(s.look);cam.fov=s.fov;}camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();updateSound();updateRecipe();updateStatus();
let frame=0;
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05,Math.max(0,(now-previousTime)/1000));previousTime=now;if(!paused){gameTime+=dt;if(state.started&&state.step<6)state.elapsed+=dt;
 for(let i=tweens.length-1;i>=0;i--){const t=tweens[i],raw=Math.min(1,(gameTime-t.start)/t.duration),k=raw<.5?4*raw**3:1-(-2*raw+2)**3/2;t.fn(k,raw);if(raw>=1){tweens.splice(i,1);t.resolve();}}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.v.y-=5*dt;p.m.position.addScaledVector(p.v,dt);p.m.rotation.x+=dt*3;p.m.rotation.y+=dt*4;if(p.life<=0){scene.remove(p.m);particles.splice(i,1);}}
 if(!reduced){clouds.forEach((g,i)=>{g.position.x+=dt*(.1+i*.012);if(g.position.x>48)g.position.x=-48;});chickenHead.rotation.x=Math.sin(gameTime*1.6)*.08;cowTail.rotation.z=Math.sin(gameTime*2)*.22;eyes.forEach(e=>e.scale.y=(gameTime%5.1)>4.94?.018:.12);if(!state.busy){zombieHead.rotation.z=Math.sin(gameTime*1.4)*.045;chicken.position.y=.5+Math.max(0,Math.sin(gameTime*1.7))*.035;}hunger.position.y=3.58+Math.sin(gameTime*1.5)*.06;}
 }
 if(ringTarget){const position=ringTarget.getWorldPosition(new THREE.Vector3());ring.position.set(position.x,.525,position.z);ring.scale.setScalar(ringSize*(reduced?1:1+Math.sin(gameTime*3)*.07));arrow.position.set(position.x,state.step===2?3.5:state.step===4?2.8:state.step===5?3.4:2.35,position.z);if(!reduced)arrow.position.y+=Math.sin(gameTime*3)*.12;}
 applyCamera();renderer.shadowMap.needsUpdate=frame<3||state.busy||frame%4===0;frame++;renderer.render(scene,camera);
});
window.__yf={level:2,state,ORDER,ZH,start,taskAction,showSummary,makeCard,pauseGame,goShot,cam,scene,camera,hot,chicken,cow,wheat,zombie,table,cake,tap(kind){const object=kind==='wheat'?wheat.find(g=>!g.userData.harvested):hot.find(g=>g.userData.kind===kind||g.userData.word===kind);return object?act(object):Promise.resolve();},get paused(){return paused;}};
const statusInterval=setInterval(updateStatus,150);
window.addEventListener('pagehide',()=>{clearInterval(statusInterval);voice.stop();renderer.setAnimationLoop(null);renderer.dispose();});
