// Rapports : boutiques en vérification, ventes produits, journal d’audit, état Push.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';
import { getPushSubscriptionCount, getVapidConfiguration } from '../../services/pushNotifications.ts';
import { getAutomatedAnnouncementStats } from '../../services/automatedAnnouncements.ts';

export function registerReportsRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbGet,
    requireSuperAdmin,
    requireVerification,
    getSafeAuditDetails,
  } = ctx;

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
      ? `SELECT * FROM (${promotionsQuery}) promotions`
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
    const [rules, subscriptionCount] = await Promise.all([
      getAutomatedAnnouncementStats(),
      getPushSubscriptionCount(),
    ]);
    return res.json({
      configured: Boolean(getVapidConfiguration()),
      subscribed_devices: subscriptionCount,
      rules,
    });
  });

}
