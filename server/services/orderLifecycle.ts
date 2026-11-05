import { databaseMode, dbAll, dbTransaction, type DatabaseTransaction } from '../../db.ts';
import type { OrderRecord } from '../types.ts';
import { dispatchDeliveryCancelledPush } from './deliveryNotifications.ts';
import { getVapidConfiguration, sendMerchantPush } from './pushNotifications.ts';

export const PENDING_ORDER_TTL_MS = 2 * 60 * 60 * 1000;
export const PENDING_ORDER_REMINDER_DELAY_MS = 30 * 60 * 1000;
const PENDING_ORDER_REMINDER_EVENT_PREFIX = 'pending-order-reminder:';

function pendingOrderReminderEventKey(orderId: number, pendingSince: string) {
  return `${PENDING_ORDER_REMINDER_EVENT_PREFIX}${orderId}:${pendingSince}`;
}

export interface OrderStockUpdate {
  productId: number;
  shopId: number;
  stock: number;
  isAvailable: boolean;
}

export interface ExpiredPendingOrder {
  orderId: number;
  shopId: number;
  stockUpdates: OrderStockUpdate[];
  cancelledDelivery?: {
    id: number;
    previousStatus: string;
    driverId: number | null;
  };
}

export async function restoreReservedOrderStock(
  transaction: DatabaseTransaction,
  order: Pick<OrderRecord, 'items'>,
  shopId: number,
): Promise<OrderStockUpdate[]> {
  const quantities = new Map<number, number>();
  for (const item of order.items || []) {
    if (!Number.isSafeInteger(item.product_id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Les articles de cette commande sont incohérents.');
    }
    quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
  }

  const updates: OrderStockUpdate[] = [];
  for (const [productId, quantity] of quantities) {
    const product = await transaction.get<{ stock: number | string; is_visible: number | boolean }>(
      `SELECT stock, is_visible FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [productId, shopId],
    );
    if (!product) continue;
    const stock = Number(product.stock) + quantity;
    const isAvailable = stock > 0 && Boolean(product.is_visible);
    await transaction.run(
      'UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ?',
      [stock, isAvailable ? 1 : 0, productId, shopId],
    );
    updates.push({ productId, shopId, stock, isAvailable });
  }
  return updates;
}

async function expirePendingOrder(
  transaction: DatabaseTransaction,
  orderId: number,
  now: string,
): Promise<{ type: 'expired'; order: ExpiredPendingOrder } | { type: 'blockedByDelivery' } | null> {
  const cutoff = new Date(Date.parse(now) - PENDING_ORDER_TTL_MS).toISOString();
  const row = await transaction.get<{
    id: number | string;
    shop_id: number | string;
    created_at: string;
    pending_since: string | null;
    status: string;
    items: string | OrderRecord['items'];
  }>(`
    SELECT id, shop_id, created_at, pending_since, status, items FROM orders
    WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}
  `, [orderId]);
  if (!row || row.status !== 'pending' || (row.pending_since || row.created_at) > cutoff) return null;

  const delivery = await transaction.get<{
    id: number | string;
    status: string;
    driver_id: number | string | null;
  }>(`
    SELECT id, status, driver_id FROM delivery_orders
    WHERE order_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}
  `, [orderId]);
  if (delivery?.status === 'picked_up') return { type: 'blockedByDelivery' };

  const items = typeof row.items === 'string' ? JSON.parse(row.items) as OrderRecord['items'] : row.items;
  if (!Array.isArray(items)) throw new Error(`Invalid order items for order ${orderId}.`);
  const shopId = Number(row.shop_id);
  const updated = await transaction.run(
    "UPDATE orders SET status = 'expired', delivery_fee = 0, pending_since = NULL WHERE id = ? AND status = 'pending'",
    [orderId],
  );
  if (updated.changes !== 1) return null;
  await transaction.run(`UPDATE merchant_push_deliveries SET sent_at = ?, last_error = 'order_expired'
    WHERE shop_id = ? AND event_key = ? AND sent_at IS NULL`,
  [now, shopId, pendingOrderReminderEventKey(orderId, row.pending_since || row.created_at)]);
  const stockUpdates = await restoreReservedOrderStock(transaction, { items }, shopId);

  let cancelledDelivery: ExpiredPendingOrder['cancelledDelivery'];
  if (delivery && ['requested', 'accepted', 'to_pickup'].includes(delivery.status)) {
    await transaction.run(
      "UPDATE delivery_orders SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = ?",
      [now, delivery.id, delivery.status],
    );
    await transaction.run(`INSERT INTO delivery_course_events
      (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
      VALUES (?, 'admin', NULL, ?, 'cancelled', ?)`,
    [delivery.id, delivery.status, now]);
    cancelledDelivery = {
      id: Number(delivery.id),
      previousStatus: delivery.status,
      driverId: delivery.driver_id === null ? null : Number(delivery.driver_id),
    };
  }

  return { type: 'expired', order: { orderId, shopId, stockUpdates, cancelledDelivery } };
}

export async function expireStalePendingOrders(nowMs = Date.now(), limit = 200): Promise<ExpiredPendingOrder[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Pending order expiry limit must be between 1 and 1000.');
  }
  const now = new Date(nowMs).toISOString();
  const cutoff = new Date(nowMs - PENDING_ORDER_TTL_MS).toISOString();
  const candidates = await dbAll<{ id: number | string }>(
    "SELECT id FROM orders WHERE status = 'pending' AND COALESCE(pending_since, created_at) <= ? ORDER BY COALESCE(pending_since, created_at) ASC, id ASC LIMIT ?",
    [cutoff, limit],
  );
  const expired: ExpiredPendingOrder[] = [];
  for (const candidate of candidates) {
    const result = await dbTransaction((transaction) => expirePendingOrder(transaction, Number(candidate.id), now));
    if (!result) continue;
    if (result.type === 'blockedByDelivery') {
      console.error(`Pending order ${Number(candidate.id)} could not expire because its delivery is already picked up.`);
      continue;
    }
    expired.push(result.order);
    if (result.order.cancelledDelivery) {
      void dispatchDeliveryCancelledPush(
        result.order.cancelledDelivery.id,
        result.order.cancelledDelivery.previousStatus,
        result.order.cancelledDelivery.driverId,
        'admin',
      );
    }
  }
  return expired;
}

export async function remindPendingOrdersWithoutResponse(nowMs = Date.now(), limit = 100): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Pending order reminder limit must be between 1 and 1000.');
  }
  if (!getVapidConfiguration()) return 0;

  const reminderCutoff = new Date(nowMs - PENDING_ORDER_REMINDER_DELAY_MS).toISOString();
  const expiryCutoff = new Date(nowMs - PENDING_ORDER_TTL_MS).toISOString();
  const candidates = await dbAll<{
    id: number | string;
    shop_id: number | string;
    created_at: string;
    pending_since: string | null;
  }>(`
    SELECT orders.id, orders.shop_id, orders.created_at, orders.pending_since
    FROM orders
    WHERE orders.status = 'pending'
      AND COALESCE(orders.pending_since, orders.created_at) <= ?
      AND COALESCE(orders.pending_since, orders.created_at) > ?
      AND EXISTS (
        SELECT 1 FROM merchant_push_subscriptions subscriptions
        WHERE subscriptions.shop_id = orders.shop_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM merchant_push_deliveries deliveries
        WHERE deliveries.shop_id = orders.shop_id
          AND deliveries.event_key = '${PENDING_ORDER_REMINDER_EVENT_PREFIX}' || orders.id || ':' || COALESCE(orders.pending_since, orders.created_at)
      )
    ORDER BY COALESCE(orders.pending_since, orders.created_at) ASC, orders.id ASC
    LIMIT ?
  `, [reminderCutoff, expiryCutoff, limit]);

  let nextIndex = 0;
  let remindedOrders = 0;
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
    while (nextIndex < candidates.length) {
      const candidate = candidates[nextIndex++];
      if (!candidate) continue;
      const orderId = Number(candidate.id);
      const shopId = Number(candidate.shop_id);
      const pendingSince = candidate.pending_since || candidate.created_at;
      try {
        const result = await sendMerchantPush(shopId, {
          eventKey: pendingOrderReminderEventKey(orderId, pendingSince),
          category: 'orders',
          title: 'Commande en attente',
          body: 'Une commande attend votre réponse depuis 30 minutes.',
          url: '/app',
          tag: `order-pending-${orderId}`,
        });
        if (result.sent > 0) remindedOrders += 1;
      } catch (error) {
        console.error(`Unable to send pending order reminder for order ${orderId}.`, error);
      }
    }
  }));
  return remindedOrders;
}

export function expirePendingOrderInTransaction(
  transaction: DatabaseTransaction,
  orderId: number,
  now = new Date().toISOString(),
) {
  return expirePendingOrder(transaction, orderId, now);
}
