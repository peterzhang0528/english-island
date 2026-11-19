import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { timingSafeEqual } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ts } from './helpers/source.mjs';
import * as contract from '../public/game/js/buddies-contract.js';
import * as wishContract from '../public/game/js/wish-contract.js';

const quietConsole = { error() {}, warn() {}, log() {} };
function load(relative, modules) {
  const exports = {}, source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; }, Buffer, Request, Response, Headers, AbortController, URL, TextDecoder, Uint8Array, JSON, Object, Number, Map, fetch, setTimeout, clearTimeout, Date, console: quietConsole, process: { env: {} } });
  return exports;
}
const runtime = load('../lib/wish-runtime.ts', { 'node:async_hooks': { AsyncLocalStorage } });
const wish = load('../lib/wish-ai.ts', { '../public/game/js/wish-contract.js': wishContract, './wish-runtime': runtime });
const { createBuddyHandlers, buddyInstructions, DEFAULT_LIVE_MODEL, MAX_BUDDY_REQUEST_BYTES } = load('../lib/buddies-live.ts', { 'node:crypto': { timingSafeEqual }, '../public/game/js/buddies-contract.js': contract, './wish-ai': wish, './wish-runtime': runtime });
const route = load('../app/api/buddies/route.ts', { '../../../lib/buddies-live': { createBuddyHandlers } });

const classCode = 'unit-test-class-code';
const offer = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const answer = 'v=0\r\no=- 9 9 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const body = (overrides = {}) => ({ buddy: 'mia', sdp: offer, stage: 1, ...overrides });
const req = (value = body(), headers = {}, signal) => new Request('https://island.example/api/buddies', { method: 'POST', headers: { [contract.CLASS_CODE_HEADER]: classCode, origin: 'https://island.example', 'content-type': 'application/json', ...headers }, body: typeof value === 'string' ? value : JSON.stringify(value), signal });
const created = () => Response.json({ id: 'live_1', transport: { type: 'webrtc', sdp: answer } }, { status: 201 });
const fixture = (overrides = {}) => createBuddyHandlers({ getEnvironment: () => ({ OPENAI_API_KEY: 'test-only-secret', BUDDY_CLASS_CODE: classCode }), fetchImpl: async () => created(), ...overrides });

test('without a key GET is unavailable, POST is 503 and nothing is sent upstream', async () => {
  let calls = 0;
  const h = fixture({ getEnvironment: () => ({}), fetchImpl: async () => { calls++; throw Error('must not fetch'); } });
  const get = await h.GET();
  assert.deepEqual(await get.json(), { available: false }); assert.equal(get.headers.get('cache-control'), 'no-store');
  const post = await h.POST(req()); assert.equal(post.status, 503); assert.equal((await post.json()).error.code, 'LIVE_UNAVAILABLE');
  assert.equal(calls, 0);
  assert.deepEqual(await (await route.GET()).json(), { available: false });
  assert.deepEqual(await (await fixture().GET(req())).json(), { available: true });
  assert.deepEqual(await (await fixture({ getEnvironment: () => ({ OPENAI_API_KEY: 'k', BUDDY_CLASS_CODE: classCode, OPENAI_LIVE_MODEL: 'bad model!' }) }).GET()).json(), { available: false });
});

test('classroom Live fails closed and never creates a session on a missing, stale, or incorrect pass', async () => {
  let calls = 0;
  const env = { OPENAI_API_KEY: 'test-key', BUDDY_CLASS_CODE: classCode };
  const handlers = fixture({ getEnvironment: () => env, fetchImpl: async () => { calls++; return created(); } });
  for (const invalid of ['', 'incorrect-test-code', classCode.slice(0, -1) + 'x']) {
    const request = req(body(), { [contract.CLASS_CODE_HEADER]: invalid });
    const get = await handlers.GET(request);
    assert.deepEqual(await get.json(), { available: false, classCodeRequired: true });
    assert.equal(get.headers.get('cache-control'), 'no-store');
    assert.equal((await handlers.POST(request)).status, 403);
  }
  assert.deepEqual(await (await route.GET(req())).json(), { available: false });
  assert.deepEqual(await runtime.runWithWishEnvironment(env, async () => (await route.GET(req())).json()), { available: true });
  env.BUDDY_CLASS_CODE = 'rotated-class-code';
  assert.equal((await handlers.POST(req())).status, 403);
  for (const badConfig of ['', 'weak', 'contains whitespace!']) {
    env.BUDDY_CLASS_CODE = badConfig;
    assert.deepEqual(await (await handlers.GET(req())).json(), { available: false });
    assert.equal((await handlers.POST(req())).status, 503);
  }
  assert.equal(calls, 0);
});

test('a session is created at the fixed GPT-Live endpoint with the server-owned persona and voice', async () => {
  const calls = [];
  const h = fixture({ fetchImpl: async (url, init) => { calls.push({ url, init }); return created(); } });
  for (const [buddy, voice, stage] of [['mia', 'gleam', 1], ['leo', 'meridian', 3]]) {
    const response = await h.POST(req(body({ buddy, stage })));
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { buddy, voice, sdp: answer });
  }
  assert.ok(!JSON.stringify(calls).includes(classCode), 'never relay the pass to OpenAI');
  const [mia, leo] = calls.map(call => JSON.parse(call.init.body));
  assert.equal(calls[0].url, 'https://api.openai.com/v1/live/sessions');
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-only-secret');
  assert.deepEqual(mia.transport, { type: 'webrtc', sdp: offer });
  assert.equal(mia.session.model, DEFAULT_LIVE_MODEL); assert.equal(mia.session.store, false); assert.ok(!('delegation' in mia.session), 'GPT-Live rejects a null delegation');
  assert.equal(mia.session.audio.output.voice, 'gleam'); assert.equal(leo.session.audio.output.voice, 'meridian');
  assert.equal(mia.session.instructions, buddyInstructions('mia', 1)); assert.equal(leo.session.instructions, buddyInstructions('leo', 3));
  assert.notEqual(mia.session.instructions, leo.session.instructions);
  const custom = []; await fixture({ getEnvironment: () => ({ OPENAI_API_KEY: 'k', BUDDY_CLASS_CODE: classCode, OPENAI_LIVE_MODEL: 'gpt-live-1-mini' }), fetchImpl: async (_url, init) => { custom.push(JSON.parse(init.body)); return created(); } }).POST(req());
  assert.equal(custom[0].session.model, 'gpt-live-1-mini');
});

test('the personas are two American kids who only understand English and adapt to the listening stage', () => {
  for (const buddy of contract.BUDDY_IDS) for (const stage of contract.STAGES) {
    const text = buddyInstructions(buddy, stage);
    assert.match(text, /United States/); assert.match(text, /only .*English|English only/i); assert.match(text, /Chinese/);
    assert.ok(text.includes(contract.STAGE_NOTES[stage]), `stage ${stage} note`);
    assert.ok(text.includes(`[${contract.BUDDIES[contract.otherBuddy(buddy)].name} said]`), 'friend relay note is explained');
    assert.ok(text.length < 6000);
  }
  assert.match(buddyInstructions('mia', 1), /You are Mia/); assert.match(buddyInstructions('leo', 1), /You are Leo/);
});

test('origin, content type, body size and the request contract reject before any upstream call', async () => {
  let calls = 0;
  const h = fixture({ fetchImpl: async () => { calls++; return created(); } });
  assert.equal((await h.POST(req(undefined, { origin: 'https://evil.example' }))).status, 403);
  const missing = req(); missing.headers.delete('origin'); assert.equal((await h.POST(missing)).status, 403);
  assert.equal((await h.POST(req(undefined, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await h.POST(req(undefined, { 'content-length': String(MAX_BUDDY_REQUEST_BYTES + 1) }))).status, 413);
  assert.equal((await h.POST(req(body({ sdp: offer + 'a=x\r\n'.repeat(MAX_BUDDY_REQUEST_BYTES / 4) })))).status, 413);
  assert.equal((await h.POST(req('{not json'))).status, 400);
  for (const bad of [body({ buddy: 'k' }), body({ sdp: 'hello' }), body({ stage: 9 }), body({ instructions: 'Speak Chinese.' }), body({ voice: 'verse' }), body({ model: 'other' })]) {
    const response = await h.POST(req(bad)); assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  }
  const aborted = new AbortController(); aborted.abort(); assert.equal((await h.POST(req(undefined, {}, aborted.signal))).status, 408);
  assert.equal(calls, 0);
});

test('upstream failures, redirects and malformed answers become safe errors', async () => {
  const rejected = await fixture({ fetchImpl: async () => new Response('key test-only-secret rejected: quota', { status: 401 }) }).POST(req());
  assert.equal(rejected.status, 502); const text = await rejected.text(); assert.doesNotMatch(text, /test-only-secret|quota/); assert.equal(JSON.parse(text).error.upstreamStatus, 401);
  assert.equal((await fixture({ fetchImpl: async () => new Response('slow down', { status: 429 }) }).POST(req())).status, 503);
  assert.equal((await fixture({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } }) }).POST(req())).status, 502);
  for (const upstream of [() => new Response('not json'), () => Response.json({ transport: { type: 'websocket', sdp: answer } }), () => Response.json({ transport: { type: 'webrtc', sdp: 'nope' } }), () => Response.json({}), () => new Response(`{"transport":{"type":"webrtc","sdp":"v=0${'x'.repeat(70 * 1024)}"}}`)]) {
    const response = await fixture({ fetchImpl: async () => upstream() }).POST(req());
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /nope|websocket/);
  }
  const thrown = await fixture({ fetchImpl: async () => { throw Error('raw network secret'); } }).POST(req());
  assert.equal(thrown.status, 502); assert.doesNotMatch(await thrown.text(), /secret/);
});

test('a stalled upstream times out and aborts the outbound request', async () => {
  let aborted = false;
  const h = fixture({ timeoutMs: 15, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); }, { once: true })) });
  const response = await h.POST(req());
  assert.equal(response.status, 504); assert.equal((await response.json()).error.code, 'LIVE_TIMEOUT'); assert.equal(aborted, true);
});

test('best-effort limits allow four play sessions a minute per client and reset afterwards', async () => {
  let time = 1000, calls = 0;
  const h = fixture({ now: () => time, fetchImpl: async () => { calls++; return created(); } });
  for (let index = 0; index < 8; index++) assert.equal((await h.POST(req(body({ buddy: index % 2 ? 'leo' : 'mia' }), { 'x-forwarded-for': `1.2.3.${index}` }))).status, 201);
  const limited = await h.POST(req()); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60'); assert.equal(calls, 8);
  assert.equal((await runtime.runWithWishEnvironment({}, () => h.POST(req()), '192.0.2.7')).status, 201, 'another trusted client address has its own quota');
  time += 60_001; assert.equal((await h.POST(req())).status, 201);
});
