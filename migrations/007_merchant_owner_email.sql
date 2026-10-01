ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_email_unique
  ON shops (LOWER(owner_email))
  WHERE owner_email IS NOT NULL AND owner_email <> '';