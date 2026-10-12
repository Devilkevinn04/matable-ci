CREATE TABLE IF NOT EXISTS merchant_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_merchant_push_subscriptions_shop
  ON merchant_push_subscriptions(shop_id);

CREATE TABLE IF NOT EXISTS merchant_push_deliveries (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempted_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT,
  last_error TEXT,
  attempted_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shop_id, event_key)
);

ALTER TABLE merchant_push_deliveries
  ADD COLUMN IF NOT EXISTS payload_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE merchant_push_deliveries
  ADD COLUMN IF NOT EXISTS attempted_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE merchant_push_deliveries
  ADD COLUMN IF NOT EXISTS sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE merchant_push_deliveries
  ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS platform_announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/app',
  created_at TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0
);
