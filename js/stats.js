// ===== Lull — trends for the Patterns screen =====
// Pure functions (unit-tested in tests/). Days are baby-days (wake-up to the
// next wake-up, see days.js), so "night" means the night that follows the day.

import { MIN, DAY, startOfDay } from './util.js?v=24';
import { index, babyDay, currentDate, nextDate } from './days.js?v=24';

/* ---------- trends over weeks and months (Patterns → "Over time") ---------- */

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

  const ix = index(events.filter(e => e.type === 'daystart' || e.type === 'sleep' || e.type === 'feed' || e.type === 'diaper'));
  const current = currentDate(ix, nowMs);
  const days = [];
  for (let d = from; d < current; d = nextDate(d)) {      // the day still going is left out
    const s = babyDay(ix, d, nowMs);
    if (!s) continue;
    const nightBlocks = s.blocks.filter(b => b.night);
    const whole = s.blocks.length && !s.nightMissing;          // no logged night = not a full day's sleep
    days.push({
      dayStart: d,
      sleepMin: whole ? s.sleepMin : null,
      nightMin: whole ? s.nightMin : null,
      dayMin:   s.blocks.length ? s.dayMin : null,
      longestNightMin: nightBlocks.length ? Math.max(...nightBlocks.map(b => (b.end - b.start) / MIN)) : null,
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
