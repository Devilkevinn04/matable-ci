// Gestion des boutiques : liste, mise en avant, activation, suppression, accès, notifications.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';
import { mapShopRow } from '../../repositories/shops.ts';

export function registerShopsRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbTransaction,
    refreshRuntimeDataFromDatabase,
    toSafeShop,
    rotateMerchantAccessTokenForShop,
    clearMerchantSessionsForShop,
    isVerificationAdmin,
    loadShops,
    getShop,
    logAdminAction,
  } = ctx;

  router.get('/shops', async (_req, res) => {
    const acquisitions = await dbAll<{ shop_id: number; declared_source: string | null; campaign: string | null }>(
      'SELECT shop_id, declared_source, campaign FROM shop_acquisitions',
    );
    const acquisitionByShop = new Map(acquisitions.map((row) => [Number(row.shop_id), row]));
    const [shops, productCounts, orderStats] = await Promise.all([
      loadShops(),
      dbAll<{ shop_id: number; count: number }>('SELECT shop_id, COUNT(*) AS count FROM products GROUP BY shop_id'),
      dbAll<{ shop_id: number; count: number; total_sales: number; last_order_at: string | null }>(`
        SELECT shop_id, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total_sales, MAX(created_at) AS last_order_at
        FROM orders WHERE COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired') GROUP BY shop_id
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
        acquisition_source: acquisitionByShop.get(shop.id)?.declared_source ?? null,
        acquisition_campaign: acquisitionByShop.get(shop.id)?.campaign ?? null,
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
      welcome: `Bonjour ${shop.name}, votre espace MaTable est prêt. Pensez à compléter votre catalogue et à partager votre vitrine avec vos clients.`,
      catalog: `Bonjour ${shop.name}, pensez à vérifier vos articles, vos prix et vos disponibilités afin que votre vitrine MaTable reste à jour.`,
      orders: `Bonjour ${shop.name}, pensez à consulter vos nouvelles commandes et à confirmer rapidement les demandes reçues via MaTable.`,
      support: `Bonjour ${shop.name}, nous vous contactons au sujet de votre boutique MaTable. Répondez à ce message si vous avez besoin d’aide.`,
      trial_expiring: `Bonjour ${shop.name}, votre essai MaTable arrive à échéance. Connectez-vous à votre espace commerçant pour choisir une formule et garder votre vitrine visible. L’équipe MaTable reste disponible si besoin.`,
    };
    if (template === 'identity_verification') {
      const messageTemplate = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (req.body?.message !== undefined && (!messageTemplate || messageTemplate.length > 2000)) {
        return res.status(400).json({ error: 'Le message doit contenir entre 1 et 2 000 caractères.' });
      }
      templates.identity_verification = messageTemplate || `Bonjour {boutique}, votre boutique MaTable est actuellement en veille et n’apparaît pas sur le site, car votre identité n’a pas encore été vérifiée. Pour la faire réapparaître, connectez-vous à votre tableau de bord marchand : {dashboard}, puis ouvrez « Vérification d’identité » et suivez les étapes de Didit. Après la vérification, la remise en ligne pourra être finalisée si les autres critères de publication sont remplis. Répondez à ce message si vous avez besoin d’aide.`;
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
}
