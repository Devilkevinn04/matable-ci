// Maintenance, tarifs et fonctionnalités des formules.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionAccessCutoff,
  MIN_PRO_PRODUCT_PHOTO_LIMIT,
  normalizeSubscriptionProFeatures,
  parseSubscriptionProFeatures,
  type SubscriptionProFeatures,
} from '../../../src/utils/subscriptionFeatures.ts';
import { parseSubscriptionPrices, getDefaultSubscriptionPrices } from '../../services/subscriptionPricing.ts';

export function registerPlatformSettingsRoutes(router: Router, ctx: AdminContext) {
  const {
    dbGet,
    dbTransaction,
  } = ctx;

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
      ? normalizeSubscriptionProFeatures(parseSubscriptionProFeatures(settings.subscription_plan_features))
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
    if (proFeatures.productPhotoLimit < MIN_PRO_PRODUCT_PHOTO_LIMIT) {
      return res.status(400).json({
        error: `La limite de photos Pro doit être supérieure ou égale à celle de Premium (${MIN_PRO_PRODUCT_PHOTO_LIMIT} photos par article).`,
      });
    }
    const updatedAt = new Date().toISOString();
    const result = await dbTransaction(async ({ all, get, run }) => {
      const settings = await get<{ subscription_plan_features: string }>(
        'SELECT subscription_plan_features FROM platform_settings WHERE id = 1',
      );
      const previousFeatures = settings?.subscription_plan_features
        ? normalizeSubscriptionProFeatures(parseSubscriptionProFeatures(settings.subscription_plan_features))
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
}
