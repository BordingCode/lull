// ===== Lull — cloud backup =====
// Optional. When on, every change is encrypted on the phone and uploaded a few
// seconds later; logging in on another phone downloads and merges it back.
// The server (worker/) only ever holds scrambled bytes — see vault.js.

import * as store from './store.js?v=19';
import { deriveAccount, seal, open, normEmail } from './vault.js?v=19';

const SERVER = 'https://lull-cloud.mathiasjob.workers.dev';
const DEBOUNCE_MS = 3000;

// ?cloud=http://localhost:8788 points the app at the local test server. Only
// localhost is accepted, so a crafted link can't redirect someone's backup.
function server() {
  try {
    const u = new URLSearchParams(location.search).get('cloud');
    if (u && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) return u;
  } catch {}
  return SERVER;
}

/** The saved account on this phone, or null. Kept in a phone-only setting. */
export const account = () => store.settings().cloud || null;

let status = { state: account() ? 'idle' : 'off', msg: '' };
const watchers = new Set();
export const getStatus = () => status;
export function onStatus(fn) { watchers.add(fn); return () => watchers.delete(fn); }
function setStatus(state, msg = '') {
  status = { state, msg };
  for (const fn of watchers) { try { fn(status); } catch (e) { console.error(e); } }
}

class CloudError extends Error {}
const MESSAGES = {
  exists: 'That email already has a Lull account. Log in instead.',
  wrong_login: 'Wrong email or password.',
  too_big: 'The backup is too large to upload.',
};

async function call(path, body) {
  let res;
  try {
    res = await fetch(server() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new CloudError('No internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (res.ok || res.status === 409 && data.error === 'conflict') return { status: res.status, data };
  if (data.error === 'locked') {
    throw new CloudError(`Too many wrong tries. Wait ${Math.ceil(data.retryAfter / 60)} min and try again.`);
  }
  const err = new CloudError(MESSAGES[data.error] || 'The backup server had a problem. Try again later.');
  err.code = data.error;
  throw err;
}

/* ---------------- account ---------------- */

async function remember(email, keys) {
  await store.setSetting('cloud', { email: normEmail(email), ...keys, rev: 0, at: 0 });
  setStatus('idle');
}

/** Make a new account and upload everything on this phone. */
export async function register(email, password) {
  const keys = await deriveAccount(email, password);
  await call('/register', { user: keys.user, auth: keys.auth });
  await remember(email, keys);
  await syncNow();
}

/** Log in to an existing account and merge its backup into this phone. */
export async function login(email, password) {
  const keys = await deriveAccount(email, password);
  await call('/login', { user: keys.user, auth: keys.auth });
  await remember(email, keys);
  await syncNow();
}

/** Stop backing up on this phone. The logs on the phone are kept. */
export async function logout() {
  clearTimeout(timer);
  await store.setSetting('cloud', null);
  setStatus('off');
}

/** Delete the account and its backup from the server. The logs on the phone are kept. */
export async function deleteAccount() {
  const a = account(); if (!a) return;
  await call('/delete', { user: a.user, auth: a.auth });
  await logout();
}

/* ---------------- syncing ---------------- */

let running = null, again = false, timer = null, pushedEdits = -1;

/** Download, merge, and upload if the cloud is missing anything. Resolves when done. */
export function syncNow() {
  clearTimeout(timer);
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      do { again = false; await syncOnce(); } while (again);
    } finally { running = null; }
  })();
  return running;
}

async function syncOnce() {
  const a = account(); if (!a) return;
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const editsAtStart = pushedEdits = store.editCount();
      const { data: remote } = await call('/pull', { user: a.user, auth: a.auth });
      let behind = true;                         // an empty account always needs the first upload
      if (remote.blob) {
        let snap;
        try { snap = await open(remote.blob, a.keyHex, a.user); }
        catch { throw new CloudError("Couldn't unlock the backup. Log out and log in again."); }
        ({ behind } = await store.mergeSnapshot(snap));
      }
      let rev = remote.rev;
      if (behind) {
        const blob = await seal(store.snapshot(), a.keyHex, a.user);
        const put = await call('/push', { user: a.user, auth: a.auth, blob, baseRev: rev });
        if (put.status === 409) continue;        // another phone uploaded in between: merge theirs, try again
        rev = put.data.rev;
      }
      if (account()?.user !== a.user) return;    // logged out while we were busy
      await store.setSetting('cloud', { ...account(), rev, at: Date.now() });
      if (store.editCount() > editsAtStart) again = true;   // something was logged meanwhile
      setStatus('ok');
      return;
    }
    throw new CloudError('Another phone kept uploading at the same time. Try again.');
  } catch (e) {
    if (!(e instanceof CloudError)) console.error(e);
    if (e.code === 'wrong_login') {
      setStatus('error', 'This account was deleted or its password changed. Log in again.');
    } else setStatus(globalThis.navigator?.onLine === false ? 'offline' : 'error',
      e instanceof CloudError ? e.message : 'Backup failed. Will try again.');
  }
}

function soon() {
  if (!account()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

/** Hook automatic backup into the app. Call once after the store is loaded. */
export function start() {
  store.subscribe(() => { if (store.editCount() !== pushedEdits && account()) soon(); });
  addEventListener('online', () => { if (account()) syncNow(); });
  document.addEventListener('visibilitychange', () => {
    if (!account()) return;
    // leaving the app: send any waiting changes now. Coming back: fetch the other phone's.
    if (document.hidden) { if (store.editCount() !== pushedEdits) syncNow(); }
    else if (Date.now() - (account().at || 0) > 60000) syncNow();
  });
  if (account()) { pushedEdits = store.editCount(); syncNow(); }
}
