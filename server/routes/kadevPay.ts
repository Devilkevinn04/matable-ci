import { randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { dbGet, dbRun, dbTransaction } from '../../db.ts';
import { getSubscriptionPlanConfig, getSubscriptionState, normalizeSubscriptionTier } from '../services/businessRules.ts';
import { getRenewedSubscriptionExpiry, isValidKadevPaySignature } from '../services/kadevPay.ts';
import type { ShopRecord, SubscriptionTier } from '../types.ts';

interface KadevPayRouterOptions {
  shops: ShopRecord[];
  requireMerchantOwnShop: RequestHandler;
}

interface SubscriptionPaymentIntent {
  id: string;
  shop_id: number;
  payment_type: 'subscription' | 'promotion';
  tier: SubscriptionTier;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  provider_reference: string | null;
  created_at: string;
  paid_at: string | null;
}

export function createKadevPayRouter({ shops, requireMerchantOwnShop }: KadevPayRouterOptions) {
  const router = Router();

  router.post('/shops/:id/subscription-payments', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const publicKey = String(process.env.KADEVPAY_PUBLIC_KEY || '').trim();
    const webhookSecret = String(process.env.KADEVPAY_WEBHOOK_SECRET || '').trim();
    if (!publicKey || !webhookSecret) {
      return res.status(503).json({ error: 'Le paiement KadevPay n’est pas encore configuré.' });
    }
    if (!shop.owner_email) return res.status(409).json({ error: 'Ajoutez un e-mail à la boutique avant de renouveler l’abonnement.' });

    const requestedTier = String(req.body?.tier || '');
    if (!['standard', 'premium', 'pro'].includes(requestedTier)) {
      return res.status(400).json({ error: 'Choisissez une formule valide.' });
    }
    const tier = normalizeSubscriptionTier(requestedTier);
    const plan = getSubscriptionPlanConfig(tier);
    const paymentId = randomUUID();
    const createdAt = new Date().toISOString();
    await dbRun(`INSERT INTO subscription_payment_intents (id, shop_id, payment_type, tier, amount, currency, status, created_at)
      VALUES (?, ?, 'subscription', ?, ?, 'XOF', 'pending', ?)`, [paymentId, shop.id, tier, plan.amount, createdAt]);

    res.status(201).json({
      payment_id: paymentId,
      public_key: publicKey,
      amount: plan.amount,
      currency: 'XOF',
      is_test: publicKey.startsWith('kdvp_test_'),
      email: shop.owner_email,
      name: shop.name,
      phone: shop.whatsapp_number,
      plan_label: plan.label,
    });
  });

  router.get('/shops/:id/subscription-payments/:paymentId', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const payment = await dbGet<SubscriptionPaymentIntent>(
      'SELECT * FROM subscription_payment_intents WHERE id = ? AND shop_id = ?',
      [String(req.params.paymentId), shop.id],
    );
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable.' });
    res.json({ status: payment.status, subscription: getSubscriptionState(shop) });
  });

  router.post('/webhooks/kadevpay', async (req: Request, res) => {
    const webhookSecret = String(process.env.KADEVPAY_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) return res.status(503).json({ error: 'Webhook KadevPay non configuré.' });
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = String(req.header('x-kadevpay-signature') || '').trim();
    if (!rawBody || !isValidKadevPaySignature(rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Signature KadevPay invalide.' });
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
    if (event.event !== 'payment.success' || event.data?.status !== 'paid') {
      return res.status(200).json({ received: true });
    }

    const paymentId = String(event.data.metadata?.subscription_payment_id || '');
    const providerReference = String(event.data.reference || '');
    const amount = Number(event.data.amount);
    if (!paymentId || !providerReference || !Number.isSafeInteger(amount)) {
      return res.status(400).json({ error: 'Données de paiement incomplètes.' });
    }
    if (event.data.currency && event.data.currency !== 'XOF') {
      return res.status(400).json({ error: 'Devise de paiement inattendue.' });
    }

    const now = new Date();
    const result = await dbTransaction(async (transaction) => {
      const payment = await transaction.get<SubscriptionPaymentIntent>(
        'SELECT * FROM subscription_payment_intents WHERE id = ?',
        [paymentId],
      );
      if (!payment) return { status: 'not_found' as const };
      if (payment.status === 'paid') return { status: 'duplicate' as const };
      if (payment.status !== 'pending' || Number(payment.amount) !== amount) return { status: 'mismatch' as const };

      const shopRecord = await transaction.get<{ subscription_expires_at: string | null }>(
        'SELECT subscription_expires_at FROM shops WHERE id = ?',
        [payment.shop_id],
      );
      if (!shopRecord) return { status: 'not_found' as const };
      const expiresAt = getRenewedSubscriptionExpiry(shopRecord.subscription_expires_at, now);
      const paidAt = now.toISOString();
      const paid = await transaction.run(`UPDATE subscription_payment_intents
        SET status = 'paid', provider_reference = ?, paid_at = ?
        WHERE id = ? AND status = 'pending'`, [providerReference, paidAt, payment.id]);
      if (paid.changes !== 1) return { status: 'duplicate' as const };
      const updatedShop = await transaction.run(`UPDATE shops
        SET subscription_status = 'active', selected_subscription_tier = ?, subscription_tier = ?, subscription_expires_at = ?
        WHERE id = ?`, [payment.tier, payment.tier, expiresAt, payment.shop_id]);
      if (updatedShop.changes !== 1) throw new Error('Shop disappeared while applying a KadevPay payment.');
      return { status: 'paid' as const, shopId: payment.shop_id, tier: payment.tier, expiresAt };
    });

    if (result.status === 'not_found') return res.status(404).json({ error: 'Intention de paiement introuvable.' });
    if (result.status === 'mismatch') return res.status(409).json({ error: 'Le montant payé ne correspond pas au montant attendu.' });
    if (result.status === 'paid') {
      const shop = shops.find((candidate) => candidate.id === result.shopId);
      if (shop) {
        shop.subscription_status = 'active';
        shop.selected_subscription_tier = result.tier;
        shop.subscription_expires_at = result.expiresAt;
      }
    }
    res.json({ received: true, duplicate: result.status === 'duplicate' });
  });

  return router;
}
