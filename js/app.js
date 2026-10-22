// ===== Lull — app shell, screens and wiring =====
import * as store from './store.js';
import * as sheets from './sheets.js';
import * as sounds from './sounds.js';
import * as notify from './notify.js';
import { predict, ongoingSleep, isNightSleep, observedWindows } from './predict.js';
import { band, ageDays, BANDS } from './science.js';
import { daySummary, lastDays, averages } from './stats.js';
import { timeline, axis24, meter, columns, esc } from './charts.js';
import { MIN, DAY, clock, dur, relative, startOfDay, median, clamp } from './util.js';

const $ = (sel) => document.querySelector(sel);
let tab = 'home';
let logDay = startOfDay(Date.now());     // which day the Log screen is showing
let tickTimer = null;

/* ---------------- settings helpers ---------------- */
const S = () => store.settings();
const babyName = () => S().name || 'Baby';
const birthMs  = () => S().birth || null;
const unit     = () => S().unit || 'ml';
const theme    = () => S().theme || 'dark';

function ageLabel(now = Date.now()) {
  if (!birthMs()) return '';
  const d = ageDays(birthMs(), now);
  const b = band(birthMs(), now);
  let main;
  if (d < 14) main = `${d} day${d === 1 ? '' : 's'} old`;
  else if (d < 120) main = `${Math.round(d / 7)} weeks old`;
  else main = `${Math.floor(d / 30.44)} months old`;
  return `${main} · ${b.label}`;
}

const amount = (ml) => unit() === 'oz' ? `${(ml / 29.5735).toFixed(1)} oz` : `${ml} ml`;

/* ---------------- home ---------------- */
function homeScreen() {
  const now = Date.now();
  const evs = store.events();
  const p = predict({ events: evs, birthMs: birthMs(), nowMs: now });
  const today = daySummary(evs, startOfDay(now), now);

  /* --- the ring: how far through the current nap / awake window are we --- */
  let frac = 0, past = false, inner;
  if (p.state === 'asleep') {
    // A night sleep has no meaningful "progress", so the ring stays empty.
    frac = p.isNight ? 0 : (p.expectedNapMin ? clamp(p.sleepMin / p.expectedNapMin, 0, 1) : 0.5);
    inner = `<span class="emoji">😴</span>
             <span class="big">${dur(p.sleepMin)}</span>
             <span class="lbl">${p.isNight ? 'Asleep · night' : 'Asleep'}</span>
             <span class="hint">Tap when ${esc(babyName())} wakes up</span>`;
  } else if (p.awakeSince) {
    frac = clamp(p.awakeMin / p.windowMin, 0, 1);
    past = p.status === 'past';
    inner = `<span class="emoji">${past ? '🥱' : '👀'}</span>
             <span class="big">${dur(p.awakeMin)}</span>
             <span class="lbl">Awake</span>
             <span class="hint">Tap when ${esc(babyName())} falls asleep</span>`;
  } else {
    inner = `<span class="emoji">🌙</span>
             <span class="big" style="font-size:22px">Start sleep</span>
             <span class="hint">Tap the moment ${esc(babyName())} drops off</span>`;
  }
  const R = 108, C = 2 * Math.PI * R;
  const ring = `
    <div class="hero"><div class="ringwrap">
      <svg viewBox="0 0 236 236" aria-hidden="true">
        <circle class="ring-bg" cx="118" cy="118" r="${R}"></circle>
        <circle class="ring-fg ${past ? 'past' : ''}" cx="118" cy="118" r="${R}"
                stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"></circle>
      </svg>
      <button class="sleepbtn ${p.state === 'asleep' ? 'asleep' : ''}" id="sleep-toggle">${inner}</button>
    </div></div>`;

  /* --- prediction card --- */
  let pred;
  if (!birthMs()) {
    pred = `<div class="card"><div class="faint">Add a birth date in settings and Lull can predict naps.</div></div>`;
  } else if (p.state === 'asleep') {
    pred = `<div class="card predict">
      <div class="when">
        <b>${p.expectedWakeAt ? clock(p.expectedWakeAt) : 'Night sleep'}</b>
        <div class="sub">${p.expectedWakeAt
          ? `might wake ${relative(p.expectedWakeAt, now)} · usual nap ${dur(p.expectedNapMin)}`
          : `no wake-up estimate at night — tap the button when ${esc(babyName())} wakes`}</div>
      </div>
      <span class="pill accent">${p.isNight ? 'Night' : 'Nap'}</span></div>`;
  } else if (!p.awakeSince) {
    const [lo, hi] = p.band.ww;
    pred = `<div class="card predict">
      <div class="when"><b>${dur(lo)}–${dur(hi)}</b>
      <div class="sub">typical awake window at ${esc(p.band.label)} — log one sleep and Lull starts predicting</div></div>
      <span class="pill">Age guide</span></div>`;
  } else {
    const label = p.isBedtime ? 'Bedtime' : p.nightWake ? 'Back to sleep' : 'Next nap';
    const cls = p.status === 'past' ? 'warn' : p.status === 'window' ? 'good' : '';
    const statusText = p.status === 'past'
                       ? (p.nightWake ? 'settling is taking a while' : 'window has passed')
                     : p.status === 'window' ? 'in the window now' : relative(p.nextSleepAt, now);
    pred = `<div class="card predict">
      <div class="when">
        <b>${label} ~${clock(p.nextSleepAt)}</b>
        <div class="sub">${statusText} · window ${clock(p.nextSleepRange[0])}–${clock(p.nextSleepRange[1])}</div>
      </div>
      <span class="pill ${cls}">${p.nightWake ? 'Night' : p.confidence === 'high' ? 'Learned' : p.confidence === 'medium' ? 'Learning' : 'Age-based'}</span>
    </div>`;
  }

  /* --- quick log --- */
  const feedingNow = evs.find(e => e.type === 'feed' && !e.end && e.kind === 'breast' && e.live);
  const quick = `<div class="quick">
      <button data-log="breast"><span class="emoji">🤱</span>Breast</button>
      <button data-log="bottle"><span class="emoji">🍼</span>Bottle</button>
      <button data-log="solids"><span class="emoji">🥣</span>Solids</button>
      <button data-log="diaper"><span class="emoji">🧷</span>Diaper</button>
    </div>`;

  /* --- today --- */
  const feedTicks = evs.filter(e => e.type === 'feed' && e.start >= today.dayStart && e.start < today.dayStart + DAY).map(e => e.start);
  const diaperTicks = evs.filter(e => e.type === 'diaper' && e.start >= today.dayStart && e.start < today.dayStart + DAY).map(e => e.start);
  const recent = [...evs].sort((a, b) => b.start - a.start).slice(0, 4);

  const todayCard = `
    <h2 class="sec">Today</h2>
    <div class="card tight">
      ${timeline(today.blocks, today.dayStart, { feeds: feedTicks, diapers: diaperTicks })}
      ${axis24()}
    </div>
    <div class="stats">
      <div class="stat sleep"><b>${dur(today.sleepMin)}</b><span>sleep</span></div>
      <div class="stat feed"><b>${today.feeds.count}</b><span>feeds</span></div>
      <div class="stat diaper"><b>${today.diapers.total}</b><span>diapers</span></div>
    </div>`;

  const recentCard = recent.length ? `
    <h2 class="sec">Latest</h2>
    <div class="card" id="recent">${recent.map(entryRow).join('')}</div>` : '';

  return ring + pred + quick + todayCard + recentCard;
}

/* ---------------- entry rows ---------------- */
function entryRow(e) {
  const now = Date.now();
  let ic = '🌙', cls = 'sleep', title = 'Sleep', sub = '';
  if (e.type === 'sleep') {
    const mins = ((e.end || now) - e.start) / MIN;
    title = e.end ? (isNightSleep(e) ? 'Night sleep' : 'Nap') : 'Sleeping now';
    sub = `${clock(e.start)}–${e.end ? clock(e.end) : 'now'} · ${dur(mins)}`;
    ic = e.end ? (isNightSleep(e) ? '🌛' : '😴') : '😴';
  } else if (e.type === 'feed') {
    cls = 'feed';
    if (e.kind === 'breast') { ic = '🤱'; title = 'Breastfeed'; sub = [e.side && `${e.side} side`, e.minutes && dur(e.minutes)].filter(Boolean).join(' · '); }
    else if (e.kind === 'bottle') { ic = '🍼'; title = 'Bottle'; sub = e.amountMl ? amount(e.amountMl) : ''; }
    else { ic = '🥣'; title = 'Solids'; sub = e.food || ''; }
  } else if (e.type === 'diaper') {
    cls = 'diaper';
    ic = e.kind === 'dirty' ? '💩' : e.kind === 'both' ? '💩' : e.kind === 'dry' ? '🧷' : '💧';
    title = 'Diaper';
    sub = { wet: 'Wet', dirty: 'Dirty', both: 'Wet + dirty', dry: 'Dry' }[e.kind] || '';
  }
  if (e.note) sub = sub ? `${sub} · ${esc(e.note)}` : esc(e.note);
  const ongoing = e.type === 'sleep' && !e.end;
  return `<div class="entry ${ongoing ? 'ongoing' : ''}" data-edit="${e.id}">
      <div class="ic ${cls}">${ic}</div>
      <div class="body"><b>${title}</b><span>${sub}</span></div>
      <div class="time">${ongoing ? dur((now - e.start) / MIN) : clock(e.start)}</div>
    </div>`;
}

/* ---------------- log screen ---------------- */
function logScreen() {
  const now = Date.now();
  const evs = store.events();
  const d = daySummary(evs, logDay, now);
  const isToday = logDay === startOfDay(now);
  const items = evs.filter(e => e.start >= logDay && e.start < logDay + DAY)
                   .sort((a, b) => b.start - a.start);
  const label = isToday ? 'Today'
    : logDay === startOfDay(now) - DAY ? 'Yesterday'
    : new Date(logDay).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return `
    <div class="daynav">
      <button class="iconbtn" id="day-prev" aria-label="Previous day">‹</button>
      <b>${esc(label)}</b>
      <button class="iconbtn" id="day-next" aria-label="Next day" ${isToday ? 'disabled style="opacity:.35"' : ''}>›</button>
    </div>
    <div class="card tight">
      ${timeline(d.blocks, d.dayStart, {
        feeds: evs.filter(e => e.type === 'feed' && e.start >= logDay && e.start < logDay + DAY).map(e => e.start),
        diapers: evs.filter(e => e.type === 'diaper' && e.start >= logDay && e.start < logDay + DAY).map(e => e.start) })}
      ${axis24()}
    </div>
    <div class="stats">
      <div class="stat sleep"><b>${dur(d.sleepMin)}</b><span>total sleep</span></div>
      <div class="stat sleep"><b>${d.naps}</b><span>naps</span></div>
      <div class="stat sleep"><b>${dur(d.longestMin)}</b><span>longest</span></div>
    </div>
    <div class="stats" style="margin-top:8px">
      <div class="stat feed"><b>${d.feeds.count}</b><span>feeds</span></div>
      <div class="stat feed"><b>${d.feeds.bottleMl ? amount(d.feeds.bottleMl) : '—'}</b><span>bottle</span></div>
      <div class="stat diaper"><b>${d.diapers.total}</b><span>diapers</span></div>
    </div>
    <h2 class="sec">Entries</h2>
    <div class="card">${items.length ? items.map(entryRow).join('')
      : '<div class="faint" style="padding:6px 2px">Nothing logged this day.</div>'}</div>
    <div class="row" style="margin-top:4px">
      <button class="btn ghost" data-add="sleep">+ Sleep</button>
      <button class="btn ghost" data-add="feed">+ Feed</button>
      <button class="btn ghost" data-add="diaper">+ Diaper</button>
    </div>`;
}

/* ---------------- patterns screen ---------------- */
function patternsScreen() {
  const now = Date.now();
  const evs = store.events();
  if (!evs.length) {
    return `<div class="card" style="margin-top:20px">
      <b>Nothing to show yet</b>
      <p class="muted">Log a few sleeps and this screen fills with your baby's own rhythm —
      a 24-hour bar per day, averages, and how their awake windows compare to their age.</p></div>`;
  }
  const days = lastDays(evs, 14, now);
  const avg = averages(days);
  const b = band(birthMs() || now, now);
  const windows = observedWindows(evs, now, 14);
  const ownWindow = windows.length ? median(windows.slice(0, 12)) : null;

  const rows = days.map(d => {
    const dt = new Date(d.dayStart);
    const lbl = d.dayStart === startOfDay(now) ? 'Today'
      : dt.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + dt.getDate();
    return `<div class="rowbar">
      <div class="d">${esc(lbl)}</div>
      <div class="t">${timeline(d.blocks, d.dayStart, { h: 20, feeds: [], diapers: [] })}</div>
      <div class="n">${d.sleepMin ? dur(d.sleepMin) : '—'}</div>
    </div>`;
  }).join('');

  const totalCard = avg ? `
    <h2 class="sec">Averages (last ${avg.days} full day${avg.days === 1 ? '' : 's'})</h2>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <b style="font-size:24px">${dur(avg.sleepMin)}</b>
        <span class="faint">per 24 h · age guide ${b.total[0]}–${b.total[1]} h</span>
      </div>
      ${meter(avg.sleepMin, b.total)}
      <div class="faint">${avg.sleepMin / 60 < b.total[0] ? 'Below the usual range for this age.'
        : avg.sleepMin / 60 > b.total[1] ? 'Above the usual range — lovely.'
        : 'Inside the usual range for this age.'}</div>
      <div class="stats" style="margin-top:12px">
        <div class="stat sleep"><b>${dur(avg.nightMin)}</b><span>night (19–07)</span></div>
        <div class="stat sleep"><b>${dur(avg.dayMin)}</b><span>day naps</span></div>
        <div class="stat sleep"><b>${dur(avg.longestMin)}</b><span>longest stretch</span></div>
      </div>
    </div>` : '';

  const windowCard = `
    <h2 class="sec">Awake windows</h2>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <b style="font-size:24px">${ownWindow ? dur(ownWindow) : '—'}</b>
        <span class="faint">age guide ${dur(b.ww[0])}–${dur(b.ww[1])}</span>
      </div>
      <div class="faint" style="margin-top:6px">
        ${ownWindow ? `Your baby's own median awake stretch, from ${windows.length} measured window${windows.length === 1 ? '' : 's'}.`
                    : 'Log two sleeps in a row and this appears.'}
        ${ownWindow && ownWindow > b.ww[1] ? ' That is longer than typical for this age — often behind short naps.' : ''}
        ${ownWindow && ownWindow < b.ww[0] ? ' That is shorter than typical — catnaps are normal in growth spurts.' : ''}
      </div>
    </div>`;

  const feedCard = `
    <h2 class="sec">Feeds &amp; diapers per day</h2>
    <div class="card tight">
      ${columns(days.map(d => d.feeds.count), days.map(d => new Date(d.dayStart).getDate()), 'var(--feed)')}
      <div class="faint" style="margin-top:2px">Feeds${avg ? ` · average ${avg.feeds.toFixed(1)}/day` : ''}</div>
    </div>
    <div class="card tight">
      ${columns(days.map(d => d.diapers.total), days.map(d => new Date(d.dayStart).getDate()), 'var(--diaper)')}
      <div class="faint" style="margin-top:2px">Diapers${avg ? ` · average ${avg.diapers.toFixed(1)}/day` : ''}</div>
    </div>`;

  return `<h2 class="sec">Last 14 days</h2>
    <div class="card">${rows}
      <div class="faint" style="margin-top:6px">Purple = asleep. Darker background = night (19:00–07:00).</div>
    </div>
    ${totalCard}${windowCard}${feedCard}
    <p class="faint" style="margin:14px 2px 0">Age guides are pediatric-sleep consensus ranges, not medical advice —
    sources are listed in the app's README. Every baby is their own curve.</p>`;
}

/* ---------------- sounds screen ---------------- */
function soundsScreen() {
  const cur = sounds.playing();
  const left = sounds.timerLeftMs();
  return `<h2 class="sec">Sleep sounds</h2>
    <div class="soundgrid">
      ${sounds.SOUNDS.map(s => `
        <button class="sound" data-sound="${s.id}" aria-pressed="${String(cur === s.id)}">
          <span class="emoji">${s.emoji}</span>
          <b>${esc(s.name)}</b><span>${esc(s.desc)}</span>
        </button>`).join('')}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="field" style="margin-bottom:8px">
        <label for="vol">Volume</label>
        <input id="vol" type="range" min="0" max="100" value="${Math.round(sounds.getVolume() * 100)}" />
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Sleep timer ${left ? `· ${dur(left / MIN)} left` : ''}</label>
        <div class="chips" data-chipgroup="timer">
          ${[0, 15, 30, 45, 60].map(m => `<button type="button" class="chip" data-value="${m}"
              aria-pressed="${String(m === 0 && !left)}">${m === 0 ? 'Off' : m + ' min'}</button>`).join('')}
        </div>
      </div>
    </div>
    <p class="faint" style="margin:12px 2px">${cur ? 'Playing. Keep Lull open or installed to the home screen — the sound continues with the screen off, and you can pause it from the lock screen.'
      : 'All five sounds are generated on the phone, so they work with no internet and never repeat exactly.'}</p>`;
}

/* ---------------- settings ---------------- */
function openSettings() {
  const s = S();
  const perm = notify.permission();
  const html = `
    <h3>Settings</h3>
    <div class="field">
      <label for="st-name">Baby's name</label>
      <input id="st-name" type="text" value="${esc(s.name || '')}" />
    </div>
    <div class="field">
      <label for="st-birth">Birth date</label>
      <input id="st-birth" type="date" value="${s.birth ? new Date(s.birth).toISOString().slice(0, 10) : ''}" />
    </div>
    <div class="field">
      <label>Bottle unit</label>
      ${sheets.chipRow('unit', [{ v: 'ml', t: 'Millilitres' }, { v: 'oz', t: 'Ounces' }], unit())}
    </div>
    <div class="field">
      <label>Colours</label>
      ${sheets.chipRow('theme', [{ v: 'dark', t: '🌙 Dark' }, { v: 'light', t: '☀️ Light' }, { v: 'night', t: '🕯️ Night (3am)' }], theme())}
    </div>
    <div class="switch">
      <div class="t"><b>Nap reminders</b>
        <span>${perm === 'granted' ? 'Alerts before the window opens and closes.'
              : perm === 'denied' ? 'Blocked in your browser settings.'
              : 'Asks your permission first.'}</span></div>
      <button class="toggle" id="st-remind" aria-pressed="${String(!!s.reminders && perm === 'granted')}" aria-label="Nap reminders"></button>
    </div>
    <p class="faint" style="margin:10px 0 16px">Reminders are best-effort: a web app can alert you while Lull is open or
    installed to your home screen, but it cannot replace a native alarm if the phone closes it completely.
    The countdown on the Home screen is always right.</p>

    <h2 class="sec" style="margin-top:4px">Your data</h2>
    <div class="row">
      <button class="btn ghost" id="st-export">Back up</button>
      <button class="btn ghost" id="st-import">Restore</button>
    </div>
    <input type="file" id="st-file" accept="application/json,.json" hidden />
    <p class="faint" style="margin:10px 0 0">Stored only on this phone (${store.storageMode()}) — nothing is uploaded.
    A backup is a plain file you can keep or move to another phone.</p>
    <button class="btn danger" id="st-wipe" style="margin-top:14px">Delete all logged data</button>
    <p class="faint" style="margin-top:16px">Lull · offline baby tracker. Age guides are pediatric-sleep
    consensus ranges, not medical advice.</p>`;

  sheets.openSheet(html, (sheet, closeIt) => {
    sheets.wireChips(sheet);
    const save = async () => {
      await store.setSetting('name', sheet.querySelector('#st-name').value.trim() || 'Baby');
      const bv = sheet.querySelector('#st-birth').value;
      if (bv) await store.setSetting('birth', new Date(bv + 'T12:00:00').getTime());
      render();
    };
    sheet.querySelector('#st-name').addEventListener('change', save);
    sheet.querySelector('#st-birth').addEventListener('change', save);
    sheet.querySelector('[data-chipgroup="unit"]').addEventListener('pick', e => store.setSetting('unit', e.detail));
    sheet.querySelector('[data-chipgroup="theme"]').addEventListener('pick', e => { store.setSetting('theme', e.detail); applyTheme(e.detail); });

    sheet.querySelector('#st-remind').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const on = btn.getAttribute('aria-pressed') === 'true';
      if (on) { await store.setSetting('reminders', false); notify.stopAll(); btn.setAttribute('aria-pressed', 'false'); return; }
      const res = await notify.request();
      if (res === 'granted') {
        await store.setSetting('reminders', true);
        btn.setAttribute('aria-pressed', 'true');
        sheets.toast('Reminders on');
        armReminders();
      } else sheets.toast(res === 'unsupported' ? 'This browser has no notifications' : 'Permission not given');
    });

    sheet.querySelector('#st-export').addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lull-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      sheets.toast('Backup saved');
    });
    const file = sheet.querySelector('#st-file');
    sheet.querySelector('#st-import').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const res = await store.importJSON(await f.text(), 'merge');
        sheets.toast(`Restored ${res.added} entries`);
        closeIt(); render();
      } catch (e) { sheets.toast('That file is not a Lull backup'); }
    });
    sheet.querySelector('#st-wipe').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.dataset.sure !== '1') { btn.dataset.sure = '1'; btn.textContent = 'Tap again to delete everything'; return; }
      for (const e of [...store.events()]) await store.deleteEvent(e.id);
      closeIt(); sheets.toast('All entries deleted'); render();
    });
  });
}

/* ---------------- theme ---------------- */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const colors = { dark: '#0d1017', light: '#f6f4fb', night: '#000000' };
  document.querySelector('meta[name="theme-color"]').setAttribute('content', colors[t] || colors.dark);
}
function cycleTheme() {
  const order = ['dark', 'light', 'night'];
  const next = order[(order.indexOf(theme()) + 1) % order.length];
  store.setSetting('theme', next); applyTheme(next);
  $('#btn-theme').textContent = next === 'light' ? '☀️' : next === 'night' ? '🕯️' : '🌙';
  sheets.toast(next === 'night' ? 'Night mode — dim and warm' : `${next[0].toUpperCase()}${next.slice(1)} colours`);
}

/* ---------------- render + events ---------------- */
function render() {
  $('#baby-name').textContent = babyName();
  $('#baby-age').textContent = ageLabel();
  $('#btn-theme').textContent = theme() === 'light' ? '☀️' : theme() === 'night' ? '🕯️' : '🌙';
  const screen = $('#screen');
  const keepScroll = screen.scrollTop;
  screen.innerHTML = `<div class="screen">${
    tab === 'home' ? homeScreen() :
    tab === 'log' ? logScreen() :
    tab === 'patterns' ? patternsScreen() : soundsScreen()}</div>`;
  screen.scrollTop = keepScroll;
  document.querySelectorAll('#tabs button').forEach(b =>
    b.toggleAttribute('aria-current', b.dataset.tab === tab) ||
    (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  wireScreen();
  armReminders();
}

function armReminders() {
  const p = predict({ events: store.events(), birthMs: birthMs(), nowMs: Date.now() });
  notify.schedule(p, babyName(), !!S().reminders);
}

async function toggleSleep() {
  const going = ongoingSleep(store.events());
  if (going) {
    await store.saveEvent({ ...going, end: Date.now() });
    sheets.toast(`Woke up · slept ${dur((Date.now() - going.start) / MIN)}`);
  } else {
    await store.saveEvent({ type: 'sleep', start: Date.now(), end: null });
    sheets.toast('Sleep started');
  }
}

function wireScreen() {
  const screen = $('#screen');
  screen.querySelector('#sleep-toggle')?.addEventListener('click', async () => {
    await toggleSleep(); render();
  });
  screen.querySelectorAll('[data-log]').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.log;
    if (k === 'diaper') sheets.diaperSheet(null, { onDone: render });
    else sheets.feedSheet(null, { kind: k, unit: unit(), onDone: render });
  }));
  screen.querySelectorAll('[data-edit]').forEach(row => row.addEventListener('click', () => {
    const ev = store.events().find(e => e.id === row.dataset.edit);
    if (ev) sheets.editEvent(ev, { unit: unit(), onDone: render });
  }));
  screen.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
    const base = logDay === startOfDay(Date.now()) ? Date.now() : logDay + 12 * 3600000;
    const stub = { start: base };
    if (btn.dataset.add === 'sleep') sheets.sleepSheet({ ...stub, type: 'sleep', id: undefined, end: base + 3600000 }, { onDone: render });
    else if (btn.dataset.add === 'feed') sheets.feedSheet({ ...stub, type: 'feed', kind: 'breast', id: undefined }, { unit: unit(), onDone: render });
    else sheets.diaperSheet({ ...stub, type: 'diaper', kind: 'wet', id: undefined }, { onDone: render });
  }));
  screen.querySelector('#day-prev')?.addEventListener('click', () => { logDay -= DAY; render(); });
  screen.querySelector('#day-next')?.addEventListener('click', () => {
    if (logDay < startOfDay(Date.now())) { logDay += DAY; render(); }
  });
  screen.querySelectorAll('[data-sound]').forEach(btn => btn.addEventListener('click', () => {
    sounds.play(btn.dataset.sound); render();
  }));
  screen.querySelector('#vol')?.addEventListener('input', e => sounds.setVolume(e.target.value / 100));
  const tg = screen.querySelector('[data-chipgroup="timer"]');
  if (tg) {
    sheets.wireChips(screen);
    tg.addEventListener('pick', e => {
      sounds.setTimer(Number(e.detail));
      sheets.toast(Number(e.detail) ? `Fading out in ${e.detail} min` : 'Timer off');
    });
  }
}

/* ---------------- boot ---------------- */
async function boot() {
  await store.init();
  applyTheme(theme());

  if (!S().birth) {
    const ob = $('#onboard');
    ob.hidden = false;
    $('#ob-birth').max = new Date().toISOString().slice(0, 10);
    $('#ob-go').addEventListener('click', async () => {
      const name = $('#ob-name').value.trim() || 'Baby';
      const bv = $('#ob-birth').value;
      if (!bv) { sheets.toast('Pick a birth date'); return; }
      await store.setSetting('name', name);
      await store.setSetting('birth', new Date(bv + 'T12:00:00').getTime());
      ob.hidden = true; $('#app').hidden = false; render();
    });
  } else {
    $('#app').hidden = false;
  }

  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-theme').addEventListener('click', cycleTheme);
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    if (tab === 'log') logDay = startOfDay(Date.now());
    render();
  }));
  store.subscribe(() => {});                       // keeps the cache authoritative
  sounds.onChange(() => { if (tab === 'sounds') render(); });

  render();
  // Live countdowns: cheap re-render every 15 s, and immediately on return.
  tickTimer = setInterval(() => { if (!document.querySelector('.sheet')) render(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
// A tiny hook for debugging in the browser console.
self.__lull = { store, predict, sounds, render: () => render(), get tab() { return tab; }, set tab(t) { tab = t; render(); } };
