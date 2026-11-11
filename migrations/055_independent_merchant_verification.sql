ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS business_verification_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS identity_verification_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS business_verification_method TEXT;
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS identity_verification_method TEXT;

UPDATE shops
SET identity_verification_status = CASE merchant_verification_status
      WHEN 'verified' THEN 'approved'
      WHEN 'under_review' THEN 'under_review'
      WHEN 'rejected' THEN 'action_required'
      WHEN 'not_required' THEN 'not_submitted'
      ELSE 'pending'
    END,
    identity_verification_method = CASE
      WHEN merchant_verification_status IN ('not_required', 'pending') THEN NULL
      ELSE 'didit'
    END
WHERE identity_verification_method IS NULL;

CREATE INDEX IF NOT EXISTS idx_shops_business_verification_status
  ON shops(business_verification_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shops_identity_verification_status
  ON shops(identity_verification_status, created_at DESC);
