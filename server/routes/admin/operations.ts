// Santé de la plateforme et commandes.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';
import type { OrderRecord } from '../../types.ts';
import { getPushSubscriptionCount, getVapidConfiguration } from '../../services/pushNotifications.ts';

export function registerOperationsRoutes(router: Router, ctx: AdminContext) {
  const {
    databaseMode,
    dbAll,
    dbGet,
    isVerificationAdmin,
  } = ctx;

  router.get('/health', async (_req, res) => {
    const latestAnalytics = await dbGet<{ created_at?: string }>('SELECT created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1');
    const now = new Date();
    const reminderCutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const expiryCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const pushFailureCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const counts = {
      shops: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM shops'))?.count || 0),
      products: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products'))?.count || 0),
      orders: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM orders'))?.count || 0),
    };
    const operations = {
      pending_order_reminders: 0,
      overdue_pending_orders: Number((await dbGet<{ count: number }>(
        "SELECT COUNT(*) AS count FROM orders WHERE status = 'pending' AND COALESCE(pending_since, created_at) <= ?",
        [expiryCutoff],
      ))?.count || 0),
      failed_push_deliveries_24h: Number((await dbGet<{ count: number }>(
        `SELECT COUNT(*) AS count FROM merchant_push_deliveries
         WHERE attempted_at >= ? AND sent_at IS NULL AND failed_count > 0`,
        [pushFailureCutoff],
      ))?.count || 0),
      push_subscriptions: await getPushSubscriptionCount(),
      push_configured: Boolean(getVapidConfiguration()),
    };
    if (operations.push_configured && operations.push_subscriptions > 0) {
      operations.pending_order_reminders = Number((await dbGet<{ count: number }>(`
        SELECT COUNT(*) AS count
        FROM orders
        WHERE status = 'pending'
          AND COALESCE(pending_since, created_at) <= ?
          AND COALESCE(pending_since, created_at) > ?
          AND EXISTS (
            SELECT 1 FROM merchant_push_subscriptions subscriptions
            WHERE subscriptions.shop_id = orders.shop_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM merchant_push_deliveries deliveries
            WHERE deliveries.shop_id = orders.shop_id
              AND deliveries.event_key = 'pending-order-reminder:' || orders.id || ':' || COALESCE(orders.pending_since, orders.created_at)
          )
      `, [reminderCutoff, expiryCutoff]))?.count || 0);
    }
    const alerts: Array<{ code: string; severity: 'warning' | 'critical'; count: number; message: string }> = [];
    if (operations.overdue_pending_orders > 0) {
      alerts.push({
        code: 'overdue_pending_orders',
        severity: 'critical',
        count: operations.overdue_pending_orders,
        message: `${operations.overdue_pending_orders} commande(s) en attente ont dépassé le délai de deux heures.`,
      });
    }
    if (operations.pending_order_reminders > 0) {
      alerts.push({
        code: 'pending_order_reminders',
        severity: 'warning',
        count: operations.pending_order_reminders,
        message: `${operations.pending_order_reminders} rappel(s) de commande dû(s) n’ont pas encore été enregistrés.`,
      });
    }
    if (operations.failed_push_deliveries_24h > 0) {
      alerts.push({
        code: 'failed_push_deliveries',
        severity: 'warning',
        count: operations.failed_push_deliveries_24h,
        message: `${operations.failed_push_deliveries_24h} livraison(s) Push ont échoué au cours des dernières 24 heures.`,
      });
    }
    if (operations.push_subscriptions > 0 && !operations.push_configured) {
      alerts.push({
        code: 'push_configuration',
        severity: 'warning',
        count: operations.push_subscriptions,
        message: 'Des appareils sont abonnés aux notifications Push, mais la configuration VAPID est indisponible.',
      });
    }
    const operationalStatus = alerts.some((alert) => alert.severity === 'critical')
      ? 'critical'
      : alerts.length > 0 ? 'warning' : 'ok';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', operational_status: operationalStatus, checked_at: now.toISOString(), database: databaseMode,
      database_path: databaseMode === 'sqlite' ? process.env.MATABLE_DB_PATH || 'data/matable.db' : null,
      counts, latest_analytics_event_at: latestAnalytics?.created_at || null,
      operations, alerts,
      integrations: { whatsapp_click_to_chat: 'available' },
    });
  });

  router.get('/orders', async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const requestedStatus = String(req.query.status || 'all');
    const allowedStatuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'rejected', 'expired']);
    if (requestedStatus !== 'all' && !allowedStatuses.has(requestedStatus)) {
      return res.status(400).json({ error: 'Filtre de statut de commande invalide.' });
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const filters: string[] = [];
    const params: unknown[] = [];
    if (requestedStatus !== 'all') {
      filters.push("COALESCE(orders.status, 'pending') = ?");
      params.push(requestedStatus);
    }
    if (search) {
      filters.push(`(CAST(orders.id AS TEXT) = ? OR LOWER(orders.customer_name) LIKE LOWER(?)
        OR LOWER(orders.customer_phone) LIKE LOWER(?) OR LOWER(shops.name) LIKE LOWER(?))`);
      params.push(search, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [filteredOrders, totalRow] = await Promise.all([
      dbAll<Record<string, unknown>>(`
        SELECT orders.id, orders.shop_id, shops.name AS shop_name, orders.customer_name, orders.customer_phone,
          orders.total_amount, orders.status, orders.created_at, orders.items
        FROM orders LEFT JOIN shops ON shops.id = orders.shop_id
        ${where}
        ORDER BY orders.created_at DESC, orders.id DESC LIMIT ? OFFSET ?
      `, [...params, limit, offset]),
      dbGet<{ total: number }>(`
        SELECT COUNT(*) AS total FROM orders
        LEFT JOIN shops ON shops.id = orders.shop_id
        ${where}
      `, params),
    ]);
    const orders = filteredOrders.map((order) => {
        const items: OrderRecord['items'] = order.items
          ? (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) as OrderRecord['items']
          : [];
        return {
          id: Number(order.id), shop_id: Number(order.shop_id),
          shop_name: order.shop_name == null ? 'Boutique inconnue' : String(order.shop_name),
          customer_name: String(order.customer_name), customer_phone: String(order.customer_phone),
          total_amount: isVerificationAdmin(req) ? 0 : Number(order.total_amount),
          status: String(order.status || 'pending'), created_at: String(order.created_at),
          items_count: (items || []).reduce((sum, item) => sum + item.quantity, 0),
        };
      });
    res.json({ orders, total: Number(totalRow?.total || 0), limit, offset, status: requestedStatus, search });
  });

}
