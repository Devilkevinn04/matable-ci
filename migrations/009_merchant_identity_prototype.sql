CREATE TABLE IF NOT EXISTS merchant_identity_verifications (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_number_hash TEXT NOT NULL UNIQUE,
  document_number_last4 TEXT NOT NULL DEFAULT '',
  identity_data_ciphertext TEXT NOT NULL,
  document_mime_type TEXT NOT NULL,
  document_ciphertext TEXT NOT NULL,
  selfie_mime_type TEXT NOT NULL,
  selfie_ciphertext TEXT NOT NULL,
  client_face_distance DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer_note TEXT
);

ALTER TABLE merchant_identity_verifications
  ADD COLUMN IF NOT EXISTS document_number_last4 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS identity_data_ciphertext TEXT;

CREATE INDEX IF NOT EXISTS idx_merchant_identity_verifications_status
  ON merchant_identity_verifications(status, submitted_at DESC);