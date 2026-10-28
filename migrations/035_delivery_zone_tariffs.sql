CREATE TABLE IF NOT EXISTS delivery_zones (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_active_label
  ON delivery_zones(is_active, label);

CREATE TABLE IF NOT EXISTS delivery_zone_tariffs (
  id BIGSERIAL PRIMARY KEY,
  origin_zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  destination_zone_id BIGINT NOT NULL REFERENCES delivery_zones(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (origin_zone_id, destination_zone_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_zone_tariffs_active_pair
  ON delivery_zone_tariffs(is_active, origin_zone_id, destination_zone_id);
