import { createHash, randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { databaseMode, dbTransaction } from '../../db.ts';
import { persistShopInTransaction } from '../repositories/shops.ts';
import { sendMerchantWelcomeEmail } from '../services/email.ts';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import type { ShopRecord } from '../types.ts';

interface RegistrationOptions {
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
  createMerchantSession: (res: import('express').Response, shopId: number, req: import('express').Request) => Promise<void>;
  toSafeShop: (shop: ShopRecord) => object;
}

export function createShopRegistrationRouter(options: RegistrationOptions) {
  const {
    rateLimitPublicRequest,
    allocateShopId,
    normalizeWhatsAppPhone,
    isWeakShopPin,
    hashPin,
    hashAccessToken,
    isShopCategory,
    getCategoryDefaults,
    normalizeWelcomeMessage,
    sanitizeTextField,
    addDays,
    trialDurationDays,
    computeIsShopOpen,
    createMerchantSession,
    toSafeShop,
  } = options;
  const router = Router();

  router.post('/', rateLimitPublicRequest(10), async (req, res) => {
    const { name, whatsapp_number, pin_code, pin, category, city, welcome_message, theme_config, opening_hours } = req.body;
    const ownerEmail = String(req.body?.email || '').trim().toLowerCase();
    const acceptedTermsPrivacy = req.body?.accepted_terms_privacy === true;
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
    if (!acceptedTermsPrivacy) {
      return res.status(400).json({ error: 'Veuillez accepter les CGU et la politique de confidentialité pour créer une boutique.' });
    }
    if (safeName.length < 2 || !whatsapp_number || !/^[0-9]{6}$/.test(String(effectivePin || '').trim())) {
      return res.status(400).json({ error: 'Nom, numéro WhatsApp et code PIN requis.' });
    }
    if (isWeakShopPin(effectivePin)) {
      return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN de 6 chiffres fort.' });
    }

    const normalizedWhatsAppPhone = normalizeWhatsAppPhone(whatsapp_number);
    if (!normalizedWhatsAppPhone) return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
    const shopCategory: ShopCategory = isShopCategory(category) ? category : 'other';
    const categoryDefaults = getCategoryDefaults(shopCategory);
    const reservedShopId = await allocateShopId();
    const ownerAccessToken = randomUUID();
    const slug = safeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `boutique-${Date.now()}`;
    const uniqueSlug = slug;
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
    const trialStart = now.toISOString();
    const trialEnd = addDays(now, trialDurationDays);
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
      selected_subscription_tier: 'standard',
      subscription_status: 'trialing',
      trial_start: trialStart,
      trial_end: trialEnd,
      subscription_expires_at: trialEnd,
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

    const registrationResult = await dbTransaction(async (transaction) => {
      if (databaseMode === 'postgresql') {
        const advisoryKeys = [normalizedWhatsAppPhone, ownerEmail, slug].map((value) =>
          createHash('sha256').update(value).digest().readInt32BE(0),
        ).sort((left, right) => left - right);
        for (const key of advisoryKeys) await transaction.get('SELECT pg_advisory_xact_lock(?)', [key]);
      }
      if (await transaction.get('SELECT id FROM shops WHERE whatsapp_number = ?', [normalizedWhatsAppPhone])) return 'duplicate_phone';
      if (await transaction.get('SELECT id FROM shops WHERE LOWER(owner_email) = LOWER(?)', [ownerEmail])) return 'duplicate_email';

      let slugSuffix = 0;
      while (await transaction.get('SELECT id FROM shops WHERE slug = ?', [newShop.slug])) {
        slugSuffix += 1;
        newShop.slug = `${slug}-${Date.now().toString().slice(-5)}${slugSuffix > 1 ? `-${slugSuffix}` : ''}`;
        if (databaseMode === 'postgresql') {
          const slugLockKey = createHash('sha256').update(newShop.slug).digest().readInt32BE(0);
          await transaction.get('SELECT pg_advisory_xact_lock(?)', [slugLockKey]);
        }
      }
      await persistShopInTransaction(newShop, transaction);
      await transaction.run(
        'INSERT INTO merchant_account_consents (shop_id, terms_document, privacy_document, accepted_at) VALUES (?, ?, ?, ?)',
        [newShop.id, '/cgu', '/confidentialite', now.toISOString()],
      );
      return 'created';
    });
    if (registrationResult === 'duplicate_phone') {
      return res.status(409).json({ error: 'Ce numéro WhatsApp est déjà associé à une boutique. Utilisez son lien privé de gestion.' });
    }
    if (registrationResult === 'duplicate_email') {
      return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte marchand.' });
    }

    try {
      const mailResult = await sendMerchantWelcomeEmail({
        shopName: newShop.name,
        ownerEmail,
        appUrl: String(process.env.APP_URL || 'http://localhost:3000').trim() || 'http://localhost:3000',
      });
      if (!mailResult.sent) {
        console.warn(`Merchant welcome email skipped for ${ownerEmail}: ${mailResult.error || 'unknown_error'}`);
      }
    } catch (error) {
      console.warn(`Merchant welcome email failed for ${ownerEmail}:`, error);
    }

    await createMerchantSession(res, newShop.id, req);
    res.json({
      success: true,
      shop: toSafeShop(newShop),
      owner_access_token: ownerAccessToken,
      message: `Boutique créée. Votre essai Standard gratuit de ${trialDurationDays} jours commence maintenant. Choisissez ensuite une formule et réglez-la avec GeniusPay pour poursuivre. Les commandes clients vous sont transmises via un reçu WhatsApp à ouvrir manuellement.`,
    });
  });

  return router;
}
