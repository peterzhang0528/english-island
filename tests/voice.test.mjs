import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gameURL } from './helpers/source.mjs';

async function until(condition, label) {
  const deadline = performance.now() + 4000;
  while (performance.now() < deadline) {
    if (condition()) return;
    await delay(5);
  }
  throw new Error(`Timed out: ${label}`);
}

test('narration playback, cancellation and pause behavior', async t => {
  const manifest = JSON.parse(await readFile(new URL('audio/voice.json', gameURL), 'utf8'));
  let servedManifest = manifest;
  const failedURLs = new Set();
  const started = [], gains = [], requests = [];
  let delayedURL, releaseDelayed, inFlight = 0, maxInFlight = 0;
  const clipURL = text => new URL(`audio/${manifest[text].f}`, gameURL).href;
  const originalGlobals = new Map(['window', 'fetch', 'speechSynthesis', 'SpeechSynthesisUtterance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

  class MockAudioContext {
    state = 'running';
    destination = {};
    currentTime = 0;
    createGain() {
      const gain = { gain: { value: 1 }, connect() {} };
      gains.push(gain);
      return gain;
    }
    async decodeAudioData(data) { return { duration: 0.02, url: data.sourceURL }; }
    createBufferSource() {
      const source = {
        connect() {},
        start() { started.push(source); },
        stop() { this.stopped = true; this.onended?.(); },
      };
      return source;
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
  }
  globalThis.window = { AudioContext: MockAudioContext };
  globalThis.fetch = async input => {
    const url = new URL(input);
    assert.equal(url.protocol, 'file:', 'Tests must never make remote audio requests');
    assert.ok(url.href.startsWith(new URL('audio/', gameURL).href));
    if (url.href === new URL('audio/voice.json', gameURL).href) return { ok: true, json: async () => servedManifest };
    requests.push(url.href);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      if (url.href === delayedURL) await new Promise(resolve => { releaseDelayed = resolve; });
      await delay(4);
      if (failedURLs.has(url.href)) return { ok: false };
      const bytes = await readFile(url);
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      data.sourceURL = url.href;
      return { ok: true, arrayBuffer: async () => data };
    } finally {
      inFlight--;
    }
  };

  let voice;
  t.after(() => {
    releaseDelayed?.();
    voice?.stop();
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const { sfx } = await import(new URL('js/sfx.js', gameURL));
  await t.test('muting before context creation silences startup', () => {
    sfx.muted = true;
    sfx.unlock();
    assert.equal(gains[0].gain.value, 0);
    sfx.muted = false;
    assert.equal(gains[0].gain.value, 0.5);
  });
  ({ voice } = await import(new URL('js/voice.js', gameURL)));
  await voice.ready;

  await t.test('cancelling a pending download prevents stale playback', async () => {
    delayedURL = clipURL('tree');
    const cancelled = voice.say('tree');
    await until(() => releaseDelayed, 'audio request is held');
    voice.stop();
    await cancelled;
    releaseDelayed();
    delayedURL = undefined;
    await until(() => inFlight === 0 && !voice.speaking, 'cancelled request settles');
    assert.equal(started.length, 0);
  });

  await t.test('stop resolves active and queued callers without playing the queue', async () => {
    const active = voice.say('log');
    await until(() => started.length === 1, 'log starts');
    const queued = voice.say('stone');
    voice.stop();
    await Promise.all([active, queued]);
    assert.equal(started[0].stopped, true);
    assert.equal(started.length, 1);
  });

  await t.test('a bounded queue preserves the two newest waiting utterances in order', async () => {
    const offset = started.length;
    const blocker = voice.say('log');
    await until(() => started.length === offset + 1, 'blocking audio starts');
    let droppedResolved = false;
    const dropped = voice.say('door').then(() => { droppedResolved = true; });
    const next = voice.say('stone');
    const last = voice.say('axe');
    await until(() => droppedResolved, 'oldest queued utterance is dropped');
    started[offset].onended();
    await blocker;
    await until(() => started.length === offset + 2, 'stone follows');
    assert.equal(started[offset + 1].buffer.url, clipURL('stone'));
    started[offset + 1].onended();
    await next;
    await until(() => started.length === offset + 3, 'axe follows');
    assert.equal(started[offset + 2].buffer.url, clipURL('axe'));
    started[offset + 2].onended();
    await Promise.all([last, dropped]);
    assert.ok(!started.some(source => source.buffer.url === clipURL('door')));
  });

  await t.test('muted narration advances without starting an audio source', async () => {
    const count = started.length;
    sfx.muted = true;
    await voice.say('tree');
    assert.equal(started.length, count);
    sfx.muted = false;
  });

  await t.test('help pause suspends both audio and the narration watchdog', async () => {
    let resolved = false;
    const count = started.length;
    const speech = voice.say('log').then(() => { resolved = true; });
    await until(() => started.length === count + 1, 'audio starts');
    sfx.paused = true;
    voice.setPaused(true);
    assert.equal(sfx.ctx.state, 'suspended', 'Reading the context must not resume it');
    await delay(350);
    assert.equal(resolved, false, 'The watchdog must not end paused narration');
    sfx.paused = false;
    voice.setPaused(false);
    assert.equal(sfx.ctx.state, 'running');
    started.at(-1).onended();
    await speech;
  });

  await t.test('muted narration created while paused waits for resume', async () => {
    sfx.muted = true;
    voice.setPaused(true);
    let resolved = false;
    const speech = voice.say('tree').then(() => { resolved = true; });
    await delay(40);
    assert.equal(resolved, false);
    voice.setPaused(false);
    await speech;
    sfx.muted = false;
  });

  await t.test('warmup loads every manifest clip with at most four requests in flight', async () => {
    maxInFlight = 0;
    await voice.warm();
    assert.ok(maxInFlight <= 4);
    assert.equal(inFlight, 0);
    const expected = new Set(Object.keys(manifest).map(clipURL));
    assert.deepEqual(new Set(requests), expected);
  });

  const utterances = [];
  let cancels = 0, pauses = 0, resumes = 0;
  const synth = {
    getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
    speak: utterance => utterances.push(utterance),
    cancel: () => { cancels++; },
    pause: () => { pauses++; },
    resume: () => { resumes++; },
  };
  window.speechSynthesis = globalThis.speechSynthesis = synth;
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };

  await t.test('unrecorded text uses an English browser voice and supports pause', async () => {
    const text = 'A test phrase outside the bundled narration library.';
    assert.equal(voice.has(text), false);
    const speech = voice.say(text);
    await until(() => utterances.length === 1, 'browser narration starts');
    assert.equal(utterances[0].text, text);
    assert.equal(utterances[0].lang, 'en-US');
    assert.equal(utterances[0].voice.name, 'Samantha');
    voice.setPaused(true);
    voice.setPaused(false);
    assert.equal(pauses, 1);
    assert.equal(resumes, 1);
    utterances[0].onend();
    await speech;
  });

  await t.test('browser speech errors resolve the gameplay caller', async () => {
    const speech = voice.say('An unbundled test sentence for error recovery.');
    await until(() => utterances.length === 2, 'browser narration starts');
    utterances[1].onerror();
    await speech;
  });

  await t.test('interrupt cancels browser speech and starts the replacement', async () => {
    const first = voice.say('The first unbundled test phrase.');
    await until(() => utterances.length === 3, 'first fallback starts');
    const latest = voice.say('The next unbundled test phrase.', { interrupt: true });
    await first;
    await until(() => utterances.length === 4, 'replacement starts');
    assert.ok(cancels > 0);
    utterances[3].onend();
    await latest;
  });

  await t.test('a failed authored recording keeps silent timing instead of switching voices', async () => {
    // Use a fresh playback cache and a short fixture duration; the production text/file are real.
    servedManifest = { ...manifest, cloud: { ...manifest.cloud, d: 0.08 } };
    failedURLs.add(clipURL('cloud'));
    const { voice: failedVoice } = await import(new URL('js/voice.js?failed-recording-test', gameURL));
    await failedVoice.ready;
    const sourceCount = started.length, utteranceCount = utterances.length;
    let resolved = false;
    const speech = failedVoice.say('cloud').then(() => { resolved = true; });
    try {
      await delay(25);
      assert.equal(resolved, false, 'Keep time for the missing recorded line');
      assert.equal(utterances.length, utteranceCount, 'Do not substitute a browser voice');
      await Promise.race([speech, delay(1000).then(() => { throw new Error('Failed narration did not finish'); })]);
      assert.equal(started.length, sourceCount);
      assert.equal(utterances.length, utteranceCount);
    } finally {
      failedVoice.stop();
      failedURLs.clear();
      servedManifest = manifest;
    }
  });
});
