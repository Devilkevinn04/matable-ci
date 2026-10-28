CREATE TABLE IF NOT EXISTS order_contact_audits (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'merchant')),
  actor_id BIGINT NOT NULL,
  contact_role TEXT NOT NULL CHECK (contact_role IN ('customer', 'merchant')),
  ip_hash TEXT NOT NULL,
  revealed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_contact_audits_actor_time
  ON order_contact_audits(actor_type, actor_id, revealed_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_contact_audits_ip_time
  ON order_contact_audits(ip_hash, revealed_at DESC);
