import { dbAll, dbRun } from '../../db.ts';
import type { OrderRecord } from '../types.ts';

export async function loadOrdersFromDatabase(): Promise<OrderRecord[]> {
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT orders.*, order_whatsapp_tracking.order_id IS NOT NULL AS whatsapp_tracking_available,
      order_whatsapp_tracking.clicked_at AS whatsapp_clicked_at
    FROM orders LEFT JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
    ORDER BY orders.created_at DESC, orders.id DESC
  `);
  return rows.map((row) => ({
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    customer_name: String(row.customer_name),
    customer_phone: String(row.customer_phone),
    delivery_location: String(row.delivery_location),
    delivery_note: row.delivery_note ? String(row.delivery_note) : undefined,
    delivery_slot: row.delivery_slot ? String(row.delivery_slot) : undefined,
    payment_method_preference: String(row.payment_method_preference || 'to_confirm') as OrderRecord['payment_method_preference'],
    total_amount: Number(row.total_amount),
    created_at: String(row.created_at),
    status: String(row.status || 'pending') as OrderRecord['status'],
    whatsapp_tracking_available: Boolean(row.whatsapp_tracking_available),
    whatsapp_clicked_at: row.whatsapp_clicked_at == null ? null : String(row.whatsapp_clicked_at),
    customer_user_id: row.customer_user_id == null ? undefined : Number(row.customer_user_id),
    items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : [],
  }));
}

export async function persistOrder(order: OrderRecord): Promise<void> {
  await dbRun(`
    INSERT INTO orders (
      id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
      delivery_slot, payment_method_preference, total_amount, created_at, status, items, customer_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status
  `, [
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
    order.customer_user_id ?? null,
  ]);
}