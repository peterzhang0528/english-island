import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readGameFile, parseGameScript, ts } from './helpers/source.mjs';

const storyChapters = JSON.parse(readGameFile('story-chapters.json'));
const catalogSource = readFileSync(new URL('../lib/chapters.ts', import.meta.url), 'utf8');
const catalogCode = ts.transpileModule(catalogSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
const exports = {};
vm.runInNewContext(catalogCode, {exports, require(specifier) {assert.equal(specifier, '../public/game/story-chapters.json'); return storyChapters;}});
const {chapters, chapterNumbers, dayNames, isLevel, gamePath} = exports;

test('all ten chapters are reachable with unique titles and six progress nodes', () => {
  assert.deepEqual(Array.from(chapterNumbers), Array.from({length:10},(_,i)=>i+1));
  assert.equal(new Set(chapterNumbers.map(id=>chapters[id].title)).size,10);
  for(const id of chapterNumbers){
    assert.equal(isLevel(id),true);
    assert.equal(chapters[id].steps.length,6);
    assert.match(dayNames[id],/^第.+天$/);
    const route=gamePath(id);
    if(id===1)assert.equal(route,'/game/index.html');
    else if(id<=3)assert.equal(route,`/game/day${id}.html`);
    else assert.equal(route,`/game/story.html?level=${id}`);
  }
  for(const value of [0,-1,11,3.5,'4',null,NaN,Infinity])assert.equal(isLevel(value),false);
});

test('chapters four through ten have a complete bilingual story and ordered task contract', () => {
  assert.deepEqual(storyChapters.map(c=>c.id),[4,5,6,7,8,9,10]);
  for(const chapter of storyChapters){
    assert.equal(chapter.stages.length,5,`Chapter ${chapter.id}`);
    assert.equal(new Set(chapter.stages.map(s=>s.id)).size,5);
    assert.ok(chapter.recap.trim());
    assert.ok(chapter.reward.name.trim());
    assert.ok(chapter.reward.description.trim());
    const vocabulary=new Map(chapter.coreWords.map(w=>[w.en,w.zh]));
    assert.equal(vocabulary.size,chapter.coreWords.length,'Vocabulary must be unique');
    for(const stage of chapter.stages){
      assert.match(stage.id,/^[a-z]+$/);
      assert.ok(stage.label.trim());
      assert.ok(vocabulary.has(stage.word),`Missing translation for ${stage.word}`);
    }
    const lines=[chapter.opening,...chapter.stages.flatMap(s=>[s.instruction,s.result]),chapter.ending,chapter.next];
    assert.equal(lines.length,13);
    for(const line of lines){
      assert.ok(typeof line.en==='string'&&line.en.trim(),'Narration must contain English');
      assert.match(line.zh,/[\u3400-\u9fff]/u,'Narration must contain its Chinese subtitle');
    }
  }
});

test('every story phrase and exploration word uses a registered recording', () => {
  const manifest=JSON.parse(readGameFile('audio/voice.json'));
  const missing=new Set();
  for(const chapter of storyChapters){
    const phrases=[chapter.opening,...chapter.stages.flatMap(s=>[s.instruction,s.result]),chapter.ending,chapter.next];
    for(const text of [...phrases.map(p=>p.en),...chapter.coreWords.map(w=>w.en)]){
      if(!manifest[text.trim().toLowerCase()])missing.add(text);
    }
  }
  const script=parseGameScript('js/world-story.js');
  const base=vm.runInNewContext(`${script.declaration('baseWords')}\nbaseWords;`);
  for(const word of Object.keys(base))if(!manifest[word.toLowerCase()])missing.add(word);
  assert.deepEqual([...missing],[], 'Missing audio must be supplied before the story is submitted');
});
