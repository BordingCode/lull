-- One row per Lull account. Holds no email, no password and no readable baby data:
-- `user` is a fingerprint of the email, `hash` checks the password proof,
-- `blob` is the backup encrypted on the phone.
CREATE TABLE IF NOT EXISTS accounts (
  user       TEXT PRIMARY KEY,
  salt       TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created    INTEGER NOT NULL,
  fails      INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  rev        INTEGER NOT NULL DEFAULT 0,
  updated    INTEGER NOT NULL DEFAULT 0,
  blob       TEXT
);
