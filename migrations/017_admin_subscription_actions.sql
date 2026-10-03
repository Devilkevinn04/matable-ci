CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created
  ON admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_shop_created
  ON admin_audit_logs(shop_id, created_at DESC);

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS whatsapp_subscription_reminders_enabled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_subscription_reminders_consent_at TEXT;