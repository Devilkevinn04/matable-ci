CREATE TABLE IF NOT EXISTS customer_oauth_identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_oauth_user_id
  ON customer_oauth_identities(user_id);
