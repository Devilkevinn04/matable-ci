import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import type { ShopRecord } from '../types.ts';

interface RegistrationOptions {
  shops: ShopRecord[];
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  allocateShopId: () => Promise<number>;
  normalizeWhatsAppPhone: (phone: unknown) => string | null;
  isWeakShopPin: (pin: unknown) => boolean;
  hashPin: (pin: string) => string;
  hashAccessToken: (token: string) => string;
  isShopCategory: (value: unknown) => value is ShopCategory;
  getCategoryDefaults: (category: ShopCategory) => {
    primaryColor: string;
    secondaryColor: string;
    layoutStyle: 'grid_portrait' | 'card_landscape';
    themePresetId?: string;
    brandDirection: 'luxe' | 'moderne' | 'authentique';
  };
  normalizeCustomBannerImage: (value: unknown, category: ShopCategory) => string;
  normalizeWelcomeMessage: (value: string | null | undefined, category: ShopCategory) => string;
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
  addDays: (date: Date, days: number) => string;
  trialDurationDays: number;
  computeIsShopOpen: (shop: ShopRecord) => boolean;
  persistShop: (shop: ShopRecord) => Promise<void>;
  createMerchantSession: (res: import('express').Response, shopId: number, req: import('express').Request) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
}

export function createShopRegistrationRouter(options: RegistrationOptions) {
  const {
    shops,
    rateLimitPublicRequest,
    allocateShopId,
    normalizeWhatsAppPhone,
    isWeakShopPin,
    hashPin,
    hashAccessToken,
    isShopCategory,
    getCategoryDefaults,
    normalizeCustomBannerImage,
    normalizeWelcomeMessage,
    sanitizeTextField,
    addDays,
    trialDurationDays,
    computeIsShopOpen,
    persistShop,
    createMerchantSession,
    toSafeShop,
    dbGet,
  } = options;
  const router = Router();

  router.post('/', rateLimitPublicRequest(10), async (req, res) => {
    const { name, whatsapp_number, pin_code, pin, category, city, welcome_message, theme_config, opening_hours } = req.body;
    const ownerEmail = String(req.body?.email || '').trim().toLowerCase();
    const effectivePin = pin_code || pin;
    const safeName = sanitizeTextField(name, 100);
    const safeCity = sanitizeTextField(city || 'Abidjan', 100);
    const safeWelcomeMessage = sanitizeTextField(welcome_message, 300);
    const requestedThemeConfig = theme_config && typeof theme_config === 'object' ? theme_config : {};
    const normalizedOpeningHours = {
      enabled: Boolean(opening_hours?.enabled),
      open_time: typeof opening_hours?.open_time === 'string' ? opening_hours.open_time.slice(0, 5) : '08:00',
      close_time: typeof opening_hours?.close_time === 'string' ? opening_hours.close_time.slice(0, 5) : '22:00',
      days: Array.isArray(opening_hours?.days)
        ? opening_hours.days.filter((day: unknown): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6).slice(0, 7)
        : [0, 1, 2, 3, 4, 5, 6],
      manual_override: Boolean(opening_hours?.manual_override),
    };
    const deliveryZones = Array.isArray(requestedThemeConfig.delivery_zones)
      ? requestedThemeConfig.delivery_zones.slice(0, 8).map((zone: any) => ({
          label: String(zone?.label || 'Zone locale'),
          mode: zone?.mode === 'sur_place' || zone?.mode === 'retirer' ? zone.mode : 'livraison',
          fee: Number(zone?.fee || 0),
          description: zone?.description ? String(zone.description).slice(0, 120) : undefined,
        }))
      : [];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 254) {
      return res.status(400).json({ error: 'Une adresse e-mail valide est obligatoire pour le responsable.' });
    }
    if (safeName.length < 2 || !whatsapp_number || !/^[0-9]{6}$/.test(String(effectivePin || '').trim())) {
      return res.status(400).json({ error: 'Nom, numéro WhatsApp et code PIN requis.' });
    }
    if (isWeakShopPin(effectivePin)) {
      return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN de 6 chiffres fort.' });
    }

    const normalizedWhatsAppPhone = normalizeWhatsAppPhone(whatsapp_number);
    if (!normalizedWhatsAppPhone) return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
    if (shops.some((shop) => shop.whatsapp_number === normalizedWhatsAppPhone)) {
      return res.status(409).json({ error: 'Ce numéro WhatsApp est déjà associé à une boutique. Utilisez son lien privé de gestion.' });
    }
    if (shops.some((shop) => shop.owner_email?.toLowerCase() === ownerEmail)) {
      return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte marchand.' });
    }

    const shopCategory: ShopCategory = isShopCategory(category) ? category : 'other';
    const categoryDefaults = getCategoryDefaults(shopCategory);
    const reservedShopId = await allocateShopId();
    const ownerAccessToken = randomUUID();
    const slug = safeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `boutique-${Date.now()}`;
    const uniqueSlug = shops.some((shop) => shop.slug === slug) ? `${slug}-${Date.now().toString().slice(-5)}` : slug;
    const mergedThemeConfig = {
      primary_color: categoryDefaults.primaryColor,
      secondary_color: categoryDefaults.secondaryColor,
      font_family: 'Plus Jakarta Sans' as const,
      layout_style: categoryDefaults.layoutStyle,
      theme_preset_id: categoryDefaults.themePresetId,
      brand_direction: categoryDefaults.brandDirection,
      custom_banner_url: '',
      logo_url: '',
      event_mode_enabled: false,
      event_banner_text: '🎉 Commande rapide • Livraison et retrait disponibles',
      social_links: {
        instagram: '',
        facebook: '',
        tiktok: '',
        website: '',
        whatsapp: '',
      },
      delivery_zones: deliveryZones,
      advanced_css: {
        borderRadius: 'rounded-xl' as const,
        shadowIntensity: 'subtle' as const,
        accentGlow: false,
      },
    };
    const now = new Date();
    const newShop: ShopRecord = {
      id: reservedShopId,
      name: safeName,
      slug: uniqueSlug,
      whatsapp_number: normalizedWhatsAppPhone,
      pin_code_hash: hashPin(String(effectivePin)),
      owner_access_token_hash: hashAccessToken(ownerAccessToken),
      theme_color: categoryDefaults.primaryColor,
      welcome_message: normalizeWelcomeMessage(safeWelcomeMessage, shopCategory),
      is_open: true,
      is_active: true,
      subscription_status: 'not_started',
      trial_start: null,
      trial_end: null,
      last_notification_sent_at: null,
      created_at: now.toISOString(),
      category: shopCategory,
      city: safeCity,
      owner_email: ownerEmail,
      publication_status: 'draft',
      merchant_verification_status: 'pending',
      opening_hours: normalizedOpeningHours,
      theme_config: mergedThemeConfig,
    };
    if (normalizedOpeningHours.enabled && !normalizedOpeningHours.manual_override) newShop.is_open = computeIsShopOpen(newShop);

    try {
      await persistShop(newShop);
    } catch (error) {
      if (await dbGet<{ id: number }>('SELECT id FROM shops WHERE LOWER(owner_email) = LOWER(?)', [ownerEmail])) {
        return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte marchand.' });
      }
      throw error;
    }
    shops.push(newShop);
    await createMerchantSession(res, newShop.id, req);
    res.json({
      success: true,
      shop: toSafeShop(newShop),
      owner_access_token: ownerAccessToken,
      message: 'Boutique créée. Les commandes clients sont envoyées au vendeur via un reçu WhatsApp à ouvrir manuellement.',
    });
  });

  return router;
}
