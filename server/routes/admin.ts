import { Router, type RequestHandler } from 'express';
import type { dbTransaction } from '../../db.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';
import { getSubscriptionState, isSubscriptionManualOverrideActive, normalizeSubscriptionTier } from '../services/businessRules.ts';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionAccessCutoff,
  parseSubscriptionProFeatures,
  type SubscriptionProFeatures,
} from '../../src/utils/subscriptionFeatures.ts';
import { parseSubscriptionPrices, getDefaultSubscriptionPrices } from '../services/subscriptionPricing.ts';
import { getWhatsAppSubscriptionReminderConfig } from '../services/whatsappNotifications.ts';
import { mapShopRow } from '../repositories/shops.ts';
import {
  getPushSubscriptionCount,
  getVapidConfiguration,
  normalizePushText,
  normalizePushUrl,
  sendPlatformAnnouncementPush,
} from '../services/pushNotifications.ts';

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
  requireAdminAccess?: RequestHandler;
  requireSuperAdminAccess?: RequestHandler;
  requireVerificationAdminAccess?: RequestHandler;
  clearMerchantSessionsForShop: (shopId: number) => void;
}

export function createAdminRouter(options: AdminRouterOptions) {
  const {
    databaseMode,
    dbAll,
    dbGet,
    dbRun,
    dbTransaction,
    refreshRuntimeDataFromDatabase,
    toSafeShop,
    rotateMerchantAccessTokenForShop,
    requireAdminAccess,
    requireSuperAdminAccess,
    requireVerificationAdminAccess,
    clearMerchantSessionsForShop,
  } = options;
  const router = Router();
  const maxTrialExtensionDays = 30;
  const rejectUnconfiguredAccess: RequestHandler = (_req, res) => {
    res.status(503).json({ error: 'Protection administrative non configurée.' });
  };
  const requireAdmin = requireAdminAccess ?? rejectUnconfiguredAccess;
  const requireSuperAdmin = requireSuperAdminAccess ?? rejectUnconfiguredAccess;
  const requireVerification = requireVerificationAdminAccess ?? rejectUnconfiguredAccess;
  const isVerificationAdmin = (req: { adminRole?: string }) => req.adminRole === 'verification_admin';
  router.use((req, res, next) => {
    const path = String(req.path || '');
    if (path.startsWith('/identity-verifications')) return next();
    if (path.startsWith('/content-moderation')) {
      return requireVerification(req, res, next);
    }
    if (isVerificationAdmin(req)) {
      const allowedModeration = (req.method === 'GET' && path === '/content-moderation')
        || (req.method === 'PATCH' && /^\/content-moderation\/(reviews|reports)\/\d+$/.test(path));
      const allowedReadOnlyShopList = req.method === 'GET' && path === '/shops/verification-readonly';
      const allowedIdentityReminder = req.method === 'POST'
        && /^\/shops\/\d+\/notification$/.test(path)
        && req.body?.template === 'identity_verification';
      if (!allowedModeration && !allowedReadOnlyShopList && !allowedIdentityReminder) {
        return res.status(403).json({ error: 'Cette opération est réservée au super-admin ou à un rôle autorisé.' });
      }
    }
    if (path === '/payments' || path.startsWith('/subscriptions')
      || path === '/subscription-plans'
      || path === '/subscription-plan-features'
      || (req.method === 'DELETE' && /^\/shops\/\d+$/.test(path))
      || (req.method === 'POST' && /^\/shops\/\d+\/access-link$/.test(path))
      || (req.method === 'PATCH' && path === '/maintenance')
      || (req.method === 'POST' && path === '/push/announcements')
      || (req.method === 'GET' && path === '/push/status')) {
      return requireSuperAdmin(req, res, next);
    }
    if (req.method === 'POST'
      && /^\/shops\/\d+\/notification$/.test(path)
      && ['identity_verification', 'welcome', 'catalog', 'orders', 'support'].includes(String(req.body?.template || ''))) {
      return requireAdmin(req, res, next);
    }
    if (req.method === 'POST'
      && /^\/shops\/\d+\/notification$/.test(path)
      && req.body?.template === 'trial_expiring') {
      return requireSuperAdmin(req, res, next);
    }
    return requireAdmin(req, res, next);
  });
  const loadShops = async () => (await dbAll<Record<string, unknown>>('SELECT * FROM shops ORDER BY id')).map(mapShopRow);
  const getShop = async (shopId: number) => {
    const row = await dbGet<Record<string, unknown>>('SELECT * FROM shops WHERE id = ?', [shopId]);
    return row ? mapShopRow(row) : undefined;
  };
  const getCurrentSubscriptionPrices = async () => {
    const settings = await dbGet<{ subscription_plan_prices: string }>(
      'SELECT subscription_plan_prices FROM platform_settings WHERE id = 1',
    );
    return settings?.subscription_plan_prices
      ? parseSubscriptionPrices(settings.subscription_plan_prices)
      : getDefaultSubscriptionPrices();
  };

  router.get('/shops/verification-readonly', requireVerification, async (_req, res) => {
    const shops = await dbAll<{
      id: number;
      name: string;
      slug: string;
      category: string | null;
      city: string | null;
      publication_status: string;
      merchant_verification_status: string;
      created_at: string;
    }>(`
      SELECT id, name, slug, category, city, publication_status, merchant_verification_status, created_at
      FROM shops ORDER BY created_at DESC, id DESC
    `);
    res.setHeader('Cache-Control', 'no-store');
    return res.json(shops);
  });

  router.get('/product-sales', requireSuperAdmin, async (req, res) => {
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : 'all';
    const allowedStatuses = ['all', 'active', 'scheduled', 'expired', 'invalid'];
    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({ error: 'Filtre de promotion invalide.' });
    }
    const requestedPage = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > 10000) {
      return res.status(400).json({ error: 'Page de promotions invalide.' });
    }
    const pageSize = 50;
    const now = new Date().toISOString();
    const promotionsQuery = `
      SELECT p.id AS product_id, p.shop_id, p.title AS product_title, p.price, p.sale_price,
        p.sale_starts_at, p.sale_ends_at, p.stock, p.is_available, p.is_visible,
        s.name AS shop_name, s.slug AS shop_slug, s.city AS shop_city,
        s.is_active AS shop_active, s.publication_status, s.merchant_verification_status,
        CASE
          WHEN p.sale_price <= 0 OR p.sale_price >= p.price
            OR p.sale_starts_at IS NULL OR p.sale_starts_at = ''
            OR p.sale_ends_at IS NULL OR p.sale_ends_at = ''
            OR p.sale_ends_at <= p.sale_starts_at THEN 'invalid'
          WHEN p.sale_starts_at > ? THEN 'scheduled'
          WHEN p.sale_ends_at <= ? THEN 'expired'
          ELSE 'active'
        END AS sale_status
      FROM products p
      JOIN shops s ON s.id = p.shop_id
      WHERE p.sale_price IS NOT NULL
    `;
    const filteredPromotionsQuery = requestedStatus === 'all'
      ? promotionsQuery
      : `SELECT * FROM (${promotionsQuery}) promotions WHERE sale_status = ?`;
    const filteredParams: unknown[] = requestedStatus === 'all'
      ? [now, now]
      : [now, now, requestedStatus];
    const [counts, promotions, total] = await Promise.all([
      dbAll<{ sale_status: string; count: number | string }>(
        `SELECT sale_status, COUNT(*) AS count FROM (${promotionsQuery}) promotions GROUP BY sale_status`,
        [now, now],
      ),
      dbAll<Record<string, unknown>>(
        `${filteredPromotionsQuery}
          ORDER BY CASE sale_status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'invalid' THEN 2 ELSE 3 END,
            sale_ends_at ASC, LOWER(shop_name) ASC, LOWER(product_title) ASC
          LIMIT ? OFFSET ?`,
        [...filteredParams, pageSize, (requestedPage - 1) * pageSize],
      ),
      dbGet<{ total: number | string }>(
        `SELECT COUNT(*) AS total FROM (${filteredPromotionsQuery}) promotions`,
        filteredParams,
      ),
    ]);
    const summary = { active: 0, scheduled: 0, expired: 0, invalid: 0 };
    for (const row of counts) {
      if (row.sale_status in summary) summary[row.sale_status as keyof typeof summary] = Number(row.count);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      promotions,
      summary,
      total: Number(total?.total || 0),
      page: requestedPage,
      page_size: pageSize,
      status: requestedStatus,
    });
  });

  const getTrialExtensionDays = (value: unknown) => {
    const details: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!details || typeof details !== 'object' || !('days' in details)
      || typeof details.days !== 'number' || !Number.isInteger(details.days) || details.days < 1) {
      throw new Error('Une entrée de prolongation d’essai est invalide dans le journal admin.');
    }
    return details.days;
  };
  const safeAuditDetailKeys = new Set([
    'announcement_id', 'attempted', 'days', 'delivery_mode', 'enabled', 'failed', 'previous_enabled',
    'previous_status', 'previous_subscription_expires_at', 'previous_trial_end', 'reason', 'recipients', 'review_id',
    'sent', 'shop_id', 'shop_name', 'shop_slug', 'status', 'subscription_expires_at', 'trial_end',
    'event_id', 'deleted_products', 'deleted_orders', 'deleted_reviews', 'deleted_reports', 'user_id', 'is_active',
    'revoked_sessions', 'previous_standard_price', 'previous_premium_price',
    'previous_pro_price', 'standard_price', 'premium_price', 'pro_price',
    'current_tier', 'previous_pending_tier', 'pending_tier', 'effective_at',
    'cancellation_at', 'previous_cancellation_at',
  ]);
  const getSafeAuditDetails = (value: unknown): Record<string, string | number | boolean | null> => {
    const details: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      throw new Error('Une entrée du journal admin contient des détails invalides.');
    }
    return Object.fromEntries(Object.entries(details).flatMap(([key, detail]) => {
      if (!safeAuditDetailKeys.has(key)) return [];
      if (detail === null || typeof detail === 'boolean' || typeof detail === 'number') return [[key, detail]];
      if (typeof detail === 'string') return [[key, detail.slice(0, 500)]];
      return [];
    }));
  };
  const logAdminAction = (action: string, shopId: number | null, details: Record<string, unknown>, actor = 'super_admin') => dbRun(
    'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
    [actor, action, shopId, JSON.stringify(details), new Date().toISOString()],
  );

  router.get('/audit-logs', requireSuperAdmin, async (req, res) => {
    const limitInput = Number(req.query.limit);
    const offsetInput = Number(req.query.offset);
    const limit = Number.isInteger(limitInput) ? Math.max(1, Math.min(100, limitInput)) : 50;
    const offset = Number.isInteger(offsetInput) ? Math.max(0, offsetInput) : 0;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const actor = req.query.actor === 'super_admin' || req.query.actor === 'verification_admin' || req.query.actor === 'didit_webhook'
      ? req.query.actor
      : '';
    const filters: string[] = [];
    const params: unknown[] = [];
    if (search) {
      filters.push("(LOWER(logs.action) LIKE ? OR LOWER(COALESCE(shops.name, '')) LIKE ?)");
      params.push(`%${search.toLocaleLowerCase('fr')}%`, `%${search.toLocaleLowerCase('fr')}%`);
    }
    if (actor) {
      filters.push('logs.actor = ?');
      params.push(actor);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      dbAll<{
        id: number;
        actor: string;
        action: string;
        shop_id: number | null;
        shop_name: string | null;
        details: string;
        created_at: string;
      }>(`
        SELECT logs.id, logs.actor, logs.action, logs.shop_id, shops.name AS shop_name,
          logs.details, logs.created_at
        FROM admin_audit_logs AS logs
        LEFT JOIN shops ON shops.id = logs.shop_id
        ${where}
        ORDER BY logs.created_at DESC, logs.id DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]),
      dbGet<{ total: number }>(`
        SELECT COUNT(*) AS total
        FROM admin_audit_logs AS logs
        LEFT JOIN shops ON shops.id = logs.shop_id
        ${where}
      `, params),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      audit_logs: rows.map((row) => ({
        ...row,
        details: getSafeAuditDetails(row.details),
      })),
      total: Number(count?.total || 0),
      limit,
      offset,
      search,
      actor: actor || null,
    });
  });

  router.get('/push/status', async (_req, res) => {
    const [announcements, subscriptionCount] = await Promise.all([
      dbAll<Record<string, unknown>>(
        'SELECT id, title, body, url, created_at, recipient_count, sent_count, failed_count FROM platform_announcements ORDER BY created_at DESC LIMIT 20',
      ),
      getPushSubscriptionCount(),
    ]);
    return res.json({
      configured: Boolean(getVapidConfiguration()),
      subscribed_devices: subscriptionCount,
      announcements,
    });
  });

  router.post('/push/announcements', requireSuperAdmin, async (req, res) => {
    if (!getVapidConfiguration()) {
      return res.status(503).json({ error: 'Configurez VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT avant de publier une annonce Push.' });
    }
    if (await getPushSubscriptionCount() === 0) {
      return res.status(409).json({ error: 'Aucun appareil marchand n’est abonné aux notifications Push.' });
    }
    const title = normalizePushText(req.body?.title, 100);
    const body = normalizePushText(req.body?.body, 240);
    const url = normalizePushUrl(req.body?.url || '/app');
    if (title.length < 3 || body.length < 3 || !url) {
      return res.status(400).json({ error: 'Titre (3–100 caractères), message (3–240 caractères) et lien interne valide requis.' });
    }
    const createdAt = new Date().toISOString();
    const inserted = await dbGet<{ id: number }>(
      `INSERT INTO platform_announcements (title, body, url, created_at)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [title, body, url, createdAt],
    );
    if (!inserted) throw new Error('Impossible d’enregistrer l’annonce de la plateforme.');
    const delivery = await sendPlatformAnnouncementPush({ id: Number(inserted.id), title, body, url });
    await dbRun(`UPDATE platform_announcements SET recipient_count = ?, sent_count = ?, failed_count = ? WHERE id = ?`,
      [delivery.recipientShops, delivery.sent, delivery.failed, inserted.id]);
    await logAdminAction('platform_push_announcement_sent', null, {
      announcement_id: inserted.id,
      recipients: delivery.recipientShops,
      attempted: delivery.attempted,
      sent: delivery.sent,
      failed: delivery.failed,
    });
    return res.status(201).json({ success: true, id: inserted.id, delivery });
  });

  router.get('/content-moderation', requireVerification, async (_req, res) => {
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

  router.patch('/content-moderation/reviews/:id', requireVerification, async (req, res) => {
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
        [req.adminRole || 'super_admin', 'customer_review_moderated', Number(review.shop_id), JSON.stringify({ review_id: reviewId, status }), reviewedAt],
      );
    });
    return res.json({ success: true, status });
  });

  router.patch('/content-moderation/reports/:id', requireVerification, async (req, res) => {
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
        [req.adminRole || 'super_admin', 'customer_report_processed', shopId, JSON.stringify({ report_id: reportId, status }), reviewedAt],
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

  router.get('/subscription-plans', async (_req, res) => {
    const settings = await dbGet<{ subscription_plan_prices: string }>(
      'SELECT subscription_plan_prices FROM platform_settings WHERE id = 1',
    );
    const prices = settings?.subscription_plan_prices
      ? parseSubscriptionPrices(settings.subscription_plan_prices)
      : getDefaultSubscriptionPrices();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ prices });
  });

  router.patch('/subscription-plans', async (req, res) => {
    let prices;
    let expectedPrices;
    try {
      prices = parseSubscriptionPrices(req.body?.prices);
      expectedPrices = parseSubscriptionPrices(req.body?.expected_prices);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Les tarifs fournis sont invalides.' });
    }
    const updatedAt = new Date().toISOString();
    const result = await dbTransaction(async ({ get, run }) => {
      const settings = await get<{ subscription_plan_prices: string }>(
        'SELECT subscription_plan_prices FROM platform_settings WHERE id = 1',
      );
      const previousPrices = settings?.subscription_plan_prices
        ? parseSubscriptionPrices(settings.subscription_plan_prices)
        : getDefaultSubscriptionPrices();
      if (Object.keys(expectedPrices).some((tier) =>
        previousPrices[tier as keyof typeof previousPrices] !== expectedPrices[tier as keyof typeof expectedPrices])) {
        return { conflict: true as const };
      }
      await run(`INSERT INTO platform_settings (id, subscription_plan_prices, updated_at, updated_by)
        VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET subscription_plan_prices = excluded.subscription_plan_prices,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [JSON.stringify(prices), updatedAt, req.adminRole || 'super_admin']);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', 'subscription_plan_prices_updated', null, JSON.stringify({
          previous_standard_price: previousPrices.standard,
          previous_premium_price: previousPrices.premium,
          previous_pro_price: previousPrices.pro,
          standard_price: prices.standard,
          premium_price: prices.premium,
          pro_price: prices.pro,
        }), updatedAt],
      );
      return { conflict: false as const, previousPrices };
    });
    if (result.conflict) {
      return res.status(409).json({ error: 'Les tarifs ont changé depuis leur chargement. Actualisez avant de réessayer.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, prices, previous_prices: result.previousPrices, updated_at: updatedAt });
  });

  router.get('/subscription-plan-features', async (_req, res) => {
    const settings = await dbGet<{ subscription_plan_features: string }>(
      'SELECT subscription_plan_features FROM platform_settings WHERE id = 1',
    );
    const proFeatures = settings?.subscription_plan_features
      ? parseSubscriptionProFeatures(settings.subscription_plan_features)
      : DEFAULT_SUBSCRIPTION_PRO_FEATURES;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ pro_features: proFeatures });
  });

  router.patch('/subscription-plan-features', async (req, res) => {
    let proFeatures: SubscriptionProFeatures;
    let expectedFeatures: SubscriptionProFeatures;
    try {
      proFeatures = parseSubscriptionProFeatures(req.body?.pro_features);
      expectedFeatures = parseSubscriptionProFeatures(req.body?.expected_pro_features);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Les avantages Pro fournis sont invalides.' });
    }
    const updatedAt = new Date().toISOString();
    const result = await dbTransaction(async ({ all, get, run }) => {
      const settings = await get<{ subscription_plan_features: string }>(
        'SELECT subscription_plan_features FROM platform_settings WHERE id = 1',
      );
      const previousFeatures = settings?.subscription_plan_features
        ? parseSubscriptionProFeatures(settings.subscription_plan_features)
        : DEFAULT_SUBSCRIPTION_PRO_FEATURES;
      if (Object.keys(expectedFeatures).some((key) =>
        previousFeatures[key as keyof SubscriptionProFeatures] !== expectedFeatures[key as keyof SubscriptionProFeatures])) {
        return { conflict: true as const };
      }
      const shops = await all<{
        id: number;
        subscription_expires_at: string | null;
        subscription_features_snapshot: string | null;
        subscription_features_effective_at: string | null;
      }>(`SELECT id, subscription_expires_at, subscription_features_snapshot,
          subscription_features_effective_at
        FROM shops
          WHERE selected_subscription_tier = 'pro' AND subscription_expires_at IS NOT NULL
            AND COALESCE(subscription_status, 'active') <> 'trialing'`);
      const now = Date.parse(updatedAt);
      for (const shop of shops) {
        const expiresAt = getSubscriptionAccessCutoff(shop.subscription_expires_at || '');
        if (expiresAt === null || expiresAt <= now) continue;
        const scheduledAt = shop.subscription_features_effective_at
          ? getSubscriptionAccessCutoff(shop.subscription_features_effective_at)
          : null;
        const preserveScheduledSnapshot = Boolean(shop.subscription_features_snapshot)
          && scheduledAt !== null
          && scheduledAt > now;
        const snapshot = preserveScheduledSnapshot && shop.subscription_features_snapshot
          ? parseSubscriptionProFeatures(shop.subscription_features_snapshot)
          : previousFeatures;
        const effectiveAt = preserveScheduledSnapshot
          ? shop.subscription_features_effective_at
          : shop.subscription_expires_at;
        await run(`UPDATE shops SET subscription_features_snapshot = ?,
          subscription_features_effective_at = ? WHERE id = ?`,
        [JSON.stringify(snapshot), effectiveAt, shop.id]);
      }
      await run(`INSERT INTO platform_settings (id, subscription_plan_features, updated_at, updated_by)
        VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET subscription_plan_features = excluded.subscription_plan_features,
          updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [JSON.stringify(proFeatures), updatedAt, req.adminRole || 'super_admin']);
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', 'subscription_plan_features_updated', null, JSON.stringify({
          previous_pro_features: previousFeatures,
          pro_features: proFeatures,
        }), updatedAt],
      );
      return { conflict: false as const, previousFeatures };
    });
    if (result.conflict) {
      return res.status(409).json({ error: 'Les avantages Pro ont changé depuis leur chargement. Actualisez avant de réessayer.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      success: true,
      pro_features: proFeatures,
      previous_pro_features: result.previousFeatures,
      updated_at: updatedAt,
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
    const states = shops.map((shop) => ({
      shop,
      state: getSubscriptionState(shop, now),
      billingState: getSubscriptionState({
        ...shop,
        subscription_admin_override_status: null,
        subscription_admin_override_tier: null,
        subscription_admin_override_until: null,
      }, now),
    }));
    const paidSubscriptionPayments = await dbAll<{
      shop_id: number;
      tier: string;
      subscription_term: string;
      amount: number;
    }>(`
      SELECT shop_id, tier, subscription_term, amount
      FROM subscription_payment_intents
      WHERE payment_type = 'subscription' AND status = 'paid' AND paid_at IS NOT NULL
      ORDER BY paid_at DESC, id DESC
    `);
    const latestPaymentByShop = new Map<number, typeof paidSubscriptionPayments[number]>();
    for (const payment of paidSubscriptionPayments) {
      if (!latestPaymentByShop.has(Number(payment.shop_id))) {
        latestPaymentByShop.set(Number(payment.shop_id), payment);
      }
    }
    let mrrEstimatedSubscriptions = 0;
    const currentSubscriptionPrices = await getCurrentSubscriptionPrices();
    const mrrByTier = (['standard', 'premium', 'pro'] as const).map((tier) => {
      const activeShops = states.filter(({ state, billingState }) =>
        state.status === 'active' && billingState.status === 'active' && billingState.plan === tier);
      const amount = activeShops.reduce((total, { shop }) => {
        const payment = latestPaymentByShop.get(shop.id);
        if (payment?.tier === tier && (payment.subscription_term === 'monthly' || payment.subscription_term === 'annual')) {
          return total + Number(payment.amount) / (payment.subscription_term === 'annual' ? 12 : 1);
        }
        mrrEstimatedSubscriptions += 1;
        return total + currentSubscriptionPrices[tier];
      }, 0);
      return { tier, count: activeShops.length, amount: Math.round(amount) };
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
      mrr_estimated_subscriptions: mrrEstimatedSubscriptions,
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
    const shops = await loadShops();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const previousSince = new Date(Date.parse(since) - days * 86400000).toISOString();
    const [dailyTraffic, dailyOrders, currentTraffic, previousTraffic, currentOrders, previousOrders, sourceRows, campaignRows, campaignOrderRows, campaignClickRows, trafficByShop, ordersByShop] = await Promise.all([
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
      dbAll<{ campaign: string; visits: number; visitors: number }>(`
        SELECT campaign, COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'page_view' AND created_at >= ? AND campaign IS NOT NULL
        GROUP BY campaign ORDER BY visits DESC, campaign ASC
        LIMIT 50
      `, [since]),
      dbAll<{ campaign: string; orders: number; sales: number }>(`
        SELECT attribution_campaign AS campaign, COUNT(*) AS orders,
          COALESCE(SUM(total_amount), 0) AS sales
        FROM orders
        WHERE attribution_campaign IS NOT NULL AND created_at >= ?
          AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
        GROUP BY attribution_campaign
      `, [since]),
      dbAll<{ campaign: string; whatsapp_clicks: number }>(`
        SELECT orders.attribution_campaign AS campaign, COUNT(*) AS whatsapp_clicks
        FROM orders
        JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
        WHERE orders.attribution_campaign IS NOT NULL AND order_whatsapp_tracking.clicked_at >= ?
        GROUP BY orders.attribution_campaign
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
    const campaignOrdersByName = new Map(campaignOrderRows.map((row) => [row.campaign, row]));
    const campaignClicksByName = new Map(campaignClickRows.map((row) => [row.campaign, row]));
    const campaignNames = new Set([
      ...campaignRows.map((row) => row.campaign),
      ...campaignOrderRows.map((row) => row.campaign),
      ...campaignClickRows.map((row) => row.campaign),
    ]);
    const campaignVisitorsByName = new Map(campaignRows.map((row) => [row.campaign, row]));
    const campaigns = [...campaignNames].sort().map((campaign) => {
      const campaignVisitors = campaignVisitorsByName.get(campaign);
      const campaignOrders = campaignOrdersByName.get(campaign);
      return {
        campaign,
        visits: Number(campaignVisitors?.visits || 0),
        visitors: Number(campaignVisitors?.visitors || 0),
        orders: Number(campaignOrders?.orders || 0),
        sales: Number(campaignOrders?.sales || 0),
        whatsapp_clicks: Number(campaignClicksByName.get(campaign)?.whatsapp_clicks || 0),
      };
    });
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
    const response = {
      days, since, previous_since: previousSince, daily,
      order_daily: daily.map(({ date, orders: orderCount, sales }) => ({ date, orders: orderCount, sales })),
      sources: sourceRows.map((row) => ({
        source: row.source || 'unknown', visits: Number(row.visits || 0), visitors: Number(row.visitors || 0),
      })),
      campaigns,
      by_shop: byShop,
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
    };
    if (isVerificationAdmin(req)) {
      response.daily.forEach((day) => { day.sales = 0; });
      response.order_daily.forEach((day) => { day.sales = 0; });
      response.campaigns.forEach((campaign) => { campaign.sales = 0; });
      response.by_shop.forEach((shop) => { shop.sales = 0; });
      response.totals.sales = 0;
      response.previous.sales = 0;
    }
    res.json(response);
  });

  router.get('/payments', async (req, res) => {
    const expiredIntentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await dbRun(`UPDATE subscription_payment_intents
      SET status = 'expired'
      WHERE payment_type = 'subscription' AND status = 'pending' AND created_at <= ?`, [expiredIntentCutoff]);
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 365) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const requestedStatus = String(req.query.status || 'all');
    const requestedType = String(req.query.type || 'all');
    const periodWhere = "((status = 'paid' AND paid_at >= ?) OR (status <> 'paid' AND created_at >= ?))";
    const summary = await dbGet<{
      confirmed_count: number;
      collected_amount: number;
      pending_count: number;
      pending_amount: number;
      failed_count: number;
      expired_count: number;
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
        COUNT(CASE WHEN status = 'expired' THEN 1 END) AS expired_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_count,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN 1 END) AS subscription_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN amount ELSE 0 END), 0) AS subscription_amount,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN 1 END) AS promotion_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN amount ELSE 0 END), 0) AS promotion_amount
      FROM subscription_payment_intents
      WHERE ${periodWhere}
    `, [since, since]);
    const paymentFilters = [
      "((intent.status = 'paid' AND intent.paid_at >= ?) OR (intent.status <> 'paid' AND intent.created_at >= ?))",
    ];
    const paymentParams: unknown[] = [since, since];
    if (search) {
      paymentFilters.push("(LOWER(shops.name) LIKE ? OR LOWER(COALESCE(intent.provider_reference, '')) LIKE ? OR LOWER(intent.id) LIKE ?)");
      const searchTerm = `%${search.toLocaleLowerCase('fr')}%`;
      paymentParams.push(searchTerm, searchTerm, searchTerm);
    }
    if (requestedStatus === 'failed') {
      paymentFilters.push("intent.status IN ('failed', 'error')");
    } else if (['paid', 'pending', 'cancelled', 'error', 'refunded', 'expired'].includes(requestedStatus)) {
      paymentFilters.push('intent.status = ?');
      paymentParams.push(requestedStatus);
    }
    if (requestedType === 'subscription' || requestedType === 'promotion') {
      paymentFilters.push('intent.payment_type = ?');
      paymentParams.push(requestedType);
    }
    const paymentWhere = paymentFilters.join(' AND ');
    const [payments, paymentCount] = await Promise.all([
      dbAll<{
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
      WHERE ${paymentWhere}
      ORDER BY COALESCE(intent.paid_at, intent.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...paymentParams, limit, offset]),
      dbGet<{ total: number }>(`
        SELECT COUNT(*) AS total
        FROM subscription_payment_intents AS intent
        JOIN shops ON shops.id = intent.shop_id
        WHERE ${paymentWhere}
      `, paymentParams),
    ]);
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
        expired_count: Number(summary?.expired_count || 0),
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
      payment_count: Number(paymentCount?.total || 0),
      payment_limit: limit,
      payment_offset: offset,
    });
  });

  router.get('/subscriptions', async (_req, res) => {
    const shops = await loadShops();
    const now = new Date();
    const extensionLogs = await dbAll<{ shop_id: number; details: string; created_at: string }>(
      `SELECT shop_id, details, created_at FROM admin_audit_logs
       WHERE action = 'trial_extended' AND shop_id IS NOT NULL ORDER BY created_at`,
    );
    const extensionDaysByShopId = new Map<number, number>();
    const shopsById = new Map(shops.map((shop) => [shop.id, shop]));
    for (const entry of extensionLogs) {
      const shop = shopsById.get(Number(entry.shop_id));
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
      const billingSubscription = subscription.manualOverrideActive
        ? getSubscriptionState({
          ...shop,
          subscription_admin_override_status: null,
          subscription_admin_override_tier: null,
          subscription_admin_override_until: null,
        }, now)
        : subscription;
      const trialExpiryMismatch = shop.subscription_status === 'trialing'
        && billingSubscription.trialEnd !== null
        && billingSubscription.expiresAt !== null
        && Date.parse(billingSubscription.trialEnd) !== Date.parse(billingSubscription.expiresAt);
      const shopOrderStats = orderStatsByShop.get(shop.id);
      return {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        owner_email: shop.owner_email ?? null,
        whatsapp_reminders_opt_in: Boolean(shop.whatsapp_subscription_reminders_enabled),
        plan: subscription.plan,
        pending_subscription_tier: billingSubscription.upcomingPlan,
        pending_subscription_effective_at: billingSubscription.upcomingPlanAt,
        subscription_cancel_at: billingSubscription.cancellationAt,
        subscription_admin_suspended_at: shop.subscription_admin_suspended_at ?? null,
        subscription_admin_override_status: shop.subscription_admin_override_status ?? null,
        subscription_admin_override_tier: shop.subscription_admin_override_tier ?? null,
        subscription_admin_override_until: shop.subscription_admin_override_until ?? null,
        subscription_admin_override_active: isSubscriptionManualOverrideActive(shop, now),
        status: subscription.status,
        is_active: shop.is_active,
        publication_status: shop.publication_status,
        merchant_verification_status: shop.merchant_verification_status,
        trial_start: subscription.trialStart,
        trial_end: subscription.trialEnd,
        trial_days_remaining: subscription.status === 'trialing' ? subscription.trialDaysRemaining : null,
        trial_extension_days_used: extensionDaysByShopId.get(shop.id) || 0,
        trial_extension_days_remaining: Math.max(0, maxTrialExtensionDays - (extensionDaysByShopId.get(shop.id) || 0)),
        trial_extension_over_limit: (extensionDaysByShopId.get(shop.id) || 0) > maxTrialExtensionDays,
        can_extend_trial: !subscription.manualOverrideActive && Boolean(shop.trial_start && shop.trial_end && (
          shop.subscription_status === 'trialing'
          || shop.subscription_status === 'expired' && !shop.subscription_expires_at
        )),
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
    const activitySince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [visitorMetrics, shopMetrics, whatsappMetrics] = await Promise.all([
      dbAll<{ unique_visitors: number }>(`
        SELECT COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events
        WHERE event_type = 'page_view' AND created_at >= ?
      `, [activitySince]),
      dbAll<{ shops_created: number }>(`
        SELECT COUNT(*) AS shops_created
        FROM shops
        WHERE created_at >= ?
      `, [activitySince]),
      dbAll<{ whatsapp_clicks: number }>(`
        SELECT COUNT(*) AS whatsapp_clicks
        FROM order_whatsapp_tracking
        WHERE clicked_at >= ?
      `, [activitySince]),
    ]);
    res.json({
      summary: await getSubscriptionMetrics(),
      weekly_activity: {
        unique_visitors: Number(visitorMetrics[0]?.unique_visitors || 0),
        shops_created: Number(shopMetrics[0]?.shops_created || 0),
        whatsapp_clicks: Number(whatsappMetrics[0]?.whatsapp_clicks || 0),
      },
      shops: subscriptionShops,
      audit_logs: auditLogs,
    });
  });

  router.patch('/subscriptions/:id/schedule-plan', async (req, res) => {
    const shopId = Number(req.params.id);
    if (!Number.isSafeInteger(shopId) || shopId <= 0) {
      return res.status(400).json({ error: 'Identifiant de boutique invalide.' });
    }
    const requestedTier = req.body?.next_tier;
    if (requestedTier !== null && !['standard', 'premium', 'pro'].includes(requestedTier)) {
      return res.status(400).json({ error: 'Choisissez une formule valide ou null pour annuler le changement programmé.' });
    }
    const expectedTier = req.body?.expected_tier;
    if (!['standard', 'premium', 'pro'].includes(expectedTier)) {
      return res.status(400).json({ error: 'La formule actuelle attendue est invalide.' });
    }
    const expectedPendingTier = req.body?.expected_pending_tier;
    if (expectedPendingTier !== null && !['standard', 'premium', 'pro'].includes(expectedPendingTier)) {
      return res.status(400).json({ error: 'La formule programmée actuelle est invalide.' });
    }
    const expectedExpiry = req.body?.expected_subscription_expires_at;
    if (typeof expectedExpiry !== 'string' || !Number.isFinite(Date.parse(expectedExpiry))) {
      return res.status(400).json({ error: 'Une échéance valide est requise pour programmer un changement.' });
    }
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (reason.length < 10) {
      return res.status(400).json({ error: 'Un motif explicite d’au moins 10 caractères est requis.' });
    }
    if (requestedTier === expectedTier) {
      return res.status(400).json({ error: 'La nouvelle formule doit être différente de la formule actuelle.' });
    }

    const actionAt = new Date().toISOString();
    const result = await dbTransaction(async ({ get, run }) => {
      const shop = await get<{
        selected_subscription_tier: string | null;
        subscription_status: string | null;
        subscription_expires_at: string | null;
        pending_subscription_tier: string | null;
        pending_subscription_effective_at: string | null;
        subscription_cancel_at: string | null;
        subscription_admin_suspended_at: string | null;
        subscription_admin_suspended_status: 'active' | 'trialing' | null;
        subscription_admin_override_status: 'active' | 'suspended' | null;
        subscription_admin_override_tier: 'standard' | 'premium' | 'pro' | null;
        subscription_admin_override_until: string | null;
      }>(`SELECT selected_subscription_tier, subscription_status, subscription_expires_at,
          pending_subscription_tier, pending_subscription_effective_at,
          subscription_cancel_at, subscription_admin_suspended_at, subscription_admin_suspended_status,
          subscription_admin_override_status, subscription_admin_override_tier, subscription_admin_override_until
        FROM shops WHERE id = ?`, [shopId]);
      if (!shop) return { status: 'missing' as const };
      const subscription = getSubscriptionState({
        ...shop,
        trial_start: null,
        trial_end: null,
        selected_subscription_tier: normalizeSubscriptionTier(shop.selected_subscription_tier),
        pending_subscription_tier: shop.pending_subscription_tier as 'standard' | 'premium' | 'pro' | null,
        subscription_cancel_at: shop.subscription_cancel_at,
      }, new Date(actionAt));
      if (subscription.plan !== expectedTier
        || (subscription.upcomingPlan ?? null) !== expectedPendingTier
        || shop.subscription_expires_at !== expectedExpiry) {
        return { status: 'stale' as const };
      }
      if (subscription.manualOverrideActive) return { status: 'manual_override' as const };
      if (subscription.status !== 'active' || !shop.subscription_expires_at
        || shop.subscription_admin_suspended_at || subscription.cancellationAt) {
        return { status: 'ineligible' as const };
      }
      if (requestedTier !== null && requestedTier === subscription.plan) {
        return { status: 'same' as const };
      }
      if (requestedTier === null && !subscription.upcomingPlan) {
        return { status: 'same' as const };
      }
      const unresolvedPayment = await get<{ id: string }>(`
        SELECT id FROM subscription_payment_intents
        WHERE shop_id = ? AND payment_type = 'subscription'
          AND (status = 'pending' OR (status = 'expired' AND provider_reference IS NOT NULL))
        LIMIT 1
      `, [shopId]);
      if (unresolvedPayment) return { status: 'payment_pending' as const };

      const update = await run(`UPDATE shops
        SET selected_subscription_tier = ?, subscription_tier = ?,
          pending_subscription_tier = ?, pending_subscription_effective_at = ?
        WHERE id = ? AND COALESCE(selected_subscription_tier, 'standard') = ?
          AND COALESCE(subscription_expires_at, '') = ?
          AND COALESCE(pending_subscription_tier, '') = ?
          AND COALESCE(subscription_cancel_at, '') = ?
          AND COALESCE(subscription_admin_suspended_at, '') = ?`,
      [subscription.plan, subscription.plan, requestedTier, requestedTier === null ? null : shop.subscription_expires_at,
        shopId, normalizeSubscriptionTier(shop.selected_subscription_tier), expectedExpiry,
        shop.pending_subscription_tier ?? '', shop.subscription_cancel_at ?? '',
        shop.subscription_admin_suspended_at ?? '']);
      if (update.changes !== 1) return { status: 'stale' as const };
      const action = requestedTier === null ? 'subscription_plan_change_cancelled' : 'subscription_plan_change_scheduled';
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', action, shopId, JSON.stringify({
          current_tier: expectedTier,
          previous_pending_tier: expectedPendingTier,
          pending_tier: requestedTier,
          effective_at: requestedTier === null ? null : shop.subscription_expires_at,
          reason,
        }), actionAt],
      );
      return {
        status: 'success' as const,
        pendingTier: requestedTier as 'standard' | 'premium' | 'pro' | null,
        effectiveAt: requestedTier === null ? null : shop.subscription_expires_at,
      };
    });
    if (result.status === 'missing') return res.status(404).json({ error: 'Boutique introuvable.' });
    if (result.status === 'stale') return res.status(409).json({ error: 'L’abonnement a changé. Actualisez la liste avant de réessayer.' });
    if (result.status === 'ineligible') return res.status(409).json({ error: 'Seul un abonnement payé actif avec une échéance future peut être modifié.' });
    if (result.status === 'manual_override') return res.status(409).json({ error: 'Une dérogation manuelle est active. Rétablissez d’abord l’automatisation pour programmer une formule.' });
    if (result.status === 'same') return res.status(400).json({ error: 'La formule programmée est déjà celle de l’abonnement actif.' });
    if (result.status === 'payment_pending') return res.status(409).json({ error: 'Un paiement d’abonnement est en attente. Résolvez-le avant de programmer un changement de formule.' });
    await refreshRuntimeDataFromDatabase();
    return res.json({
      success: true,
      pending_subscription_tier: result.pendingTier,
      pending_subscription_effective_at: result.effectiveAt,
    });
  });

  router.patch('/subscriptions/:id/manual-override', async (req, res) => {
    const shopId = Number(req.params.id);
    const action = req.body?.action;
    const status = req.body?.expected_override_status;
    const tier = req.body?.expected_override_tier;
    const until = req.body?.expected_override_until;
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0
      || !['grant', 'revoke', 'clear'].includes(action)
      || status !== null && status !== 'active' && status !== 'suspended'
      || tier !== null && !['standard', 'premium', 'pro'].includes(tier)
      || typeof until !== 'string' && until !== null
      || reason.length < 10) {
      return res.status(400).json({ error: 'Action, état manuel attendu et motif explicite (au moins 10 caractères) requis.' });
    }
    const nextTier = req.body?.tier;
    if (action !== 'clear' && !['standard', 'premium', 'pro'].includes(nextTier)) {
      return res.status(400).json({ error: 'Choisissez une formule valide pour la dérogation.' });
    }
    const expiryDate = typeof req.body?.until_date === 'string' ? req.body.until_date : '';
    if (action !== 'clear'
      && (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
        || Number.isNaN(Date.parse(`${expiryDate}T00:00:00.000Z`))
        || new Date(`${expiryDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== expiryDate
        || (getSubscriptionAccessCutoff(expiryDate) ?? 0) <= Date.now())) {
      return res.status(400).json({ error: 'Choisissez une date de fin valide, égale ou postérieure à aujourd’hui.' });
    }

    const actionAt = new Date().toISOString();
    const nextUntil = action === 'clear' ? null : `${expiryDate}T23:59:59.999Z`;
    const nextStatus = action === 'grant' ? 'active' : action === 'revoke' ? 'suspended' : null;
    const nextPlan = action === 'clear' ? null : normalizeSubscriptionTier(nextTier);
    const result = await dbTransaction(async ({ get, run }) => {
      const current = await get<{
        subscription_admin_override_status: 'active' | 'suspended' | null;
        subscription_admin_override_tier: string | null;
        subscription_admin_override_until: string | null;
      }>(`SELECT subscription_admin_override_status, subscription_admin_override_tier,
          subscription_admin_override_until FROM shops WHERE id = ?`, [shopId]);
      if (!current) return 'missing' as const;
      if ((current.subscription_admin_override_status ?? null) !== status
        || (current.subscription_admin_override_tier ?? null) !== tier
        || (current.subscription_admin_override_until ?? null) !== until) return 'stale' as const;
      if (action === 'clear' && !current.subscription_admin_override_status) return 'no_override' as const;
      const updated = await run(`UPDATE shops SET subscription_admin_override_status = ?,
          subscription_admin_override_tier = ?, subscription_admin_override_until = ?
        WHERE id = ? AND COALESCE(subscription_admin_override_status, '') = ?
          AND COALESCE(subscription_admin_override_tier, '') = ?
          AND COALESCE(subscription_admin_override_until, '') = ?`,
      [nextStatus, nextPlan, nextUntil, shopId, status ?? '', tier ?? '', until ?? '']);
      if (updated.changes !== 1) return 'stale' as const;
      const auditAction = action === 'grant'
        ? 'subscription_manual_access_granted'
        : action === 'revoke'
          ? 'subscription_manual_access_revoked'
          : 'subscription_manual_override_cleared';
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', auditAction, shopId, JSON.stringify({
          previous_override_status: current.subscription_admin_override_status,
          previous_override_tier: current.subscription_admin_override_tier,
          previous_override_until: current.subscription_admin_override_until,
          override_status: nextStatus,
          override_tier: nextPlan,
          override_until: nextUntil,
          reason,
        }), actionAt],
      );
      return 'success' as const;
    });
    if (result === 'missing') return res.status(404).json({ error: 'Boutique introuvable.' });
    if (result === 'stale') return res.status(409).json({ error: 'La dérogation a changé. Actualisez la liste avant de réessayer.' });
    if (result === 'no_override') return res.status(409).json({ error: 'Aucune dérogation à rétablir pour cette boutique.' });
    await refreshRuntimeDataFromDatabase();
    return res.json({
      success: true,
      subscription_admin_override_status: nextStatus,
      subscription_admin_override_tier: nextPlan,
      subscription_admin_override_until: nextUntil,
    });
  });

  router.patch('/subscriptions/:id/lifecycle', async (req, res) => {
    const shopId = Number(req.params.id);
    const action = req.body?.action;
    const expectedStatus = req.body?.expected_status;
    const expectedExpiry = req.body?.expected_subscription_expires_at;
    const expectedCancellationAt = req.body?.expected_cancellation_at;
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0
      || !['cancel_at_period_end', 'undo_cancellation', 'suspend', 'reactivate'].includes(action)
      || !['not_started', 'trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended'].includes(expectedStatus)
      || typeof expectedExpiry !== 'string' && expectedExpiry !== null
      || typeof expectedCancellationAt !== 'string' && expectedCancellationAt !== null
      || reason.length < 10) {
      return res.status(400).json({ error: 'Action, état attendu et motif explicite (au moins 10 caractères) requis.' });
    }

    const actionAt = new Date().toISOString();
    const result = await dbTransaction(async ({ get, run }) => {
      const shop = await get<{
        subscription_status: string;
        subscription_expires_at: string | null;
        trial_start: string | null;
        trial_end: string | null;
        selected_subscription_tier: string | null;
        pending_subscription_tier: string | null;
        pending_subscription_effective_at: string | null;
        subscription_cancel_at: string | null;
        subscription_admin_suspended_at: string | null;
        subscription_admin_suspended_status: 'active' | 'trialing' | null;
        subscription_admin_override_status: 'active' | 'suspended' | null;
        subscription_admin_override_tier: 'standard' | 'premium' | 'pro' | null;
        subscription_admin_override_until: string | null;
      }>(`SELECT subscription_status, subscription_expires_at, trial_start, trial_end,
          selected_subscription_tier, pending_subscription_tier, pending_subscription_effective_at,
          subscription_cancel_at, subscription_admin_suspended_at, subscription_admin_suspended_status,
          subscription_admin_override_status, subscription_admin_override_tier, subscription_admin_override_until
        FROM shops WHERE id = ?`, [shopId]);
      if (!shop) return { status: 'missing' as const };
      const subscription = getSubscriptionState({
        ...shop,
        selected_subscription_tier: normalizeSubscriptionTier(shop.selected_subscription_tier),
        pending_subscription_tier: shop.pending_subscription_tier as 'standard' | 'premium' | 'pro' | null,
      }, new Date(actionAt));
      if (subscription.status !== expectedStatus
        || shop.subscription_expires_at !== expectedExpiry
        || subscription.cancellationAt !== expectedCancellationAt) {
        return { status: 'stale' as const };
      }
      if (subscription.manualOverrideActive) return { status: 'manual_override' as const };

      let nextStatus = shop.subscription_status;
      let nextCancellationAt = shop.subscription_cancel_at;
      let nextSuspendedAt = shop.subscription_admin_suspended_at;
      let nextSuspendedStatus = shop.subscription_admin_suspended_status;
      let auditAction: string;
      let resultMessage: string;
      if (action === 'cancel_at_period_end') {
        const expiryCutoff = shop.subscription_expires_at
          ? getSubscriptionAccessCutoff(shop.subscription_expires_at)
          : null;
        if (subscription.status !== 'active' || !shop.subscription_expires_at
          || expiryCutoff === null || expiryCutoff <= Date.parse(actionAt)
          || shop.subscription_cancel_at || shop.subscription_admin_suspended_at
          || subscription.upcomingPlan) {
          return { status: 'ineligible' as const };
        }
        nextCancellationAt = shop.subscription_expires_at;
        auditAction = 'subscription_cancellation_scheduled';
        resultMessage = 'Arrêt des droits programmé à l’échéance. Le commerçant peut encore renouveler manuellement avant cette date.';
      } else if (action === 'undo_cancellation') {
        const cancellationCutoff = shop.subscription_cancel_at
          ? getSubscriptionAccessCutoff(shop.subscription_cancel_at)
          : null;
        if (subscription.status !== 'active' || !shop.subscription_cancel_at
          || cancellationCutoff === null || cancellationCutoff <= Date.parse(actionAt)) {
          return { status: 'ineligible' as const };
        }
        nextCancellationAt = null;
        auditAction = 'subscription_cancellation_revoked';
        resultMessage = 'Arrêt des droits programmé annulé.';
      } else if (action === 'suspend') {
        if ((subscription.status !== 'active' && subscription.status !== 'trialing')
          || shop.subscription_admin_suspended_at || shop.subscription_cancel_at) {
          return { status: 'ineligible' as const };
        }
        nextStatus = 'suspended';
        nextSuspendedAt = actionAt;
        nextSuspendedStatus = subscription.status;
        auditAction = 'subscription_access_suspended';
        resultMessage = 'Accès à l’abonnement suspendu.';
      } else {
        if (!shop.subscription_admin_suspended_at
          || !shop.subscription_admin_suspended_status) {
          return { status: 'not_admin_suspended' as const };
        }
        const restored = getSubscriptionState({
          ...shop,
          subscription_status: shop.subscription_admin_suspended_status,
          selected_subscription_tier: normalizeSubscriptionTier(shop.selected_subscription_tier),
          pending_subscription_tier: shop.pending_subscription_tier as 'standard' | 'premium' | 'pro' | null,
        }, new Date(actionAt));
        if (!restored.isActive || restored.status !== shop.subscription_admin_suspended_status) {
          return { status: 'not_restorable' as const };
        }
        nextStatus = restored.status;
        nextSuspendedAt = null;
        nextSuspendedStatus = null;
        auditAction = 'subscription_access_reactivated';
        resultMessage = 'Accès à l’abonnement réactivé.';
      }

      if (action === 'cancel_at_period_end' || action === 'suspend') {
        const unresolvedPayment = await get<{ id: string }>(`
          SELECT id FROM subscription_payment_intents
          WHERE shop_id = ? AND payment_type = 'subscription'
            AND (status = 'pending' OR (status = 'expired' AND provider_reference IS NOT NULL))
          LIMIT 1
        `, [shopId]);
        if (unresolvedPayment) return { status: 'payment_pending' as const };
      }

      const updated = await run(`UPDATE shops SET subscription_status = ?,
          subscription_cancel_at = ?,
          subscription_admin_suspended_at = ?,
          subscription_admin_suspended_status = ?
        WHERE id = ? AND subscription_status = ? AND COALESCE(subscription_expires_at, '') = ?
          AND COALESCE(subscription_cancel_at, '') = ?
          AND COALESCE(subscription_admin_suspended_at, '') = ?
          AND COALESCE(subscription_admin_suspended_status, '') = ?`,
      [nextStatus, nextCancellationAt, nextSuspendedAt, nextSuspendedStatus, shopId,
        shop.subscription_status, shop.subscription_expires_at ?? '',
        shop.subscription_cancel_at ?? '', shop.subscription_admin_suspended_at ?? '',
        shop.subscription_admin_suspended_status ?? '']);
      if (updated.changes !== 1) return { status: 'stale' as const };
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', auditAction, shopId, JSON.stringify({
          previous_status: subscription.status,
          status: nextStatus,
          previous_cancellation_at: shop.subscription_cancel_at,
          cancellation_at: nextCancellationAt,
          effective_at: action === 'cancel_at_period_end' ? nextCancellationAt : action === 'suspend' ? actionAt : null,
          reason,
        }), actionAt],
      );
      return {
        status: 'success' as const,
        message: resultMessage,
        subscription_status: nextStatus,
        subscription_cancel_at: nextCancellationAt,
        subscription_admin_suspended_at: nextSuspendedAt,
      };
    });

    if (result.status === 'missing') return res.status(404).json({ error: 'Boutique introuvable.' });
    if (result.status === 'stale') return res.status(409).json({ error: 'L’abonnement a changé. Actualisez la liste avant de réessayer.' });
    if (result.status === 'ineligible') return res.status(409).json({ error: 'Cette action ne s’applique pas à l’état actuel de l’abonnement.' });
    if (result.status === 'not_admin_suspended') return res.status(409).json({ error: 'Cette suspension n’a pas été effectuée par une action administrative réversible.' });
    if (result.status === 'not_restorable') return res.status(409).json({ error: 'La période payée ou d’essai est terminée; un nouveau paiement est nécessaire avant de réactiver les droits.' });
    if (result.status === 'manual_override') return res.status(409).json({ error: 'Une dérogation manuelle est active. Rétablissez d’abord l’automatisation pour utiliser ces commandes.' });
    if (result.status === 'payment_pending') return res.status(409).json({ error: 'Un paiement d’abonnement est en attente. Résolvez-le avant de modifier l’accès.' });
    await refreshRuntimeDataFromDatabase();
    return res.json({
      success: true,
      message: result.message,
      subscription_status: result.subscription_status,
      subscription_cancel_at: result.subscription_cancel_at,
      subscription_admin_suspended_at: result.subscription_admin_suspended_at,
    });
  });

  router.patch('/subscriptions/:id/extend-trial', async (req, res) => {
    const shop = await getShop(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (isSubscriptionManualOverrideActive(shop)) {
      return res.status(409).json({ error: 'Une dérogation manuelle est active. Rétablissez l’automatisation avant de prolonger l’essai.' });
    }
    const days = Number(req.body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      return res.status(400).json({ error: 'La prolongation doit être comprise entre 1 et 30 jours.' });
    }
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (reason.length < 10) {
      return res.status(400).json({ error: 'Un motif explicite d’au moins 10 caractères est requis pour prolonger un essai.' });
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
      if (days > daysRemaining) return { status: 'limit' as const, daysRemaining, daysUsed };

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
          reason,
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
          : result.daysUsed > maxTrialExtensionDays
            ? `Le cumul historique de ${result.daysUsed} jours dépasse déjà le plafond de 30 jours. Aucune nouvelle prolongation n’est autorisée.`
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
    if (isSubscriptionManualOverrideActive(shop)) {
      return res.status(409).json({ error: 'Une dérogation manuelle est active. Rétablissez l’automatisation avant de synchroniser l’essai.' });
    }
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
        total_sales: isVerificationAdmin(_req) ? 0 : totalSales,
        average_order_value: isVerificationAdmin(_req) || !actionableOrderCount ? 0 : Math.round(totalSales / actionableOrderCount),
        last_order_at: stats?.last_order_at ?? null,
        ...(isVerificationAdmin(_req) ? {
          selected_subscription_tier: undefined,
          subscription_status: undefined,
          subscription_expires_at: undefined,
          trial_start: undefined,
          trial_end: undefined,
          subscription: undefined,
        } : {}),
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
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const requestedStatus = String(req.query.status || 'all');
    const allowedStatuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired']);
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
          orders.delivery_location, orders.total_amount, orders.status, orders.created_at, orders.items
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
          delivery_location: String(order.delivery_location),
          total_amount: isVerificationAdmin(req) ? 0 : Number(order.total_amount),
          status: String(order.status || 'pending'), created_at: String(order.created_at),
          items_count: (items || []).reduce((sum, item) => sum + item.quantity, 0),
        };
      });
    res.json({ orders, total: Number(totalRow?.total || 0), limit, offset, status: requestedStatus, search });
  });

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
          COALESCE(SUM(CASE WHEN COALESCE(orders.status, 'pending') NOT IN ('cancelled', 'expired')
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

  router.patch('/shops/:id/toggle-active', async (req, res) => {
    const shopId = Number(req.params.id);
    const expectedIsActive = req.body?.expected_is_active;
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0
      || typeof expectedIsActive !== 'boolean'
      || reason.length < 3) {
      return res.status(400).json({ error: 'Un motif (au moins 3 caractères) et le statut actuel sont requis.' });
    }
    const result = await dbTransaction(async ({ get, run }) => {
      const row = await get<Record<string, unknown>>('SELECT * FROM shops WHERE id = ?', [shopId]);
      if (!row) return undefined;
      const shop = mapShopRow(row);
      if (shop.is_active !== expectedIsActive) return null;
      const isActive = !shop.is_active;
      const publicationStatus = isActive
        ? (shop.publication_status === 'suspended' ? 'draft' : shop.publication_status)
        : (shop.publication_status || 'active');
      const update = await run('UPDATE shops SET is_active = ?, publication_status = ? WHERE id = ? AND is_active = ?', [
        isActive ? 1 : 0, publicationStatus, shopId, expectedIsActive ? 1 : 0,
      ]);
      if (update.changes !== 1) return null;
      const revokedSessions = isActive
        ? 0
        : (await run('DELETE FROM merchant_sessions WHERE shop_id = ?', [shopId])).changes;
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [req.adminRole || 'super_admin', isActive ? 'shop_reactivated' : 'shop_suspended', shopId, JSON.stringify({
          is_active: isActive,
          reason,
          revoked_sessions: revokedSessions,
        }), new Date().toISOString()],
      );
      return { isActive, revokedSessions };
    });
    if (result === null) return res.status(409).json({ error: 'Le statut de la boutique a changé. Actualisez la liste avant de réessayer.' });
    if (result === undefined) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!result.isActive) clearMerchantSessionsForShop(shopId);
    await refreshRuntimeDataFromDatabase();
    const updatedShop = await getShop(shopId);
    const shopResponse = isVerificationAdmin(req)
      ? { id: updatedShop!.id, is_active: updatedShop!.is_active, publication_status: updatedShop!.publication_status }
      : toSafeShop(updatedShop!);
    res.json({ success: true, is_active: result.isActive, revoked_sessions: result.revokedSessions, shop: shopResponse });
  });

  router.delete('/shops/:id', async (req, res) => {
    const shopId = Number(req.params.id);
    const confirmationSlug = typeof req.body?.confirmation_slug === 'string' ? req.body.confirmation_slug.trim() : '';
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !confirmationSlug || reason.length < 3) {
      return res.status(400).json({ error: 'Le slug de confirmation et un motif d’au moins 3 caractères sont requis.' });
    }

    const result = await dbTransaction(async ({ get, run }) => {
      const row = await get<Record<string, unknown>>('SELECT id, name, slug FROM shops WHERE id = ?', [shopId]);
      if (!row) return { kind: 'missing' as const };
      if (row.slug !== confirmationSlug) return { kind: 'confirmation_mismatch' as const };

      const reviews = await run(
        `DELETE FROM customer_reviews
         WHERE shop_id = ? OR (target_type = 'product' AND target_id IN (SELECT id FROM products WHERE shop_id = ?))`,
        [shopId, shopId],
      );
      const reports = await run(
        `DELETE FROM customer_reports
         WHERE (target_type = 'shop' AND target_id = ?)
           OR (target_type = 'product' AND target_id IN (SELECT id FROM products WHERE shop_id = ?))`,
        [shopId, shopId],
      );
      await run(
        "DELETE FROM customer_favorites WHERE target_type = 'product' AND target_id IN (SELECT id FROM products WHERE shop_id = ?)",
        [shopId],
      );
      await run('DELETE FROM customer_product_likes WHERE product_id IN (SELECT id FROM products WHERE shop_id = ?)', [shopId]);
      await run("DELETE FROM customer_favorites WHERE target_type = 'shop' AND target_id = ?", [shopId]);
      await run('DELETE FROM order_whatsapp_tracking WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ?)', [shopId]);
      const orders = await run('DELETE FROM orders WHERE shop_id = ?', [shopId]);
      await run('DELETE FROM analytics_events WHERE shop_id = ?', [shopId]);
      await run('DELETE FROM merchant_sessions WHERE shop_id = ?', [shopId]);
      await run('DELETE FROM shop_boosts WHERE shop_id = ?', [shopId]);
      const products = await run('DELETE FROM products WHERE shop_id = ?', [shopId]);
      const deletedShop = await run('DELETE FROM shops WHERE id = ? AND slug = ?', [shopId, confirmationSlug]);
      if (deletedShop.changes !== 1) throw new Error(`Shop ${shopId} changed during permanent deletion.`);

      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'shop_permanently_deleted', null, JSON.stringify({
          shop_id: shopId,
          shop_name: row.name,
          shop_slug: row.slug,
          reason,
          deleted_products: products.changes,
          deleted_orders: orders.changes,
          deleted_reviews: reviews.changes,
          deleted_reports: reports.changes,
        }), new Date().toISOString()],
      );
      return { kind: 'deleted' as const };
    });

    if (result.kind === 'missing') return res.status(404).json({ error: 'Boutique introuvable.' });
    if (result.kind === 'confirmation_mismatch') return res.status(409).json({ error: 'Le slug ne correspond pas à la boutique. Actualisez la liste avant de réessayer.' });
    await refreshRuntimeDataFromDatabase();
    return res.json({ success: true });
  });

  router.patch('/subscriptions/:id/set-expiry', async (req, res) => {
    const shopId = Number(req.params.id);
    const expiryDate = typeof req.body?.expiry_date === 'string' ? req.body.expiry_date : '';
    const expectedExpiry = req.body?.expected_subscription_expires_at;
    const reason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
      || Number.isNaN(Date.parse(`${expiryDate}T00:00:00.000Z`))
      || new Date(`${expiryDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== expiryDate
      || typeof expectedExpiry !== 'string' && expectedExpiry !== null
      || reason.length < 10) {
      return res.status(400).json({ error: 'Une date valide, le statut actuel et un motif explicite (au moins 10 caractères) sont requis.' });
    }
    const shop = await getShop(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (isSubscriptionManualOverrideActive(shop)) {
      return res.status(409).json({ error: 'Une dérogation manuelle est active. Rétablissez l’automatisation avant de corriger l’échéance payée.' });
    }
    if (shop.subscription_status !== 'active') {
      return res.status(409).json({ error: 'Seul un abonnement actif peut recevoir une échéance manuelle.' });
    }
    if ((shop.subscription_expires_at ?? null) !== expectedExpiry) {
      return res.status(409).json({ error: 'L’échéance a changé. Actualisez la liste avant de réessayer.' });
    }
    const nextExpiry = `${expiryDate}T23:59:59.999Z`;
    const actionAt = new Date().toISOString();
    const subscription = getSubscriptionState(shop, new Date(actionAt));
    if (subscription.status !== 'active') {
      return res.status(409).json({ error: 'Seul un abonnement actif peut recevoir une échéance manuelle.' });
    }
    const pendingWasEffective = Boolean(shop.pending_subscription_tier && !subscription.upcomingPlan);
    const pendingIsUpcoming = Boolean(subscription.upcomingPlan);
    const cancellationIsUpcoming = Boolean(shop.subscription_cancel_at && subscription.cancellationAt);
    const subscriptionUpdateValues = [
      nextExpiry,
      cancellationIsUpcoming ? 1 : 0,
      nextExpiry,
      pendingWasEffective ? 1 : 0,
      subscription.plan,
      pendingWasEffective ? 1 : 0,
      subscription.plan,
      pendingWasEffective ? 1 : 0,
      pendingWasEffective ? 1 : 0,
      pendingIsUpcoming ? 1 : 0,
      nextExpiry,
    ];
    const subscriptionUpdate = `SET subscription_expires_at = ?,
      subscription_cancel_at = CASE WHEN ? = 1 THEN ? ELSE subscription_cancel_at END,
      selected_subscription_tier = CASE WHEN ? = 1 THEN ? ELSE selected_subscription_tier END,
      subscription_tier = CASE WHEN ? = 1 THEN ? ELSE subscription_tier END,
      pending_subscription_tier = CASE WHEN ? = 1 THEN NULL ELSE pending_subscription_tier END,
      pending_subscription_effective_at = CASE
        WHEN ? = 1 THEN NULL
        WHEN ? = 1 THEN ?
        ELSE pending_subscription_effective_at END`;
    const updated = await dbTransaction(async ({ run }) => {
      const result = expectedExpiry === null
        ? await run(`UPDATE shops ${subscriptionUpdate} WHERE id = ?
          AND subscription_status = 'active' AND subscription_expires_at IS NULL
          AND COALESCE(subscription_cancel_at, '') = ?
          AND COALESCE(pending_subscription_tier, '') = ?
          AND COALESCE(pending_subscription_effective_at, '') = ?`,
        [...subscriptionUpdateValues, shopId, shop.subscription_cancel_at ?? '',
          shop.pending_subscription_tier ?? '', shop.pending_subscription_effective_at ?? ''])
        : await run(`UPDATE shops ${subscriptionUpdate} WHERE id = ?
          AND subscription_status = 'active' AND subscription_expires_at = ?
          AND COALESCE(subscription_cancel_at, '') = ?
          AND COALESCE(pending_subscription_tier, '') = ?
          AND COALESCE(pending_subscription_effective_at, '') = ?`,
        [...subscriptionUpdateValues, shopId, expectedExpiry, shop.subscription_cancel_at ?? '',
          shop.pending_subscription_tier ?? '', shop.pending_subscription_effective_at ?? '']);
      if (result.changes !== 1) return false;
      await run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'subscription_expiry_corrected', shopId, JSON.stringify({
          previous_subscription_expires_at: expectedExpiry,
          subscription_expires_at: nextExpiry,
          previous_cancellation_at: shop.subscription_cancel_at,
          cancellation_at: cancellationIsUpcoming ? nextExpiry : shop.subscription_cancel_at,
          reason,
        }), actionAt],
      );
      return true;
    });
    if (!updated) return res.status(409).json({ error: 'L’abonnement a été modifié entre-temps. Actualisez la liste avant de réessayer.' });
    await refreshRuntimeDataFromDatabase();
    res.json({ success: true, subscription_expires_at: nextExpiry });
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
      await logAdminAction('identity_verification_request_prepared', shop.id, { delivery_mode: 'whatsapp_click_to_chat' }, req.adminRole || 'super_admin');
    }
    res.json({ success: true, delivery_mode: 'whatsapp_click_to_chat', template, message, whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
  });

  return router;
}
