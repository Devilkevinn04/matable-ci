CREATE TABLE IF NOT EXISTS merchant_pin_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  owner_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_merchant_pin_reset_shop
  ON merchant_pin_reset_tokens(shop_id, expires_at);
