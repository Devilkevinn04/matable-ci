ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_expires_at TEXT;

CREATE TABLE IF NOT EXISTS subscription_payment_intents (
  id TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL DEFAULT 'subscription',
  tier TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending',
  provider_reference TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_shop_created
  ON subscription_payment_intents(shop_id, created_at DESC);