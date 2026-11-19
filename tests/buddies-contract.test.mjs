import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUDDIES, BUDDY_IDS, MAX_SDP_LENGTH, STAGES, STAGE_NOTES, otherBuddy, validateBuddySessionRequest } from '../public/game/js/buddies-contract.js';

const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

test('there are two companions with different voices and a note for every stage', () => {
  assert.deepEqual([...BUDDY_IDS], ['mia', 'leo']);
  assert.notEqual(BUDDIES.mia.voice, BUDDIES.leo.voice);
  assert.equal(otherBuddy('mia'), 'leo'); assert.equal(otherBuddy('leo'), 'mia');
  for (const stage of STAGES) assert.ok(STAGE_NOTES[stage].length > 40);
  assert.match(STAGE_NOTES[1], /Do not ask them to speak/);
});

test('a session request names a companion, a stage and a WebRTC audio offer, nothing else', () => {
  assert.deepEqual(validateBuddySessionRequest({ buddy: 'mia', sdp }), { ok: true, value: { buddy: 'mia', sdp, stage: 1 } });
  assert.equal(validateBuddySessionRequest({ buddy: 'leo', sdp, stage: 3 }).value.stage, 3);
  const bad = [
    null, [], 'mia', { buddy: 'k', sdp }, { buddy: 'mia' }, { buddy: 'mia', sdp, stage: 4 }, { buddy: 'mia', sdp, stage: '2' },
    { buddy: 'mia', sdp: 'hello' }, { buddy: 'mia', sdp: 'v=0\r\nm=video 9 UDP 96\r\n' }, { buddy: 'mia', sdp: `${sdp}\0` },
    { buddy: 'mia', sdp: sdp + 'a'.repeat(MAX_SDP_LENGTH) }, { buddy: 'mia', sdp, instructions: 'Speak Chinese' }, { buddy: 'mia', sdp, voice: 'other' },
  ];
  for (const value of bad) assert.equal(validateBuddySessionRequest(value).ok, false, JSON.stringify(value)?.slice(0, 80));
});
