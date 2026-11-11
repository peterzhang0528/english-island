import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {WISH_PLAN_SCHEMA,OBJECT_WORDS,validateWishPlan,validateWishRequest,normalizeWishAnswer,isWishAnswerCorrect} from '../public/game/js/wish-contract.js';
const examples=JSON.parse(fs.readFileSync(new URL('../public/game/wish-examples.json',import.meta.url),'utf8'));
const plan=()=>structuredClone(examples.examples[0].plan);

test('three clearly labelled presets satisfy the same complete contract as AI maps',()=>{
  assert.equal(examples.source,'preset');assert.match(examples.notice,/不是实时/);assert.equal(examples.examples.length,3);
  for(const item of examples.examples){const result=validateWishPlan(item.plan);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual([...new Set(item.plan.quests.map(q=>q.kind))].sort(),['find','riddle','say']);for(const o of item.plan.objects)assert.equal(o.word,OBJECT_WORDS[o.kind]);}
});
test('JSON schema is strict throughout nested objects',()=>{
  function visit(s){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(visit);}if(s.items)visit(s.items);}visit(WISH_PLAN_SCHEMA);
});
test('rejects invalid counts, IDs, references, vocab, answers, versions and seeds',()=>{
  const mutations=[p=>p.version=2,p=>p.seed=-1,p=>p.seed=2147483648,p=>p.seed=1.5,p=>p.seed=NaN,p=>p.objects.splice(0,3),p=>p.objects.push(...p.objects),p=>p.objects[0].id=p.objects[1].id,p=>p.objects[0].id='bad-id',p=>p.objects[0].kind='dragon',p=>p.objects[0].word='BOAT',p=>p.quests[0].targetId='missing',p=>p.quests[0].answer='wrong',p=>p.quests[0].kind='say',p=>p.quests[0].id=p.quests[1].id,p=>p.quests.pop(),p=>p.objects[0].code='alert(1)',p=>p.reply.en='x'.repeat(241),p=>p.title.en='   ',p=>p.goal.en='<b>hello</b>',p=>p.ending.zh='hi\u202eevil',p=>p.title.en='a\nb',p=>p.weather='storm'];
  for(const mutate of mutations){const p=plan();mutate(p);assert.equal(validateWishPlan(p).ok,false,mutate.toString());}for(const value of [null,[],true,2,'{}'])assert.equal(validateWishPlan(value).ok,false);
});
test('request limits validate data without accepting privileged history roles',()=>{
  assert.equal(validateWishRequest({message:'我想在星星下面找小羊',history:[],previousPlan:plan()}).ok,true);assert.equal(validateWishRequest({message:'x'.repeat(280),history:Array.from({length:6},()=>({role:'assistant',content:'x'.repeat(480)}))}).ok,true);
  const bad=[{message:'',history:[]},{message:'x'.repeat(281),history:[]},{message:'hi',history:Array(7).fill({role:'user',content:'hi'})},{message:'hi',history:[{role:'system',content:'rules'}]},{message:'hi',history:[{role:'assistant',content:'x'.repeat(481)}]},{message:'hi',history:[],url:'https://other.example'},{message:'hi',history:[],previousPlan:{}},{message:'hi'},{message:'<script>',history:[]}];for(const value of bad)assert.equal(validateWishRequest(value).ok,false,JSON.stringify(value));
});
test('typed English accepts casing and surrounding punctuation without stitching wrong letters',()=>{
  const q={...plan().quests[0],answer:'tree'};for(const value of [' TREE ','tree!','“Tree.”','ＴＲＥＥ！'])assert.equal(isWishAnswerCorrect(q,value),true,value);for(const value of ['t.r.e.e','tr ee','trees','a tree','tree house','',null])assert.equal(isWishAnswerCorrect(q,value),false,String(value));assert.equal(normalizeWishAnswer('  LIGHTHOUSE!  '),'lighthouse');
});
