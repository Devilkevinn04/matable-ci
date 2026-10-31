-- D'où viennent les nouvelles boutiques (TikTok, WhatsApp, bouche-à-oreille...).
-- declared_source : réponse du commerçant à « Comment avez-vous connu MaTable ? ».
-- campaign : valeur ?src= / utm_source de la visite, seulement si l'analyse d'audience est acceptée.
CREATE TABLE IF NOT EXISTS shop_acquisitions (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  declared_source TEXT,
  campaign TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_acquisitions_created
  ON shop_acquisitions(created_at);
