import { Router, type RequestHandler } from 'express';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import { canUseSubscriptionFeature, getShopPublicationBlockReason, getSubscriptionPlanConfig, normalizeSubscriptionTier } from '../services/businessRules.ts';
import type { OrderRecord, ShopRecord } from '../types.ts';

interface ShopManagementOptions {
  shops: ShopRecord[];
  orders: OrderRecord[];
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  refreshRuntimeDataFromDatabase: () => Promise<void>;
  requireMerchantAccess: RequestHandler;
  requireMerchantOwnShop: RequestHandler;
  addDays: (date: Date, days: number) => string;
  trialDurationDays: number;
  rotateMerchantAccessTokenForShop: (shopId: number) => Promise<string>;
  persistShop: (shop: ShopRecord) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
  normalizeWhatsAppPhone: (phone: unknown) => string | null;
  isWeakShopPin: (pin: unknown) => boolean;
  hashPin: (pin: string) => string;
  isShopCategory: (value: unknown) => value is ShopCategory;
  normalizeCustomBannerImage: (value: unknown, category: ShopCategory) => string;
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
}

export function createShopManagementRouter(options: ShopManagementOptions) {
  const {
    shops,
    orders,
    dbAll,
    refreshRuntimeDataFromDatabase,
    requireMerchantAccess,
    requireMerchantOwnShop,
    addDays,
    trialDurationDays,
    rotateMerchantAccessTokenForShop,
    persistShop,
    toSafeShop,
    normalizeWhatsAppPhone,
    isWeakShopPin,
    hashPin,
    isShopCategory,
    normalizeCustomBannerImage,
    sanitizeTextField,
  } = options;
  const router = Router({ mergeParams: true });
  const hasChangedFields = (current: Record<string, unknown>, requested: Record<string, unknown>, fields: string[]) => fields.some((field) =>
    Object.prototype.hasOwnProperty.call(requested, field)
      && JSON.stringify(requested[field]) !== JSON.stringify(current[field])
  );

  router.post('/:id/start-trial', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.trial_start && shop.trial_end) {
      return res.json({ success: true, shop: toSafeShop(shop), trial_days: trialDurationDays, already_started: true });
    }
    if (shop.subscription_status !== 'not_started') return res.status(409).json({ error: 'Cet essai ne peut pas être démarré.' });
    const tier = String(req.body?.tier || '');
    if (!['standard', 'premium', 'pro'].includes(tier)) return res.status(400).json({ error: 'Choisissez une formule valide.' });
    const startedAt = new Date();
    shop.selected_subscription_tier = normalizeSubscriptionTier(tier);
    shop.subscription_status = 'trialing';
    shop.trial_start = startedAt.toISOString();
    shop.trial_end = addDays(startedAt, trialDurationDays);
    await persistShop(shop);
    res.json({ success: true, shop: toSafeShop(shop), trial_days: trialDurationDays, plan: getSubscriptionPlanConfig(tier) });
  });

  router.patch('/:id/subscription-reminder-consent', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Le consentement doit être activé ou désactivé.' });
    shop.whatsapp_subscription_reminders_enabled = req.body.enabled;
    shop.whatsapp_subscription_reminders_consent_at = req.body.enabled ? new Date().toISOString() : null;
    await persistShop(shop);
    res.json({
      success: true,
      enabled: shop.whatsapp_subscription_reminders_enabled,
      consent_at: shop.whatsapp_subscription_reminders_consent_at,
    });
  });

  router.get('/:id/analytics', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!canUseSubscriptionFeature(shop, 'advanced_analytics')) {
      return res.status(403).json({ error: 'Les statistiques détaillées sont réservées à la formule Pro.' });
    }

    await refreshRuntimeDataFromDatabase();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const totals = await dbAll<{ page_views: number; unique_visitors: number }>(`
      SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
      FROM analytics_events
      WHERE shop_id = ? AND event_type = 'page_view' AND created_at >= ?
    `, [shop.id, since]);
    const trafficByDay = await dbAll<{ date: string; page_views: number; unique_visitors: number }>(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
        COUNT(DISTINCT session_id) AS unique_visitors
      FROM analytics_events
      WHERE shop_id = ? AND event_type = 'page_view' AND created_at >= ?
      GROUP BY date ORDER BY date ASC
    `, [shop.id, since]);
    const actionableOrders = orders.filter((order) => order.shop_id === shop.id
      && order.created_at >= since
      && order.status !== 'cancelled'
      && order.status !== 'expired');
    const byDay = new Map<string, { date: string; page_views: number; unique_visitors: number; orders: number; order_value: number }>();
    for (const row of trafficByDay) {
      byDay.set(row.date, {
        date: row.date,
        page_views: Number(row.page_views || 0),
        unique_visitors: Number(row.unique_visitors || 0),
        orders: 0,
        order_value: 0,
      });
    }
    for (const order of actionableOrders) {
      const date = order.created_at.slice(0, 10);
      const current = byDay.get(date) || { date, page_views: 0, unique_visitors: 0, orders: 0, order_value: 0 };
      current.orders += 1;
      current.order_value += Number(order.total_amount || 0);
      byDay.set(date, current);
    }
    res.json({
      days,
      since,
      traffic_basis: 'consented_page_views',
      summary: {
        page_views: Number(totals[0]?.page_views || 0),
        unique_visitors: Number(totals[0]?.unique_visitors || 0),
        orders: actionableOrders.length,
        order_value: actionableOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      },
      daily: Array.from(byDay.values()).sort((left, right) => left.date.localeCompare(right.date)),
    });
  });

  router.post('/:id/access-link', requireMerchantAccess, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id);
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({
      success: true,
      public_url: `${origin}/${encodeURIComponent(shop.slug)}`,
      access_url: `${origin}/app?access=${encodeURIComponent(ownerAccessToken)}`,
    });
  });

  router.patch('/:id/publication-status', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const requestedStatus = String(req.body?.publication_status || '');
    if (requestedStatus !== 'draft' && requestedStatus !== 'active') {
      return res.status(400).json({ error: 'Statut de publication invalide.' });
    }
    if (requestedStatus === 'active') {
      if (shop.publication_status === 'suspended') return res.status(403).json({ error: 'La publication a été suspendue par l’administration.' });
      const blockReason = getShopPublicationBlockReason(shop);
      if (blockReason === 'verification') return res.status(409).json({ error: 'Vérifiez votre identité avant de publier la boutique.', blocked_by: blockReason });
      if (blockReason === 'subscription') return res.status(409).json({ error: 'Un essai ou abonnement actif est nécessaire pour publier la boutique.', blocked_by: blockReason });
      if (blockReason === 'inactive') return res.status(403).json({ error: 'Cette boutique est inactive.', blocked_by: blockReason });
    }
    shop.publication_status = requestedStatus;
    await persistShop(shop);
    res.json({ success: true, publication_status: shop.publication_status, shop: toSafeShop(shop) });
  });

  router.patch('/:id/toggle-status', requireMerchantAccess, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
    const { is_open } = req.body;
    shop.is_open = is_open !== undefined ? Boolean(is_open) : !shop.is_open;
    if (shop.opening_hours) shop.opening_hours.manual_override = true;
    await persistShop(shop);
    res.json({
      success: true,
      is_open: shop.is_open,
      shop: { ...toSafeShop(shop), is_open: shop.is_open },
      message: shop.is_open ? 'Prise de commande activée sur la boutique.' : 'Prise de commande désactivée sur la boutique.',
    });
  });

  router.put('/:id/theme', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
    const { theme_config } = req.body;
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
      const themeConfig = shop.theme_config as unknown as Record<string, unknown>;
      if (hasChangedFields(themeConfig, requestedThemeConfig, ['primary_color', 'secondary_color', 'font_family', 'layout_style', 'theme_preset_id', 'brand_direction', 'custom_banner_url', 'logo_url', 'advanced_css'])
        && !canUseSubscriptionFeature(shop, 'custom_branding')) {
        return res.status(403).json({ error: 'La personnalisation avancée de la vitrine est réservée aux formules Premium et Pro.' });
      }
      if (hasChangedFields(themeConfig, requestedThemeConfig, ['event_mode_enabled', 'event_banner_text'])
        && !canUseSubscriptionFeature(shop, 'event_mode')) {
        return res.status(403).json({ error: 'Le mode événement est réservé aux formules Premium et Pro.' });
      }
      const requestedBrandDirection = ['luxe', 'moderne', 'authentique'].includes(requestedThemeConfig.brand_direction)
        ? requestedThemeConfig.brand_direction as ShopRecord['theme_config']['brand_direction']
        : shop.theme_config.brand_direction;
      shop.theme_config = {
        ...shop.theme_config,
        ...requestedThemeConfig,
        ...(requestedBrandDirection ? { brand_direction: requestedBrandDirection } : {}),
        ...(typeof requestedThemeConfig.custom_banner_url === 'string'
          ? { custom_banner_url: normalizeCustomBannerImage(requestedThemeConfig.custom_banner_url, shop.category) }
          : {}),
      };
      if (requestedThemeConfig.primary_color) shop.theme_color = requestedThemeConfig.primary_color;
    }
    await persistShop(shop);
    res.json({ success: true, shop: toSafeShop(shop), theme_config: shop.theme_config });
  });

  router.put('/:id', requireMerchantOwnShop, async (req, res) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
    const { theme_color, welcome_message, is_open, whatsapp_number, name, category, theme_config, city, pin_code, opening_hours } = req.body;

    const requestedThemeConfig = theme_config && typeof theme_config === 'object'
      ? theme_config as Record<string, unknown>
      : {};
    const currentThemeConfig = shop.theme_config as unknown as Record<string, unknown>;
    if ((hasChangedFields(currentThemeConfig, requestedThemeConfig, ['primary_color', 'secondary_color', 'font_family', 'layout_style', 'theme_preset_id', 'brand_direction', 'custom_banner_url', 'logo_url', 'advanced_css'])
      || theme_color !== undefined && theme_color !== shop.theme_color)
      && !canUseSubscriptionFeature(shop, 'custom_branding')) {
      return res.status(403).json({ error: 'La personnalisation avancée de la vitrine est réservée aux formules Premium et Pro.' });
    }
    if (hasChangedFields(currentThemeConfig, requestedThemeConfig, ['event_mode_enabled', 'event_banner_text'])
      && !canUseSubscriptionFeature(shop, 'event_mode')) {
      return res.status(403).json({ error: 'Le mode événement est réservé aux formules Premium et Pro.' });
    }
    if (hasChangedFields(currentThemeConfig, requestedThemeConfig, ['social_links'])
      && !canUseSubscriptionFeature(shop, 'social_links')) {
      return res.status(403).json({ error: 'Les liens de réseaux sociaux sont réservés aux formules Premium et Pro.' });
    }

    if (theme_color !== undefined) {
      shop.theme_color = theme_color;
      shop.theme_config.primary_color = theme_color;
    }
    if (welcome_message !== undefined) shop.welcome_message = welcome_message;
    if (is_open !== undefined) {
      shop.is_open = Boolean(is_open);
      if (shop.opening_hours) shop.opening_hours.manual_override = true;
    }
    if (whatsapp_number !== undefined) {
      const normalizedPhone = normalizeWhatsAppPhone(whatsapp_number);
      if (!normalizedPhone) return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
      if (normalizedPhone !== shop.whatsapp_number) {
        shop.whatsapp_subscription_reminders_enabled = false;
        shop.whatsapp_subscription_reminders_consent_at = null;
      }
      shop.whatsapp_number = normalizedPhone;
    }
    if (name !== undefined) shop.name = name;
    if (city !== undefined) shop.city = city;
    if (pin_code !== undefined && String(pin_code).trim()) {
      const rawPin = String(pin_code).trim();
      if (isWeakShopPin(rawPin)) return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN de 6 chiffres fort.' });
      shop.pin_code_hash = hashPin(rawPin);
    }
    if (isShopCategory(category)) shop.category = category;

    if (theme_config) {
      const requestedThemeConfig = { ...req.body.theme_config };
      const requestedBrandDirection = ['luxe', 'moderne', 'authentique'].includes(requestedThemeConfig.brand_direction)
        ? requestedThemeConfig.brand_direction as ShopRecord['theme_config']['brand_direction']
        : shop.theme_config.brand_direction;
      shop.theme_config = {
        ...shop.theme_config,
        ...requestedThemeConfig,
        ...(requestedBrandDirection ? { brand_direction: requestedBrandDirection } : {}),
        ...(typeof requestedThemeConfig.custom_banner_url === 'string'
          ? { custom_banner_url: normalizeCustomBannerImage(requestedThemeConfig.custom_banner_url, shop.category) }
          : {}),
        social_links: {
          instagram: typeof requestedThemeConfig.social_links?.instagram === 'string' ? sanitizeTextField(String(requestedThemeConfig.social_links.instagram), 300) : (shop.theme_config.social_links?.instagram || ''),
          facebook: typeof requestedThemeConfig.social_links?.facebook === 'string' ? sanitizeTextField(String(requestedThemeConfig.social_links.facebook), 300) : (shop.theme_config.social_links?.facebook || ''),
          tiktok: typeof requestedThemeConfig.social_links?.tiktok === 'string' ? sanitizeTextField(String(requestedThemeConfig.social_links.tiktok), 300) : (shop.theme_config.social_links?.tiktok || ''),
          website: typeof requestedThemeConfig.social_links?.website === 'string' ? sanitizeTextField(String(requestedThemeConfig.social_links.website), 300) : (shop.theme_config.social_links?.website || ''),
          whatsapp: typeof requestedThemeConfig.social_links?.whatsapp === 'string' ? sanitizeTextField(String(requestedThemeConfig.social_links.whatsapp), 300) : (shop.theme_config.social_links?.whatsapp || ''),
        },
        delivery_zones: Array.isArray(requestedThemeConfig.delivery_zones)
          ? requestedThemeConfig.delivery_zones.slice(0, 8).map((zone: any) => ({
              label: sanitizeTextField(String(zone?.label || 'Zone locale'), 80),
              mode: zone?.mode === 'sur_place' || zone?.mode === 'retirer' ? zone.mode : 'livraison',
              fee: Number(zone?.fee || 0),
              description: zone?.description ? sanitizeTextField(String(zone.description), 120) : '',
            }))
          : (shop.theme_config.delivery_zones || []),
      };
    }
    if (opening_hours) {
      shop.opening_hours = {
        ...(shop.opening_hours || { enabled: false, open_time: '08:00', close_time: '22:00', manual_override: false }),
        ...opening_hours,
      };
    }

    await persistShop(shop);
    res.json({ success: true, shop: toSafeShop(shop) });
  });

  return router;
}
