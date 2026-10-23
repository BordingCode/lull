// ===== Lull — storage =====
// Everything lives on this device. Only if the user turns on cloud backup does
// an encrypted copy leave the phone (see cloud.js).
// IndexedDB is the real store; if a browser blocks it (private mode) we fall
// back to localStorage so the app still works instead of silently losing logs.
//
// Every record carries `id` + `updatedAt` + a `deleted` tombstone, so a cloud
// backup and two phones on one account can merge without losing anything.

import { uid } from './util.js?v=21';

const DB_NAME = 'lull', DB_VERSION = 1, LS_KEY = 'lull.fallback.v1';
const EVENTS = 'events', SETTINGS = 'settings';

// Settings that belong to this phone only: never sent to the cloud. `cloud` (the
// account keys) is also kept out of backup files.
const LOCAL_ONLY = new Set(['cloud', 'reminders', 'theme']);

let db = null, useFallback = false;
// tombs = deleted records, kept so a deletion can reach the cloud backup and other phones.
// settingsAt = when each setting last changed, so the newer value wins in a merge.
let cache = { events: [], tombs: [], settings: {}, settingsAt: {} };
let edits = 0;                           // counts changes made on this phone (not ones merged in)
const listeners = new Set();

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(EVENTS)) {
        const s = d.createObjectStore(EVENTS, { keyPath: 'id' });
        s.createIndex('start', 'start');
      }
      if (!d.objectStoreNames.contains(SETTINGS)) d.createObjectStore(SETTINGS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

function loadFallback() {
  let c;
  try { c = JSON.parse(localStorage.getItem(LS_KEY)); } catch {}
  c = c || {};
  return { events: c.events || [], tombs: c.tombs || [], settings: c.settings || {}, settingsAt: c.settingsAt || {} };
}
function saveFallback() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
}

export async function init() {
  try {
    db = await idbOpen();
    const rows = await wrap(tx(EVENTS, 'readonly').getAll());
    const set  = await wrap(tx(SETTINGS, 'readonly').getAll());
    cache.events = rows.filter(r => !r.deleted);
    cache.tombs = rows.filter(r => r.deleted);
    cache.settings = Object.fromEntries(set.map(s => [s.key, s.value]));
    cache.settingsAt = Object.fromEntries(set.map(s => [s.key, s.updatedAt || 0]));
  } catch (e) {
    useFallback = true;
    cache = loadFallback();
    cache.events = cache.events.filter(r => !r.deleted);
  }
  cache.events.sort((a, b) => a.start - b.start);
  return cache;
}

export const events   = () => cache.events;
export const settings = () => cache.settings;
export const storageMode = () => (useFallback ? 'localStorage' : 'indexedDB');
export const editCount = () => edits;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }

/** Create or update one event. Returns the stored record. */
export async function saveEvent(ev) {
  const rec = { ...ev, id: ev.id || uid(), updatedAt: Date.now() };
  const i = cache.events.findIndex(e => e.id === rec.id);
  if (i >= 0) cache.events[i] = rec; else cache.events.push(rec);
  cache.events.sort((a, b) => a.start - b.start);
  cache.tombs = cache.tombs.filter(t => t.id !== rec.id);
  if (useFallback) saveFallback(); else await wrap(tx(EVENTS, 'readwrite').put(rec));
  edits++;
  emit();
  return rec;
}

/** Soft-delete, so a later sync knows it was removed on purpose. */
export async function deleteEvent(id) {
  const ev = cache.events.find(e => e.id === id);
  if (!ev) return;
  const tomb = { ...ev, deleted: true, updatedAt: Date.now() };
  cache.events = cache.events.filter(e => e.id !== id);
  cache.tombs.push(tomb);
  if (useFallback) saveFallback(); else await wrap(tx(EVENTS, 'readwrite').put(tomb));
  edits++;
  emit();
}

export async function setSetting(key, value, at = Date.now()) {
  cache.settings[key] = value;
  cache.settingsAt[key] = at;
  if (useFallback) saveFallback(); else await wrap(tx(SETTINGS, 'readwrite').put({ key, value, updatedAt: at }));
  if (!LOCAL_ONLY.has(key)) edits++;
  emit();
}

/* ---------------- cloud backup ---------------- */

/** Everything worth backing up, deletions included, with a timestamp on every piece. */
export function snapshot() {
  const settings = {};
  for (const [k, v] of Object.entries(cache.settings)) {
    if (!LOCAL_ONLY.has(k)) settings[k] = { value: v, updatedAt: cache.settingsAt[k] || 0 };
  }
  return { app: 'lull', v: 1, records: [...cache.events, ...cache.tombs], settings };
}

/** Merge a snapshot from the cloud into this phone: for each entry the newer copy wins.
 *  Returns { changed } (this phone took something new) and { behind } (the cloud is
 *  missing something this phone has, so it should be uploaded again). */
export async function mergeSnapshot(snap) {
  const theirs = new Map((snap.records || []).map(r => [r.id, r]));
  const mine = new Map([...cache.events, ...cache.tombs].map(r => [r.id, r]));
  let changed = false, behind = false;

  for (const r of theirs.values()) {
    const cur = mine.get(r.id);
    if (cur && (cur.updatedAt || 0) >= (r.updatedAt || 0)) continue;
    changed = true;
    cache.events = cache.events.filter(e => e.id !== r.id);
    cache.tombs = cache.tombs.filter(e => e.id !== r.id);
    (r.deleted ? cache.tombs : cache.events).push(r);
    if (!useFallback) await wrap(tx(EVENTS, 'readwrite').put(r));
  }
  for (const r of mine.values()) {
    const t = theirs.get(r.id);
    if (!t || (r.updatedAt || 0) > (t.updatedAt || 0)) behind = true;
  }

  const theirSet = snap.settings || {};
  for (const [k, s] of Object.entries(theirSet)) {
    if (LOCAL_ONLY.has(k)) continue;
    const mineAt = k in cache.settings ? (cache.settingsAt[k] || 0) : -1;
    if ((s.updatedAt || 0) > mineAt) {
      changed = true;
      cache.settings[k] = s.value; cache.settingsAt[k] = s.updatedAt;
      if (!useFallback) await wrap(tx(SETTINGS, 'readwrite').put({ key: k, value: s.value, updatedAt: s.updatedAt }));
    }
  }
  for (const k of Object.keys(cache.settings)) {
    if (LOCAL_ONLY.has(k)) continue;
    const t = theirSet[k];
    if (!t || (cache.settingsAt[k] || 0) > (t.updatedAt || 0)) behind = true;
  }

  if (changed) {
    cache.events.sort((a, b) => a.start - b.start);
    if (useFallback) saveFallback();
    emit();
  }
  return { changed, behind };
}

/** Full backup as a JSON string. */
export function exportJSON() {
  const settings = { ...cache.settings };
  delete settings.cloud;                 // account keys never go into a file
  return JSON.stringify({ app: 'lull', version: 1, exportedAt: new Date().toISOString(),
                          settings, events: cache.events }, null, 2);
}

/** Restore a backup. mode 'merge' keeps existing logs, 'replace' wipes first. */
export async function importJSON(text, mode = 'merge') {
  const data = JSON.parse(text);
  if (!data || data.app !== 'lull' || !Array.isArray(data.events)) throw new Error('Not a Lull backup file');
  if (mode === 'replace') {
    for (const e of [...cache.events]) await deleteEvent(e.id);
  }
  const existing = new Set(cache.events.map(e => e.id));
  let added = 0;
  for (const e of data.events) {
    if (e.deleted) continue;
    if (existing.has(e.id)) {
      const cur = cache.events.find(x => x.id === e.id);
      if ((e.updatedAt || 0) <= (cur.updatedAt || 0)) continue;   // keep the newer copy
    }
    await saveEvent(e); added++;
  }
  for (const [k, v] of Object.entries(data.settings || {})) {
    if (k !== 'cloud' && cache.settings[k] === undefined) await setSetting(k, v);
  }
  return { added, total: data.events.length };
}
