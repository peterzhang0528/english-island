import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ts } from './helpers/source.mjs';

const source=readFileSync(new URL('../components/IslandGame.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function bridge({level=10,wish=false}={}) {
  const effects=[],events={},statuses=[],navigations=[],wishes=[],sent=[];
  const main={postMessage(data,origin){sent.push({frame:'main',data,origin});}};
  const bonus={postMessage(data,origin){sent.push({frame:'wish',data,origin});}};
  const exports={};
  const window={location:{origin:'https://island.invalid'},addEventListener(name,fn){events[name]=fn;},removeEventListener(){},dispatchEvent(event){statuses.push(event.detail);}};
  const jsx=(type,props)=>({type,props});
  vm.runInNewContext(code,{exports,window,document:{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},require(name){
    if(name==='react')return {useRef:current=>({current}),useEffect:fn=>effects.push(fn)};
    if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
    if(name==='../lib/chapters')return{chapters:{9:{title:'雨天'},10:{title:'庆典'}},dayNames:{9:'第九天',10:'第十天'},gamePath:n=>`/game/story.html?level=${n}`,isLevel:n=>Number.isInteger(n)&&n>=1&&n<=10};
    throw new Error(`Unexpected import ${name}`);
  }});
  const ui=exports.default({level,wish,onWishChange:value=>wishes.push(value),onNavigate:value=>navigations.push(value)});
  const frames=ui.props.children.filter(Boolean);
  frames[0].props.ref.current={contentWindow:main};
  if(frames[1])frames[1].props.ref.current={contentWindow:bonus};
  effects.forEach(fn=>fn());
  const send=(data,{origin=window.location.origin,source=wish?bonus:main}={})=>events.message({origin,source,data});
  return{send,events,statuses,navigations,wishes,sent,main,bonus,frames};
}

test('only the active same-origin final chapter can reveal the optional wish map',()=>{
  const f=bridge();
  const message={type:'island-wish-open'};
  f.send(message,{origin:'https://other.invalid'});
  f.send(message,{source:{}});
  assert.deepEqual(f.wishes,[]);
  f.send(message);
  assert.deepEqual(f.wishes,[true]);
  const earlier=bridge({level:9});earlier.send(message);
  assert.deepEqual(earlier.wishes,[]);
});

test('bonus mode keeps the celebration frame paused and routes actions to the bonus',()=>{
  const f=bridge({wish:true});
  assert.equal(f.frames[0].props.style.display,'none');
  assert.equal(f.frames[1].props.src,'/game/wish.html');
  assert.equal(f.sent.at(-1).frame,'main');
  assert.equal(f.sent.at(-1).data.command,'pause');
  f.events['island-command']({detail:{command:'act'}});
  assert.equal(f.sent.at(-1).frame,'wish');
  assert.equal(f.sent.at(-1).data.command,'act');
  f.send({type:'island-status',level:10,step:6,completed:true},{source:f.main});
  assert.deepEqual(f.statuses,[],'Paused main scene must not overwrite bonus progress');
  f.send({type:'island-status',level:10,mode:'wish',step:2,completed:false});
  assert.equal(f.statuses[0].mode,'wish');
  f.send({type:'island-wish-close'});
  assert.deepEqual(f.wishes,[false]);
});

test('late-loaded celebration receives its pause and normal navigation still validates levels',()=>{
  const f=bridge({wish:true});f.sent.length=0;
  f.frames[0].props.onLoad();
  assert.equal(f.sent[0].data.command,'pause');
  for(const level of [0,11,'3',3.5])f.send({type:'island-navigate',level});
  assert.deepEqual(f.navigations,[]);
  f.send({type:'island-navigate',level:3});
  assert.deepEqual(f.navigations,[3]);
});
