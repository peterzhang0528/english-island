import * as THREE from './vendor/three.module.min.js';
import { STATIONS } from './rescue-rules.js';

export function createRescueWorld(canvas, state) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#284956');
  scene.fog = new THREE.FogExp2('#385a65', 0.018);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.OrthographicCamera(-18, 18, 15, -15, .1, 150);
  camera.position.set(19, 24, 30); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#c1e2e5', '#243530', 2.1));
  const sun = new THREE.DirectionalLight('#ffe8b8', 3.1);
  sun.position.set(-12, 28, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 });
  sun.shadow.bias = -.001; scene.add(sun);
  const materials = new Map();
  function mat(color, options = {}) {
    const key = `${color}${JSON.stringify(options)}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .9, ...options }));
    return materials.get(key);
  }
  function box(w, h, d, color, x, y, z, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  // Original procedural geometry: no downloaded art or runtime asset dependencies.
  const water = box(180, .4, 180, '#274e60', 0, -1.5, 0);
  water.receiveShadow = true;
  const foam = new THREE.Group(); scene.add(foam);
  for (let i = 0; i < 85; i++) {
    const x = Math.sin(i * 127.1) * 26, z = Math.cos(i * 311.7) * 23;
    box(.3 + Math.abs(Math.sin(i)) * 1.8, .015, .035, i % 3 ? '#3a6473' : '#53818b', x, -1.27, z, foam);
  }
  function island(x, z, w, d) {
    box(w, 1.25, d, '#52615b', x, -.7, z);
    box(w + .3, .3, d + .3, '#8d957b', x, -.2, z);
    box(w - .3, .35, d - .3, '#627e69', x, .1, z);
    for (let i = 0; i < w; i++) {
      box(.95, .6 + (i % 3) * .15, .65, i % 2 ? '#677468' : '#717b6c', x - w / 2 + i, -.8, z + d / 2);
    }
  }
  island(-9, 4, 7, 7); island(-.6, .8, 6, 7); island(6.4, -2.8, 7.5, 8);
  box(3.5, .15, 1.45, '#9f9b7b', 3.1, .24, -1.1);
  const bridge = new THREE.Group(); scene.add(bridge);
  for (let i = 0; i < 8; i++) {
    const plank = box(.45, .18, 1.4, i % 2 ? '#bda379' : '#a58a63', -5.65 + i * .43, .3, 3, bridge);
    plank.visible = i < 2 || i > 5;
  }
  for (const z of [2.25, 3.75]) {
    box(3.6, .08, .09, '#7b6952', -4.2, .2, z, bridge);
    for (const x of [-5.7, -2.5]) box(.12, .9, .12, '#927d59', x, .65, z, bridge);
  }
  function tree(x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x, .28, z); g.scale.setScalar(scale); scene.add(g);
    box(.25, 1.2, .25, '#625540', 0, .6, 0, g);
    for (let j = 0; j < 3; j++) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.2 - j * .27, 1.65, 4), mat(['#365748', '#416751', '#50775b'][j]));
      mesh.position.y = 1.25 + j * .7; mesh.rotation.y = Math.PI / 4; mesh.castShadow = true; g.add(mesh);
    }
  }
  for (const [x, z, s] of [[-11,2,1.1],[-10.5,5.7,.8],[-7.7,1.8,.75],[-1.5,-1.6,.8],[1,-1.8,.6],[8.5,-5.5,.95],[4.4,-5.1,.8],[8.8,-.2,.6]]) tree(x,z,s);
  for (let i = 0; i < 24; i++) {
    const left = i < 12, x = left ? -11 + (i % 4) * .75 : 4.5 + (i % 4) * 1.2, z = left ? 5.4 + (i % 3) * .38 : -5 + (i % 3) * .2;
    box(.12, .15 + (i % 3) * .08, .15, '#8b9c70', x, .4, z);
  }
  // Crate, path, little jetty, generator, and its separate teammate switch.
  for (let i = 0; i < 6; i++) box(.65, .03, .55, '#9ca286', -10.5 + i * .68, .3, 4);
  box(.8, .6, .7, '#a58a63', -7.2, .6, 5.3); box(.85, .1, .75, '#685b45', -7.2, .75, 5.3);
  const generator = new THREE.Group(); generator.position.set(.2, .3, .8); scene.add(generator);
  box(1.4, 1.2, 1.1, '#546a6a', 0, .6, 0, generator);
  box(1.5, .18, 1.2, '#a3a27a', 0, 1.28, 0, generator);
  box(.8, .65, .08, '#253b43', 0, .7, .58, generator);
  const powerLamp = box(.2, .2, .09, '#d98f60', -.4, 1, .64, generator);
  const crank = new THREE.Group(); crank.position.set(.4, .7, .7); generator.add(crank);
  box(.12, .6, .12, '#d5b97b', 0, 0, 0, crank); box(.3, .12, .12, '#7f6956', .12, .25, 0, crank);
  box(.6, .75, .6, '#566969', -1.3, .7, 2.1); box(.5, .12, .5, '#d69460', -1.3, 1.15, 2.1);
  // Tall octagonal beacon with a red roof, open lantern room, and warm windows.
  const tower = new THREE.Group(); tower.position.set(6.2, .3, -2.9); scene.add(tower);
  const cylinder = (rt, rb, h, color, y) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat(color)); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; tower.add(mesh); return mesh;
  };
  cylinder(1.45, 1.65, .4, '#a3aa96', .2);
  cylinder(.9, 1.25, 3.9, '#d8d4b6', 2.3);
  cylinder(1, 1.1, .65, '#ad6c58', 2.5);
  cylinder(1.3, 1.25, .22, '#7e8f86', 4.4);
  cylinder(.98, .98, .8, '#f5d89a', 4.95);
  cylinder(1.25, 1.25, .15, '#5a706b', 5.45);
  cylinder(0, 1.48, 1.2, '#a86350', 6.1);
  for (const x of [-.75, .75]) for (const z of [-.75,.75]) box(.08, 1, .08, '#556d6d', x, 4.95, z, tower);
  box(.55, 1, .1, '#3b5557', 0, .7, 1.18, tower);
  box(.32, .55, .08, '#5d8490', 0, 3.5, 1.04, tower);
  const beacon = new THREE.PointLight('#ffe2a1', 0, 16); beacon.position.set(6.2, 5.3, -2.9); scene.add(beacon);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 15, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#f0e5b2', transparent: true, opacity: .095, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(beam); beam.visible = false;
  const boat = new THREE.Group(); boat.position.set(12, -.5, 8); scene.add(boat);
  box(1.35, .55, 3.1, '#875b43', 0, 0, 0, boat); box(1.6, .15, 3.2, '#bd9871', 0, .3, 0, boat);
  box(1.05, .75, 1.1, '#d2c7a2', 0, .75, -.3, boat); box(.8, .35, .08, '#5a8290', 0, .85, .3, boat);
  box(.15, 1.4, .15, '#535c54', 0, 1.3, -.9, boat);
  const shipLamp = box(.22, .3, .22, '#98dce6', 0, 1.3, .3, boat);
  const jetty = new THREE.Group(); scene.add(jetty);
  for(let i=0;i<6;i++) box(1.2,.13,.4,'#9a896a',7.6,.05,1.4+i*.43,jetty);
  for(const z of [1.4,3.5]) for(const x of [7,8.2]) box(.15,1.5,.15,'#6d6553',x,-.4,z,jetty);
  function kid(color, skin, hair) {
    const group = new THREE.Group(); scene.add(group);
    const body = box(.43,.54,.3,color,0,.84,0,group);
    box(.43,.43,.4,skin,0,1.34,0,group); box(.46,.15,.43,hair,0,1.55,-.02,group);
    box(.07,.07,.02,'#29393d',-.1,1.36,.21,group); box(.07,.07,.02,'#29393d',.1,1.36,.21,group);
    const limbs = [];
    for(const x of [-.13,.13]) limbs.push(box(.16,.4,.18,'#304953',x,.37,0,group));
    for(const x of [-.32,.32]) limbs.push(box(.16,.5,.18,color,x,.83,0,group));
    const ring = new THREE.Mesh(new THREE.RingGeometry(.34,.4,32),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.75}));
    ring.rotation.x=-Math.PI/2; ring.position.y=.31; group.add(ring);
    return { group, limbs, body };
  }
  const player = kid('#d4ed91','#cda77d','#4a4238'); player.group.position.set(-9,0,5);
  const mia = kid('#d39c71','#ddb18a','#654c3f'); mia.group.position.set(-7.3,0,3.8);
  const leo = kid('#79b7d0','#cca37e','#65513f'); leo.group.position.set(-9.4,0,3);
  const keys = new Set(); let destination = null, time = 0, lastStage = -1;
  const canStand = (x,z) => {
    const inRect = (a,b,c,d) => x>a && x<b && z>c && z<d;
    return inRect(-12.2,-5.7,.8,7.2) || (state.bridge && (inRect(-5.9,-2,2.45,3.55) || inRect(-3.3,2.2,-2.3,3.8) || inRect(1.6,3.8,-1.65,-.5) || inRect(2.9,9.7,-6.3,.9)));
  };
  function walk(person,target,dt,speed=3) {
    const g=person.group, dx=target.x-g.position.x,dz=target.z-g.position.z,dist=Math.hypot(dx,dz);
    if(dist<.08) {person.limbs.forEach(l=>l.rotation.x=0); return true;}
    const step=Math.min(dist,dt*speed); g.position.x+=dx/dist*step; g.position.z+=dz/dist*step;
    g.rotation.y=Math.atan2(dx,dz);
    person.limbs.forEach((l,i)=>l.rotation.x=Math.sin(time*10+(i%2)*Math.PI)*.4); return false;
  }
  const resize = () => {
    const w=canvas.clientWidth,h=canvas.clientHeight,aspect=w/h;
    const halfW=aspect<.85?18:17, halfH=halfW/aspect;
    camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  };
  const observer=new ResizeObserver(resize); observer.observe(canvas); resize();
  function tick(dt, paused=false) {
    if (!paused) {
      time+=dt;
      const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
      const dz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);
      if(dx||dz) {
        destination=null;const norm=Math.hypot(dx,dz),p=player.group.position;
        const target={x:p.x+dx/norm*dt*4,z:p.z+dz/norm*dt*4};
        if(canStand(target.x,target.z)) walk(player,target,dt,4);
      } else if(destination) { if(walk(player,destination,dt,5)) destination=null; }
      else player.limbs.forEach(l=>l.rotation.x=0);
      const miaTarget=state.holding?{x:-1.3,z:2.7}:state.bridge?{x:-3,z:3}:{x:-6.3,z:3.6};
      walk(mia,miaTarget,dt,2);
      walk(leo,state.power?{x:8.1,z:-.7}:state.bridge?{x:1.2,z:2.8}:{x:-8.4,z:3.2},dt,2.4);
      if(state.holding && !state.power) mia.limbs[3].rotation.x=-1;
      if(state.power) crank.rotation.z+=dt*2;
      const targetBoat = state.rescued ? {x:9.1,z:3} : {x:12,z:8};
      boat.position.x+=(targetBoat.x-boat.position.x)*Math.min(1,dt*.45);boat.position.z+=(targetBoat.z-boat.position.z)*Math.min(1,dt*.45);
      boat.position.y=-.45+Math.sin(time*1.5)*.08;boat.rotation.z=Math.sin(time*1.1)*.025;
      shipLamp.material=mat(Math.floor(time*2)%3===1?'#d6a466':'#86c9e4',{emissive:Math.floor(time*2)%3===1?'#ac6f31':'#508da9',emissiveIntensity:.8});
      foam.position.x=Math.sin(time*.2)*.3;
    }
    if(lastStage!==state.stage){
      bridge.children.slice(0,8).forEach(p=>p.visible=state.bridge||p.visible);
      powerLamp.material=mat(state.power?'#d5ee93':'#d98f60',{emissive:state.power?'#bfd981':'#000000',emissiveIntensity:.8});
      beacon.intensity=state.power?18:0; lastStage=state.stage;
    }
    beam.visible=state.stage>=3;
    if(beam.visible){
      const from=new THREE.Vector3(6.2,5.25,-2.9),to=new THREE.Vector3(boat.position.x+state.bearing*2,-.5,boat.position.z);
      beam.position.copy(from).lerp(to,.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),from.clone().sub(to).normalize());
      beam.scale.y=from.distanceTo(to)/15;
    }
    renderer.render(scene,camera);
  }
  return {
    tick, keys,
    go(station) { if(station!=='bridge'&&!state.bridge)return false; destination={...STATIONS[station]};return true; },
    get station() {const p=player.group.position;return Object.entries(STATIONS).find(([,v])=>Math.hypot(v.x-p.x,v.z-p.z)<1.7)?.[0]??null;},
    clearKeys(){keys.clear();},
    destroy(){observer.disconnect();renderer.dispose();},
  };
}
