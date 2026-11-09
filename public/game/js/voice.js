import { sfx } from './sfx.js';

// Bundled narration is preferred; the browser voice is a complete offline fallback.
const BASE = new URL('../audio/', import.meta.url);
let manifest = {};
const buffers = new Map();
const ready = fetch(new URL('voice.json', BASE)).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(value => { manifest = value; });
let active = null;
let queue = [];
let generation = 0;
let paused = false;

async function bufferFor(text) {
  const key = text.trim().toLowerCase();
  if (buffers.has(key)) return buffers.get(key);
  const item = manifest[key];
  if (!item) return null;
  const promise = fetch(new URL(item.f, BASE)).then(r => r.ok ? r.arrayBuffer() : null).then(data => data && sfx.ctx ? sfx.ctx.decodeAudioData(data) : null).catch(() => null);
  buffers.set(key, promise);
  return promise;
}

function stop() {
  generation++;
  queue.splice(0).forEach(job => job.resolve());
  const playing = active;
  active = null;
  playing?.cancel();
}

function timedPlay(text, buffer, job) {
  return new Promise(resolve => {
    let finished = false;
    let source = null;
    const duration = buffer ? buffer.duration * 1000 : Math.min(7000, 500 + text.length * 55);
    const silent = sfx.muted || (!buffer && !('speechSynthesis' in window));
    let remaining = silent ? duration : buffer ? duration + 250 : duration + 1800;
    let started = performance.now();
    let timer;
    const finish = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
    const resumeTimer = () => { if (finished) return; started = performance.now(); timer = setTimeout(finish, remaining); };
    job.pause = () => { clearTimeout(timer); remaining = Math.max(0, remaining - (performance.now() - started)); };
    job.resume = resumeTimer;
    if (!paused) resumeTimer();
    job.cancel = () => { try { source?.stop(); window.speechSynthesis?.cancel(); } catch {} finish(); };
    if (silent) return;
    if (buffer && sfx.ctx) {
      source = sfx.ctx.createBufferSource(); source.buffer = buffer; source.connect(sfx.ctx.destination); source.onended = finish;
      try { source.start(); } catch { finish(); }
    } else if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US'; utterance.rate = 0.88; utterance.pitch = 1.02;
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find(v => /en-US/i.test(v.lang) && /Samantha|Google|Natural|Ava/i.test(v.name)) || voices.find(v => /^en/.test(v.lang)) || null;
      utterance.onend = utterance.onerror = finish;
      try { speechSynthesis.speak(utterance); if (paused) speechSynthesis.pause(); } catch { finish(); }
    }
  });
}

async function pump() {
  if (active || !queue.length) return;
  const job = queue.shift();
  const currentGeneration = generation;
  active = job;
  try {
    await ready;
    const buffer = await bufferFor(job.text);
    if (generation === currentGeneration && active === job) await timedPlay(job.text, buffer, job);
  } catch {} finally {
    job.resolve();
    if (active === job) active = null;
    if (!active) queueMicrotask(pump);
  }
}

function say(text, { interrupt = false } = {}) {
  if (!text) return Promise.resolve();
  if (interrupt) stop();
  return new Promise(resolve => {
    if (queue.length >= 2) queue.shift().resolve();
    queue.push({ text, resolve, cancel: resolve });
    void pump();
  });
}

async function warm() {
  await ready;
  // Four workers keep the first instruction responsive without a network burst.
  const pending = Object.keys(manifest);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) await bufferFor(pending.shift());
  }));
}

function setPaused(value) {
  if (paused === value) return;
  paused = value;
  if (paused) { active?.pause?.(); window.speechSynthesis?.pause(); }
  else { active?.resume?.(); window.speechSynthesis?.resume(); }
}

export const voice = { say, stop, warm, ready, setPaused, has: text => !!manifest[text.trim().toLowerCase()], get speaking() { return !!active; } };
