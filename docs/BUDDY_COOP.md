# Buddy & Co. · The star lantern

Try: `python3 -m http.server 8000 --bind 0.0.0.0 --directory public`, then open `/game/buddy-coop.html`.
The full website also links here from the header. No build, model key or additional dependency is needed for the standalone preview.

## Scope and acceptance

The child is joining a familiar friend, not taking a vocabulary test. Buddy recognizes a fictional explorer from a pretend classroom, introduces cautious Nova and adventurous Pip, and helps the whole group light a lantern for a picnic. The player gathers wood; Buddy physically walks to repair the bridge; Nova walks to and holds the power switch; the player lights the lantern and joins the picnic. English requests change those teammate actions. Keyboard, tile clicks and accessible location/action buttons offer equivalent ways to play. The guide, pause and hidden tabs suspend the simulation. Restart clears the session.

This is **one human plus three teammates on one device**, not networked human multiplayer, voice chat, or Tencent Meeting integration. Scripted mode recognizes a bounded set of intents and explains unmatched input. An optional genuine model path understands natural English and requests validated bridge/switch actions; the same world guards still enforce resources, player proximity and teammate arrival. Generated lines are marked LIVE AI; authored lines are marked SCRIPTED. There is no microphone, narration, page storage or analytics. The original ten chapters, their storage and the shared JJ narration are unchanged. Procedural canvas artwork is original, generated in code with Devin assistance; there are no third-party assets or fonts.

## Optional genuine AI

Live AI is off by default. Opting in sends typed chat, six recent lines, synthetic profile selection, and five game-state flags to the indicated provider. A static server offers only the scripted path, with explicit unavailable status. The full website `/api/buddy-coop` uses existing server-only `OPENAI_API_KEY` and optional `OPENAI_MODEL` (default `gpt-4o-mini`), strict structured output, 4 KiB input, bounded response, timeout, same-origin checking, and best-effort process-local quotas (12/minute, two in flight). It uses `store:false`; this is not a promise about the provider's independent retention policy. No keys enter the browser. Real OpenAI verification requires credentials and is recorded separately from local inference.

For a **no-key, CPU-local model preview**, use Python 3.10+, llama-cpp-python 0.3.16 and Qwen3-0.6B-Q8_0.gguf outside the repo. This follows the existing Lighthouse blueprint recipe; the runner is opt-in, not part of production or npm install:

```sh
python3 -m venv ~/.local/share/buddy-ai-venv
~/.local/share/buddy-ai-venv/bin/pip install packaging
CMAKE_ARGS='-DGGML_NATIVE=ON -DGGML_CUDA=OFF -DLLAMA_CURL=OFF' CMAKE_BUILD_PARALLEL_LEVEL=6 ~/.local/share/buddy-ai-venv/bin/pip install --no-binary=llama-cpp-python llama-cpp-python==0.3.16
mkdir -p ~/.local/share/buddy-ai
curl --fail -L https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf -o ~/.local/share/buddy-ai/Qwen3-0.6B-Q8_0.gguf
~/.local/share/buddy-ai-venv/bin/python scripts/buddy-coop-local.py --model ~/.local/share/buddy-ai/Qwen3-0.6B-Q8_0.gguf
```

For an authenticated preview add `--host 0.0.0.0 --origin https://<exact-preview-origin>`; no wildcard origin is accepted. Local inference makes no cloud calls and does not log messages. A shared 12/minute quota, single-generation lock and schema validation bound this development service. A small CPU model can be slow, misunderstand requests, or invent dialogue; the UI times out and falls back honestly. It cannot award arbitrary progress or execute code. The model (Apache-2.0) and llama-cpp-python (MIT) are optional external tools, not bundled assets: [Qwen model card](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF), [llama-cpp-python](https://github.com/abetlen/llama-cpp-python). No speech model is used.

## Synthetic classroom handoff boundary

`PROFILES` in `public/game/js/buddy-coop-rules.js` demonstrates this proposed versioned shape:

```json
{
  "version": 1,
  "synthetic": true,
  "classId": "demo-class",
  "learnerId": "demo-alex",
  "displayName": "Alex",
  "classCue": {
    "activity": "building a paper bridge",
    "targetPhrase": "Let’s build it together!"
  },
  "expiresOn": "2026-12-03"
}
```

Only the three exact embedded fixtures are accepted, through that UTC expiry date inclusive. Unknown, changed, malformed or expired profiles use **Explorer** with no classroom recall; the whole adventure remains playable. The page has no import, query-string identity or real-data API. Cues and conversation live only in page memory and are discarded on restart/reload. A future extraction owner can agree the contract separately; this demo deliberately cannot ingest meeting records. These are simulated memories, not claims about a real child.

## Relationship to existing work

Open PRs #12 (two live-voice buddies) and #13 (Lighthouse Rescue) were inspected before implementation. This is an independent, no-key preview on `main`, not a replacement, dependency, or revival of rejected work. It demonstrates the new familiar Buddy + two teammates + expiring classroom cue concept without importing either pending feature branch or their APIs. Rendering and rules are isolated to avoid changing those ongoing projects. Converging the prototypes and connecting real model dialogue remain follow-up product decisions.

## Verification

`node --test tests/buddy-coop.test.mjs` covers a complete cooperative playthrough, proximity/water guards, actual teammate arrival before progress, duplicate completion, paused actions, bounded chat, exact synthetic fixtures and expired-profile fallback. Resource and DOM checks include this entry; normal repository typecheck, tests and production build still apply. The PR records the actual checks and browser evidence, including anything not tested.
