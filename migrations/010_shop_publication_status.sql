ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS publication_status TEXT;

UPDATE shops
SET publication_status = CASE
  WHEN is_active = 0 THEN 'suspended'
  WHEN merchant_verification_status IN ('pending', 'submitted', 'under_review', 'rejected') THEN 'draft'
  WHEN subscription_status NOT IN ('trialing', 'active') THEN 'draft'
  ELSE 'active'
END
WHERE publication_status IS NULL;

ALTER TABLE shops
  ALTER COLUMN publication_status SET DEFAULT 'draft',
  ALTER COLUMN publication_status SET NOT NULL;