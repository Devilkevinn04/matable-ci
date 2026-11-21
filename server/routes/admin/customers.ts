// Comptes clients.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';

export function registerCustomersRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbGet,
    dbTransaction,
    requireSuperAdmin,
    isVerificationAdmin,
  } = ctx;

  router.get('/customers', async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    if (!['all', 'active', 'suspended'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'Filtre de statut client invalide.' });
    }
    const filters: string[] = [];
    const filterParams: unknown[] = [];
    if (search) {
      filters.push(`(LOWER(users.first_name) LIKE LOWER(?) OR LOWER(users.last_name) LIKE LOWER(?)
        OR LOWER(users.email) LIKE LOWER(?) OR users.phone LIKE ?)`);
      filterParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (requestedStatus !== 'all') {
      filters.push('users.is_active = ?');
      filterParams.push(requestedStatus === 'active' ? 1 : 0);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [customers, count] = await Promise.all([
      dbAll<Record<string, unknown>>(`
        SELECT users.id, users.first_name, users.last_name, users.name, users.email, users.phone,
          users.created_at, users.is_active,
          COUNT(orders.id) AS orders_count,
          COALESCE(SUM(CASE WHEN COALESCE(orders.status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
            THEN orders.total_amount ELSE 0 END), 0) AS order_value,
          MAX(orders.created_at) AS last_order_at
        FROM users LEFT JOIN orders ON orders.customer_user_id = users.id
        ${whereClause}
        GROUP BY users.id
        ORDER BY users.created_at DESC, users.id DESC
        LIMIT ? OFFSET ?
      `, [...filterParams, limit, offset]),
      dbGet<{ total: number }>(`SELECT COUNT(*) AS total FROM users ${whereClause}`, filterParams),
    ]);
    res.json({
      customers: customers.map((customer) => ({
        id: Number(customer.id),
        first_name: String(customer.first_name || ''),
        last_name: String(customer.last_name || ''),
        name: String(customer.name || ''),
        email: String(customer.email || ''),
        phone: String(customer.phone || ''),
        created_at: String(customer.created_at),
        is_active: Boolean(customer.is_active),
        orders_count: Number(customer.orders_count || 0),
        order_value: isVerificationAdmin(req) ? 0 : Number(customer.order_value || 0),
        last_order_at: customer.last_order_at == null ? null : String(customer.last_order_at),
      })),
      total: Number(count?.total || 0),
      limit,
      offset,
      search,
      status: requestedStatus,
    });
  });

  router.get('/customers/:id', requireSuperAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Identifiant client invalide.' });
    }
    const customer = await dbGet<{
      id: number;
      first_name: string | null;
      last_name: string | null;
      name: string;
      email: string;
      phone: string;
      created_at: string;
      is_active: number | boolean;
    }>(`SELECT id, first_name, last_name, name, email, phone, created_at, is_active
      FROM users WHERE id = ?`, [userId]);
    if (!customer) return res.status(404).json({ error: 'Compte client introuvable.' });

    const orders = await dbAll<{
      id: number;
      shop_name: string | null;
      total_amount: number;
      status: string | null;
      created_at: string;
      items: unknown;
    }>(`SELECT orders.id, shops.name AS shop_name, orders.total_amount, orders.status,
        orders.created_at, orders.items
      FROM orders LEFT JOIN shops ON shops.id = orders.shop_id
      WHERE orders.customer_user_id = ?
      ORDER BY orders.created_at DESC, orders.id DESC
      LIMIT 50`, [userId]);
    const totalOrders = await dbGet<{ total: number }>(
      'SELECT COUNT(*) AS total FROM orders WHERE customer_user_id = ?',
      [userId],
    );

    return res.json({
      customer: {
        id: Number(customer.id),
        first_name: String(customer.first_name || ''),
        last_name: String(customer.last_name || ''),
        name: String(customer.name || ''),
        email: String(customer.email || ''),
        phone: String(customer.phone || ''),
        created_at: String(customer.created_at),
        is_active: Boolean(customer.is_active),
      },
      orders: orders.map((order) => {
        const items: unknown = typeof order.items === 'string'
          ? JSON.parse(order.items)
          : order.items ?? [];
        if (!Array.isArray(items)) throw new Error(`Customer order ${order.id} has invalid item data.`);
        const itemsCount = items.reduce((sum: number, item: unknown) => {
          if (!item || typeof item !== 'object' || !('quantity' in item)) {
            throw new Error(`Customer order ${order.id} has an invalid item entry.`);
          }
          const quantity = Number(item.quantity);
          if (!Number.isFinite(quantity) || quantity < 0) {
            throw new Error(`Customer order ${order.id} has an invalid item quantity.`);
          }
          return sum + quantity;
        }, 0);
        return {
          id: Number(order.id),
          shop_name: order.shop_name == null ? 'Boutique supprimée' : String(order.shop_name),
          total_amount: Number(order.total_amount),
          status: String(order.status || 'pending'),
          created_at: String(order.created_at),
          items_count: itemsCount,
        };
      }),
      total_orders: Number(totalOrders?.total || 0),
      orders_limit: 50,
    });
  });

  router.patch('/customers/:id/toggle-active', requireSuperAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    const expectedIsActive = req.body?.expected_is_active;
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(userId) || userId <= 0
      || typeof expectedIsActive !== 'boolean'
      || reason.length < 3) {
      return res.status(400).json({ error: 'Un motif (au moins 3 caractères) et le statut actuel sont requis.' });
    }

    const result = await dbTransaction(async ({ get, run }) => {
      const user = await get<{ id: number; is_active: number | boolean }>(
        'SELECT id, is_active FROM users WHERE id = ?',
        [userId],
      );
      if (!user) return 'missing' as const;
      if (Boolean(user.is_active) !== expectedIsActive) return 'stale' as const;

      const isActive = !expectedIsActive;
      const update = await run(
        'UPDATE users SET is_active = ? WHERE id = ? AND is_active = ?',
        [isActive ? 1 : 0, userId, expectedIsActive ? 1 : 0],
      );
      if (update.changes !== 1) return 'stale' as const;
      if (!isActive) await run('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          req.adminRole || 'super_admin',
          isActive ? 'customer_reactivated' : 'customer_suspended',
          null,
          JSON.stringify({ user_id: userId, is_active: isActive, reason }),
          new Date().toISOString(),
        ],
      );
      return isActive ? 'reactivated' as const : 'suspended' as const;
    });

    if (result === 'missing') return res.status(404).json({ error: 'Compte client introuvable.' });
    if (result === 'stale') return res.status(409).json({ error: 'Le statut du compte a changé. Actualisez la liste avant de réessayer.' });
    return res.json({ success: true, is_active: result === 'reactivated' });
  });

}
