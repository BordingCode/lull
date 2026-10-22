// ===== Lull — tiny inline-SVG charts (no libraries) =====
import { DAY, MIN, dur, clock } from './util.js?v=15';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/**
 * One 24-hour bar: sleep blocks over a light "awake" track, plus optional
 * feed/diaper ticks. Pure markup, so it works in a service-worker cached page.
 */
export function timeline(blocks, dayStart, opts = {}) {
  const { feeds = [], diapers = [], h = 30, showNight = true } = opts;
  const W = 1000, H = h;
  const x = (ms) => ((ms - dayStart) / DAY) * W;
  let out = `<svg class="tl" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="24 hour sleep chart">`;
  out += `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--bg-3)"/>`;
  if (showNight) {
    const n = (W / 24);
    out += `<rect x="0" y="0" width="${n * 7}" height="${H}" fill="var(--bg)" opacity=".55"/>`;
    out += `<rect x="${n * 19}" y="0" width="${n * 5}" height="${H}" fill="var(--bg)" opacity=".55"/>`;
  }
  for (let i = 3; i < 24; i += 3) {
    out += `<line x1="${(W / 24) * i}" y1="0" x2="${(W / 24) * i}" y2="${H}" stroke="var(--line)" stroke-width="1"/>`;
  }
  for (const b of blocks) {
    const w = Math.max(2, x(b.end) - x(b.start));
    out += `<rect x="${x(b.start).toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" rx="3"
            fill="var(--accent)" opacity="${b.ongoing ? .72 : 1}"/>`;
  }
  for (const f of feeds)   out += `<circle cx="${x(f).toFixed(1)}" cy="${H - 5}" r="3.2" fill="var(--feed)"/>`;
  for (const d of diapers) out += `<circle cx="${x(d).toFixed(1)}" cy="5" r="3.2" fill="var(--diaper)"/>`;
  return out + '</svg>';
}

export const axis24 = () =>
  `<div class="tl-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`;

/** Horizontal meter with an optional "recommended band" marker pair. */
export function meter(valueMin, bandHours) {
  const max = Math.max(bandHours[1] + 2, valueMin / 60 + 1) * 60;
  const pct = (v) => Math.min(100, (v / max) * 100);
  return `<div class="meter">
    <i style="width:${pct(valueMin).toFixed(1)}%"></i>
    <u style="left:${pct(bandHours[0] * 60).toFixed(1)}%"></u>
    <u style="left:${pct(bandHours[1] * 60).toFixed(1)}%"></u>
  </div>`;
}

/**
 * Per-day column chart. Built from HTML, not SVG: a stretched SVG viewBox
 * squashes the day labels, and plain elements scale correctly at any width.
 */
export function columns(values, labels, color = 'var(--feed)') {
  const max = Math.max(1, ...values);
  const n = values.length;
  return `<div class="cols">${values.map((v, i) => `
    <div class="col" title="${esc(labels[i])}: ${v}">
      <div class="colbar" style="height:${((v / max) * 100).toFixed(1)}%;background:${color};opacity:${i === n - 1 ? .6 : 1}"></div>
      <span>${esc(labels[i])}</span>
    </div>`).join('')}</div>`;
}

export { esc };
