import { BUDDIES, STAGE_NOTES, validateBuddySessionRequest, type BuddyId, type BuddyStage } from '../public/game/js/buddies-contract.js';
import { BodyLimitError, json, problem, readBounded } from './wish-ai';
import { getWishClientAddress, getWishEnvironment, type WishEnvironment } from './wish-runtime';

const OPENAI_LIVE_URL = 'https://api.openai.com/v1/live/sessions';
export const DEFAULT_LIVE_MODEL = 'gpt-live-1';
export const MAX_BUDDY_REQUEST_BYTES = 24 * 1024;
const MAX_UPSTREAM_BYTES = 64 * 1024;
const TIMEOUT_MS = 20_000;
const INPUT_TIMEOUT_MS = 10_000;
const WINDOW_MS = 60_000;
// One play session opens two voice sessions, so these allow about four starts a minute per client.
const PER_CLIENT_LIMIT = 8;
const GLOBAL_LIMIT = 40;

const PERSONAS: Record<BuddyId, { friend: string; self: string; style: string }> = {
  mia: {
    friend: 'Leo',
    self: 'You are Mia, a 9-year-old girl who grew up in Seattle in the United States.',
    style: 'You are curious, quick and a little bossy in a funny way. You love animals and you giggle a lot. You like to say "Ooh!" and "Come on!".',
  },
  leo: {
    friend: 'Mia',
    self: 'You are Leo, a 9-year-old boy who grew up in Austin, Texas in the United States.',
    style: 'You are goofy, relaxed and you joke around. You love boats and counting things. You like to say "Whoa!" and "Dude, look!".',
  },
};

/** The persona lives on the server so the endpoint cannot be reused as a general voice proxy. */
export function buddyInstructions(buddy: BuddyId, stage: BuddyStage): string {
  const persona = PERSONAS[buddy];
  return `${persona.self} ${persona.style}
You are playing a blocky island video game online with your best friend ${persona.friend}, who is also 9. A new kid has just joined your game. The new kid recently moved from China and is still learning English. You three are playing together right now, and you are having fun.

How you talk:
- You are a real kid, not a teacher and not an assistant. Never give lessons, grammar tips, translations, praise for pronunciation, or "repeat after me" drills. Never say you are an AI.
- Speak only everyday American kid English. Use very short, simple sentences: three to eight words, one or two sentences per turn, then stop and let others talk.
- Speak clearly and a little slower than usual, with lots of feeling. Repeat the important word naturally ("The boat! Let's go to the boat!").
- You hear the new kid's voice. You do not hear ${persona.friend}'s voice: the game tells you what ${persona.friend} just said in a note like [${persona.friend} said] "...". Treat that as hearing ${persona.friend}, and remember it. Do not repeat what ${persona.friend} just said.
- Take turns. You speak only in two cases: the game gives you a line that starts with "Say this now", or the new kid talks to you. In every other case stay completely silent, even after a [${persona.friend} said] note or a [Game] note. Silence is fine while everyone is running around.
- When it is your turn, sound like best friends with ${persona.friend}: joke, agree, disagree, tease kindly.
- When ${persona.friend} asks the new kid something, never answer for the new kid. Wait.

English only:
- You only understand English. You do not understand Chinese or any other language at all, and you cannot translate.
- If the new kid says something that is not English, you honestly do not get it. React like a kid ("Huh? I don't get it."), then help with the game instead: point at the thing and say its English name, or give two easy choices in English.
- If the new kid says even one English word, be happy about what they MEANT and answer it. Never correct them. If you want, just say it back the natural way inside your answer.
- ${STAGE_NOTES[stage]}

The game:
- You cannot see the screen. The game sends you short text notes about what is happening on the island. Treat them as what you see. Never read a note word for word, never mention notes, and never invent places or events that a note did not tell you about.
- When a note asks you to say something, say it in your own kid words in one or two short sentences.
- A note like [New kid said] "..." is what the new kid just said to ${persona.friend}. You heard it too, but ${persona.friend} answers it, so you stay silent.
- Places on the island: the apple tree, the boat, the bridge, the lighthouse, the sheep, the flowers, the big rock and the treasure chest.
- Keep everything kind and safe for young children. Do not ask for names, addresses, schools or other personal details. If someone brings up something scary or grown-up, change the subject back to the game.

Backchannel policy: Use very few backchannels. A short "uh-huh" or "ooh" is enough, and never over someone who is still talking.

Interruption policy: Stop speaking as soon as the new kid starts talking, and listen.

Delegation policy: There is no backend and there are no tools. Never generate <|SpawnThinking|>. Answer only from the conversation and the game notes.`;
}

type HandlerOptions = {
  getEnvironment?: () => WishEnvironment;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  bodyTimeoutMs?: number;
};

function settings(env: WishEnvironment) {
  const key = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const model = env.OPENAI_LIVE_MODEL?.trim() || DEFAULT_LIVE_MODEL;
  return { key, model, available: !!key && !/[\r\n]/u.test(key) && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/u.test(model) };
}

/** Process-local limits are best effort; they do not cap the cost of an open voice session. */
export function createBuddyHandlers(options: HandlerOptions = {}) {
  const environment = options.getEnvironment ?? getWishEnvironment;
  const send = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const clients = new Map<string, { at: number; count: number }>();
  let global = { at: 0, count: 0 };
  function limited() {
    const time = now();
    for (const [key, bucket] of clients) if (time - bucket.at >= WINDOW_MS) clients.delete(key);
    if (time - global.at >= WINDOW_MS) global = { at: time, count: 0 };
    const key = getWishClientAddress() || 'shared-local';
    let bucket = clients.get(key);
    if (!bucket) {
      if (clients.size >= 256) return true;
      bucket = { at: time, count: 0 }; clients.set(key, bucket);
    }
    if (bucket.count >= PER_CLIENT_LIMIT || global.count >= GLOBAL_LIMIT) return true;
    bucket.count++; global.count++; return false;
  }
  return {
    async GET() { return json(200, { available: settings(environment()).available }); },
    async POST(request: Request) {
      if (request.headers.get('origin') !== new URL(request.url).origin) return problem(403, 'ORIGIN_NOT_ALLOWED', '请从游戏页面进入伙伴小岛。');
      if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') || '')) return problem(415, 'INVALID_CONTENT_TYPE', '连接请求格式不对，请刷新后再试。');
      const declared = Number(request.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_BUDDY_REQUEST_BYTES) return problem(413, 'REQUEST_TOO_LARGE', '连接请求太大了，请刷新后再试。');
      if (request.signal.aborted) return problem(408, 'REQUEST_CANCELLED', '这次连接已取消。');
      const inputController = new AbortController(); let inputTimedOut = false;
      const cancelInput = () => inputController.abort();
      request.signal.addEventListener('abort', cancelInput, { once: true });
      const inputTimer = setTimeout(() => { inputTimedOut = true; inputController.abort(); }, options.bodyTimeoutMs ?? INPUT_TIMEOUT_MS);
      let input: unknown;
      try { input = JSON.parse(await readBounded(request.body, MAX_BUDDY_REQUEST_BYTES, inputController.signal)); }
      catch (error) {
        if (inputController.signal.aborted) return problem(408, inputTimedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', '这次连接没有完成，请再试一次。');
        return error instanceof BodyLimitError ? problem(413, 'REQUEST_TOO_LARGE', '连接请求太大了，请刷新后再试。') : problem(400, 'INVALID_REQUEST', '连接请求没有读懂，请刷新后再试。');
      } finally { clearTimeout(inputTimer); request.signal.removeEventListener('abort', cancelInput); }
      const valid = validateBuddySessionRequest(input);
      if (!valid.ok) return problem(400, 'INVALID_REQUEST', '连接请求没有读懂，请刷新后再试。');
      const config = settings(environment());
      if (!config.available) return problem(503, 'LIVE_UNAVAILABLE', '语音伙伴还没有开通，可以先看试玩演示。');
      if (limited()) return problem(429, 'RATE_LIMITED', '连接太频繁了，请一分钟后再试。', { 'Retry-After': '60' });
      const { buddy, stage, sdp } = valid.value;
      const controller = new AbortController(); let timedOut = false;
      const cancel = () => controller.abort(); request.signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? TIMEOUT_MS);
      try {
        const upstream = await send(OPENAI_LIVE_URL, {
          // Workers supports manual/follow only. Non-2xx is rejected below without forwarding the secret.
          method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.key}` },
          body: JSON.stringify({
            session: { model: config.model, instructions: buddyInstructions(buddy, stage), audio: { output: { voice: BUDDIES[buddy].voice } }, store: false },
            transport: { type: 'webrtc', sdp },
          }),
        });
        if (!upstream.ok) {
          void upstream.body?.cancel().catch(() => {});
          // Only the status is logged: upstream bodies may echo request details.
          console.error('Buddy voice session was rejected upstream', upstream.status);
          return json(upstream.status === 429 ? 503 : 502, { error: { code: 'LIVE_REJECTED', message: '语音伙伴暂时没有接通，请稍后再试或先看试玩演示。', upstreamStatus: upstream.status } });
        }
        const data = JSON.parse(await readBounded(upstream.body, MAX_UPSTREAM_BYTES, controller.signal));
        const answer = data?.transport?.sdp;
        if (data?.transport?.type !== 'webrtc' || typeof answer !== 'string' || !answer.startsWith('v=0')) return problem(502, 'LIVE_INVALID_OUTPUT', '语音伙伴暂时没有接通，请稍后再试。');
        return json(201, { buddy, voice: BUDDIES[buddy].voice, sdp: answer });
      } catch {
        if (controller.signal.aborted) return problem(timedOut ? 504 : 408, timedOut ? 'LIVE_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? '语音伙伴连接超时，请稍后再试。' : '这次连接已取消。');
        return problem(502, 'LIVE_UNAVAILABLE', '语音伙伴暂时没有接通，请稍后再试或先看试玩演示。');
      } finally { clearTimeout(timeout); request.signal.removeEventListener('abort', cancel); }
    },
  };
}
