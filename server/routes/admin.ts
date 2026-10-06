import { Router } from 'express';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';
import { getSubscriptionPlanConfig, getSubscriptionState } from '../services/businessRules.ts';
import { getWhatsAppSubscriptionReminderConfig } from '../services/whatsappNotifications.ts';

interface AdminRouterOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  databaseMode: 'sqlite' | 'postgresql';
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
  refreshRuntimeDataFromDatabase: () => Promise<void>;
  persistShop: (shop: ShopRecord) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
  rotateMerchantAccessTokenForShop: (shopId: number) => Promise<string>;
}

export function createAdminRouter(options: AdminRouterOptions) {
  const { shops, products, orders, databaseMode, dbAll, dbGet, dbRun, refreshRuntimeDataFromDatabase, persistShop, toSafeShop, rotateMerchantAccessTokenForShop } = options;
  const router = Router();
  const logAdminAction = (action: string, shopId: number | null, details: Record<string, unknown>) => dbRun(
    'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
    ['super_admin', action, shopId, JSON.stringify(details), new Date().toISOString()],
  );

  router.get('/content-moderation', async (_req, res) => {
    const [reviews, reports] = await Promise.all([
      dbAll<Record<string, unknown>>(
        `SELECT reviews.id, reviews.shop_id, reviews.target_type, reviews.target_id, reviews.rating,
          reviews.comment, reviews.status, reviews.created_at, shops.name AS shop_name,
          products.title AS product_title, users.first_name AS customer_name
         FROM customer_reviews AS reviews
         LEFT JOIN shops ON shops.id = reviews.shop_id
         LEFT JOIN products ON reviews.target_type = 'product' AND products.id = reviews.target_id
         LEFT JOIN users ON users.id = reviews.user_id
         WHERE reviews.status = 'pending' ORDER BY reviews.created_at ASC LIMIT 200`,
      ),
      dbAll<Record<string, unknown>>(
        `SELECT reports.id, reports.target_type, reports.target_id, reports.reason, reports.details,
          reports.status, reports.created_at, shops.name AS shop_name, products.title AS product_title,
          users.first_name AS customer_name
         FROM customer_reports AS reports
         LEFT JOIN shops ON reports.target_type = 'shop' AND shops.id = reports.target_id
         LEFT JOIN products ON reports.target_type = 'product' AND products.id = reports.target_id
         LEFT JOIN users ON users.id = reports.user_id
         WHERE reports.status IN ('pending', 'in_review') ORDER BY reports.created_at ASC LIMIT 200`,
      ),
    ]);
    return res.json({ reviews, reports });
  });

  router.patch('/content-moderation/reviews/:id', async (req, res) => {
    const reviewId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0 || !['approved', 'hidden'].includes(status)) {
      return res.status(400).json({ error: 'Décision de modération invalide.' });
    }
    const review = await dbGet<{ shop_id: number; status: string }>(
      'SELECT shop_id, status FROM customer_reviews WHERE id = ?',
      [reviewId],
    );
    if (!review) return res.status(404).json({ error: 'Avis introuvable.' });
    await dbRun('UPDATE customer_reviews SET status = ?, reviewed_at = ? WHERE id = ?', [status, new Date().toISOString(), reviewId]);
    await logAdminAction('customer_review_moderated', Number(review.shop_id), { review_id: reviewId, status });
    return res.json({ success: true, status });
  });

  router.patch('/content-moderation/reports/:id', async (req, res) => {
    const reportId = Number(req.params.id);
    const status = String(req.body?.status || '');
    if (!Number.isSafeInteger(reportId) || reportId <= 0 || !['in_review', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Décision de traitement invalide.' });
    }
    const report = await dbGet<{ target_type: string; target_id: number; status: string }>(
      'SELECT target_type, target_id, status FROM customer_reports WHERE id = ?',
      [reportId],
    );
    if (!report) return res.status(404).json({ error: 'Signalement introuvable.' });
    await dbRun('UPDATE customer_reports SET status = ?, reviewed_at = ? WHERE id = ?', [status, new Date().toISOString(), reportId]);
    const shopId = report.target_type === 'shop'
      ? Number(report.target_id)
      : Number((await dbGet<{ shop_id: number }>('SELECT shop_id FROM products WHERE id = ?', [report.target_id]))?.shop_id) || null;
    await logAdminAction('customer_report_processed', shopId, { report_id: reportId, status });
    return res.json({ success: true, status });
  });

  router.get('/maintenance', async (_req, res) => {
    const settings = await dbGet<{
      maintenance_enabled: number | boolean;
      maintenance_message: string;
      updated_at: string;
      updated_by: string;
    }>('SELECT maintenance_enabled, maintenance_message, updated_at, updated_by FROM platform_settings WHERE id = 1');
    res.json({
      enabled: Boolean(settings?.maintenance_enabled),
      message: settings?.maintenance_message || 'Le service revient bientôt. Merci de votre patience.',
      updated_at: settings?.updated_at || null,
      updated_by: settings?.updated_by || null,
    });
  });

  router.patch('/maintenance', async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ error: 'Le statut du mode maintenance est invalide.' });
    }
    const message = String(req.body?.message || 'Le service revient bientôt. Merci de votre patience.')
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, 240) || 'Le service revient bientôt. Merci de votre patience.';
    const previous = await dbGet<{ maintenance_enabled: number | boolean; maintenance_message: string }>(
      'SELECT maintenance_enabled, maintenance_message FROM platform_settings WHERE id = 1',
    );
    const updatedAt = new Date().toISOString();
    await dbRun(`INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at, updated_by)
      VALUES (1, ?, ?, ?, 'super_admin')
      ON CONFLICT (id) DO UPDATE SET maintenance_enabled = excluded.maintenance_enabled,
        maintenance_message = excluded.maintenance_message, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [req.body.enabled ? 1 : 0, message, updatedAt]);
    await logAdminAction('maintenance_updated', null, {
      enabled: req.body.enabled,
      previous_enabled: Boolean(previous?.maintenance_enabled),
      message,
    });
    res.json({ enabled: req.body.enabled, message, updated_at: updatedAt, updated_by: 'super_admin' });
  });

  const getSubscriptionMetrics = async () => {
    const now = new Date();
    const states = shops.map((shop) => ({ shop, state: getSubscriptionState(shop, now) }));
    const mrrByTier = (['standard', 'premium', 'pro'] as const).map((tier) => {
      const count = states.filter(({ state }) => state.status === 'active' && state.plan === tier).length;
      return { tier, count, amount: count * getSubscriptionPlanConfig(tier).amount };
    });
    const activeTrials = states.filter(({ state }) => state.status === 'trialing');
    const expiringTrials = activeTrials.filter(({ state }) => state.trialDaysRemaining <= 7);
    const completedTrials = shops.filter((shop) => Boolean(shop.trial_start && shop.trial_end && Date.parse(shop.trial_end) <= now.getTime()));
    const convertedTrialRows = await dbAll<{ shop_id: number }>(`
      SELECT DISTINCT intents.shop_id
      FROM subscription_payment_intents AS intents
      JOIN shops ON shops.id = intents.shop_id
      WHERE intents.payment_type = 'subscription' AND intents.status = 'paid'
        AND intents.paid_at IS NOT NULL AND shops.trial_start IS NOT NULL
        AND intents.paid_at >= shops.trial_start
    `);
    const convertedTrialIds = new Set(convertedTrialRows.map((row) => Number(row.shop_id)));
    const convertedTrials = completedTrials.filter((shop) => convertedTrialIds.has(shop.id)).length;
    const mrr = mrrByTier.reduce((sum, tier) => sum + tier.amount, 0);
    return {
      mrr,
      active_subscriptions: mrrByTier.reduce((sum, tier) => sum + tier.count, 0),
      mrr_by_tier: mrrByTier,
      active_trials: activeTrials.length,
      trials_expiring_7d: expiringTrials.length,
      completed_trials: completedTrials.length,
      converted_trials: convertedTrials,
      trial_conversion_rate: completedTrials.length ? Number(((convertedTrials / completedTrials.length) * 100).toFixed(1)) : 0,
      past_due_subscriptions: states.filter(({ state }) => state.status === 'past_due').length,
      whatsapp_reminders_enabled: Boolean(getWhatsAppSubscriptionReminderConfig()),
      whatsapp_reminder_opt_ins: shops.filter((shop) => shop.whatsapp_subscription_reminders_enabled).length,
    };
  };

  router.get('/analytics', async (req, res) => {
    await refreshRuntimeDataFromDatabase();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const previousSince = new Date(Date.parse(since) - days * 86400000).toISOString();
    const [dailyTraffic, dailyOrders, currentTraffic, previousTraffic, currentOrders, previousOrders, sourceRows, trafficByShop, ordersByShop] = await Promise.all([
      dbAll<{ date: string; page_views: number; unique_visitors: number }>(`
        SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
          COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
        GROUP BY date ORDER BY date ASC
      `, [since]),
      dbAll<{ date: string; orders: number; sales: number }>(`
        SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
        GROUP BY date ORDER BY date ASC
      `, [since]),
      dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      `, [since]),
      dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ? AND created_at < ?
      `, [previousSince, since]),
      dbGet<{ orders: number; sales: number }>(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
      `, [since]),
      dbGet<{ orders: number; sales: number }>(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND created_at < ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
      `, [previousSince, since]),
      dbAll<{ source: string; visits: number; visitors: number }>(`
        SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
        GROUP BY source ORDER BY visits DESC
      `, [since]),
      dbAll<{ shop_id: number; page_views: number; unique_visitors: number }>(`
        SELECT shop_id, COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND shop_id IS NOT NULL AND created_at >= ?
        GROUP BY shop_id
      `, [since]),
      dbAll<{ shop_id: number; orders: number; sales: number }>(`
        SELECT shop_id, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
        GROUP BY shop_id
      `, [since]),
    ]);
    const trafficByShopId = new Map(trafficByShop.map((row) => [Number(row.shop_id), row]));
    const ordersByShopId = new Map(ordersByShop.map((row) => [Number(row.shop_id), row]));
    const byShop = shops.map((shop) => {
      const traffic = trafficByShopId.get(shop.id);
      const commerce = ordersByShopId.get(shop.id);
      const pageViews = Number(traffic?.page_views || 0);
      const uniqueVisitors = Number(traffic?.unique_visitors || 0);
      const shopOrders = Number(commerce?.orders || 0);
      return {
        shop_id: shop.id, shop_name: shop.name, slug: shop.slug, page_views: pageViews,
        unique_visitors: uniqueVisitors, orders: shopOrders, sales: Number(commerce?.sales || 0),
        conversion_rate: uniqueVisitors ? Number(((shopOrders / uniqueVisitors) * 100).toFixed(1)) : 0,
      };
    }).sort((left, right) => right.page_views - left.page_views);
    const dailyTrafficByDate = new Map(dailyTraffic.map((row) => [row.date, row]));
    const dailyOrdersByDate = new Map(dailyOrders.map((row) => [row.date, row]));
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.now() - (days - index - 1) * 86400000).toISOString().slice(0, 10);
      const traffic = dailyTrafficByDate.get(date);
      const commerce = dailyOrdersByDate.get(date);
      return {
        date,
        page_views: Number(traffic?.page_views || 0),
        unique_visitors: Number(traffic?.unique_visitors || 0),
        orders: Number(commerce?.orders || 0),
        sales: Number(commerce?.sales || 0),
      };
    });
    const totalViews = Number(currentTraffic?.page_views || 0);
    const totalVisitors = Number(currentTraffic?.unique_visitors || 0);
    const totalOrders = Number(currentOrders?.orders || 0);
    const totalSales = Number(currentOrders?.sales || 0);
    const previousTotalViews = Number(previousTraffic?.page_views || 0);
    const previousTotalVisitors = Number(previousTraffic?.unique_visitors || 0);
    const previousTotalOrders = Number(previousOrders?.orders || 0);
    const previousTotalSales = Number(previousOrders?.sales || 0);
    res.json({
      days, since, previous_since: previousSince, daily,
      order_daily: daily.map(({ date, orders: orderCount, sales }) => ({ date, orders: orderCount, sales })),
      sources: sourceRows.map((row) => ({
        source: row.source || 'unknown', visits: Number(row.visits || 0), visitors: Number(row.visitors || 0),
      })), by_shop: byShop,
      totals: {
        page_views: totalViews, unique_visitors: totalVisitors, orders: totalOrders,
        sales: totalSales,
        conversion_rate: totalVisitors ? Number(((totalOrders / totalVisitors) * 100).toFixed(1)) : 0,
      },
      previous: {
        page_views: previousTotalViews,
        unique_visitors: previousTotalVisitors,
        orders: previousTotalOrders,
        sales: previousTotalSales,
        conversion_rate: previousTotalVisitors ? Number(((previousTotalOrders / previousTotalVisitors) * 100).toFixed(1)) : 0,
      },
    });
  });

  router.get('/payments', async (req, res) => {
    await refreshRuntimeDataFromDatabase();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 365) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const periodWhere = "((status = 'paid' AND paid_at >= ?) OR (status <> 'paid' AND created_at >= ?))";
    const summary = await dbGet<{
      confirmed_count: number;
      collected_amount: number;
      pending_count: number;
      pending_amount: number;
      failed_count: number;
      refunded_count: number;
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
        COUNT(CASE WHEN status IN ('failed', 'cancelled', 'error') THEN 1 END) AS failed_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_count,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN 1 END) AS subscription_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN amount ELSE 0 END), 0) AS subscription_amount,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN 1 END) AS promotion_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN amount ELSE 0 END), 0) AS promotion_amount
      FROM subscription_payment_intents
      WHERE ${periodWhere}
    `, [since, since]);
    const payments = await dbAll<{
      id: string;
      shop_id: number;
      shop_name: string;
      payment_type: 'subscription' | 'promotion';
      tier: string;
      subscription_term: 'monthly' | 'annual';
      amount: number;
      currency: string;
      status: string;
      provider_reference: string | null;
      created_at: string;
      paid_at: string | null;
    }>(`
      SELECT intent.id, intent.shop_id, shops.name AS shop_name, intent.payment_type, intent.tier, intent.subscription_term, intent.amount,
        intent.currency, intent.status, intent.provider_reference, intent.created_at, intent.paid_at
      FROM subscription_payment_intents AS intent
      JOIN shops ON shops.id = intent.shop_id
      WHERE (intent.status = 'paid' AND intent.paid_at >= ?)
        OR (intent.status <> 'paid' AND intent.created_at >= ?)
      ORDER BY COALESCE(intent.paid_at, intent.created_at) DESC
      LIMIT 200
    `, [since, since]);
    const byTier = await dbAll<{ tier: string; count: number; amount: number }>(`
      SELECT tier, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
      FROM subscription_payment_intents
      WHERE status = 'paid' AND payment_type = 'subscription' AND paid_at >= ?
      GROUP BY tier ORDER BY amount DESC
    `, [since]);
    const subscriptionMetrics = await getSubscriptionMetrics();
    res.json({
      days,
      since,
      summary: {
        confirmed_count: Number(summary?.confirmed_count || 0),
        collected_amount: Number(summary?.collected_amount || 0),
        pending_count: Number(summary?.pending_count || 0),
        pending_amount: Number(summary?.pending_amount || 0),
        failed_count: Number(summary?.failed_count || 0),
        refunded_count: Number(summary?.refunded_count || 0),
        subscriptions: {
          count: Number(summary?.subscription_count || 0),
          amount: Number(summary?.subscription_amount || 0),
        },
        promotions: {
          count: Number(summary?.promotion_count || 0),
          amount: Number(summary?.promotion_amount || 0),
        },
        ...subscriptionMetrics,
      },
      by_tier: byTier.map((item) => ({ ...item, count: Number(item.count), amount: Number(item.amount) })),
      payments,
    });
  });

  router.get('/subscriptions', async (_req, res) => {
    await refreshRuntimeDataFromDatabase();
    const now = new Date();
    const subscriptionShops = shops.map((shop) => {
      const subscription = getSubscriptionState(shop, now);
      const shopOrders = orders.filter((order) => order.shop_id === shop.id && !['cancelled', 'expired'].includes(order.status));
      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        owner_email: shop.owner_email ?? null,
        whatsapp_reminders_opt_in: Boolean(shop.whatsapp_subscription_reminders_enabled),
        plan: subscription.plan,
        status: subscription.status,
        is_active: shop.is_active,
        publication_status: shop.publication_status,
        merchant_verification_status: shop.merchant_verification_status,
        trial_start: subscription.trialStart,
        trial_end: subscription.trialEnd,
        trial_days_remaining: subscription.status === 'trialing' ? subscription.trialDaysRemaining : null,
        subscription_expires_at: subscription.expiresAt,
        next_renewal_at: subscription.status === 'trialing' ? subscription.trialEnd : subscription.expiresAt,
        created_at: shop.created_at,
        products_count: products.filter((product) => product.shop_id === shop.id).length,
        orders_count: shopOrders.length,
        last_order_at: shopOrders.sort((left, right) => right.created_at.localeCompare(left.created_at))[0]?.created_at ?? null,
      };
    }).sort((left, right) => {
      const leftExpiry = left.next_renewal_at ? Date.parse(left.next_renewal_at) : Number.MAX_SAFE_INTEGER;
      const rightExpiry = right.next_renewal_at ? Date.parse(right.next_renewal_at) : Number.MAX_SAFE_INTEGER;
      return leftExpiry - rightExpiry || left.name.localeCompare(right.name);
    });
    const auditLogs = await dbAll<{
      id: number;
      action: string;
      shop_id: number | null;
      shop_name: string | null;
      details: string;
      created_at: string;
    }>(`
      SELECT logs.id, logs.action, logs.shop_id, shops.name AS shop_name, logs.details, logs.created_at
      FROM admin_audit_logs AS logs
      LEFT JOIN shops ON shops.id = logs.shop_id
      ORDER BY logs.created_at DESC LIMIT 20
    `);
    res.json({ summary: await getSubscriptionMetrics(), shops: subscriptionShops, audit_logs: auditLogs });
  });

  router.patch('/subscriptions/:id/extend-trial', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const days = Number(req.body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return res.status(400).json({ error: 'La prolongation doit être comprise entre 1 et 30 jours.' });
    }
    const isTrial = shop.subscription_status === 'trialing'
      || shop.subscription_status === 'expired' && Boolean(shop.trial_end) && !shop.subscription_expires_at;
    if (!isTrial || !shop.trial_start || !shop.trial_end) {
      return res.status(409).json({ error: 'Seul un essai en cours ou expiré peut être prolongé.' });
    }
    const oldTrialEnd = Date.parse(shop.trial_end);
    if (!Number.isFinite(oldTrialEnd)) return res.status(409).json({ error: 'La date de fin d’essai est invalide.' });
    const now = Date.now();
    const nextTrialEnd = new Date(Math.max(oldTrialEnd, now) + days * 86400000).toISOString();
    const previousTrialEnd = shop.trial_end;
    shop.trial_end = nextTrialEnd;
      shop.last_notification_sent_at = null;
    shop.subscription_status = 'trialing';
    await persistShop(shop);
    await logAdminAction('trial_extended', shop.id, { days, previous_trial_end: previousTrialEnd, trial_end: nextTrialEnd });
    res.json({ success: true, shop: toSafeShop(shop), trial_end: nextTrialEnd });
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
    await logAdminAction(shop.is_active ? 'shop_reactivated' : 'shop_suspended', shop.id, { is_active: shop.is_active });
    res.json({ success: true, is_active: shop.is_active, shop: toSafeShop(shop) });
  });

  router.post('/shops/:id/access-link', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id);
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({ success: true, shop: toSafeShop(shop), public_url: `${origin}/${shop.slug}`, access_url: `${origin}/app?access=${encodeURIComponent(ownerAccessToken)}` });
  });

  router.post('/shops/:id/notification', async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const templates: Record<string, string> = {
      welcome: `Bonjour ${shop.name}, votre espace MaTable.ci est prêt. Pensez à compléter votre catalogue et à partager votre vitrine avec vos clients.`,
      catalog: `Bonjour ${shop.name}, pensez à vérifier vos articles, vos prix et vos disponibilités afin que votre vitrine MaTable.ci reste à jour.`,
      orders: `Bonjour ${shop.name}, pensez à consulter vos nouvelles commandes et à confirmer rapidement les demandes reçues via MaTable.ci.`,
      support: `Bonjour ${shop.name}, nous vous contactons au sujet de votre boutique MaTable.ci. Répondez à ce message si vous avez besoin d’aide.`,
      trial_expiring: `Bonjour ${shop.name}, votre essai MaTable.ci arrive à échéance. Connectez-vous à votre espace commerçant pour choisir une formule et garder votre vitrine visible. L’équipe MaTable.ci reste disponible si besoin.`,
    };
    const template = String(req.body?.template || '').trim();
    if (!templates[template]) return res.status(400).json({ error: 'Modèle de notification invalide.' });
    if (template === 'trial_expiring' && !shop.whatsapp_subscription_reminders_enabled) {
      return res.status(409).json({ error: 'Le commerçant n’a pas autorisé les rappels WhatsApp.' });
    }
    const message = templates[template];
    const phone = shop.whatsapp_number.replace(/\D/g, '');
    if (template === 'trial_expiring') {
      await logAdminAction('trial_reminder_prepared', shop.id, { delivery_mode: 'whatsapp_click_to_chat' });
    }
    res.json({ success: true, delivery_mode: 'whatsapp_click_to_chat', template, message, whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
  });

  return router;
}
