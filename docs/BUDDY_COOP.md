# Buddy & Co. · The star lantern

Try: `python3 -m http.server 8000 --bind 0.0.0.0 --directory public`, then open `/game/buddy-coop.html`.
The full website also links here from the header. No build, model key or additional dependency is needed for the standalone preview.

## Scope and acceptance

The child is joining a familiar friend, not taking a vocabulary test. Buddy recognizes a fictional explorer from a pretend classroom, introduces cautious Nova and adventurous Pip, and helps the whole group light a lantern for a picnic. The player gathers wood; Buddy physically walks to repair the bridge; Nova walks to and holds the power switch; the player lights the lantern and joins the picnic. English requests change those teammate actions. Keyboard, tile clicks and accessible location/action buttons offer equivalent ways to play. The guide, pause and hidden tabs suspend the simulation. Restart clears the session.

This is **one human plus three scripted teammates on one device**, not networked human multiplayer, live LLM agents, voice chat, or Tencent Meeting integration. Free text recognizes a bounded set of intents and plainly explains unmatched input; optional English phrases keep the demo playable. There is no microphone, narration, model call, storage, analytics or chat transmission. The original ten chapters, their storage and the shared JJ narration are unchanged. Procedural canvas artwork is original, generated in code with Devin assistance; there are no third-party assets or fonts.

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
