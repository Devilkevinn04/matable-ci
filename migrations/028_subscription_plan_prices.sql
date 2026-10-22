ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS subscription_plan_prices TEXT NOT NULL
  DEFAULT '{"standard":3000,"premium":5000,"pro":8000}';
