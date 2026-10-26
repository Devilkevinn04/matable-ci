import { Router, type RequestHandler } from 'express';
import { dbGet, dbRun } from '../../db.ts';
import { getSubscriptionAnalyticsDayLimit } from '../../src/utils/subscriptionFeatures.ts';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import { canUseSubscriptionFeature, getShopPublicationBlockReason, getSubscriptionPlanConfig, getSubscriptionState } from '../services/businessRules.ts';
import { getVapidConfiguration, isAllowedPushEndpoint } from '../services/pushNotifications.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import { getDefaultSubscriptionPrices, parseSubscriptionPrices } from '../services/subscriptionPricing.ts';
import type { ShopRecord } from '../types.ts';

interface ShopManagementOptions {
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
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
    dbAll,
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
  const isValidEventType = (value: unknown): value is NonNullable<ShopRecord['theme_config']['event_type']> =>
    ['sales', 'flash_sale', 'new_arrival', 'launch', 'special_offer', 'custom'].includes(String(value));

  router.get('/:id/owner-profile', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      name: shop.owner_name || '',
      phone: shop.owner_phone || '',
      email: shop.owner_email || '',
    });
  });

  router.patch('/:id/owner-profile', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Saisissez une adresse e-mail valide.' });
    }
    const name = Object.prototype.hasOwnProperty.call(req.body || {}, 'name')
      ? sanitizeTextField(typeof req.body.name === 'string' ? req.body.name.trim() : '', 100)
      : shop.owner_name || '';
    const rawPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')
      ? (typeof req.body.phone === 'string' ? req.body.phone.trim() : '')
      : shop.owner_phone || '';
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name') && typeof req.body.name !== 'string') {
      return res.status(400).json({ error: 'Le nom du responsable est invalide.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phone') && typeof req.body.phone !== 'string') {
      return res.status(400).json({ error: 'Le téléphone personnel est invalide.' });
    }
    const phone = rawPhone ? normalizeWhatsAppPhone(rawPhone) : null;
    if (rawPhone && !phone) {
      return res.status(400).json({ error: 'Saisissez un numéro ivoirien valide au format 01, 05 ou 07.' });
    }
    const duplicateEmail = await dbAll<{ id: number }>(
      'SELECT id FROM shops WHERE LOWER(owner_email) = LOWER(?) AND id <> ? LIMIT 1',
      [email, shop.id],
    );
    if (duplicateEmail.length) {
      return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à une autre boutique.' });
    }

    const hasPinCode = Object.prototype.hasOwnProperty.call(req.body || {}, 'pin_code');
    const pinCode = typeof req.body?.pin_code === 'string' ? req.body.pin_code.trim() : '';
    if (hasPinCode && (typeof req.body.pin_code !== 'string' || isWeakShopPin(pinCode))) {
      return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN de 6 chiffres fort.' });
    }
    if (hasPinCode) {
      await dbRun(
        'UPDATE shops SET owner_name = ?, owner_phone = ?, owner_email = ?, pin_code_hash = ? WHERE id = ?',
        [name || null, phone, email, hashPin(pinCode), shop.id],
      );
    } else {
      await dbRun(
        'UPDATE shops SET owner_name = ?, owner_phone = ?, owner_email = ? WHERE id = ?',
        [name || null, phone, email, shop.id],
      );
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, name: name || '', phone: phone || '', email, pin_updated: hasPinCode });
  });

  router.post('/:id/start-trial', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.trial_start && shop.trial_end) {
      return res.json({ success: true, shop: toSafeShop(shop), trial_days: trialDurationDays, already_started: true });
    }
    if (shop.subscription_status !== 'not_started') return res.status(409).json({ error: 'Cet essai ne peut pas être démarré.' });
    const tier = 'standard';
    const startedAt = new Date();
    shop.selected_subscription_tier = tier;
    shop.subscription_status = 'trialing';
    shop.trial_start = startedAt.toISOString();
    shop.trial_end = addDays(startedAt, trialDurationDays);
    shop.subscription_expires_at = shop.trial_end;
    await persistShop(shop);
    const settings = await dbGet<{ subscription_plan_prices: string }>(
      'SELECT subscription_plan_prices FROM platform_settings WHERE id = 1',
    );
    const prices = settings?.subscription_plan_prices
      ? parseSubscriptionPrices(settings.subscription_plan_prices)
      : getDefaultSubscriptionPrices();
    res.json({
      success: true,
      shop: toSafeShop(shop),
      trial_days: trialDurationDays,
      plan: { ...getSubscriptionPlanConfig(tier), amount: prices.standard },
    });
  });

  router.patch('/:id/subscription-reminder-consent', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
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

  router.get('/:id/push/config', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const vapid = getVapidConfiguration();
    const subscriptions = await dbAll<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM merchant_push_subscriptions WHERE shop_id = ?',
      [shopId],
    );
    return res.json({
      configured: Boolean(vapid),
      public_key: vapid?.publicKey || null,
      subscribed_devices: Number(subscriptions[0]?.count || 0),
    });
  });

  router.put('/:id/push/subscription', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    if (!await getShopFromDatabase(shopId)) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!getVapidConfiguration()) return res.status(503).json({ error: 'Les notifications Push ne sont pas encore configurées sur le serveur.' });
    const subscription = req.body?.subscription;
    const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint.trim() : '';
    const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
    const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';
    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      return res.status(400).json({ error: 'Abonnement navigateur invalide.' });
    }
    if (!isAllowedPushEndpoint(endpointUrl) || endpoint.length > 2048 || !p256dh || p256dh.length > 256
      || !auth || auth.length > 256) {
      return res.status(400).json({ error: 'Abonnement navigateur invalide.' });
    }
    const now = new Date().toISOString();
    const saved = await dbRun(`INSERT INTO merchant_push_subscriptions
      (shop_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at
      WHERE merchant_push_subscriptions.shop_id = excluded.shop_id`,
    [shopId, endpoint, p256dh, auth, now, now]);
    if (saved.changes !== 1) return res.status(409).json({ error: 'Cet appareil est déjà associé à un autre compte marchand.' });
    return res.json({ success: true });
  });

  router.delete('/:id/push/subscription', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (!endpoint || endpoint.length > 2048) return res.status(400).json({ error: 'Appareil invalide.' });
    await dbRun('DELETE FROM merchant_push_subscriptions WHERE shop_id = ? AND endpoint = ?', [shopId, endpoint]);
    return res.json({ success: true });
  });

  router.get('/:id/analytics', requireMerchantOwnShop, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const subscription = getSubscriptionState(shop);
    if (!req.adminShopAccess && !subscription.isActive) {
      return res.status(403).json({ error: 'Les statistiques sont disponibles avec un essai ou un abonnement actif.' });
    }

    const requestedDays = Number(req.query.days);
    const planDayLimit = req.adminShopAccess ? 90 : getSubscriptionAnalyticsDayLimit(subscription.plan, subscription.planFeatures);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), planDayLimit) : planDayLimit;
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
    const productActivity = await dbAll<{ product_id: number; title: string; views: number; clicks: number }>(`
      SELECT p.id AS product_id, p.title,
        COUNT(CASE WHEN e.event_type = 'product_view' THEN 1 END) AS views,
        COUNT(CASE WHEN e.event_type = 'product_click' THEN 1 END) AS clicks
      FROM analytics_events e
      JOIN products p ON p.id = CAST(substr(e.path, 10) AS INTEGER)
      WHERE e.shop_id = ? AND e.event_type IN ('product_view', 'product_click') AND e.created_at >= ?
      GROUP BY p.id, p.title
      ORDER BY views DESC, clicks DESC, p.id ASC
      LIMIT 10
    `, [shop.id, since]);
    const orderRows = await dbAll<Record<string, unknown>>('SELECT * FROM orders WHERE shop_id = ? AND created_at >= ? AND status NOT IN (?, ?)', [
      shop.id, since, 'cancelled', 'expired',
    ]);
    const whatsappClicks = await dbAll<{ count: number | string }>(`
      SELECT COUNT(*) AS count FROM order_whatsapp_tracking tracking
      JOIN orders ON orders.id = tracking.order_id
      WHERE orders.shop_id = ? AND tracking.clicked_at >= ?
    `, [shop.id, since]);
    const actionableOrders = orderRows.map((row) => ({
      shop_id: Number(row.shop_id),
      created_at: String(row.created_at),
      status: String(row.status || 'pending'),
      total_amount: Number(row.total_amount || 0),
    })).filter((order) => order.shop_id === shop.id);
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
        whatsapp_clicks: Number(whatsappClicks[0]?.count || 0),
        product_views: productActivity.reduce((sum, item) => sum + Number(item.views || 0), 0),
        product_clicks: productActivity.reduce((sum, item) => sum + Number(item.clicks || 0), 0),
      },
      daily: Array.from(byDay.values()).sort((left, right) => left.date.localeCompare(right.date)),
      top_products: productActivity.map((item) => ({
        product_id: Number(item.product_id),
        title: item.title,
        views: Number(item.views || 0),
        clicks: Number(item.clicks || 0),
      })),
    });
  });

  router.post('/:id/access-link', requireMerchantAccess, async (req, res) => {
    const shop = await getShopFromDatabase(Number(req.params.id));
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
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const requestedStatus = String(req.body?.publication_status || '');
    if (requestedStatus !== 'draft' && requestedStatus !== 'active') {
      return res.status(400).json({ error: 'Statut de publication invalide.' });
    }
    if (requestedStatus === 'active' && !req.adminShopAccess) {
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
    const shop = await getShopFromDatabase(Number(req.params.id));
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
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
    const { theme_config } = req.body;
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
      const themeConfig = shop.theme_config as unknown as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(requestedThemeConfig, 'event_type')
        && !isValidEventType(requestedThemeConfig.event_type)) {
        return res.status(400).json({ error: 'Choisissez un type d’opération commerciale valide.' });
      }
      if (hasChangedFields(themeConfig, requestedThemeConfig, ['primary_color', 'secondary_color', 'font_family', 'layout_style', 'theme_preset_id', 'brand_direction', 'custom_banner_url', 'logo_url', 'advanced_css'])
        && !req.adminShopAccess && !canUseSubscriptionFeature(shop, 'custom_branding')) {
        return res.status(403).json({ error: 'La personnalisation avancée de la vitrine est réservée aux formules Premium et Pro.' });
      }
      if (hasChangedFields(themeConfig, requestedThemeConfig, ['event_mode_enabled', 'event_type', 'event_banner_text'])
        && !req.adminShopAccess && !canUseSubscriptionFeature(shop, 'event_mode')) {
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
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });
    const { theme_color, welcome_message, is_open, whatsapp_number, name, category, theme_config, city, pin_code, opening_hours } = req.body;

    const requestedThemeConfig = theme_config && typeof theme_config === 'object'
      ? theme_config as Record<string, unknown>
      : {};
    const currentThemeConfig = shop.theme_config as unknown as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(requestedThemeConfig, 'event_type')
      && !isValidEventType(requestedThemeConfig.event_type)) {
      return res.status(400).json({ error: 'Choisissez un type d’opération commerciale valide.' });
    }
    if ((hasChangedFields(currentThemeConfig, requestedThemeConfig, ['primary_color', 'secondary_color', 'font_family', 'layout_style', 'theme_preset_id', 'brand_direction', 'custom_banner_url', 'logo_url', 'advanced_css'])
      || theme_color !== undefined && theme_color !== shop.theme_color)
      && !req.adminShopAccess && !canUseSubscriptionFeature(shop, 'custom_branding')) {
      return res.status(403).json({ error: 'La personnalisation avancée de la vitrine est réservée aux formules Premium et Pro.' });
    }
    if (hasChangedFields(currentThemeConfig, requestedThemeConfig, ['event_mode_enabled', 'event_type', 'event_banner_text'])
      && !req.adminShopAccess && !canUseSubscriptionFeature(shop, 'event_mode')) {
      return res.status(403).json({ error: 'Le mode événement est réservé aux formules Premium et Pro.' });
    }
    if (hasChangedFields(currentThemeConfig, requestedThemeConfig, ['social_links'])
      && !req.adminShopAccess && !canUseSubscriptionFeature(shop, 'social_links')) {
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
    if (opening_hours?.enabled) {
      const openTime = typeof opening_hours.open_time === 'string' ? opening_hours.open_time.slice(0, 5) : '';
      const closeTime = typeof opening_hours.close_time === 'string' ? opening_hours.close_time.slice(0, 5) : '';
      const days = Array.isArray(opening_hours.days)
        ? opening_hours.days.filter((day: unknown): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6)
        : [];
      const isValidTime = (value: string) => {
        if (!/^\d{2}:\d{2}$/.test(value)) return false;
        const [hours, minutes] = value.split(':').map(Number);
        return hours < 24 && minutes < 60;
      };
      if (!isValidTime(openTime) || !isValidTime(closeTime) || days.length === 0) {
        return res.status(400).json({ error: 'Un planning actif doit inclure des heures valides et au moins un jour d’ouverture.' });
      }
    }
    if (opening_hours) {
      shop.opening_hours = {
        ...(shop.opening_hours || { enabled: false, open_time: '', close_time: '', days: [], manual_override: false }),
        ...opening_hours,
      };
    }

    await persistShop(shop);
    res.json({ success: true, shop: toSafeShop(shop) });
  });

  return router;
}
