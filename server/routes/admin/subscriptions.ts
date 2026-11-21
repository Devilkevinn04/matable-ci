// Gestion des abonnements et essais.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';
import { getSubscriptionState, isSubscriptionManualOverrideActive } from '../../services/businessRules.ts';
import { getSubscriptionAccessCutoff, normalizeSubscriptionTier } from '../../../src/utils/subscriptionFeatures.ts';

export function registerSubscriptionsRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbTransaction,
    refreshRuntimeDataFromDatabase,
    toSafeShop,
    maxTrialExtensionDays,
    loadShops,
    getShop,
    getTrialExtensionDays,
    getSubscriptionMetrics,
  } = ctx;

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
        FROM orders WHERE COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired') GROUP BY shop_id
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

}
