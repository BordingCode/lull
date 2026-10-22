// ===== Lull — age-based sleep science =====
// Wake windows are *expert pediatric-sleep consensus*, not an official medical
// standard: the AAP publishes total-sleep recommendations but NOT wake-window
// charts. Sources are listed in docs/SOURCES.md. Always shown as a range.

// age bands, by baby's age in days. ww = awake window in minutes [min, max]
// naps = typical naps per 24h, night = typical longest night stretch (hours)
export const BANDS = [
  { to:  28, label: '0–4 weeks',    ww: [35,  60], naps: [5, 8], total: [14, 17], napLen: [30, 180] },
  { to:  56, label: '1–2 months',   ww: [45,  75], naps: [4, 6], total: [14, 17], napLen: [30, 150] },
  { to:  84, label: '2–3 months',   ww: [60,  90], naps: [4, 5], total: [14, 16], napLen: [30, 120] },
  { to: 112, label: '3–4 months',   ww: [75, 105], naps: [4, 4], total: [13, 16], napLen: [30, 120] },
  { to: 140, label: '4–5 months',   ww: [90, 120], naps: [3, 4], total: [12, 16], napLen: [35, 120] },
  { to: 168, label: '5–6 months',   ww: [120,150], naps: [3, 3], total: [12, 16], napLen: [40, 120] },
  { to: 224, label: '6–8 months',   ww: [135,165], naps: [2, 3], total: [12, 15], napLen: [45, 120] },
  { to: 294, label: '8–10 months',  ww: [150,210], naps: [2, 3], total: [12, 15], napLen: [45, 120] },
  { to: 365, label: '10–12 months', ww: [180,240], naps: [2, 2], total: [12, 15], napLen: [50, 120] },
  { to: 548, label: '12–18 months', ww: [210,270], naps: [1, 2], total: [11, 14], napLen: [60, 150] },
  { to: 730, label: '18–24 months', ww: [270,330], naps: [1, 1], total: [11, 14], napLen: [60, 150] },
  { to: Infinity, label: '2 years+', ww: [300,360], naps: [0, 1], total: [10, 13], napLen: [60, 120] },
];

export function ageDays(birthMs, nowMs) {
  return Math.max(0, Math.floor((nowMs - birthMs) / 86400000));
}

export function band(birthMs, nowMs) {
  const d = ageDays(birthMs, nowMs);
  return BANDS.find(b => d <= b.to) || BANDS[BANDS.length - 1];
}

// The last awake stretch of the day is normally the longest ("bedtime window").
export const BEDTIME_STRETCH = 1.15;
