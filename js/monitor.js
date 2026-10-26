// ===== Lull — baby monitor (formerly the stand-alone Vuggevagt app) =====
//
// Baby phone : holds the microphone, measures the room, sends audio + levels.
// Parent phone: plays the audio, decides when a noise counts, raises the alarm.
//
// The alarm logic lives on the parent side on purpose — that is where the
// settings are, and it means no round trip before you get woken up.
//
// The monitor lives in its own full-screen layer (#monitor), outside Lull's
// #screen, because Lull redraws #screen every 15 s and a redraw must never touch
// a live microphone, peer connection or alarm. The Night tab only shows a card
// (cardHtml) and opens this layer.
//
// Read the rules in CLAUDE.md before changing anything here: the lost-link
// alarm matters more than everything else in this file.

import { S, load, set, newCode, pretty, normalise, forgetPairing } from './mon-store.js?v=25';
import { Signal, iceServers, API_URL } from './mon-signal.js?v=25';
import { Peer } from './mon-peer.js?v=25';
import { Meter, NoiseGate, sensToDb, dbToBar } from './mon-meter.js?v=25';
import * as Alarm from './mon-alarm.js?v=25';
import { Battery, batteryText, batteryWarning } from './mon-battery.js?v=25';
import { toast } from './sheets.js?v=25';

const $ = (s) => document.querySelector(s);
const on = (sel, ev, fn) => $(sel).addEventListener(ev, fn);

const DEAD_MS = 8000;          // no heartbeat for this long = the link is gone
const HOLD_STEPS = [0, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000];

let signal = null;
let peer = null;
let meter = null;
let gate = null;
let micStream = null;
let talkStream = null;
let wakeLock = null;
let watchdog = null;
let statsTimer = null;
let driftTimer = null;
let panelTimer = null;
let repairTimer = null;
let deadReason = null;   // 'link' heals by itself; 'blind' must not
let battery = null;
let saver = false;       // unplugged: spend as little as possible on the screen
let lastLvlSent = 0;
let lastPaint = 0;
let lvlPeak = -90;
let babyBat = null;      // the parent's copy of the baby phone's battery
let batWarned = null;
let lastLevelDb = -90;
let linkDead = false;
let alertActive = false;
let started = false;
let pillText = '';
let pillKind = '';
let changed = () => {};  // tells Lull to redraw the Night tab card

const MARKUP = `
  <!-- ---------- pairing: the baby phone ---------- -->
  <section id="scr-pair-baby" class="mscreen">
    <h2>Connect the two phones</h2>
    <p class="sub">Open Lull on <b>your own</b> phone, go to Night → Baby monitor → “This phone is with me”, and type this code — or send yourself the link.</p>
    <div class="code-box" id="code-show">––––-––––</div>
    <div class="mrow">
      <button class="btn ghost" id="btn-share">Send link</button>
      <button class="btn ghost" id="btn-copy">Copy code</button>
    </div>
    <p class="note" id="pair-status">Plug this phone in and leave it by the cot.</p>
    <button class="btn" id="btn-start-baby">Start monitoring</button>
    <button class="linkbtn" id="baby-back">Cancel and forget this pairing</button>
  </section>

  <!-- ---------- pairing: the parent phone ---------- -->
  <section id="scr-pair-parent" class="mscreen">
    <h2>Type the code</h2>
    <p class="sub">The code is on the phone by the baby.</p>
    <input id="code-input" class="code-input" inputmode="text" autocapitalize="characters"
           autocomplete="off" spellcheck="false" maxlength="9" placeholder="ABCD-2345">
    <p class="note" id="join-status"></p>
    <button class="btn" id="btn-join">Connect</button>
    <button class="linkbtn" id="parent-back">Cancel</button>
  </section>

  <!-- ---------- the baby phone: night screen ---------- -->
  <section id="scr-baby" class="mscreen mnight">
    <div id="baby-dark" class="dark-layer">
      <div id="baby-drift" class="drift">
        <div class="dot" id="baby-dot"></div>
        <div class="mini-meter"><i id="baby-mini-fill"></i></div>
      </div>
    </div>
    <div id="baby-panel" class="panel">
      <div class="status-line"><span class="mpill" id="baby-pill">Starting…</span></div>
      <div class="meter big"><i id="baby-fill"></i><u id="baby-thresh"></u></div>
      <p class="note" id="baby-note">Keep the screen on — otherwise Android switches the microphone off.</p>
      <p class="battery" id="baby-battery"></p>
      <p class="mwarn" id="baby-warn" hidden></p>
      <div class="mrow">
        <button class="btn ghost" id="baby-stop">Stop</button>
        <button class="btn ghost" id="baby-reset">Forget pairing</button>
      </div>
      <p class="tiny" id="baby-stats"></p>
    </div>
  </section>

  <!-- ---------- the parent phone ---------- -->
  <section id="scr-parent" class="mscreen">
    <div class="status-head">
      <button class="linkbtn mback" id="parent-min">‹ Lull</button>
      <span class="mpill" id="parent-pill">Connecting…</span>
      <button class="iconbtn" id="parent-settings" aria-label="Monitor settings">⚙️</button>
    </div>

    <div class="listen">
      <div class="meter huge"><i id="parent-fill"></i><u id="parent-thresh"></u></div>
      <p class="level-label" id="parent-level">–</p>
    </div>

    <p id="audio-hint" class="mwarn" hidden>⚠ Tap the screen once — the browser only allows sound after a tap, and until then the alarm is silent.</p>

    <div id="alert-banner" class="alert-banner" hidden>
      <b id="alert-title">The baby is making noise</b>
      <span id="alert-sub"></span>
      <button class="btn ghost small" id="alert-dismiss">OK</button>
    </div>

    <button class="talk-btn" id="talk-btn">
      <span class="talk-icon">🎙</span>
      <span>Hold to talk</span>
    </button>

    <div class="controls">
      <label class="ctl">
        <span>Volume</span>
        <input type="range" id="volume" min="0" max="100" value="85">
      </label>
      <label class="ctl">
        <span>Sensitivity <small id="sens-val"></small></span>
        <input type="range" id="sens" min="0" max="100" value="42">
      </label>
      <label class="mtoggle">
        <input type="checkbox" id="vox">
        <span>Quiet until the baby makes a sound</span>
      </label>
    </div>
    <p class="battery" id="baby-battery-line" hidden></p>
    <p class="note">You can go back to Lull and lock this phone — the monitor keeps listening and comes back here by itself if anything happens.</p>
    <p class="tiny" id="parent-stats"></p>
    <button class="linkbtn" id="parent-stop">Stop listening</button>
  </section>

  <!-- ---------- settings ---------- -->
  <section id="scr-settings" class="mscreen">
    <h2>Monitor settings</h2>
    <label class="ctl">
      <span>A sound must last <b id="hold-val">1.5</b> seconds before the alarm goes</span>
      <input type="range" id="hold" min="0" max="10" step="1" value="3">
    </label>
    <button class="btn ghost" id="btn-notify">Allow notifications</button>
    <p class="note">Notifications are an extra channel on top of the sound — they only work while the app is still running.</p>
    <button class="btn ghost" id="btn-test-alarm">Test the alarm</button>
    <p class="note">Try it once with the screen off, so you know what it sounds like at 3am.</p>
    <button class="btn danger" id="btn-unpair">Forget pairing</button>
    <button class="linkbtn" id="settings-back">Back</button>
  </section>

  <!-- ---------- help ---------- -->
  <section id="scr-help" class="mscreen">
    <h2>How the monitor works</h2>
    <div class="help">
      <p><b>The sound goes straight between the two phones</b>, encrypted all the way. The server only helps the phones find each other — it can't hear or store anything.</p>
      <p><b>The phone by the baby must keep its screen on</b> and be plugged in. That's how Android works: a browser in the background loses the microphone. The screen goes completely black, so it doesn't light up the cot.</p>
      <p><b>Your own phone can have its screen off</b> and sit in your pocket. It behaves like a music player, which uses little power.</p>
      <p><b>Pram with no charger?</b> Fine for a nap, not for a whole night. As soon as the baby phone isn't charging it turns itself down and shows how many percent it uses per hour — and how long is left. Your phone warns you at 20% and again at 10%. Turn <b>auto-brightness off</b> and the brightness right down: in sunlight the phone turns itself up, and the screen eats the battery.</p>
      <p><b>Playing a sleep sound on the baby phone?</b> The microphone hears it too. Turn Sensitivity down until the bar stays below the line when the room is quiet.</p>
      <p><b>If the connection dies, your phone wails.</b> On purpose. A baby monitor that goes quiet without saying so is more dangerous than no baby monitor.</p>
      <p class="mwarn">This is a home-made helper, not a medical device. Use it as an extra ear, not a guarantee.</p>
    </div>
    <button class="linkbtn" id="help-back">Back</button>
  </section>

  <audio id="remote-audio" playsinline autoplay></audio>
  <audio id="baby-audio" playsinline autoplay></audio>`;

// ---------------------------------------------------------------- screens ---
let current = null;
function show(id) {
  current = id;
  const root = $('#monitor');
  root.hidden = !id;
  root.querySelectorAll('.mscreen').forEach((s) => s.classList.toggle('active', s.id === id));
  document.body.classList.toggle('mon-night', id === 'scr-baby');
  document.body.classList.toggle('mon-open', !!id);
  changed();
}
const close = () => show(null);

// ------------------------------------------------------------------- boot ---
export function init({ onChange } = {}) {
  if (onChange) changed = onChange;
  load();
  const root = document.createElement('div');
  root.id = 'monitor';
  root.hidden = true;
  root.innerHTML = MARKUP;
  document.body.appendChild(root);
  wireUi();
  // Earn the right to make a sound as early as possible, and keep trying.
  Alarm.armOnFirstGesture(() => { const b = $('#audio-hint'); if (b) b.hidden = true; });

  // a shared link carries the code: .../lull/#p=ABCD2345
  const hash = new URLSearchParams(location.hash.slice(1));
  const linked = normalise(hash.get('p'));
  if (linked && linked.length === 8) {
    set({ code: linked, role: S.role === 'baby' ? 'baby' : 'parent' });
    history.replaceState(null, '', location.pathname + location.search);
    $('#code-input').value = pretty(linked);
    if (S.role === 'parent') return startParent();
  }

  // Pick up where we left off if this phone was monitoring when it closed.
  if (S.active && S.code && S.role === 'parent') return startParent();
  if (S.active && S.code && S.role === 'baby') { showBabyCode(); show('scr-pair-baby'); }
}

// What the Night tab shows. Plain HTML; app.js wires the data-mon buttons.
export function cardHtml() {
  const head = `<h2 class="sec">Baby monitor</h2>`;
  if (started) {
    const what = S.role === 'baby' ? '👶 This phone is listening by the baby' : '🎧 This phone is listening';
    return `${head}<div class="card mon-card">
      <div class="mon-line"><b>${what}</b><span class="mpill ${pillKind}">${pillText || '…'}</span></div>
      <button class="btn" data-mon="open">Open the monitor</button></div>`;
  }
  if (S.code && S.role === 'baby') {
    return `${head}<div class="card mon-card">
      <div class="mon-line"><b>👶 Paired as the baby phone</b><span class="faint">${pretty(S.code)}</span></div>
      <button class="btn" data-mon="baby">Start monitoring</button>
      <button class="linkbtn" data-mon="forget">Forget pairing</button></div>`;
  }
  if (S.code && S.role === 'parent') {
    return `${head}<div class="card mon-card">
      <div class="mon-line"><b>🎧 Paired as your phone</b><span class="faint">${pretty(S.code)}</span></div>
      <button class="btn" data-mon="listen">Start listening</button>
      <button class="linkbtn" data-mon="forget">Forget pairing</button></div>`;
  }
  return `${head}<div class="card mon-card">
    <p class="faint" style="margin:0 0 10px">Two phones: one stays by the baby, one stays with you. The sound goes straight between them, encrypted.</p>
    <div class="mon-pick">
      <button class="mon-big" data-mon="baby"><span class="emoji">👶</span><b>This phone is with the baby</b>
        <span>Stays by the cot and listens. Must be plugged in.</span></button>
      <button class="mon-big" data-mon="parent"><span class="emoji">🎧</span><b>This phone is with me</b>
        <span>In your pocket. Tells you when the baby makes a sound.</span></button>
    </div>
    <button class="linkbtn" data-mon="help">How does it work?</button></div>`;
}

// Called by app.js for a data-mon button on the Night tab.
export function action(what) {
  if (what === 'open') return show(S.role === 'baby' ? 'scr-baby' : 'scr-parent'), revealPanel();
  if (what === 'help') return show('scr-help');
  if (what === 'forget') { forgetPairing(); changed(); return; }
  if (what === 'listen') return startParent();
  if (what === 'baby') {
    if (!S.code || S.role !== 'baby') set({ code: newCode(), role: 'baby' });
    showBabyCode();
    return show('scr-pair-baby');
  }
  if (what === 'parent') {
    set({ role: 'parent' });
    if (S.code) $('#code-input').value = pretty(S.code);
    show('scr-pair-parent');
    $('#code-input').focus();
  }
}

export const status = () => ({ started, role: S.role, pill: pillText, kind: pillKind, alert: alertActive, dead: linkDead, open: !!current });

function wireUi() {
  on('#help-back', 'click', () => (started ? action('open') : close()));
  on('#baby-back', 'click', () => { forgetPairing(); close(); });
  on('#parent-back', 'click', () => { forgetPairing(); close(); });

  on('#btn-share', 'click', async () => {
    const url = `${location.origin}${location.pathname}#p=${S.code}`;
    const text = `Lull baby monitor code: ${pretty(S.code)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Lull baby monitor', text, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied'); }
    } catch (e) { /* the user closed the share sheet */ }
  });
  on('#btn-copy', 'click', async () => {
    try { await navigator.clipboard.writeText(pretty(S.code)); toast('Code copied'); }
    catch (e) { toast("Couldn't copy — write the code down"); }
  });

  on('#btn-start-baby', 'click', () => startBaby());
  on('#baby-stop', 'click', () => stopAll());
  on('#baby-reset', 'click', () => unpair());
  on('#parent-stop', 'click', () => stopAll());
  on('#parent-min', 'click', () => close());

  on('#code-input', 'input', (e) => {
    const raw = normalise(e.target.value).slice(0, 8);
    e.target.value = raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4) : raw;
  });
  on('#btn-join', 'click', () => {
    const code = normalise($('#code-input').value);
    if (code.length !== 8) { $('#join-status').textContent = 'The code is 8 characters.'; return; }
    set({ code, role: 'parent' });
    startParent();
  });

  // --- parent controls
  on('#volume', 'input', (e) => {
    set({ volume: e.target.value / 100 });
    applyVolume();
  });
  on('#sens', 'input', (e) => {
    set({ sens: +e.target.value });
    if (gate) gate.set(sensToDb(S.sens));
    paintThreshold();
  });
  on('#vox', 'change', (e) => { set({ vox: e.target.checked }); applyVolume(); });
  on('#parent-settings', 'click', () => show('scr-settings'));
  on('#settings-back', 'click', () => (started ? show('scr-parent') : close()));
  on('#hold', 'input', (e) => {
    const ms = HOLD_STEPS[+e.target.value];
    set({ holdMs: ms });
    $('#hold-val').textContent = (ms / 1000).toFixed(1);
    if (gate) gate.set(sensToDb(S.sens), ms);
  });
  on('#btn-notify', 'click', async () => {
    try {
      const p = await Notification.requestPermission();
      set({ notify: p === 'granted' });
      toast(p === 'granted' ? 'Notifications on' : 'Not allowed');
    } catch (e) { toast('Notifications are not supported here'); }
  });
  on('#btn-test-alarm', 'click', async () => {
    await Alarm.unlock();
    toast('The alarm sounds in 5 seconds — turn the screen off now');
    setTimeout(() => { Alarm.startDead(); setTimeout(() => Alarm.stopDead(), 6000); }, 5000);
  });
  on('#btn-unpair', 'click', () => unpair());
  on('#alert-dismiss', 'click', () => clearAlert(true));

  // hold-to-talk
  const talk = $('#talk-btn');
  const down = (e) => { e.preventDefault(); startTalking(); };
  const up = (e) => { e.preventDefault(); stopTalking(); };
  talk.addEventListener('pointerdown', down);
  talk.addEventListener('pointerup', up);
  talk.addEventListener('pointercancel', up);
  talk.addEventListener('pointerleave', up);

  // tapping the black night screen brings the panel up for a few seconds
  on('#baby-dark', 'click', () => revealPanel());

  document.addEventListener('visibilitychange', onVisibility);
}

// -------------------------------------------------------------- baby side ---
function showBabyCode() {
  $('#code-show').textContent = pretty(S.code);
}

async function startBaby() {
  if (started) return;
  try {
    Alarm.unlock();  // fire and forget — a tap already happened, but never block on it
    // ?fakemic=1 swaps the microphone for a generated tone, so the whole chain
    // can be tested on a machine with no microphone and no permission prompt.
    micStream = new URLSearchParams(location.search).has('fakemic')
      ? window.__vv.fakeMic()
      : await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,   // needed, or talk-back howls
          noiseSuppression: false,  // we WANT the faint sounds
          autoGainControl: false,   // keep the level meter honest
        },
      });
  } catch (e) {
    $('#pair-status').textContent = 'No access to the microphone. Allow the microphone in the browser and try again.';
    return;
  }

  started = true;
  set({ active: true });
  show('scr-baby');
  revealPanel();

  meter = new Meter();
  await meter.start(micStream);
  meter.addEventListener('level', ({ detail }) => {
    lastLevelDb = detail.db;
    if (detail.db > lvlPeak) lvlPeak = detail.db;

    // Only paint what is actually on screen. On the dark night screen the panel
    // is hidden, so painting its bars is pure battery burnt for nobody.
    const panelOpen = document.body.classList.contains('mon-panel');
    if (panelOpen) paintBar('#baby-fill', detail.db);
    const now = Date.now();
    const paintEvery = saver ? 1000 : 200;
    if (now - lastPaint >= paintEvery) { paintBar('#baby-mini-fill', lvlPeak); lastPaint = now; }

    // Send the PEAK since the last message, never the latest sample: throttling
    // to save radio must not let a short cry slip through between packets.
    const sendEvery = saver ? 500 : 200;
    if (peer && now - lastLvlSent >= sendEvery) {
      peer.post({ t: 'lvl', v: Math.round(lvlPeak) });
      lastLvlSent = now;
      lvlPeak = -90;
    }
  });

  await connect();
  await acquireWakeLock();
  startDrift();
  startStats('#baby-stats');

  // A phone in a pram is not on a charger, and then the screen we are forced to
  // keep on is the whole budget. Measure it, say it out loud, and spend less.
  battery = new Battery();
  // listen BEFORE starting: the first reading is emitted during start()
  battery.addEventListener('change', ({ detail }) => {
    setSaver(!detail.charging);
    const line = $('#baby-battery');
    if (line) line.textContent = batteryText(detail);
    if (peer) peer.post({ t: 'bat', b: detail });
  });
  if (!(await battery.start())) {
    const line = $('#baby-battery');
    if (line) line.textContent = "This browser can't read the battery — keep an eye on the power yourself.";
  }
}

// Keeping the screen awake is the whole reason the baby phone works at all.
async function acquireWakeLock() {
  try {
    if (!('wakeLock' in navigator)) { babyWarn("This browser can't keep the screen on — set the screen timeout to “never”."); return; }
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
    babyWarn(null);
  } catch (e) {
    babyWarn("Couldn't keep the screen on. Set the screen timeout to “never” in the phone's settings.");
  }
}

// Off the charger every repaint counts, so the night screen stops breathing
// and the little meter updates once a second instead of ten times.
function setSaver(on) {
  if (saver === on) return;
  saver = on;
  document.body.classList.toggle('mon-saver', on);
  const note = $('#baby-note');
  if (note) {
    note.textContent = on
      ? "Not charging — the screen has to stay on for the microphone to work, so the battery runs down. See how long is left below."
      : 'Keep the screen on — otherwise Android switches the microphone off.';
  }
}

function babyWarn(msg) {
  const el = $('#baby-warn');
  el.hidden = !msg;
  if (msg) el.textContent = '⚠ ' + msg;
}

// The panel is hidden after a few seconds so the room goes properly dark.
function revealPanel() {
  document.body.classList.add('mon-panel');
  clearTimeout(panelTimer);
  panelTimer = setTimeout(() => document.body.classList.remove('mon-panel'), 8000);
}

// A screen that is lit for eight hours a night, every night, will burn its
// image into an OLED panel. Drift the few lit pixels slowly around.
function startDrift() {
  clearInterval(driftTimer);
  let step = 0;
  const move = () => {
    const el = $('#baby-drift');
    if (!el) return;
    const a = (step++ * Math.PI) / 6;
    el.style.transform = `translate(${Math.cos(a) * 34}px, ${Math.sin(a) * 52}px)`;
  };
  move();
  driftTimer = setInterval(move, 60000);
}

// ------------------------------------------------------------ parent side ---
async function startParent() {
  if (started) return show('scr-parent');   // the #p= link already started us
  started = true;
  set({ active: true });
  show('scr-parent');
  Alarm.unlock().then(showAudioHint);

  $('#volume').value = Math.round(S.volume * 100);
  $('#sens').value = S.sens;
  $('#vox').checked = S.vox;
  $('#hold').value = Math.max(0, HOLD_STEPS.indexOf(S.holdMs)) || 3;
  $('#hold-val').textContent = (S.holdMs / 1000).toFixed(1);
  paintThreshold();

  gate = new NoiseGate({ thresholdDb: sensToDb(S.sens), holdMs: S.holdMs });

  await connect();
  startStats('#parent-stats');
  startWatchdog();
}

// If the browser will not let us make a sound yet, the alarm is mute — and a
// mute baby monitor is the one failure the user must never be unaware of.
function showAudioHint() {
  const el = $('#audio-hint');
  if (!el) return;
  el.hidden = Alarm.running();
}

function applyVolume() {
  const a = $('#remote-audio');
  // Never mute and never truly zero: a silent element lets Android treat the
  // page as "not playing media" and freeze it. A whisper keeps it alive.
  const quiet = S.vox && !alertActive;
  a.volume = quiet ? 0.05 : Math.max(0.05, S.volume);
  a.muted = false;
}

function paintThreshold() {
  const pct = dbToBar(sensToDb(S.sens)) * 100;
  document.querySelectorAll('#parent-thresh, #baby-thresh').forEach((el) => { el.style.left = pct + '%'; });
  const val = $('#sens-val');
  if (val) val.textContent = Math.round(sensToDb(S.sens)) + ' dB';
}

function paintBar(sel, db) {
  const el = $(sel);
  if (!el) return;
  el.style.width = (dbToBar(db) * 100).toFixed(1) + '%';
  el.classList.toggle('hot', db >= sensToDb(S.sens));
}

// The parent phone's judgement: is this noise worth waking someone for?
function onLevel(db) {
  lastLevelDb = db;
  paintBar('#parent-fill', db);
  $('#parent-level').textContent = db <= -89 ? 'completely quiet' : Math.round(db) + ' dB';
  if (!gate) return;
  const edge = gate.push(db);
  if (edge === 'rise') raiseAlert();
  else if (edge === 'fall') clearAlert(false);
}

// The baby phone's battery is the parent phone's problem: when it dies, the
// monitoring stops. Warn well before that, not after.
function onBabyBattery(b) {
  babyBat = b;
  const el = $('#baby-battery-line');
  if (el) {
    el.textContent = b.pct == null ? '' : `Baby phone: ${batteryText(b)}`;
    el.hidden = b.pct == null;
    el.classList.toggle('mwarn', !b.charging && b.pct != null && b.pct <= 20);
  }
  const w = batteryWarning(b);
  if (!w) { batWarned = null; return; }
  if (batWarned === w.level) return;      // say each step once, not every minute
  batWarned = w.level;
  toast(w.text);
  Alarm.notify('Lull baby monitor', w.text);
  if (w.level === 'critical') { Alarm.wake(); Alarm.buzz([300, 150, 300]); }
}

function raiseAlert() {
  if (alertActive) return;
  alertActive = true;
  applyVolume();
  $('#alert-banner').hidden = false;
  $('#alert-title').textContent = 'The baby is making noise';
  $('#alert-sub').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  Alarm.wake();
  Alarm.notify('Lull baby monitor', 'The baby is making noise');
  document.body.classList.add('mon-alerting');
  show('scr-parent');                     // come forward from wherever Lull was
}

function clearAlert(byHand) {
  if (!alertActive && !byHand) return;
  alertActive = false;
  applyVolume();
  $('#alert-banner').hidden = true;
  document.body.classList.remove('mon-alerting');
  if (gate) { gate.active = false; gate.overSince = 0; }
  changed();
}

// --------------------------------------------------------------- the link ---
async function connect() {
  const ice = await iceServers();

  signal = new Signal({ code: S.code, peerId: S.peerId, role: S.role });
  peer = new Peer({ role: S.role, signal });
  await peer.build(ice);

  if (S.role === 'baby' && micStream) {
    await peer.setMicTrack(micStream.getAudioTracks()[0]);
  }

  peer.addEventListener('track', ({ detail }) => {
    const el = S.role === 'parent' ? $('#remote-audio') : $('#baby-audio');
    el.srcObject = detail.stream;
    el.play().catch(() => { /* autoplay is allowed: we came from a tap */ });
    if (S.role === 'parent') {
      applyVolume();
      setupMediaSession();
    }
  });

  peer.addEventListener('ctl', ({ detail }) => {
    if (detail.t === 'lvl' && S.role === 'parent') onLevel(detail.v);
    if (detail.t === 'bat' && S.role === 'parent') onBabyBattery(detail.b);
    if (detail.t === 'blind') babyWentBlind(detail.on);
    if (detail.t === 'talk' && S.role === 'baby') halfDuplex(detail.on);
    if (detail.t === 'bye') markDead('The other phone was stopped');
  });

  peer.addEventListener('state', ({ detail }) => {
    const s = detail.state;
    if (s === 'connected') onLinkUp();
    if (s === 'failed' || s === 'closed') onLinkTrouble();
    if (s === 'disconnected') {
      setPill('Lost the connection…', 'warn');
      // ICE can sit in 'disconnected' indefinitely when the other phone simply
      // disappears, so don't wait for 'failed' that may never come.
      clearTimeout(repairTimer);
      repairTimer = setTimeout(() => {
        if (peer && peer.pc && peer.pc.connectionState !== 'connected') { onLinkTrouble(); rebuild(); }
      }, 5000);
    }
    if (s === 'connected') clearTimeout(repairTimer);
  });

  peer.addEventListener('channel', ({ detail }) => {
    if (detail.open) onLinkUp();
  });

  signal.addEventListener('msg', ({ detail }) => {
    const m = detail;
    if (m.t === 'hello') {
      setPill(m.peerPresent ? 'Connecting…' : 'Waiting for the other phone…', 'warn');
      // the baby leads: if the parent is already here, start the handshake
      if (S.role === 'baby' && m.peerPresent) kick();
      return;
    }
    if (m.t === 'peer-joined') {
      // The other phone has a brand-new, empty connection — reusing our old one
      // half-works at best. Start clean; it is the one path that always works.
      if (S.role === 'baby') rebuild();
      return;
    }
    if (m.t === 'peer-left') {
      // an old socket closing must not scare us while the phones are actually
      // talking to each other — the peer link is the source of truth
      if (!peer || !peer.pc || peer.pc.connectionState !== 'connected') {
        setPill('The other phone disappeared', 'warn');
      }
      return;
    }
    if (m.t === 'no-peer') return;
    peer.handle(m);
  });

  // A socket that (re)opens after a wobble may be holding an offer that never
  // reached anyone. Push it again rather than waiting for the other side.
  signal.addEventListener('open', () => {
    if (S.role === 'baby' && peer && peer.pc && peer.pc.connectionState !== 'connected') kick();
  });

  signal.addEventListener('rejected', () => {
    setPill('The pairing was reset', 'bad');
    toast('The pairing was reset on the other phone');
  });

  signal.connect();
}

// Throw the connection away and start a fresh one. Deliberately blunt: during
// a night-time repair, "start over" beats "work out what survived".
let rebuilding = false;
async function rebuild() {
  if (!peer || rebuilding || S.role !== 'baby') return;
  rebuilding = true;
  try {
    if (signal && !signal.open) signal.connect();
    const ice = await iceServers();
    await peer.build(ice);
    if (micStream) await peer.setMicTrack(micStream.getAudioTracks()[0]);
    // negotiationneeded fires from the track above; send it over the server,
    // because by definition we have no working peer link right now
    await new Promise((r) => setTimeout(r, 250));
    if (peer.pc && peer.pc.localDescription) peer.post({ t: 'sdp', sdp: peer.pc.localDescription }, true);
  } catch (e) {
    /* the watchdog will come round again */
  } finally { rebuilding = false; }
}

// Nudge the negotiation. Adding the microphone track fires negotiationneeded
// immediately — usually before the socket is even open and long before the
// other phone arrives — so that first offer goes nowhere. When the parent
// finally turns up we must re-send the offer we are already holding, not
// refuse because the connection is no longer "stable".
async function kick() {
  if (!peer || !peer.pc) return;
  const pc = peer.pc;
  if (pc.connectionState === 'connected') return;
  if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
    peer.post({ t: 'sdp', sdp: pc.localDescription }, true);
    return;
  }
  if (pc.signalingState !== 'stable') return;
  try {
    peer.makingOffer = true;
    await peer.pc.setLocalDescription(await peer.offerWithOpusTuning(peer.pc));
    peer.post({ t: 'sdp', sdp: peer.pc.localDescription }, true);
  } catch (e) { /* negotiationneeded will retry */ }
  finally { peer.makingOffer = false; }
}

function onLinkUp() {
  // A healthy network link does NOT mean we can hear the baby again. If the
  // baby phone told us its microphone was taken away, only the baby phone can
  // tell us it is back — otherwise a reconnect would quietly cancel the very
  // alarm that says "you are not being watched".
  if (linkDead && deadReason !== 'blind') clearDead();
  if (linkDead) return;   // still deaf: never paint a healthy status over an alarm
  setPill(S.role === 'parent' ? 'Listening' : 'Connected', 'ok');
  // The battery only emits when it changes, which can be many minutes away.
  // Tell the parent where we stand the moment there is a link to tell it over.
  if (S.role === 'baby' && battery && peer) peer.post({ t: 'bat', b: battery.snapshot() });
  babyWarn(null);
  // The parent phone drops the signalling socket once the phones can talk
  // directly — every open socket is a radio wake-up all night long. The baby
  // phone is on a charger, so it stays reachable.
  if (S.role === 'parent' && signal) setTimeout(() => { if (!linkDead && peer && peer.dc && peer.dc.readyState === 'open') signal.sleep(); }, 10000);
}

function clearDead() {
  linkDead = false;
  deadReason = null;
  Alarm.stopDead();
  document.body.classList.remove('mon-dead');
  $('#alert-banner').hidden = true;
}

function onLinkTrouble() {
  if (signal && !signal.open) signal.connect();   // wake the socket to repair
  setPill('Repairing the connection…', 'warn');
}

function startWatchdog() {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    if (!peer) return;
    const quiet = peer.silentFor();
    showAudioHint();
    if (quiet > DEAD_MS) markDead('No contact with the phone by the baby');
    // A blind baby phone still sends heartbeats for a while — its microphone is
    // gone, not its network. Only a genuine link failure may heal on its own.
    else if (linkDead && deadReason === 'link' && quiet < DEAD_MS) onLinkUp();
  }, 1000);
}

// The one alarm that matters: we are no longer watching, and you must know.
function markDead(reason, kind = 'link') {
  if (linkDead) return;
  linkDead = true;
  deadReason = kind;
  document.body.classList.add('mon-dead');
  setPill('CUT OFF', 'bad');
  if (S.role === 'parent') {
    Alarm.startDead();
    Alarm.notify('Lull baby monitor — CUT OFF', reason);
    $('#alert-banner').hidden = false;
    $('#alert-title').textContent = 'The connection is gone';
    $('#alert-sub').textContent = reason;
    show('scr-parent');                   // come forward from wherever Lull was
  }
  if (signal) signal.connect();
  if (peer) peer.restartIce();
  if (S.role === 'baby') rebuild();
}

// The baby phone lost focus: Android has taken its microphone away, even though
// the network link is still perfectly healthy. This is the failure that looks
// like nothing is wrong, which is exactly why it gets the loud alarm.
function babyWentBlind(blind) {
  if (S.role !== 'parent') return;
  if (blind === false) { clearDead(); onLinkUp(); return; }
  markDead('The phone by the baby went into the background — its microphone is off', 'blind');
}

function setPill(text, kind) {
  // While the link is dead, repair chatter ("Repairing…", "Connecting…") must
  // not paint over the alarm's CUT OFF label — the same rule as onLinkUp().
  if (linkDead && kind !== 'bad') return;
  pillText = text; pillKind = kind || '';
  ['#parent-pill', '#baby-pill'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.textContent = text;
    el.className = 'mpill ' + (kind || '');
  });
  changed();
}

// ------------------------------------------------------------- talk back ----
async function startTalking() {
  if (S.role !== 'parent' || !peer) return;
  try {
    if (!talkStream) {
      talkStream = new URLSearchParams(location.search).has('fakemic')
        ? window.__vv.fakeMic(320)
        : await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      await peer.setTalkTrack(talkStream.getAudioTracks()[0]);
    }
    talkStream.getAudioTracks().forEach((t) => { t.enabled = true; });
    peer.post({ t: 'talk', on: true });
    $('#talk-btn').classList.add('live');
    Alarm.talkOn();
  } catch (e) {
    toast('No access to the microphone on this phone');
  }
}

function stopTalking() {
  if (!talkStream) return;
  talkStream.getAudioTracks().forEach((t) => { t.enabled = false; });
  if (peer) peer.post({ t: 'talk', on: false });
  $('#talk-btn').classList.remove('live');
  Alarm.talkOff();
}

// While a parent is talking the baby phone stops sending, so the two speakers
// cannot feed into each other and scream.
function halfDuplex(talking) {
  if (!micStream) return;
  micStream.getAudioTracks().forEach((t) => { t.enabled = !talking; });
  const el = $('#baby-audio');
  if (el) el.volume = 1;
}

// -------------------------------------------------------------- lifecycle ---
async function onVisibility() {
  if (document.visibilityState === 'visible') {
    if (S.role === 'baby' && started) {
      await acquireWakeLock();          // Android takes the lock back when hidden
      if (meter) await meter.resume();
      revealPanel();
      if (peer) peer.post({ t: 'blind', on: false });   // we can hear again
    }
    if (meter) await meter.resume();
    return;
  }
  // hidden
  if (S.role === 'baby' && started) {
    // Tell the parent instantly rather than making them wait for the watchdog:
    // a backgrounded baby phone is a deaf baby phone.
    if (peer) peer.post({ t: 'blind', on: true });
  }
}

function startStats(sel) {
  clearInterval(statsTimer);
  let lastBytes = 0;
  let lastAt = Date.now();
  statsTimer = setInterval(async () => {
    if (!peer) return;
    const s = await peer.stats();
    if (!s) return;
    const now = Date.now();
    const kbps = lastBytes ? ((s.bytes - lastBytes) * 8) / (now - lastAt) : 0;
    lastBytes = s.bytes; lastAt = now;
    const path = s.candidateType === 'relay' ? 'via relay' : s.candidateType ? 'direct' : '—';
    const el = $(sel);
    if (el) el.textContent = `${path} · ${kbps.toFixed(1)} kbit/s${s.rtt != null ? ` · ${s.rtt} ms` : ''}`;
  }, 3000);
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Lull baby monitor', artist: 'Listening to the baby',
      artwork: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = 'playing';
    // Do not let a lock-screen tap silence the monitor by accident.
    navigator.mediaSession.setActionHandler('pause', () => {
      $('#remote-audio').play().catch(() => {});
      toast('The baby monitor keeps running');
    });
  } catch (e) { /* not supported */ }
}

function stopAll() {
  if (peer) peer.post({ t: 'bye' });
  started = false;
  set({ active: false });
  clearInterval(watchdog); clearInterval(statsTimer); clearInterval(driftTimer);
  Alarm.stopDead();
  linkDead = false; alertActive = false; pillText = ''; pillKind = '';
  document.body.classList.remove('mon-dead', 'mon-alerting', 'mon-panel');
  $('#alert-banner').hidden = true;
  if (peer) { peer.teardown(); peer = null; }
  if (signal) { signal.sleep(); signal = null; }
  if (meter) { meter.stop(); meter = null; }
  if (battery) { battery.stop(); battery = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (talkStream) { talkStream.getTracks().forEach((t) => t.stop()); talkStream = null; }
  if (wakeLock) { try { wakeLock.release(); } catch (e) { /* gone */ } wakeLock = null; }
  close();
}

async function unpair() {
  try {
    await fetch(`${API_URL}/room/${S.code}/unbond?peer=${S.peerId}`, { method: 'GET' });
  } catch (e) { /* offline — local state still clears */ }
  stopAll();
  forgetPairing();
  toast('Pairing forgotten on both phones');
  changed();
}

// Test hooks. `?ns=` gives a tab its own storage so one machine can play both
// phones; the fake microphone lets the whole chain be tested without a device.
window.__vv = {
  get state() { return { ...S, started, linkDead, alertActive, lastLevelDb, screen: current }; },
  get peer() { return peer; },
  get signal() { return signal; },
  stats: () => (peer ? peer.stats() : null),
  level: (db) => onLevel(db),
  saver: (on) => setSaver(on),          // pretend the charger was pulled out
  battery: () => (battery ? battery.snapshot() : null),
  babyBattery: () => babyBat,
  fakeNoise(db = -20, ms = 2000) {   // pretend the room got loud
    const t0 = Date.now();
    const iv = setInterval(() => {
      onLevel(db);
      if (Date.now() - t0 > ms) { clearInterval(iv); onLevel(-85); }
    }, 100);
  },
  fakeMic(freq = 440) {              // a microphone that needs no permission
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    osc.frequency.value = freq;
    gain.gain.value = 0.0005;        // near silence until loud() is called
    osc.connect(gain).connect(dest);
    osc.start();
    window.__vv._fake = { ctx, gain };
    return dest.stream;
  },
  loud(v = 0.35) { if (window.__vv._fake) window.__vv._fake.gain.gain.value = v; },
  errors: [],
};

window.addEventListener('error', (e) => window.__vv.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__vv.errors.push(String(e.reason)));
