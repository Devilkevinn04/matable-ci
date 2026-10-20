import { randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { computeIsShopOpen, getSubscriptionPlanConfig, getSubscriptionState, normalizeSubscriptionTier } from '../services/businessRules.ts';
import { getRenewedSubscriptionExpiry, isValidKadevPaySignature } from '../services/kadevPay.ts';
import type { ShopRecord, SubscriptionTier } from '../types.ts';
import { getSubscriptionPrice, type SubscriptionTerm } from '../../src/utils/subscriptionFeatures.ts';
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

interface KadevPayRouterOptions {
  shops: ShopRecord[];
  requireMerchantOwnShop: RequestHandler;
}

interface SubscriptionPaymentIntent {
  id: string;
  shop_id: number;
  payment_type: 'subscription' | 'promotion';
  tier: SubscriptionTier;
  subscription_term: SubscriptionTerm;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  provider_reference: string | null;
  created_at: string;
  paid_at: string | null;
}

export function createKadevPayRouter({ requireMerchantOwnShop }: KadevPayRouterOptions) {
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

  router.post('/shops/:id/subscription-payments', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    await expireStaleSubscriptionIntents(shop.id);

    const publicKey = String(process.env.KADEVPAY_PUBLIC_KEY || '').trim();
    const webhookSecret = String(process.env.KADEVPAY_WEBHOOK_SECRET || '').trim();
    if (!publicKey || !webhookSecret) {
      return res.status(503).json({ error: 'Le paiement KadevPay n’est pas encore configuré.' });
    }
    const requestedTier = String(req.body?.tier || '');
    if (!['standard', 'premium', 'pro'].includes(requestedTier)) {
      return res.status(400).json({ error: 'Choisissez une formule valide.' });
    }
    const tier = normalizeSubscriptionTier(requestedTier);
    const requestedTerm = req.body?.term;
    if (requestedTerm !== undefined && requestedTerm !== 'monthly' && requestedTerm !== 'annual') {
      return res.status(400).json({ error: 'Choisissez une durée valide.' });
    }
    const term: SubscriptionTerm = requestedTerm === 'annual' ? 'annual' : 'monthly';
    const amount = getSubscriptionPrice(tier, term);
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
    if (!intent) throw new Error('Idempotent KadevPay payment intent could not be loaded after insertion.');
    if (intent.tier !== tier || intent.subscription_term !== term) {
      return res.status(409).json({ error: 'Cette clé de requête a déjà été utilisée pour une autre formule ou durée.' });
    }
    if (duplicate && intent.status !== 'pending') {
      return res.status(409).json({ error: 'Cette demande de paiement est déjà terminée ou expirée. Relancez le paiement pour créer une nouvelle demande.' });
    }

    res.status(duplicate ? 200 : 201).json({
      payment_id: intent.id,
      public_key: publicKey,
      amount: intent.amount,
      currency: intent.currency,
      is_test: publicKey.startsWith('kdvp_test_'),
      email: billingEmail.email,
      name: shop.name,
      phone: shop.whatsapp_number,
      plan_label: getSubscriptionPlanConfig(intent.tier).label,
      term: intent.subscription_term,
      ...(duplicate ? { duplicate: true } : {}),
    });
  });

  router.post('/shops/:id/boost-payments', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const publicKey = String(process.env.KADEVPAY_PUBLIC_KEY || '').trim();
    const webhookSecret = String(process.env.KADEVPAY_WEBHOOK_SECRET || '').trim();
    if (!publicKey || !webhookSecret) {
      return res.status(503).json({ error: 'Le paiement KadevPay n’est pas encore configuré.' });
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
      const shopRow = await transaction.get<Record<string, unknown>>('SELECT * FROM shops WHERE id = ?', [shop.id]);
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
      const price = getBoostPrice(durationDays, currentSubscription.isActive && currentSubscription.plan === 'pro');
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
    res.status(201).json({
      payment_id: paymentId,
      public_key: publicKey,
      amount: reservation.price,
      currency: 'XOF',
      is_test: publicKey.startsWith('kdvp_test_'),
      email: billingEmail.email,
      name: shop.name,
      phone: shop.whatsapp_number,
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
    const payment = await dbGet<SubscriptionPaymentIntent>(
      'SELECT * FROM subscription_payment_intents WHERE id = ? AND shop_id = ?',
      [String(req.params.paymentId), shop.id],
    );
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable.' });
    const boost = payment.payment_type === 'promotion'
      ? await dbGet('SELECT starts_at, ends_at, status, placement FROM shop_boosts WHERE payment_intent_id = ?', [payment.id])
      : undefined;
    res.json({ status: payment.status, subscription: getSubscriptionState(shop), boost });
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

  router.post('/webhooks/kadevpay', async (req: Request, res) => {
    const webhookSecret = String(process.env.KADEVPAY_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) return res.status(503).json({ error: 'Webhook KadevPay non configuré.' });
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = String(req.header('x-kadevpay-signature') || '').trim();
    if (!rawBody || !isValidKadevPaySignature(rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Signature KadevPay invalide.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Corps du webhook KadevPay invalide.' });
    }
    const event = req.body as {
      event?: string;
      data?: {
        status?: string;
        reference?: string;
        amount?: number | string;
        currency?: string;
        metadata?: { subscription_payment_id?: string };
      };
    };
    const isPaymentEvent = event.event === 'payment.success' || event.event === 'payment.failed';
    if (!isPaymentEvent) {
      return res.status(200).json({ received: true });
    }
    if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
      return res.status(400).json({ error: 'Données de paiement incomplètes.' });
    }
    const isSuccessfulPayment = event.event === 'payment.success' && event.data.status === 'paid';
    const isFailedPayment = event.event === 'payment.failed' && event.data.status === 'failed';
    if (!isSuccessfulPayment && !isFailedPayment) return res.status(200).json({ received: true });

    const paymentId = String(event.data.metadata?.subscription_payment_id || '');
    const providerReference = String(event.data.reference || '');
    const amount = Number(event.data.amount);
    if (!paymentId || !providerReference || !Number.isSafeInteger(amount)) {
      return res.status(400).json({ error: 'Données de paiement incomplètes.' });
    }
    if (event.data.currency !== undefined && event.data.currency !== 'XOF') {
      return res.status(400).json({ error: 'Devise de paiement inattendue.' });
    }
    await expireStaleSubscriptionIntents();

    if (isFailedPayment) {
      const result = await dbTransaction(async (transaction) => {
        const payment = await transaction.get<{ status: string; amount: number; payment_type: string; shop_id: number; created_at: string }>(
          'SELECT status, amount, payment_type, shop_id, created_at FROM subscription_payment_intents WHERE id = ?',
          [paymentId],
        );
        if (!payment) return 'not_found' as const;
        if (payment.status === 'failed') return 'duplicate' as const;
        if (payment.status === 'expired') return 'expired' as const;
        if (payment.payment_type === 'subscription'
          && Date.parse(payment.created_at) <= Date.now() - subscriptionIntentLifetimeMs) {
          await transaction.run(`UPDATE subscription_payment_intents SET status = 'expired'
            WHERE id = ? AND status = 'pending'`, [paymentId]);
          return 'expired' as const;
        }
        if (payment.status !== 'pending' || Number(payment.amount) !== amount) return 'mismatch' as const;
        const referenceOwner = await transaction.get<{ id: string }>(
          'SELECT id FROM subscription_payment_intents WHERE provider_reference = ? AND id <> ?',
          [providerReference, paymentId],
        );
        if (referenceOwner) return 'reference_conflict' as const;
        const failed = await transaction.run(`UPDATE subscription_payment_intents
          SET status = 'failed', provider_reference = ?
          WHERE id = ? AND status = 'pending'`, [providerReference, paymentId]);
        if (failed.changes === 1 && payment.payment_type === 'promotion') {
          await transaction.run(`UPDATE shop_boosts SET status = 'cancelled', reservation_expires_at = NULL
            WHERE payment_intent_id = ? AND status = 'pending_payment'`, [paymentId]);
        } else if (failed.changes === 1 && payment.payment_type === 'subscription') {
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
        return failed.changes === 1 ? 'failed' as const : 'duplicate' as const;
      });
      if (result === 'not_found') return res.status(404).json({ error: 'Intention de paiement introuvable.' });
      if (result === 'expired') return res.status(409).json({ error: 'Cette intention de paiement a expiré. Créez une nouvelle demande.' });
      if (result === 'mismatch') return res.status(409).json({ error: 'Le paiement échoué ne correspond pas à une intention en attente.' });
      if (result === 'reference_conflict') return res.status(409).json({ error: 'Cette référence KadevPay est déjà associée à un autre paiement.' });
      return res.json({ received: true, duplicate: result === 'duplicate' });
    }

    const now = new Date();
    const result = await dbTransaction(async (transaction) => {
      const payment = await transaction.get<SubscriptionPaymentIntent>(
        'SELECT * FROM subscription_payment_intents WHERE id = ?',
        [paymentId],
      );
      if (!payment) return { status: 'not_found' as const };
      if (payment.status === 'paid') return { status: 'duplicate' as const };
      if (payment.status === 'expired') return { status: 'expired' as const };
      if (payment.payment_type === 'subscription'
        && Date.parse(payment.created_at) <= now.getTime() - subscriptionIntentLifetimeMs) {
        await transaction.run(`UPDATE subscription_payment_intents SET status = 'expired'
          WHERE id = ? AND status = 'pending'`, [paymentId]);
        return { status: 'expired' as const };
      }
      if (payment.status !== 'pending' || Number(payment.amount) !== amount) return { status: 'mismatch' as const };
      const referenceOwner = await transaction.get<{ id: string }>(
        'SELECT id FROM subscription_payment_intents WHERE provider_reference = ? AND id <> ?',
        [providerReference, paymentId],
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
        if (!boost) return { status: 'not_found' as const };
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
          WHERE id = ? AND status = 'pending'`, [providerReference, paidAt, payment.id]);
        if (paid.changes !== 1) return { status: 'duplicate' as const };
        const activated = await transaction.run(`UPDATE shop_boosts
          SET starts_at = ?, ends_at = ?, status = ?, reservation_expires_at = NULL
          WHERE id = ? AND status = 'pending_payment'`,
        [new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), startsAt <= now.getTime() ? 'active' : 'scheduled', boost.id]);
        if (activated.changes !== 1) throw new Error('Boost reservation disappeared while applying a KadevPay payment.');
        return { status: 'boost_paid' as const };
      }

      const shopRecord = await transaction.get<{
        name: string;
        owner_email: string | null;
        subscription_expires_at: string | null;
      }>(
        'SELECT name, owner_email, subscription_expires_at FROM shops WHERE id = ?',
        [payment.shop_id],
      );
      if (!shopRecord) return { status: 'not_found' as const };
      const expiresAt = getRenewedSubscriptionExpiry(shopRecord.subscription_expires_at, now, payment.subscription_term);
      const paidAt = now.toISOString();
      const paid = await transaction.run(`UPDATE subscription_payment_intents
        SET status = 'paid', provider_reference = ?, paid_at = ?
        WHERE id = ? AND status = 'pending'`, [providerReference, paidAt, payment.id]);
      if (paid.changes !== 1) return { status: 'duplicate' as const };
      const updatedShop = await transaction.run(`UPDATE shops
        SET subscription_status = 'active', selected_subscription_tier = ?, subscription_tier = ?, subscription_expires_at = ?, last_notification_sent_at = NULL
        WHERE id = ?`, [payment.tier, payment.tier, expiresAt, payment.shop_id]);
      if (updatedShop.changes !== 1) throw new Error('Shop disappeared while applying a KadevPay payment.');
      return {
        status: 'paid' as const,
        shopId: payment.shop_id,
        tier: payment.tier,
        expiresAt,
        receipt: {
          shopName: shopRecord.name,
          ownerEmail: shopRecord.owner_email,
          paymentId: payment.id,
          providerReference,
          tierLabel: getSubscriptionPlanConfig(payment.tier).label,
          term: payment.subscription_term,
          amount: payment.amount,
          currency: payment.currency,
          paidAt,
        },
      };
    });

    if (result.status === 'not_found') return res.status(404).json({ error: 'Intention de paiement introuvable.' });
    if (result.status === 'expired') return res.status(409).json({ error: 'Cette intention de paiement a expiré. Créez une nouvelle demande.' });
    if (result.status === 'mismatch') return res.status(409).json({ error: 'Le montant payé ne correspond pas au montant attendu.' });
    if (result.status === 'reference_conflict') return res.status(409).json({ error: 'Cette référence KadevPay est déjà associée à un autre paiement.' });
    if (result.status === 'paid' && result.receipt.ownerEmail) {
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
    }
    res.json({ received: true, duplicate: result.status === 'duplicate' });
  });

  return router;
}
