ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS email_subscription_reminders_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS email_subscription_reminders_consent_at TEXT;

CREATE TABLE IF NOT EXISTS customer_password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_password_reset_user
  ON customer_password_reset_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS subscription_email_reminder_deliveries (
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  days_before INTEGER NOT NULL,
  attempted_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT,
  PRIMARY KEY (shop_id, expires_at, days_before)
);
