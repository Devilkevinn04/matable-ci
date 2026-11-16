CREATE TABLE IF NOT EXISTS trial_promotion_claims (
  shop_id BIGINT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'premium')),
  claimed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trial_promotion_claims_tier
  ON trial_promotion_claims(tier, claimed_at);
