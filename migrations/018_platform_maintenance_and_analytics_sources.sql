CREATE TABLE IF NOT EXISTS platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  maintenance_enabled INTEGER NOT NULL DEFAULT 0,
  maintenance_message TEXT NOT NULL DEFAULT 'Le service revient bientôt. Merci de votre patience.',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
VALUES (1, 0, 'Le service revient bientôt. Merci de votre patience.', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at DESC);