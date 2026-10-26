# Lull — project notes

Baby sleep/feed/diaper tracker PWA, vanilla ES modules, **no build step**.
Repo `BordingCode/lull`, GitHub Pages. App language is **English**; code
comments are English too. See README.md for screens, docs/SOURCES.md for where
the numbers and the Guide's advice come from.

## Checks after any change
- `node --test tests/` and `node tools/contrast.mjs` (every colour token, 3 themes).
- Deploy: `./tools/bump.sh`, then commit + push. It versions index.html, sw.js
  and every `?v=` import — without it phones serve a stale mix. A new js file
  must also be added to `SHELL` in sw.js.
- Never rename the IndexedDB `lull` or event field names without a migration.

## The Guide (js/guide.js)
Danish Health Authority (Sundhedsstyrelsen) first, then AAP/NHS/WHO. Every
topic lists its sources; research notes are in docs/guide-research.md. No fixed
"regression" ages, no hormone claims, no exact sleep-cycle minutes, no
schedules. Where Denmark and the US/UK differ, give the Danish advice and say
so. Have a claim fact-checked before adding it.

## The baby monitor (js/monitor.js + js/mon-*.js)
Formerly the stand-alone app Vuggevagt. WebRTC audio between two phones; the
Cloudflare Worker `vuggevagt-signal` (source in `monitor-worker/`, Durable
Object per pairing code) only introduces them. Pairing is kept under the old
localStorage key `vuggevagt_v1` — same origin, so old pairings carry over.

It lives in its own full-screen layer `#monitor`, **outside `#screen`**: Lull
redraws `#screen` every 15 s and a redraw must never touch a live mic, peer or
alarm. The Night tab only shows `monitor.cardHtml()`; body classes are
prefixed `mon-` so they can't collide with Lull's.

### The hard limit (don't change without reading this)
Android takes the microphone away from Chrome in the background (since Android
9 that needs a foreground service, which only a real app can have). So:
- **Baby phone:** screen MUST stay on (Wake Lock), on a charger. The lock is
  released when the page is hidden and re-taken on `visibilitychange`.
- **Parent phone:** screen may be off. Background playback is allowed, so the
  `<audio>` element must **never** be muted or set to volume 0 — then Android
  stops treating the page as "playing media". Minimum 0.05 (`applyVolume()`).

### Safety rule
The **lost-connection alarm** matters more than anything else. A monitor that
fails silently is more dangerous than none.
- Heartbeat every 2 s over the data channel, `DEAD_MS = 8000`.
- `deadReason === 'blind'` (baby phone went to the background) must NOT be
  cleared by the network recovering — only the baby phone can say it hears again.
- `onLinkUp()` and `setPill()` must never paint a healthy status over an alarm.
- A noise or a lost link brings the monitor layer forward from any tab.

### Battery (pram, no charger)
`mon-battery.js` measures real drain and time left; `setSaver()` turns on when
not charging. When level reports are throttled, send the **peak since the last
packet**, never the latest sample, or a short cry can fall between packets.

### Traps already fallen into
- Listen BEFORE starting `Battery` — the first reading is emitted in `start()`.
- `AudioContext.resume()` NEVER resolves without a tap. Never await it on the
  start-up path: `Alarm.unlock()` races 400 ms; `armOnFirstGesture()` retries.
- The data channel stays "open" for a while after the other phone is gone, so
  signalling during a reconnect must go over the WebSocket (`peer.post(msg, true)`).
- The mic track fires `negotiationneeded` before anyone listens, so the first
  offer is lost; `kick()` re-sends and `rebuild()` starts over when the peer appears.

### Not done yet
- Real two-phone test (docs/FIRST-NIGHT.md).
- TURN relay is off: the Cloudflare token lacks Realtime rights. Make a TURN key
  in the Cloudflare dashboard and set Worker secrets `TURN_KEY_ID` +
  `TURN_API_TOKEN` (free tier is plenty). Without it: always works on the same
  Wi-Fi, usually on mobile data, not on CGNAT mobile networks.

### Testing without phones
`?ns=<name>` (own storage per tab) + `?fakemic=1` (generated tone, no mic
prompt) + `window.__vv` (`.state`, `.loud(v)`, `.fakeNoise(db)`, `.errors`).
Two tabs = two phones. Switching tabs really hides the other one and fires the
blind alarm — pin `document.visibilityState` in tests of a pure link death.
