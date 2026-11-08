ALTER TABLE ambassador_commissions ADD COLUMN IF NOT EXISTS withdrawal_id TEXT;
CREATE TABLE IF NOT EXISTS ambassador_withdrawals (
  id TEXT PRIMARY KEY,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'paid')),
  payout_method TEXT NOT NULL,
  payout_phone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  payout_reference TEXT,
  admin_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_ambassador_withdrawals_ambassador
  ON ambassador_withdrawals(ambassador_id, created_at DESC);