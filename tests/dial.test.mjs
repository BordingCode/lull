// The day circle: nap times are written on it, never on top of each other, and
// every sleep can be tapped.  Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayDial } from '../js/charts.js';
import { babyDay } from '../js/days.js';
import { startOfDay } from '../js/util.js';

const at = (d, h, m = 0) => new Date(2026, 5, d, h, m).getTime();
let n = 0;
const sleep = (d1, h1, m1, d2, h2, m2) => ({ id: 'z' + n++, type: 'sleep', start: at(d1, h1, m1), end: d2 == null ? null : at(d2, h2, m2) });

// every nap-time label as a box (same size estimate the layout uses: 30 x 13)
function boxes(svg) {
  return [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="(\w+)"[^>]*data-sleep="[^"]*"[^>]*>(\d\d:\d\d)<\/text>/g)]
    .map(([, x, y, anchor, text]) => {
      x = +x; y = +y;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - 30 : x - 15;
      return { text, x0, x1: x0 + 30, y0: y - 6.5, y1: y + 6.5 };
    });
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test('each nap shows its start and end time, and every sleep is tappable', () => {
  const evs = [{ id: 'ds', type: 'daystart', start: at(15, 6, 40) },
    sleep(15, 9, 10, 15, 10, 20), sleep(15, 13, 0, 15, 14, 40), sleep(15, 19, 30, 16, 6, 30)];
  const day = babyDay(evs, startOfDay(at(15, 12)), at(16, 12));
  const svg = dayDial(day);
  const texts = boxes(svg).map(b => b.text);
  assert.deepEqual(texts.sort(), ['09:10', '10:20', '13:00', '14:40']);
  assert.ok(!texts.includes('19:30'), 'night sleep is not labelled round the edge (bedtime is in the middle)');
  for (const e of evs.filter(e => e.type === 'sleep')) assert.ok(svg.includes(`data-sleep="${e.id}" role="button"`), e.id);
});

test('short naps close together never get overlapping times', () => {
  const evs = [{ id: 'ds', type: 'daystart', start: at(15, 6, 0) },
    sleep(15, 6, 20, 15, 6, 35),                                   // right after the ☀️
    sleep(15, 9, 0, 15, 9, 15), sleep(15, 9, 30, 15, 9, 50), sleep(15, 10, 5, 15, 10, 20),
    sleep(15, 12, 0, 15, 12, 10), sleep(15, 15, 0, 15, 15, 20), sleep(15, 17, 50, 15, 18, 5),
    sleep(15, 19, 0, 16, 5, 40)];
  const day = babyDay(evs, startOfDay(at(15, 12)), at(16, 12));
  const b = boxes(dayDial(day));
  assert.equal(b.length, 14);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    assert.ok(!overlaps(b[i], b[j]), `${b[i].text} overlaps ${b[j].text}`);
  }
  // and nothing collides with the ☀️ at the top
  const sun = { x0: 140, x1: 160, y0: 7, y1: 25 };       // the ☀️ is drawn centred at (150, 16)
  for (const x of b) assert.ok(!overlaps(x, sun), `${x.text} sits on the ☀️`);
});

test('a nap still going shows only its start', () => {
  const evs = [{ id: 'ds', type: 'daystart', start: at(15, 7) }, sleep(15, 13, 0)];
  const day = babyDay(evs, startOfDay(at(15, 12)), at(15, 13, 40));
  assert.deepEqual(boxes(dayDial(day)).map(b => b.text), ['13:00']);
});
