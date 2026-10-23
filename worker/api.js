/* Lull cloud backup — the request handling, shared by the real Worker (index.js,
   on Cloudflare D1) and the local test server (dev-server.mjs, in memory).

   The server is deliberately dumb. It never sees an email address, a password
   or a single baby log:
     user  = SHA-256 fingerprint of the email, made on the phone
     auth  = a 256-bit proof derived from the password on the phone
     blob  = the backup, already encrypted on the phone with a key the server never gets
   It only checks the proof and stores/returns the blob. `rev` goes up by one per
   upload, so two phones on one account can't silently overwrite each other. */

const HEX64 = /^[0-9a-f]{64}$/;
export const MAX_BLOB = 1_900_000;           // D1 rows top out at 2 MB; a gzip'd year of logs is ~200 KB
const MAX_FAILS = 10, LOCK_MS = 15 * 60_000; // 10 wrong passwords -> 15 minute pause

const CORS = {
  'Access-Control-Allow-Origin': '*',        // no cookies are used, so an open origin can't be abused for CSRF
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
function sameHex(a, b) {                     // compare without leaking how many characters matched
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* db: { get(user), create(row), setFails(user, fails, lockUntil), put(user, baseRev, blob, now) -> newRev|null, remove(user) } */
export async function handle(req, db, now = Date.now()) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const path = new URL(req.url).pathname;
  if (path === '/' || path === '/health') return json({ ok: true, service: 'lull-cloud' });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const b = await req.json().catch(() => null);
  if (!b || !HEX64.test(b.user || '') || !HEX64.test(b.auth || '')) return json({ error: 'bad_request' }, 400);

  if (path === '/register') {
    if (await db.get(b.user)) return json({ error: 'exists' }, 409);
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    await db.create({ user: b.user, salt, hash: await sha256(salt + b.auth), created: now });
    return json({ ok: true, rev: 0 });
  }

  // everything else needs the right password proof
  const acc = await db.get(b.user);
  if (!acc) return json({ error: 'wrong_login' }, 401);   // same answer as a wrong password
  if (acc.lock_until > now) return json({ error: 'locked', retryAfter: Math.ceil((acc.lock_until - now) / 1000) }, 429);
  if (!sameHex(await sha256(acc.salt + b.auth), acc.hash)) {
    const fails = acc.fails + 1;
    if (fails >= MAX_FAILS) await db.setFails(b.user, 0, now + LOCK_MS);
    else await db.setFails(b.user, fails, 0);
    return json({ error: 'wrong_login' }, 401);
  }
  if (acc.fails) await db.setFails(b.user, 0, 0);

  if (path === '/login') return json({ ok: true, rev: acc.rev, updated: acc.updated });
  if (path === '/pull')  return json({ rev: acc.rev, updated: acc.updated, blob: acc.blob || null });
  if (path === '/push') {
    if (typeof b.blob !== 'string' || !b.blob) return json({ error: 'bad_request' }, 400);
    if (b.blob.length > MAX_BLOB) return json({ error: 'too_big' }, 413);
    const rev = await db.put(b.user, Number(b.baseRev) || 0, b.blob, now);
    if (rev === null) return json({ error: 'conflict', rev: acc.rev }, 409);   // another phone uploaded first
    return json({ ok: true, rev, updated: now });
  }
  if (path === '/delete') { await db.remove(b.user); return json({ ok: true }); }
  return json({ error: 'not_found' }, 404);
}
