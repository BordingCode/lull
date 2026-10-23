# Lull — baby sleep & feeding tracker

A one-tap tracker for a baby's sleep, feeds and diapers, with a sensible
prediction of the next nap. Built as an offline-first web app (PWA): it installs
to the home screen, works with no internet, and **keeps all data on the phone**.
Nothing is uploaded unless you turn on the optional, end-to-end encrypted
cloud backup.

Live: https://bordingcode.github.io/lull/

Modelled on the app *Luli*, with everything unlocked and no subscription.

<p align="center">
  <img src="docs/shots/17-final-home.png" width="260" alt="Home screen: sleep button, next-sleep prediction, quick log and today's 24-hour bar">
  <img src="docs/shots/07-patterns.png" width="260" alt="Patterns: one 24-hour bar per day for 14 days">
  <img src="docs/shots/12-nightmode.png" width="260" alt="Night mode: dim warm amber on black">
</p>

## Screens
- **Home** — giant sleep button (tap asleep / tap awake) with a progress ring,
  a live "awake for 1h 12m" counter, quick-log buttons for breast, bottle,
  solids and diaper, the next-nap prediction with a countdown, and today's
  24-hour bar.
- **Log** — one *day* at a time, the way parents live it: from the morning
  wake-up, through the day and the night after it, to the next morning. The day
  is drawn as a **circle** that starts at the top with the wake-up (naps in blue,
  night in purple, feed and diaper dots, every nap's start and end time round
  the edge; tap any sleep for its start, end, length and note), followed by **day sleep, night sleep,
  awake and total sleep** with ▲/▼ against the day before (at the same point in
  the day, while today is still going). Then every entry, tap to correct, and
  buttons to backfill anything you forgot.
- **☀️ Day started** — log the morning wake-up without having logged bedtime.
  Home asks for it each morning. A day starts at, in order: a logged "Day
  started", the end of the night's sleep (04:00–11:00), or a clearly marked
  06:00 guess. A finished day with no night logged says so, offers "+ Night",
  and is left out of the averages instead of counting the night as awake.
- **Patterns** — one bar per day (wake-up to next wake-up) for 14 days, averages against the
  age-appropriate sleep range, your baby's own measured awake window, and
  feeds/diapers per day. **Over time** charts total sleep (night vs naps,
  against the age guide), longest night stretch, feeds and diapers per day over
  2 weeks, a month, 3 months or everything (weekly averages past 45 days).
- **Growth** — weight, length and head circumference in kg/cm, plotted on the
  WHO Child Growth Standards (0–2 years, girls/boys) with the percentile in
  plain words.
- **Sounds** — white noise, brown noise, rain, heartbeat and a lullaby, all
  synthesised in the browser (no downloads, no loop seam), with volume and a
  fade-out sleep timer.
- **Settings** — name, birth date, girl/boy (for the growth curves), ml/oz, three colour schemes (dark, light and
  a dim warm **night mode** for 3am), reminders, cloud backup, and backup/restore to a file.

## Cloud backup (optional)
Email + password account. Once on, every change is uploaded a few seconds later;
logging in on another phone (or a partner's) downloads and merges it — newest
copy of each entry wins, deletions included.

- **End-to-end encrypted.** The phone turns email + password into three things
  (PBKDF2, 600k rounds → HKDF): a fingerprint of the email (the account id), a
  password proof (the server keeps only a salted hash of it) and the AES-GCM key.
  The key never leaves the phone, so the server stores no email, no password and
  no readable logs. See `js/vault.js`.
- **The catch:** a forgotten password can't be reset; the logs on the phone are
  still safe and can be uploaded to a new account. No emails are ever sent.
- Theme and reminders stay per-phone; the account keys never go into backup files.
- Server: a Cloudflare Worker + D1 database in `worker/` (free plan), live at
  `lull-cloud.mathiasjob.workers.dev`. Ten wrong passwords lock an account for
  15 minutes. Uploads carry a version number, so two phones can't overwrite each
  other — the slower one merges and retries.
- Test locally: `node worker/dev-server.mjs`, then open Lull with
  `?cloud=http://localhost:8788`. `node --test tests/` covers the encryption,
  the server checks and a two-phone merge.

## How the nap prediction works
1. Look up the age-typical awake window — a *range*, e.g. 2h–2h30 at 5 months.
2. Measure how long this baby has actually stayed awake recently (median of the
   last ~10 windows, nonsense gaps discarded).
3. Blend the two. More real data = more weight on the baby, capped at 70% so age
   always has a say.
4. Next sleep = last wake-up + the blended window, shown as a range plus a
   confidence label (Age-based → Learning → Learned).
5. The evening run-up to bedtime is treated as a longer window, as it is in real
   babies, and only once the day's naps are done.

Nothing is presented as more precise than it is, and the app says plainly that
these are consensus ranges, not medical advice.

## Honest limitations
- **Reminders** fire from a timer inside the page/service worker. They are
  reliable while Lull is open or installed to the home screen, but a web app
  cannot guarantee an alarm if the phone fully evicts it. The on-screen
  countdown is always correct.
- **Not live partner sync.** Two phones on one account merge whenever the app
  is opened or something is logged, not instantly.

## Running and testing
```bash
python3 -m http.server 8777      # then open http://localhost:8777
node --test tests/               # prediction + stats unit tests
node tools/contrast.mjs          # WCAG contrast sweep, all three themes
```

## Deploying (gotcha)
Static GitHub Pages site with `.nojekyll`. After editing **any** shell file run:

```bash
./tools/bump.sh
```

It raises the version in one place everywhere it appears: `CACHE` in `sw.js`,
the `?v=` numbers in `index.html`, the service worker's file list, **and every
`import … from './x.js?v=N'` inside `js/`**. Two traps this closes:

- an unversioned `import` can be served stale from the browser's own HTTP cache
  (GitHub Pages sets a 10-minute max-age), producing an app that is half new and
  half old — the hardest kind of bug to see;
- the service worker's install now fetches with `cache: 'reload'`, so it can't
  re-cache a stale copy the browser handed it.

## Sources for the age guidance
See [docs/SOURCES.md](docs/SOURCES.md).
