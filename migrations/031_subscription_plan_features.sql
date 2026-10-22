ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS subscription_plan_features TEXT NOT NULL
  DEFAULT '{"productLimit":null,"productPhotoLimit":6,"analyticsDayLimit":90,"boostDiscountPercent":15}';

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_features_snapshot TEXT;

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_features_effective_at TEXT;
