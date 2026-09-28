ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS merchant_verification_status TEXT NOT NULL DEFAULT 'not_required';

ALTER TABLE merchant_verifications
  ALTER COLUMN callback_token_hash DROP NOT NULL;