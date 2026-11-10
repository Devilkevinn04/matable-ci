CREATE TABLE IF NOT EXISTS ambassador_link_click_events (
  event_id TEXT PRIMARY KEY,
  ambassador_id TEXT NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ambassador_link_click_events_ambassador_created
  ON ambassador_link_click_events(ambassador_id, created_at);

INSERT INTO ambassador_link_click_events (event_id, ambassador_id, created_at)
SELECT token_hash, ambassador_id, created_at
FROM ambassador_clicks
ON CONFLICT (event_id) DO NOTHING;
