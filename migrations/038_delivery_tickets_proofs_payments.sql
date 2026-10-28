ALTER TABLE delivery_drivers ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS ticket_number TEXT;

UPDATE delivery_orders SET ticket_number =
  'LIV-' || substr(created_at, 3, 2) || substr(created_at, 6, 2) || substr(created_at, 9, 2)
  || '-' || lpad(id::text, 6, '0')
  WHERE ticket_number IS NULL AND created_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_ticket_number
  ON delivery_orders(ticket_number);

ALTER TABLE delivery_driver_subscriptions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE TABLE IF NOT EXISTS delivery_driver_payment_intents (
  id TEXT PRIMARY KEY,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount = 1000),
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
  provider_reference TEXT,
  provider_checkout_url TEXT,
  provider_checked_at TEXT,
  provider_check_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_driver_payment_intents_reference
  ON delivery_driver_payment_intents(provider_reference);
CREATE INDEX IF NOT EXISTS idx_delivery_driver_payment_intents_driver
  ON delivery_driver_payment_intents(driver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL UNIQUE REFERENCES delivery_orders(id) ON DELETE CASCADE,
  driver_id BIGINT NOT NULL REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 307200),
  image_base64 TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_proofs_driver_created
  ON delivery_proofs(driver_id, created_at DESC);
