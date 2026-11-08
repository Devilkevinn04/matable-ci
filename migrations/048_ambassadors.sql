CREATE TABLE IF NOT EXISTS ambassadors (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  email TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ambassador_clicks (
  token_hash TEXT PRIMARY KEY, ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ambassador_referrals (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ambassador_commissions (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
  payment_id TEXT NOT NULL UNIQUE REFERENCES subscription_payment_intents(id),
  amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, approved_at TEXT, paid_at TEXT, payout_reference TEXT
);
CREATE TABLE IF NOT EXISTS ambassador_payouts (
  id TEXT PRIMARY KEY, ambassador_id TEXT NOT NULL REFERENCES ambassadors(id),
  shop_id BIGINT NOT NULL, shop_name TEXT NOT NULL, payment_id TEXT NOT NULL,
  amount INTEGER NOT NULL, reference TEXT NOT NULL, paid_at TEXT NOT NULL
);