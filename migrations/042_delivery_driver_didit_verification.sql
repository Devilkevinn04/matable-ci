ALTER TABLE delivery_drivers
  ADD COLUMN IF NOT EXISTS identity_status TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS delivery_driver_identity_sessions (
  session_id TEXT PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  last_webhook_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_driver_identity_sessions_driver_created
  ON delivery_driver_identity_sessions(driver_id, created_at DESC);