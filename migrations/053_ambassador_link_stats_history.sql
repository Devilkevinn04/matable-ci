CREATE INDEX IF NOT EXISTS idx_ambassador_clicks_ambassador_created
  ON ambassador_clicks(ambassador_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ambassador_referrals_ambassador_created
  ON ambassador_referrals(ambassador_id, created_at);
