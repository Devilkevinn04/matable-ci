ALTER TABLE subscription_payment_intents
  ADD COLUMN IF NOT EXISTS subscription_term TEXT NOT NULL DEFAULT 'monthly';

CREATE TABLE IF NOT EXISTS shop_boosts (
  id TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  payment_intent_id TEXT NOT NULL UNIQUE REFERENCES subscription_payment_intents(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  category TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  reservation_expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shop_boosts_capacity
  ON shop_boosts(city, category, status, starts_at, ends_at);
