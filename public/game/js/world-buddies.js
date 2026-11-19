// Buddy Island page: wires the director (rules), the 3D world and the voices together.
// Live mode: Mia and Leo are GPT-Live sessions. Demo mode: the scripted lines are read by the
// browser's own speech voice and are always labelled as a demo.
import { BUDDIES, BUDDY_IDS, CLASS_CODE_HEADER, STAGES } from './buddies-contract.js';
import { createBuddyDirector } from './buddies-game.js';
import { BuddyLiveError, createBuddyLive } from './buddies-live.js';
import { createBuddyWorld } from './buddies-world.js';

const $ = selector => document.querySelector(selector);
export const STAGE_KEY = 'island-buddy-stage';
export const SESSION_LIMIT_SECONDS = 12 * 60;
const HIDDEN_LIMIT_MS = 45_000, CUE_GRACE_MS = 4_000, BUBBLE_MS = 2_600, LOG_LINES = 3;
const STAGE_LABELS = { 1: 'Listen', 2: 'Say words', 3: 'Say sentences' };
const END_NOTES = {
  hidden: '页面离开太久，语音已自动挂断（避免继续计费）。',
  expired: '这次语音会话到时间了。', connection_lost: '网络断开了，语音会话已结束。', remote_hangup: '语音会话被服务器结束了。',
  content: '语音会话因内容安全规则被结束。', failed: '语音会话意外结束了。',
};

export function readStage(storage) {
  try { const stage = Number(storage.getItem(STAGE_KEY)); return STAGES.includes(stage) ? stage : 1; } catch { return 1; }
}
export function formatClock(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export async function initBuddyUI() {
  const view = window, synth = view.speechSynthesis ?? null;
  const goal = $('#goal'), log = $('#caption-log'), chipRow = $('#chip-row'), chips = $('#chips'), pocket = $('#word-pocket'), note = $('#connection-note');
  const startLive = $('#start-live'), startDemo = $('#start-demo'), micButton = $('#mic-button'), soundButton = $('#sound-button'), playerLine = $('#player-line');
  const classEntry = $('#class-entry'), codeInput = $('#class-code');
  let classCode = '';
  const bubbles = { mia: $('#bubble-mia'), leo: $('#bubble-leo') };
  let mode = null, director = null, live = null, stage = readStage(view.localStorage), muted = false, ended = false;
  let elapsed = 0, startedAt = 0, hiddenSince = 0, goodbye = false, phrases = [], cue = null, demoTalking = null, playerLineTimer = 0;
  const bubbleUntil = { mia: 0, leo: 0 }, liveRow = { mia: null, leo: null }, hidden = { mia: false, leo: false };

  function onFrame(dt, player) {
    if (!director) return null;
    const time = performance.now();
    elapsed = (time - startedAt) / 1000;
    if (cue && (cue.started || time - cue.at > CUE_GRACE_MS)) cue = null;
    director.tick(dt, { player, busy: mode === 'live' ? live.busy() || !!cue : !!demoTalking });
    $('#session-clock').textContent = formatClock(elapsed);
    for (const who of BUDDY_IDS) {
      const bubble = bubbles[who], at = hidden[who] ? null : world.project(who);
      const show = !!at && !!bubble.textContent && (time < bubbleUntil[who] || (mode === 'live' ? live.speaking(who) : demoTalking === who));
      bubble.hidden = !show;
      if (show) bubble.style.transform = `translate(${Math.round(Math.min(view.innerWidth - 90, Math.max(90, at.x)))}px, ${Math.round(Math.max(150, at.y))}px) translate(-50%, -100%)`;
    }
    if (playerLineTimer && time > playerLineTimer) { playerLineTimer = 0; playerLine.hidden = true; }
    if (mode === 'live') {
      if (!goodbye && elapsed > SESSION_LIMIT_SECONDS - 25) { goodbye = true; live.say('mia', 'We have to go home now! Bye! See you tomorrow!', { fact: 'It is time to go home. The game ends in a moment. Say goodbye to the new kid.' }); }
      if (elapsed > SESSION_LIMIT_SECONDS) finish('limit');
    }
    return director?.state.buddies ?? null;
  }
  const world = createBuddyWorld($('#buddy-world'), { onFrame });
  world.setPaused(true);

  function addLine(who, text, row = null) {
    const item = row ?? document.createElement('li'), name = document.createElement('b');
    item.className = `who-${who}`; name.textContent = who === 'you' ? 'You' : BUDDIES[who].name;
    item.replaceChildren(name, document.createTextNode(text));
    if (!row) log.append(item);
    while (log.children.length > LOG_LINES) log.firstElementChild.remove();
    return item;
  }
  function showBubble(who, text) { bubbles[who].textContent = text; bubbleUntil[who] = performance.now() + BUBBLE_MS; }
  function showPlayer(text, done) {
    playerLine.textContent = `You: ${text}`; playerLine.hidden = false;
    playerLineTimer = done ? performance.now() + 1800 : 0;
  }
  function playerSaid(text) { showPlayer(text, true); addLine('you', text); director?.heard(text); }
  function renderChips() {
    const tappable = mode === 'demo' || !live?.micOn;
    chips.replaceChildren(...phrases.map(phrase => {
      const chip = document.createElement(tappable ? 'button' : 'span'); chip.className = 'chip'; chip.textContent = phrase;
      if (tappable) { chip.type = 'button'; chip.addEventListener('click', () => { if (!director) return; if (mode === 'live') live.playerSaid(phrase); playerSaid(phrase); }); }
      return chip;
    }));
    $('#chip-label').textContent = tappable ? 'Tap to say:' : 'Try saying:';
    chipRow.hidden = !phrases.length;
  }
  function showStage() { const badge = $('#stage-badge'); badge.textContent = `${stage} · ${STAGE_LABELS[stage]}`; badge.hidden = false; }

  // Demo voice: the browser reads the scripted line. It is never presented as AI.
  function demoSpeak(who, text) {
    demoTalking = who; showBubble(who, text); addLine(who, text);
    // A browser without an English voice ends the utterance at once; keep the line up long enough to read.
    const readable = performance.now() + Math.min(4000, 600 + text.length * 45);
    const end = () => { if (demoTalking === who) demoTalking = null; director?.lineDone(who); };
    const done = () => { const left = readable - performance.now(); if (left > 0) view.setTimeout(end, left); else end(); };
    if (muted || !synth || !view.SpeechSynthesisUtterance) { view.setTimeout(done, 0); return; }
    const utterance = new view.SpeechSynthesisUtterance(text), voices = synth.getVoices().filter(voice => /^en[-_]US/i.test(voice.lang));
    utterance.lang = 'en-US'; utterance.rate = .95; utterance.pitch = who === 'mia' ? 1.45 : .95;
    const voice = voices.find(v => who === 'mia' ? /female|samantha|zira|jenny|aria/i.test(v.name) : /\bmale|alex|david|guy|fred/i.test(v.name)) ?? voices[who === 'mia' ? 0 : voices.length - 1];
    if (voice) utterance.voice = voice;
    utterance.onend = utterance.onerror = done;
    synth.speak(utterance);
  }

  function onDirector(event) {
    if (event.type === 'say') {
      if (mode === 'live') { if (live.say(event.who, event.text, { fact: event.fact, secret: event.secret })) cue = { who: event.who, at: performance.now(), started: false }; }
      else demoSpeak(event.who, event.text);
    } else if (event.type === 'goal') { goal.textContent = event.text; goal.hidden = false; world.world.focus(event.place); }
    else if (event.type === 'chips') { phrases = event.phrases; renderChips(); }
    else if (event.type === 'round') $('#round-title').textContent = event.title;
    else if (event.type === 'spawn') world.world.spawnApple(event.id, event.x, event.z);
    else if (event.type === 'remove') world.world.removeApple(event.id);
    else if (event.type === 'hide' || event.type === 'show') { hidden[event.who] = event.type === 'hide'; world.world.setHidden(event.who, hidden[event.who]); }
    else if (event.type === 'cheer') world.world.cheer('player');
    else if (event.type === 'word') { const word = document.createElement('span'); word.textContent = event.word; pocket.append(word); pocket.hidden = false; }
    else if (event.type === 'stage') { stage = event.stage; showStage(); try { view.localStorage.setItem(STAGE_KEY, String(stage)); } catch {} live?.setStage(stage); }
  }
  function onLive(event) {
    if (event.type === 'caption') { showBubble(event.who, event.text); liveRow[event.who] = addLine(event.who, event.text, liveRow[event.who]?.isConnected ? liveRow[event.who] : null); liveRow[event.who].classList.add('live'); }
    else if (event.type === 'line') { showBubble(event.who, event.text); if (liveRow[event.who]?.isConnected) addLine(event.who, event.text, liveRow[event.who]); else addLine(event.who, event.text); liveRow[event.who] = null; director?.lineDone(event.who); }
    else if (event.type === 'speaking') { if (event.speaking && cue?.who === event.who) cue.started = true; }
    else if (event.type === 'hearing') showPlayer(event.text, false);
    else if (event.type === 'heard') playerSaid(event.text);
    else if (event.type === 'problem') console.warn('Buddy voice problem', event.who, event.code);
    else if (event.type === 'ended') finish(END_NOTES[event.reason] ? event.reason : 'failed');
  }

  function begin(next) {
    mode = next; ended = false; startedAt = performance.now();
    const badge = $('#mode-badge');
    badge.textContent = mode === 'live' ? 'LIVE · Mia & Leo' : 'DEMO · scripted lines, not AI'; badge.classList.toggle('demo', mode === 'demo'); badge.hidden = false;
    $('#start-panel').hidden = true; $('#talk').hidden = false; $('#stick').hidden = false; $('#session-clock').hidden = false; $('#end-button').hidden = false; soundButton.hidden = false;
    micButton.hidden = mode !== 'live';
    if (mode === 'live') { micButton.disabled = !live.hasMic; micButton.textContent = live.hasMic ? 'Mic on' : 'No mic'; micButton.setAttribute('aria-pressed', String(live.micOn)); }
    showStage();
    director = createBuddyDirector({ emit: onDirector, stage, replies: mode !== 'live' });
    director.start(); world.setPaused(false); $('#buddy-world').focus();
  }
  async function finish(reason) {
    if (ended || !director) return;
    ended = true;
    const state = director.state; director = null; world.setPaused(true); synth?.cancel(); demoTalking = null;
    for (const bubble of Object.values(bubbles)) bubble.hidden = true;
    goal.hidden = true; $('#talk').hidden = true; $('#stick').hidden = true; micButton.hidden = true; soundButton.hidden = true; $('#end-button').hidden = true;
    const minutes = Math.max(1, Math.round(elapsed / 60));
    $('#end-title').textContent = reason === 'limit' ? 'Time for a break! See you tomorrow!' : 'Bye! See you next time!';
    $('#end-summary').textContent = `You played with Mia and Leo for about ${minutes} minute${minutes === 1 ? '' : 's'}, finished ${state.rounds} game${state.rounds === 1 ? '' : 's'} and said ${state.spoken} thing${state.spoken === 1 ? '' : 's'} in English.`;
    $('#end-words').replaceChildren(...state.words.map(word => { const item = document.createElement('span'); item.textContent = word; return item; }));
    const endNote = $('#end-note'); endNote.textContent = END_NOTES[reason] ?? ''; endNote.hidden = !END_NOTES[reason];
    $('#end-panel').hidden = false; $('#end-title').focus();
    await live?.close().catch(() => {});
  }

  for (const input of document.querySelectorAll('#stage-pick input')) {
    input.checked = Number(input.value) === stage;
    input.addEventListener('change', () => { if (input.checked) stage = Number(input.value); });
  }
  startDemo.addEventListener('click', () => begin('demo'));
  startLive.addEventListener('click', async () => {
    startLive.disabled = startDemo.disabled = true; note.classList.remove('warn'); note.textContent = '正在接通 Mia 和 Leo…（请允许使用麦克风）';
    const session = createBuddyLive({ stage, on: onLive, classCode });
    try { await session.start(); live = session; begin('live'); }
    catch (error) {
      note.classList.add('warn');
      note.textContent = `没有接通：${error instanceof BuddyLiveError && error.code !== 'failed' && error.message ? error.message.replace(/[。.]+$/u, '') : '语音会话没有建立'}。可以再试一次，或先试玩演示。`;
      startLive.disabled = startDemo.disabled = false;
      if (error?.code === 'CLASS_CODE_REQUIRED') { classCode = ''; startLive.disabled = true; classEntry.hidden = false; codeInput.focus(); }
    }
  });
  micButton.addEventListener('click', () => { const on = live.setMic(!live.micOn); micButton.setAttribute('aria-pressed', String(on)); micButton.textContent = on ? 'Mic on' : 'Mic off'; renderChips(); });
  soundButton.addEventListener('click', () => { muted = !muted; soundButton.setAttribute('aria-pressed', String(muted)); soundButton.textContent = muted ? 'Sound off' : 'Sound on'; live?.setMuted(muted); if (muted) synth?.cancel(); });
  $('#end-button').addEventListener('click', () => finish('user'));
  $('#play-again').addEventListener('click', () => view.location.reload());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenSince = performance.now();
    else if (mode === 'live' && hiddenSince && performance.now() - hiddenSince > HIDDEN_LIMIT_MS) finish('hidden');
  });
  // A hidden tab stops rendering, so the idle hang-up needs its own timer.
  view.setInterval(() => { if (mode === 'live' && !ended && document.hidden && performance.now() - hiddenSince > HIDDEN_LIMIT_MS) finish('hidden'); }, 5_000);
  view.addEventListener('pagehide', () => { live?.close().catch(() => {}); synth?.cancel(); });

  const stick = $('#stick'), knob = $('#stick-knob');
  let stickPointer = null;
  function moveStick(event) {
    const box = stick.getBoundingClientRect(), radius = box.width / 2;
    let x = (event.clientX - box.left - radius) / radius, y = (event.clientY - box.top - radius) / radius;
    const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
    knob.style.transform = `translate(${x * radius * .6}px, ${y * radius * .6}px)`; world.setStick(x, -y);
  }
  function releaseStick(event) { if (event.pointerId !== stickPointer) return; stickPointer = null; knob.style.transform = ''; world.setStick(0, 0); }
  stick.addEventListener('pointerdown', event => { stickPointer = event.pointerId; stick.setPointerCapture?.(event.pointerId); moveStick(event); event.preventDefault(); });
  stick.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) moveStick(event); });
  stick.addEventListener('pointerup', releaseStick); stick.addEventListener('pointercancel', releaseStick);

  const supported = !!view.RTCPeerConnection && !!(view.AudioContext ?? view.webkitAudioContext);
  async function checkAccess(code = '') {
    const submit = classEntry.querySelector('button');
    submit.disabled = true;
    try {
      const response = await fetch('/api/buddies', { mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { accept: 'application/json', ...(code ? { [CLASS_CODE_HEADER]: code } : {}) } });
      if (!response.ok) throw Error();
      const status = await response.json();
      classEntry.hidden = status.classCodeRequired !== true || !supported;
      startLive.disabled = status.available !== true || !supported;
      if (!supported) note.textContent = '这个浏览器不支持实时语音，可以先试玩演示。';
      else if (!startLive.disabled) { classCode = code; codeInput.value = ''; note.textContent = 'Mia 和 Leo 在线，可以开始了。'; }
      else if (!classEntry.hidden) note.textContent = code ? '口令不对，请向老师确认。' : '输入老师给的口令可以打开实时语音；演示不需要口令。';
      else note.textContent = '班内实时语音暂未开放，可以先试玩演示。';
    } catch { startLive.disabled = true; note.textContent = '暂时连不上语音服务，稍后再试或先试玩演示。'; }
    finally { submit.disabled = false; }
  }
  classEntry.addEventListener('submit', event => { event.preventDefault(); void checkAccess(codeInput.value.trim()); });
  await checkAccess();
  return { world, get mode() { return mode; }, get director() { return director; } };
}
