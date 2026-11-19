// Shared by the browser and the server route. The server owns the personas and
// the model settings; the browser may only pick a buddy and the player's stage.
export const BUDDY_IDS = Object.freeze(['mia', 'leo']);
export const CLASS_CODE_HEADER = 'x-buddy-class-code';
export const BUDDIES = Object.freeze({
  mia: Object.freeze({ id: 'mia', name: 'Mia', voice: 'gleam', color: '#e98a6b' }),
  leo: Object.freeze({ id: 'leo', name: 'Leo', voice: 'meridian', color: '#5f93c9' }),
});
// 1 = mostly listening, 2 = copying single words, 3 = short sentences.
export const STAGES = Object.freeze([1, 2, 3]);
// Sent to the companions at session start and again whenever the player moves up a stage.
export const STAGE_NOTES = Object.freeze({
  1: 'Right now the new kid mostly listens. That is totally fine. Do not ask them to speak. Talk with your friend, show things, and call them along ("Come on!", "Over here!"). They join by moving in the game.',
  2: 'The new kid has started to say single English words. When it fits the game, give them an easy chance to say one word ("Boat or tree?"), then keep playing. If they stay quiet, just carry on.',
  3: 'The new kid can say short English sentences now. Ask them simple real questions and let them choose what to do next ("Where do we go now?"). Wait a moment for the answer.',
});
export const MAX_SDP_LENGTH = 16 * 1024;

export function otherBuddy(id) { return id === 'mia' ? 'leo' : 'mia'; }

export function validateBuddySessionRequest(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['request must be an object'] };
  for (const key of Object.keys(value)) if (!['buddy', 'sdp', 'stage'].includes(key)) errors.push(`unexpected key ${key}`);
  if (!BUDDY_IDS.includes(value.buddy)) errors.push('buddy must be mia or leo');
  const stage = value.stage === undefined ? 1 : value.stage;
  if (!STAGES.includes(stage)) errors.push('stage must be 1, 2 or 3');
  const sdp = value.sdp;
  if (typeof sdp !== 'string' || !sdp.startsWith('v=0') || sdp.length > MAX_SDP_LENGTH || !/\r?\nm=audio /u.test(sdp) || /[\0-\x08\x0b\x0c\x0e-\x1f]/u.test(sdp)) errors.push('sdp must be a WebRTC audio offer');
  return errors.length ? { ok: false, errors } : { ok: true, value: { buddy: value.buddy, sdp, stage } };
}
