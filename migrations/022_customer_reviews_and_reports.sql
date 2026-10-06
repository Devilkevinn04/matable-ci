CREATE TABLE IF NOT EXISTS customer_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
  target_id BIGINT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  UNIQUE (order_id, user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS customer_reports (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_reviews_public
  ON customer_reviews(target_type, target_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_reports_moderation
  ON customer_reports(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_reports_one_open_per_target
  ON customer_reports(user_id, target_type, target_id)
  WHERE status IN ('pending', 'in_review');
