ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS pending_subscription_tier TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS pending_subscription_effective_at TEXT;
