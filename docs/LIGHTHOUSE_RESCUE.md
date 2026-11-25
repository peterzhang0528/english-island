# Lighthouse Rescue · 六年级合作关

Entry: `/game/rescue.html`, also linked from the website header. This is a separate expedition: the ten original chapters and their progress keys are unchanged.

## The adventure

A boat carrying three people is lost in fog. The player leads Mia (engineer) and Leo (scout), who speak English to the player and each other. No quizzes, countdown punishment, account or microphone. Chinese hints are opt-in. All graphics are original procedural Three.js geometry using the existing bundled renderer.

1. Ask Mia to repair the bridge. The missing planks appear and the squad crosses.
2. Ask Mia to hold the switch. Go to **02 Power** and turn the crank. The generator needs both teammates.
3. Ask Leo for the signal. Go to **03 Lighthouse**, then send **Blue → Amber → Blue** using squad controls. A wrong flash resets the pattern, not the mission.
4. Aim right twice, then guide the boat home with **E** or the action button. The boat returns to the jetty and the debrief records the rescue.

Use W/A/S/D or arrows to move; E/Space or the action button interacts. Location buttons offer a keyboard/touch alternative. Pause, help and background tabs suspend movement and shared narration. There are no progress rewards for arbitrary AI output.

## Honest AI boundary

The complete playable mission needs no credentials. Without configuration, the UI explicitly says **Mission simulator · authored English squad dialogue**. This mode has authored teammate exchanges and intent-based English commands, not autonomous LLM agents or microphone recognition. Narration goes through the existing shared `voice.js`; new lines use its browser speech fallback when supported, not new JJ recordings.

For live English radio replies, configure the same server-only `OPENAI_API_KEY` and optional `OPENAI_MODEL` used by the wish map (default `gpt-4o-mini`). `/api/rescue` calls the existing Responses API pattern with strict, bounded two-character output. Free text outside the mission-command vocabulary gets a short Mia/Leo exchange; mission commands always run deterministic local actions. The UI marks actual model lines **LIVE AI** and all authored lines **MISSION**. Input is sent to OpenAI only when live radio is connected and the player submits a free-text message; there is no microphone or audio upload. No model key is sent to the browser. This preview does not provision a model key.

Requests enforce same-origin JSON, bounded streaming bodies, a timeout, output validation and best-effort process-local client/global rate limits. These are not distributed spending controls. Model dialogue is rendered with textContent and cannot change game state. An AI outage leaves the entire mission playable and is shown in the radio status.

Static preview: `python3 -m http.server 8000 --directory public` then `/game/rescue.html` (simulator only). Full website/API: normal project dev/build scripts. See the PR for verification actually completed.
