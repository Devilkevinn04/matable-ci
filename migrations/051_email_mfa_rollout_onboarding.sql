ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS owner_email_verified_at TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TEXT;

CREATE TABLE IF NOT EXISTS auth_email_rollout_notices (
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (subject_type, subject_id)
);
