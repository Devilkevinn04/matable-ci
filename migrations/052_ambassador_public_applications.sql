CREATE TABLE IF NOT EXISTS ambassador_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decision_reason TEXT,
  ambassador_id TEXT REFERENCES ambassadors(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ambassador_applications_status_created
  ON ambassador_applications(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ambassador_applications_pending_email
  ON ambassador_applications(LOWER(email))
  WHERE status = 'pending';
