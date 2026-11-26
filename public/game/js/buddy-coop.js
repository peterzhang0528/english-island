import { createAdventure, PROFILES, TEAM, PLACES, distance, land } from './buddy-coop-rules.js';
import { createWorld } from './buddy-coop-world.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#world'), world = createWorld(canvas), chat = $('#chat');
const welcome = $('#welcome'), guide = $('#guide'), finish = $('#finish');
const action = $('#action'), input = $('#message'), sendButton = $('#chat-form button');
let game, finishedShown = false, lastUI = '', resumeAfterGuide = false, pending = null;
const history = [], aiStatus = $('#ai-status'), liveAI = $('#live-ai');
let provider = 'OpenAI';
const keys = new Set();
function emit({ who, text, source }) {
  const article = document.createElement('div'); article.className = `message ${who}`;
  const avatar = document.createElement('span'); avatar.className = `avatar ${who}`; avatar.textContent = who === 'you' ? game.state.name[0] : TEAM[who].name[0]; avatar.setAttribute('aria-hidden', 'true');
  const body = document.createElement('div'), name = document.createElement('strong'), p = document.createElement('p');
  name.textContent = (who === 'you' ? game.state.name : TEAM[who].name) + (who === 'you' ? '' : source === 'ai' ? ' · LIVE AI' : ' · SCRIPTED'); p.textContent = text;
  body.append(name, p); article.append(avatar, body); chat.append(article);
  // Keep this ephemeral log bounded; never persist or transmit messages.
  while (chat.children.length > 50) chat.firstElementChild.remove();
  chat.scrollTop = chat.scrollHeight;
  history.push({ who, text: text.slice(0, 240) });
  if (history.length > 6) history.shift();
}
function reset(profile = PROFILES[0]) {
  pending?.abort(); pending = null; history.length = 0;
  keys.clear(); chat.replaceChildren(); world.reset(); finishedShown = false; lastUI = '';
  game = createAdventure({ profile, emit }); updateUI();
}
function pause(value) { game.state.paused = value; keys.clear(); if (value) pending?.abort(); updateUI(); }
async function speak(text) {
  if (!text.trim() || pending || game.state.paused) return;
  if (!liveAI.checked) { game.send(text); updateUI(); return; }
  const prior = history.slice(); emit({ who: 'you', text });
  const controller = new AbortController(); pending = controller; updateUI();
  aiStatus.textContent = `${provider} is thinking… movement still works.`;
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const s = game.state;
    const response = await fetch('/api/buddy-coop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ message: text, profile: s.memory ? PROFILES.indexOf(s.memory) : null, history: prior,
        world: { wood: s.wood, built: s.built, holding: s.holding, lit: s.lit, complete: s.complete } }) });
    if (!response.ok) throw Error('unavailable');
    const reply = await response.json();
    if (pending !== controller || controller.signal.aborted || s !== game.state || s.paused) return;
    if (reply.source !== 'ai' || !['none', 'build_bridge', 'hold_switch'].includes(reply.action) || !Array.isArray(reply.lines) || !reply.lines.length || reply.lines.length > 3 || !reply.lines.every(line => line && Object.hasOwn(TEAM, line.who) && typeof line.text === 'string' && line.text.length <= 240)) throw Error('invalid reply');
    for (const line of reply.lines) emit({ ...line, source: 'ai' });
    // Only two bounded requests can reach the existing, guarded world rules.
    if (reply.action === 'build_bridge') game.send('Buddy, build the bridge.', { echo: false });
    if (reply.action === 'hold_switch') game.send('Nova, hold the switch.', { echo: false });
    aiStatus.textContent = `${provider} connected · generated replies marked LIVE AI.`;
  } catch {
    if (pending !== controller) return;
    aiStatus.textContent = game.state.paused ? 'Live reply cancelled while paused.' : 'Live AI unavailable. Using labeled scripted teammates for this turn.';
    if (!game.state.paused) game.send(text, { echo: false });
  } finally { clearTimeout(timer); if (pending === controller) pending = null; updateUI(); }
}
function updateUI() {
  const s = game.state;
  $('#paused').hidden = !s.paused || guide.open || finish.open;
  $('#pause').setAttribute('aria-pressed', String(s.paused)); $('#pause span').textContent = s.paused ? 'Resume' : 'Pause';
  const target = !s.wood ? PLACES.timber : !s.built ? PLACES.bridge : !s.lit ? PLACES.beacon : PLACES.picnic;
  const enabled = s.started && !s.paused;
  action.disabled = !enabled || s.complete || (!s.built && s.wood) || distance(s.player, target) > 1;
  action.textContent = s.complete ? 'A little light, together ✓' : !s.wood ? 'Collect planks ↗' : !s.built ? s.building ? 'Buddy is building…' : 'Ask Buddy to build →' : !s.lit ? 'Light star lantern ✦' : 'Join the picnic ↗';
  input.disabled = sendButton.disabled = !enabled || !!pending;
  $('#objective').textContent = !s.started ? 'Your friends are waiting on the island.' : s.complete ? 'A whole team. One little light.' : !s.wood ? 'Find some planks with your friends.' : !s.built ? s.building ? 'Buddy is fixing the bridge. Watch him go!' : '“Buddy, can you build the bridge?”' : !s.holding ? '“Nova, could you hold the switch?”' : !s.lit ? 'Nova has the switch. Go light the star lantern.' : 'Meet everyone at the picnic clearing.';
  $('#inventory').textContent = s.lit ? '✦ Star lantern glowing · everyone is welcome' : s.built ? '✦ Bridge repaired · a little further, together' : s.wood ? '▱ Planks collected · a job for two' : '✦ A small adventure, together';
  for (const button of document.querySelectorAll('[data-place]')) {
    const farIsland = ['beacon', 'picnic'].includes(button.dataset.place);
    button.disabled = !enabled || (farIsland && !s.built);
    button.classList.toggle('active', PLACES[button.dataset.place] === target);
  }
  const phrases = !s.started ? [] : !s.wood ? ['Hey Buddy, remember our class?', 'What’s the plan?'] : !s.built ? ['Buddy, can you build the bridge?', 'Thanks, team!'] : !s.holding ? ['Nova, hold the switch, please.', 'Pip, what’s for the picnic?'] : !s.lit ? ['Thanks, Nova!', 'How do I light it?'] : ['We did it together!', 'What’s for the picnic?'];
  const key = JSON.stringify([phrases, enabled, !!pending]);
  if (key !== lastUI) {
    lastUI = key; $('#suggestions').replaceChildren(...phrases.map(phrase => { const button = document.createElement('button'); button.textContent = phrase; button.disabled = !enabled || !!pending; button.onclick = () => { void speak(phrase); }; return button; }));
  }
  if (s.complete && !finishedShown) {
    finishedShown = true; keys.clear(); s.paused = true;
    $('#finish-copy').textContent = `${s.name}, you found the planks, asked your friends for help, and lit up Sunset Cove. Not one quiz. Just a shared adventure.`;
    finish.showModal(); updateUI();
  }
}
$('#start').onclick = () => {
  const profile = PROFILES[Number(document.querySelector('input[name=profile]:checked').value)];
  reset(profile); welcome.close(); game.start(); updateUI(); canvas.focus();
};
welcome.addEventListener('cancel', event => event.preventDefault());
$('#pause').onclick = () => { if (game.state.started) pause(!game.state.paused); };
$('#resume').onclick = () => { pause(false); canvas.focus(); };
$('#help').onclick = () => { if (welcome.open) return; resumeAfterGuide = !game.state.paused; pause(true); guide.showModal(); updateUI(); };
$('#close-guide').onclick = () => guide.close();
guide.addEventListener('close', () => { pause(!resumeAfterGuide); canvas.focus(); });
$('#keep-playing').onclick = () => finish.close();
finish.addEventListener('close', () => { pause(false); canvas.focus(); });
function replay() { if (finish.open) finish.close(); reset(); welcome.showModal(); }
$('#restart').onclick = replay; $('#play-again').onclick = replay;
action.onclick = () => { game.interact(); updateUI(); };
$('#chat-form').onsubmit = event => { event.preventDefault(); const text = input.value; input.value = ''; void speak(text); input.focus(); };
liveAI.onchange = () => {
  if (!liveAI.checked) pending?.abort();
  $('#chat-mode').textContent = liveAI.checked ? 'LIVE MODEL ENABLED' : 'AUTHORED DEMO';
  aiStatus.textContent = liveAI.checked ? provider === 'Local Qwen AI' ? 'Local Qwen AI: typed chat and synthetic game context are processed on this VM.' : 'OpenAI: typed chat and synthetic game context are sent to OpenAI.' : 'Scripted teammates · no model requests.';
};
fetch('/api/buddy-coop').then(response => response.ok ? response.json() : null).then(info => {
  provider = info?.provider === 'local' ? 'Local Qwen AI' : 'OpenAI';
  liveAI.disabled = !info?.available;
  aiStatus.textContent = info?.available ? `${provider} available. Opt in to send typed chat and synthetic context.` : 'Live AI off: no server model configured. Scripted demo is fully playable.';
}).catch(() => { aiStatus.textContent = 'Live AI off: server unavailable. Scripted demo is fully playable.'; });
document.querySelectorAll('[data-place]').forEach(button => { button.onclick = () => { game.walkTo(PLACES[button.dataset.place]); canvas.focus(); }; });
canvas.addEventListener('pointerdown', event => { if (game.state.paused) return; game.walkTo(world.tileAt(event)); canvas.focus({ preventScroll: true }); });
const directions = { KeyW: [-1, 0], ArrowUp: [-1, 0], KeyS: [1, 0], ArrowDown: [1, 0], KeyA: [0, 1], ArrowLeft: [0, 1], KeyD: [0, -1], ArrowRight: [0, -1] };
window.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|BUTTON/.test(event.target.tagName) || welcome.open || guide.open || finish.open) return;
  if (event.code in directions) { event.preventDefault(); keys.add(event.code); }
  if (['KeyE', 'Space'].includes(event.code)) { event.preventDefault(); if (!event.repeat) { game.interact(); updateUI(); } }
  if (event.code === 'Escape' && game.state.started) pause(!game.state.paused);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); if (game.state.started && !guide.open && !finish.open) pause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state.started) pause(true); });
let previous = 0, keyboardClock = 0, renderClock = 0;
function frame(now) {
  const dt = previous ? Math.min((now - previous) / 1000, .1) : 0; previous = now;
  const s = game.state; keyboardClock += dt; renderClock += dt;
  if (!s.paused && s.started && keys.size && keyboardClock > .16) {
    keyboardClock = 0; const [dc, dr] = directions[[...keys][0]], target = { c: s.player.c + dc, r: s.player.r + dr };
    if (land(target.c, target.r, s.built)) game.walkTo(target);
  }
  game.tick(dt);
  // 30 fps is plenty for this illustrated world and keeps software rendering light.
  if (renderClock > 1 / 30) { world.draw(s); updateUI(); renderClock = 0; }
  requestAnimationFrame(frame);
}
reset(); welcome.showModal(); requestAnimationFrame(frame);
