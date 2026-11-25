import { createMission, applyCommand, interact, quickCommands, OBJECTIVES, hints } from './rescue-rules.js';
import { voice } from './voice.js';
import { sfx } from './sfx.js';

const $ = selector => document.querySelector(selector);
const state = createMission();
let world = null, started = false, paused = false, translated = false, aiAvailable = false, pending = false, sound = true, fallbackStation = 'bridge';
let lineId = 0, generation = 0, requestController = null, arrivalTime = 0;
let aiProvider = '', localSpeech = false;
const radioHistory = [];
const connectedLabel = () => `${aiProvider==='local'?'Local AI':'Live AI'} replies · mission actions simulated locally`;
const dialogs = ['#briefing','#guide','#debrief'];
const isPaused = () => !started || paused || dialogs.some(id=>$(id).open) || document.hidden;

function line(who, text, zh = '', source = 'mission') {
  if(['you','mia','leo'].includes(who)){radioHistory.push({who,text:text.slice(0,240)});if(radioHistory.length>7)radioHistory.shift();}
  const li=document.createElement('li');li.className=who==='you'?'player':who==='radio'?'system':'';
  const meta=document.createElement('div');meta.className='message-meta';
  const name=document.createElement('span');name.textContent={mia:'Mia',leo:'Leo',you:'You',radio:'Radio'}[who]||who;meta.append(name);
  const badge=document.createElement('small');badge.textContent=source==='ai'?'LIVE AI':who==='you'?'TEAM LEAD':who==='radio'?'STATUS':'MISSION';meta.append(badge);
  if(who==='mia'||who==='leo'){
    const replay=document.createElement('button');replay.type='button';replay.className='replay';replay.textContent='▷';replay.setAttribute('aria-label',`Replay ${name.textContent}’s message`);
    replay.onclick=()=>{if(sound){sfx.unlock();void voice.say(text,{interrupt:true});}};meta.append(replay);
  }
  li.append(meta);const p=document.createElement('p');p.textContent=text;li.append(p);
  if(zh){const sub=document.createElement('p');sub.className='translation';sub.lang='zh-CN';sub.textContent=zh;sub.hidden=!translated;li.append(sub);}
  li.dataset.line=String(++lineId);$('#messages').append(li);
  while($('#messages').children.length>36)$('#messages').firstElementChild.remove();
  $('#messages').scrollTop=$('#messages').scrollHeight;
  if(started&&sound&&(who==='mia'||who==='leo')&&!isPaused())void voice.say(text);
}

function update() {
  $('#objective-number').textContent=state.rescued?'04 / 04':`0${state.stage+1} / 04`;
  $('#objective-title').textContent=state.rescued?'Everyone’s home.':OBJECTIVES[state.stage];
  $('#progress').querySelectorAll('li').forEach((li,i)=>{li.classList.toggle('done',i<state.stage);li.classList.toggle('active',i===state.stage);if(i===state.stage)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
  $('#mia-state').textContent=state.power?'Power online':state.holding?'Holding switch':state.bridge?'Bridge repaired':'Standing by';
  $('#leo-state').textContent=state.rescued?'Crew safe':state.signalKnown?'Signal spotted':'On lookout';
  $('#quick-commands').replaceChildren();
  for(const command of quickCommands(state)){
    const button=document.createElement('button');button.type='button';button.textContent=command;
    button.onclick=()=>sendCommand(command);$('#quick-commands').append(button);
  }
  if(state.stage===2&&state.signalKnown){
    $('#proximity').textContent=`Signal sent: ${state.code.length?state.code.join(' · '):'—'} / 3 flashes`;
  }
  updateAction();
}

function updateAction(){
  const station=world?world.station:fallbackStation;
  const label=!station?'Move to an objective':station==='bridge'?state.bridge?'Bridge repaired':'Inspect bridge':station==='power'?state.power?'Check generator':'Turn the crank':state.stage===3?'Guide the boat home':state.stage===2?'Check signal panel':'Inspect lighthouse';
  $('#action-label').textContent=label;
  $('#interact').disabled=isPaused()||state.rescued;
  if(!(state.stage===2&&state.signalKnown))$('#proximity').textContent=station?`At the ${station==='power'?'power station':station==='tower'?'lighthouse':'bridge'}. Your squad is ready.`:'Use W A S D, or choose a location below.';
}

function result(reply){
  line(reply.who,reply.text,reply.zh);
  if(reply.event==='bridge')line('leo','Nice repair! I’ll cross first. Meet you at the generator.','修得不错！我先过去，在发电机那里会合。');
  if(reply.event==='hold')line('leo','Mia’s got the switch. Captain, the crank is yours!','Mia 按住了开关。队长，摇柄交给你！');
  if(reply.event==='power')line('leo','I’m heading to the lookout. Ask me for the signal!','我去观察点。问我信号吧！');
  if(reply.event==='rescued'){
    line('leo','We did it! Same squad next time?','我们做到了！下次还一起组队？');
    try{localStorage.setItem('island-rescue-completed','true');}catch{}
    $('#command-count').textContent=String(state.calls);
  }
  update();
}

async function liveReply(text){
  if(!aiAvailable||pending||isPaused()||state.rescued)return;
  pending=true;const gen=generation, stage=state.stage;requestController=new AbortController();
  const timeout=setTimeout(()=>requestController?.abort(),aiProvider==='local'?60000:20000);
  $('#mode-note').textContent='AI radio · squad is replying…';
  try{
    const payload={message:text,stage:Math.min(stage,3)};
    if(aiProvider==='local')payload.history=radioHistory.slice(0,-1);
    const response=await fetch('/api/rescue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:requestController.signal});
    if(!response.ok)throw Error('radio unavailable');const data=await response.json();
    if(gen!==generation||!started||state.rescued)return;
    if(stage!==state.stage){$('#mode-note').textContent=connectedLabel();return;}
    if(!Array.isArray(data.lines)||data.lines.length!==2||data.lines.some(l=>!['mia','leo'].includes(l.who)||typeof l.text!=='string'||l.text.length>240))throw Error('invalid reply');
    for(const reply of data.lines)line(reply.who,reply.text,'','ai');
    $('#mode-note').textContent=connectedLabel();
  }catch{
    if(gen!==generation)return;
    $('#mode-note').textContent='AI radio unavailable · mission simulator still works';
    line('radio','AI radio could not reply. Your mission and squad commands still work.');
    const hint=hints(state);line(hint.who,hint.text,hint.zh);
  }finally{clearTimeout(timeout);if(gen===generation){pending=false;requestController=null;}}
}

function sendCommand(text){
  if(isPaused()||state.rescued||!text.trim())return;
  text=text.trim().slice(0,180);line('you',text);$('#command').value='';
  if(/^(blue|amber)$/i.test(text)&&state.stage===2&&state.signalKnown){
    const station=world?world.station:fallbackStation;
    if(station!=='tower'){line('leo','Use the signal panel at the lighthouse. I’ll keep watching the boat.','去灯塔的信号控制台，我会继续盯着船。');return;}
    result(interact(state,'tower',text.toLowerCase()));return;
  }
  const reply=applyCommand(state,text);
  if(reply.chat&&aiAvailable&&!pending){void liveReply(text);update();return;}
  if(reply.chat){
    if(/\b(hello|hi|hey)\b/i.test(text))reply.text='Hey, captain! Ready for a rescue? '+reply.text;
    else if(/\b(thanks|thank|nice|great)\b/i.test(text))reply.text='We’ve got your back! '+reply.text;
  }
  result(reply);
}

function action(){
  if(isPaused()||state.rescued)return;
  const station=world?world.station:fallbackStation;
  if(!station){line('radio','Move closer, or use a location button to reach the objective.');return;}
  result(interact(state,station));
}

function syncPause(){
  world?.clearKeys();voice.setPaused(isPaused());sfx.paused=isPaused();
  $('#paused').hidden=!paused;$('#pause').setAttribute('aria-pressed',String(paused));$('#pause').textContent=paused?'▶ Resume':'Ⅱ Pause';updateAction();
}

$('#command-form').onsubmit=e=>{e.preventDefault();sendCommand($('#command').value);};
$('#interact').onclick=action;
document.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{
  if(isPaused()||state.rescued)return;const station=button.dataset.go;
  if(station!=='bridge'&&!state.bridge){line('leo','The gap is too wide! Let’s repair the bridge first.','缺口太大了！先修桥吧。');return;}
  fallbackStation=station;world?.go(station);$('#world').focus({preventScroll:true});updateAction();
});
sound=!sfx.muted;$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(!sound));
$('#sound').onclick=()=>{sound=!sound;sfx.unlock();sfx.muted=!sound;if(!sound)voice.stop();$('#sound').textContent=sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(!sound));};
$('#translation').onclick=()=>{translated=!translated;$('#translation').setAttribute('aria-pressed',String(translated));$('#translation').textContent=translated?'Hide 中文':'中文提示';document.querySelectorAll('.translation').forEach(el=>el.hidden=!translated);};
$('#pause').onclick=()=>{paused=!paused;syncPause();};
$('#help').onclick=()=>{$('#guide').showModal();syncPause();};
$('#close-guide').onclick=()=>$('#guide').close();
$('#guide').addEventListener('close',syncPause);
$('#briefing').addEventListener('cancel',e=>e.preventDefault());
$('#debrief').addEventListener('cancel',e=>e.preventDefault());
$('#start').onclick=()=>{
  started=true;sfx.unlock();$('#briefing').close();syncPause();
  line('leo','Mayday! A boat’s lost in the fog. Three people aboard.','求救！一艘船在雾里迷路了，船上有三个人。');
  line('mia','The lighthouse has no power. I’ve got tools — you call the shots.','灯塔没电了。我带了工具——你来指挥。');
  line('leo','First problem: that bridge. Mia, you brought the planks, right?','第一个问题：这座桥。Mia，你带木板了吧？');
  update();$('#world').focus();
};
$('#again').onclick=()=>{
  generation++;requestController?.abort();voice.stop();location.reload();
};
window.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName))return;
  const key=e.key.toLowerCase();
  if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','e'].includes(key)){
    e.preventDefault();if(isPaused())return;
    if((key==='e'||key===' ')&&!e.repeat)action();else world?.keys.add(key);
  }
});
window.addEventListener('keyup',e=>world?.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>world?.clearKeys());
document.addEventListener('visibilitychange',syncPause);
window.addEventListener('pagehide',()=>{generation++;requestController?.abort();voice.stop();world?.destroy();});

try{const {createRescueWorld}=await import('./rescue-world.js');world=createRescueWorld($('#world'),state);}catch(error){console.error('Rescue view unavailable',error);$('#world-error').hidden=false;}
$('#loading').hidden=true;$('#briefing').showModal();update();
let last=performance.now();
function frame(now){
  if(now-last<1000/30){requestAnimationFrame(frame);return;}
  const dt=Math.min(.05,(now-last)/1000);last=now;world?.tick(dt,isPaused());
  if(started&&!isPaused()){
    updateAction();
    // Wait for actual arrival, not wall-clock time: slow devices must see the
    // boat reach the jetty before a modal pauses the simulation.
    if(state.rescued&&(world?.rescueArrived||!world)){
      arrivalTime+=dt;
      if(arrivalTime>.8){voice.stop();$('#debrief').showModal();syncPause();}
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try{
  const response=await fetch('/api/rescue',{signal:AbortSignal.timeout(5000)});const data=response.ok?await response.json():null;aiAvailable=data?.available===true;
  if(aiAvailable){aiProvider=data.provider==='local'?'local':'openai';
    localSpeech=aiProvider==='local'&&data.speech===true;
    if(localSpeech)voice.setSpeechProvider(async text=>{
      const response=await fetch('/api/rescue/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('voice unavailable');return sfx.ctx?.decodeAudioData(await response.arrayBuffer())??null;
    });
  }
}catch{}
$('#mode-note').textContent=aiAvailable?connectedLabel():'Mission simulator · authored English squad dialogue';
if(aiAvailable)$('#briefing-mode').textContent=aiProvider==='local'?`Local AI radio connected. Type freely in English: Mia and Leo respond using a model on this preview VM, with recent radio context. No cloud model or microphone. ${localSpeech?'Local neural speech uses one shared English voice.':'Voice uses the shared narration fallback.'} Mission actions still use squad commands.`:'AI radio connected. Type in English to get live teammate replies. Mission actions run locally. Text is sent to OpenAI; no microphone is used. Voice uses the shared narration fallback.';
