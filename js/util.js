// ===== Lull — small shared helpers =====
export const MIN = 60000, HOUR = 3600000, DAY = 86400000;

export const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };
export const endOfDay   = (ms) => startOfDay(ms) + DAY;
export const dayKey     = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

export const pad = (n) => String(n).padStart(2, '0');
export const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** 95 -> "1h 35m", 40 -> "40m", 0 -> "0m" */
export function dur(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/** Live countdown style: "in 48 min", "in 1h 10m", "25 min ago" */
export function relative(targetMs, nowMs) {
  const diff = Math.round((targetMs - nowMs) / MIN);
  if (Math.abs(diff) < 1) return 'now';
  if (diff > 0)  return `in ${dur(diff)}`;
  return `${dur(-diff)} ago`;
}

export const uid = () => (self.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** median of numbers; 0 for empty */
export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i-1] + s[i]) / 2;
}

/** minutes of [aStart,aEnd) that fall inside [bStart,bEnd) */
export function overlapMin(aStart, aEnd, bStart, bEnd) {
  const lo = Math.max(aStart, bStart), hi = Math.min(aEnd, bEnd);
  return hi > lo ? (hi - lo) / MIN : 0;
}
