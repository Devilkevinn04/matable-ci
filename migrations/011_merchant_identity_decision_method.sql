ALTER TABLE merchant_identity_verifications
  ADD COLUMN IF NOT EXISTS decision_method TEXT NOT NULL DEFAULT 'manual';