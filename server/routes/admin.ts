import { Router } from 'express';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';

interface AdminRouterOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  databaseMode: 'sqlite' | 'postgresql';
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  refreshRuntimeDataFromDatabase: () => Promise<void>;
  persistShop: (shop: ShopRecord) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
  rotateMerchantAccessTokenForShop: (shopId: number) => Promise<string>;
}

export function createAdminRouter(options: AdminRouterOptions) {
  const { shops, products, orders, databaseMode, dbAll, dbGet, refreshRuntimeDataFromDatabase, persistShop, toSafeShop, rotateMerchantAccessTokenForShop } = options;
  const router = Router();

  router.get('/analytics', async (req, res) => {
    await refreshRuntimeDataFromDatabase();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const daily = await dbAll<{ date: string; page_views: number; unique_visitors: number }>(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
        COUNT(DISTINCT session_id) AS unique_visitors
      FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      GROUP BY date ORDER BY date ASC
    `, [since]);
    const orderDaily = await dbAll<{ date: string; orders: number; sales: number }>(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
      FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
      GROUP BY date ORDER BY date ASC
    `, [since]);
    const byShop = (await Promise.all(shops.map(async (shop) => {
      const traffic = await dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND shop_id = ? AND created_at >= ?
      `, [shop.id, since]);
      const pageViews = Number(traffic?.page_views || 0);
      const uniqueVisitors = Number(traffic?.unique_visitors || 0);
      const shopOrders = orders.filter((order) => order.shop_id === shop.id
        && order.created_at >= since
        && order.status !== 'cancelled'
        && order.status !== 'expired');
      const sales = shopOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      return {
        shop_id: shop.id, shop_name: shop.name, slug: shop.slug, page_views: pageViews,
        unique_visitors: uniqueVisitors, orders: shopOrders.length, sales,
        conversion_rate: uniqueVisitors ? Number(((shopOrders.length / uniqueVisitors) * 100).toFixed(1)) : 0,
      };
    }))).sort((left, right) => right.page_views - left.page_views);
    const totalViews = byShop.reduce((sum, shop) => sum + shop.page_views, 0);
    const totalVisitors = byShop.reduce((sum, shop) => sum + shop.unique_visitors, 0);
    const totalOrders = byShop.reduce((sum, shop) => sum + shop.orders, 0);
    res.json({
      days, since, daily, order_daily: orderDaily, by_shop: byShop,
      totals: {
        page_views: totalViews, unique_visitors: totalVisitors, orders: totalOrders,
        sales: byShop.reduce((sum, shop) => sum + shop.sales, 0),
        conversion_rate: totalVisitors ? Number(((totalOrders / totalVisitors) * 100).toFixed(1)) : 0,
      },
    });
  });

  router.get('/payments', async (req, res) => {
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 365) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const summary = await dbGet<{
      confirmed_count: number;
      collected_amount: number;
      pending_count: number;
      pending_amount: number;
      subscription_count: number;
      subscription_amount: number;
      promotion_count: number;
      promotion_amount: number;
    }>(`
      SELECT
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS confirmed_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS collected_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_amount,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN 1 END) AS subscription_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN amount ELSE 0 END), 0) AS subscription_amount,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN 1 END) AS promotion_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN amount ELSE 0 END), 0) AS promotion_amount
      FROM subscription_payment_intents
      WHERE (status = 'paid' AND paid_at >= ?) OR (status = 'pending' AND created_at >= ?)
    `, [since, since]);
    const payments = await dbAll<{
      id: string;
      shop_id: number;
      shop_name: string;
      payment_type: 'subscription' | 'promotion';
      tier: string;
      amount: number;
      currency: string;
      status: string;
      provider_reference: string | null;
      created_at: string;
      paid_at: string | null;
    }>(`
      SELECT intent.id, intent.shop_id, shops.name AS shop_name, intent.payment_type, intent.tier, intent.amount,
        intent.currency, intent.status, intent.provider_reference, intent.created_at, intent.paid_at
      FROM subscription_payment_intents AS intent
      JOIN shops ON shops.id = intent.shop_id
      WHERE (intent.status = 'paid' AND intent.paid_at >= ?)
        OR (intent.status = 'pending' AND intent.created_at >= ?)
      ORDER BY COALESCE(intent.paid_at, intent.created_at) DESC
      LIMIT 200
    `, [since, since]);
    const byTier = await dbAll<{ tier: string; count: number; amount: number }>(`
      SELECT tier, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
      FROM subscription_payment_intents
      WHERE status = 'paid' AND payment_type = 'subscription' AND paid_at >= ?
      GROUP BY tier ORDER BY amount DESC
    `, [since]);
    res.json({
      days,
      since,
      summary: {
        confirmed_count: Number(summary?.confirmed_count || 0),
        collected_amount: Number(summary?.collected_amount || 0),
        pending_count: Number(summary?.pending_count || 0),
        pending_amount: Number(summary?.pending_amount || 0),
        subscriptions: {
          count: Number(summary?.subscription_count || 0),
          amount: Number(summary?.subscription_amount || 0),
        },
        promotions: {
          count: Number(summary?.promotion_count || 0),
          amount: Number(summary?.promotion_amount || 0),
        },
      },
      by_tier: byTier.map((item) => ({ ...item, count: Number(item.count), amount: Number(item.amount) })),
      payments,
    });
  });

  router.get('/shops', async (_req, res) => {
    await refreshRuntimeDataFromDatabase();
    res.json(shops.map((shop) => {
      const actionableOrders = orders.filter((order) => order.shop_id === shop.id && order.status !== 'cancelled' && order.status !== 'expired');
      const totalSales = actionableOrders.reduce((sum, order) => sum + order.total_amount, 0);
      return {
        ...toSafeShop(shop),
        products_count: products.filter((product) => product.shop_id === shop.id).length,
        orders_count: actionableOrders.length,
        total_sales: totalSales,
        average_order_value: actionableOrders.length ? Math.round(totalSales / actionableOrders.length) : 0,
        last_order_at: actionableOrders.sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.created_at ?? null,
      };
    }));
  });

  router.patch('/shops/:id/featured', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const days = req.body?.days;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 90) {
      return res.status(400).json({ error: 'La durée doit être un nombre entier de 0 à 90 jours.' });
    }
    shop.featured_until = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
    await persistShop(shop);
    res.json({ success: true, featured_until: shop.featured_until });
  });

  router.get('/health', async (_req, res) => {
    await refreshRuntimeDataFromDatabase();
    const latestAnalytics = await dbGet<{ created_at?: string }>('SELECT created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1');
    const counts = {
      shops: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM shops'))?.count || 0),
      products: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products'))?.count || 0),
      orders: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM orders'))?.count || 0),
    };
    res.json({ status: 'ok', checked_at: new Date().toISOString(), database: databaseMode,
      database_path: databaseMode === 'sqlite' ? process.env.MATABLE_DB_PATH || 'data/matable.db' : null,
      counts, latest_analytics_event_at: latestAnalytics?.created_at || null,
      integrations: { whatsapp_click_to_chat: 'available' },
    });
  });

  router.get('/orders', async (req, res) => {
    await refreshRuntimeDataFromDatabase();
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedStatus = String(req.query.status || 'all');
    const allowedStatuses = new Set(['pending', 'confirmed', 'delivered', 'cancelled']);
    const filteredOrders = orders
      .filter((order) => requestedStatus === 'all' || (allowedStatuses.has(requestedStatus) && order.status === requestedStatus))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, limit)
      .map((order) => ({
        id: order.id, shop_id: order.shop_id,
        shop_name: shops.find((shop) => shop.id === order.shop_id)?.name || 'Boutique inconnue',
        customer_name: order.customer_name, customer_phone: order.customer_phone,
        delivery_location: order.delivery_location, total_amount: order.total_amount,
        status: order.status, created_at: order.created_at,
        items_count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      }));
    res.json({ orders: filteredOrders, total: filteredOrders.length, status: requestedStatus });
  });

  router.patch('/shops/:id/toggle-active', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.is_active) {
      shop.is_active = false;
      shop.publication_status ||= 'active';
    } else {
      shop.is_active = true;
      if (shop.publication_status === 'suspended') shop.publication_status = 'draft';
    }
    await persistShop(shop);
    res.json({ success: true, is_active: shop.is_active, shop: toSafeShop(shop) });
  });

  router.post('/shops/:id/access-link', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id);
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({ success: true, shop: toSafeShop(shop), public_url: `${origin}/${shop.slug}`, access_url: `${origin}/app?access=${encodeURIComponent(ownerAccessToken)}` });
  });

  router.post('/shops/:id/notification', (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const templates: Record<string, string> = {
      welcome: `Bonjour ${shop.name}, votre espace MaTable.ci est prêt. Pensez à compléter votre catalogue et à partager votre vitrine avec vos clients.`,
      catalog: `Bonjour ${shop.name}, pensez à vérifier vos articles, vos prix et vos disponibilités afin que votre vitrine MaTable.ci reste à jour.`,
      orders: `Bonjour ${shop.name}, pensez à consulter vos nouvelles commandes et à confirmer rapidement les demandes reçues via MaTable.ci.`,
      support: `Bonjour ${shop.name}, nous vous contactons au sujet de votre boutique MaTable.ci. Répondez à ce message si vous avez besoin d’aide.`,
    };
    const template = String(req.body?.template || '').trim();
    if (!templates[template]) return res.status(400).json({ error: 'Modèle de notification invalide.' });
    const message = templates[template];
    const phone = shop.whatsapp_number.replace(/\D/g, '');
    res.json({ success: true, delivery_mode: 'whatsapp_click_to_chat', template, message, whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
  });

  return router;
}
