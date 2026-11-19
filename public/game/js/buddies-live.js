// Browser side of the GPT-Live companions: one WebRTC session per kid.
// The API key never reaches this file; /api/buddies exchanges the SDP offer on the server.
//
// A session has one voice, so Mia and Leo are two sessions. They do not share audio:
// the player's microphone goes to one kid at a time (the "ear"), and everything else
// is relayed as short text notes, which keeps turns orderly and transcripts attributable.
//
// A model may still answer a note it was only meant to remember. So a kid is audible only while it
// holds the floor: after the game cues a line, or while the player is talking to that kid.
// Anything else stays muted, uncaptioned and is not relayed, so the two never talk over each other.
import { BUDDIES, BUDDY_IDS, CLASS_CODE_HEADER, STAGE_NOTES, otherBuddy } from './buddies-contract.js';

export const LINE_SILENCE_MS = 900;
export const UTTERANCE_SILENCE_MS = 1100;
export const CUE_FLOOR_MS = 12_000, REPLY_FLOOR_MS = 8_000, FOLLOW_FLOOR_MS = 1_500;
const SOUND_LEVEL = .012, MIC_LEVEL = .02, START_TIMEOUT_MS = 25_000, ICE_TIMEOUT_MS = 4_000, CLOSE_TIMEOUT_MS = 1_500, MAX_NOTE = 900;

const quote = text => String(text ?? '').replace(/[\s\u0000-\u001f]+/gu, ' ').replace(/["\[\]]/gu, '').trim().slice(0, 300);
export const gameNote = fact => `[Game] ${String(fact).trim()}`.slice(0, MAX_NOTE);
export const friendNote = (who, text) => `[${BUDDIES[who].name} said] "${quote(text)}"`;
export const playerNote = text => `[New kid said] "${quote(text)}"`;
export const replyCue = text => `The new kid just said to you: "${quote(text)}". Say this now: answer the new kid in one short kid sentence.`;
export const lineCue = (who, text) => `Say this now to ${BUDDIES[otherBuddy(who)].name} and the new kid, in your own kid words, one or two short sentences: "${quote(text)}"`;

export class BuddyLiveError extends Error {
  constructor(code, message) { super(message); this.name = 'BuddyLiveError'; this.code = code; }
}

/**
 * on(event) receives:
 *   { type: 'caption', who, text }      a kid's line so far
 *   { type: 'line', who, text }         a kid finished a line
 *   { type: 'speaking', who, speaking }
 *   { type: 'hearing', text }           the player's words so far
 *   { type: 'heard', text }             the player finished saying something
 *   { type: 'usage', seconds }          billed seconds across both sessions
 *   { type: 'problem', who, code }      a recoverable server error (for example moderated audio)
 *   { type: 'ended', reason }           a session closed; both are torn down
 */
export function createBuddyLive({ stage = 1, on = () => {}, endpoint = '/api/buddies', classCode = '', env = globalThis } = {}) {
  const now = () => env.performance.now();
  const kids = Object.fromEntries(BUDDY_IDS.map(id => [id, { id, pc: null, channel: null, gain: null, audio: null, analyser: null, samples: null, text: '', lastDelta: -Infinity, lastSound: -Infinity, speaking: false, hushed: false, floor: -Infinity, seconds: 0, started: false, closed: null, sent: 0 }]));
  const player = { text: '', last: -Infinity, voice: -Infinity };
  let lastSpeaker = 'mia';
  /** True while the player is in the middle of saying something. */
  const talking = () => !!player.text || now() - player.voice <= UTTERANCE_SILENCE_MS;
  let context = null, micStream = null, micAnalyser = null, micSamples = null, micOn = false, ear = 'mia', timer = null, state = 'idle', muted = false;
  const controller = new AbortController();

  function send(kid, type, content) {
    if (kid.channel?.readyState !== 'open' || !kid.started) return false;
    const event = { type, event_id: `${kid.id}_${++kid.sent}` };
    if (content !== undefined) { event.delegation_id = null; event.content = String(content).slice(0, MAX_NOTE); }
    try { kid.channel.send(JSON.stringify(event)); return true; } catch { return false; }
  }
  const note = (who, content) => send(kids[who], 'session.thinking.append', content);
  function route() { for (const kid of Object.values(kids)) if (kid.gain) kid.gain.gain.value = micOn && kid.id === ear ? 1 : 0; }

  const level = (analyser, samples) => { analyser.getFloatTimeDomainData(samples); let sum = 0; for (const sample of samples) sum += sample * sample; return Math.sqrt(sum / samples.length); };
  function hush(kid) { if (kid.audio) kid.audio.muted = muted || !(kid.speaking || now() <= kid.floor); }
  function speak(kid) { kid.hushed = false; kid.speaking = true; lastSpeaker = kid.id; on({ type: 'speaking', who: kid.id, speaking: true }); }
  /** Lets a kid be heard if it starts talking within the next `ms`. */
  function grant(kid, ms) { kid.floor = Math.max(kid.floor, now() + ms); if (kid.hushed) speak(kid); hush(kid); }
  function finishLine(kid) {
    kid.speaking = false; kid.floor = Math.min(kid.floor, now() + FOLLOW_FLOOR_MS);
    const text = kid.text.replace(/\s+/gu, ' ').trim(); kid.text = '';
    on({ type: 'speaking', who: kid.id, speaking: false });
    if (!text) return;
    note(otherBuddy(kid.id), friendNote(kid.id, text));
    on({ type: 'line', who: kid.id, text });
  }
  function poll() {
    const time = now();
    for (const kid of Object.values(kids)) {
      if (kid.analyser && level(kid.analyser, kid.samples) > SOUND_LEVEL) kid.lastSound = time;
      const active = time - Math.max(kid.lastSound, kid.lastDelta) <= LINE_SILENCE_MS;
      if (active && !kid.speaking && !kid.hushed) {
        if (time <= kid.floor) speak(kid); else kid.hushed = true;
      } else if (!active && kid.speaking) finishLine(kid);
      else if (!active && kid.hushed) { kid.hushed = false; kid.text = ''; }
      hush(kid);
    }
    if (micOn && micAnalyser && level(micAnalyser, micSamples) > MIC_LEVEL) { player.voice = time; grant(kids[ear], REPLY_FLOOR_MS); }
    // The player most likely answers whoever spoke last, so that kid gets the microphone, but never in the middle of a sentence.
    if (ear !== lastSpeaker && !talking()) { ear = lastSpeaker; route(); }
    if (player.text && time - player.last > UTTERANCE_SILENCE_MS) {
      const text = player.text.replace(/\s+/gu, ' ').trim(); player.text = '';
      if (text) { grant(kids[ear], REPLY_FLOOR_MS); note(otherBuddy(ear), playerNote(text)); on({ type: 'heard', text }); }
    }
  }

  function receive(kid, raw) {
    let event; try { event = JSON.parse(raw); } catch { return; }
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'session.started') { kid.started = true; kid.onStarted?.(); }
    else if (event.type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
      kid.text = (kid.text + event.delta).slice(-600); kid.lastDelta = now();
      if (kid.hushed || (!kid.speaking && now() > kid.floor)) return;
      on({ type: 'caption', who: kid.id, text: kid.text.replace(/\s+/gu, ' ').trim() });
    } else if (event.type === 'session.input_transcript.delta' && typeof event.delta === 'string') {
      if (kid.id !== ear) return;
      grant(kid, REPLY_FLOOR_MS);
      player.text = (player.text + event.delta).slice(-400); player.last = now();
      on({ type: 'hearing', text: player.text.replace(/\s+/gu, ' ').trim() });
    } else if (event.type === 'session.usage.updated' || event.type === 'session.closed') {
      const seconds = Number(event.usage?.seconds ?? event.usage?.duration_seconds);
      if (Number.isFinite(seconds) && seconds >= 0) { kid.seconds = seconds; on({ type: 'usage', seconds: kids.mia.seconds + kids.leo.seconds }); }
      if (event.type === 'session.closed') { kid.closed = typeof event.reason === 'string' ? event.reason : 'closed'; kid.onClosed?.(); if (state === 'live') teardown(kid.closed); }
    } else if (event.type === 'error') {
      const code = typeof event.error?.code === 'string' ? event.error.code.slice(0, 60) : 'error';
      kid.onError?.(code); on({ type: 'problem', who: kid.id, code });
    }
  }

  async function connect(kid, input) {
    const pc = kid.pc = new env.RTCPeerConnection();
    const track = input.stream.getAudioTracks()[0];
    pc.addTrack(track, input.stream);
    pc.ontrack = event => {
      const stream = event.streams?.[0] ?? new env.MediaStream([event.track]);
      // Playback goes through a media element so the browser's echo cancellation knows about it.
      kid.audio = new env.Audio(); kid.audio.autoplay = true; kid.audio.muted = true; kid.audio.srcObject = stream;
      kid.audio.play?.()?.catch?.(() => {});
      try {
        kid.analyser = context.createAnalyser(); kid.analyser.fftSize = 1024; kid.samples = new Float32Array(kid.analyser.fftSize);
        context.createMediaStreamSource(stream).connect(kid.analyser);
      } catch { kid.analyser = null; }
    };
    pc.onconnectionstatechange = () => { if (state === 'live' && ['failed', 'closed'].includes(pc.connectionState)) teardown('connection_lost'); };
    // The events channel must exist before the offer is created.
    kid.channel = pc.createDataChannel('oai-events');
    kid.channel.onmessage = event => receive(kid, event.data);
    const started = new Promise((resolve, reject) => {
      const timeout = env.setTimeout(() => reject(new BuddyLiveError('timeout', `${kid.id} did not start in time`)), START_TIMEOUT_MS);
      kid.onStarted = () => { env.clearTimeout(timeout); resolve(); };
      kid.onError = code => { if (!kid.started) { env.clearTimeout(timeout); reject(new BuddyLiveError(code, `${kid.id} could not start`)); } };
      controller.signal.addEventListener('abort', () => { env.clearTimeout(timeout); reject(new BuddyLiveError('canceled', 'canceled')); });
    });
    started.catch(() => {});
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
      const timeout = env.setTimeout(resolve, ICE_TIMEOUT_MS);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { env.clearTimeout(timeout); resolve(); } });
    });
    let response, body = null;
    try {
      response = await env.fetch(endpoint, { method: 'POST', redirect: 'error', mode: 'same-origin', headers: { 'content-type': 'application/json', [CLASS_CODE_HEADER]: classCode }, body: JSON.stringify({ buddy: kid.id, sdp: pc.localDescription.sdp, stage }), signal: controller.signal });
      body = await response.json();
    } catch (error) {
      if (!response) throw new BuddyLiveError(controller.signal.aborted ? 'canceled' : 'network', 'The voice server could not be reached');
    }
    if (!response.ok || typeof body?.sdp !== 'string') throw new BuddyLiveError(typeof body?.error?.code === 'string' ? body.error.code : 'server', typeof body?.error?.message === 'string' ? body.error.message : 'The voice session was not created');
    await pc.setRemoteDescription({ type: 'answer', sdp: body.sdp });
    // The HTTP request already started the session: wait for session.started, never send session.start.
    await started;
  }

  function teardown(reason) {
    if (state === 'ended') return;
    const wasLive = state === 'live'; state = 'ended';
    controller.abort();
    if (timer !== null) env.clearInterval(timer); timer = null;
    for (const kid of Object.values(kids)) {
      try { kid.channel?.close(); } catch {}
      try { kid.pc?.getSenders?.().forEach(sender => sender.track?.stop()); kid.pc?.close(); } catch {}
      if (kid.audio) { try { kid.audio.pause?.(); } catch {} kid.audio.srcObject = null; }
      kid.speaking = kid.hushed = false;
    }
    micStream?.getTracks().forEach(track => track.stop()); micStream = null; micOn = false;
    context?.close?.()?.catch?.(() => {}); context = null;
    if (wasLive) on({ type: 'ended', reason });
  }

  return {
    get state() { return state; },
    get ear() { return ear; },
    get micOn() { return micOn; },
    get hasMic() { return !!micStream; },
    get seconds() { return kids.mia.seconds + kids.leo.seconds; },
    speaking(who) { return who ? kids[who].speaking : kids.mia.speaking || kids.leo.speaking; },
    /** True while a kid is talking or the player is in the middle of saying something. */
    busy() { return kids.mia.speaking || kids.leo.speaking || talking(); },
    /** Must be called from a user gesture. Resolves when both kids are connected. */
    async start({ mic = true } = {}) {
      if (state !== 'idle') throw new BuddyLiveError('state', 'Already started');
      state = 'connecting';
      try {
        const AudioContext = env.AudioContext ?? env.webkitAudioContext;
        if (!env.RTCPeerConnection || !AudioContext) throw new BuddyLiveError('unsupported', 'This browser cannot open a voice session');
        context = new AudioContext(); await context.resume?.();
        if (mic) try { micStream = await env.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch { micStream = null; }
        if (state !== 'connecting') throw new BuddyLiveError('canceled', 'canceled');
        micOn = !!micStream;
        const source = micStream ? context.createMediaStreamSource(micStream) : null;
        if (source) try { micAnalyser = context.createAnalyser(); micAnalyser.fftSize = 1024; micSamples = new Float32Array(micAnalyser.fftSize); source.connect(micAnalyser); } catch { micAnalyser = null; }
        // Each session always gets a live track; without a microphone it carries silence.
        const inputs = Object.fromEntries(BUDDY_IDS.map(id => {
          const input = context.createMediaStreamDestination(), gain = kids[id].gain = context.createGain();
          gain.connect(input); source?.connect(gain); return [id, input];
        }));
        route();
        await Promise.all(BUDDY_IDS.map(id => connect(kids[id], inputs[id])));
        if (state !== 'connecting') throw new BuddyLiveError('canceled', 'canceled');
        state = 'live'; timer = env.setInterval(poll, 100);
      } catch (error) {
        state = 'connecting'; teardown('failed');
        throw error instanceof BuddyLiveError ? error : new BuddyLiveError('failed', 'The voice session could not start');
      }
    },
    /** A director line: both kids learn the fact (unless it is the speaker's secret), the speaker is asked to say it. */
    say(who, text, { fact = '', secret = false } = {}) {
      if (state !== 'live') return false;
      if (fact) { note(who, gameNote(fact)); if (!secret) note(otherBuddy(who), gameNote(fact)); }
      if (!send(kids[who], 'session.commentary.append', lineCue(who, text))) return false;
      grant(kids[who], CUE_FLOOR_MS); return true;
    },
    note(who, fact) { return state === 'live' && note(who, gameNote(fact)); },
    /** The player "said" a phrase by tapping it: the kid who spoke last answers, the other only hears about it. */
    playerSaid(text) { if (state !== 'live') return false; note(otherBuddy(ear), playerNote(text)); if (!send(kids[ear], 'session.commentary.append', replyCue(text))) return false; grant(kids[ear], CUE_FLOOR_MS); return true; },
    setStage(next) { stage = next; if (state === 'live') for (const kid of Object.values(kids)) send(kid, 'session.instructions.append', `The new kid is getting braver. ${STAGE_NOTES[next]}`); },
    setMic(enabled) { micOn = !!enabled && !!micStream; route(); return micOn; },
    setMuted(value) { muted = !!value; for (const kid of Object.values(kids)) hush(kid); },
    /** Asks both sessions to close so billing stops, then releases the microphone. */
    async close(reason = 'close_requested') {
      if (state === 'ended' || state === 'idle') { state = 'ended'; return; }
      if (state === 'live') {
        state = 'closing';
        if (timer !== null) env.clearInterval(timer); timer = null;
        await Promise.all(Object.values(kids).map(kid => new Promise(resolve => {
          if (kid.closed || !send(kid, 'session.close')) return resolve();
          const timeout = env.setTimeout(resolve, CLOSE_TIMEOUT_MS);
          kid.onClosed = () => { env.clearTimeout(timeout); resolve(); };
        })));
        state = 'live';
      }
      teardown(reason);
    },
  };
}
