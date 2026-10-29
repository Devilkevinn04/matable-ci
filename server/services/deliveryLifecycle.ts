import { databaseMode, dbAll, dbTransaction } from '../../db.ts';
import { dispatchDeliveryCancelledPush } from './deliveryNotifications.ts';

export const DEFAULT_DELIVERY_OFFER_TTL_MINUTES = 120;
const MAX_DELIVERY_OFFER_TTL_MINUTES = 7 * 24 * 60;
const EXPIRY_BATCH_SIZE = 200;
const TERMINAL_ORDER_STATUSES = new Set(['delivered', 'cancelled', 'expired', 'refunded']);

export function parseOfferTtlMinutes(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DELIVERY_OFFER_TTL_MINUTES;
  return Math.min(MAX_DELIVERY_OFFER_TTL_MINUTES, Math.max(5, Math.round(parsed)));
}

interface StaleDeliveryRow {
  id: number | string;
  order_id: number | string;
  order_status: string;
}

/**
 * Cancels courses that stayed `requested` past their offer window.
 * Returns the number of courses cancelled so callers can log or audit the batch.
 */
export async function expireStaleRequestedCourses(
  ttlMinutes: number = DEFAULT_DELIVERY_OFFER_TTL_MINUTES,
  now: Date = new Date(),
): Promise<number> {
  const ttl = parseOfferTtlMinutes(ttlMinutes);
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - ttl * 60_000).toISOString();
  const stale = await dbAll<StaleDeliveryRow>(`
    SELECT deliveries.id, deliveries.order_id, orders.status AS order_status
    FROM delivery_orders AS deliveries
    JOIN orders ON orders.id = deliveries.order_id
    WHERE deliveries.status = 'requested' AND deliveries.created_at < ?
    ORDER BY deliveries.created_at ASC
    LIMIT ?
  `, [cutoff, EXPIRY_BATCH_SIZE]);

  let cancelled = 0;
  for (const row of stale) {
    const deliveryId = Number(row.id);
    const didCancel = await dbTransaction(async (transaction) => {
      const current = await transaction.get<{ status: string }>(
        `SELECT status FROM delivery_orders WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId],
      );
      if (!current || current.status !== 'requested') return false;
      await transaction.run(
        'UPDATE delivery_orders SET status = ?, cancelled_at = ? WHERE id = ? AND status = ?',
        ['cancelled', nowIso, deliveryId, 'requested'],
      );
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'admin', NULL, 'requested', 'cancelled', ?)`,
      [deliveryId, nowIso]);
      await transaction.run('UPDATE orders SET delivery_fee = 0 WHERE id = ?', [row.order_id]);
      return true;
    });
    if (!didCancel) continue;
    cancelled += 1;
    if (!TERMINAL_ORDER_STATUSES.has(row.order_status)) {
      void dispatchDeliveryCancelledPush(deliveryId, 'requested', null, 'system');
    }
  }
  return cancelled;
}
