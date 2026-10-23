// ===== Lull — day/week aggregation for the Patterns screen =====
// Pure functions (unit-tested in tests/). "Night" sleep means the part of a
// sleep that falls between 19:00 and 07:00 — the rest counts as day sleep, so
// a long nap that bleeds into the evening is split honestly instead of guessed.

import { MIN, DAY, startOfDay, overlapMin } from './util.js?v=16';
import { isNightSleep } from './predict.js?v=16';

const NIGHT_FROM = 19, NIGHT_TO = 7;

/** Sleep blocks clipped to one calendar day (for the 24-hour bar). */
export function dayBlocks(events, dayStart, nowMs = Date.now()) {
  const dayEnd = dayStart + DAY;
  return events
    .filter(e => e.type === 'sleep')
    .map(e => ({ start: e.start, end: e.end || Math.min(nowMs, dayEnd), ongoing: !e.end, id: e.id }))
    .filter(b => b.end > dayStart && b.start < dayEnd)
    .map(b => ({ ...b, start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
    .sort((a, b) => a.start - b.start);
}

export function daySummary(events, dayStart, nowMs = Date.now()) {
  const dayEnd = dayStart + DAY;
  const blocks = dayBlocks(events, dayStart, nowMs);

  // night = 00:00–07:00 plus 19:00–24:00 of this calendar day
  const nightA = [dayStart, dayStart + NIGHT_TO * 3600000];
  const nightB = [dayStart + NIGHT_FROM * 3600000, dayEnd];
  let sleepMin = 0, nightMin = 0, longest = 0;
  for (const b of blocks) {
    const mins = (b.end - b.start) / MIN;
    sleepMin += mins;
    longest = Math.max(longest, mins);
    nightMin += overlapMin(b.start, b.end, nightA[0], nightA[1])
              + overlapMin(b.start, b.end, nightB[0], nightB[1]);
  }

  const inDay = (e) => e.start >= dayStart && e.start < dayEnd;
  const naps = events.filter(e => e.type === 'sleep' && inDay(e) && !isNightSleep(e)).length;
  const feedEvents = events.filter(e => e.type === 'feed' && inDay(e));
  const diaperEvents = events.filter(e => e.type === 'diaper' && inDay(e));

  const feeds = {
    count: feedEvents.length,
    breast: feedEvents.filter(f => f.kind === 'breast').length,
    breastMin: feedEvents.filter(f => f.kind === 'breast')
      .reduce((a, f) => a + (f.end ? (f.end - f.start) / MIN : (f.minutes || 0)), 0),
    bottle: feedEvents.filter(f => f.kind === 'bottle').length,
    bottleMl: feedEvents.reduce((a, f) => a + (Number(f.amountMl) || 0), 0),
    solids: feedEvents.filter(f => f.kind === 'solids').length,
  };
  const diapers = {
    total: diaperEvents.length,
    wet: diaperEvents.filter(d => d.kind === 'wet' || d.kind === 'both').length,
    dirty: diaperEvents.filter(d => d.kind === 'dirty' || d.kind === 'both').length,
  };

  return { dayStart, blocks, sleepMin, nightMin, dayMin: sleepMin - nightMin,
           longestMin: longest, naps, feeds, diapers };
}

export function lastDays(events, n, nowMs = Date.now()) {
  const today = startOfDay(nowMs);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(daySummary(events, today - i * DAY, nowMs));
  return out;
}

/** Averages over complete days only (today is still in progress). */
export function averages(days) {
  const done = days.slice(0, -1).filter(d => d.sleepMin > 0);
  if (!done.length) return null;
  const avg = (f) => done.reduce((a, d) => a + f(d), 0) / done.length;
  return {
    days: done.length,
    sleepMin: avg(d => d.sleepMin),
    nightMin: avg(d => d.nightMin),
    dayMin: avg(d => d.dayMin),
    naps: avg(d => d.naps),
    feeds: avg(d => d.feeds.count),
    diapers: avg(d => d.diapers.total),
    longestMin: avg(d => d.longestMin),
  };
}

/* ---------- trends over weeks and months (Patterns → "Over time") ---------- */

/** The calendar night a sleep belongs to: 02:00 on the 5th is the night of the 4th. */
const nightOf = (ms) => startOfDay(ms - 12 * 3600000);

/** Longest single night sleep (not clipped at midnight), keyed by night. */
function longestNights(events) {
  const out = new Map();
  for (const s of events) {
    if (s.type !== 'sleep' || !isNightSleep(s)) continue;
    const k = nightOf(s.start), m = (s.end - s.start) / MIN;
    if (m > (out.get(k) || 0)) out.set(k, m);
  }
  return out;
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * One point per day (spans up to 45 days) or per week (longer), complete days
 * only. A metric is null when nothing of that kind was logged, so an
 * untracked day reads as a gap — never as "0 hours of sleep".
 * `span` is a number of days, or 'all' for everything since the first log.
 */
export function trend(events, span, nowMs = Date.now()) {
  const today = startOfDay(nowMs);
  const logged = events.filter(e => e.type === 'sleep' || e.type === 'feed' || e.type === 'diaper');
  if (!logged.length) return { step: 1, points: [] };
  const first = startOfDay(Math.min(...logged.map(e => e.start)));
  const from = Math.max(first, span === 'all' ? first : startOfDay(today - span * DAY + 12 * 3600000));

  const nights = longestNights(logged);
  const days = [];
  // step by calendar day via noon, so a daylight-saving change can't skip one
  for (let d = from; d < today; d = startOfDay(d + DAY + 12 * 3600000)) {
    const s = daySummary(logged, d, nowMs);
    days.push({
      dayStart: d,
      sleepMin: s.blocks.length ? s.sleepMin : null,
      nightMin: s.blocks.length ? s.nightMin : null,
      dayMin:   s.blocks.length ? s.dayMin : null,
      longestNightMin: nights.get(d) ?? null,
      feeds:    s.feeds.count || null,
      bottleMl: s.feeds.bottleMl || null,
      diapers:  s.diapers.total || null,
      wet:      s.diapers.total ? s.diapers.wet : null,
      dirty:    s.diapers.total ? s.diapers.dirty : null,
    });
  }

  const step = days.length > 45 ? 7 : 1;
  const keys = ['sleepMin', 'nightMin', 'dayMin', 'longestNightMin', 'feeds', 'bottleMl', 'diapers', 'wet', 'dirty'];
  const points = [];
  // bucket from the newest day backwards, so the latest week is a whole week
  for (let end = days.length; end > 0; end -= step) {
    const chunk = days.slice(Math.max(0, end - step), end);
    const p = { start: chunk[0].dayStart, days: chunk.length };
    for (const k of keys) p[k] = mean(chunk.map(c => c[k]).filter(v => v != null));
    points.unshift(p);
  }
  return { step, points };
}
