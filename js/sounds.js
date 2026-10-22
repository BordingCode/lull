// ===== Lull — sleep sounds, generated in the browser =====
// No audio files to download: everything here is synthesised with WebAudio, so
// it works offline and loops forever without a seam.
// The output is also piped through a <audio> element (MediaStream) which is what
// lets phones keep playing it while the screen is off, and puts proper
// play/pause controls on the lock screen.

let ctx = null, master = null, current = null, nodes = [], audioEl = null, timer = null, timerEndsAt = 0;
let volume = 0.55;
const listeners = new Set();

export const SOUNDS = [
  { id: 'white',     name: 'White noise', emoji: '🌫️', desc: 'Even hiss, masks the house' },
  { id: 'brown',     name: 'Brown noise', emoji: '🪵', desc: 'Deeper, softer rumble' },
  { id: 'rain',      name: 'Rain',        emoji: '🌧️', desc: 'Soft rain on a window' },
  { id: 'heartbeat', name: 'Heartbeat',   emoji: '💜', desc: 'Womb-like, 62 bpm' },
  { id: 'lullaby',   name: 'Lullaby',     emoji: '🎶', desc: 'Slow music box, pentatonic' },
];

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });

export const playing = () => current;
export const getVolume = () => volume;
export const timerLeftMs = () => (timerEndsAt ? Math.max(0, timerEndsAt - Date.now()) : 0);

function ensureCtx() {
  if (!ctx) {
    const AC = self.AudioContext || self.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    // Route through a media element so mobile keeps it alive in the background.
    try {
      const dest = ctx.createMediaStreamDestination();
      master.connect(dest);
      audioEl = new Audio();
      audioEl.srcObject = dest.stream;
      audioEl.loop = true;
      audioEl.volume = 1;
    } catch { master.connect(ctx.destination); }
    if (audioEl) master.connect(ctx.destination);   // also to speakers for desktop
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** A long looping noise buffer. kind: 'white' | 'brown' | 'rain' */
function noiseBuffer(kind) {
  const len = ctx.sampleRate * 8;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w * 0.4;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 4.5; }   // brown-ish
  }
  // Cross-fade the last 0.25s into the first so the loop point is inaudible.
  const x = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < x; i++) {
    const t = i / x;
    d[len - x + i] = d[len - x + i] * (1 - t) + d[i] * t;
  }
  return buf;
}

function startNoise(kind) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(kind === 'white' ? 'white' : 'brown');
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = kind === 'white' ? 9000 : kind === 'brown' ? 1200 : 2400;
  const g = ctx.createGain();
  // Levels balanced by measurement (tools: sounds.probeLevel) so swapping
  // sounds at 3am doesn't jolt anyone with a jump in volume.
  g.gain.value = kind === 'brown' ? 0.6 : kind === 'white' ? 0.8 : 0.55;
  src.connect(lp).connect(g).connect(master);
  src.start();
  nodes.push(src, lp, g);

  if (kind === 'rain') {
    // Slow swells + a sparse patter of droplets on top of the filtered noise.
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.07; lfoG.gain.value = 700;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    nodes.push(lfo, lfoG);
    const drop = () => {
      if (current !== 'rain') return;
      const o = ctx.createOscillator(), og = ctx.createGain(), t = ctx.currentTime;
      o.type = 'sine';
      o.frequency.setValueAtTime(900 + Math.random() * 1600, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(og).connect(master); o.start(t); o.stop(t + 0.15);
      setTimeout(drop, 120 + Math.random() * 500);
    };
    setTimeout(drop, 300);
  }
}

function startHeartbeat() {
  const bpm = 62, period = 60 / bpm;
  const thump = (t, gain) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(74, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  };
  // A soft noise bed underneath, like blood flow.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer('brown'); src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = 0.5;
  src.connect(lp).connect(g).connect(master); src.start();
  nodes.push(src, lp, g);

  let next = ctx.currentTime + 0.2;
  const schedule = () => {
    if (current !== 'heartbeat') return;
    while (next < ctx.currentTime + 1.5) {
      thump(next, 0.5);
      thump(next + period * 0.32, 0.3);
      next += period;
    }
    setTimeout(schedule, 500);
  };
  schedule();
}

function startLullaby() {
  // Pentatonic (no harsh intervals), slow, music-box timbre with a gentle echo.
  const scale = [392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];  // G4 pentatonic-ish
  const delay = ctx.createDelay(); delay.delayTime.value = 0.42;
  const dg = ctx.createGain(); dg.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  delay.connect(dg).connect(delay); delay.connect(wet).connect(master);
  nodes.push(delay, dg, wet);

  let step = 0, next = ctx.currentTime + 0.3;
  const note = (t, f, gain = 0.42) => {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.value = f; o2.frequency.value = f * 2.002;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(master); g.connect(delay);
    o.start(t); o2.start(t); o.stop(t + 2); o2.stop(t + 2);
  };
  const schedule = () => {
    if (current !== 'lullaby') return;
    while (next < ctx.currentTime + 2) {
      // a wandering, non-repetitive line that always lands on a soft interval
      const i = (step % 2 === 0) ? (step / 2) % scale.length
                                 : Math.floor(Math.random() * scale.length);
      note(next, scale[i], 0.36 + Math.random() * 0.12);
      if (step % 4 === 0) note(next, scale[0] / 2, 0.28);    // soft bass every bar
      next += 1.1;
      step++;
    }
    setTimeout(schedule, 700);
  };
  schedule();
}

export function stop({ fade = 0.8 } = {}) {
  if (!ctx || !current) { current = null; emit(); return; }
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0, t + fade);
  const dying = nodes; nodes = []; current = null;
  clearTimeout(timer); timer = null; timerEndsAt = 0;
  setTimeout(() => {
    for (const n of dying) { try { n.stop ? n.stop() : n.disconnect(); } catch {} }
    if (audioEl) audioEl.pause();
  }, fade * 1000 + 60);
  emit();
}

export function play(id) {
  ensureCtx();
  if (current === id) { stop(); return false; }
  if (current) { for (const n of nodes) { try { n.stop ? n.stop() : n.disconnect(); } catch {} } nodes = []; }
  current = id;
  if (id === 'heartbeat') startHeartbeat();
  else if (id === 'lullaby') startLullaby();
  else startNoise(id);
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
  master.gain.linearRampToValueAtTime(volume, t + 1.2);
  if (audioEl) audioEl.play().catch(() => {});
  setMediaSession(id);
  emit();
  return true;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master && current) master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.2);
  emit();
}

/** minutes = 0 clears the timer */
export function setTimer(minutes) {
  clearTimeout(timer); timer = null; timerEndsAt = 0;
  if (minutes > 0 && current) {
    timerEndsAt = Date.now() + minutes * 60000;
    timer = setTimeout(() => stop({ fade: 8 }), minutes * 60000);   // long, gentle fade-out
  }
  emit();
}

/**
 * Debug/test hook: measure the real output level over ~300 ms.
 * Used to prove a sound is actually producing audio, not just reporting that it is.
 */
export function probeLevel(ms = 300) {
  if (!ctx || !master) return Promise.resolve(0);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  master.connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0;
  return new Promise(resolve => {
    const t0 = performance.now();
    const step = () => {
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
      else { try { master.disconnect(an); } catch {} resolve(peak); }
    };
    step();
  });
}

function setMediaSession(id) {
  if (!('mediaSession' in navigator)) return;
  const s = SOUNDS.find(x => x.id === id);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s ? s.name : 'Sleep sound', artist: 'Lull', album: 'Sleep sounds',
    });
    navigator.mediaSession.setActionHandler('pause', () => stop());
    navigator.mediaSession.setActionHandler('stop', () => stop());
    navigator.mediaSession.playbackState = 'playing';
  } catch {}
}
