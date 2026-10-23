// Cloud backup: encryption, the server's checks, and merging two phones.  Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, memoryDb } from '../worker/dev-server.mjs';
import { handle } from '../worker/api.js';
import { deriveAccount, seal, open } from '../js/vault.js';

globalThis.self = globalThis;                           // the app's browser-isms, in Node
const db = memoryDb();
const server = await serve(0, db);
const URL_ = `http://localhost:${server.address().port}`;
globalThis.location = { search: `?cloud=${URL_}` };     // point cloud.js at the test server
const store = await import('../js/store.js?v=21');
const cloud = await import('../js/cloud.js?v=21');
await store.init();
test.after(() => server.close());

const post = (path, body, now) => handle(new Request('http://x' + path, { method: 'POST', body: JSON.stringify(body) }), db, now)
  .then(async r => ({ status: r.status, data: await r.json() }));

test('the same email + password always gives the same keys; a different password does not', async () => {
  const a = await deriveAccount('  Mor@Example.com ', 'correct horse');
  const b = await deriveAccount('mor@example.com', 'correct horse');
  const c = await deriveAccount('mor@example.com', 'wrong horse');
  assert.deepEqual(a, b);
  assert.equal(a.user, c.user);                // same email -> same account
  assert.notEqual(a.auth, c.auth);
  assert.notEqual(a.keyHex, c.keyHex);
  assert.notEqual(a.auth, a.keyHex);           // the proof sent to the server is not the key
});

test('a sealed backup opens with the right key only, and holds no readable data', async () => {
  const k = await deriveAccount('a@b.dk', 'pw-123456');
  const other = await deriveAccount('a@b.dk', 'pw-654321');
  const data = { records: [{ id: '1', type: 'feed', note: 'Alba drank well' }] };
  const blob = await seal(data, k.keyHex, k.user);
  assert.ok(!blob.includes('Alba') && !blob.includes('feed'));
  assert.deepEqual(await open(blob, k.keyHex, k.user), data);
  await assert.rejects(open(blob, other.keyHex, other.user));
  const stranger = await deriveAccount('c@d.dk', 'pw-123456');
  await assert.rejects(open(blob, k.keyHex, stranger.user));       // can't be moved to another account
});

test('server: register once, wrong passwords are refused and eventually locked out', async () => {
  const k = await deriveAccount('lock@test.dk', 'secret-pass');
  const bad = await deriveAccount('lock@test.dk', 'guess');
  assert.equal((await post('/register', { user: k.user, auth: k.auth })).status, 200);
  assert.equal((await post('/register', { user: k.user, auth: bad.auth })).data.error, 'exists');
  assert.equal((await post('/login', { user: k.user, auth: k.auth })).status, 200);
  const stored = db.rows.get(k.user);
  assert.ok(!JSON.stringify(stored).includes(k.auth), 'server keeps a hash, not the proof itself');
  for (let i = 0; i < 10; i++) assert.equal((await post('/login', { user: k.user, auth: bad.auth })).status, 401);
  const locked = await post('/login', { user: k.user, auth: k.auth });
  assert.equal(locked.status, 429, 'even the right password waits out the lock');
  assert.equal((await post('/login', { user: k.user, auth: k.auth }, Date.now() + 16 * 60000)).status, 200);
  assert.equal((await post('/pull', { user: 'f'.repeat(64), auth: k.auth })).data.error, 'wrong_login');
});

test('server: an upload based on an old version is refused, so phones cannot overwrite each other', async () => {
  const k = await deriveAccount('rev@test.dk', 'secret-pass');
  await post('/register', { user: k.user, auth: k.auth });
  assert.equal((await post('/push', { user: k.user, auth: k.auth, blob: 'x', baseRev: 0 })).data.rev, 1);
  const stale = await post('/push', { user: k.user, auth: k.auth, blob: 'y', baseRev: 0 });
  assert.equal(stale.status, 409);
  assert.equal((await post('/pull', { user: k.user, auth: k.auth })).data.blob, 'x');
});

test('end to end: back up, merge another phone\'s changes, and carry deletions both ways', async () => {
  await store.setSetting('name', 'Alba');
  await store.setSetting('theme', 'night');                       // phone-only: must not travel
  const keep = await store.saveEvent({ type: 'feed', kind: 'bottle', ml: 120, start: Date.now() - 3600000 });
  const gone = await store.saveEvent({ type: 'diaper', kind: 'wet', start: Date.now() - 1800000 });

  await cloud.register('mor@example.com', 'god-nat-2026');
  assert.equal(cloud.getStatus().state, 'ok', cloud.getStatus().msg);
  await assert.rejects(cloud.register('mor@example.com', 'whatever'), /already has a Lull account/);

  // "the other phone": log in with the same details and read the backup
  const k = await deriveAccount('mor@example.com', 'god-nat-2026');
  const pulled = (await post('/pull', { user: k.user, auth: k.auth })).data;
  const snap = await open(pulled.blob, k.keyHex, k.user);
  assert.equal(snap.records.length, 2);
  assert.equal(snap.settings.name.value, 'Alba');
  assert.ok(!('theme' in snap.settings) && !('cloud' in snap.settings));

  // other phone logs a sleep and deletes the diaper, then uploads
  const later = Date.now() + 1000;
  snap.records.push({ id: 'from-dad', type: 'sleep', start: later - 600000, end: later, updatedAt: later });
  Object.assign(snap.records.find(r => r.id === gone.id), { deleted: true, updatedAt: later });
  await post('/push', { user: k.user, auth: k.auth, blob: await seal(snap, k.keyHex, k.user), baseRev: pulled.rev });

  // meanwhile this phone logs something too, then syncs
  const mine = await store.saveEvent({ type: 'feed', kind: 'breast', start: Date.now() });
  await cloud.syncNow();
  assert.equal(cloud.getStatus().state, 'ok', cloud.getStatus().msg);
  const ids = store.events().map(e => e.id).sort();
  assert.deepEqual(ids, [keep.id, mine.id, 'from-dad'].sort(), 'got dad\'s sleep, lost the deleted diaper, kept my feed');

  // and the cloud now has everything from both phones
  const final = await open((await post('/pull', { user: k.user, auth: k.auth })).data.blob, k.keyHex, k.user);
  const live = final.records.filter(r => !r.deleted).map(r => r.id).sort();
  assert.deepEqual(live, ids);
  assert.ok(final.records.find(r => r.id === gone.id).deleted);
});

test('a backup file never contains the account keys', async () => {
  assert.ok(store.settings().cloud);
  const file = JSON.parse(store.exportJSON());
  assert.ok(!('cloud' in file.settings));
});

test('wrong password on a new phone, then delete account keeps the phone\'s logs', async () => {
  await cloud.logout();
  await assert.rejects(cloud.login('mor@example.com', 'wrong-one'), /Wrong email or password/);
  await cloud.login('mor@example.com', 'god-nat-2026');
  const before = store.events().length;
  await cloud.deleteAccount();
  assert.equal(cloud.account(), null);
  assert.equal(store.events().length, before);
  const k = await deriveAccount('mor@example.com', 'god-nat-2026');
  assert.equal(db.rows.has(k.user), false);
});
