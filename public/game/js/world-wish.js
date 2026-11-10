import { validateWishPlan, isWishAnswerCorrect } from './wish-contract.js';
import { createWishWorld } from './wish-world.js';
import { voice } from './voice.js';
import { sfx } from './sfx.js';

export const WISH_TASK_LABELS = { find: '寻找目标', say: '练习英语', riddle: '解开谜语' };

// The controller owns conversation and task state. Rendering, requests and audio are boundaries.
export function createWishController({ request, world, onChange = () => {}, pauseAudio = () => {}, validate = validateWishPlan, correct = isWishAnswerCorrect }) {
  const state = { phase: 'chat', available: null, checking: true, draft: '', history: [], plan: null, source: null,
    questIndex: 0, done: [], words: [], feedback: '', error: '', hint: false, discovery: '',
    generating: false, busy: false, paused: false, renderReady: false };
  const reasons = new Set(); let generation = 0, playEpoch = 0, pending = null, disposed = false;
  const emit = () => { if (!disposed) onChange(state); };
  const currentQuest = () => state.plan?.quests[state.questIndex] || null;
  function setDraft(value) { state.draft = String(value).slice(0, 280); emit(); }
  function availability(value, failed = false) { state.available = value; state.checking = false; state.connectionFailed = failed; emit(); }
  function cancelGeneration(notify = true) { generation++; pending?.abort(); pending = null; state.generating = false; if (notify) emit(); }
  function loadWorld() {
    if (!state.plan) return false;
    try {
      world.load(state.plan);
      for (const id of state.done) { const quest = state.plan.quests.find(item => item.id === id); if (quest) world.complete(quest.targetId); }
      world.setPaused(state.paused);
      world.focus(state.phase === 'play' ? currentQuest()?.targetId : null);
      state.renderReady = true; state.error = ''; return true;
    } catch { state.renderReady = false; state.error = '地图暂时没能显示。你的愿望还在，点地图中的按钮再试一次。'; return false; }
  }
  function applyPlan(plan, source) {
    if (!['ai', 'example'].includes(source) || !validate(plan).ok) throw new Error('Invalid wish plan');
    playEpoch++; state.plan = plan; state.source = source; state.phase = 'preview';
    state.questIndex = 0; state.done = []; state.words = []; state.feedback = ''; state.hint = false; state.discovery = '';
    loadWorld(); emit();
  }
  async function generate(message = state.draft) {
    if (disposed || state.paused || state.phase === 'play') return false;
    const raw = String(message).trim(), text = raw.replace(/\s+/g, ' '); state.draft = String(message).slice(0, 280);
    if (!text || raw.length > 280) { state.error = '写下 1–280 个字的小愿望，就可以出发。'; emit(); return false; }
    if (state.available !== true) { state.error = 'AI伙伴还在准备中。你可以先试玩一张示例地图，愿望会留在这里。'; emit(); return false; }
    cancelGeneration(); const ticket = generation, abort = new AbortController(); pending = abort;
    state.generating = true; state.error = ''; emit();
    const body = { message: text, history: state.history.slice(-6).map(item => ({ role: item.role, content: item.content })) };
    if (state.plan) body.previousPlan = state.plan;
    const timer = setTimeout(() => abort.abort(), 45000);
    try {
      const result = await request(body, abort.signal);
      if (disposed || ticket !== generation) return false;
      if (result?.source !== 'ai' || !validate(result.plan).ok) throw new Error('Invalid AI response');
      state.history = [...state.history, { role: 'user', content: text }, { role: 'assistant', content: `${result.plan.reply.zh} ${result.plan.reply.en}`.slice(0, 480) }].slice(-6);
      state.generating = false; pending = null; applyPlan(result.plan, 'ai'); return true;
    } catch (error) {
      if (disposed || ticket !== generation) return false;
      const messages = {
        RATE_LIMITED: 'K 正在画许多小愿望。等一分钟再试，你的文字和上一张地图都还在。',
        AI_REFUSED: '换一个轻松友好的冒险愿望，再告诉 K 吧。你写下的文字还在。',
        INVALID_REQUEST: '把愿望写成一句普通的话（280 字以内），再试一次吧。',
        AI_TIMEOUT: 'K 想得有点久。愿望还在，可以再试一次。',
      };
      state.error = error?.name === 'AbortError' ? messages.AI_TIMEOUT : typeof error?.code === 'string' && Object.hasOwn(messages, error.code) ? messages[error.code] : '这次没有接上 K。你的文字和上一张地图都还在，请稍后再试。';
      return false;
    } finally {
      clearTimeout(timer);
      if (!disposed && ticket === generation) { state.generating = false; pending = null; emit(); }
    }
  }
  function useExample(plan) {
    if (disposed || state.phase === 'play') return false;
    cancelGeneration(); applyPlan(plan, 'example'); return true;
  }
  function start() {
    if (disposed || state.paused || state.generating || state.busy || !state.plan || !state.renderReady || state.phase === 'play') return false;
    playEpoch++; state.phase = 'play'; state.questIndex = 0; state.done = []; state.words = []; state.feedback = ''; state.error = ''; state.hint = false; state.discovery = '';
    if (!loadWorld()) { state.phase = 'preview'; emit(); return false; }
    world.focus(currentQuest().targetId); emit(); return true;
  }
  function learn(object) {
    if (!state.words.includes(object.word)) state.words.push(object.word);
    state.discovery = `${object.word} · ${object.labelZh}`;
  }
  async function finishQuest() {
    const quest = currentQuest();
    if (disposed || state.paused || state.busy || state.phase !== 'play' || !state.renderReady || !quest || state.done.includes(quest.id)) return false;
    const ticket = playEpoch; state.busy = true; state.feedback = ''; emit();
    try {
      // More than one learning task may use the same object; its visual completion is idempotent.
      await world.complete(quest.targetId);
      if (disposed || ticket !== playEpoch) return false;
      const object = state.plan.objects.find(item => item.id === quest.targetId); learn(object);
      state.done.push(quest.id); state.questIndex++; state.hint = false;
      state.feedback = '找到了！又多了一个小发现。';
      if (state.questIndex === state.plan.quests.length) { state.phase = 'complete'; world.focus(null); }
      else world.focus(currentQuest().targetId);
      return true;
    } catch { if (ticket === playEpoch) state.feedback = '刚才这一步没有走完，再试一次就好。'; return false; }
    finally { if (!disposed && ticket === playEpoch) { state.busy = false; emit(); } }
  }
  async function select(id) {
    if (disposed || state.paused || state.busy || state.phase !== 'play' || !state.renderReady) return false;
    const object = state.plan.objects.find(item => item.id === id); if (!object) return false;
    const quest = currentQuest();
    if (quest.kind === 'find' && id === quest.targetId) return finishQuest();
    learn(object);
    state.feedback = quest.kind === 'find' ? `你发现了 ${object.word}。再找找当前提示里的伙伴吧。` : '发现的新词装进口袋了。读读提示，再输入你的答案吧。';
    emit(); return false;
  }
  async function answer(input) {
    const quest = currentQuest();
    if (disposed || state.paused || state.busy || state.phase !== 'play' || !state.renderReady || !quest || quest.kind === 'find') return false;
    if (!correct(quest, input)) { state.feedback = '再试一次就好。可以看看提示，慢慢想。'; emit(); return false; }
    return finishQuest();
  }
  function hint() { if (state.phase !== 'play' || state.paused) return; state.hint = true; emit(); }
  function enterChat(confirmed = false) {
    if (state.phase === 'play' && !confirmed) return false;
    cancelGeneration(); playEpoch++; state.busy = false; state.phase = 'chat'; state.done = []; state.words = [];
    state.questIndex = 0; state.feedback = ''; state.hint = false; state.discovery = '';
    if (state.plan) loadWorld(); emit(); return true;
  }
  function restart() {
    if (disposed) return false;
    // Parent confirmation pauses first. Reset now, but keep every pause reason and wait for Play.
    cancelGeneration(false); playEpoch++; state.busy = false; state.phase = state.plan ? 'preview' : 'chat';
    state.questIndex = 0; state.done = []; state.words = []; state.feedback = ''; state.error = ''; state.hint = false; state.discovery = '';
    if (state.plan) loadWorld(); emit(); return true;
  }
  function setPaused(value, reason = 'external') {
    if (value) reasons.add(reason); else reasons.delete(reason);
    const next = reasons.size > 0; if (next === state.paused) return;
    state.paused = next; world.setPaused(next); pauseAudio(next); emit();
  }
  function retryMap() { if (disposed || state.busy || state.generating) return false; const result = loadWorld(); emit(); return result; }
  function worldError() { state.renderReady = false; state.error = '地图暂时停住了。你的愿望还在，可以重试地图。'; emit(); }
  function dispose() { if (disposed) return; cancelGeneration(); disposed = true; playEpoch++; world.dispose(); }
  return { state, setDraft, availability, generate, cancelGeneration, useExample, start, select, answer, hint, enterChat, restart, setPaused, retryMap, worldError, dispose, currentQuest };
}

export async function initWishUI() {
  const $ = selector => document.querySelector(selector), app = $('#wish-app'), canvas = $('#wish-world');
  const ui = { message: $('#wish-message'), history: $('#chat-history'), answer: $('#quest-answer'), scroll: $('#companion-scroll') };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer = null, controller, lastStatus = '', lastHistory = '', lastPreview = null, lastQuest = '', lastPhase = '', lastPocket = '', lastDiscovery = '', discoveryTimer, voiceReady = false, checkTicket = 0, confirmation = null;
  const modalReasons = new Map([['#help-dialog', 'help'], ['#examples-dialog', 'examples'], ['#confirm-dialog', 'confirm']]);
  function makeWorld() {
    renderer = createWishWorld(canvas, { onSelect: id => void controller.select(id), onError: () => controller?.worldError() });
    return renderer;
  }
  const world = {
    load(plan) { try { return (renderer || makeWorld()).load(plan); } catch (error) { renderer?.dispose(); renderer = null; throw error; } },
    focus(id) { return renderer?.focus(id); }, complete(id) { if (!renderer) throw new Error('Map is unavailable'); return renderer.complete(id); },
    setPaused(value) { renderer?.setPaused(value); }, dispose() { renderer?.dispose(); renderer = null; },
  };
  async function request(body, signal) {
    const response = await fetch('/api/wish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!response.ok) {
      const error = new Error('K is unavailable');
      try { error.code = (await response.json())?.error?.code; } catch {}
      throw error;
    }
    return response.json();
  }
  const sourceText = state => state.source === 'example' ? '示例地图 · 非实时 AI 生成' : 'AI 愿望地图';
  function speaker(word) {
    if (!voiceReady || !voice.has(word)) return null;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '听单词 ♫'; button.setAttribute('aria-label', `听 ${word}`); button.disabled = controller.state.paused;
    button.addEventListener('click', () => { if (!controller.state.paused && voice.has(word)) { sfx.unlock(); void voice.say(word, { interrupt: true }); } }); return button;
  }
  function focusTask() {
    const state = controller.state;
    if (state.phase === 'play') {
      $('#quest-title').focus({ preventScroll: true });
      if (matchMedia('(max-width:650px)').matches) $(controller.currentQuest().kind === 'find' ? '.map-pane' : '#quest-panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    } else if (state.phase === 'complete') { $('#complete-title').focus({ preventScroll: true }); $('#complete-panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  }
  function report(state) {
    const data = { type: 'island-status', level: 10, mode: 'wish', ready: true,
      step: state.phase === 'play' ? state.questIndex + 1 : state.phase === 'complete' ? 4 : 0,
      words: [...state.words], muted: sfx.muted, busy: state.generating || state.busy, completed: false,
      bonusCompleted: state.phase === 'complete', paused: state.paused,
      steps: ['说出愿望', ...(state.plan ? state.plan.quests.map(quest => WISH_TASK_LABELS[quest.kind]) : ['寻找目标', '练习英语', '解开谜语'])] };
    const json = JSON.stringify(data); if (json !== lastStatus) { lastStatus = json; parent.postMessage(data, location.origin); }
  }
  function render(state) {
    app.dataset.phase = state.phase;
    $('#conversation-panel').hidden = state.phase === 'play' || state.phase === 'complete';
    $('#quest-panel').hidden = state.phase !== 'play'; $('#complete-panel').hidden = state.phase !== 'complete';
    $('#wish-error').hidden = !state.error; $('#wish-error').textContent = state.error;
    if (ui.message.value !== state.draft) ui.message.value = state.draft;
    $('#message-count').textContent = `${state.draft.length} / 280`;
    $('#wish-generate').disabled = state.available !== true || state.generating || state.paused || !state.draft.trim();
    $('#wish-generate').textContent = state.generating ? 'K 正在画出你的愿望…' : state.plan ? '把这个想法告诉 K ↗' : '和 K 一起造地图 ↗';
    $('#wish-cancel').hidden = !state.generating;
    $('#connection-note').hidden = state.available === true;
    $('#connection-text').textContent = state.checking ? 'K 正在准备画纸…' : state.connectionFailed ? '暂时没连上 K，你的愿望可以先留在这里。' : 'AI伙伴还在准备中';
    $('#check-connection').hidden = state.checking || state.available === true;
    const historyKey = JSON.stringify(state.history);
    if (historyKey !== lastHistory) {
      lastHistory = historyKey; ui.history.replaceChildren();
      for (const item of state.history) { const li = document.createElement('li'), name = document.createElement('b'), text = document.createElement('p'); li.dataset.role = item.role; name.textContent = item.role === 'user' ? 'YOU · 你的小愿望' : 'K · 小岛造梦师'; text.textContent = item.content; li.append(name, text); ui.history.append(li); }
    }
    $('#map-placeholder').hidden = Boolean(state.plan); $('#map-caption').hidden = !state.plan;
    $('#map-retry').hidden = !state.plan || state.renderReady;
    $('#map-retry').disabled = state.paused || state.busy || state.generating;
    $('#plan-preview').hidden = !state.plan; $('#wish-play').disabled = !state.renderReady || state.generating || state.paused;
    if (state.plan) {
      for (const selector of ['#map-source', '#preview-source']) { $(selector).textContent = sourceText(state); $(selector).dataset.source = state.source; }
      $('#map-title').textContent = state.plan.title.zh; $('#map-goal').textContent = state.plan.goal.zh;
      $('#preview-title').textContent = state.plan.title.zh; $('#preview-goal').textContent = `${state.plan.goal.zh} ${state.plan.goal.en}`;
      if (lastPreview !== state.plan) { lastPreview = state.plan; $('#preview-quests').replaceChildren(); for (const quest of state.plan.quests) { const li = document.createElement('li'), body = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('span'); title.textContent = WISH_TASK_LABELS[quest.kind]; text.textContent = quest.prompt.zh; body.append(title, text); li.append(body); $('#preview-quests').append(li); } }
      $('#complete-en').textContent = state.plan.ending.en; $('#complete-zh').textContent = state.plan.ending.zh;
    }
    const quest = controller.currentQuest(), key = state.phase === 'play' ? `${state.plan.seed}:${quest?.id}:${state.questIndex}` : '';
    if (quest && state.phase === 'play') {
      $('#quest-progress').textContent = `${sourceText(state)} · 任务 ${state.questIndex + 1} / 3`;
      $('#quest-title').textContent = WISH_TASK_LABELS[quest.kind]; $('#quest-en').textContent = quest.prompt.en; $('#quest-zh').textContent = quest.prompt.zh;
      $('#map-goal').textContent = quest.prompt.zh;
      $('#quest-instruction').textContent = quest.kind === 'find' ? '点一下地图中的目标。也可以用下面的按钮帮助寻找。' : quest.kind === 'say' ? '可以先读出声，再输入这个英语词。这里不会录音。' : '输入你想到的英语词。答案就在这张地图里，答错也可以继续试。';
      $('#find-target').hidden = quest.kind !== 'find'; $('#find-target').disabled = state.paused || state.busy || !state.renderReady;
      $('#answer-form').hidden = quest.kind === 'find'; $('#check-answer').disabled = state.paused || state.busy || !state.renderReady;
      $('#answer-label').textContent = quest.kind === 'say' ? '读一读，再输入英语词' : '你的谜语答案（英语词）';
      $('#say-word').hidden = quest.kind !== 'say';
      if (key !== lastQuest || $('#say-word').dataset.paused !== String(state.paused) || $('#say-word').dataset.voice !== String(voiceReady)) {
        $('#say-word').replaceChildren(); const word = state.plan.objects.find(object => object.id === quest.targetId).word; const label = document.createElement('span'); label.textContent = word; $('#say-word').append(label); const button = speaker(word); if (button) $('#say-word').append(button);
        $('#say-word').dataset.paused = String(state.paused); $('#say-word').dataset.voice = String(voiceReady);
      }
      $('#hint-text').hidden = !state.hint; $('#hint-text').textContent = `${quest.hint.zh}\n${quest.hint.en}`; $('#quest-hint').disabled = state.paused;
      $('#quest-feedback').textContent = state.feedback;
      if (lastQuest !== key) ui.answer.value = '';
    }
    const pocketKey = `${state.words.join(',')}|${voiceReady}|${state.paused}`;
    if (pocketKey !== lastPocket) {
      lastPocket = pocketKey; $('#word-pocket').replaceChildren();
      for (const word of state.words) { const object = state.plan.objects.find(item => item.word === word), audio = speaker(word), chip = audio || document.createElement('span'); chip.textContent = `${word}${audio ? ' ♫' : ''}`; const translation = document.createElement('small'); translation.textContent = object?.labelZh || ''; chip.append(translation); $('#word-pocket').append(chip); }
    }
    $('#word-pocket').hidden = !state.words.length;
    const discoveryKey = `${state.questIndex}:${state.discovery}`;
    if (state.phase !== 'play') { clearTimeout(discoveryTimer); $('#map-discovery').hidden = true; }
    else if (discoveryKey !== lastDiscovery) { lastDiscovery = discoveryKey; clearTimeout(discoveryTimer); $('#map-discovery').hidden = !state.discovery; $('#map-discovery').textContent = state.discovery; if (state.discovery) discoveryTimer = setTimeout(() => { $('#map-discovery').hidden = true; }, 1500); }
    $('#wish-sound').setAttribute('aria-pressed', String(sfx.muted)); $('#wish-sound').setAttribute('aria-label', sfx.muted ? '打开声音' : '关闭声音'); $('#wish-sound').textContent = sfx.muted ? '声音：关' : '声音：开';
    report(state);
    const changedTask = key && lastQuest !== key, changedPhase = lastPhase !== state.phase; lastQuest = key; lastPhase = state.phase;
    if (changedTask || changedPhase && state.phase === 'complete') queueMicrotask(focusTask);
  }
  controller = createWishController({ request, world, onChange: render, pauseAudio(value) { sfx.paused = value; voice.setPaused(value); } });
  async function checkAvailability() {
    const ticket = ++checkTicket; controller.state.checking = true; render(controller.state);
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    try { const response = await fetch('/api/wish', { signal: abort.signal }); const result = response.ok ? await response.json() : null; if (ticket === checkTicket) controller.availability(result?.available === true, !result); }
    catch { if (ticket === checkTicket) controller.availability(false, true); }
    finally { clearTimeout(timer); }
  }
  function openModal(selector) { const dialog = $(selector); controller.setPaused(true, modalReasons.get(selector)); if (!dialog.open) dialog.showModal(); }
  for (const [selector, reason] of modalReasons) {
    const dialog = $(selector); dialog.addEventListener('close', () => { controller.setPaused(false, reason); if (selector === '#confirm-dialog') confirmation = null; });
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); });
  }
  function confirmChange(action, exit = false) {
    if (controller.state.phase !== 'play') { action(); return; }
    confirmation = action; $('#confirm-title').textContent = exit ? '回到小岛庆典？' : '换一个小愿望？'; $('#confirm-description').textContent = exit ? '这张地图的当前任务会结束。' : '这张地图的任务会从头开始；你写下的愿望和对话会保留。'; $('#confirm-accept').textContent = exit ? '回到庆典' : '换个想法'; openModal('#confirm-dialog'); $('#confirm-cancel').focus();
  }
  function enterConversation() { controller.enterChat(true); ui.message.focus({ preventScroll: true }); $('#wish-form').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }
  function exit() { controller.cancelGeneration(); voice.stop(); if (parent !== window) parent.postMessage({ type: 'island-wish-close' }, location.origin); else location.href = './story.html?level=10'; }
  function mute() { sfx.muted = !sfx.muted; if (sfx.muted) voice.stop(); render(controller.state); }
  function act() { if (controller.state.paused) return; if (controller.state.phase === 'preview') controller.start(); else if (controller.state.phase === 'play') { const quest = controller.currentQuest(); if (quest.kind === 'find') void controller.select(quest.targetId); else ui.answer.focus(); } else if (controller.state.phase === 'complete') enterConversation(); else ui.message.focus(); }
  ui.message.addEventListener('input', () => controller.setDraft(ui.message.value));
  $('#wish-form').addEventListener('submit', event => { event.preventDefault(); void controller.generate(ui.message.value); });
  $('#wish-cancel').addEventListener('click', () => controller.cancelGeneration()); $('#check-connection').addEventListener('click', () => void checkAvailability());
  $('#wish-play').addEventListener('click', () => { sfx.unlock(); controller.start(); });
  $('#find-target').addEventListener('click', () => void controller.select(controller.currentQuest()?.targetId));
  $('#answer-form').addEventListener('submit', event => { event.preventDefault(); void controller.answer(ui.answer.value); });
  ui.answer.addEventListener('focus', () => { app.dataset.typing = 'true'; }); ui.answer.addEventListener('blur', () => { app.dataset.typing = 'false'; });
  $('#quest-hint').addEventListener('click', () => controller.hint()); $('#change-idea').addEventListener('click', () => confirmChange(enterConversation)); $('#new-wish').addEventListener('click', enterConversation);
  $('#wish-exit').addEventListener('click', () => confirmChange(exit, true)); $('#complete-exit').addEventListener('click', exit); $('#wish-sound').addEventListener('click', mute);
  $('#wish-help').addEventListener('click', () => openModal('#help-dialog')); for (const id of ['#help-close', '#help-done']) $(id).addEventListener('click', () => $('#help-dialog').close());
  $('#confirm-cancel').addEventListener('click', () => $('#confirm-dialog').close()); $('#confirm-accept').addEventListener('click', () => { const action = confirmation; $('#confirm-dialog').close(); controller.setPaused(false, 'confirm'); confirmation = null; action?.(); });
  $('#examples-close').addEventListener('click', () => $('#examples-dialog').close());
  $('#map-retry').addEventListener('click', () => { const state = controller.state; if (state.paused || state.busy || state.generating) return; renderer?.dispose(); renderer = null; controller.retryMap(); });
  let examples = null;
  $('#show-examples').addEventListener('click', async () => {
    openModal('#examples-dialog'); $('#examples-error').textContent = '';
    try {
      if (!examples) { const response = await fetch(new URL('../wish-examples.json', import.meta.url)); if (!response.ok) throw new Error('Examples unavailable'); const data = await response.json(); if (!Array.isArray(data.examples)) throw new Error('Invalid examples'); examples = data.examples.filter(item => validateWishPlan(item.plan).ok); }
      $('#example-options').replaceChildren();
      for (const example of examples) { const button = document.createElement('button'), badge = document.createElement('small'), title = document.createElement('strong'), text = document.createElement('span'); button.type = 'button'; badge.textContent = '示例地图 · 非实时 AI 生成'; title.textContent = example.title.zh; text.textContent = example.description.zh; button.append(badge, title, text); button.addEventListener('click', () => { $('#examples-dialog').close(); controller.setPaused(false, 'examples'); controller.useExample(example.plan); $('#plan-preview').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); }); $('#example-options').append(button); }
      if (!examples.length) throw new Error('No valid examples');
    } catch { $('#examples-error').textContent = '示例地图暂时没有打开，请关闭后再试一次。'; examples = null; }
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'island-command') return;
    const command = event.data.command;
    if (command === 'start' || command === 'act') act(); if (command === 'help') { if ($('#help-dialog').open) $('#help-dialog').close(); else openModal('#help-dialog'); }
    if (command === 'mute') mute(); if (command === 'pause') controller.setPaused(true); if (command === 'resume') controller.setPaused(false);
    if (command === 'restart') controller.restart();
  });
  window.addEventListener('keydown', event => { if (event.defaultPrevented || event.repeat || event.key !== ' ' || document.querySelector('dialog[open]')) return; const element = document.activeElement; if (element?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(element?.tagName)) return; event.preventDefault(); act(); });
  document.addEventListener('visibilitychange', () => controller.setPaused(document.hidden, 'visibility'));
  window.addEventListener('pagehide', event => { controller.cancelGeneration(); voice.stop(); controller.setPaused(true, 'page'); if (!event.persisted) controller.dispose(); });
  window.addEventListener('pageshow', event => { if (event.persisted) controller.setPaused(false, 'page'); });
  void voice.ready.then(() => { voiceReady = true; render(controller.state); });
  render(controller.state); void checkAvailability();
  window.__wish = { controller, get renderer() { return renderer; }, get state() { return controller.state; } };
  return window.__wish;
}
