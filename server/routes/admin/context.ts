// Dépendances et utilitaires partagés par les routes d’administration.
import type { RequestHandler } from 'express';
import type { dbTransaction } from '../../../db.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../../types.ts';
import { getSubscriptionState } from '../../services/businessRules.ts';
import { parseSubscriptionPrices, getDefaultSubscriptionPrices } from '../../services/subscriptionPricing.ts';
import { getWhatsAppSubscriptionReminderConfig } from '../../services/whatsappNotifications.ts';
import { mapShopRow } from '../../repositories/shops.ts';

export interface AdminRouterOptions {
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

export function createAdminContext(options: AdminRouterOptions) {
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
  const maxTrialExtensionDays = 30;
  const rejectUnconfiguredAccess: RequestHandler = (_req, res) => {
    res.status(503).json({ error: 'Protection administrative non configurée.' });
  };
  const requireAdmin = requireAdminAccess ?? rejectUnconfiguredAccess;
  const requireSuperAdmin = requireSuperAdminAccess ?? rejectUnconfiguredAccess;
  const requireVerification = requireVerificationAdminAccess ?? rejectUnconfiguredAccess;
  const isVerificationAdmin = (req: { adminRole?: string }) => req.adminRole === 'verification_admin';
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

  return {
    databaseMode,
    dbAll,
    dbGet,
    dbRun,
    dbTransaction,
    refreshRuntimeDataFromDatabase,
    toSafeShop,
    rotateMerchantAccessTokenForShop,
    clearMerchantSessionsForShop,
    maxTrialExtensionDays,
    requireAdmin,
    requireSuperAdmin,
    requireVerification,
    isVerificationAdmin,
    loadShops,
    getShop,
    getCurrentSubscriptionPrices,
    getTrialExtensionDays,
    getSafeAuditDetails,
    logAdminAction,
    getSubscriptionMetrics,
  };
}

export type AdminContext = ReturnType<typeof createAdminContext>;
