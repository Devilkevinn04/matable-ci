ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS campaign TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_campaign TEXT;
