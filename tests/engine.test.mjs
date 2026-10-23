// Unit tests for Lull's prediction + stats maths.  Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predict, observedWindows, blendWindow, isNightSleep, napsToday, ongoingSleep, lastWakeAt } from '../js/predict.js';
import { band, ageDays } from '../js/science.js';
import { dur, relative, overlapMin, median, startOfDay } from '../js/util.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
// A fixed reference day so tests never depend on "now": 2026-06-15 14:00 local.
const T = new Date(2026, 5, 15, 14, 0, 0).getTime();
const at = (h, m = 0, dayOffset = 0) => new Date(2026, 5, 15 + dayOffset, h, m, 0).getTime();
const sleep = (startH, startM, endH, endM, dayOffset = 0, endOffset = 0) => ({
  id: `s${startH}-${startM}-${dayOffset}`, type: 'sleep',
  start: at(startH, startM, dayOffset),
  end: endH == null ? null : at(endH, endM, dayOffset + endOffset),
});

test('age bands map to the right label', () => {
  const birth = T - 150 * DAY;
  assert.equal(ageDays(birth, T), 150);
  assert.equal(band(birth, T).label, '20–24 weeks');
  assert.equal(band(T - 10 * DAY, T).label, '0–4 weeks');
  assert.equal(band(T - 900 * DAY, T).label, '2 years+');
});

test('util formatting', () => {
  assert.equal(dur(40), '40m');
  assert.equal(dur(95), '1h 35m');
  assert.equal(dur(120), '2h');
  assert.equal(relative(T + 48 * MIN, T), 'in 48m');
  assert.equal(relative(T - 25 * MIN, T), '25m ago');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(overlapMin(0, 2 * HOUR, HOUR, 3 * HOUR), 60);
});

test('observedWindows measures gaps between sleeps and drops nonsense gaps', () => {
  const evs = [
    sleep(7, 0, 8, 30),      // woke 08:30
    sleep(10, 30, 11, 30),   // -> 120 min awake
    sleep(13, 30, null),     // -> 120 min awake
  ];
  assert.deepEqual(observedWindows(evs, T), [120, 120]);

  // a 10-hour gap is untracked time, not a real wake window
  const sparse = [sleep(7, 0, 8, 0), sleep(20, 0, null)];
  assert.deepEqual(observedWindows(sparse, T), []);
});

test('blendWindow: no data = middle of the age range', () => {
  const b = blendWindow([120, 150], []);
  assert.equal(b.minutes, 135);
  assert.deepEqual(b.range, [120, 150]);
  assert.equal(b.dataPoints, 0);
});

test('blendWindow: leans toward the baby but never fully abandons age', () => {
  const own = Array(12).fill(180);                 // baby reliably does 3h
  const b = blendWindow([120, 150], own);
  assert.ok(b.minutes > 135, 'pulled up by the baby');
  assert.ok(b.minutes < 180, 'age still has a say');
  assert.ok(b.weight <= 0.7);
  // one data point barely moves it
  const one = blendWindow([120, 150], [240]);
  assert.ok(Math.abs(one.minutes - 135) < 15);
});

test('predict while awake: next sleep = last wake + blended window, with a range', () => {
  const evs = [sleep(7, 0, 8, 0), sleep(10, 0, 11, 0), sleep(13, 0, 13, 30)]; // woke 13:30
  const p = predict({ events: evs, birthMs: T - 150 * DAY, nowMs: T });
  assert.equal(p.state, 'awake');
  assert.equal(p.awakeSince, at(13, 30));
  assert.equal(Math.round(p.awakeMin), 30);
  assert.ok(p.nextSleepAt > T, 'next sleep is in the future');
  assert.ok(p.nextSleepRange[0] < p.nextSleepAt && p.nextSleepAt < p.nextSleepRange[1]);
  assert.equal(p.status, 'early');
  assert.equal(p.confidence, 'low');          // only 2 measured windows
});

test('predict flags being past the window', () => {
  const evs = [sleep(5, 0, 6, 0)];             // woke 06:00, now 14:00 = 8h awake
  const p = predict({ events: evs, birthMs: T - 150 * DAY, nowMs: T });
  assert.equal(p.status, 'past');
  assert.ok(p.minutesLeft < 0);
});

test('predict while asleep: estimates the wake-up from recent nap lengths', () => {
  const evs = [
    { id: 'n1', type: 'sleep', start: at(9, 0, -1), end: at(10, 0, -1) },
    { id: 'n2', type: 'sleep', start: at(12, 0, -1), end: at(13, 0, -1) },
    { id: 'n3', type: 'sleep', start: at(15, 0, -1), end: at(16, 0, -1) },
    { id: 'now', type: 'sleep', start: at(13, 30), end: null },
  ];
  const p = predict({ events: evs, birthMs: T - 150 * DAY, nowMs: T });
  assert.equal(p.state, 'asleep');
  assert.equal(Math.round(p.sleepMin), 30);
  assert.equal(Math.round(p.expectedNapMin), 60);          // median of three 1h naps
  assert.equal(p.expectedWakeAt, at(14, 30));
  assert.equal(ongoingSleep(evs).id, 'now');
});

test('bedtime: the evening window stretches, and only after the naps are done', () => {
  const birth = T - 150 * DAY;                              // 5-6 months: 3 naps, 120-150 min
  const evening = new Date(2026, 5, 15, 17, 0).getTime();
  const evs = [sleep(7, 0, 8, 0), sleep(10, 0, 11, 0), sleep(13, 0, 14, 0), sleep(15, 30, 16, 15)];
  const p = predict({ events: evs, birthMs: birth, nowMs: evening });
  assert.equal(p.isBedtime, true);
  const plain = (p.nextSleepAt - p.awakeSince) / MIN;
  assert.ok(plain > 135, 'evening window is longer than the plain blended window');
});

test('a 3am waking predicts a short re-settle, not a daytime nap window', () => {
  const night = new Date(2026, 5, 15, 3, 0, 0).getTime();     // 03:00
  const evs = [
    // three normal daytime windows of ~2h yesterday…
    { id: 'd1', type: 'sleep', start: at(9, 0, -1), end: at(10, 0, -1) },
    { id: 'd2', type: 'sleep', start: at(12, 0, -1), end: at(13, 0, -1) },
    { id: 'd3', type: 'sleep', start: at(15, 0, -1), end: at(16, 0, -1) },
    // …and a night waking that ended 20 minutes ago
    { id: 'n1', type: 'sleep', start: at(19, 30, -1), end: at(2, 40) },
  ];
  const p = predict({ events: evs, birthMs: night - 150 * DAY, nowMs: night });
  assert.equal(p.nightWake, true);
  assert.equal(p.usedWindows, 'night');
  const predictedMin = (p.nextSleepAt - p.awakeSince) / MIN;
  assert.ok(predictedMin < 75, `night window should be short, got ${Math.round(predictedMin)} min`);
  assert.equal(p.isBedtime, false);
});

test('daytime prediction still uses daytime windows only', () => {
  const evs = [
    { id: 'n1', type: 'sleep', start: at(19, 30, -1), end: at(3, 0) },   // night
    { id: 'n2', type: 'sleep', start: at(3, 25), end: at(6, 30) },       // 25 min night window
    { id: 'd1', type: 'sleep', start: at(9, 0), end: at(10, 0) },        // 2.5 h day window
    { id: 'd2', type: 'sleep', start: at(12, 30), end: at(13, 30) },
  ];
  const p = predict({ events: evs, birthMs: T - 150 * DAY, nowMs: T });  // 14:00
  assert.equal(p.usedWindows, 'day');
  const predictedMin = (p.nextSleepAt - p.awakeSince) / MIN;
  assert.ok(predictedMin > 100, `day window should not be dragged down by night re-settles, got ${Math.round(predictedMin)}`);
});

test('no logs at all: still gives the age guidance, no crash', () => {
  const p = predict({ events: [], birthMs: T - 45 * DAY, nowMs: T });
  assert.equal(p.hasData, false);
  assert.equal(p.state, 'awake');
  assert.equal(p.awakeSince, null);
  assert.equal(p.band.label, '4–8 weeks');
  assert.equal(lastWakeAt([]), null);
});

test('night sleep detection and nap counting', () => {
  const night = { type: 'sleep', start: at(19, 30, -1), end: at(6, 30, 0) };
  assert.equal(isNightSleep(night), true);
  assert.equal(isNightSleep({ type: 'sleep', start: at(10, 0), end: at(11, 0) }), false);
  // a short stretch between night wakings is still night, not a nap
  assert.equal(isNightSleep({ type: 'sleep', start: at(23, 0), end: at(23, 50) }), true);
  assert.equal(isNightSleep({ type: 'sleep', start: at(2, 30), end: at(3, 10) }), true);
  // a very long day sleep still counts as night sleep
  assert.equal(isNightSleep({ type: 'sleep', start: at(11, 0), end: at(18, 0) }), true);
  const evs = [night, sleep(9, 0, 10, 0), sleep(12, 0, 13, 0)];
  assert.equal(napsToday(evs, T), 2);
});

