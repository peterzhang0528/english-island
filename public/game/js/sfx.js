// sfx.js — 全部音效用 WebAudio 现场合成，没有任何音频文件（借鉴 huashu-art-motion / 雨夜便利店的做法）。
let ctx = null, master = null, muted = false, paused = false;
try { muted = sessionStorage.getItem("island-muted") === "1"; } catch {}
function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination); }
  if (ctx.state === "suspended" && !paused) void ctx.resume();
  return ctx;
}
function tone(freq, dur, { type = "sine", gain = 0.5, slide = 0, attack = 0.005, decay } = {}) {
  const a = ac(); if (!a || muted || paused) return; const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function burst(dur, { gain = 0.5, freq = 1200, q = 1 } = {}) {
  const a = ac(); if (!a || muted || paused) return; const t = a.currentTime; const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(); src.buffer = buf; const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = gain; src.connect(f).connect(g).connect(master); src.start(t);
}
export const sfx = {
  unlock() { ac(); },
  get ctx() { return ac(); },
  get muted() { return muted; },
  set muted(v) { muted = Boolean(v); if (master) master.gain.value = muted ? 0 : 0.5; try { sessionStorage.setItem("island-muted", muted ? "1" : "0"); } catch {} },
  set paused(value) { paused = Boolean(value); if (ctx) { if (paused) void ctx.suspend(); else void ctx.resume(); } },
  get paused() { return paused; },
  tok() { burst(0.07, { gain: 0.6, freq: 900 + Math.random() * 300, q: 2 }); tone(140, 0.08, { type: "triangle", gain: 0.25, slide: -60 }); },
  crack() { burst(0.12, { gain: 0.5, freq: 600, q: 1.2 }); tone(90, 0.12, { type: "square", gain: 0.12 }); },
  pop() { tone(420, 0.12, { type: "sine", gain: 0.35, slide: 500 }); },
  ding() { tone(880, 0.35, { gain: 0.3 }); setTimeout(() => tone(1320, 0.45, { gain: 0.25 }), 90); },
  click() { tone(600, 0.05, { type: "square", gain: 0.12 }); },
  creak() { tone(180, 0.7, { type: "sawtooth", gain: 0.12, slide: 90, attack: 0.1 }); tone(95, 0.7, { type: "triangle", gain: 0.1, slide: 40, attack: 0.1 }); },
  baa() { tone(260, 0.5, { type: "sawtooth", gain: 0.14, slide: -40, attack: 0.03 }); setTimeout(() => tone(240, 0.25, { type: "sawtooth", gain: 0.12, slide: -30 }), 160); },
  timber() { burst(0.5, { gain: 0.7, freq: 300, q: 0.7 }); },                                   // 树干吱嘎
  thud() { tone(70, 0.4, { type: "triangle", gain: 0.5, slide: -30 }); burst(0.2, { gain: 0.6, freq: 180, q: 0.8 }); }, // 落地那一帧再响
  // 环境音：轻风 + 偶尔的鸟叫，全部合成（借鉴「像素上海」的 WebAudio 做法）；开门后开始，静音靠 master 增益
  ambience() {
    const a = ac(); if (!a || this._amb) return; const n = a.sampleRate * 2, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true; const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 420; const g = a.createGain(); g.gain.value = 0.035;
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 180; lfo.connect(lg).connect(f.frequency); lfo.start();
    src.connect(f).connect(g).connect(master); src.start(); this._amb = { src, lfo };
    const chirp = () => { if (!muted) { const base = 1800 + Math.random() * 900; [0, 0.12, 0.26].forEach((o, i) => setTimeout(() => tone(base * (1 + i * 0.08), 0.09, { type: "sine", gain: 0.05, slide: 350, attack: 0.01 }), o * 1000)); } this._amb.timer = setTimeout(chirp, 5000 + Math.random() * 9000); };
    this._amb.timer = setTimeout(chirp, 4000);
  },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, { type: "triangle", gain: 0.28 }), i * 110)); },
  craft() { burst(0.1, { gain: 0.4, freq: 2000, q: 3 }); setTimeout(() => this.ding(), 80); },
};
