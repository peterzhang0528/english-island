/** Data-only map contract shared by the server, browser and Node tests. */
export const WISH_VERSION = 1;
export const OBJECT_WORDS = Object.freeze({ tree:'TREE', flower:'FLOWER', sheep:'SHEEP', boat:'BOAT', house:'HOUSE', bridge:'BRIDGE', lighthouse:'LIGHTHOUSE', cake:'CAKE', flag:'FLAG', stone:'STONE', key:'KEY', chest:'CHEST' });
export const BIOMES = Object.freeze(['forest','beach','snow','night','farm']);
export const WEATHER = Object.freeze(['clear','rain','stars']);
export const QUEST_KINDS = Object.freeze(['find','say','riddle']);
const safePattern = '^[^<>\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]+$';
const text = maxLength => ({ type:'string', minLength:1, maxLength, pattern:safePattern });
const id = {type:'string',pattern:'^[a-z][a-z0-9_]{0,23}$',maxLength:24};
const obj = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const bilingual = max => obj({en:text(max),zh:text(max)});
export const WISH_PLAN_SCHEMA = obj({
  version:{type:'integer',const:1}, seed:{type:'integer',minimum:0,maximum:2147483647},
  title:bilingual(60), reply:bilingual(240), biome:{type:'string',enum:BIOMES}, weather:{type:'string',enum:WEATHER}, goal:bilingual(120),
  objects:{type:'array',minItems:4,maxItems:8,items:obj({id,kind:{type:'string',enum:Object.keys(OBJECT_WORDS)},word:{type:'string',enum:Object.values(OBJECT_WORDS)},labelZh:text(24)})},
  quests:{type:'array',minItems:3,maxItems:3,items:obj({id,kind:{type:'string',enum:QUEST_KINDS},targetId:id,prompt:bilingual(180),hint:bilingual(140),answer:{type:'string',pattern:'^[A-Za-z]+$',minLength:1,maxLength:24}})},
  ending:bilingual(180),
});

function validateSchema(value, schema, path, errors) {
  if (errors.length >= 16) return;
  const fail = message => errors.push(`${path}: ${message}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return fail('expected plain object');
    const keys=Object.keys(value), allowed=Object.keys(schema.properties);
    for (const key of schema.required) if (!Object.hasOwn(value,key)) fail(`missing ${key}`);
    for (const key of keys) if (!allowed.includes(key)) fail(`unexpected ${key}`);
    for (const key of allowed) if (Object.hasOwn(value,key)) validateSchema(value[key],schema.properties[key],`${path}.${key}`,errors);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return fail('expected array');
    if (value.length < schema.minItems || value.length > schema.maxItems) return fail('invalid item count');
    value.forEach((item,index)=>validateSchema(item,schema.items,`${path}[${index}]`,errors));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return fail('expected string');
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || !value.trim()) fail('invalid text length');
    if (schema.pattern && !new RegExp(schema.pattern,'u').test(value)) fail('invalid text characters');
  } else if (schema.type === 'integer' && (!Number.isInteger(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('expected bounded integer');
  if (schema.enum && !schema.enum.includes(value)) fail('unexpected value');
  if ('const' in schema && schema.const !== value) fail('unexpected version');
}

export function validateWishPlan(value) {
  const errors=[]; validateSchema(value,WISH_PLAN_SCHEMA,'plan',errors);
  if (errors.length) return {ok:false,errors};
  const ids=new Set();
  for (const item of value.objects) {
    if (ids.has(item.id)) errors.push('objects: duplicate id');
    ids.add(item.id);
    if (OBJECT_WORDS[item.kind] !== item.word) errors.push('objects: word must match kind');
  }
  const questIds=new Set(), kinds=new Set();
  for (const quest of value.quests) {
    if (questIds.has(quest.id)) errors.push('quests: duplicate id');
    questIds.add(quest.id); kinds.add(quest.kind);
    const target=value.objects.find(item=>item.id===quest.targetId);
    if (!target) errors.push('quests: target does not exist');
    else if (quest.answer.toUpperCase() !== target.word) errors.push('quests: answer must be target English word');
  }
  if (kinds.size !== 3) errors.push('quests: require one find, one say and one riddle');
  return errors.length ? {ok:false,errors} : {ok:true,plan:value};
}

export function validateWishRequest(value) {
  const errors=[];
  if (!value || typeof value!=='object' || Array.isArray(value)) return {ok:false,errors:['request: expected object']};
  const keys=Object.keys(value);
  if (keys.some(k=>!['message','history','previousPlan'].includes(k))) errors.push('request: unexpected field');
  validateSchema(value.message,text(280),'message',errors);
  validateSchema(value.history,{type:'array',minItems:0,maxItems:6,items:obj({role:{type:'string',enum:['user','assistant']},content:text(480)})},'history',errors);
  if (Object.hasOwn(value,'previousPlan')) { const previous=validateWishPlan(value.previousPlan); if (!previous.ok) errors.push('previousPlan: invalid plan'); }
  return errors.length ? {ok:false,errors} : {ok:true,value};
}

export function normalizeWishAnswer(value) {
  if (typeof value !== 'string' || value.length > 100) return '';
  return value.normalize('NFKC').trim().toLowerCase().replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu,'').replace(/\s+/gu,' ');
}
export function isWishAnswerCorrect(quest,input) {
  return !!quest && typeof quest.answer==='string' && normalizeWishAnswer(input) === normalizeWishAnswer(quest.answer);
}
