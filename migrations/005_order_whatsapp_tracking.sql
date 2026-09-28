CREATE TABLE IF NOT EXISTS order_whatsapp_tracking (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  clicked_at TEXT
);