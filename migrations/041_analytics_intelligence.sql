ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS entity_id INTEGER;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS device TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS locale TEXT;
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS metadata TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
  ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity_created
  ON analytics_events(entity_type, entity_id, created_at DESC);

COMMENT ON COLUMN analytics_events.audience IS
  'Segment du parcours : public, customer, merchant, courier, admin.';
COMMENT ON COLUMN analytics_events.entity_type IS
  'Type d''entité observée : page, shop, product, search, order.';
COMMENT ON COLUMN analytics_events.entity_id IS
  'Identifiant interne de l''entité observée, sans donnée personnelle.';
COMMENT ON COLUMN analytics_events.metadata IS
  'Contexte agrégé au format JSON, limité à une liste blanche de clés.';

UPDATE analytics_events
SET entity_type = 'shop', entity_id = shop_id, audience = 'public'
WHERE event_type = 'page_view' AND entity_id IS NULL AND shop_id IS NOT NULL;

UPDATE analytics_events
SET entity_type = 'page', audience = 'public'
WHERE event_type = 'page_view' AND entity_type IS NULL;

UPDATE analytics_events
SET entity_type = 'product',
  entity_id = CAST(substr(path, 10) AS INTEGER)
WHERE event_type IN ('product_view', 'product_click') AND entity_id IS NULL
  AND path LIKE '/product/%' AND CAST(substr(path, 10) AS INTEGER) > 0;

UPDATE analytics_events
SET audience = 'customer'
WHERE audience IS NULL
  AND event_type IN ('product_view', 'product_click', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'order_created', 'whatsapp_click');

UPDATE analytics_events SET audience = 'public' WHERE audience IS NULL;
