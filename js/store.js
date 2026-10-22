// ===== Lull — storage =====
// Everything lives on this device. Nothing is uploaded anywhere.
// IndexedDB is the real store; if a browser blocks it (private mode) we fall
// back to localStorage so the app still works instead of silently losing logs.
//
// Every record carries `id` + `updatedAt` + a `deleted` tombstone, so a future
// "share with partner" sync can merge two devices without a rewrite.

import { uid } from './util.js?v=15';

const DB_NAME = 'lull', DB_VERSION = 1, LS_KEY = 'lull.fallback.v1';
const EVENTS = 'events', SETTINGS = 'settings';

let db = null, useFallback = false;
let cache = { events: [], settings: {} };
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
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { events: [], settings: {} }; }
  catch { return { events: [], settings: {} }; }
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
    cache.settings = Object.fromEntries(set.map(s => [s.key, s.value]));
  } catch (e) {
    useFallback = true;
    cache = loadFallback();
    cache.events = (cache.events || []).filter(r => !r.deleted);
  }
  return cache;
}

export const events   = () => cache.events;
export const settings = () => cache.settings;
export const storageMode = () => (useFallback ? 'localStorage' : 'indexedDB');

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }

/** Create or update one event. Returns the stored record. */
export async function saveEvent(ev) {
  const rec = { ...ev, id: ev.id || uid(), updatedAt: Date.now() };
  const i = cache.events.findIndex(e => e.id === rec.id);
  if (i >= 0) cache.events[i] = rec; else cache.events.push(rec);
  cache.events.sort((a, b) => a.start - b.start);
  if (useFallback) saveFallback(); else await wrap(tx(EVENTS, 'readwrite').put(rec));
  emit();
  return rec;
}

/** Soft-delete, so a later sync knows it was removed on purpose. */
export async function deleteEvent(id) {
  const ev = cache.events.find(e => e.id === id);
  cache.events = cache.events.filter(e => e.id !== id);
  if (useFallback) saveFallback();
  else if (ev) await wrap(tx(EVENTS, 'readwrite').put({ ...ev, deleted: true, updatedAt: Date.now() }));
  emit();
}

export async function setSetting(key, value) {
  cache.settings[key] = value;
  if (useFallback) saveFallback(); else await wrap(tx(SETTINGS, 'readwrite').put({ key, value }));
  emit();
}

/** Full backup as a JSON string. */
export function exportJSON() {
  return JSON.stringify({ app: 'lull', version: 1, exportedAt: new Date().toISOString(),
                          settings: cache.settings, events: cache.events }, null, 2);
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
    if (cache.settings[k] === undefined) await setSetting(k, v);
  }
  return { added, total: data.events.length };
}
