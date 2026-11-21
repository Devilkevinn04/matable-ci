// Modération des avis et signalements.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';

export function registerModerationRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbGet,
    dbTransaction,
    requireVerification,
  } = ctx;

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

}
