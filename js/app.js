// ===== Lull — app shell, screens and wiring =====
import * as store from './store.js?v=24';
import * as sheets from './sheets.js?v=24';
import * as sounds from './sounds.js?v=24';
import * as notify from './notify.js?v=24';
import * as cloud from './cloud.js?v=24';
import { predict, ongoingSleep, isNightSleep, observedWindows } from './predict.js?v=24';
import { band, ageDays, BANDS } from './science.js?v=24';
import { trend } from './stats.js?v=24';
import { index, babyDay, currentDate, previousFor, lastBabyDays, averages, nextDate, prevDate } from './days.js?v=24';
import * as growth from './growth.js?v=24';
import { timeline, axis, dayDial, meter, columns, trendBars, growthChart, esc } from './charts.js?v=24';
import { MIN, HOUR, DAY, clock, dur, relative, startOfDay, median, clamp } from './util.js?v=24';
import { looksLikeEmail } from './vault.js?v=24';

const $ = (sel) => document.querySelector(sel);
let tab = 'home';
let logDay = null;                       // which baby-day (date key) the Log shows; null = the current one
let tickTimer = null;
let trendSpan = 14;                      // Patterns → Over time: 14 / 30 / 90 days or 'all'
let growthMeasure = 'weight';            // which WHO chart the Growth screen shows

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
  else if (d < 183) main = `${Math.round(d / 7)} weeks old`;   // babies are counted in weeks to 6 months
  else main = `${Math.round(d / 30.44)} months old`;
  return `${main} · ${b.label}`;
}

const amount = (ml) => unit() === 'oz' ? `${(ml / 29.5735).toFixed(1)} oz` : `${ml} ml`;

/* ---------------- home ---------------- */
function homeScreen() {
  const now = Date.now();
  const evs = store.events();
  const p = predict({ events: evs, birthMs: birthMs(), nowMs: now });
  const today = babyDay(evs, currentDate(evs, now), now);

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
  } else if (p.awakeMin > 7 * 60) {
    // Nobody is awake for seven hours at this age: the log has a gap, so stop
    // pretending to predict and say what is actually known.
    pred = `<div class="card predict">
      <div class="when">
        <b>Gap in the log</b>
        <div class="sub">Last logged sleep ended at ${clock(p.awakeSince)}, ${dur(p.awakeMin)} ago.
        Tap the button when ${esc(babyName())} goes down, or add the missing sleep in the Log.</div>
      </div>
      <span class="pill warn">Catch up</span></div>`;
  } else {
    const overdue = p.status === 'past';
    const label = overdue ? (p.nightWake ? 'Still awake' : 'Nap overdue')
                : p.isBedtime ? 'Bedtime' : p.nightWake ? 'Back to sleep' : 'Next nap';
    const cls = overdue ? 'warn' : p.status === 'window' ? 'good' : '';
    const head = overdue ? label : `${label} ~${clock(p.nextSleepAt)}`;
    const statusText = overdue
        ? `${p.nightWake ? 'settling is taking a while' : `past the usual window by ${dur(-p.minutesLeft)}`} · expected ~${clock(p.nextSleepAt)}`
      : p.status === 'window' ? `in the window now · window ${clock(p.nextSleepRange[0])}–${clock(p.nextSleepRange[1])}`
      : `${relative(p.nextSleepAt, now)} · window ${clock(p.nextSleepRange[0])}–${clock(p.nextSleepRange[1])}`;
    pred = `<div class="card predict">
      <div class="when">
        <b>${head}</b>
        <div class="sub">${statusText}</div>
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

  /* --- good morning: no wake-up logged yet today --- */
  const nowH = new Date(now).getHours();
  const morning = nowH >= 4 && nowH < 13 && p.state !== 'asleep'
    && (!today || startOfDay(today.start) !== startOfDay(now) || today.source === 'guess') ? `
    <div class="card morning">
      <div class="t"><b>☀️ Good morning!</b><span>When did ${esc(babyName())} wake up for the day?</span></div>
      <button class="btn" id="log-daystart">Log wake-up</button>
    </div>` : '';

  /* --- today (the baby-day so far, starting at the morning wake-up) --- */
  const inToday = (e) => e.start >= today.start && e.start < today.until;
  const barFrom = (() => { const d = new Date(today.start); d.setMinutes(0, 0, 0); return d.getTime(); })();
  const recent = [...evs].sort((a, b) => b.start - a.start).slice(0, 4);

  const todayCard = `
    <h2 class="sec">Today <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:500">· since ${clock(today.start)}</span></h2>
    <div class="card tight">
      ${timeline(today.blocks, barFrom, { feeds: evs.filter(e => e.type === 'feed' && inToday(e)).map(e => e.start),
                                          diapers: evs.filter(e => e.type === 'diaper' && inToday(e)).map(e => e.start) })}
      ${axis(barFrom)}
    </div>
    <div class="stats">
      <div class="stat sleep"><b>${dur(today.sleepMin)}</b><span>sleep</span></div>
      <div class="stat feed"><b>${today.feeds.count}</b><span>feeds</span></div>
      <div class="stat diaper"><b>${today.diapers.total}</b><span>diapers</span></div>
    </div>`;

  const recentCard = recent.length ? `
    <h2 class="sec">Latest</h2>
    <div class="card" id="recent">${recent.map(entryRow).join('')}</div>` : '';

  return ring + morning + pred + quick + todayCard + recentCard;
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
  else if (e.type === 'daystart') {
    ic = '☀️'; title = 'Day started'; sub = 'Up for the day';
  }
  else if (e.type === 'growth') {
    cls = 'growth'; ic = '📏'; title = 'Measurement';
    sub = Object.entries(growth.MEASURES).filter(([, m]) => e[m.field] > 0)
      .map(([k, m]) => kgCm(k, e[m.field])).join(' · ');
  }
  if (e.note) sub = sub ? `${sub} · ${esc(e.note)}` : esc(e.note);
  const ongoing = e.type === 'sleep' && !e.end;
  return `<div class="entry ${ongoing ? 'ongoing' : ''}" data-edit="${e.id}">
      <div class="ic ${cls}">${ic}</div>
      <div class="body"><b>${title}</b><span>${sub}</span></div>
      <div class="time">${ongoing ? dur((now - e.start) / MIN)
        : e.type === 'growth' ? new Date(e.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        : clock(e.start)}</div>
    </div>`;
}

/* ---------------- log screen ---------------- */
function logScreen() {
  const now = Date.now();
  const evs = store.events();
  const ix = index(evs);
  const cur = currentDate(ix, now);
  if (logDay == null || logDay > cur) logDay = cur;
  const d = babyDay(ix, logDay, now);
  if (!d) { logDay = cur; return logScreen(); }
  const prev = previousFor(ix, d, now);
  const hasPrev = prev && (prev.blocks.length || prev.feeds.count || prev.diapers.total);
  const isCur = logDay === cur;
  const label = isCur ? 'Today' : logDay === prevDate(cur) ? 'Yesterday'
    : new Date(logDay).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const inDay = (e) => e.start >= d.start && e.start < d.until;
  const items = evs.filter(e => inDay(e) || (e.type === 'sleep' && !e.end && isCur && e.start < d.start))
                   .sort((a, b) => b.start - a.start);

  // ▲/▼ against the day before (at this time of day, while today is still going). If either
  // day's night wasn't logged, its sleep/awake hours aren't comparable: only naps, feeds, diapers are.
  const nightGap = d.nightMissing || prev?.nightMissing;
  const delta = (a, b, mins = true, needsNight = false) => {
    if (!hasPrev || (needsNight && nightGap)) return '';
    const diff = a - b;
    if (mins ? Math.abs(diff) < 5 : diff === 0) return '<small class="delta">= same</small>';
    return `<small class="delta">${diff > 0 ? '▲' : '▼'} ${mins ? dur(Math.abs(diff)) : Math.abs(diff)}</small>`;
  };
  const center = `<span>sleep</span><b>${dur(d.sleepMin)}</b>
    <div class="when">☀️ ${clock(d.start)}${d.source === 'guess' ? '?' : ''}${d.bedtime ? ` · 🌙 ${clock(d.bedtime)}` : ''}</div>`;
  const lastSleepEnd = Math.max(d.start, ...d.blocks.map(b => b.end));
  const nightNote = d.nightMissing ? `
    <div class="guess"><span>No night sleep logged after ${clock(lastSleepEnd)}, so awake time can't be counted for this day.</span>
      <button class="btn ghost" id="add-night" data-from="${lastSleepEnd}" data-to="${d.end}">+ Night</button></div>` : '';
  const guessNote = d.source === 'guess' ? `
    <div class="guess"><span>No wake-up logged, so this day is assumed to start at ${clock(d.start)}.</span>
      <button class="btn ghost" id="fix-daystart">Log it</button></div>` : '';

  return `
    <div class="daynav">
      <button class="iconbtn" id="day-prev" aria-label="Previous day">‹</button>
      <b>${esc(label)}<small>${clock(d.start)} → ${d.ongoing ? 'now' : clock(d.end)}</small></b>
      <button class="iconbtn" id="day-next" aria-label="Next day" ${isCur ? 'disabled style="opacity:.35"' : ''}>›</button>
    </div>
    <div class="card">
      ${dayDial(d, { center,
        feeds: evs.filter(e => e.type === 'feed' && inDay(e)).map(e => e.start),
        diapers: evs.filter(e => e.type === 'diaper' && inDay(e)).map(e => e.start) })}
      <div class="legend dial-legend"><span><i style="background:var(--nap)"></i>Nap</span><span><i style="background:var(--accent)"></i>Night</span>
        <span><i style="background:var(--feed)"></i>Feed</span><span><i style="background:var(--diaper)"></i>Diaper</span></div>
      ${guessNote}${nightNote}
    </div>
    <h2 class="sec">${isCur ? 'This day so far' : 'This day'}</h2>
    <div class="stats two">
      <div class="stat nap"><b>${dur(d.dayMin)}</b><span>day sleep · ${d.naps} nap${d.naps === 1 ? '' : 's'}</span>${delta(d.dayMin, prev?.dayMin)}</div>
      <div class="stat sleep"><b>${dur(d.nightMin)}</b><span>night sleep</span>${delta(d.nightMin, prev?.nightMin, true, true)}</div>
      <div class="stat"><b>${d.nightMissing ? '—' : dur(d.awakeMin)}</b><span>awake</span>${delta(d.awakeMin, prev?.awakeMin, true, true)}</div>
      <div class="stat sleep"><b>${dur(d.sleepMin)}</b><span>total sleep</span>${delta(d.sleepMin, prev?.sleepMin, true, true)}</div>
    </div>
    <div class="stats" style="margin-top:8px">
      <div class="stat feed"><b>${d.feeds.count}</b><span>feeds</span>${delta(d.feeds.count, prev?.feeds.count, false)}</div>
      <div class="stat feed"><b>${d.feeds.bottleMl ? amount(d.feeds.bottleMl) : '—'}</b><span>bottle</span>${d.feeds.bottleMl || prev?.feeds.bottleMl ? delta(d.feeds.bottleMl, prev?.feeds.bottleMl, false).replace(/(\d+)<\/small>/, (m, n) => `${amount(Number(n))}</small>`) : ''}</div>
      <div class="stat diaper"><b>${d.diapers.total}</b><span>diapers</span>${delta(d.diapers.total, prev?.diapers.total, false)}</div>
    </div>
    ${hasPrev ? `<p class="faint" style="margin:8px 2px 0">▲▼ compared with ${isCur ? 'yesterday at this point in the day' : 'the day before'}${
      nightGap ? `. Night and awake hours aren't compared: ${d.nightMissing ? "this day's" : "the day before's"} night wasn't logged` : ''}.</p>` : ''}
    <h2 class="sec">Entries</h2>
    <div class="card">${items.length ? items.map(entryRow).join('')
      : '<div class="faint" style="padding:6px 2px">Nothing logged this day.</div>'}</div>
    <div class="row" style="margin-top:4px">
      <button class="btn ghost" data-add="sleep">+ Sleep</button>
      <button class="btn ghost" data-add="feed">+ Feed</button>
      <button class="btn ghost" data-add="diaper">+ Diaper</button>
    </div>
    <button class="btn ghost" data-add="daystart" style="margin-top:8px">☀️ Day started at…</button>`;
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
  const days = lastBabyDays(evs, 14, now);
  // one shared window for every row, from the earliest wake-up to the latest next morning
  const offH = Math.min(...days.map(d => Math.floor((d.start - d.date) / HOUR)));
  const endH = Math.max(...days.map(d => Math.ceil(((d.end ?? d.until) - d.date) / HOUR)));
  const spanMs = Math.max(24, endH - offH) * HOUR;
  const avg = averages(days);
  const b = band(birthMs() || now, now);
  const windows = observedWindows(evs, now, 14);
  const ownWindow = windows.length ? median(windows.slice(0, 12)) : null;

  const rows = days.map(d => {
    const dt = new Date(d.dayStart);
    const lbl = d.ongoing ? 'Today'
      : dt.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + dt.getDate();
    return `<div class="rowbar">
      <div class="d">${esc(lbl)}</div>
      <div class="t">${timeline(d.blocks, d.date + offH * HOUR, { h: 20, span: spanMs })}</div>
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
        <div class="stat sleep"><b>${dur(avg.nightMin)}</b><span>night</span></div>
        <div class="stat nap"><b>${dur(avg.dayMin)}</b><span>day naps</span></div>
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
      <div class="rowbar" style="margin:0"><div class="d"></div><div class="t">${axis(days[0].date + offH * HOUR, spanMs)}</div><div class="n"></div></div>
      <div class="faint" style="margin-top:6px">Each row is one day: from the morning wake-up, through the night, to the next morning.
      <span style="color:var(--nap)">■</span> naps · <span style="color:var(--accent)">■</span> night sleep · darker background = 19:00–07:00.</div>
    </div>
    ${totalCard}${trendSection(evs, now)}${windowCard}${feedCard}
    <p class="faint" style="margin:14px 2px 0">Age guides are pediatric-sleep consensus ranges, not medical advice —
    sources are listed in the app's README. Every baby is their own curve.</p>`;
}

/* ---------------- patterns → over time ---------------- */
function trendSection(evs, now) {
  const { step, points } = trend(evs, trendSpan, now);
  const spans = sheets.chipRow('span', [{ v: '14', t: '2 weeks' }, { v: '30', t: 'Month' },
                                        { v: '90', t: '3 months' }, { v: 'all', t: 'All' }], String(trendSpan));
  const head = `<h2 class="sec">Over time</h2>${spans}`;
  if (points.length < 2) {
    return head + `<div class="card"><div class="faint">A couple of full days of logging and the trends appear here.</div></div>`;
  }
  const per = step === 7 ? 'week' : 'day';
  const label = (p) => {
    const t = new Date(p.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return step === 7 ? `wk ${t}` : t;
  };
  const avgOf = (k) => { const v = points.map(p => p[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // first quarter vs last quarter of the range: is it going up or down?
  const change = (k, fmt) => {
    const v = points.map(p => p[k]).filter(x => x != null);
    if (v.length < 4) return '';
    const q = Math.max(1, Math.floor(v.length / 4));
    const d = v.slice(-q).reduce((a, b) => a + b, 0) / q - v.slice(0, q).reduce((a, b) => a + b, 0) / q;
    return Math.abs(d) < 1e-9 ? ' · steady' : ` · ${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}`;
  };
  const hm = (m) => dur(m);
  const n1 = (v) => (Math.round(v * 10) / 10).toString();
  const sleepBand = birthMs() ? (p) => band(birthMs(), p.start + p.days * DAY / 2).total.map(h => h * 60) : null;
  const sub = step === 7 ? 'Weekly average per day' : 'Each bar is one day';

  const card = (title, k, fmt, chart, legend = '') => {
    const a = avgOf(k);
    return `<div class="card tight">
      <div class="trend-head"><b>${title}</b><span>avg ${a == null ? '—' : fmt(a)}${change(k, fmt)}</span></div>
      ${chart}${legend}</div>`;
  };
  const sw = (c, op = 1) => `<i style="background:${c};opacity:${op}"></i>`;

  return head + `<p class="faint" style="margin:0 2px 8px">${sub} · complete days only · empty = nothing logged.</p>`
    + card('Total sleep', 'sleepMin', hm,
        trendBars(points, { value: p => p.sleepMin, inner: p => p.nightMin, band: sleepBand,
                            color: 'var(--accent)', outer: 'var(--nap)', fmt: hm, label }),
        `<div class="legend"><span>${sw('var(--accent)')}night</span><span>${sw('var(--nap)')}naps</span>
         ${sleepBand ? `<span>${sw('var(--fg-faint)', .3)}age guide</span>` : ''}</div>`)
    + card('Longest night stretch', 'longestNightMin', hm,
        trendBars(points, { value: p => p.longestNightMin, color: 'var(--accent)', fmt: hm, label }),
        `<div class="legend"><span>The longest unbroken night sleep, counted for the evening it began.</span></div>`)
    + card('Feeds per day', 'feeds', n1,
        trendBars(points, { value: p => p.feeds, color: 'var(--feed)', fmt: n1, label }),
        avgOf('bottleMl') ? `<div class="legend"><span>Bottle: avg ${amount(Math.round(avgOf('bottleMl')))} per day on bottle days</span></div>` : '')
    + card('Diapers per day', 'diapers', n1,
        trendBars(points, { value: p => p.diapers, inner: p => p.dirty, color: 'var(--diaper)', fmt: n1, label }),
        `<div class="legend"><span>${sw('var(--diaper)', .5)}all</span><span>${sw('var(--diaper)')}dirty</span></div>`);
}

/* ---------------- growth screen ---------------- */
const kgCm = (k, v) => k === 'weight' ? `${v.toFixed(2).replace(/0$/, '')} kg` : `${v.toFixed(1)} cm`;

function growthScreen() {
  const now = Date.now();
  const evs = store.events();
  const sex = S().sex;
  const birth = birthMs();
  const entries = evs.filter(e => e.type === 'growth').sort((a, b) => b.start - a.start);
  const ageNow = birth ? growth.ageMonths(birth, now) : null;

  if (!sex) {
    return `<h2 class="sec">Growth</h2>
      <div class="card">
        <b>Is ${esc(babyName())} a girl or a boy?</b>
        <p class="muted">The WHO growth curves are different for girls and boys, so Lull needs this once
        to compare measurements. You can change it later in settings.</p>
        <div class="row"><button class="btn ghost" data-sex="girl">Girl</button>
        <button class="btn ghost" data-sex="boy">Boy</button></div>
      </div>`;
  }

  // latest value of each measure + where it sits on the WHO curve
  const tiles = Object.entries(growth.MEASURES).map(([k, m]) => {
    const last = growth.series(evs, k).at(-1);
    const a = last && birth ? growth.assess(k, sex, birth, last.start, last[m.field]) : null;
    return `<button class="gstat" data-measure="${k}" aria-pressed="${String(k === growthMeasure)}">
      <small>${m.label}</small>
      <b>${last ? kgCm(k, last[m.field]) : '—'}</b>
      <span>${a ? `${growth.pctLabel(a.pct)} percentile` : last ? 'past the 2-year chart' : 'not measured'}</span>
    </button>`;
  }).join('');

  let chart = '';
  if (birth) {
    const m = growth.MEASURES[growthMeasure];
    const pts = growth.series(evs, growthMeasure)
      .map(e => [growth.ageMonths(birth, e.start), e[m.field]])
      .filter(([mo]) => mo >= 0 && mo <= growth.MAX_MONTHS);
    // show a few months ahead of today, at least six, at most the WHO 0–24 range
    const toMonths = Math.min(growth.MAX_MONTHS,
      Math.max(6, Math.ceil(Math.max(ageNow, ...pts.map(p => p[0])) + 2)));
    const curves = growth.CURVES.map(pct => ({ pct, pts: growth.curve(growthMeasure, sex, pct, toMonths) }));
    const last = growth.series(evs, growthMeasure).at(-1);
    const a = last ? growth.assess(growthMeasure, sex, birth, last.start, last[m.field]) : null;
    chart = `<div class="card tight">
      <div class="trend-head"><b>${m.label} for age · WHO ${sex === 'girl' ? 'girls' : 'boys'}</b>
        <span>${a ? `${growth.pctLabel(a.pct)} percentile` : ''}</span></div>
      ${growthChart({ curves, points: pts, toMonths, unit: m.unit, ageNow })}
      <div class="legend"><span>${`<i style="background:var(--accent)"></i>`}${esc(babyName())}</span>
        <span>Grey lines: 3rd, 15th, 50th, 85th, 97th percentile</span></div>
      ${a ? `<p class="faint" style="margin:8px 0 0">${growth.pctLabel(a.pct)} percentile means that of 100 healthy
        ${sex === 'girl' ? 'girls' : 'boys'} the same age, about ${Math.max(1, Math.min(99, Math.round(a.pct)))} measure less.
        It is not a score — what matters is following a curve over time.</p>` : ''}
    </div>`;
  } else {
    chart = `<div class="card"><div class="faint">Add a birth date in settings to see the growth curves.</div></div>`;
  }

  const list = entries.length ? `<h2 class="sec">Measurements</h2>
    <div class="card">${entries.map(entryRow).join('')}</div>` : '';

  return `<h2 class="sec">Growth</h2>
    <div class="gstats">${tiles}</div>
    ${chart}
    <button class="btn" id="add-growth" style="margin-top:4px">+ Add measurement</button>
    ${list}
    ${ageNow > growth.MAX_MONTHS ? `<p class="faint">The WHO charts here cover birth to 2 years.</p>` : ''}
    <p class="faint" style="margin:14px 2px 0">Curves: WHO Child Growth Standards (2006), birth to 2 years.
    Your health visitor may use a national chart that differs slightly. A single measurement says little; a baby crossing two lines up or down is worth
    mentioning to your health visitor or doctor. Not medical advice.</p>`;
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
      <label>Growth curves</label>
      ${sheets.chipRow('sex', [{ v: 'girl', t: 'Girl' }, { v: 'boy', t: 'Boy' }], s.sex)}
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

    <h2 class="sec" style="margin-top:4px">Cloud backup</h2>
    <div id="st-cloud">${cloudBlock()}</div>

    <h2 class="sec" style="margin-top:22px">Backup file</h2>
    <div class="row">
      <button class="btn ghost" id="st-export">Save file</button>
      <button class="btn ghost" id="st-import">Restore file</button>
    </div>
    <input type="file" id="st-file" accept="application/json,.json" hidden />
    <p class="faint" style="margin:10px 0 0">Your logs live on this phone (${store.storageMode()})${cloud.account()
      ? ', with an encrypted copy in your cloud backup' : ' and nothing is uploaded'}.
    A backup file is a plain copy you can keep or move to another phone.</p>
    <button class="btn danger" id="st-wipe" style="margin-top:14px">Delete all logged data</button>
    <p class="faint" style="margin-top:16px">Lull · offline baby tracker. Age guides are pediatric-sleep
    consensus ranges, not medical advice.</p>`;

  sheets.openSheet(html, (sheet, closeIt) => {
    sheets.wireChips(sheet);
    wireCloud(sheet, closeIt);
    const save = async () => {
      await store.setSetting('name', sheet.querySelector('#st-name').value.trim() || 'Baby');
      const bv = sheet.querySelector('#st-birth').value;
      if (bv) await store.setSetting('birth', new Date(bv + 'T12:00:00').getTime());
      render();
    };
    sheet.querySelector('#st-name').addEventListener('change', save);
    sheet.querySelector('#st-birth').addEventListener('change', save);
    sheet.querySelector('[data-chipgroup="sex"]').addEventListener('pick', e => { store.setSetting('sex', e.detail); render(); });
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
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1';
        btn.textContent = cloud.account() ? 'Tap again: deletes here AND in the cloud backup' : 'Tap again to delete everything';
        return;
      }
      for (const e of [...store.events()]) await store.deleteEvent(e.id);
      closeIt(); sheets.toast('All entries deleted'); render();
    });
  });
}

/* ---------------- cloud backup ---------------- */
function cloudLine() {
  const a = cloud.account(), st = cloud.getStatus();
  if (st.state === 'syncing') return 'Backing up…';
  if (st.state === 'offline') return 'Offline. It will back up when you are online again.';
  if (st.state === 'error') return `⚠️ ${esc(st.msg)}`;
  return a.at ? `✓ Backed up ${relative(a.at, Date.now())}` : 'Not backed up yet';
}

function cloudBlock() {
  const a = cloud.account();
  if (!a) return `
    <p class="faint" style="margin:0 0 10px">Off. Turn it on and Lull keeps an encrypted copy of your logs online, so you can
    get them back on a new phone, or share them with a partner's phone.</p>
    <button class="btn ghost" id="cl-setup">Set up cloud backup</button>`;
  return `
    <div class="card tight" style="margin-bottom:10px">
      <b id="cl-status">${cloudLine()}</b>
      <div class="faint" style="margin-top:3px">${esc(a.email)} · backs up automatically</div>
    </div>
    <div class="row">
      <button class="btn ghost" id="cl-now">Back up now</button>
      <button class="btn ghost" id="cl-out">Log out</button>
    </div>
    <button class="btn danger" id="cl-del" style="margin-top:10px">Delete cloud backup</button>`;
}

function wireCloud(sheet, closeIt) {
  const box = sheet.querySelector('#st-cloud');
  const redraw = () => { box.innerHTML = cloudBlock(); wire(); };
  const stop = cloud.onStatus(() => {
    if (!box.isConnected) { stop(); return; }
    const line = box.querySelector('#cl-status');
    if (line && cloud.account()) line.innerHTML = cloudLine(); else redraw();
  });
  function wire() {
    box.querySelector('#cl-setup')?.addEventListener('click', () => cloudSheet('new'));
    box.querySelector('#cl-now')?.addEventListener('click', () => cloud.syncNow());
    box.querySelector('#cl-out')?.addEventListener('click', async () => {
      await cloud.logout(); sheets.toast('Logged out. Your logs stay on this phone'); redraw();
    });
    box.querySelector('#cl-del')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.dataset.sure !== '1') {
        btn.dataset.sure = '1'; btn.textContent = 'Tap again to delete the online copy'; return;
      }
      try { await cloud.deleteAccount(); sheets.toast('Cloud backup deleted. This phone keeps its logs'); redraw(); }
      catch (e) { sheets.toast(e.message); }
    });
  }
  wire();
}

/** Create-account / log-in form. `fromOnboarding` finishes the first-run screen on success. */
function cloudSheet(mode, { fromOnboarding = false } = {}) {
  const isNew = mode === 'new';
  const html = `
    <h3>Cloud backup</h3>
    <div class="field">
      ${sheets.chipRow('clmode', [{ v: 'new', t: 'New account' }, { v: 'login', t: 'I already have one' }], mode)}
    </div>
    <form id="cl-form">
    <div class="field">
      <label for="cl-email">Email</label>
      <input id="cl-email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" />
    </div>
    <div class="field">
      <label for="cl-pw">Password</label>
      <input id="cl-pw" type="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" />
    </div>
    ${isNew ? `<div class="field">
      <label for="cl-pw2">Password again</label>
      <input id="cl-pw2" type="password" autocomplete="new-password" />
    </div>` : ''}
    <p class="faint" style="margin:0 0 14px">${isNew
      ? `<b>Everything already logged on this phone is kept and uploaded.</b>
         Your logs are locked with your password <b>before</b> they leave this phone. Nobody else can read them,
         not even whoever runs the server. That also means <b>a forgotten password can't be reset</b>, so write it
         down somewhere safe. Your email is only your username: Lull never sends you mail.`
      : `Your backup is merged with what's already on this phone. Nothing here is deleted.`}</p>
    <p class="cl-err" id="cl-err" role="alert" hidden></p>
    <button class="btn" id="cl-go" type="submit">${isNew ? 'Create account and back up' : 'Log in and restore'}</button>
    </form>`;

  sheets.openSheet(html, (sheet, closeIt) => {
    sheets.wireChips(sheet);
    sheet.querySelector('[data-chipgroup="clmode"]').addEventListener('pick', e => {
      const email = sheet.querySelector('#cl-email').value;
      cloudSheet(e.detail, { fromOnboarding });
      document.querySelector('#cl-email').value = email;
    });
    const err = sheet.querySelector('#cl-err');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    // a real <form> lets the phone's password manager offer to save and fill the login
    sheet.querySelector('#cl-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = sheet.querySelector('#cl-go');
      if (btn.disabled) return;               // already working on it (Enter pressed twice)
      const email = sheet.querySelector('#cl-email').value;
      const pw = sheet.querySelector('#cl-pw').value;
      err.hidden = true;
      if (!looksLikeEmail(email)) return fail('Enter your email address.');
      if (isNew && pw.length < 8) return fail('Use a password of at least 8 characters.');
      if (isNew && pw !== sheet.querySelector('#cl-pw2').value) return fail("The two passwords don't match.");
      if (!pw) return fail('Enter your password.');
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = isNew ? 'Locking and uploading…' : 'Unlocking your backup…';
      const before = store.events().length;
      try {
        if (isNew) await cloud.register(email, pw); else await cloud.login(email, pw);
      } catch (e) {
        btn.disabled = false; btn.textContent = label;
        return fail(e.message);
      }
      if (cloud.getStatus().state === 'error') {
        // logged in, but the first backup didn't go through: say so rather than claim success
        closeIt(); sheets.toast(cloud.getStatus().msg); render(); return;
      }
      closeIt();
      const got = store.events().length - before;
      sheets.toast(isNew ? 'Cloud backup is on ✓' : `Logged in ✓ ${got > 0 ? `${got} entries restored` : 'Everything is up to date'}`);
      if (fromOnboarding) finishOnboarding();
      else render();
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
    tab === 'patterns' ? patternsScreen() :
    tab === 'growth' ? growthScreen() : soundsScreen()}</div>`;
  screen.scrollTop = keepScroll;
  document.querySelectorAll('#tabs button').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
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

/** "Day started" for the day on screen: the viewed day in the Log, otherwise this morning. */
function openDayStart() {
  const now = Date.now(), cur = currentDate(store.events(), now);
  const viewingPast = tab === 'log' && logDay != null && logDay < cur;
  const base = viewingPast ? logDay + 6.5 * HOUR : now;
  // if the viewed day already has a logged start, edit that one instead of adding a second
  const existing = viewingPast && store.events().find(e => e.type === 'daystart' && startOfDay(e.start) === logDay);
  sheets.dayStartSheet(existing || null, { baseMs: base, onDone: render });
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
    const now = Date.now(), cur = currentDate(store.events(), now);
    const base = logDay == null || logDay >= cur ? now : logDay + 12 * HOUR;
    const stub = { start: base };
    if (btn.dataset.add === 'daystart') openDayStart();
    else if (btn.dataset.add === 'sleep') sheets.sleepSheet({ ...stub, type: 'sleep', id: undefined, end: base + 3600000 }, { onDone: render });
    else if (btn.dataset.add === 'feed') sheets.feedSheet({ ...stub, type: 'feed', kind: 'breast', id: undefined }, { unit: unit(), onDone: render });
    else sheets.diaperSheet({ ...stub, type: 'diaper', kind: 'wet', id: undefined }, { onDone: render });
  }));
  screen.querySelector('#day-prev')?.addEventListener('click', () => { logDay = prevDate(logDay); render(); });
  screen.querySelector('#day-next')?.addEventListener('click', () => {
    if (logDay < currentDate(store.events(), Date.now())) { logDay = nextDate(logDay); render(); }
  });
  screen.querySelector('#log-daystart')?.addEventListener('click', () => openDayStart());
  screen.querySelector('#fix-daystart')?.addEventListener('click', () => openDayStart());
  // tap a sleep (or a nap's time) in the day circle to see its details
  screen.querySelectorAll('[data-sleep]').forEach(el => {
    const open = () => {
      const ev = store.events().find(e => e.id === el.dataset.sleep);
      if (ev) sheets.sleepInfo(ev, { onDone: render });
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  screen.querySelector('#add-night')?.addEventListener('click', (e) => {
    // suggest 19:30 (or right after the last nap, if later) until the next morning's wake-up
    const from = Number(e.currentTarget.dataset.from), to = Number(e.currentTarget.dataset.to);
    const bed = new Date(from); bed.setHours(19, 30, 0, 0);
    sheets.sleepSheet({ type: 'sleep', start: Math.max(bed.getTime(), from + 30 * MIN), end: to }, { onDone: render });
  });
  screen.querySelectorAll('[data-sound]').forEach(btn => btn.addEventListener('click', () => {
    sounds.play(btn.dataset.sound); render();
  }));
  screen.querySelector('[data-chipgroup="span"]')?.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    trendSpan = c.dataset.value === 'all' ? 'all' : Number(c.dataset.value);
    render();
  });
  screen.querySelectorAll('[data-sex]').forEach(b => b.addEventListener('click', async () => {
    await store.setSetting('sex', b.dataset.sex); render();
  }));
  screen.querySelectorAll('[data-measure]').forEach(b => b.addEventListener('click', () => {
    growthMeasure = b.dataset.measure; render();
  }));
  screen.querySelector('#add-growth')?.addEventListener('click', () => sheets.growthSheet(null, { onDone: render }));
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
function finishOnboarding() {
  if (!S().birth) {          // logged in, but the backup had no baby details yet
    sheets.toast('Logged in. Now add the name and birth date');
    return;
  }
  $('#onboard').hidden = true; $('#app').hidden = false; render();
}

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
      finishOnboarding();
    });
    $('#ob-login').addEventListener('click', () => cloudSheet('login', { fromOnboarding: true }));
  } else {
    $('#app').hidden = false;
  }

  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-theme').addEventListener('click', cycleTheme);
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    if (tab === 'log') logDay = null;
    render();
  }));
  store.subscribe(() => {});                       // keeps the cache authoritative
  // a merge from another phone should show up on screen straight away
  cloud.onStatus(st => { if (st.state === 'ok' && !$('#app').hidden && !document.querySelector('.sheet')) render(); });
  cloud.start();
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
self.__lull = { store, predict, sounds, cloud, render: () => render(), get tab() { return tab; }, set tab(t) { tab = t; render(); } };
