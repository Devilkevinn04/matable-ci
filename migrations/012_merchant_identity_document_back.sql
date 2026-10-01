ALTER TABLE merchant_identity_verifications
  ADD COLUMN IF NOT EXISTS document_back_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS document_back_ciphertext TEXT;