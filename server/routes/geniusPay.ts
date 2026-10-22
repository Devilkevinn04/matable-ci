import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { computeIsShopOpen, getSubscriptionPlanConfig, getSubscriptionState, normalizeSubscriptionTier, normalizeWhatsAppPhone } from '../services/businessRules.ts';
import { createGeniusPayCheckout, getGeniusPayPayment, getRenewedSubscriptionExpiry, GeniusPayApiError, isValidGeniusPaySignature } from '../services/geniusPay.ts';
import type { ShopRecord, SubscriptionTier } from '../types.ts';
import { type SubscriptionTerm } from '../../src/utils/subscriptionFeatures.ts';
import { getDefaultSubscriptionPrices, getSubscriptionPriceForTerm, parseSubscriptionPrices } from '../services/subscriptionPricing.ts';
import { getShopFromDatabase, mapShopRow } from '../repositories/shops.ts';
import { sendMerchantSubscriptionReceiptEmail } from '../services/email.ts';
import {
  BOOST_DURATIONS_DAYS,
  BOOST_MINIMUM_PRODUCT_COUNT,
  findEarliestBoostStart,
  MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
  getBoostCapacityScope,
} from '../services/boosts.ts';
import { BOOST_PLACEMENTS, getBoostPrice } from '../../src/utils/boostPricing.ts';

interface GeniusPayRouterOptions {
  shops: ShopRecord[];
  requireMerchantOwnShop: RequestHandler;
  rateLimitPaymentCreation: RequestHandler;
  rateLimitWebhook: RequestHandler;
}

interface SubscriptionPaymentIntent {
  id: string;
  shop_id: number;
  payment_type: 'subscription' | 'promotion';
  tier: SubscriptionTier;
  subscription_term: SubscriptionTerm;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  provider_reference: string | null;
  provider_checkout_url?: string | null;
  created_at: string;
  paid_at: string | null;
}

export type GeniusPayRouter = Router & { reconcilePendingPayments: () => Promise<void> };

export function createGeniusPayRouter({ requireMerchantOwnShop, rateLimitPaymentCreation, rateLimitWebhook }: GeniusPayRouterOptions) {
  const router = Router();
  const subscriptionIntentLifetimeMs = 24 * 60 * 60 * 1000;
  const expireStaleSubscriptionIntents = async (shopId?: number) => {
    const cutoff = new Date(Date.now() - subscriptionIntentLifetimeMs).toISOString();
    const shopFilter = shopId === undefined ? '' : ' AND shop_id = ?';
    await dbRun(`UPDATE subscription_payment_intents
      SET status = 'expired'
      WHERE payment_type = 'subscription' AND status = 'pending' AND created_at <= ?${shopFilter}`,
    shopId === undefined ? [cutoff] : [cutoff, shopId]);
  };
  const resolveBillingEmail = async (shopId: number, currentEmail: string | null | undefined, requestedEmail: unknown) => {
    if (requestedEmail === undefined) {
      return currentEmail
        ? { email: currentEmail }
        : { error: { status: 409, code: 'billing_email_required', message: 'Ajoutez un e-mail à la boutique pour continuer le paiement.' } };
    }
    if (typeof requestedEmail !== 'string') {
      return { error: { status: 400, code: 'invalid_billing_email', message: 'Saisissez une adresse e-mail valide.' } };
    }
    const email = requestedEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return { error: { status: 400, code: 'invalid_billing_email', message: 'Saisissez une adresse e-mail valide.' } };
    }
    const duplicate = await dbGet<{ id: number }>(
      'SELECT id FROM shops WHERE LOWER(owner_email) = LOWER(?) AND id <> ?',
      [email, shopId],
    );
    if (duplicate) {
      return { error: { status: 409, code: 'billing_email_in_use', message: 'Cette adresse e-mail est déjà associée à une autre boutique.' } };
    }
    if (email !== currentEmail) {
      await dbRun('UPDATE shops SET owner_email = ? WHERE id = ?', [email, shopId]);
    }
    return { email };
  };

  const applySuccessfulPayment = async (input: {
    paymentId: string;
    providerReference: string;
    amount: number;
    paymentType: 'subscription' | 'promotion';
  }) => {
    const now = new Date();
    return dbTransaction(async (transaction) => {
      const payment = await transaction.get<SubscriptionPaymentIntent>(
        'SELECT * FROM subscription_payment_intents WHERE id = ?',
        [input.paymentId],
      );
      if (!payment) return { status: 'not_found' as const };
      if (payment.payment_type !== input.paymentType) return { status: 'mismatch' as const };
      if (!payment.provider_reference) return { status: 'reference_pending' as const };
      if (payment.provider_reference !== input.providerReference) return { status: 'reference_mismatch' as const };
      if (payment.status === 'paid') return { status: 'duplicate' as const };
      if (!['pending', 'expired'].includes(payment.status)) return { status: 'mismatch' as const };
      if (Number(payment.amount) !== input.amount) return { status: 'mismatch' as const };
      const referenceOwner = await transaction.get<{ id: string }>(
        'SELECT id FROM subscription_payment_intents WHERE provider_reference = ? AND id <> ?',
        [input.providerReference, input.paymentId],
      );
      if (referenceOwner) return { status: 'reference_conflict' as const };

      if (payment.payment_type === 'promotion') {
        const boost = await transaction.get<{
          id: string;
          city: string;
          category: string;
          placement: string;
          starts_at: string;
          ends_at: string;
          status: string;
          reservation_expires_at: string | null;
        }>('SELECT * FROM shop_boosts WHERE payment_intent_id = ?', [payment.id]);
        if (!boost || !['pending_payment', 'cancelled'].includes(boost.status)) return { status: 'mismatch' as const };
        const capacityScope = getBoostCapacityScope(boost.placement as 'home' | 'category' | 'city' | 'directory', boost.city, boost.category);
        if (databaseMode === 'postgresql') await transaction.get('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [capacityScope.lockKey]);
        let startsAt = Date.parse(boost.starts_at);
        let endsAt = Date.parse(boost.ends_at);
        const reservationExpired = !boost.reservation_expires_at
          || Date.parse(boost.reservation_expires_at) <= now.getTime();
        if (reservationExpired) {
          const intervals = await transaction.all<{ starts_at: string; ends_at: string }>(
            `SELECT starts_at, ends_at FROM shop_boosts
              WHERE ${capacityScope.where} AND id <> ?
                AND (status IN ('scheduled', 'active')
                  OR (status = 'pending_payment' AND reservation_expires_at > ?))`,
            [...capacityScope.params, boost.id, now.toISOString()],
          );
          const days = (endsAt - startsAt) / 86400000;
          startsAt = findEarliestBoostStart(intervals, days, now, MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE).getTime();
          endsAt = startsAt + days * 86400000;
        }
        const paidAt = now.toISOString();
        const paid = await transaction.run(`UPDATE subscription_payment_intents
          SET status = 'paid', provider_reference = ?, paid_at = ?
          WHERE id = ? AND status IN ('pending', 'expired')`, [input.providerReference, paidAt, payment.id]);
        if (paid.changes !== 1) return { status: 'duplicate' as const };
        const activated = await transaction.run(`UPDATE shop_boosts
          SET starts_at = ?, ends_at = ?, status = ?, reservation_expires_at = NULL
          WHERE id = ? AND status IN ('pending_payment', 'cancelled')`,
        [new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), startsAt <= now.getTime() ? 'active' : 'scheduled', boost.id]);
        if (activated.changes !== 1) throw new Error('Boost reservation disappeared while applying a GeniusPay payment.');
        return { status: 'boost_paid' as const, paymentId: payment.id };
      }

      const shopRecord = await transaction.get<{
        name: string;
        owner_email: string | null;
        subscription_expires_at: string | null;
        subscription_status: string | null;
        selected_subscription_tier: string | null;
        trial_start: string | null;
        trial_end: string | null;
        pending_subscription_tier: string | null;
        pending_subscription_effective_at: string | null;
        subscription_cancel_at: string | null;
        subscription_admin_suspended_at: string | null;
        subscription_admin_suspended_status: 'active' | 'trialing' | null;
      }>(
        `SELECT name, owner_email, subscription_expires_at, subscription_status,
          selected_subscription_tier, trial_start, trial_end, pending_subscription_tier,
          pending_subscription_effective_at, subscription_cancel_at,
          subscription_admin_suspended_at, subscription_admin_suspended_status
        FROM shops WHERE id = ?`,
        [payment.shop_id],
      );
      if (!shopRecord) return { status: 'not_found' as const };
      const expiresAt = getRenewedSubscriptionExpiry(shopRecord.subscription_expires_at, now, payment.subscription_term);
      const currentSubscription = getSubscriptionState({
        ...shopRecord,
        subscription_status: shopRecord.subscription_admin_suspended_at
          ? shopRecord.subscription_admin_suspended_status || shopRecord.subscription_status
          : shopRecord.subscription_status,
        selected_subscription_tier: normalizeSubscriptionTier(shopRecord.selected_subscription_tier),
        pending_subscription_tier: shopRecord.pending_subscription_tier as SubscriptionTier | null,
      }, now);
      const preserveCurrentPlan = currentSubscription.status === 'active'
        && Boolean(shopRecord.subscription_expires_at);
      const pendingTier = preserveCurrentPlan
        && payment.tier !== currentSubscription.plan
        ? payment.tier
        : null;
      const pendingEffectiveAt = pendingTier
        ? shopRecord.pending_subscription_tier === pendingTier && currentSubscription.upcomingPlan
          ? shopRecord.pending_subscription_effective_at || shopRecord.subscription_expires_at
          : shopRecord.subscription_expires_at
        : null;
      const effectiveTier = preserveCurrentPlan ? currentSubscription.plan : payment.tier;
      const paidAt = now.toISOString();
      const paid = await transaction.run(`UPDATE subscription_payment_intents
        SET status = 'paid', provider_reference = ?, paid_at = ?
        WHERE id = ? AND status IN ('pending', 'expired')`, [input.providerReference, paidAt, payment.id]);
      if (paid.changes !== 1) return { status: 'duplicate' as const };
      const updatedShop = await transaction.run(`UPDATE shops
        SET subscription_status = CASE WHEN subscription_admin_suspended_at IS NOT NULL THEN 'suspended' ELSE 'active' END,
          selected_subscription_tier = ?, subscription_tier = ?,
          subscription_expires_at = ?, pending_subscription_tier = ?, pending_subscription_effective_at = ?,
          subscription_admin_suspended_status = CASE
            WHEN subscription_admin_suspended_at IS NOT NULL THEN 'active'
            ELSE subscription_admin_suspended_status END,
          subscription_cancel_at = NULL,
          last_notification_sent_at = NULL
        WHERE id = ?`, [effectiveTier, effectiveTier, expiresAt, pendingTier, pendingEffectiveAt, payment.shop_id]);
      if (updatedShop.changes !== 1) throw new Error('Shop disappeared while applying a GeniusPay payment.');
      return {
        status: 'paid' as const,
        shopId: payment.shop_id,
        tier: payment.tier,
        expiresAt,
        receipt: {
          shopName: shopRecord.name,
          ownerEmail: shopRecord.owner_email,
          paymentId: payment.id,
          providerReference: input.providerReference,
          tierLabel: getSubscriptionPlanConfig(payment.tier).label,
          term: payment.subscription_term,
          amount: payment.amount,
          currency: payment.currency,
          paidAt,
        },
      };
    });
  };

  const sendPaymentReceipt = async (result: Awaited<ReturnType<typeof applySuccessfulPayment>>) => {
    if (result.status !== 'paid' || !result.receipt.ownerEmail) return;
    try {
      const emailResult = await sendMerchantSubscriptionReceiptEmail({
        ...result.receipt,
        ownerEmail: result.receipt.ownerEmail,
      });
      if (!emailResult.sent && emailResult.error !== 'email_disabled_in_test') {
        console.warn(`Subscription receipt email skipped for payment ${result.receipt.paymentId}: ${emailResult.error || 'unknown_error'}`);
      }
    } catch (error) {
      console.warn(`Subscription receipt email failed for payment ${result.receipt.paymentId}:`, error);
    }
  };

  const beginWebhookEvent = async (input: {
    eventId: string;
    eventType: string;
    paymentId: string | null;
    providerReference: string | null;
    payloadSha256: string;
  }) => {
    const existing = await dbGet<{ processing_status: string; payload_sha256: string }>(
      'SELECT processing_status, payload_sha256 FROM geniuspay_webhook_events WHERE event_id = ?',
      [input.eventId],
    );
    if (existing && existing.payload_sha256 !== input.payloadSha256) return 'payload_conflict' as const;
    if (existing && ['processed', 'ignored', 'rejected'].includes(existing.processing_status)) return true;
    await dbRun(`INSERT INTO geniuspay_webhook_events
      (event_id, event_type, payment_intent_id, provider_reference, payload_sha256, processing_status, received_at)
      VALUES (?, ?, ?, ?, ?, 'processing', ?)
      ON CONFLICT (event_id) DO UPDATE SET
        event_type = excluded.event_type,
        payment_intent_id = excluded.payment_intent_id,
        provider_reference = excluded.provider_reference,
        payload_sha256 = excluded.payload_sha256,
        processing_status = 'processing', result_code = NULL,
        received_at = excluded.received_at, processed_at = NULL`,
    [input.eventId, input.eventType.slice(0, 100), input.paymentId, input.providerReference, input.payloadSha256, new Date().toISOString()]);
    return false as const;
  };

  const finishWebhookEvent = async (eventId: string, status: 'processed' | 'ignored' | 'rejected' | 'retryable', resultCode: string) => {
    await dbRun(`UPDATE geniuspay_webhook_events
      SET processing_status = ?, result_code = ?, processed_at = ? WHERE event_id = ?`,
    [status, resultCode.slice(0, 100), new Date().toISOString(), eventId]);
  };

  const recordPaymentIncident = async (paymentId: string, action: string, details: Record<string, unknown>) => {
    const payment = await dbGet<{ shop_id: number }>(
      'SELECT shop_id FROM subscription_payment_intents WHERE id = ?',
      [paymentId],
    );
    await dbRun(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
      VALUES ('system', ?, ?, ?, ?)`, [action, payment?.shop_id || null, JSON.stringify({ payment_id: paymentId, ...details }), new Date().toISOString()]);
  };

  const reconcilePayment = async (payment: SubscriptionPaymentIntent, minimumIntervalMs?: number) => {
    if (!['pending', 'expired'].includes(payment.status) || !payment.provider_reference) return;
    const verificationIntervalMs = minimumIntervalMs ?? (payment.status === 'expired' ? 60 * 60 * 1000 : 5 * 60 * 1000);
    const checkedAt = new Date().toISOString();
    const checkBefore = new Date(Date.now() - verificationIntervalMs).toISOString();
    const claim = await dbRun(`UPDATE subscription_payment_intents
      SET provider_checked_at = ?, provider_check_attempts = provider_check_attempts + 1
      WHERE id = ? AND status IN ('pending', 'expired')
        AND (provider_checked_at IS NULL OR provider_checked_at <= ?)`, [checkedAt, payment.id, checkBefore]);
    if (claim.changes !== 1) return;

    let providerPayment;
    try {
      providerPayment = await getGeniusPayPayment(payment.provider_reference);
    } catch (error) {
      const retryAt = new Date(Date.now() - verificationIntervalMs + 30_000).toISOString();
      await dbRun(`UPDATE subscription_payment_intents SET provider_checked_at = ?
        WHERE id = ? AND status IN ('pending', 'expired')`, [retryAt, payment.id]);
      throw error;
    }
    if (!providerPayment) return;
    const metadata = providerPayment.metadata;
    if (providerPayment.reference !== payment.provider_reference
      || Number(providerPayment.amount) !== Number(payment.amount)
      || providerPayment.currency !== payment.currency
      || metadata.subscription_payment_id !== payment.id
      || metadata.payment_type !== payment.payment_type) {
      console.error(`GeniusPay reconciliation mismatch for payment ${payment.id}.`);
      await recordPaymentIncident(payment.id, 'geniuspay_reconciliation_mismatch', {
        provider_reference: payment.provider_reference,
        expected_amount: payment.amount,
        actual_amount: providerPayment.amount,
        actual_currency: providerPayment.currency,
        provider_status: providerPayment.status,
      });
      return;
    }

    if (providerPayment.status !== 'completed') {
      const terminalStatus: Record<string, 'failed' | 'cancelled' | 'expired'> = {
        failed: 'failed',
        cancelled: 'cancelled',
        expired: 'expired',
      };
      const mappedStatus = terminalStatus[providerPayment.status];
      if (!mappedStatus) return;
      const appliedStatus = await applyProviderStatus({
        paymentId: payment.id,
        providerReference: providerPayment.reference,
        amount: providerPayment.amount,
        paymentType: payment.payment_type,
        status: mappedStatus,
      });
      if (!['failed', 'cancelled', 'expired', 'duplicate'].includes(appliedStatus)) {
        await recordPaymentIncident(payment.id, 'geniuspay_reconciliation_status_mismatch', {
          provider_reference: payment.provider_reference,
          provider_status: providerPayment.status,
          result: appliedStatus,
        });
      }
      return;
    }

    const applied = await applySuccessfulPayment({
      paymentId: payment.id,
      providerReference: providerPayment.reference,
      amount: providerPayment.amount,
      paymentType: payment.payment_type,
    });
    await sendPaymentReceipt(applied);
    if (!['paid', 'boost_paid', 'duplicate'].includes(applied.status)) {
      console.error(`GeniusPay reconciliation did not apply payment ${payment.id}: ${applied.status}.`);
    }
  };

  const reconcilePendingPayments = async () => {
    await expireStaleSubscriptionIntents();
    await dbRun('DELETE FROM geniuspay_webhook_events WHERE received_at < ?', [new Date(Date.now() - 180 * 86400000).toISOString()]);
    const pendingCheckBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const expiredCheckBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const payments = await dbAll<SubscriptionPaymentIntent>(`SELECT * FROM subscription_payment_intents
      WHERE provider_reference IS NOT NULL AND (
        (status = 'pending' AND (provider_checked_at IS NULL OR provider_checked_at <= ?))
        OR (status = 'expired' AND (provider_checked_at IS NULL OR provider_checked_at <= ?))
      )
      ORDER BY provider_checked_at ASC NULLS FIRST, created_at ASC LIMIT 25`, [pendingCheckBefore, expiredCheckBefore]);
    for (const payment of payments) {
      try {
        await reconcilePayment(payment);
      } catch (error) {
        console.warn(`Unable to reconcile GeniusPay payment ${payment.id}.`, error);
      }
    }
  };

  const applyProviderStatus = async (input: {
    paymentId: string;
    providerReference: string;
    amount: number;
    refundedAmount?: number;
    paymentType: 'subscription' | 'promotion';
    status: 'failed' | 'cancelled' | 'expired' | 'refunded';
  }) => dbTransaction(async (transaction) => {
    const payment = await transaction.get<{
      status: string;
      amount: number;
      payment_type: string;
      provider_reference: string | null;
      shop_id: number;
      created_at: string;
      subscription_term: string;
      tier: string;
    }>(`SELECT status, amount, payment_type, provider_reference, shop_id, created_at, subscription_term, tier
      FROM subscription_payment_intents WHERE id = ?`, [input.paymentId]);
    if (!payment) return 'not_found' as const;
    if (payment.payment_type !== input.paymentType) return 'mismatch' as const;
    if (!payment.provider_reference) return 'reference_pending' as const;
    if (payment.provider_reference !== input.providerReference) return 'reference_mismatch' as const;
    if (Number(payment.amount) !== input.amount) return 'mismatch' as const;
    if (payment.status === input.status || (input.status === 'failed' && ['cancelled', 'expired'].includes(payment.status))) return 'duplicate' as const;
    if (input.status === 'refunded') {
      if (payment.status !== 'paid') return 'mismatch' as const;
      const refundedAmount = input.refundedAmount ?? input.amount;
      if (refundedAmount < Number(payment.amount)) {
        await transaction.run(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
          VALUES ('system', 'geniuspay_partial_refund_review', ?, ?, ?)`, [payment.shop_id, JSON.stringify({
          payment_id: input.paymentId,
          provider_reference: input.providerReference,
          payment_type: input.paymentType,
          amount: input.amount,
          refunded_amount: refundedAmount,
          action_required: 'Review partial refund; no automatic entitlement change applied.',
        }), new Date().toISOString()]);
        return 'refund_review' as const;
      }
      const refunded = await transaction.run(`UPDATE subscription_payment_intents SET status = 'refunded'
        WHERE id = ? AND status = 'paid'`, [input.paymentId]);
      if (refunded.changes !== 1) return 'duplicate' as const;
      if (payment.payment_type === 'promotion') {
        await transaction.run(`UPDATE shop_boosts SET status = 'cancelled', reservation_expires_at = NULL
          WHERE payment_intent_id = ? AND status IN ('scheduled', 'active')`, [input.paymentId]);
      }
      await transaction.run(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
        VALUES ('system', 'geniuspay_refund_review', ?, ?, ?)`, [payment.shop_id, JSON.stringify({
        payment_id: input.paymentId,
        provider_reference: input.providerReference,
        payment_type: input.paymentType,
        amount: input.amount,
        action_required: input.paymentType === 'subscription' ? 'Review subscription entitlement; no automatic suspension applied.' : 'Boost cancelled after provider refund.',
      }), new Date().toISOString()]);
      return 'refunded' as const;
    }
    if (!['pending', 'expired'].includes(payment.status)) return 'mismatch' as const;
    const updated = await transaction.run(`UPDATE subscription_payment_intents SET status = ?
      WHERE id = ? AND status IN ('pending', 'expired')`, [input.status, input.paymentId]);
    if (updated.changes !== 1) return 'duplicate' as const;
    if (payment.payment_type === 'promotion') {
      await transaction.run(`UPDATE shop_boosts SET status = 'cancelled', reservation_expires_at = NULL
        WHERE payment_intent_id = ? AND status = 'pending_payment'`, [input.paymentId]);
    } else {
      const shop = await transaction.get<{
        subscription_status: string | null;
        selected_subscription_tier: string | null;
        trial_start: string | null;
        trial_end: string | null;
        subscription_expires_at: string | null;
      }>(`SELECT subscription_status, selected_subscription_tier, trial_start, trial_end, subscription_expires_at
        FROM shops WHERE id = ?`, [payment.shop_id]);
      const subscriptionState = shop
        ? getSubscriptionState({ ...shop, selected_subscription_tier: normalizeSubscriptionTier(shop.selected_subscription_tier) })
        : null;
      if (subscriptionState && ['past_due', 'suspended'].includes(subscriptionState.status)) {
        await transaction.run(`UPDATE shops SET subscription_status = ?
          WHERE id = ? AND subscription_status <> 'suspended'`, [subscriptionState.status, payment.shop_id]);
      }
    }
    return input.status as 'failed' | 'cancelled' | 'expired';
  });

  router.post('/shops/:id/subscription-payments', rateLimitPaymentCreation, requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const customerPhone = normalizeWhatsAppPhone(shop.whatsapp_number);
    if (!customerPhone) return res.status(409).json({ error: 'Mettez à jour le numéro de téléphone de la boutique avant de payer.' });
    await expireStaleSubscriptionIntents(shop.id);

    const apiKey = String(process.env.GENIUSPAY_API_KEY || '').trim();
    const apiSecret = String(process.env.GENIUSPAY_API_SECRET || '').trim();
    const webhookSecret = String(process.env.GENIUSPAY_WEBHOOK_SECRET || '').trim();
    const appUrl = String(process.env.APP_URL || '').trim();
    if (!apiKey || !apiSecret || !webhookSecret || !appUrl) {
      return res.status(503).json({ error: 'Le paiement GeniusPay n’est pas encore configuré.' });
    }
    const requestedTier = String(req.body?.tier || '');
    if (!['standard', 'premium', 'pro'].includes(requestedTier)) {
      return res.status(400).json({ error: 'Choisissez une formule valide.' });
    }
    const tier = normalizeSubscriptionTier(requestedTier);
    const subscriptionState = getSubscriptionState(shop);
    if (subscriptionState.manualOverrideActive && subscriptionState.status === 'suspended') {
      return res.status(409).json({
        error: 'Les droits de cette boutique sont suspendus temporairement par l’administration. Aucun paiement ne peut être lancé pendant cette suspension.',
        code: 'subscription_access_manually_suspended',
      });
    }
    if (shop.subscription_admin_suspended_at) {
      return res.status(409).json({
        error: 'L’accès à l’abonnement est suspendu par l’administration. Contactez le support avant de payer.',
        code: 'subscription_access_suspended',
      });
    }
    if (subscriptionState.upcomingPlan && tier !== subscriptionState.upcomingPlan) {
      return res.status(409).json({
        error: `Un changement vers la formule ${getSubscriptionPlanConfig(subscriptionState.upcomingPlan).label} est programmé pour la prochaine échéance.`,
        code: 'scheduled_subscription_tier_mismatch',
      });
    }
    const requestedTerm = req.body?.term;
    if (requestedTerm !== undefined && requestedTerm !== 'monthly' && requestedTerm !== 'annual') {
      return res.status(400).json({ error: 'Choisissez une durée valide.' });
    }
    const term: SubscriptionTerm = requestedTerm === 'annual' ? 'annual' : 'monthly';
    const settings = await dbGet<{ subscription_plan_prices: string }>(
      'SELECT subscription_plan_prices FROM platform_settings WHERE id = 1',
    );
    const prices = settings?.subscription_plan_prices
      ? parseSubscriptionPrices(settings.subscription_plan_prices)
      : getDefaultSubscriptionPrices();
    const amount = getSubscriptionPriceForTerm(prices, tier, term);
    const clientRequestId = typeof req.body?.client_request_id === 'string'
      ? req.body.client_request_id.trim()
      : '';
    if (clientRequestId && (clientRequestId.length < 1 || clientRequestId.length > 255)) {
      return res.status(400).json({ error: 'Le client_request_id est trop long ou invalide.' });
    }
    const billingEmail = await resolveBillingEmail(shop.id, shop.owner_email, req.body?.billing_email);
    if ('error' in billingEmail) {
      return res.status(billingEmail.error.status).json({ error: billingEmail.error.message, code: billingEmail.error.code });
    }
    const paymentId = randomUUID();
    const createdAt = new Date().toISOString();
    const inserted = await dbRun(`INSERT INTO subscription_payment_intents (id, shop_id, payment_type, tier, subscription_term, amount, currency, client_request_id, status, created_at)
      VALUES (?, ?, 'subscription', ?, ?, ?, 'XOF', ?, 'pending', ?)
      ON CONFLICT DO NOTHING`, [paymentId, shop.id, tier, term, amount, clientRequestId || null, createdAt]);
    const duplicate = inserted.changes !== 1;
    const intent = duplicate
      ? await dbGet<SubscriptionPaymentIntent>(
        'SELECT * FROM subscription_payment_intents WHERE shop_id = ? AND client_request_id = ?',
        [shop.id, clientRequestId],
      )
      : {
        id: paymentId,
        shop_id: shop.id,
        payment_type: 'subscription' as const,
        tier,
        subscription_term: term,
        amount,
        currency: 'XOF',
        status: 'pending' as const,
        provider_reference: null,
        created_at: createdAt,
        paid_at: null,
      };
    if (!intent) throw new Error('Idempotent GeniusPay payment intent could not be loaded after insertion.');
    if (intent.tier !== tier || intent.subscription_term !== term) {
      return res.status(409).json({ error: 'Cette clé de requête a déjà été utilisée pour une autre formule ou durée.' });
    }
    if (duplicate && intent.status !== 'pending') {
      return res.status(409).json({ error: 'Cette demande de paiement est déjà terminée ou expirée. Relancez le paiement pour créer une nouvelle demande.' });
    }

    let checkout = intent.provider_checkout_url && intent.provider_reference
      ? { reference: intent.provider_reference, checkoutUrl: intent.provider_checkout_url }
      : null;
    if (!checkout) {
      try {
        checkout = await createGeniusPayCheckout({
          amount: intent.amount,
          description: `Abonnement ${getSubscriptionPlanConfig(intent.tier).label} (${intent.subscription_term === 'annual' ? 'annuel' : 'mensuel'}) MaTable.ci`,
          customer: { name: shop.name, email: billingEmail.email, phone: customerPhone, country: 'CI' },
          success_url: new URL(`/app?payment_id=${encodeURIComponent(intent.id)}`, appUrl).toString(),
          error_url: new URL(`/app?payment_id=${encodeURIComponent(intent.id)}`, appUrl).toString(),
          metadata: { subscription_payment_id: intent.id, payment_type: 'subscription' },
        });
        await dbRun('UPDATE subscription_payment_intents SET provider_reference = ?, provider_checkout_url = ? WHERE id = ? AND status = ?',
          [checkout.reference, checkout.checkoutUrl, intent.id, 'pending']);
      } catch (error) {
        const message = error instanceof GeniusPayApiError ? error.message : 'Impossible de préparer le paiement GeniusPay.';
        if (!(error instanceof GeniusPayApiError)) console.error('GeniusPay subscription checkout preparation failed.', error);
        return res.status(502).json({ error: message, payment_id: intent.id });
      }
    }

    res.status(duplicate ? 200 : 201).json({
      payment_id: intent.id,
      checkout_url: checkout.checkoutUrl,
      amount: intent.amount,
      currency: intent.currency,
      plan_label: getSubscriptionPlanConfig(intent.tier).label,
      term: intent.subscription_term,
      ...(duplicate ? { duplicate: true } : {}),
    });
  });

  router.post('/shops/:id/boost-payments', rateLimitPaymentCreation, requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const customerPhone = normalizeWhatsAppPhone(shop.whatsapp_number);
    if (!customerPhone) return res.status(409).json({ error: 'Mettez à jour le numéro de téléphone de la boutique avant d’acheter un boost.' });
    const apiKey = String(process.env.GENIUSPAY_API_KEY || '').trim();
    const apiSecret = String(process.env.GENIUSPAY_API_SECRET || '').trim();
    const webhookSecret = String(process.env.GENIUSPAY_WEBHOOK_SECRET || '').trim();
    const appUrl = String(process.env.APP_URL || '').trim();
    if (!apiKey || !apiSecret || !webhookSecret || !appUrl) {
      return res.status(503).json({ error: 'Le paiement GeniusPay n’est pas encore configuré.' });
    }
    const durationDays = Number(req.body?.duration_days);
    if (!BOOST_DURATIONS_DAYS.some((duration) => duration === durationDays)) {
      return res.status(400).json({ error: 'Choisissez une durée de boost valide.' });
    }
    const placement = req.body?.placement === undefined ? 'category' : req.body.placement;
    if (!BOOST_PLACEMENTS.some((validPlacement) => validPlacement === placement)) {
      return res.status(400).json({ error: 'Choisissez un emplacement de boost valide.' });
    }
    const billingEmail = await resolveBillingEmail(shop.id, shop.owner_email, req.body?.billing_email);
    if ('error' in billingEmail) {
      return res.status(billingEmail.error.status).json({ error: billingEmail.error.message, code: billingEmail.error.code });
    }

    const paymentId = randomUUID();
    const boostId = randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const reserveUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const reservation = await dbTransaction(async (transaction) => {
      const shopRow = await transaction.get<Record<string, unknown>>(`SELECT shops.*, platform_settings.subscription_plan_features
        FROM shops LEFT JOIN platform_settings ON platform_settings.id = 1 WHERE shops.id = ?`, [shop.id]);
      if (!shopRow) return { error: 'Boutique introuvable.' } as const;
      const transactionShop = mapShopRow(shopRow);
      if (!transactionShop.is_active || !transactionShop.is_open || !computeIsShopOpen(transactionShop)) {
        return { error: 'La boutique doit être active et ouverte pour acheter un boost.' } as const;
      }
      if (transactionShop.merchant_verification_status !== 'verified') {
        return { error: 'La vérification du commerçant doit être validée avant d’acheter un boost.' } as const;
      }
      const city = String(transactionShop.city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      if (!city) return { error: 'Renseignez la ville de la boutique avant d’acheter un boost.' } as const;
      const category = String(transactionShop.category).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const capacityScope = getBoostCapacityScope(placement, city, category);
      if (databaseMode === 'postgresql') await transaction.get('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [capacityScope.lockKey]);
      const productCount = await transaction.get<{ product_count: number | string }>(
        'SELECT COUNT(*) AS product_count FROM products WHERE shop_id = ?',
        [shop.id],
      );
      if (Number(productCount?.product_count || 0) < BOOST_MINIMUM_PRODUCT_COUNT) {
        return { error: `Ajoutez au moins ${BOOST_MINIMUM_PRODUCT_COUNT} produits au catalogue avant d’acheter un boost.` } as const;
      }

      const currentSubscription = getSubscriptionState(transactionShop, now);
      const discountPercent = currentSubscription.isActive && currentSubscription.plan === 'pro'
        ? currentSubscription.planFeatures.boostDiscountPercent
        : 0;
      const price = getBoostPrice(durationDays, discountPercent);
      if (price === null) return { error: 'Choisissez une durée de boost valide.' } as const;
      const intervals = await transaction.all<{ starts_at: string; ends_at: string }>(
        `SELECT starts_at, ends_at FROM shop_boosts
          WHERE ${capacityScope.where}
            AND (status IN ('scheduled', 'active')
              OR (status = 'pending_payment' AND reservation_expires_at > ?))`,
        [...capacityScope.params, createdAt],
      );
      const startsAt = findEarliestBoostStart(intervals, durationDays, now, MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE);
      const endsAt = new Date(startsAt.getTime() + durationDays * 86400000);
      await transaction.run(`INSERT INTO subscription_payment_intents
        (id, shop_id, payment_type, tier, subscription_term, amount, currency, status, created_at)
        VALUES (?, ?, 'promotion', 'standard', 'monthly', ?, 'XOF', 'pending', ?)`,
      [paymentId, shop.id, price, createdAt]);
      await transaction.run(`INSERT INTO shop_boosts
        (id, shop_id, payment_intent_id, city, category, placement, starts_at, ends_at, status, reservation_expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`,
      [boostId, shop.id, paymentId, city, category, placement, startsAt.toISOString(), endsAt.toISOString(), reserveUntil, createdAt]);
      return { price, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } as const;
    });
    if ('error' in reservation) {
      const status = reservation.error === 'Boutique introuvable.' ? 404 : 409;
      return res.status(status).json({ error: reservation.error });
    }
    let checkout: { reference: string; checkoutUrl: string };
    try {
      checkout = await createGeniusPayCheckout({
        amount: reservation.price,
        description: `Boost MaTable.ci (${durationDays} jour${durationDays > 1 ? 's' : ''})`,
        customer: { name: shop.name, email: billingEmail.email, phone: customerPhone, country: 'CI' },
        success_url: new URL(`/app?payment_id=${encodeURIComponent(paymentId)}`, appUrl).toString(),
        error_url: new URL(`/app?payment_id=${encodeURIComponent(paymentId)}`, appUrl).toString(),
        metadata: { subscription_payment_id: paymentId, payment_type: 'promotion' },
      });
      await dbRun('UPDATE subscription_payment_intents SET provider_reference = ?, provider_checkout_url = ? WHERE id = ? AND status = ?',
        [checkout.reference, checkout.checkoutUrl, paymentId, 'pending']);
    } catch (error) {
      const message = error instanceof GeniusPayApiError ? error.message : 'Impossible de préparer le paiement GeniusPay.';
      if (!(error instanceof GeniusPayApiError)) console.error('GeniusPay boost checkout preparation failed.', error);
      return res.status(502).json({ error: message, payment_id: paymentId });
    }
    res.status(201).json({
      payment_id: paymentId,
      checkout_url: checkout.checkoutUrl,
      amount: reservation.price,
      currency: 'XOF',
      boost_id: boostId,
      duration_days: durationDays,
      placement,
      starts_at: reservation.startsAt,
      ends_at: reservation.endsAt,
      scheduled: Date.parse(reservation.startsAt) > now.getTime(),
      max_simultaneous: MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
    });
  });

  router.get('/shops/:id/subscription-payments/:paymentId', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    await expireStaleSubscriptionIntents(shop.id);
    let payment = await dbGet<SubscriptionPaymentIntent>(
      'SELECT * FROM subscription_payment_intents WHERE id = ? AND shop_id = ?',
      [String(req.params.paymentId), shop.id],
    );
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable.' });
    if (['pending', 'expired'].includes(payment.status) && payment.provider_reference) {
      try {
        await reconcilePayment(payment, 30_000);
        payment = await dbGet<SubscriptionPaymentIntent>(
          'SELECT * FROM subscription_payment_intents WHERE id = ? AND shop_id = ?',
          [String(req.params.paymentId), shop.id],
        ) || payment;
      } catch (error) {
        console.warn(`GeniusPay status reconciliation failed for payment ${payment.id}.`, error);
      }
    }
    const boost = payment.payment_type === 'promotion'
      ? await dbGet('SELECT starts_at, ends_at, status, placement FROM shop_boosts WHERE payment_intent_id = ?', [payment.id])
      : undefined;
    res.json({ status: payment.status, payment_type: payment.payment_type, subscription: getSubscriptionState(shop), boost });
  });

  router.get('/shops/:id/boosts', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const boosts = await dbAll<{
      id: string;
      starts_at: string;
      ends_at: string;
      status: string;
      amount: number;
      placement: string;
      views: number;
      whatsapp_clicks: number;
    }>(`SELECT b.id, b.starts_at, b.ends_at, b.status, p.amount
      , b.placement,
      (SELECT COUNT(*) FROM analytics_events a WHERE a.shop_id = b.shop_id
        AND a.event_type = 'page_view' AND a.created_at >= b.starts_at AND a.created_at < b.ends_at) AS views,
      (SELECT COUNT(*) FROM order_whatsapp_tracking t JOIN orders o ON o.id = t.order_id
        WHERE o.shop_id = b.shop_id AND t.clicked_at >= b.starts_at AND t.clicked_at < b.ends_at) AS whatsapp_clicks
      FROM shop_boosts b
      JOIN subscription_payment_intents p ON p.id = b.payment_intent_id
      WHERE b.shop_id = ? AND b.status IN ('scheduled', 'active')
      ORDER BY b.starts_at DESC LIMIT 20`, [shop.id]);
    res.json({
      boosts: boosts.map((boost) => ({
        ...boost,
        amount: Number(boost.amount),
        views: Number(boost.views || 0),
        whatsapp_clicks: Number(boost.whatsapp_clicks || 0),
      })),
    });
  });

  router.post('/webhooks/geniuspay', rateLimitWebhook, async (req: Request, res) => {
    const webhookSecret = String(process.env.GENIUSPAY_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) return res.status(503).json({ error: 'Webhook GeniusPay non configuré.' });
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = String(req.header('x-webhook-signature') || '').trim();
    const timestamp = String(req.header('x-webhook-timestamp') || '').trim();
    if (!rawBody || !isValidGeniusPaySignature(rawBody, signature, timestamp, webhookSecret)) {
      return res.status(401).json({ error: 'Signature GeniusPay invalide ou horodatage expiré.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Corps du webhook GeniusPay invalide.' });
    }
    const event = req.body as {
      id?: string;
      event?: string;
      data?: {
        transaction?: {
          status?: string;
          reference?: string;
          amount?: number | string;
          amount_refunded?: number | string;
          currency?: string;
          metadata?: { subscription_payment_id?: string; payment_type?: string };
        };
        status?: string;
        reference?: string;
        amount?: number | string;
        amount_refunded?: number | string;
        currency?: string;
        metadata?: { subscription_payment_id?: string; payment_type?: string };
      };
    };
    const webhookEvent = String(req.header('x-webhook-event') || event.event || '');
    const paymentData = event.data?.transaction || event.data;
    const paymentId = String(paymentData?.metadata?.subscription_payment_id || '');
    const providerReference = String(paymentData?.reference || '');
    const eventId = typeof event.id === 'string' && event.id.length > 0 && event.id.length <= 255
      ? event.id
      : createHash('sha256').update(rawBody).digest('hex');
    const duplicateEvent = await beginWebhookEvent({
      eventId,
      eventType: webhookEvent || 'unknown',
      paymentId: paymentId || null,
      providerReference: providerReference || null,
      payloadSha256: createHash('sha256').update(rawBody).digest('hex'),
    });
    if (duplicateEvent === 'payload_conflict') {
      await recordPaymentIncident(paymentId, 'geniuspay_webhook_id_conflict', {
        event_id: eventId,
        event_type: webhookEvent,
        provider_reference: providerReference || null,
        payload_sha256: createHash('sha256').update(rawBody).digest('hex'),
      });
      return res.json({ received: true, rejected: true });
    }
    if (duplicateEvent) return res.json({ received: true, duplicate: true });
    if (event.event && webhookEvent !== event.event) {
      await finishWebhookEvent(eventId, 'rejected', 'event_header_mismatch');
      return res.json({ received: true });
    }
    const isSuccessEvent = webhookEvent === 'payment.success' && paymentData?.status === 'completed';
    const failureStatusByEvent: Record<string, 'failed' | 'cancelled' | 'expired' | 'refunded'> = {
      'payment.failed': 'failed',
      'payment.cancelled': 'cancelled',
      'payment.expired': 'expired',
      'payment.refunded': 'refunded',
    };
    const failedStatus = failureStatusByEvent[webhookEvent];
    if (!isSuccessEvent && !failedStatus) {
      await finishWebhookEvent(eventId, 'ignored', 'unsupported_event');
      return res.status(200).json({ received: true });
    }
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      await finishWebhookEvent(eventId, 'rejected', 'invalid_payment_data');
      return res.json({ received: true });
    }
    if (failedStatus && paymentData?.status !== failedStatus) {
      await finishWebhookEvent(eventId, 'ignored', 'event_status_mismatch');
      return res.status(200).json({ received: true });
    }

    const amount = Number(paymentData?.amount);
    if (!paymentId || !providerReference || !Number.isSafeInteger(amount)) {
      await finishWebhookEvent(eventId, 'rejected', 'missing_payment_fields');
      return res.json({ received: true });
    }
    if (paymentData?.currency !== 'XOF') {
      if (paymentId) await recordPaymentIncident(paymentId, 'geniuspay_webhook_review', {
        event_id: eventId,
        event_type: webhookEvent,
        result: 'unexpected_currency',
        currency: paymentData?.currency || null,
      });
      await finishWebhookEvent(eventId, 'rejected', 'unexpected_currency');
      return res.json({ received: true });
    }
    const metadataType = paymentData?.metadata?.payment_type;
    if (!metadataType || !['subscription', 'promotion'].includes(metadataType)) {
      if (paymentId) await recordPaymentIncident(paymentId, 'geniuspay_webhook_review', {
        event_id: eventId,
        event_type: webhookEvent,
        result: 'invalid_payment_type',
        payment_type: metadataType || null,
      });
      await finishWebhookEvent(eventId, 'rejected', 'invalid_payment_type');
      return res.json({ received: true });
    }
    await expireStaleSubscriptionIntents();

    if (failedStatus) {
      const result = await applyProviderStatus({
        paymentId,
        providerReference,
        amount,
        paymentType: metadataType as 'subscription' | 'promotion',
        status: failedStatus,
        ...(failedStatus === 'refunded' && paymentData.amount_refunded !== undefined
          ? { refundedAmount: Number(paymentData.amount_refunded) }
          : {}),
      });
      if (result === 'reference_pending') {
        await finishWebhookEvent(eventId, 'retryable', 'reference_pending');
        return res.status(503).json({ error: 'La référence de paiement est en cours d’enregistrement. GeniusPay peut réessayer le webhook.' });
      }
      if (['not_found', 'mismatch', 'reference_mismatch', 'reference_conflict'].includes(result)) {
        if (result !== 'not_found') {
          await recordPaymentIncident(paymentId, 'geniuspay_webhook_review', {
            event_id: eventId,
            event_type: webhookEvent,
            result,
            provider_reference: providerReference,
            amount,
          });
        }
        await finishWebhookEvent(eventId, 'rejected', result);
        return res.json({ received: true, rejected: true, reason: result });
      }
      await finishWebhookEvent(eventId, 'processed', result);
      return res.json({ received: true, duplicate: result === 'duplicate' });
    }

    const result = await applySuccessfulPayment({
      paymentId,
      providerReference,
      amount,
      paymentType: metadataType as 'subscription' | 'promotion',
    });

    if (result.status === 'reference_pending') {
      await finishWebhookEvent(eventId, 'retryable', 'reference_pending');
      return res.status(503).json({ error: 'La référence de paiement est en cours d’enregistrement. GeniusPay peut réessayer le webhook.' });
    }
    if (['not_found', 'mismatch', 'reference_mismatch', 'reference_conflict'].includes(result.status)) {
      if (result.status !== 'not_found') {
        await recordPaymentIncident(paymentId, 'geniuspay_webhook_review', {
          event_id: eventId,
          event_type: webhookEvent,
          result: result.status,
          provider_reference: providerReference,
          amount,
        });
      }
      await finishWebhookEvent(eventId, 'rejected', result.status);
      return res.json({ received: true, rejected: true, reason: result.status });
    }
    await sendPaymentReceipt(result);
    await finishWebhookEvent(eventId, 'processed', result.status);
    res.json({ received: true, duplicate: result.status === 'duplicate' });
  });

  return Object.assign(router, { reconcilePendingPayments }) as GeniusPayRouter;
}
