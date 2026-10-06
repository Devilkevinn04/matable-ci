import { databaseMode, dbGet, dbRun } from '../../db.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';

interface DemoSeedOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  shouldSeedDemoData: () => boolean;
  hashPin: (pin: string) => string;
}

export async function seedDemoDatabaseIfEmpty({
  shops,
  products,
  orders,
  shouldSeedDemoData,
  hashPin,
}: DemoSeedOptions): Promise<void> {
  if (databaseMode === 'postgresql') return;
  if (process.env.NODE_ENV === 'production' && !shouldSeedDemoData()) return;

  const shopRow = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM shops');
  if (Number(shopRow?.count || 0) > 0) return;

  const insertShop = `
    INSERT INTO shops (
      id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active,
      publication_status, subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const insertProduct = `
    INSERT INTO products (
      id, shop_id, title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const shop of shops) {
    await dbRun(insertShop, [
      shop.id,
      shop.name,
      shop.slug,
      shop.whatsapp_number,
      hashPin(shop.pin_code_hash),
      shop.theme_color,
      shop.welcome_message,
      shop.is_open ? 1 : 0,
      shop.is_active ? 1 : 0,
      shop.publication_status || (shop.is_active ? 'active' : 'suspended'),
      shop.trial_end ?? null,
      shop.last_notification_sent_at,
      shop.created_at,
      shop.category,
      shop.city ?? null,
      'standard',
      JSON.stringify(shop.theme_config),
    ]);

    for (const product of products.filter((item) => item.shop_id === shop.id)) {
      await dbRun(insertProduct, [
        product.id,
        product.shop_id,
        product.title,
        product.description ?? null,
        product.price,
        product.stock,
        product.image_url,
        product.is_available ? 1 : 0,
        product.category ?? null,
        product.sizes ? JSON.stringify(product.sizes) : null,
        product.colors ? JSON.stringify(product.colors) : null,
        product.lookbook_image ?? null,
        product.prep_time ?? null,
        product.modifier_groups ? JSON.stringify(product.modifier_groups) : null,
      ]);
    }
  }

  const orderCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM orders');
  if (Number(orderCount?.count || 0) > 0) return;

  const insertOrder = `
    INSERT INTO orders (
      id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
      delivery_slot, payment_method_preference, total_amount, created_at, status, items
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const order of orders) {
    await dbRun(insertOrder, [
      order.id,
      order.shop_id,
      order.customer_name,
      order.customer_phone,
      order.delivery_location,
      order.delivery_note ?? null,
      order.delivery_slot ?? null,
      order.payment_method_preference,
      order.total_amount,
      order.created_at,
      order.status || 'pending',
      JSON.stringify(order.items ?? []),
    ]);
  }
}
