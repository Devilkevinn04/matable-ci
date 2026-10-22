ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_cancel_at TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_admin_suspended_at TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_admin_suspended_status TEXT;
