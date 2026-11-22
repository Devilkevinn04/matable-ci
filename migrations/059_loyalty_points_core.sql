-- Fidélité par points : un programme par boutique, registre des mouvements, récompenses.
-- Historique des statuts de commande, nécessaire à un futur score de boutique.
-- Aucune ligne de loyalty_transactions n’est modifiée ni supprimée par l’application :
-- une correction est un nouveau mouvement.

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'blocked')),
  points_per_order INTEGER NOT NULL DEFAULT 1 CHECK (points_per_order BETWEEN 1 AND 10),
  rule_version INTEGER NOT NULL DEFAULT 1,
  blocked_reason TEXT,
  activated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 3 AND 80),
  conditions TEXT NOT NULL DEFAULT '',
  cost_points INTEGER NOT NULL CHECK (cost_points BETWEEN 1 AND 50),
  remaining INTEGER CHECK (remaining IS NULL OR remaining >= 0),
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at TEXT NOT NULL,
  UNIQUE (program_id, user_id)
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  reward_id BIGINT NOT NULL REFERENCES loyalty_rewards(id) DEFERRABLE INITIALLY DEFERRED,
  reward_label TEXT NOT NULL,
  cost_points INTEGER NOT NULL CHECK (cost_points > 0),
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'used', 'released', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
  order_id BIGINT,
  redemption_id BIGINT REFERENCES loyalty_redemptions(id) DEFERRABLE INITIALLY DEFERRED,
  type TEXT NOT NULL CHECK (type IN ('earn', 'reverse', 'redeem', 'adjust', 'legacy')),
  points_delta INTEGER NOT NULL CHECK (points_delta <> 0),
  balance_after INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  rule_version INTEGER NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_program ON loyalty_rewards(program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_user ON loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_account ON loyalty_redemptions(account_id, status);
CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_expiry ON loyalty_redemptions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_account ON loyalty_transactions(account_id, id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_order ON order_status_events(order_id, id);
CREATE INDEX IF NOT EXISTS idx_order_status_events_shop ON order_status_events(shop_id, created_at);
