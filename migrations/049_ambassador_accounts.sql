ALTER TABLE ambassadors ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE TABLE IF NOT EXISTS ambassador_invites (
  token_hash TEXT PRIMARY KEY,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ambassador_invites_ambassador
  ON ambassador_invites(ambassador_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ambassador_sessions (
  token TEXT PRIMARY KEY,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ambassador_sessions_ambassador
  ON ambassador_sessions(ambassador_id, expires_at);