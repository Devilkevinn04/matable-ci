CREATE TABLE IF NOT EXISTS merchant_verification_consents (
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, consent_version)
);

CREATE TABLE IF NOT EXISTS merchant_verification_documents (
  id TEXT PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('storefront', 'interior', 'products', 'identity_front', 'identity_back', 'identity_passport')),
  object_key TEXT NOT NULL UNIQUE,
  upload_key TEXT,
  upload_expires_at TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  status TEXT NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'available')),
  created_at TEXT NOT NULL,
  expires_at TEXT
);

ALTER TABLE merchant_verification_documents
  ADD COLUMN IF NOT EXISTS upload_key TEXT;
ALTER TABLE merchant_verification_documents
  ADD COLUMN IF NOT EXISTS upload_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_merchant_verification_documents_shop_type
  ON merchant_verification_documents(shop_id, document_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_verification_documents_expiry
  ON merchant_verification_documents(expires_at) WHERE expires_at IS NOT NULL;
