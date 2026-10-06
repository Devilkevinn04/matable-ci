CREATE TABLE IF NOT EXISTS customer_favorites (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
  target_id BIGINT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS customer_product_likes (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_user_created
  ON customer_favorites(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_product_likes_product
  ON customer_product_likes(product_id);
