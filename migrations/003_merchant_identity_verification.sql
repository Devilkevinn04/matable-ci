CREATE TABLE IF NOT EXISTS merchant_verifications (
  shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_session_id TEXT NOT NULL UNIQUE,
  callback_token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  decided_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS merchant_verification_webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_merchant_verifications_status
  ON merchant_verifications(status, updated_at DESC);