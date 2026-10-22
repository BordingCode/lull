// ===== Lull — day/week aggregation for the Patterns screen =====
// Pure functions (unit-tested in tests/). "Night" sleep means the part of a
// sleep that falls between 19:00 and 07:00 — the rest counts as day sleep, so
// a long nap that bleeds into the evening is split honestly instead of guessed.

import { MIN, DAY, startOfDay, overlapMin } from './util.js';
import { isNightSleep } from './predict.js';

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
