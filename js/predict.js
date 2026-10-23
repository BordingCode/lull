// ===== Lull — next-sleep prediction =====
// Pure functions only (no DOM, no storage) so they can be unit-tested in node.
//
// How it works, in plain words:
//   1. Look up the age-typical awake window (a range, e.g. 2h–2h30 at 5 months).
//   2. Measure how long THIS baby has actually stayed awake recently.
//   3. Blend the two — the more real data there is, the more it trusts the baby.
//   4. Next sleep = when the baby last woke + that blended window.
// Nothing here pretends to be more precise than it is: everything comes out as
// a range plus a confidence level.

import { band, BEDTIME_STRETCH } from './science.js?v=16';
import { MIN, median, clamp } from './util.js?v=16';

const MAX_SANE_WINDOW = 8 * 60;   // minutes; longer gaps = untracked time, not a real wake window
const MIN_SANE_WINDOW = 10;       // minutes; shorter = a logging correction
const BEDTIME_HOUR    = 17.5;     // predicted sleep later than this is treated as bedtime
const NIGHT_FROM = 19, NIGHT_TO = 5;          // the hours we treat as "the night"
const NIGHT_FALLBACK = [20, 60];              // typical awake stretch at a night waking

export const isNightHour = (ms) => {
  const h = new Date(ms).getHours();
  return h >= NIGHT_FROM || h < NIGHT_TO;
};

export const sleeps = (events) => events
  .filter(e => e.type === 'sleep' && !e.deleted)
  .sort((a, b) => a.start - b.start);

/** The sleep that is happening right now (no end yet), or null. */
export function ongoingSleep(events) {
  return sleeps(events).find(s => !s.end) || null;
}

/** When the baby most recently woke up, or null if never logged. */
export function lastWakeAt(events) {
  const done = sleeps(events).filter(s => s.end);
  return done.length ? done[done.length - 1].end : null;
}

/**
 * Every measured awake window, newest first, each tagged with whether the baby
 * woke during the night. Night windows (a feed and back down at 3am) are a
 * completely different animal from daytime windows and must not be mixed.
 */
export function collectWindows(events, nowMs, lookbackDays = 7) {
  const since = nowMs - lookbackDays * 24 * 60 * MIN;
  const s = sleeps(events).filter(x => x.end || x.start >= since);
  const out = [];
  for (let i = 0; i < s.length - 1; i++) {
    if (!s[i].end) continue;
    const gap = (s[i + 1].start - s[i].end) / MIN;
    if (s[i].end >= since && gap >= MIN_SANE_WINDOW && gap <= MAX_SANE_WINDOW) {
      out.push({ minutes: gap, night: isNightHour(s[i].end) });
    }
  }
  return out.reverse();
}

/** Awake windows (minutes) measured from the log, newest first. */
export function observedWindows(events, nowMs, lookbackDays = 7, which = 'all') {
  return collectWindows(events, nowMs, lookbackDays)
    .filter(w => which === 'all' || (which === 'night' ? w.night : !w.night))
    .map(w => w.minutes);
}

/** Completed nap lengths (minutes) — daytime sleeps only, newest first. */
export function observedNaps(events, nowMs, lookbackDays = 7) {
  const since = nowMs - lookbackDays * 24 * 60 * MIN;
  return sleeps(events)
    .filter(s => s.end && s.start >= since && !isNightSleep(s))
    .map(s => (s.end - s.start) / MIN)
    .reverse();
}

/**
 * Night sleep vs nap. Anything that starts after 19:00 or before 05:00 is part
 * of the night — including the short stretches between night wakings, which
 * must not be counted as "naps" — and so is any sleep of 6 hours or more.
 */
export function isNightSleep(s) {
  if (!s.end) return false;
  const startHour = new Date(s.start).getHours();
  if (startHour >= 19 || startHour < 5) return true;
  return (s.end - s.start) / MIN >= 360;
}

/** Naps started on the same calendar day as nowMs. */
export function napsToday(events, nowMs) {
  const d = new Date(nowMs); d.setHours(0,0,0,0);
  const from = d.getTime(), to = from + 86400000;
  return sleeps(events).filter(s => s.start >= from && s.start < to && !isNightSleep(s)).length;
}

/**
 * Blend the age-typical window with this baby's own measured windows.
 * weight grows with the amount of real data, capped so age always has a say.
 */
export function blendWindow(typical, observed) {
  const [lo, hi] = typical;
  const mid = (lo + hi) / 2;
  const n = observed.length;
  if (!n) return { minutes: mid, range: [lo, hi], dataPoints: 0, weight: 0 };

  const recent = observed.slice(0, 10);
  const own = median(recent);
  const weight = clamp(recent.length / 12, 0, 0.7);     // never more than 70% baby, 30% age
  const minutes = own * weight + mid * (1 - weight);
  // Range tightens as confidence grows: ±25% of the age spread down to ±12%.
  const spread = Math.max(15, ((hi - lo) / 2) * (1 - weight * 0.5));
  return {
    minutes,
    range: [Math.max(MIN_SANE_WINDOW, minutes - spread), minutes + spread],
    dataPoints: recent.length,
    weight,
  };
}

export function confidenceOf(n) {
  return n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low';
}

/**
 * The single call the UI makes.
 * @returns a snapshot describing right now plus the next sleep prediction.
 */
export function predict({ events, birthMs, nowMs }) {
  const b = band(birthMs, nowMs);
  const going = ongoingSleep(events);
  const naps = observedNaps(events, nowMs);

  // At night, predict from night windows (short re-settles), not daytime naps.
  const atNight = isNightHour(nowMs);
  const nightWindows = observedWindows(events, nowMs, 7, 'night');
  const dayWindows = observedWindows(events, nowMs, 7, 'day');
  const useNight = atNight && !going;
  const windows = useNight ? nightWindows : dayWindows;
  // Baseline: age-typical awake window by day, a short re-settle by night.
  const typical = useNight ? NIGHT_FALLBACK : b.ww;
  const blended = blendWindow(typical, windows);

  const out = {
    band: b,
    state: going ? 'asleep' : 'awake',
    confidence: confidenceOf(blended.dataPoints),
    dataPoints: blended.dataPoints,
    windowMin: blended.minutes,
    windowRange: blended.range,
    napsToday: napsToday(events, nowMs),
    typicalNaps: b.naps,
    hasData: sleeps(events).length > 0,
  };

  if (going) {
    const elapsed = (nowMs - going.start) / MIN;
    const napMid = naps.length >= 3 ? median(naps.slice(0, 8)) : (b.napLen[0] + b.napLen[1]) / 2;
    const night = new Date(going.start).getHours() >= 17 || new Date(going.start).getHours() <= 4;
    out.asleepSince = going.start;
    out.sleepMin = elapsed;
    out.isNight = night;   // decided by the clock, so the label and the card agree
    out.expectedWakeAt = night ? null : going.start + napMid * MIN;
    out.expectedNapMin = napMid;
    return out;
  }

  const woke = lastWakeAt(events);
  if (woke == null) { out.awakeSince = null; return out; }

  const awakeMin = (nowMs - woke) / MIN;
  let win = blended.minutes, [lo, hi] = blended.range;

  // Evening: the run-up to bedtime is normally the longest stretch of the day.
  const predictedAt = woke + win * MIN;
  const predictedHour = new Date(predictedAt).getHours() + new Date(predictedAt).getMinutes() / 60;
  const napsDone = out.napsToday >= b.naps[0];
  const bedtime = !useNight && predictedHour >= BEDTIME_HOUR && napsDone;
  if (bedtime) { win *= BEDTIME_STRETCH; lo *= BEDTIME_STRETCH; hi *= BEDTIME_STRETCH; }

  out.nightWake = useNight;       // a 3am waking, not a nap
  out.awakeSince = woke;
  out.awakeMin = awakeMin;
  out.nextSleepAt = woke + win * MIN;
  out.nextSleepRange = [woke + lo * MIN, woke + hi * MIN];
  out.isBedtime = bedtime;
  out.usedWindows = useNight ? 'night' : 'day';
  out.minutesLeft = (out.nextSleepAt - nowMs) / MIN;
  out.status = awakeMin < lo ? 'early' : awakeMin <= hi ? 'window' : 'past';
  return out;
}
