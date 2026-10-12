ALTER TABLE shop_boosts
  ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'directory';

CREATE INDEX IF NOT EXISTS idx_shop_boosts_placement_capacity
  ON shop_boosts(placement, city, category, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS subscription_reminder_deliveries (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  days_before INTEGER NOT NULL,
  attempted_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT,
  UNIQUE (shop_id, expires_at, days_before)
);

ALTER TABLE subscription_reminder_deliveries
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1;
