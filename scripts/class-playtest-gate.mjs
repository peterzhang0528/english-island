// Temporary class playtest proxy, not a production billing or authentication service.
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const CODE = process.env.GATE_CODE;
if (!CODE) throw new Error('GATE_CODE required');
const PORT = Number(process.env.GATE_PORT ?? 3300);
const BACKENDS = (process.env.GATE_BACKENDS ?? '3201').split(',').map(Number);
const MAX_SESSIONS = Number(process.env.GATE_MAX_SESSIONS ?? 120);
const LOG = process.env.GATE_LOG ?? new URL('./gate.log', import.meta.url).pathname;
let sessions = 0;
const log = entry => { try { appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n'); } catch {} };
const cookies = header => Object.fromEntries(String(header ?? '').split(';').map(part => part.trim().split('=')).filter(pair => pair.length === 2));
const reply = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://gate.local');
  const jar = cookies(req.headers.cookie);
  const setCookies = [];
  let passed = jar.bi_pass === CODE;
  if (!passed && url.searchParams.get('code') === CODE) { passed = true; setCookies.push('bi_pass=' + CODE + '; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax'); }
  let kid = /^[a-f0-9]{12}$/.test(jar.bi_kid ?? '') ? jar.bi_kid : null;
  if (!kid) { kid = randomBytes(6).toString('hex'); setCookies.push('bi_kid=' + kid + '; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax'); }
  const api = url.pathname.startsWith('/api/');
  const buddies = url.pathname === '/api/buddies';
  if (url.pathname === '/__gate/stats') {
    if (!passed) return reply(res, 404, { error: 'not found' });
    return reply(res, 200, { sessions, max: MAX_SESSIONS });
  }
  if (buddies && req.method === 'GET' && (!passed || sessions >= MAX_SESSIONS)) {
    log({ kid, ev: 'live-unavailable', why: passed ? 'cap' : 'no-code' });
    return reply(res, 200, { available: false }, setCookies.length ? { 'set-cookie': setCookies } : {});
  }
  if (api && req.method !== 'GET' && !passed) { log({ kid, ev: 'blocked', path: url.pathname }); return reply(res, 403, { error: { code: 'ORIGIN_NOT_ALLOWED', message: '请用老师发的链接进入。' } }); }
  if (buddies && req.method === 'POST' && sessions >= MAX_SESSIONS) { log({ kid, ev: 'cap' }); return reply(res, 503, { error: { code: 'LIVE_UNAVAILABLE', message: '今天的语音名额用完了，可以先看试玩演示。' } }); }

  const port = BACKENDS[parseInt(createHash('sha1').update(kid).digest('hex').slice(0, 6), 16) % BACKENDS.length];
  const origin = 'http://127.0.0.1:' + port;
  const headers = { ...req.headers, host: '127.0.0.1:' + port, 'cf-connecting-ip': 'kid-' + kid };
  delete headers['x-forwarded-for']; delete headers['x-forwarded-proto']; delete headers['cf-ray']; delete headers['cf-visitor']; delete headers['cdn-loop']; delete headers['cf-ipcountry']; delete headers['cf-warp-tag-id'];
  if (headers.origin) headers.origin = headers.origin === 'https://' + req.headers.host || headers.origin === 'http://' + req.headers.host ? origin : 'https://cross-origin.invalid';
  const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers }, up => {
    const out = { ...up.headers };
    if (typeof out.location === 'string' && out.location.startsWith(origin)) out.location = out.location.slice(origin.length) || '/';
    if (setCookies.length) out['set-cookie'] = [...[out['set-cookie'] ?? []].flat(), ...setCookies];
    if (buddies && req.method === 'POST') { if (up.statusCode === 201) sessions++; log({ kid, ev: 'session', status: up.statusCode, total: sessions }); }
    else if (/\/game\/buddies(\.html)?$/.test(url.pathname)) log({ kid, ev: 'page', status: up.statusCode, passed });
    res.writeHead(up.statusCode ?? 502, out); up.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) reply(res, 502, { error: { code: 'UPSTREAM', message: '服务器暂时没有接通，请刷新再试。' } }); else res.destroy(); });
  req.pipe(upstream);
}).listen(PORT, '127.0.0.1', () => console.log('gate on', PORT, 'backends', BACKENDS.join(','), 'max sessions', MAX_SESSIONS));
