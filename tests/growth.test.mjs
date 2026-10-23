// Unit tests for the WHO growth maths and the over-time trends.  Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lmsAt, zScore, valueAtZ, normCdf, zForPercentile, assess, pctLabel, ageMonths, curve, series } from '../js/growth.js';
import { trend } from '../js/stats.js';

const DAY = 86400000, MIN = 60000;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('LMS rows come straight from the WHO tables', () => {
  assert.deepEqual(lmsAt('weight', 'boy', 12), [0.0644, 9.6479, 0.10925]);
  assert.deepEqual(lmsAt('length', 'girl', 0), [1, 49.1477, 0.0379]);
  assert.equal(lmsAt('weight', 'boy', 25), null);
  assert.equal(lmsAt('weight', 'boy', -1), null);
  // halfway between months interpolates
  const h = lmsAt('head', 'girl', 0.5);
  near(h[1], (33.8787 + 36.5463) / 2, 1e-9, 'interpolated median');
});

test('percentiles match the percentile values WHO publishes', () => {
  // [measure, sex, month, published value, percentile it should be]
  const cases = [
    ['weight', 'boy', 0, 2.603994, 5],  ['weight', 'boy', 6, 7.934, 50],
    ['weight', 'boy', 12, 11.53526, 95], ['weight', 'boy', 12, 8.382077, 10],
    ['length', 'girl', 6, 64.20243, 25], ['length', 'girl', 12, 77.31497, 90],
    ['head', 'girl', 6, 44.34225, 95],   ['head', 'girl', 0, 31.93054, 5],
  ];
  for (const [m, sex, mo, v, p] of cases) {
    const pct = normCdf(zScore(v, lmsAt(m, sex, mo))) * 100;
    near(pct, p, 0.05, `${m} ${sex} ${mo}mo`);
  }
  // the 97.7th column is z = +2 exactly
  near(zScore(11.98574, lmsAt('weight', 'boy', 12)), 2, 1e-3, 'z=+2');
});

test('valueAtZ is the inverse of zScore; zForPercentile of normCdf', () => {
  const lms = lmsAt('weight', 'girl', 4.3);
  for (const z of [-2.5, -1, 0, 0.7, 2]) near(zScore(valueAtZ(z, lms), lms), z, 1e-9, 'round trip');
  for (const p of [3, 15, 50, 85, 97]) near(normCdf(zForPercentile(p)) * 100, p, 1e-6, 'pct round trip');
  near(normCdf(0), 0.5, 1e-9, 'cdf(0)');
  near(normCdf(1.959964), 0.975, 1e-6, 'cdf(1.96)');
});

test('age in months, plain-word labels, curves and series', () => {
  const birth = new Date(2026, 0, 1, 12).getTime();
  near(ageMonths(birth, birth + 365.25 * DAY), 12, 1e-9, 'a year is 12 months');
  assert.equal(pctLabel(42.3), '42nd');
  assert.equal(pctLabel(1.2), '1st');
  assert.equal(pctLabel(11), '11th');
  assert.equal(pctLabel(73), '73rd');
  assert.equal(pctLabel(0.4), 'below the 1st');
  assert.equal(pctLabel(99.6), 'above the 99th');
  const a = assess('weight', 'boy', birth, birth + 6 * 30.4375 * DAY, 7.934);
  near(a.pct, 50, 0.01, 'median at 6 months');
  assert.equal(assess('weight', 'boy', birth, birth + 30 * 30.4375 * DAY, 13), null, 'past 24 months');
  const c = curve('weight', 'girl', 50, 6);
  assert.equal(c.length, 13);
  near(c[0][1], 3.2322, 1e-6, '50th line starts at the median');
  const evs = [
    { type: 'growth', start: 3, weightKg: 5 }, { type: 'growth', start: 1, lengthCm: 50 },
    { type: 'growth', start: 2, weightKg: 4 }, { type: 'sleep', start: 0, end: 1 },
  ];
  assert.deepEqual(series(evs, 'weight').map(e => e.weightKg), [4, 5]);
});

/* ---------- trends ---------- */
const at = (d, h, m = 0) => new Date(2026, 5, d, h, m).getTime();
const NOW = at(20, 15);

test('trend: one point per full day, gaps stay gaps, today is left out', () => {
  const evs = [
    { id: 'a', type: 'sleep', start: at(16, 19), end: at(17, 6) },   // night of the 16th, 11h
    { id: 'b', type: 'sleep', start: at(17, 13), end: at(17, 14) },  // nap
    { id: 'c', type: 'feed', kind: 'bottle', amountMl: 120, start: at(17, 9) },
    { id: 'd', type: 'diaper', kind: 'both', start: at(17, 10) },
    // the 18th: nothing logged at all
    { id: 'e', type: 'sleep', start: at(19, 20), end: at(20, 2) },   // night of the 19th, 6h
    { id: 'f', type: 'sleep', start: at(20, 9), end: at(20, 10) },   // today: ignored
    { id: 'g', type: 'growth', start: at(10, 12), weightKg: 5 },     // not a log day
  ];
  const { step, points } = trend(evs, 14, NOW);
  assert.equal(step, 1);
  assert.deepEqual(points.map(p => new Date(p.start).getDate()), [16, 17, 18, 19]);
  const [d16, d17, d18, d19] = points;
  assert.equal(d16.longestNightMin, 11 * 60, 'whole night, not clipped at midnight');
  assert.equal(d16.sleepMin, 11 * 60, 'a day owns the whole night after it, not just the part before midnight');
  assert.equal(d17.dayMin, 60, 'the 17th starts at 06:00 when that night ended, then a 1h nap');
  assert.equal(d17.sleepMin, null, "the 17th's night wasn't logged, so its total isn't a real total");
  assert.equal(d17.feeds, 1);
  assert.equal(d17.bottleMl, 120);
  assert.equal(d17.diapers, 1);
  assert.equal(d17.dirty, 1);
  assert.equal(d18.sleepMin, null, 'untracked day is a gap, not zero');
  assert.equal(d18.feeds, null);
  assert.equal(d19.longestNightMin, 6 * 60);
});

test('trend: long spans become weekly averages, newest week complete', () => {
  const evs = [];
  for (let d = 0; d < 60; d++) {
    const s = new Date(2026, 3, 1 + d, 13).getTime();
    evs.push({ id: 'n' + d, type: 'sleep', start: s, end: s + (d % 2 ? 60 : 120) * MIN });
  }
  const now = new Date(2026, 3, 61, 9).getTime();     // the morning after the last day
  const { step, points } = trend(evs, 'all', now);
  assert.equal(step, 7);
  assert.equal(points.at(-1).days, 7);
  assert.equal(points.reduce((a, p) => a + p.days, 0), 60);
  near(points.at(-1).dayMin, (4 * 60 + 3 * 120) / 7, 1e-9, 'weekly mean');
  assert.equal(trend([], 14, now).points.length, 0);
});
