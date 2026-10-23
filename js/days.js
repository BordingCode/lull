// ===== Lull — baby-days =====
// Pure functions (unit-tested in tests/). A "day" here is how parents live it,
// not midnight to midnight: it starts when the baby wakes up for the day, runs
// through the day and the night that follows, and ends at the next morning's
// wake-up. Each day is keyed by the calendar date of its morning.
//
// Where a day starts, best evidence first:
//   1. 'logged' – a "Day started" entry on that date (no bedtime needed)
//   2. 'sleep'  – the end of the night's sleep, if it ended between 04:00 and 11:00
//   3. 'guess'  – 06:00, clearly marked as a guess in the UI

import { MIN, HOUR, DAY, startOfDay } from './util.js?v=21';

const MORNING_FROM = 4, MORNING_TO = 11;   // a night ending in this window = up for the day
const GUESS_HOUR = 6;
const RESETTLE_MIN = 60;                    // back down within an hour before 07:00 = still the night

export const nextDate = (d) => startOfDay(d + DAY + 12 * HOUR);   // via noon: DST can't skip a day
export const prevDate = (d) => startOfDay(d - 12 * HOUR);
const hourOf = (ms) => { const t = new Date(ms); return t.getHours() + t.getMinutes() / 60; };

/* Sorting and grouping once per set of events keeps months of history fast: the
   functions below take either the raw events or this prepared index. */
export function index(events) {
  if (events.sleeps) return events;
  const sleeps = events.filter(e => e.type === 'sleep').sort((a, b) => a.start - b.start);
  const starts = new Map(), endsOn = new Map();
  for (const e of events) {
    if (e.type !== 'daystart') continue;
    const k = startOfDay(e.start), cur = starts.get(k);
    if (!cur || e.start < cur.start) starts.set(k, e);
  }
  sleeps.forEach((s, i) => {
    if (!s.end) return;
    const k = startOfDay(s.end);
    if (!endsOn.has(k)) endsOn.set(k, []);
    endsOn.get(k).push(i);
  });
  return { events, sleeps, starts, endsOn };
}

/** Night sleep vs nap. Night: starts 19:00–05:00, lasts 6 h+, or (still going) began after 18:00. */
export function nightLike(s, nowMs) {
  const h = new Date(s.start).getHours();
  if (h >= 19 || h < 5) return true;
  if (!s.end) return h >= 18;
  return (s.end - s.start) / MIN >= 360;
}

/** When the day keyed by `date` started, or null if it hasn't started yet. */
export function dayStartFor(events, date, nowMs) {
  const ix = index(events);
  const logged = ix.starts.get(date);
  if (logged) return logged.start <= nowMs ? { at: logged.start, source: 'logged', id: logged.id } : null;

  // the last sleep of the night that ended in the morning window …
  const all = ix.sleeps;
  let wake = null, idx = -1;
  for (const i of ix.endsOn.get(date) || []) {
    const s = all[i];
    if (s.end <= nowMs && nightLike(s, nowMs)
        && hourOf(s.end) >= MORNING_FROM && hourOf(s.end) < MORNING_TO && (wake == null || s.end > wake)) {
      wake = s.end; idx = i;
    }
  }
  // … extended through an early re-settle (woke 04:30, back down 05:00–06:40 = one night)
  if (idx >= 0) {
    for (let i = idx + 1; i < all.length; i++) {
      const s = all[i];
      if (!s.end || s.end > nowMs || s.start > wake + RESETTLE_MIN * MIN || hourOf(s.start) >= 7) break;
      wake = Math.max(wake, s.end);
    }
    return { at: wake, source: 'sleep' };
  }

  const guess = date + GUESS_HOUR * HOUR;
  if (guess > nowMs) return null;
  // still asleep from last night, this morning: today hasn't started yet. (Only for today —
  // a sleep someone forgot to end days ago must not stop the past from having days.)
  const going = all.find(s => !s.end);
  if (date === startOfDay(nowMs) && going && going.start < guess && going.start >= date - 6 * HOUR) return null;
  return { at: guess, source: 'guess' };
}

/** The date key of the day happening right now. */
export function currentDate(events, nowMs) {
  events = index(events);
  const today = startOfDay(nowMs);
  return dayStartFor(events, today, nowMs) ? today : prevDate(today);
}

function tally(events, from, to) {
  const inside = (e) => e.start >= from && e.start < to;
  const feedEvents = events.filter(e => e.type === 'feed' && inside(e));
  const diaperEvents = events.filter(e => e.type === 'diaper' && inside(e));
  return {
    feeds: {
      count: feedEvents.length,
      breast: feedEvents.filter(f => f.kind === 'breast').length,
      breastMin: feedEvents.filter(f => f.kind === 'breast')
        .reduce((a, f) => a + (f.end ? (f.end - f.start) / MIN : (f.minutes || 0)), 0),
      bottle: feedEvents.filter(f => f.kind === 'bottle').length,
      bottleMl: feedEvents.reduce((a, f) => a + (Number(f.amountMl) || 0), 0),
      solids: feedEvents.filter(f => f.kind === 'solids').length,
    },
    diapers: {
      total: diaperEvents.length,
      wet: diaperEvents.filter(d => d.kind === 'wet' || d.kind === 'both').length,
      dirty: diaperEvents.filter(d => d.kind === 'dirty' || d.kind === 'both').length,
    },
  };
}

/**
 * Everything about one baby-day. `upTo` cuts the totals off early — used to
 * compare today with "yesterday at this time". Returns null for a day that
 * hasn't started.
 */
export function babyDay(events, date, nowMs, { upTo = Infinity } = {}) {
  const ix = index(events);
  events = ix.events;
  const s = dayStartFor(ix, date, nowMs);
  if (!s) return null;
  const n = dayStartFor(ix, nextDate(date), nowMs);
  const end = n ? n.at : null;                 // null = this day is still going
  const until = Math.min(upTo, end ?? nowMs, nowMs);

  const blocks = [];
  let bedtime = null;
  for (const e of ix.sleeps) {
    const eEnd = e.end || nowMs;
    if (eEnd <= s.at || e.start >= until) continue;
    // once the night has begun, every later sleep belongs to it (3am re-settles are not naps);
    // a sleep left over from before the day began (only when the start is a guess) can't start the night
    const night = bedtime != null || nightLike(e, nowMs) || (end != null && e.end != null && e.end >= end);
    if (night && bedtime == null && e.start >= s.at) bedtime = e.start;
    blocks.push({ id: e.id, start: Math.max(e.start, s.at), end: Math.min(eEnd, until), ongoing: !e.end, night });
  }

  let nightMin = 0, dayMin = 0, longest = 0, naps = 0;
  for (const b of blocks) {
    const m = (b.end - b.start) / MIN;
    if (b.night) nightMin += m; else { dayMin += m; naps++; }
    longest = Math.max(longest, m);
  }
  const sleepMin = nightMin + dayMin;
  const lengthMin = (until - s.at) / MIN;
  // A finished day with no night sleep at all: the night simply wasn't logged (that's allowed —
  // the morning can be logged without bedtime). Its awake time then includes the night, so the
  // UI says so and the averages leave the day out. Judged on the whole day, even when cut short.
  const nightMissing = end != null && !ix.sleeps.some(e => e.start < end && (e.end || nowMs) > s.at
    && (nightLike(e, nowMs) || (e.end != null && e.end >= end)));
  return {
    date, dayStart: date,                    // the date key (charts label days by it)
    start: s.at, source: s.source, startId: s.id || null,
    end, until, ongoing: end == null, bedtime, nightMissing,
    blocks, sleepMin, nightMin, dayMin, awakeMin: Math.max(0, lengthMin - sleepMin), lengthMin,
    longestMin: longest, naps,
    ...tally(events, s.at, until),
  };
}

/** The day before `day`, cut at the same point in the day when `day` is still going. */
export function previousFor(events, day, nowMs) {
  events = index(events);
  const prev = prevDate(day.date);
  if (!day.ongoing) return babyDay(events, prev, nowMs);
  const ps = dayStartFor(events, prev, nowMs);
  if (!ps) return null;
  return babyDay(events, prev, nowMs, { upTo: ps.at + (day.until - day.start) });
}

/** The last n days ending with the current one (oldest first). Unstarted days are skipped. */
export function lastBabyDays(events, n, nowMs) {
  events = index(events);
  const out = [];
  let d = currentDate(events, nowMs);
  for (let i = 0; i < n; i++, d = prevDate(d)) {
    const day = babyDay(events, d, nowMs);
    if (day) out.unshift(day);
  }
  return out;
}

/** Averages over complete days only (the current one is still in progress). */
export function averages(days) {
  const done = days.filter(d => !d.ongoing && !d.nightMissing && d.sleepMin > 0);
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
