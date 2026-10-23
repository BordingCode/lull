/* LOCAL TESTING ONLY — never deployed. Runs the exact same api.js as the real
   Worker, but keeps accounts in memory instead of D1 (workerd won't run on the Pi).
       node worker/dev-server.mjs            -> http://localhost:8788
   Point the app at it by opening Lull with ?cloud=http://localhost:8788 */
import http from 'node:http';
import { handle } from './api.js';

export function memoryDb() {
  const rows = new Map();
  return {
    rows,
    get: async (user) => rows.get(user) || null,
    create: async (r) => { rows.set(r.user, { fails: 0, lock_until: 0, rev: 0, updated: 0, blob: null, ...r }); },
    setFails: async (user, fails, lockUntil) => { const r = rows.get(user); if (r) Object.assign(r, { fails, lock_until: lockUntil }); },
    put: async (user, baseRev, blob, now) => {
      const r = rows.get(user);
      if (!r || r.rev !== baseRev) return null;
      Object.assign(r, { blob, rev: r.rev + 1, updated: now });
      return r.rev;
    },
    remove: async (user) => { rows.delete(user); },
  };
}

export function serve(port = 8788, db = memoryDb()) {
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const r = await handle(new Request('http://localhost' + req.url,
      { method: req.method, headers: req.headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : raw }), db);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  return new Promise(ok => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  serve().then(() => console.log('lull cloud test server on http://localhost:8788'));
}
