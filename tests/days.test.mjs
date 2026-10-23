// Baby-days: a day runs from the morning wake-up, through the night after it,
// to the next morning.  Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStartFor, currentDate, babyDay, previousFor, lastBabyDays, averages } from '../js/days.js';
import { lastWakeAt } from '../js/predict.js';
import { startOfDay } from '../js/util.js';

const MIN = 60000;
// day 15 = Mon 2026-06-15
const at = (d, h, m = 0) => new Date(2026, 5, d, h, m).getTime();
const D = (d) => startOfDay(at(d, 12));
let n = 0;
const sleep = (d1, h1, m1, d2, h2, m2) => ({ id: 's' + n++, type: 'sleep', start: at(d1, h1, m1), end: d2 == null ? null : at(d2, h2, m2) });
const daystart = (d, h, m = 0) => ({ id: 'w' + n++, type: 'daystart', start: at(d, h, m) });
const feed = (d, h, m = 0) => ({ id: 'f' + n++, type: 'feed', kind: 'bottle', amountMl: 100, start: at(d, h, m) });

test('a logged "Day started" begins the day, with no bedtime logged the night before', () => {
  const evs = [daystart(15, 6, 40), feed(15, 7)];
  const s = dayStartFor(evs, D(15), at(15, 9));
  assert.deepEqual([s.at, s.source], [at(15, 6, 40), 'logged']);
  const day = babyDay(evs, D(15), at(15, 9));
  assert.equal(day.ongoing, true);
  assert.equal(day.awakeMin, 140);
  assert.equal(day.feeds.count, 1);
  assert.equal(lastWakeAt(evs, at(15, 9)), at(15, 6, 40), 'the nap prediction counts it as a wake-up');
});

test('without a logged start, the end of the night sleep starts the next day', () => {
  const evs = [daystart(15, 6), sleep(15, 10, 0, 15, 11, 30), sleep(15, 14, 0, 15, 15, 0),
               sleep(15, 19, 30, 16, 6, 40), feed(16, 2)];
  const day = babyDay(evs, D(15), at(16, 12));
  assert.equal(day.ongoing, false);
  assert.equal(day.end, at(16, 6, 40));
  assert.equal(day.dayMin, 150);
  assert.equal(day.naps, 2);
  assert.equal(day.nightMin, 11 * 60 + 10);
  assert.equal(day.sleepMin, 150 + 670);
  assert.equal(day.awakeMin, day.lengthMin - day.sleepMin);
  assert.equal(day.bedtime, at(15, 19, 30));
  assert.equal(day.feeds.count, 1, 'the 2am feed belongs to the day before it, not the next date');
  assert.equal(dayStartFor(evs, D(16), at(16, 12)).source, 'sleep');
});

test('night wakings and an early re-settle are all one night, never naps', () => {
  const evs = [daystart(15, 7), sleep(15, 19, 0, 15, 23, 50), sleep(16, 0, 30, 16, 4, 30), sleep(16, 5, 0, 16, 6, 40)];
  assert.equal(dayStartFor(evs, D(16), at(16, 12)).at, at(16, 6, 40), 'woke 04:30, back down 05:00: day starts 06:40');
  const day = babyDay(evs, D(15), at(16, 12));
  assert.equal(day.naps, 0);
  assert.equal(day.dayMin, 0);
  assert.ok(day.blocks.every(b => b.night));
});

test('nothing logged: the day is a guess at 06:00, and before 06:00 it is still yesterday', () => {
  const evs = [feed(15, 9)];
  assert.deepEqual(dayStartFor(evs, D(15), at(15, 9)), { at: at(15, 6), source: 'guess' });
  assert.equal(currentDate(evs, at(15, 5)), D(14));
  assert.equal(currentDate(evs, at(15, 9)), D(15));
});

test('still asleep from last night this morning: today has not started yet', () => {
  const evs = [daystart(14, 7), sleep(14, 19, 30)];
  const now = at(15, 7, 15);
  assert.equal(currentDate(evs, now), D(14));
  const day = babyDay(evs, D(14), now);
  assert.equal(day.ongoing, true);
  assert.equal(Math.round(day.nightMin), 11 * 60 + 45);
});

test('a sleep someone forgot to end days ago does not break earlier days', () => {
  const evs = [sleep(10, 20, 0)];
  const now = at(15, 12);
  assert.ok(babyDay(evs, D(12), now), 'a past date still has a day');
  assert.equal(currentDate(evs, now), D(15));
});

test('today is compared with yesterday at the same point in the day', () => {
  const evs = [daystart(14, 6), sleep(14, 8, 0, 14, 9, 0), sleep(14, 12, 0, 14, 14, 0),
               daystart(15, 7), sleep(15, 9, 0, 15, 10, 0)];
  const now = at(15, 12);                         // 5 h into today
  const today = babyDay(evs, D(15), now);
  const prev = previousFor(evs, today, now);
  assert.equal(prev.until, at(14, 11), 'yesterday cut 5 h after its own start');
  assert.equal(prev.dayMin, 60, 'the 12:00 nap had not happened yet at that point');
  const full = previousFor(evs, babyDay(evs, D(14), now), now);
  assert.equal(full.date, D(13));
});

test('the last days end with the current one, and averages leave it out', () => {
  const evs = [daystart(13, 6), sleep(13, 13, 0, 13, 15, 0), sleep(13, 19, 0, 14, 6, 0),
               sleep(14, 13, 0, 14, 14, 0), sleep(14, 19, 0, 15, 6, 0), sleep(15, 13, 0)];
  const days = lastBabyDays(evs, 3, at(15, 14));
  assert.deepEqual(days.map(d => d.date), [D(13), D(14), D(15)]);
  assert.equal(days[2].ongoing, true);
  const a = averages(days);
  assert.equal(a.days, 2);
  assert.equal(a.sleepMin, (120 + 660 + 60 + 660) / 2);
});

test('a day whose night was never logged is flagged, and left out of the averages', () => {
  const evs = [daystart(14, 6), sleep(14, 13, 0, 14, 14, 0),          // no bedtime logged on the 14th
               daystart(15, 6, 40), sleep(15, 13, 0, 15, 14, 0), sleep(15, 19, 30, 16, 6, 30),
               sleep(16, 13, 0)];
  const now = at(16, 13, 30);
  const [d14, d15, d16] = lastBabyDays(evs, 3, now);
  assert.equal(d14.nightMissing, true);
  assert.equal(d15.nightMissing, false);
  assert.equal(d16.nightMissing, false, 'today is still going, so its night can still come');
  const a = averages([d14, d15, d16]);
  assert.equal(a.days, 1);
  assert.equal(a.sleepMin, 60 + 660);
  // cut short for a comparison, it is still known that the night is missing
  assert.equal(babyDay(evs, D(14), now, { upTo: at(14, 12) }).nightMissing, true);
});
