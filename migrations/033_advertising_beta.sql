CREATE TABLE IF NOT EXISTS advertising_beta_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  starts_at TEXT,
  ends_at TEXT,
  delivery_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

INSERT INTO advertising_beta_settings (id, delivery_enabled, updated_at)
VALUES (1, 0, CURRENT_TIMESTAMP::TEXT)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id TEXT PRIMARY KEY,
  shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('product', 'banner')),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days = 7),
  charter_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'rejected', 'scheduled', 'active', 'suspended', 'completed', 'cancelled')),
  starts_at TEXT,
  ends_at TEXT,
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  submitted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (shop_id, kind)
);

ALTER TABLE advertising_campaigns ADD COLUMN IF NOT EXISTS charter_accepted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_delivery
  ON advertising_campaigns(status, starts_at, ends_at, kind);
CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_shop
  ON advertising_campaigns(shop_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS advertising_campaign_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'shop_visit', 'contact_click')),
  visitor_hash TEXT NOT NULL,
  event_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (campaign_id, event_type, visitor_hash, event_date)
);

CREATE INDEX IF NOT EXISTS idx_advertising_campaign_events_campaign
  ON advertising_campaign_events(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS advertising_partner_requests (
  id TEXT PRIMARY KEY,
  contact_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  requested_format TEXT NOT NULL CHECK (requested_format IN ('banner', 'product', 'partnership', 'other')),
  objective TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'contacted', 'declined')),
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advertising_partner_requests_status
  ON advertising_partner_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS advertising_permanent_partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  descriptor TEXT NOT NULL,
  headline TEXT NOT NULL,
  logo_url TEXT,
  destination_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advertising_permanent_partners_public
  ON advertising_permanent_partners(is_active, sort_order, created_at);
