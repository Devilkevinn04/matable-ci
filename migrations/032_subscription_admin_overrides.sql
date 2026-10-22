ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_admin_override_status TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_admin_override_tier TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_admin_override_until TEXT;
