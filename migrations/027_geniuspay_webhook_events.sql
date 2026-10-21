ALTER TABLE subscription_payment_intents
  ADD COLUMN IF NOT EXISTS provider_checked_at TEXT;
ALTER TABLE subscription_payment_intents
  ADD COLUMN IF NOT EXISTS provider_check_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_reconcile
  ON subscription_payment_intents(status, provider_checked_at, created_at)
  WHERE provider_reference IS NOT NULL AND status IN ('pending', 'expired');

CREATE TABLE IF NOT EXISTS geniuspay_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  provider_reference TEXT,
  payload_sha256 TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received',
  result_code TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_geniuspay_webhook_events_intent_received
  ON geniuspay_webhook_events(payment_intent_id, received_at DESC);