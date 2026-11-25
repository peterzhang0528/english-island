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

## No-key local AI + English voice preview

The optional Python runner serves the same game and a CPU-local Qwen3-0.6B model (non-thinking mode), not a canned response or remote API. It never reads an OpenAI key or makes a cloud inference call. Recent radio context (at most six lines) is sent with each typed message, held in the browser, and not saved server-side. The UI identifies **Local AI**; only generated lines get **LIVE AI** badges. The normal static/offline and OpenAI paths remain unchanged.

Verified setup: Ubuntu, Python 3.10, 8 CPU cores, 31 GiB RAM. Keep the downloaded weights outside this repository. A virtual environment is recommended:

```sh
python3 -m venv ~/.local/share/rescue-ai-venv
. ~/.local/share/rescue-ai-venv/bin/activate
python3 -m pip install --upgrade pip packaging
# A source build avoids CPU wheels that require musl on Ubuntu. Needs CMake/C++.
CMAKE_ARGS='-DGGML_NATIVE=ON -DGGML_CUDA=OFF -DLLAMA_CURL=OFF' CMAKE_BUILD_PARALLEL_LEVEL=6 \
  python3 -m pip install --no-binary=llama-cpp-python -r scripts/rescue-local-requirements.txt
mkdir -p ~/.local/share/rescue-ai
curl --fail -L https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf \
  -o ~/.local/share/rescue-ai/Qwen3-0.6B-Q8_0.gguf
python3 -m piper.download_voices --download-dir ~/.local/share/rescue-ai en_US-ljspeech-high
python3 scripts/rescue-local-preview.py \
  --model ~/.local/share/rescue-ai/Qwen3-0.6B-Q8_0.gguf \
  --voice ~/.local/share/rescue-ai/en_US-ljspeech-high.onnx
```

Open `http://127.0.0.1:8000/game/rescue.html`. For a VM preview tunnel, add `--host 0.0.0.0 --origin https://<exact-preview-host>`; only that origin and loopback origins may POST. Do not expose the Python development server as a production service. Omit `--voice` for local text-only AI with the original narration fallback. No npm dependencies or production environment variables are added.

Try a message not on a quick-command button, such as “Our squad is Fog Foxes. Can you cheer me up?” Then ask “Leo, what is our squad name?” Mia and Leo generate English replies using recent context. Mission commands and progress remain deterministic: AI dialogue cannot run actions, award progress, or rescue the boat. If the model fails, the radio shows an outage and authored mission controls still work; the plain static preview always remains available.

Piper-generated WAV audio uses the existing shared narration queue, mute, pause and replay, with bundled recordings still taking precedence. Both teammates currently use **one shared English voice**, not distinct character voices. No microphone, speech recognition or audio upload is added. This is typed live-model conversation plus synthesized speech, **not** low-latency streaming voice chat or autonomous agents controlling the world. CPU generation has a visible wait; small-model advice and memory are not guaranteed correct. The rescue renderer is capped at 30 fps and 750,000 drawing-buffer pixels (and skips unchanged paused frames) so software WebGL leaves CPU time for inference. Local-model requests time out after 60 seconds rather than blocking mission controls.

Requests are limited to 4 KiB, six context lines, 180-character player messages and 240-character teammate lines, one model generation at a time, and a shared 12-call/minute model quota (80/minute speech). Model output is grammar-constrained and revalidated before rendering; failures return no executable actions. Boundary checks require no downloaded models: `python3 -B tests/rescue_local_preview_test.py`.

Sources: [Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF) (Apache-2.0), [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) (MIT), [Piper](https://github.com/OHF-Voice/piper1-gpl) (GPL-3.0 optional local tool), [LJ Speech Piper model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD) (public-domain training corpus, credited to Keith Ito/Linda Johnson and model contributor Bryce Beattie). Models, runtimes and generated audio are not committed or bundled into the deployed site. Existing JJ narration is not replaced.
