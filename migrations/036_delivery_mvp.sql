CREATE TABLE IF NOT EXISTS delivery_drivers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  access_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_driver_sessions (
  token_hash TEXT PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_sessions_driver
  ON delivery_driver_sessions(driver_id);

CREATE TABLE IF NOT EXISTS delivery_driver_zones (
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (driver_id, zone_id)
);

CREATE TABLE IF NOT EXISTS delivery_driver_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount = 1000),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('sandbox', 'provider')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_subscriptions_driver
  ON delivery_driver_subscriptions(driver_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS delivery_shop_origins (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  pickup_zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  destination_zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  quoted_amount INTEGER NOT NULL CHECK (quoted_amount BETWEEN 1500 AND 2500),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'to_pickup', 'picked_up', 'delivered', 'cancelled')),
  driver_id BIGINT REFERENCES delivery_drivers(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  to_pickup_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_dispatch
  ON delivery_orders(status, pickup_zone_id, destination_zone_id, created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_driver_status
  ON delivery_orders(driver_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_course_events (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('merchant', 'driver', 'admin')),
  actor_id BIGINT,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_audits (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  contact_role TEXT NOT NULL CHECK (contact_role IN ('merchant', 'customer')),
  ip_hash TEXT NOT NULL,
  revealed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contact_audits_driver_time
  ON contact_audits(driver_id, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_audits_ip_time
  ON contact_audits(ip_hash, revealed_at DESC);
