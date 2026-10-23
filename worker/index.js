/* Lull cloud backup Worker. All the logic lives in api.js; this file only
   connects it to the D1 database. Deploy: see README.md in this folder. */
import { handle } from './api.js';

const d1 = (DB) => ({
  get: (user) => DB.prepare('SELECT * FROM accounts WHERE user = ?').bind(user).first(),
  create: (r) => DB.prepare('INSERT INTO accounts (user, salt, hash, created) VALUES (?, ?, ?, ?)')
    .bind(r.user, r.salt, r.hash, r.created).run(),
  setFails: (user, fails, lockUntil) => DB.prepare('UPDATE accounts SET fails = ?, lock_until = ? WHERE user = ?')
    .bind(fails, lockUntil, user).run(),
  // only succeeds when nobody else uploaded since this phone last looked (rev unchanged)
  put: async (user, baseRev, blob, now) => {
    const r = await DB.prepare('UPDATE accounts SET blob = ?, rev = rev + 1, updated = ? WHERE user = ? AND rev = ? RETURNING rev')
      .bind(blob, now, user, baseRev).first();
    return r ? r.rev : null;
  },
  remove: (user) => DB.prepare('DELETE FROM accounts WHERE user = ?').bind(user).run(),
});

export default {
  fetch: (req, env) => handle(req, d1(env.DB)),
};
