import { Router } from 'express';
import type { dbTransaction } from '../../db.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';
import { getSubscriptionPlanConfig, getSubscriptionState } from '../services/businessRules.ts';
import { getWhatsAppSubscriptionReminderConfig } from '../services/whatsappNotifications.ts';
import { mapShopRow } from '../repositories/shops.ts';

interface AdminRouterOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  databaseMode: 'sqlite' | 'postgresql';
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
  dbTransaction: typeof dbTransaction;
  refreshRuntimeDataFromDatabase: () => Promise<void>;
  persistShop: (shop: ShopRecord) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
  rotateMerchantAccessTokenForShop: (shopId: number) => Promise<string>;
}

export function createAdminRouter(options: AdminRouterOptions) {
  const { databaseMode, dbAll, dbGet, dbRun, dbTransaction, refreshRuntimeDataFromDatabase, toSafeShop, rotateMerchantAccessTokenForShop } = options;
  const router = Router();
  const maxTrialExtensionDays = 30;
  const loadShops = async () => (await dbAll<Record<string, unknown>>('SELECT * FROM shops ORDER BY id')).map(mapShopRow);
  const getShop = async (shopId: number) => {
    const row = await dbGet<Record<string, unknown>>('SELECT * FROM shops WHERE id = ?', [shopId]);
    return row ? mapShopRow(row) : undefined;
  };
  const getTrialExtensionDays = (value: unknown) => {
    const details: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!details || typeof details !== 'object' || !('days' in details)
      || typeof details.days !== 'number' || !Number.isInteger(details.days) || details.days < 1) {
      throw new Error('Une entrée de prolongation d’essai est invalide dans le journal admin.');
    }
    return details.days;
  };
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
    const reviewedAt = new Date().toISOString();
    await dbTransaction(async ({ run }) => {
      await run('UPDATE customer_reviews SET status = ?, reviewed_at = ? WHERE id = ?', [status, reviewedAt, reviewId]);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'customer_review_moderated', Number(review.shop_id), JSON.stringify({ review_id: reviewId, status }), reviewedAt],
      );
    });
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
    const shopId = report.target_type === 'shop'
      ? Number(report.target_id)
      : Number((await dbGet<{ shop_id: number }>('SELECT shop_id FROM products WHERE id = ?', [report.target_id]))?.shop_id) || null;
    const reviewedAt = new Date().toISOString();
    await dbTransaction(async ({ run }) => {
      await run('UPDATE customer_reports SET status = ?, reviewed_at = ? WHERE id = ?', [status, reviewedAt, reportId]);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'customer_report_processed', shopId, JSON.stringify({ report_id: reportId, status }), reviewedAt],
      );
    });
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
    await dbTransaction(async ({ run }) => {
      await run(`INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at, updated_by)
        VALUES (1, ?, ?, ?, 'super_admin')
        ON CONFLICT (id) DO UPDATE SET maintenance_enabled = excluded.maintenance_enabled,
          maintenance_message = excluded.maintenance_message, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [req.body.enabled ? 1 : 0, message, updatedAt]);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'maintenance_updated', null, JSON.stringify({
          enabled: req.body.enabled,
          previous_enabled: Boolean(previous?.maintenance_enabled),
          message,
        }), updatedAt],
      );
    });
    res.json({ enabled: req.body.enabled, message, updated_at: updatedAt, updated_by: 'super_admin' });
  });

  const getSubscriptionMetrics = async () => {
    const now = new Date();
    const shops = await loadShops();
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
    const shops = await loadShops();
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
    const shops = await loadShops();
    const now = new Date();
    const extensionLogs = await dbAll<{ shop_id: number; details: string; created_at: string }>(
      `SELECT shop_id, details, created_at FROM admin_audit_logs
       WHERE action = 'trial_extended' AND shop_id IS NOT NULL ORDER BY created_at`,
    );
    const extensionDaysByShopId = new Map<number, number>();
    for (const entry of extensionLogs) {
      const shop = shops.find((candidate) => candidate.id === Number(entry.shop_id));
      if (!shop?.trial_start || Date.parse(entry.created_at) < Date.parse(shop.trial_start)) continue;
      extensionDaysByShopId.set(
        shop.id,
        (extensionDaysByShopId.get(shop.id) || 0) + getTrialExtensionDays(entry.details),
      );
    }
    const [productCounts, orderStats] = await Promise.all([
      dbAll<{ shop_id: number; count: number }>('SELECT shop_id, COUNT(*) AS count FROM products GROUP BY shop_id'),
      dbAll<{ shop_id: number; count: number; last_order_at: string | null }>(`
        SELECT shop_id, COUNT(*) AS count, MAX(created_at) AS last_order_at
        FROM orders WHERE COALESCE(status, 'pending') NOT IN ('cancelled', 'expired') GROUP BY shop_id
      `),
    ]);
    const productCountByShop = new Map(productCounts.map((row) => [Number(row.shop_id), Number(row.count)]));
    const orderStatsByShop = new Map(orderStats.map((row) => [Number(row.shop_id), row]));
    const subscriptionShops = shops.map((shop) => {
      const subscription = getSubscriptionState(shop, now);
      const trialExpiryMismatch = shop.subscription_status === 'trialing'
        && subscription.trialEnd !== null
        && subscription.expiresAt !== null
        && Date.parse(subscription.trialEnd) !== Date.parse(subscription.expiresAt);
      const shopOrderStats = orderStatsByShop.get(shop.id);
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
        trial_extension_days_used: extensionDaysByShopId.get(shop.id) || 0,
        trial_extension_days_remaining: Math.max(0, maxTrialExtensionDays - (extensionDaysByShopId.get(shop.id) || 0)),
        subscription_expires_at: subscription.expiresAt,
        trial_expiry_mismatch: trialExpiryMismatch,
        next_renewal_at: subscription.status === 'trialing' ? subscription.trialEnd : subscription.expiresAt,
        created_at: shop.created_at,
        products_count: productCountByShop.get(shop.id) || 0,
        orders_count: Number(shopOrderStats?.count || 0),
        last_order_at: shopOrderStats?.last_order_at ?? null,
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
    const shop = await getShop(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const days = Number(req.body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return res.status(400).json({ error: 'La prolongation doit être comprise entre 1 et 30 jours.' });
    }
    const isTrial = shop.subscription_status === 'trialing'
      || shop.subscription_status === 'expired' && Boolean(shop.trial_end) && !shop.subscription_expires_at;
    const trialStart = shop.trial_start;
    if (!isTrial || !trialStart || !shop.trial_end) {
      return res.status(409).json({ error: 'Seul un essai en cours ou expiré peut être prolongé.' });
    }
    if (req.body?.expected_trial_end && req.body.expected_trial_end !== shop.trial_end) {
      return res.status(409).json({ error: 'L’échéance a changé. Actualisez la liste avant de réessayer.' });
    }
    const oldTrialEnd = Date.parse(shop.trial_end);
    if (!Number.isFinite(oldTrialEnd)) return res.status(409).json({ error: 'La date de fin d’essai est invalide.' });
    const now = Date.now();
    const nextTrialEnd = new Date(Math.max(oldTrialEnd, now) + days * 86400000).toISOString();
    const previousTrialEnd = shop.trial_end;
    const previousExpiry = shop.subscription_expires_at ?? null;
    const actionAt = new Date().toISOString();
    const result = await dbTransaction(async ({ all, run }) => {
      const priorExtensions = await all<{ details: string }>(
        `SELECT details FROM admin_audit_logs
         WHERE shop_id = ? AND action = 'trial_extended' AND created_at >= ?`,
        [shop.id, trialStart],
      );
      const daysUsed = priorExtensions.reduce((total, entry) => total + getTrialExtensionDays(entry.details), 0);
      const daysRemaining = Math.max(0, maxTrialExtensionDays - daysUsed);
      if (days > daysRemaining) return { status: 'limit' as const, daysRemaining };

      const update = await run(
        `UPDATE shops
         SET trial_end = ?, subscription_expires_at = ?, last_notification_sent_at = NULL, subscription_status = 'trialing'
         WHERE id = ? AND trial_end = ? AND subscription_status = ?`,
        [nextTrialEnd, nextTrialEnd, shop.id, previousTrialEnd, shop.subscription_status],
      );
      if (update.changes !== 1) return { status: 'conflict' as const };
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'trial_extended', shop.id, JSON.stringify({
          days,
          previous_trial_end: previousTrialEnd,
          previous_subscription_expires_at: previousExpiry,
          trial_end: nextTrialEnd,
          subscription_expires_at: nextTrialEnd,
        }), actionAt],
      );
      return { status: 'success' as const, daysUsed: daysUsed + days };
    });
    if (result.status === 'limit') {
      return res.status(409).json({
        error: result.daysRemaining
          ? `Il ne reste que ${result.daysRemaining} jour(s) de prolongation autorisés pour cet essai.`
          : 'Le plafond de 30 jours de prolongation pour cet essai est atteint.',
        days_remaining: result.daysRemaining,
      });
    }
    if (result.status === 'conflict') return res.status(409).json({ error: 'L’essai a été modifié entre-temps. Actualisez la liste avant de réessayer.' });
    await refreshRuntimeDataFromDatabase();
    const updatedShop = await getShop(shop.id);
    res.json({ success: true, shop: toSafeShop(updatedShop || { ...shop, trial_end: nextTrialEnd, subscription_expires_at: nextTrialEnd, last_notification_sent_at: null, subscription_status: 'trialing' }), trial_end: nextTrialEnd, trial_extension_days_used: result.daysUsed });
  });

  router.patch('/subscriptions/:id/reconcile-trial-expiry', async (req, res) => {
    const shop = await getShop(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.subscription_status !== 'trialing' || !shop.trial_end) {
      return res.status(409).json({ error: 'Seul un essai actif avec une échéance définie peut être synchronisé.' });
    }
    const trialEnd = Date.parse(shop.trial_end);
    if (!Number.isFinite(trialEnd)) return res.status(409).json({ error: 'La date de fin d’essai est invalide.' });
    if (shop.subscription_expires_at && Date.parse(shop.subscription_expires_at) === trialEnd) {
      return res.status(409).json({ error: 'Les échéances sont déjà synchronisées.' });
    }
    const previousExpiry = shop.subscription_expires_at ?? null;
    const actionAt = new Date().toISOString();
    const result = await dbTransaction(async ({ run }) => {
      const update = await run(
        `UPDATE shops
         SET subscription_expires_at = ?
         WHERE id = ? AND subscription_status = 'trialing' AND trial_end = ?
           AND COALESCE(subscription_expires_at, '') <> ?`,
        [shop.trial_end, shop.id, shop.trial_end, shop.trial_end],
      );
      if (update.changes !== 1) return false;
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'trial_expiry_reconciled', shop.id, JSON.stringify({
          previous_subscription_expires_at: previousExpiry,
          trial_end: shop.trial_end,
          subscription_expires_at: shop.trial_end,
        }), actionAt],
      );
      return true;
    });
    if (!result) return res.status(409).json({ error: 'L’échéance a été modifiée entre-temps. Actualisez la liste avant de réessayer.' });
    await refreshRuntimeDataFromDatabase();
    res.json({ success: true, subscription_expires_at: shop.trial_end });
  });

  router.get('/shops', async (_req, res) => {
    await refreshRuntimeDataFromDatabase();
    const [shops, productCounts, orderStats] = await Promise.all([
      loadShops(),
      dbAll<{ shop_id: number; count: number }>('SELECT shop_id, COUNT(*) AS count FROM products GROUP BY shop_id'),
      dbAll<{ shop_id: number; count: number; total_sales: number; last_order_at: string | null }>(`
        SELECT shop_id, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total_sales, MAX(created_at) AS last_order_at
        FROM orders WHERE COALESCE(status, 'pending') NOT IN ('cancelled', 'expired') GROUP BY shop_id
      `),
    ]);
    const productCountByShop = new Map(productCounts.map((row) => [Number(row.shop_id), Number(row.count)]));
    const orderStatsByShop = new Map(orderStats.map((row) => [Number(row.shop_id), row]));
    res.json(shops.map((shop) => {
      const stats = orderStatsByShop.get(shop.id);
      const actionableOrderCount = Number(stats?.count || 0);
      const totalSales = Number(stats?.total_sales || 0);
      return {
        ...toSafeShop(shop),
        products_count: productCountByShop.get(shop.id) || 0,
        orders_count: actionableOrderCount,
        total_sales: totalSales,
        average_order_value: actionableOrderCount ? Math.round(totalSales / actionableOrderCount) : 0,
        last_order_at: stats?.last_order_at ?? null,
      };
    }));
  });

  router.patch('/shops/:id/featured', async (req, res) => {
    const days = req.body?.days;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > 90) {
      return res.status(400).json({ error: 'La durée doit être un nombre entier de 0 à 90 jours.' });
    }
    const shopId = Number(req.params.id);
    const featuredUntil = days === 0 ? null : new Date(Date.now() + days * 86400000).toISOString();
    const updated = await dbTransaction(async ({ run }) => run('UPDATE shops SET featured_until = ? WHERE id = ?', [featuredUntil, shopId]));
    if (updated.changes !== 1) return res.status(404).json({ error: 'Boutique introuvable.' });
    await refreshRuntimeDataFromDatabase();
    res.json({ success: true, featured_until: featuredUntil });
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
    const filteredOrders = requestedStatus !== 'all' && !allowedStatuses.has(requestedStatus)
      ? []
      : await dbAll<Record<string, unknown>>(`
        SELECT orders.id, orders.shop_id, shops.name AS shop_name, orders.customer_name, orders.customer_phone,
          orders.delivery_location, orders.total_amount, orders.status, orders.created_at, orders.items
        FROM orders LEFT JOIN shops ON shops.id = orders.shop_id
        ${requestedStatus === 'all' ? '' : "WHERE COALESCE(orders.status, 'pending') = ?"}
        ORDER BY orders.created_at DESC, orders.id DESC LIMIT ?
      `, requestedStatus === 'all' ? [limit] : [requestedStatus, limit]).then((rows) => rows.map((order) => {
        const items: OrderRecord['items'] = order.items
          ? (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) as OrderRecord['items']
          : [];
        return {
          id: Number(order.id), shop_id: Number(order.shop_id),
          shop_name: order.shop_name == null ? 'Boutique inconnue' : String(order.shop_name),
          customer_name: String(order.customer_name), customer_phone: String(order.customer_phone),
          delivery_location: String(order.delivery_location), total_amount: Number(order.total_amount),
          status: String(order.status || 'pending'), created_at: String(order.created_at),
          items_count: (items || []).reduce((sum, item) => sum + item.quantity, 0),
        };
      }));
    res.json({ orders: filteredOrders, total: filteredOrders.length, status: requestedStatus });
  });

  router.patch('/shops/:id/toggle-active', async (req, res) => {
    const shopId = Number(req.params.id);
    const result = await dbTransaction(async ({ get, run }) => {
      const row = await get<Record<string, unknown>>('SELECT * FROM shops WHERE id = ?', [shopId]);
      if (!row) return undefined;
      const shop = mapShopRow(row);
      const isActive = !shop.is_active;
      const publicationStatus = isActive
        ? (shop.publication_status === 'suspended' ? 'draft' : shop.publication_status)
        : (shop.publication_status || 'active');
      const update = await run('UPDATE shops SET is_active = ?, publication_status = ? WHERE id = ?', [isActive ? 1 : 0, publicationStatus, shopId]);
      if (update.changes !== 1) return undefined;
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', isActive ? 'shop_reactivated' : 'shop_suspended', shopId, JSON.stringify({ is_active: isActive }), new Date().toISOString()],
      );
      return isActive;
    });
    if (result === undefined) return res.status(404).json({ error: 'Boutique introuvable.' });
    await refreshRuntimeDataFromDatabase();
    const updatedShop = await getShop(shopId);
    res.json({ success: true, is_active: result, shop: toSafeShop(updatedShop!) });
  });

  router.post('/shops/:id/access-link', async (req, res) => {
    const shop = await getShop(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id);
    await refreshRuntimeDataFromDatabase();
    const updatedShop = await getShop(shop.id) || shop;
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({ success: true, shop: toSafeShop(updatedShop), public_url: `${origin}/${updatedShop.slug}`, access_url: `${origin}/app?access=${encodeURIComponent(ownerAccessToken)}` });
  });

  router.post('/shops/:id/notification', async (req, res) => {
    const shop = await getShop(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const template = String(req.body?.template || '').trim();
    const templates: Record<string, string> = {
      welcome: `Bonjour ${shop.name}, votre espace MaTable.ci est prêt. Pensez à compléter votre catalogue et à partager votre vitrine avec vos clients.`,
      catalog: `Bonjour ${shop.name}, pensez à vérifier vos articles, vos prix et vos disponibilités afin que votre vitrine MaTable.ci reste à jour.`,
      orders: `Bonjour ${shop.name}, pensez à consulter vos nouvelles commandes et à confirmer rapidement les demandes reçues via MaTable.ci.`,
      support: `Bonjour ${shop.name}, nous vous contactons au sujet de votre boutique MaTable.ci. Répondez à ce message si vous avez besoin d’aide.`,
      trial_expiring: `Bonjour ${shop.name}, votre essai MaTable.ci arrive à échéance. Connectez-vous à votre espace commerçant pour choisir une formule et garder votre vitrine visible. L’équipe MaTable.ci reste disponible si besoin.`,
    };
    if (template === 'identity_verification') {
      const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const messageTemplate = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (req.body?.message !== undefined && (!messageTemplate || messageTemplate.length > 2000)) {
        return res.status(400).json({ error: 'Le message doit contenir entre 1 et 2 000 caractères.' });
      }
      templates.identity_verification = messageTemplate || `Bonjour {boutique}, votre boutique MaTable.ci est actuellement en veille et n’apparaît pas sur le site, car votre identité n’a pas encore été vérifiée. Pour la faire réapparaître, connectez-vous à votre tableau de bord marchand : {dashboard}, puis ouvrez « Vérification d’identité » et suivez les étapes de Didit. Après la vérification, la remise en ligne pourra être finalisée si les autres critères de publication sont remplis. Répondez à ce message si vous avez besoin d’aide.`;
      if (shop.merchant_verification_status === 'verified'
        || shop.merchant_verification_status === 'not_required'
        || shop.publication_status === 'active') {
        return res.status(409).json({ error: 'Cette boutique ne fait plus partie des boutiques en attente de vérification.' });
      }
    }
    if (!templates[template]) return res.status(400).json({ error: 'Modèle de notification invalide.' });
    if (template === 'trial_expiring' && !shop.whatsapp_subscription_reminders_enabled) {
      return res.status(409).json({ error: 'Le commerçant n’a pas autorisé les rappels WhatsApp.' });
    }
    const phone = String(shop.whatsapp_number || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(phone)) return res.status(409).json({ error: 'Le numéro WhatsApp de cette boutique est absent ou invalide.' });
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const message = template === 'identity_verification'
      ? templates[template].replace(/\{boutique\}/g, shop.name).replace(/\{dashboard\}/g, `${origin}/app`)
      : templates[template];
    if (template === 'trial_expiring') {
      await logAdminAction('trial_reminder_prepared', shop.id, { delivery_mode: 'whatsapp_click_to_chat' });
    }
    if (template === 'identity_verification') {
      await logAdminAction('identity_verification_request_prepared', shop.id, { delivery_mode: 'whatsapp_click_to_chat' });
    }
    res.json({ success: true, delivery_mode: 'whatsapp_click_to_chat', template, message, whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
  });

  return router;
}
