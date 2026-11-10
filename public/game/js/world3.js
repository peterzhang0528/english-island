// Chapter 03: a creekside garden grows from care, sunshine and a tiny seed.
import * as THREE from './vendor/three.module.min.js';
import { createTextures } from './textures.js';
import { sfx } from './sfx.js';
import { voice } from './voice.js';

const $ = selector => document.querySelector(selector);
const stage = $('#stage'), canvas = $('#world');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
const ZH = { GARDEN:'花园', SOIL:'泥土', DIG:'挖', SEED:'种子', PLANT:'种下', WATER:'水', SUN:'太阳', GROW:'生长', FLOWER:'花', BEE:'蜜蜂', FRIEND:'朋友', TREE:'树', CLOUD:'云', GRASS:'草' };
const ORDER = ['GARDEN','FRIEND','SOIL','DIG','SEED','PLANT','WATER','SUN','GROW','FLOWER','BEE'];
const state = {step:0,words:[],sentences:[],busy:false,current:null,prepared:false,planted:false,watered:false,grown:false,shared:false,started:null,elapsed:0};
let paused=false,gameTime=0,previousTime=performance.now(),finishedShot=null;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,touch?1.5:2));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.fog=new THREE.Fog('#d9e9de',30,82);
const camera=new THREE.PerspectiveCamera(57,1,.1,150);
const world=new THREE.Group();scene.add(world,camera);
const T=createTextures(THREE);
const lam=color=>new THREE.MeshLambertMaterial({color}),tex=map=>new THREE.MeshLambertMaterial({map});
const M={
 grass:[tex(T.grassSide),tex(T.grassSide),tex(T.grassTop),tex(T.dirt),tex(T.grassSide),tex(T.grassSide)],
 dirt:tex(T.dirt),wood:tex(T.planks),log:tex(T.logSide),leaves:tex(T.leaves),stone:tex(T.stone),
 cream:lam('#fff5d7'),white:lam('#fffef3'),brown:lam('#826445'),dark:lam('#304236'),pink:lam('#e9b5a5'),
 coral:lam('#e6a391'),blue:lam('#96bbd7'),violet:lam('#b4a7d3'),leaf:lam('#6caa69'),gold:lam('#f8d776'),straw:lam('#d7b267'),
 green:lam('#8aae6c'),sage:lam('#a6bea0'),teal:lam('#77a9a7'),pants:lam('#657da3'),soil:lam('#745238'),wet:lam('#513d2e'),seed:lam('#d5b379'),
 water:new THREE.MeshLambertMaterial({map:T.water,transparent:true,opacity:.84}),drop:new THREE.MeshBasicMaterial({color:'#9de2f4',transparent:true,opacity:.85}),
 glass:new THREE.MeshLambertMaterial({color:'#d9f3e6',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}),
 cloud:new THREE.MeshBasicMaterial({color:'#fffef7'}),bee:lam('#f3cb5a'),stripe:lam('#69573d'),
 wing:new THREE.MeshLambertMaterial({color:'#fffdf3',transparent:true,opacity:.78,depthWrite:false,side:THREE.DoubleSide})
};
const BOX=new THREE.BoxGeometry(1,1,1),hot=[];
let seed=47;
const rnd=()=> (seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
function box(parent,material,x,y,z,w=1,h=1,d=1){const mesh=new THREE.Mesh(BOX,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function groupAt(x,y,z){const g=new THREE.Group();g.position.set(x,y,z);world.add(g);return g;}
function target(group,kind,word){group.userData={...group.userData,kind,word};hot.push(group);return group;}
function instances(positions,material,scale=[1,1,1],parent=world){const m=new THREE.InstancedMesh(BOX,material,positions.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(...scale);positions.forEach((p,i)=>m.setMatrixAt(i,matrix.compose(new THREE.Vector3(...p),q,s)));m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
const skyGeo=new THREE.SphereGeometry(100,24,16),colors=[];
const skyTop=new THREE.Color('#8abde2'),horizon=new THREE.Color('#edf2df');
for(let i=0;i<skyGeo.attributes.position.count;i++){const y=skyGeo.attributes.position.getY(i)/100,c=horizon.clone().lerp(skyTop,Math.max(0,y));colors.push(c.r,c.g,c.b);}
skyGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));scene.add(new THREE.Mesh(skyGeo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false})));
const hemi=new THREE.HemisphereLight('#f0f6ed','#7c9466',1.4);scene.add(hemi);
const sunlight=new THREE.DirectionalLight('#fff0c3',2.1);sunlight.position.set(-12,25,10);sunlight.castShadow=true;sunlight.shadow.mapSize.set(touch?1024:2048,touch?1024:2048);
Object.assign(sunlight.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:1,far:65});sunlight.shadow.bias=-.0004;sunlight.shadow.normalBias=.04;scene.add(sunlight);
// A winding creek and a low stone terrace replace the farm's flat courtyard.
const grass=[],dirt=[],water=[],stones=[],path=[];
for(let x=-23;x<=23;x++)for(let z=-24;z<=17;z++){
 const creek=Math.abs(z-(3+Math.sin(x*.24)*1.2))<1.15;
 const far=Math.hypot(x,z+4)>17,h=far?Math.max(0,Math.round((Math.sin(x*.27)+Math.cos(z*.24)+1.5)*.8)):0;
 const terrace=Math.abs(x)<6&&z<=-3&&z>=-11;
 if(creek){water.push([x,.17,z]);dirt.push([x,-.6,z]);}
 else if(terrace)stones.push([x,.12,z]);
 else if(Math.abs(x)<1.1&&z>=-2&&z<=8)path.push([x,0,z]);
 else grass.push([x,h,z]);
 if(far)for(let y=-1;y<h;y++)dirt.push([x,y,z]);
}
instances(grass,M.grass);instances(dirt,M.dirt);instances(stones,M.stone,[1,.98,1]);instances(path,M.dirt);
target(instances(water,M.water,[1,.16,1]),'stream','WATER');
const bridge=groupAt(0,0,3);for(let z=-1.8;z<=1.8;z+=.4)box(bridge,M.wood,0,.64+Math.cos(z*.5)*.1,z,2.15,.16,.34);
for(const x of [-1.08,1.08]){for(const z of [-1.55,0,1.55])box(bridge,M.log,x,1.02,z,.13,.8,.13);box(bridge,M.wood,x,1.36,0,.12,.12,3.6);}
box(world,M.stone,0,.58,-1.7,6,.2,1);box(world,M.stone,0,.68,-2.5,8,.2,1);
function tree(x,z,height=4){const g=groupAt(x,.5,z),logs=[],leaves=[];for(let y=.5;y<height;y++)logs.push([0,y,0]);for(let y=height-1;y<=height+1;y++)for(let xx=-1;xx<=1;xx++)for(let zz=-1;zz<=1;zz++){if(y===height+1&&Math.abs(xx)+Math.abs(zz)>1)continue;leaves.push([xx,y,zz]);}instances(logs,M.log,[1,1,1],g);instances(leaves,M.leaves,[1,1,1],g);target(g,'tree','TREE');}
[[-15,-6,4],[-16,-16,5],[-7,-20,4],[3,-22,5],[15,-11,4],[16,0,5],[-15,7,5],[12,10,4]].forEach(p=>tree(...p));
const clouds=[];for(let i=0;i<7;i++){const g=groupAt(-32+i*11,16+rnd()*4,-28+rnd()*9),p=[];for(let k=0;k<5;k++)p.push([(k-2)*1.7,rnd()*.35,rnd()]);instances(p,M.cloud,[2.5,.7,1.8],g);target(g,'cloud','CLOUD');clouds.push(g);}
function sign(text,x,y,z,w=3,h=.7){const c=document.createElement('canvas');c.width=640;c.height=160;const g=c.getContext('2d');g.fillStyle='#f3edce';g.fillRect(0,0,640,160);g.strokeStyle='#9cad87';g.lineWidth=11;g.strokeRect(6,6,628,148);g.fillStyle='#5d7655';g.font='800 57px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,320,83);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshLambertMaterial({map:t,side:THREE.DoubleSide}));m.position.set(x,y,z);world.add(m);return m;}
// Trellises and a glasshouse make a distinct backdrop for the little flower bed.
const arch=groupAt(0,.5,-14.4);for(const x of [-2.7,2.7])box(arch,M.wood,x,2,0,.22,4,.22);box(arch,M.wood,0,4.03,0,5.9,.25,.3);
for(const x of [-2.65,2.65])for(let y=.5;y<4.4;y+=.5){box(arch,M.leaves,x+Math.sin(y*3)*.1,y,.1,.45,.36,.4);if(y>1.4)box(arch,y%1<.5?M.coral:M.cream,x-.09,y+.05,.35,.22,.22,.13);}
sign('GROW TOGETHER',0,4.15,-14.2,3.9,.65);
const house=groupAt(9,.5,-12.8);box(house,M.wood,0,.08,0,5,.16,4.8);
for(const x of [-2.4,0,2.4])for(const z of [-2.25,2.25])box(house,M.cream,x,1.75,z,.12,3.5,.12);
for(const y of [.5,1.7,3.4]){box(house,M.cream,0,y,2.25,4.9,.1,.12);box(house,M.cream,0,y,-2.25,4.9,.1,.12);for(const x of [-2.4,2.4])box(house,M.cream,x,y,0,.12,.1,4.5);}
for(const x of [-2.4,2.4])box(house,M.glass,x,1.8,0,.04,3.1,4.5);for(const z of [-2.25,2.25])box(house,M.glass,0,1.8,z,4.8,3.1,.04);
for(const side of [-1,1]){const roof=box(house,M.glass,side*1.2,4.02,0,2.8,.055,4.6);roof.rotation.z=-side*.45;for(const z of [-2.3,0,2.3])box(house,M.cream,side*1.2,4.02,z,2.8,.1,.1).rotation.z=-side*.45;}
box(house,M.cream,0,4.6,0,.13,.13,4.7);for(let i=0;i<5;i++){box(house,M.coral,-1.7+i*.8,.55,-.7,.46,.65,.46);box(house,M.leaf,-1.7+i*.8,1.06,-.7,.54,.5,.54);}
const mill=groupAt(-10,.5,-11);box(mill,M.cream,0,1.55,0,1.9,3.1,1.9);box(mill,M.sage,0,3.25,0,2.4,.5,2.3);box(mill,M.wood,0,1,.99,.75,1.7,.08);
const millBlades=new THREE.Group();millBlades.position.set(0,3.45,1.25);mill.add(millBlades);for(let i=0;i<4;i++){const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;box(blade,M.wood,0,1,0,.13,2.3,.12);box(blade,M.cream,.22,1.42,0,.52,1.05,.07);millBlades.add(blade);}box(millBlades,M.straw,0,0,.08,.34,.34,.2);
for(let i=0;i<75;i++){const x=rnd()*34-17,z=rnd()*31-20;if((Math.abs(x)<7&&z>-13&&z<8)||(x>5&&x<13&&z<-9)||(Math.abs(z-(3+Math.sin(x*.24)*1.2))<2))continue;const g=groupAt(x,.5,z);box(g,M.leaf,0,.17,0,.065,.35,.065);box(g,i%3===0?M.coral:i%3===1?M.violet:M.gold,0,.38,0,.24,.12,.24);target(g,'wildflower','FLOWER');}
// The one task bed contains three distinct plants. Each task is one guarded action.
const soilBed=target(groupAt(0,.7,-7.2),'soil','SOIL');
box(soilBed,M.wood,0,.18,0,4.7,.4,2.15);box(soilBed,M.soil,0,.4,0,4.35,.12,1.8);
for(const x of [-2.35,2.35])box(soilBed,M.cream,x,.42,0,.12,.2,2.2);for(const z of [-1.05,1.05])box(soilBed,M.cream,0,.42,z,4.8,.2,.12);
const bedCenters=[-1.35,0,1.35].map(x=>new THREE.Vector3(x,1.18,-7.2));
const ridges=new THREE.Group();soilBed.add(ridges);ridges.visible=false;
for(const x of [-1.35,0,1.35])for(const z of [-.55,-.15,.25,.65])box(ridges,M.dirt,x,.49,z,1.13,.12,.23);
const plantedSeeds=bedCenters.map(p=>{const g=groupAt(p.x,p.y,p.z);box(g,M.seed,0,0,0,.16,.11,.13);g.visible=false;return g;});
const sprouts=bedCenters.map(p=>{const g=groupAt(p.x,p.y,p.z);box(g,M.leaf,0,.16,0,.07,.32,.07);box(g,M.leaf,-.12,.24,0,.24,.08,.13).rotation.z=.35;box(g,M.green,.12,.3,0,.24,.08,.13).rotation.z=-.35;g.visible=false;return g;});
const flowers=bedCenters.map((p,i)=>{const g=target(groupAt(p.x,p.y,p.z),'flower','FLOWER');box(g,M.leaf,0,.75,0,.12,1.5,.12);box(g,M.leaf,-.23,.57,0,.5,.12,.2).rotation.z=.5;box(g,M.green,.23,.94,0,.5,.12,.2).rotation.z=-.5;const head=new THREE.Group();head.position.y=1.58;g.add(head);const petal=[M.coral,M.gold,M.violet][i];for(let k=0;k<8;k++){const a=k*Math.PI/4;box(head,petal,Math.cos(a)*.37,Math.sin(a)*.37,0,.31,.31,.16).rotation.z=a;}box(head,i===1?M.brown:M.gold,0,0,.08,.37,.37,.18);g.rotation.y=[-.2,.12,.3][i];g.visible=false;g.userData.head=head;return g;});
const shovel=target(groupAt(-2.7,.73,-5.7),'soil','DIG');box(shovel,M.brown,0,.85,0,.09,1.4,.1);box(shovel,M.stone,0,.13,0,.42,.5,.1);box(shovel,M.cream,0,1.58,0,.33,.1,.12);shovel.rotation.z=-.25;
const pottingBench=groupAt(-4.35,.7,-4.5);box(pottingBench,M.wood,0,.94,0,1.8,.18,1.2);for(const x of [-.68,.68])for(const z of [-.42,.42])box(pottingBench,M.wood,x,.44,z,.15,.88,.15);
const seedPacket=target(groupAt(-4.35,2.02,-4.5),'seed','SEED');box(seedPacket,M.cream,0,0,0,.62,.82,.16);box(seedPacket,M.sage,0,-.24,.09,.63,.25,.035);box(seedPacket,M.leaf,0,.02,.1,.045,.33,.035);box(seedPacket,M.gold,0,.23,.12,.24,.23,.045);for(const x of [-.11,.11])box(seedPacket,M.leaf,x,.05,.12,.2,.06,.025).rotation.z=x<0?.4:-.4;
sign('SEEDS',-4.35,1.48,-3.87,1.1,.28);
const wateringCan=target(groupAt(3.9,1.39,-4.5),'water','WATER');
box(wateringCan,M.teal,0,0,0,.72,.68,.65);box(wateringCan,M.cream,0,.37,0,.74,.08,.67);box(wateringCan,M.dark,0,.414,0,.48,.015,.43);
const spout=box(wateringCan,M.teal,-.52,.1,0,.65,.17,.19);spout.rotation.z=-.55;box(wateringCan,M.cream,-.84,.31,0,.15,.35,.31).rotation.z=-.55;
box(wateringCan,M.teal,.52,.16,0,.12,.76,.15);box(wateringCan,M.teal,.31,.5,0,.48,.12,.15);box(wateringCan,M.teal,.31,-.2,0,.48,.12,.15);
box(world,M.stone,3.9,.8,-4.5,1.2,.58,1.2);
// A sun-shaped crank opens a real retracting shade above the bed.
const pergola=groupAt(0,.7,-8.65);for(const x of [-2.8,2.8])box(pergola,M.wood,x,1.9,0,.18,3.8,.18);box(pergola,M.wood,0,3.78,0,5.9,.18,.2);
const shade=new THREE.Group();shade.position.set(0,4.42,-8.65);world.add(shade);
for(let i=0;i<8;i++){box(shade,i%2?M.cream:M.sage,-2.45+i*.7,0,1.4,.7,.1,2.9);box(shade,i%2?M.cream:M.sage,-2.45+i*.7,-.14,2.84,.7,.3,.08);}
const sunCrank=target(groupAt(3.3,2.24,-8.45),'sun','SUN');box(world,M.wood,3.3,1.38,-8.5,.16,1.65,.16);const crankWheel=new THREE.Group();sunCrank.add(crankWheel);
box(crankWheel,M.gold,0,0,0,.57,.57,.2);box(crankWheel,M.cream,0,0,.12,.29,.29,.08);for(let k=0;k<8;k++){const a=k*Math.PI/4;box(crankWheel,M.gold,Math.cos(a)*.49,Math.sin(a)*.49,0,.19,.19,.15).rotation.z=a;}
box(crankWheel,M.brown,.42,0,.21,.12,.12,.3);
// The friend from the cake chapter now has a gardener's hat and apron.
const friend=target(groupAt(-3.55,.7,-8.25),'friend','FRIEND');friend.scale.setScalar(1.1);friend.rotation.y=.2;
box(friend,M.teal,0,.96,0,.68,.78,.4);box(friend,M.cream,0,.9,.22,.48,.65,.04);box(friend,M.coral,0,1.02,.25,.13,.13,.02);
for(const x of [-.18,.18])box(friend,M.pants,x,.3,0,.3,.6,.36);
const friendHead=new THREE.Group();friendHead.position.y=1.69;friend.add(friendHead);box(friendHead,M.green,0,0,0,.74,.71,.66);box(friendHead,M.straw,0,.38,0,1.05,.12,.94);box(friendHead,M.straw,0,.55,-.02,.67,.28,.61);box(friendHead,M.coral,0,.45,.31,.68,.08,.035);
const eyes=[];for(const x of [-.2,.2]){eyes.push(box(friendHead,M.dark,x,.04,.34,.11,.12,.025));box(friendHead,M.pink,x,-.09,.34,.14,.07,.025);}box(friendHead,M.dark,0,-.17,.34,.2,.045,.02);
const arms=[-.49,.49].map(x=>{const g=new THREE.Group();g.position.set(x,1.23,0);friend.add(g);box(g,M.green,0,-.22,.1,.26,.65,.28);return g;});
const bee=target(groupAt(2.2,2.65,-6.1),'bee','BEE');bee.visible=false;bee.rotation.y=-.25;
box(bee,M.bee,0,0,0,.84,.62,1.1);for(const z of [-.34,.02]){box(bee,M.stripe,0,.32,z,.86,.025,.16);for(const x of [-.43,.43])box(bee,M.stripe,x,0,z,.025,.63,.16);}
box(bee,M.bee,0,.02,.64,.72,.57,.22);for(const x of [-.2,.2]){box(bee,M.dark,x,.08,.765,.09,.11,.02);box(bee,M.pink,x,-.07,.765,.13,.055,.025);box(bee,M.dark,x,.43,.61,.045,.3,.045);box(bee,M.gold,x,.59,.61,.11,.09,.1);}
box(bee,M.dark,0,-.13,.765,.13,.025,.02);const beeWings=[-1,1].map(side=>{const g=new THREE.Group();g.position.set(side*.35,.28,-.1);bee.add(g);box(g,M.wing,side*.28,.04,0,.63,.055,.8);return g;});for(const x of [-.26,.26])for(const z of [-.27,.2])box(bee,M.stripe,x,-.37,z,.055,.17,.055);
const beeHome=bee.position.clone();
const ring=new THREE.Mesh(new THREE.RingGeometry(.65,.78,48),new THREE.MeshBasicMaterial({color:'#ffcf55',side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
const arrow=new THREE.Mesh(new THREE.ConeGeometry(.16,.27,4),new THREE.MeshBasicMaterial({color:'#ffdd7a'}));arrow.rotation.z=Math.PI;arrow.visible=false;scene.add(arrow);
let ringTarget=null,ringSize=1;
function setTarget(object,size=1){ringTarget=object;ringSize=size;ring.visible=arrow.visible=!!object;}
const tweens=[],particles=[];
function tween(seconds,fn){return new Promise(resolve=>tweens.push({start:gameTime,duration:reduced?Math.min(seconds,.18):seconds,fn,resolve}));}
const wait=seconds=>tween(seconds,()=>{});
function burst(position,count=14,material=M.gold,spread=2){for(let i=0;i<count;i++){const m=new THREE.Mesh(BOX,material);m.scale.setScalar(.07+rnd()*.06);m.position.copy(position);scene.add(m);particles.push({m,v:new THREE.Vector3((rnd()-.5)*spread,1+rnd()*2.5,(rnd()-.5)*spread),life:.7+rnd()*.8});}}
function bubbleTexture(text){const c=document.createElement('canvas');c.width=512;c.height=160;const g=c.getContext('2d');g.fillStyle='#fffbed';g.beginPath();g.roundRect(8,8,496,124,24);g.fill();g.fillStyle='#7c824a';g.font='800 44px Arial, sans-serif';g.textAlign='center';g.fillText(text,256,84);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function wordSprite(word,position){const t=bubbleTexture(word),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));sprite.position.copy(position);sprite.scale.set(2.1,.65,1);sprite.renderOrder=5;scene.add(sprite);void tween(1.6,(k,raw)=>{sprite.position.y=position.y+k*.7;sprite.material.opacity=raw<.7?1:(1-raw)/.3;}).then(()=>{scene.remove(sprite);t.dispose();sprite.material.dispose();});}
const SHOTS={
 intro:{pos:[8.4,6.6,9.7],look:[-.3,1.8,-7.3],fov:57},
 friend:{pos:[.3,3.15,-3.6],look:[-3.45,1.9,-8.2],fov:53},
 soil:{pos:[3.8,3.4,-1.8],look:[0,1.2,-7.2],fov:55},
 seed:{pos:[-.8,2.7,-.9],look:[-4.35,1.9,-4.5],fov:54},
 water:{pos:[.4,2.65,-.9],look:[3.85,1.6,-4.5],fov:54},
 sun:{pos:[6.4,3.25,-3.7],look:[3.3,2.25,-8.45],fov:53},
 flowers:{pos:[4.4,3.7,-1.6],look:[0,2,-7.2],fov:55},
 bee:{pos:[5.5,3.7,-1.1],look:[1.3,2.4,-6.8],fov:54},
 final:{pos:[7.6,6.1,4.8],look:[-.2,1.9,-7.7],fov:58}
};
const cam={pos:new THREE.Vector3(...SHOTS.intro.pos),look:new THREE.Vector3(...SHOTS.intro.look),yaw:0,pitch:0,fov:57,shot:'intro'};
function shotPosition(name){const s=SHOTS[name],pos=new THREE.Vector3(...s.pos),look=new THREE.Vector3(...s.look);if(camera.aspect<.85){const offset=pos.clone().sub(look);offset.y=0;pos.addScaledVector(offset,.3);}return{pos,look,fov:s.fov+(camera.aspect<.85?10:0)};}
async function goShot(name,duration=1.3){const to=shotPosition(name),from={pos:cam.pos.clone(),look:cam.look.clone(),fov:cam.fov,yaw:cam.yaw,pitch:cam.pitch};cam.shot=name;await tween(duration,k=>{cam.pos.lerpVectors(from.pos,to.pos,k);cam.look.lerpVectors(from.look,to.look,k);cam.fov=from.fov+(to.fov-from.fov)*k;cam.yaw=from.yaw*(1-k);cam.pitch=from.pitch*(1-k);});}
const UP=new THREE.Vector3(0,1,0),RIGHT=new THREE.Vector3();
function applyCamera(){const direction=cam.look.clone().sub(cam.pos).applyAxisAngle(UP,cam.yaw);RIGHT.crossVectors(direction,UP).normalize();direction.applyAxisAngle(RIGHT,cam.pitch);camera.position.copy(cam.pos);camera.lookAt(camera.position.clone().add(direction));camera.fov=cam.fov;camera.updateProjectionMatrix();}
// Instruction and discovery UI. All speech below uses the frozen chapter script.
const FRIEND_AVATAR='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#e6edd7"/><path fill="#88ad68" d="M13 12h38v38H13z"/><path fill="#d7b267" d="M7 10h50v8H7zM18 4h28v8H18z"/><path fill="#31472b" d="M21 27h6v6h-6zm16 0h6v6h-6zM27 41h10v3H27z"/><path fill="#e9b49a" d="M18 36h9v4h-9zm19 0h9v4h-9z"/><path fill="#77a9a7" d="M9 50h46v14H9z"/><path fill="#fff4d5" d="M24 50h16v14H24z"/></svg>');
const ui={say:$('#say'),en:$('#say-en'),zh:$('#say-zh'),pocket:$('#pocket'),title:$('#title'),summary:$('#summary'),journal:$('#journal')};
function speak(text,{interrupt=false}={}){return voice.say(text,{interrupt});}
function say(en,zh,{speaker='JJ',remember=true,interrupt=true}={}){
 state.current={en,zh};const avatar=ui.say.querySelector('img');avatar.src=speaker==='JJ'?'./assets/guide.svg':FRIEND_AVATAR;avatar.alt=speaker==='JJ'?'英语伙伴 JJ':'戴园艺帽的老朋友';ui.say.querySelector('.guide-avatar > span').textContent=speaker==='JJ'?'JJ':'Z';
 ui.en.textContent=en;ui.zh.textContent=zh;ui.say.hidden=false;$('#guide-label').textContent=speaker==='JJ'?'YOUR GUIDE · 你的冒险伙伴':'YOUR GARDEN FRIEND · 一起种花的朋友';
 ui.say.classList.remove('bump');void ui.say.offsetWidth;ui.say.classList.add('bump');if(remember&&!state.sentences.includes(en))state.sentences.push(en);return speak(en,{interrupt});
}
function wordChip(word){const li=document.createElement('li');li.dataset.say=word.toLowerCase();li.setAttribute('role','button');li.tabIndex=0;const b=document.createElement('b'),i=document.createElement('i');b.textContent=word;i.textContent=ZH[word]||'';li.append(b,i);return li;}
function learn(word,position=null){if(!state.words.includes(word)){state.words.push(word);ui.pocket.append(wordChip(word));ui.pocket.hidden=false;sfx.pop();}if(position)wordSprite(word,position);updateStatus();}
function updateJournal(){const flags=[state.prepared,state.planted,state.watered,state.grown,state.shared];['soil','seed','water','sun','bee'].forEach((key,i)=>{const li=$('#journal-'+key);li.classList.toggle('done',flags[i]);li.classList.toggle('active',state.step===i+1);li.querySelector('i').textContent=flags[i]?'✓':'○';});}
const INSTR={
 1:['First, dig the soil.','先给花床松松土。点一下花床或小铲子。'],
 2:['Plant a seed in the soil.','把种子种进泥土。点一下左边的种子袋。'],
 3:['Now, give it some water.','现在给它喝一点水。点一下小水壶。'],
 4:['Let the sunshine in!','让阳光照进来！点太阳摇柄，打开遮阳棚。'],
 5:['Look! A bee. Welcome to our garden!','看，一只小蜜蜂！点一下它，邀请它来花园做客。']
};
const targetFor=()=>({1:soilBed,2:seedPacket,3:wateringCan,4:sunCrank,5:bee})[state.step];
function enter(step){state.step=step;stage.dataset.step=String(step);state.busy=false;setTarget(targetFor(),step===1?2.5:1.1);updateJournal();updateStatus();if(INSTR[step])void say(...INSTR[step],{remember:false});}
async function reveal(word,object){learn(word);$('#loot-en').textContent=word;$('#loot-zh').textContent=ZH[word]||'';$('#loot').hidden=false;$('#loot').classList.add('in');const pos=object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.3,0));burst(pos,20);sfx.ding();await speak(word.toLowerCase(),{interrupt:true});await wait(.45);$('#loot').hidden=true;$('#loot').classList.remove('in');}
async function start(){
 if(state.step!==0||state.busy||paused)return;state.busy=true;state.started=gameTime;sfx.unlock();sfx.ambience();void voice.warm();ui.title.classList.add('hide');stage.classList.add('playing');canvas.focus({preventScroll:true});updateStatus();
 await goShot('friend');learn('FRIEND');await Promise.all([say('Hello, my friend!','你好呀！今天也一起冒险吧。',{speaker:'friend'}),tween(1.4,(_k,r)=>{arms[1].rotation.z=-.9-Math.sin(r*Math.PI*6)*.3;})]);arms[1].rotation.z=0;
 learn('GARDEN');await say("Let's grow a garden!",'我们一起种一座小花园吧！');ui.journal.hidden=false;await goShot('soil');learn('SOIL');enter(1);
}
async function prepareSoil(){
 if(state.prepared)return;const home=shovel.position.clone(),rotation=shovel.rotation.clone();
 const digging=(async()=>{for(const p of bedCenters){const from=shovel.position.clone(),to=p.clone().add(new THREE.Vector3(.1,.5,.2));await tween(.35,k=>shovel.position.lerpVectors(from,to,k));sfx.tok();await tween(.38,(_k,r)=>{shovel.rotation.z=-.25-Math.sin(r*Math.PI)*.8;shovel.position.y=to.y-Math.sin(r*Math.PI)*.45;});burst(p,10,M.soil);}
 ridges.visible=true;await tween(.4,k=>shovel.position.lerpVectors(bedCenters[2].clone().add(new THREE.Vector3(.1,.5,.2)),home,k));shovel.rotation.copy(rotation);})();
 await Promise.all([say('Dig, dig, dig!','挖一挖，松一松，让泥土变得软软的。'),digging]);state.prepared=true;updateJournal();await reveal('DIG',soilBed);await say('Soft soil! Ready for a seed.','泥土松软了，可以迎接小种子啦。');await goShot('seed');learn('SEED');enter(2);
}
async function plantSeeds(){
 if(state.planted||!state.prepared)return;const home=seedPacket.position.clone(),from=home.clone(),to=new THREE.Vector3(0,2.45,-7.2);
 await goShot('soil',.8);await tween(.65,k=>{seedPacket.position.lerpVectors(from,to,k);seedPacket.rotation.z=-k*.5;});
 const seeds=bedCenters.map(p=>{const m=box(world,M.seed,0,2.4,-7.2,.13,.1,.13);return{m,to:p.clone(),from:m.position.clone()};});
 await tween(.85,(k,r)=>{seeds.forEach((item,i)=>{item.m.position.lerpVectors(item.from,item.to,k);item.m.position.y+=Math.sin(r*Math.PI)*(.25+i*.08);item.m.rotation.z=r*3;});});
 seeds.forEach(item=>world.remove(item.m));plantedSeeds.forEach(g=>g.visible=true);sfx.pop();state.planted=true;updateJournal();await say('A tiny seed!','一颗小小的种子，藏着大大的期待。');await reveal('PLANT',soilBed);
 await tween(.5,k=>{seedPacket.position.lerpVectors(to,home,k);seedPacket.rotation.z=-.5*(1-k);});await goShot('water');learn('WATER');enter(3);
}
function makeDrops(position){for(let i=0;i<3;i++){const m=new THREE.Mesh(BOX,M.drop);m.scale.set(.045,.11,.045);m.position.copy(position).add(new THREE.Vector3((rnd()-.5)*.1,0,(rnd()-.5)*.14));scene.add(m);particles.push({m,v:new THREE.Vector3(-.25-rnd()*.25,-.4-rnd()*.6,(rnd()-.5)*.3),life:.45+rnd()*.18});}}
async function waterPlants(){
 if(state.watered||!state.planted)return;const home=wateringCan.position.clone();await goShot('soil',.85);
 const watering=(async()=>{for(const p of bedCenters){const from=wateringCan.position.clone(),to=p.clone().add(new THREE.Vector3(1.03,1.35,.12));await tween(.4,k=>wateringCan.position.lerpVectors(from,to,k));let lastDrop=-1;await tween(.8,(_k,r)=>{wateringCan.rotation.z=Math.sin(r*Math.PI)*.55;const next=Math.floor(r*9);if(next!==lastDrop){lastDrop=next;wateringCan.updateWorldMatrix(true,false);makeDrops(wateringCan.localToWorld(new THREE.Vector3(-.88,.2,0)));}});}
 const from=wateringCan.position.clone();await tween(.5,k=>wateringCan.position.lerpVectors(from,home,k));wateringCan.rotation.z=0;})();
 await Promise.all([say('Water, water! A little drink.','浇一点水，让小种子喝饱。'),watering]);ridges.children.forEach(m=>m.material=M.wet);plantedSeeds.forEach(g=>g.visible=false);sprouts.forEach(g=>{g.visible=true;g.scale.setScalar(.01);});await tween(.7,k=>sprouts.forEach(g=>g.scale.setScalar(Math.max(.01,k))));
 state.watered=true;updateJournal();await reveal('WATER',wateringCan);await goShot('sun');learn('SUN');enter(4);
}
async function growFlowers(){
 if(state.grown||!state.watered)return;sfx.creak();await tween(1.3,k=>{crankWheel.rotation.z=-k*Math.PI*4;shade.scale.z=1-k*.94;sunlight.intensity=2.1+k*.6;});await say('Hello, sun!','你好，太阳！温暖的阳光照进花床啦。');await goShot('flowers');
 sprouts.forEach(g=>g.visible=false);flowers.forEach(g=>{g.visible=true;g.scale.setScalar(.01);g.userData.head.scale.setScalar(.01);});learn('GROW');const bloomed=new Set();
 await Promise.all([say('Grow, grow, grow!','长呀长，长出叶子，再开出花！'),tween(2.7,(_k,r)=>{flowers.forEach((g,i)=>{const u=Math.max(.01,Math.min(1,(r-i*.1)/.75));g.scale.set(1,u,1);g.userData.head.scale.setScalar(Math.max(.01,Math.min(1,(u-.45)/.55)));if(u>=1&&!bloomed.has(i)){bloomed.add(i);burst(bedCenters[i].clone().add(new THREE.Vector3(0,1.7,0)),13,[M.coral,M.gold,M.violet][i]);}});})]);
 flowers.forEach(g=>{g.scale.setScalar(1);g.userData.head.scale.setScalar(1);});state.grown=true;updateJournal();await reveal('FLOWER',flowers[1]);await say('A flower! Our garden is growing!','一朵花！我们的小花园长大啦！');
 bee.visible=true;const from=new THREE.Vector3(8,4.5,-12.8);bee.position.copy(from);await Promise.all([goShot('bee',1.4),tween(1.6,(k,r)=>{bee.position.lerpVectors(from,beeHome,k);bee.position.y+=Math.sin(r*Math.PI)*.7;})]);learn('BEE');enter(5);
}
async function welcomeBee(){
 if(state.shared||!state.grown)return;await say('A flower for you, little bee.','小蜜蜂，这朵花送给你，快来采花蜜吧。');const from=bee.position.clone(),sip=new THREE.Vector3(0,2.8,-6.25);
 await tween(1.05,(k,r)=>{bee.position.lerpVectors(from,sip,k);bee.position.y+=Math.sin(r*Math.PI)*.35;bee.rotation.y=-.25+Math.PI*k;});
 await tween(1.1,(_k,r)=>{bee.position.y=sip.y+Math.sin(r*Math.PI*4)*.07;flowers[1].rotation.z=Math.sin(r*Math.PI*2)*.06;});flowers[1].rotation.z=0;burst(new THREE.Vector3(0,3,-6.9),25,M.gold);sfx.levelup();
 await say('Flowers help our little friends.','花朵也能帮助我们的小伙伴。谢谢你照顾这座花园！');
 await tween(1.8,(k,r)=>{bee.position.lerpVectors(sip,beeHome,k);bee.position.y+=Math.sin(r*Math.PI)*.7;bee.rotation.y=(Math.PI-.25)*(1-k)-.25*k;friend.position.y=.7+Math.abs(Math.sin(r*Math.PI*3))*.16;arms[1].rotation.z=-.8-Math.sin(r*Math.PI*6)*.2;});friend.position.y=.7;arms[1].rotation.z=0;
 state.shared=true;updateJournal();await say('We grew a garden together!','我们一起种出了一座花园！');ui.journal.hidden=true;await goShot('final',1.6);state.step=6;stage.dataset.step='6';state.busy=false;setTarget(null);updateStatus();await wait(.5);showSummary();
}
async function act(object){
 if(paused||state.busy||state.step===0||!ui.summary.hidden||helpDialog.open)return;
 const kind=object.userData.kind,required=({1:'soil',2:'seed',3:'water',4:'sun',5:'bee'})[state.step];
 if(kind!==required){if(ZH[object.userData.word]){learn(object.userData.word,object.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1.1,0)));void speak(object.userData.word.toLowerCase(),{interrupt:true});}return;}
 const done=({1:state.prepared,2:state.planted,3:state.watered,4:state.grown,5:state.shared})[state.step];if(done)return;
 state.busy=true;setTarget(null);voice.stop();sfx.unlock();updateStatus();
 try{if(state.step===1)await prepareSoil();else if(state.step===2)await plantSeeds();else if(state.step===3)await waterPlants();else if(state.step===4)await growFlowers();else if(state.step===5)await welcomeBee();}
 catch(error){console.error('Garden action failed',error);state.busy=false;setTarget(targetFor());updateStatus();}
}
function taskAction(){if(paused||state.busy||!ui.summary.hidden||helpDialog.open)return;if(state.step===0){void start();return;}const object=targetFor();if(object)void act(object);}
// Pointer and keyboard always use the same guarded action entry.
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
function pickAt(x,y){const r=canvas.getBoundingClientRect();pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(hot,true);for(const hit of hits){let object=hit.object,visible=true;for(let p=object;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;while(object&&!object.userData.kind)object=object.parent;if(object)return object;}return null;}
canvas.addEventListener('pointerdown',e=>{if(paused)return;sfx.unlock();down={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:cam.yaw,pitch:cam.pitch,drag:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!down){if(!touch)canvas.style.cursor=pickAt(e.clientX,e.clientY)?'pointer':'grab';return;}if(e.pointerId!==down.id)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(Math.hypot(dx,dy)>7)down.drag=true;if(down.drag&&!state.busy&&state.step>0&&!paused){cam.yaw=Math.max(-1,Math.min(1,down.yaw-dx*.004));cam.pitch=Math.max(-.4,Math.min(.4,down.pitch-dy*.003));}});
canvas.addEventListener('pointerup',e=>{if(!down||e.pointerId!==down.id)return;const wasDrag=down.drag;down=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!wasDrag){const object=pickAt(e.clientX,e.clientY);if(object)void act(object);}});canvas.addEventListener('pointercancel',()=>{down=null;});
$('#title button').addEventListener('click',()=>void start());$('#task-action').addEventListener('click',taskAction);$('#say-spk').addEventListener('click',()=>{if(state.current)void speak(state.current.en,{interrupt:true});});
for(const container of [ui.pocket,ui.summary]){container.addEventListener('click',event=>{const item=event.target.closest('[data-say]');if(item)void speak(item.dataset.say,{interrupt:true});});container.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('li[data-say]')){event.preventDefault();event.target.click();}});}
function showSummary(){if(state.step!==6)return;voice.stop();$('#sum-stats').innerHTML=`<b>${state.words.length}</b> 个英语词 · <b>${state.sentences.length}</b> 句话 · 约 <b>${Math.max(1,Math.round(state.elapsed/60))}</b> 分钟`;$('#sum-words').replaceChildren(...state.words.map(wordChip));ui.summary.hidden=false;ui.say.hidden=true;$('#sum-card').focus({preventScroll:true});updateStatus();}
function snapshotWorld(){const w=1280,h=680,rt=new THREE.WebGLRenderTarget(w,h),aspect=camera.aspect;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setRenderTarget(rt);renderer.render(scene,camera);const pixels=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,pixels);renderer.setRenderTarget(null);rt.dispose();camera.aspect=aspect;camera.updateProjectionMatrix();const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),image=g.createImageData(w,h);for(let y=0;y<h;y++)image.data.set(pixels.subarray((h-y-1)*w*4,(h-y)*w*4),y*w*4);g.putImageData(image,0,0);return c;}
async function makeCard(){const button=$('#sum-card');button.disabled=true;button.textContent='正在制作卡片…';try{
 const c=document.createElement('canvas');c.width=1080;c.height=1540;const g=c.getContext('2d');g.fillStyle='#f6f8ec';g.fillRect(0,0,1080,1540);g.fillStyle='#9db882';g.fillRect(0,0,1080,14);g.fillStyle='#7d906a';g.font='800 23px Arial, sans-serif';g.fillText('ENGLISH ISLAND / DAY THREE',64,80);g.fillStyle='#36513b';g.font='800 58px "PingFang SC", sans-serif';g.fillText('我的花园冒险',64,160);g.font='25px "PingFang SC", sans-serif';g.fillStyle='#8a9a7c';g.fillText(`${new Date().toLocaleDateString('zh-CN')} · 花园小园丁达成`,64,215);
 finishedShot??=snapshotWorld();g.save();g.beginPath();g.roundRect(64,258,952,506,23);g.clip();g.drawImage(finishedShot,64,258,952,506);g.restore();g.fillStyle='#36513b';g.font='800 31px "PingFang SC", sans-serif';g.fillText(`和花朵一起长大的 ${state.words.length} 个单词`,64,829);
 let x=64,y=862;for(const word of state.words){g.font='800 26px Arial, sans-serif';const ew=g.measureText(word).width;g.font='21px "PingFang SC", sans-serif';const width=ew+g.measureText(ZH[word]||'').width+54;if(x+width>1016){x=64;y+=70;}g.fillStyle='#e5eddc';g.beginPath();g.roundRect(x,y,width,54,9);g.fill();g.fillStyle='#5c7751';g.font='800 26px Arial, sans-serif';g.fillText(word,x+17,y+35);g.fillStyle='#8a9a79';g.font='21px "PingFang SC", sans-serif';g.fillText(ZH[word]||'',x+ew+33,y+34);x+=width+12;}
 g.fillStyle='#ccd9c2';g.fillRect(64,1300,952,2);g.fillStyle='#5b7751';g.font='800 35px Arial, sans-serif';g.fillText('“We grew a garden together!”',64,1371);g.fillStyle='#8a9a7c';g.font='25px "PingFang SC", sans-serif';g.fillText('种下一点期待，长出整个春天。',64,1431);g.font='22px "PingFang SC", sans-serif';g.fillText('英语方块岛 · 一起发现，一起长大。',64,1487);
 const url=c.toDataURL('image/png');$('#sum-img').src=url;$('#sum-img').hidden=false;const link=$('#sum-dl');link.href=url;link.download=`english-island-day-three-${Date.now()}.png`;link.hidden=false;button.textContent='卡片已生成 ↓';sfx.ding();$('#sum-img').scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest'});
 }catch(error){console.error(error);button.textContent='生成失败，点击重试';}finally{button.disabled=false;}}
function goPrevious(){voice.stop();if(parent!==window)parent.postMessage({type:'island-navigate',level:2},location.origin);else location.href='./day2.html';}
$('#sum-card').addEventListener('click',()=>void makeCard());$('#sum-again').addEventListener('click',()=>location.reload());$('#sum-previous').addEventListener('click',goPrevious);$('#back-level').addEventListener('click',goPrevious);$('#sum-close').addEventListener('click',()=>{ui.summary.hidden=true;canvas.focus({preventScroll:true});void say('What else can you find?','留在花园，点花朵、溪流、树和朋友，继续发现英语。',{remember:false});updateStatus();});
// Pause reasons compose: closing help never resumes a still-hidden or externally paused game.
const helpDialog=$('#help-dialog'),pauseReasons=new Set();
function pauseGame(value,reason='external'){if(value)pauseReasons.add(reason);else pauseReasons.delete(reason);const next=pauseReasons.size>0;if(paused===next)return;paused=next;down=null;sfx.paused=next;voice.setPaused(next);updateStatus();}
function showHelp(){pauseGame(true,'help');if(!helpDialog.open)helpDialog.showModal();}
helpDialog.addEventListener('close',()=>{pauseGame(false,'help');canvas.focus({preventScroll:true});});$('#help-close').addEventListener('click',()=>helpDialog.close());$('#help-done').addEventListener('click',()=>helpDialog.close());$('#help-button').addEventListener('click',showHelp);
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog){const r=helpDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)helpDialog.close();}});
function updateSound(){const b=$('#snd');b.setAttribute('aria-pressed',String(sfx.muted));b.setAttribute('aria-label',sfx.muted?'打开声音':'关闭声音');b.textContent=sfx.muted?'声音：关':'声音：开';}
$('#snd').addEventListener('click',()=>{sfx.muted=!sfx.muted;if(sfx.muted)voice.stop();sfx.unlock();updateSound();updateStatus();});$('#restart-button').addEventListener('click',()=>location.reload());if(window===parent){stage.classList.add('standalone');$('.standalone-tools').hidden=false;}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='island-command')return;const data=event.data;if(data.command==='start')void start();if(data.command==='act')taskAction();if(data.command==='mute')$('#snd').click();if(data.command==='restart')location.reload();if(data.command==='help'){if(helpDialog.open)helpDialog.close();else showHelp();}if(data.command==='summary')showSummary();if(data.command==='speak'&&typeof data.word==='string')void speak(data.word.toLowerCase(),{interrupt:true});if(data.command==='pause')pauseGame(true);if(data.command==='resume')pauseGame(false);});
window.addEventListener('keydown',event=>{if(event.defaultPrevented)return;if(event.key===' '&&!event.repeat&&!['BUTTON','A','INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.activeElement.isContentEditable){event.preventDefault();taskAction();}if(event.key==='Escape'&&helpDialog.open)helpDialog.close();});document.addEventListener('visibilitychange',()=>pauseGame(document.hidden,'visibility'));
let lastStatus='';
function updateStatus(){const pocketBottom=ui.pocket.offsetTop+ui.pocket.offsetHeight;ui.journal.style.top=Math.max(stage.clientWidth<=700?78:67,pocketBottom+12)+'px';const button=$('#task-action');button.hidden=state.step===0||state.step===6||!ui.summary.hidden;button.disabled=state.busy||paused;const labels={1:'给花床松松土',2:'种下一颗小种子',3:'给小种子浇水',4:'摇一摇，让阳光进来',5:'邀请小蜜蜂来做客'};$('#action-label').textContent=state.busy?'跟着 JJ，看看会发生什么…':labels[state.step]||'';
 const data={type:'island-status',level:3,ready:true,step:state.step,busy:state.busy,words:[...state.words],muted:sfx.muted,completed:state.step===6,prepared:state.prepared,planted:state.planted,watered:state.watered,grown:state.grown,shared:state.shared,paused};const json=JSON.stringify(data);if(json!==lastStatus){lastStatus=json;parent.postMessage(data,location.origin);}}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;if(!state.busy){const s=shotPosition(cam.shot);cam.pos.copy(s.pos);cam.look.copy(s.look);cam.fov=s.fov;}camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();updateSound();updateJournal();updateStatus();
let frame=0;
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.05,Math.max(0,(now-previousTime)/1000));previousTime=now;
 if(!paused){gameTime+=dt;if(state.started!==null&&state.step<6)state.elapsed+=dt;
 for(let i=tweens.length-1;i>=0;i--){const t=tweens[i],raw=Math.min(1,(gameTime-t.start)/t.duration),k=raw<.5?4*raw**3:1-(-2*raw+2)**3/2;t.fn(k,raw);if(raw>=1){tweens.splice(i,1);t.resolve();}}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.v.y-=5*dt;p.m.position.addScaledVector(p.v,dt);p.m.rotation.x+=dt*3;p.m.rotation.y+=dt*4;if(p.life<=0){scene.remove(p.m);particles.splice(i,1);}}
 if(!reduced){clouds.forEach((g,i)=>{g.position.x+=dt*(.1+i*.012);if(g.position.x>48)g.position.x=-48;});millBlades.rotation.z-=dt*.28;eyes.forEach(e=>e.scale.y=gameTime%5.1>4.94?.018:.12);beeWings.forEach((wing,i)=>wing.rotation.z=(i?1:-1)*Math.sin(gameTime*36)*.5);
 if(!state.busy){friendHead.rotation.z=Math.sin(gameTime*1.3)*.04;if(bee.visible){bee.position.copy(beeHome);bee.position.y+=Math.sin(gameTime*2.3)*.1;bee.position.x+=Math.sin(gameTime*1.2)*.14;}if(state.grown)flowers.forEach((g,i)=>g.rotation.z=Math.sin(gameTime*1.3+i)*.025);}}
 }
 if(ringTarget){const p=ringTarget.getWorldPosition(new THREE.Vector3());ring.position.set(p.x,state.step===1?.73:state.step===2?.73:state.step===3?.51:.73,p.z);ring.scale.setScalar(ringSize*(reduced?1:1+Math.sin(gameTime*3)*.06));arrow.position.set(p.x,p.y+(state.step===1?1.65:state.step===5?1.1:1.0),p.z);if(!reduced)arrow.position.y+=Math.sin(gameTime*3)*.1;}
 applyCamera();renderer.shadowMap.needsUpdate=frame<3||state.busy||frame%4===0;frame++;renderer.render(scene,camera);
});
window.__yf={level:3,state,ORDER,ZH,start,taskAction,showSummary,makeCard,pauseGame,goShot,cam,scene,camera,hot,soilBed,seedPacket,wateringCan,sunCrank,bee,flowers,friend,tap(kind){const object=hot.find(g=>g.userData.kind===kind||g.userData.word===kind);return object?act(object):Promise.resolve();},get paused(){return paused;}};
const statusInterval=setInterval(updateStatus,150);
window.addEventListener('pagehide',()=>{clearInterval(statusInterval);voice.stop();renderer.setAnimationLoop(null);renderer.dispose();});
