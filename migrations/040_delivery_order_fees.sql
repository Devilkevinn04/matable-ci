ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN orders.delivery_fee IS
  'Frais de livraison MaTable facturés au client, en plus de total_amount (articles).';
