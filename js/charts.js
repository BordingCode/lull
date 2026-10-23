// ===== Lull — tiny inline-SVG charts (no libraries) =====
import { DAY, MIN, dur, clock } from './util.js?v=19';

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

/**
 * Bar chart over days or weeks (Patterns → "Over time"). Plain HTML for the
 * same reason as columns(): labels stay sharp at any width.
 *   value(p)  bar height, or null for "nothing logged" (drawn as a gap)
 *   inner(p)  optional darker part of the bar, drawn from the bottom
 *   band(p)   optional [lo, hi] reference range, shaded behind the bar
 *   fmt(v)    how a number is written in labels and tooltips
 */
export function trendBars(points, { value, inner, band, color, fmt, label }) {
  const n = points.length;
  if (!n) return '';
  const vals = points.map(value);
  const top = Math.max(1, ...vals.filter(v => v != null), ...(band ? points.map(p => band(p)?.[1] || 0) : []));
  const pct = (v) => Math.min(100, (v / top) * 100).toFixed(1);
  const every = Math.max(1, Math.ceil(n / 5));
  const bars = points.map((p, i) => {
    const v = vals[i], b = band?.(p), iv = inner?.(p);
    return `<div class="tb" title="${esc(label(p))}: ${v == null ? 'nothing logged' : esc(fmt(v))}">
      ${b ? `<i class="tband" style="bottom:${pct(b[0])}%;height:${(pct(b[1]) - pct(b[0])).toFixed(1)}%"></i>` : ''}
      ${v == null ? '' : `<b style="height:${pct(v)}%;background:${color};${iv != null ? 'opacity:.5' : ''}"></b>`}
      ${v == null || iv == null ? '' : `<b style="height:${pct(iv)}%;background:${color}"></b>`}
    </div>`;
  }).join('');
  // label every k-th bar, counted back from the newest so the latest is always named
  const labels = points.map((p, i) => (n - 1 - i) % every ? '' :
    `<span style="left:${(((i + .5) / n) * 100).toFixed(1)}%">${esc(label(p))}</span>`).join('');
  return `<div class="tchart">
      <div class="tgrid"><span style="bottom:100%"><em>${esc(fmt(top))}</em></span><span style="bottom:50%"><em>${esc(fmt(top / 2))}</em></span></div>
      <div class="tbars ${n > 40 ? 'dense' : ''}">${bars}</div>
      <div class="tlabels">${labels}</div>
    </div>`;
}

/**
 * WHO growth chart: percentile curves plus the baby's own measurements. SVG
 * with a fixed aspect ratio (no stretching), so the text inside stays round.
 */
export function growthChart({ curves, points, toMonths, unit, ageNow }) {
  const W = 340, H = 230, L = 34, R = 30, T = 10, B = 24;
  const all = curves.flatMap(c => c.pts.map(p => p[1])).concat(points.map(p => p[1]));
  let lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
  const span = hi - lo, tick = span > 40 ? 10 : span > 16 ? 5 : span > 8 ? 2 : 1;
  lo = Math.floor(lo / tick) * tick; hi = Math.ceil(hi / tick) * tick;
  const x = (m) => L + (m / toMonths) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let out = `<svg class="gchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth chart">`;
  for (let v = lo; v <= hi + 1e-9; v += tick) {
    out += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)"/>
            <text x="${L - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v}</text>`;
  }
  const mStep = toMonths > 12 ? 3 : toMonths > 6 ? 2 : 1;
  for (let m = 0; m <= toMonths; m += mStep) {
    out += `<text x="${x(m).toFixed(1)}" y="${H - 8}" text-anchor="middle">${m}</text>`;
  }
  out += `<text x="${W - R + 4}" y="${H - 8}" class="u">mo</text><text x="4" y="${T + 2}" class="u">${esc(unit)}</text>`;
  if (ageNow != null && ageNow <= toMonths) {
    out += `<line x1="${x(ageNow).toFixed(1)}" x2="${x(ageNow).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="var(--fg-faint)" stroke-dasharray="3 3"/>`;
  }
  for (const c of curves) {
    const d = c.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    out += `<path d="${d}" fill="none" stroke="var(--fg-faint)" stroke-width="${c.pct === 50 ? 1.8 : 1}" opacity="${c.pct === 50 ? .9 : .55}"/>`;
    const last = c.pts[c.pts.length - 1];
    out += `<text x="${(x(last[0]) + 3).toFixed(1)}" y="${(y(last[1]) + 3.5).toFixed(1)}" class="p">${c.pct}</text>`;
  }
  if (points.length) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    out += `<path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>`;
    for (const p of points) out += `<circle cx="${x(p[0]).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--bg-2)" stroke-width="1.5"/>`;
  }
  return out + '</svg>';
}
