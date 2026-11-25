import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMission, applyCommand, interact, commandIntent, quickCommands } from '../public/game/js/rescue-rules.js';

test('rescue requires cooperation, the observed signal, and a correctly aimed beacon',()=>{
  const s=createMission();
  interact(s,'tower','blue');interact(s,'power');applyCommand(s,'Mia, hold the switch');
  assert.equal(s.stage,0);assert.equal(s.power,false);assert.equal(s.holding,false);
  applyCommand(s,'Mia, can you fix the bridge?');assert.equal(s.stage,1);
  interact(s,'power');assert.equal(s.power,false,'player cannot power it alone');
  applyCommand(s,'Mia, hold the switch.');assert.equal(s.holding,true);
  interact(s,'power');assert.equal(s.stage,2);
  for(const color of ['blue','amber','blue'])interact(s,'tower',color);
  assert.equal(s.stage,2,'must ask the scout for information first');
  applyCommand(s,'Leo, what’s the signal?');assert.equal(s.signalKnown,true);
  interact(s,'tower','blue');interact(s,'tower','blue');assert.deepEqual(s.code,[],'wrong pattern is retryable');
  for(const color of ['blue','amber','blue'])interact(s,'tower',color);
  assert.equal(s.stage,3);interact(s,'tower');assert.equal(s.rescued,false,'must aim first');
  applyCommand(s,'Aim right');applyCommand(s,'Aim right');assert.equal(s.bearing,0);
  assert.equal(interact(s,'tower').event,'rescued');assert.equal(s.stage,4);assert.equal(s.rescued,true);
});
test('repeated and out-of-order actions do not skip stages or undo progress',()=>{
  const s=createMission();applyCommand(s,'what’s the signal?');applyCommand(s,'Aim right');assert.equal(s.stage,0);
  applyCommand(s,'Repair the bridge');applyCommand(s,'Repair the bridge');assert.equal(s.stage,1);
  applyCommand(s,'Hold the switch');interact(s,'power');applyCommand(s,'Repair the bridge');assert.equal(s.stage,2);
  interact(s,'power');assert.equal(s.stage,2);assert.equal(s.power,true);
});
test('intent matching accepts natural English but not negative instructions or arbitrary text',()=>{
  for(const s of ['Mia, can you fix the bridge?','Please repair it.'])assert.equal(commandIntent(s),'bridge');
  for(const s of ['Don’t fix the bridge','Do not repair it','I cannot repair the bridge','Never hold the switch','hello','<script>win()</script>'])assert.equal(commandIntent(s),'chat');
  assert.equal(commandIntent('Keep the switch down, please.'),'hold');
  assert.equal(commandIntent('What is the signal?'),'signal');assert.equal(commandIntent('Turn the beam right.'),'right');
});
test('fresh runs are isolated; all stages have recovery commands',()=>{
  const a=createMission(),b=createMission();applyCommand(a,'fix the bridge');assert.equal(b.bridge,false);
  a.code.push('blue');assert.deepEqual(b.code,[]);
  for(let stage=0;stage<4;stage++)assert.ok(quickCommands({...b,stage}).length>0);
});
