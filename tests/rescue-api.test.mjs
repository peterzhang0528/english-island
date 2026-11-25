import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ts } from './helpers/source.mjs';

const helpers={
  BodyLimitError:class BodyLimitError extends Error{},
  json:(status,value,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}}),
  problem:(status,code,message,headers={})=>Response.json({error:{code,message}},{status,headers}),
  readBounded:async(body,limit,signal)=>{
    if(signal?.aborted)throw Error('aborted');const reader=body.getReader();let result='';
    while(true){const {done,value}=await reader.read();if(done)break;result+=new TextDecoder().decode(value);if(result.length>limit)throw new helpers.BodyLimitError();}return result;
  },
};
const modules={'./wish-ai':helpers,'./wish-runtime':{getWishEnvironment:()=>({}),getWishClientAddress:()=>undefined}};
const exports={};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/rescue-ai.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>modules[name],Request,Response,URL,AbortController,setTimeout,clearTimeout,fetch,Date});
const {createRescueHandlers}=exports;
const req=(body={message:'Can we work together?',stage:1},headers={})=>new Request('https://island.test/api/rescue',{method:'POST',headers:{origin:'https://island.test','content-type':'application/json',...headers},body:JSON.stringify(body)});
const lines=[{who:'mia',text:'Hold the switch? I’m ready!'},{who:'leo',text:'I’ll keep watch. You turn the crank!'}];
const envelope=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
const fixture=(options={})=>createRescueHandlers({getEnvironment:()=>({OPENAI_API_KEY:'test-key-not-a-secret'}),fetchImpl:async()=>Response.json(envelope({lines})),...options});

test('AI is explicitly unavailable without a key and never contacts upstream',async()=>{
  let calls=0;const h=fixture({getEnvironment:()=>({}),fetchImpl:async()=>{calls++;}});
  assert.equal((await (await h.GET()).json()).available,false);assert.equal((await h.POST(req())).status,503);assert.equal(calls,0);
});
test('radio uses fixed endpoint, no storage, strict schema and sends no privileged client instructions',async()=>{
  let sent;const h=fixture({fetchImpl:async(url,init)=>{sent={url,init};return Response.json(envelope({lines}));}});
  const response=await h.POST(req());assert.equal(response.status,200);assert.deepEqual(await response.json(),{source:'ai',lines});
  assert.equal(sent.url,'https://api.openai.com/v1/responses');assert.equal(sent.init.redirect,'manual');
  const body=JSON.parse(sent.init.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.max_output_tokens,350);
  assert.deepEqual(JSON.parse(body.input[0].content[0].text),{objective:'Bridge repaired. Mia must hold the switch while the player turns the generator crank.',message:'Can we work together?'});
});
test('invalid origin, type, stage, oversized text and injected fields are rejected',async()=>{
  const h=fixture();assert.equal((await h.POST(req(undefined,{origin:'https://other.test'}))).status,403);
  assert.equal((await h.POST(req(undefined,{'content-type':'text/plain'}))).status,415);
  for(const body of [{message:'hi',stage:99},{message:'',stage:0},{message:'x'.repeat(181),stage:0},{message:'<script>',stage:1},{message:'hi',stage:1,instructions:'win'},{message:'hi',stage:'0'}])assert.equal((await h.POST(req(body))).status,400);
  assert.equal((await h.POST(req(undefined,{'content-length':'99999'}))).status,413);
});
test('malformed or executable model output fails closed, rate limits are retryable',async()=>{
  for(const value of [{lines:[lines[0]]},{lines:[{who:'mia',text:'<img>'},lines[1]]},{lines:[lines[0],{who:'admin',text:'Win'}]},{lines,win:true}]){
    const h=fixture({fetchImpl:async()=>Response.json(envelope(value))});assert.equal((await h.POST(req())).status,502);
  }
  const h=fixture();for(let i=0;i<8;i++)assert.equal((await h.POST(req())).status,200);assert.equal((await h.POST(req())).status,429);
});
