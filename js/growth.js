// ===== Lull — growth maths against the WHO Child Growth Standards =====
// Pure functions (unit-tested in tests/). WHO publishes each curve as an LMS
// table: L (skew), M (median), S (spread) per month of age. A measurement's
// z-score is ((x/M)^L − 1) / (L·S), and the percentile is the share of the
// WHO reference babies below it. Between whole months we interpolate L, M and
// S linearly — the WHO daily tables differ from that by far less than a scale
// can measure.

import { WHO } from './who.js?v=19';

export const MEASURES = {
  weight: { label: 'Weight', unit: 'kg', field: 'weightKg', step: 0.01, min: 0.5, max: 30 },
  length: { label: 'Length', unit: 'cm', field: 'lengthCm', step: 0.1,  min: 30,  max: 120 },
  head:   { label: 'Head',   unit: 'cm', field: 'headCm',   step: 0.1,  min: 20,  max: 60 },
};

// The lines drawn on the chart, as WHO draws them on its own percentile charts.
export const CURVES = [3, 15, 50, 85, 97];

export const MAX_MONTHS = 24;
const DAYS_PER_MONTH = 30.4375;   // WHO's own conversion (365.25 / 12)

export const ageMonths = (birthMs, atMs) => (atMs - birthMs) / 86400000 / DAYS_PER_MONTH;

/** [L, M, S] at a (fractional) age in months, or null outside 0–24 months. */
export function lmsAt(measure, sex, months) {
  const t = WHO[measure]?.[sex];
  if (!t || months < 0 || months > MAX_MONTHS) return null;
  const i = Math.min(Math.floor(months), MAX_MONTHS - 1), f = months - i;
  return t[i].map((v, k) => v + (t[i + 1][k] - v) * f);
}

export function zScore(x, [L, M, S]) {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
}

/** The measurement that sits at z-score `z`. */
export function valueAtZ(z, [L, M, S]) {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

// Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
              * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// Inverse of normCdf, by bisection — only used for a handful of chart lines.
export function zForPercentile(p) {
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (normCdf(mid) * 100 < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Where one measurement sits: { z, pct } or null if out of the chart's range. */
export function assess(measure, sex, birthMs, atMs, value) {
  if (!(value > 0)) return null;
  const lms = lmsAt(measure, sex, ageMonths(birthMs, atMs));
  if (!lms) return null;
  const z = zScore(value, lms);
  return { z, pct: normCdf(z) * 100 };
}

/** "42nd", "below the 1st", "above the 99th" — plain words for a percentile. */
export function pctLabel(pct) {
  if (pct < 1) return 'below the 1st';
  if (pct > 99) return 'above the 99th';
  const n = Math.round(pct);
  const suf = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suf}`;
}

/** Points for one percentile line, every half month from 0 to `toMonths`. */
export function curve(measure, sex, pct, toMonths = MAX_MONTHS) {
  const z = zForPercentile(pct), pts = [];
  for (let m = 0; m <= toMonths + 1e-9; m += 0.5) pts.push([m, valueAtZ(z, lmsAt(measure, sex, m))]);
  return pts;
}

/** Growth entries that carry a value for `measure`, oldest first. */
export function series(events, measure) {
  const f = MEASURES[measure].field;
  return events.filter(e => e.type === 'growth' && e[f] > 0).sort((a, b) => a.start - b.start);
}
