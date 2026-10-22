// ===== Lull — bottom sheets (logging + editing) =====
import * as store from './store.js?v=15';
import { MIN, clock, dur, startOfDay, pad } from './util.js?v=15';
import { esc } from './charts.js?v=15';

const root = () => document.getElementById('sheet-root');

export function toast(msg) {
  const box = document.getElementById('toast');
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 1700);
  setTimeout(() => el.remove(), 2100);
}

/** Generic sheet. `html` is the inner markup; returns a close() function. */
export function openSheet(html, onMount) {
  close();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `<div class="grab"></div>${html}`;
  root().append(scrim, sheet);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', escClose);
  onMount?.(sheet, close);
  return close;
}
function escClose(e) { if (e.key === 'Escape') close(); }
export function close() {
  document.removeEventListener('keydown', escClose);
  root().innerHTML = '';
}

/* ---------- time helpers for the forms ---------- */
const timeValue = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
function msFromTime(baseMs, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(baseMs); d.setHours(h, m, 0, 0);
  // A time later than "now" on today almost always means yesterday evening.
  if (d.getTime() > Date.now() + 5 * MIN && startOfDay(baseMs) === startOfDay(Date.now())) {
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}

const timeField = (id, label, ms) => `
  <div class="field">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" type="time" value="${timeValue(ms)}" />
    <div class="nudge" data-nudge="${id}">
      <button type="button" data-min="-15">−15m</button>
      <button type="button" data-min="-5">−5m</button>
      <button type="button" data-min="now">Now</button>
      <button type="button" data-min="5">+5m</button>
    </div>
  </div>`;

function wireNudges(sheet) {
  sheet.querySelectorAll('[data-nudge]').forEach(box => {
    const input = sheet.querySelector('#' + box.dataset.nudge);
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-min]'); if (!btn) return;
      if (btn.dataset.min === 'now') { input.value = timeValue(Date.now()); return; }
      const base = msFromTime(Date.now(), input.value || timeValue(Date.now()));
      input.value = timeValue(base + Number(btn.dataset.min) * MIN);
    });
  });
}

function wireChips(sheet) {
  sheet.querySelectorAll('[data-chipgroup]').forEach(group => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      group.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
      group.dispatchEvent(new CustomEvent('pick', { detail: chip.dataset.value }));
    });
  });
}
const picked = (sheet, name) => {
  const el = sheet.querySelector(`[data-chipgroup="${name}"] .chip[aria-pressed="true"]`);
  return el ? el.dataset.value : null;
};
const chipRow = (name, items, active) => `
  <div class="chips" data-chipgroup="${name}">
    ${items.map(i => `<button type="button" class="chip" data-value="${i.v}" aria-pressed="${String(i.v === active)}">${esc(i.t)}</button>`).join('')}
  </div>`;

/* ---------- sleep ---------- */
export function sleepSheet(ev, { onDone } = {}) {
  const isNew = !ev;
  const start = ev?.start ?? Date.now();
  const hasEnd = !!ev?.end;
  const html = `
    <h3>${isNew ? 'Add sleep' : 'Edit sleep'}</h3>
    ${timeField('s-start', 'Fell asleep', start)}
    <div class="field">
      <label>Woke up</label>
      ${chipRow('ended', [{ v: 'no', t: 'Still asleep' }, { v: 'yes', t: 'Woke up at…' }], hasEnd ? 'yes' : 'no')}
    </div>
    <div id="endwrap" ${hasEnd ? '' : 'hidden'}>
      ${timeField('s-end', 'Wake time', ev?.end ?? Date.now())}
    </div>
    <div class="field">
      <label for="s-note">Note (optional)</label>
      <input id="s-note" type="text" value="${esc(ev?.note || '')}" placeholder="e.g. fell asleep in the pram" />
    </div>
    <button class="btn" id="s-save">${isNew ? 'Save sleep' : 'Save changes'}</button>
    ${isNew ? '' : '<button class="btn danger" id="s-del" style="margin-top:8px">Delete this sleep</button>'}`;

  openSheet(html, (sheet, closeIt) => {
    wireNudges(sheet); wireChips(sheet);
    const wrap = sheet.querySelector('#endwrap');
    sheet.querySelector('[data-chipgroup="ended"]').addEventListener('pick', (e) => {
      wrap.hidden = e.detail === 'no';
    });
    sheet.querySelector('#s-save').addEventListener('click', async () => {
      const startMs = msFromTime(start, sheet.querySelector('#s-start').value);
      let endMs = null;
      if (picked(sheet, 'ended') === 'yes') {
        endMs = msFromTime(startMs, sheet.querySelector('#s-end').value);
        if (endMs <= startMs) endMs += 86400000;                   // crossed midnight
        if (endMs - startMs > 20 * 3600000) { toast('That sleep is over 20 hours — check the times'); return; }
      }
      await store.saveEvent({ ...(ev || {}), type: 'sleep', start: startMs, end: endMs,
                              note: sheet.querySelector('#s-note').value.trim() || undefined });
      closeIt(); toast(isNew ? 'Sleep saved' : 'Sleep updated'); onDone?.();
    });
    sheet.querySelector('#s-del')?.addEventListener('click', async () => {
      await store.deleteEvent(ev.id); closeIt(); toast('Deleted'); onDone?.();
    });
  });
}

/* ---------- feed ---------- */
export function feedSheet(ev, { kind = 'breast', unit = 'ml', onDone } = {}) {
  const isNew = !ev;
  const start = ev?.start ?? Date.now();
  const k = ev?.kind || kind;
  const html = `
    <h3>${isNew ? 'Add feed' : 'Edit feed'}</h3>
    <div class="field">
      <label>Type</label>
      ${chipRow('kind', [{ v: 'breast', t: '🤱 Breast' }, { v: 'bottle', t: '🍼 Bottle' }, { v: 'solids', t: '🥣 Solids' }], k)}
    </div>
    ${timeField('f-start', 'Time', start)}
    <div class="field" data-for="breast">
      <label>Side</label>
      ${chipRow('side', [{ v: 'left', t: 'Left' }, { v: 'right', t: 'Right' }, { v: 'both', t: 'Both' }], ev?.side || 'left')}
    </div>
    <div class="field" data-for="breast">
      <label for="f-min">Minutes at the breast</label>
      <input id="f-min" type="number" inputmode="numeric" min="0" max="120" value="${ev?.minutes ?? ''}" placeholder="e.g. 18" />
    </div>
    <div class="field" data-for="bottle">
      <label for="f-amt">Amount (${esc(unit)})</label>
      <input id="f-amt" type="number" inputmode="numeric" min="0" max="500" step="5"
             value="${ev ? (unit === 'oz' ? (ev.amountMl ? (ev.amountMl / 29.5735).toFixed(1) : '') : (ev.amountMl ?? '')) : ''}" placeholder="${unit === 'oz' ? 'e.g. 5' : 'e.g. 150'}" />
    </div>
    <div class="field" data-for="solids">
      <label for="f-food">What did they eat?</label>
      <input id="f-food" type="text" value="${esc(ev?.food || '')}" placeholder="e.g. pear purée" />
    </div>
    <div class="field">
      <label for="f-note">Note (optional)</label>
      <input id="f-note" type="text" value="${esc(ev?.note || '')}" placeholder="" />
    </div>
    <button class="btn" id="f-save">${isNew ? 'Save feed' : 'Save changes'}</button>
    ${isNew ? '' : '<button class="btn danger" id="f-del" style="margin-top:8px">Delete this feed</button>'}`;

  openSheet(html, (sheet, closeIt) => {
    wireNudges(sheet); wireChips(sheet);
    const show = (kind) => sheet.querySelectorAll('[data-for]').forEach(el => { el.hidden = el.dataset.for !== kind; });
    show(k);
    sheet.querySelector('[data-chipgroup="kind"]').addEventListener('pick', e => show(e.detail));
    sheet.querySelector('#f-save').addEventListener('click', async () => {
      const kindNow = picked(sheet, 'kind');
      const rec = { ...(ev || {}), type: 'feed', kind: kindNow,
                    start: msFromTime(start, sheet.querySelector('#f-start').value),
                    note: sheet.querySelector('#f-note').value.trim() || undefined };
      if (kindNow === 'breast') {
        rec.side = picked(sheet, 'side');
        const m = Number(sheet.querySelector('#f-min').value);
        rec.minutes = m > 0 ? m : undefined;
        rec.end = rec.minutes ? rec.start + rec.minutes * MIN : undefined;
        rec.amountMl = undefined; rec.food = undefined;
      } else if (kindNow === 'bottle') {
        const v = Number(sheet.querySelector('#f-amt').value);
        rec.amountMl = v > 0 ? Math.round(unit === 'oz' ? v * 29.5735 : v) : undefined;
        rec.side = undefined; rec.minutes = undefined; rec.end = undefined; rec.food = undefined;
      } else {
        rec.food = sheet.querySelector('#f-food').value.trim() || undefined;
        rec.side = undefined; rec.minutes = undefined; rec.amountMl = undefined; rec.end = undefined;
      }
      await store.saveEvent(rec);
      closeIt(); toast(isNew ? 'Feed saved' : 'Feed updated'); onDone?.();
    });
    sheet.querySelector('#f-del')?.addEventListener('click', async () => {
      await store.deleteEvent(ev.id); closeIt(); toast('Deleted'); onDone?.();
    });
  });
}

/* ---------- diaper ---------- */
export function diaperSheet(ev, { onDone } = {}) {
  const isNew = !ev;
  const start = ev?.start ?? Date.now();
  const html = `
    <h3>${isNew ? 'Add diaper' : 'Edit diaper'}</h3>
    <div class="field">
      <label>What was in it</label>
      ${chipRow('kind', [{ v: 'wet', t: '💧 Wet' }, { v: 'dirty', t: '💩 Dirty' }, { v: 'both', t: 'Both' }, { v: 'dry', t: 'Dry' }], ev?.kind || 'wet')}
    </div>
    ${timeField('d-start', 'Time', start)}
    <div class="field">
      <label for="d-note">Note (optional)</label>
      <input id="d-note" type="text" value="${esc(ev?.note || '')}" placeholder="e.g. a bit of nappy rash" />
    </div>
    <button class="btn" id="d-save">${isNew ? 'Save diaper' : 'Save changes'}</button>
    ${isNew ? '' : '<button class="btn danger" id="d-del" style="margin-top:8px">Delete this diaper</button>'}`;

  openSheet(html, (sheet, closeIt) => {
    wireNudges(sheet); wireChips(sheet);
    sheet.querySelector('#d-save').addEventListener('click', async () => {
      await store.saveEvent({ ...(ev || {}), type: 'diaper', kind: picked(sheet, 'kind'),
        start: msFromTime(start, sheet.querySelector('#d-start').value),
        note: sheet.querySelector('#d-note').value.trim() || undefined });
      closeIt(); toast(isNew ? 'Diaper saved' : 'Diaper updated'); onDone?.();
    });
    sheet.querySelector('#d-del')?.addEventListener('click', async () => {
      await store.deleteEvent(ev.id); closeIt(); toast('Deleted'); onDone?.();
    });
  });
}

/** Route an entry to the right editor. */
export function editEvent(ev, opts = {}) {
  if (ev.type === 'sleep') return sleepSheet(ev, opts);
  if (ev.type === 'feed') return feedSheet(ev, opts);
  if (ev.type === 'diaper') return diaperSheet(ev, opts);
}

export { msFromTime, timeValue, chipRow, wireChips, wireNudges, picked };
