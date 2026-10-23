// WCAG contrast sweep over every colour token in css/style.css, for all three
// schemes. Run: node tools/contrast.mjs   (exits non-zero if a pair fails)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

function blocks() {
  // every "selector { ... }" pair in the file, in source order
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
    sel: m[1].trim().replace(/\s+/g, ' '),
    vars: Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map(v => [v[1], v[2]])),
  }));
}
// A theme's tokens = every block whose selector mentions it, merged in order.
function tokensFor(match) {
  const out = {};
  for (const b of blocks()) if (match.test(b.sel)) Object.assign(out, b.vars);
  return out;
}

const base  = tokensFor(/^:root(,|$)|\[data-theme="dark"\]/);
const light = { ...base, ...tokensFor(/\[data-theme="light"\]/) };
const night = { ...base, ...tokensFor(/\[data-theme="night"\]/) };

const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function lum(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, what it is]
const PAIRS = [
  ['fg', 'bg', 4.5, 'body text'],
  ['fg', 'bg-2', 4.5, 'card text'],
  ['fg', 'bg-3', 4.5, 'input text'],
  ['fg-dim', 'bg', 4.5, 'secondary text'],
  ['fg-dim', 'bg-2', 4.5, 'secondary on card'],
  ['fg-dim', 'bg-3', 4.5, 'secondary on input'],
  ['fg-faint', 'bg', 4.5, 'small labels'],
  ['fg-faint', 'bg-2', 4.5, 'small labels on card'],
  ['fg-faint', 'bg-3', 4.5, 'small labels on input'],
  ['accent', 'bg', 4.5, 'accent text'],
  ['accent', 'bg-2', 4.5, 'accent on card'],
  ['accent', 'accent-soft', 4.5, 'accent pill'],
  ['accent-ink', 'accent', 4.5, 'primary button label'],
  ['feed', 'bg-2', 4.5, 'feed number'],
  ['feed', 'feed-soft', 4.5, 'feed pill'],
  ['diaper', 'bg-2', 4.5, 'diaper number'],
  ['diaper', 'diaper-soft', 4.5, 'diaper pill'],
  ['good', 'bg-2', 4.5, 'good text'],
  ['warn', 'bg-2', 4.5, 'warning text'],
  ['danger', 'bg-2', 4.5, 'danger text'],
  ['accent', 'ring-track', 3.0, 'progress ring (graphic)'],
  ['nap', 'bg-2', 4.5, 'nap numbers on card'],
  ['nap', 'ring-track', 3.0, 'nap arc on the day circle (graphic)'],
  ['nap', 'bg-3', 3.0, 'nap block on a sleep bar (graphic)'],
  ['accent', 'bg-3', 3.0, 'night block on a sleep bar (graphic)'],
  ['line', 'bg', 1.2, 'hairline border (graphic)'],
];

let fails = 0, warns = 0;
for (const [name, T] of [['dark', base], ['light', light], ['night', night]]) {
  console.log(`\n=== ${name} ===`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!T[fg] || !T[bg]) { console.log(`  ?  --${fg} / --${bg} missing`); fails++; continue; }
    const r = ratio(T[fg], T[bg]);
    const ok = r >= min;
    if (!ok) { (r >= min - 0.6 ? warns++ : fails++); }
    console.log(`  ${ok ? 'ok  ' : r >= min - 0.6 ? 'warn' : 'FAIL'} ${r.toFixed(2)} (min ${min})  --${fg} on --${bg}  — ${what}`);
  }
}
console.log(`\n${fails} fail, ${warns} near-miss`);
process.exit(fails ? 1 : 0);
