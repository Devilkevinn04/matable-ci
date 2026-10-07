CREATE TABLE IF NOT EXISTS didit_verification_sessions (
  session_id TEXT PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  last_webhook_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS last_webhook_at TEXT;
ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS consent_at TEXT NOT NULL DEFAULT '';
ALTER TABLE didit_verification_sessions
  ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_didit_sessions_shop_created
  ON didit_verification_sessions(shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS didit_webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS didit_schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM didit_schema_migrations WHERE name = 'replace_legacy_kyc_with_didit'
  ) THEN
    UPDATE shops
    SET merchant_verification_status = 'pending',
        publication_status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'draft' END;
    DROP TABLE IF EXISTS merchant_identity_verifications;
    INSERT INTO didit_schema_migrations (name, applied_at)
    VALUES ('replace_legacy_kyc_with_didit', NOW()::TEXT);
  END IF;
END $$;

DROP TABLE IF EXISTS merchant_identity_verifications;
