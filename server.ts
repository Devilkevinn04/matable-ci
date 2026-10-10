import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { dbAll, dbGet, dbRun, dbTransaction, databaseMode, initializeDatabase } from './db.ts';
import { createSeoRouter } from './server/routes/seo.ts';
import { createProductRouter } from './server/routes/products.ts';
import { createAuthRouter } from './server/routes/auth.ts';
import { createCustomerEngagementRouter } from './server/routes/customerEngagement.ts';
import { createMerchantOrdersRouter } from './server/routes/merchantOrders.ts';
import { createOrderRouter } from './server/routes/orders.ts';
import { createAdminRouter } from './server/routes/admin.ts';
import { createPublicShopsRouter } from './server/routes/publicShops.ts';
import { createShopManagementRouter } from './server/routes/shopManagement.ts';
import { createShopRegistrationRouter } from './server/routes/shopRegistration.ts';
import { createMerchantVerificationRouter } from './server/routes/merchantVerification.ts';
import { createTelemetryRouter } from './server/routes/telemetry.ts';
import { createKadevPayRouter } from './server/routes/kadevPay.ts';
import { createPublicRateLimitMiddleware } from './server/services/rateLimits.ts';
import { buildSessionFingerprint, createAuthSessionHelpers, isRequestFingerprintMatch } from './server/services/authSessions.ts';
import { createSeoHtmlHelpers } from './server/services/seoHtml.ts';
import { getWhatsAppSubscriptionReminderConfig, sendWhatsAppSubscriptionReminder } from './server/services/whatsappNotifications.ts';
import { seedDemoDatabaseIfEmpty } from './server/services/demoSeed.ts';
import { applySecurityHeaders } from './server/middleware/securityHeaders.ts';
import { createMaintenanceModeMiddleware } from './server/middleware/maintenanceMode.ts';
import type { OrderRecord, ProductRecord, ShopOpeningHours, ShopRecord, SubscriptionPlanConfig, SubscriptionState, SubscriptionStatus, SubscriptionTier } from './server/types.ts';
import { loadProductsFromDatabase, persistProduct } from './server/repositories/products.ts';
import { getShopFromDatabase, loadShopsFromDatabase, persistShop } from './server/repositories/shops.ts';
import { loadOrdersFromDatabase, persistOrder } from './server/repositories/orders.ts';
import { allocateRecordId } from './server/repositories/ids.ts';
import {
  deleteAdminSessionRecord,
  deleteCustomerSessionRecord,
  deleteMerchantSessionRecord,
  migrateExistingSessionTokens,
  saveAdminSessionRecord,
  saveCustomerSessionRecord,
  saveMerchantSessionRecord,
} from './server/repositories/sessions.ts';
import {
  computeIsShopOpen,
  escapeHtml,
    getSubscriptionReminderAt,
  getProductUnitPriceWithModifiers,
  getSubscriptionState,
  getValidSelectedModifiers,
  isShopPubliclyVisible,
  isSameBusinessDay,
  isWeakShopPin,
  normalizeWhatsAppPhone,
  summarizeOrderMetrics,
} from './server/services/businessRules.ts';
export { getSubscriptionPlanConfig, normalizeSubscriptionTier, getSubscriptionState, summarizeOrderMetrics, escapeHtml } from './server/services/businessRules.ts';
export type { SubscriptionPlanConfig, SubscriptionState, SubscriptionStatus, SubscriptionTier } from './server/types.ts';
export {
  deleteMerchantSessionRecord,
  getMerchantSessionRecord,
  saveMerchantSessionRecord,
} from './server/repositories/sessions.ts';
import { getCategoryDefaults, isShopCategory, normalizeCustomBannerImage, normalizeProductImage, normalizeWelcomeMessage, sanitizeGalleryImages } from './src/utils/categoryDefaults.ts';
import { TRIAL_CATALOG_LIMIT, TRIAL_DURATION_DAYS } from './src/utils/subscriptionFeatures.ts';
import type { ShopCategory } from './src/utils/categoryDefaults.ts';
import { findPublicDiscoveryPage } from './src/utils/discoverySeo.ts';

export { buildSessionFingerprint, isRequestFingerprintMatch };

declare global {
  namespace Express {
    interface Request {
      user?: { id: number };
      adminShopAccess?: boolean;
    }
  }
}

const DEMO_MODE = String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';

export function shouldSeedDemoData(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

// Set realistic future dates for subscriptions
const now = new Date();
const addDays = (d: Date, days: number) => {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res.toISOString().split('T')[0];
};

async function refreshSubscriptionState(shop: ShopRecord): Promise<SubscriptionState> {
  const state = getSubscriptionState(shop);
  if ((state.status === 'past_due' || state.status === 'suspended')
    && shop.subscription_status !== state.status) {
    const update = await dbRun(
      'UPDATE shops SET subscription_status = ? WHERE id = ? AND COALESCE(subscription_status, ?) = ?',
      [state.status, shop.id, '', shop.subscription_status || ''],
    );
    if (update.changes > 0) shop.subscription_status = state.status;
  }
  return state;
}

async function processSubscriptionAutomation() {
  const now = new Date();
  const reminderConfig = getWhatsAppSubscriptionReminderConfig();
  const currentShops = await loadShopsFromDatabase();
  for (const shop of currentShops) {
    try {
      await refreshSubscriptionState(shop);
      if (!reminderConfig || !shop.whatsapp_subscription_reminders_enabled || shop.last_notification_sent_at) continue;
      const subscription = getSubscriptionState(shop, now);
      const reminderAt = getSubscriptionReminderAt(shop, now);
      const expiresAt = subscription.status === 'trialing' ? subscription.trialEnd : subscription.expiresAt;
      if (!subscription.isActive || !reminderAt || !expiresAt || now < reminderAt) continue;

      const claimedAt = now.toISOString();
      const claim = await dbRun(
        'UPDATE shops SET last_notification_sent_at = ? WHERE id = ? AND last_notification_sent_at IS NULL',
        [claimedAt, shop.id],
      );
      if (claim.changes !== 1) continue;
      shop.last_notification_sent_at = claimedAt;

      const delivery = await sendWhatsAppSubscriptionReminder(shop, expiresAt, reminderConfig);
      if (!delivery.sent) {
        shop.last_notification_sent_at = null;
        await dbRun('UPDATE shops SET last_notification_sent_at = NULL WHERE id = ? AND last_notification_sent_at = ?', [shop.id, claimedAt]);
        console.error(`Automatic subscription reminder failed for shop ${shop.id}: ${delivery.error || 'unknown_error'}`);
        continue;
      }

      await dbRun(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
        VALUES (?, ?, ?, ?, ?)`, [
        'system', 'subscription_reminder_sent', shop.id,
        JSON.stringify({ expires_at: expiresAt, channel: 'whatsapp_business' }), claimedAt,
      ]);
    } catch (error) {
      console.error(`Subscription automation failed for shop ${shop.id}.`, error);
    }
  }
}

export function sanitizeTextField(value: string | null | undefined, maxLength = 200): string {
  const clean = String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

export function validateCustomerOrderInput(input: {
  customer_name?: string;
  customer_phone?: string;
  delivery_location?: string;
  delivery_note?: string;
}): { ok: boolean; customer_name?: string; customer_phone?: string; delivery_location?: string; delivery_note?: string; error?: string } {
  const customerName = sanitizeTextField(input.customer_name, 80);
  const customerPhone = String(input.customer_phone ?? '').trim();
  const deliveryLocation = sanitizeTextField(input.delivery_location, 200);
  const deliveryNote = sanitizeTextField(input.delivery_note, 500);

  if (!customerName || customerName.length < 2) {
    return { ok: false, error: 'Nom client invalide.' };
  }

  const normalizedPhone = customerPhone.replace(/\D/g, '');
  if (!/^(225)?[0-9]{10}$/.test(normalizedPhone) && !/^[+]?225[0-9]{10}$/.test(customerPhone)) {
    return { ok: false, error: 'Numéro de téléphone client invalide.' };
  }

  if (!deliveryLocation || deliveryLocation.length < 3) {
    return { ok: false, error: 'Lieu de livraison invalide.' };
  }

  const normalizedCustomerPhone = customerPhone.startsWith('+') ? customerPhone : `+225${normalizedPhone.replace(/^225/, '')}`;

  return {
    ok: true,
    customer_name: customerName,
    customer_phone: normalizedCustomerPhone,
    delivery_location: deliveryLocation,
    delivery_note: deliveryNote,
  };
}

const demoShops: ShopRecord[] = [
  {
    id: 1,
    name: 'Aya Chic Lingerie & Nuisettes',
    slug: 'aya-chic',
    whatsapp_number: '+2250708091011',
    pin_code_hash: '402138',
    theme_color: '#E11D48',
    welcome_message: 'Lingerie fine & Nuisettes soyeuses à Abidjan. Livraison discrète et soignée dans toute la Côte d\'Ivoire ✨',
    is_open: true,
    is_active: true,
    subscription_status: 'trialing',
    trial_start: addDays(now, -4),
    trial_end: addDays(now, 26),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Abidjan (Cocody Angré)',
    opening_hours: {
      enabled: true,
      open_time: '08:00',
      close_time: '22:00',
      days: [1, 2, 3, 4, 5, 6],
      manual_override: false,
    },
    theme_config: {
      primary_color: '#E11D48',
      secondary_color: '#FFF1F2',
      font_family: 'Poppins',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_wax',
      custom_banner_url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&auto=format&fit=crop&q=80',
      logo_url: '',
      event_mode_enabled: true,
      event_banner_text: '✨ OFFRE SPÉCIALE WEEK-END : -15% SUR TOUTES LES NUISETTES SATIN EN STOCK !',
      advanced_css: {
        borderRadius: 'rounded-2xl',
        shadowIntensity: 'soft',
        accentGlow: true,
      },
    },
  },
  {
    id: 2,
    name: 'Saveurs d\'Attiéké & Grillades Babi',
    slug: 'saveurs-babi',
    whatsapp_number: '+2250504030201',
    pin_code_hash: '402138',
    theme_color: '#C2410C',
    welcome_message: 'Le vrai goût d\'Abidjan ! Poulet fermier & poissons braisés minute au feu de bois. Attiéké frais de Dabou 🍗🔥',
    is_open: true,
    is_active: true,
    subscription_status: 'trialing',
    trial_start: addDays(now, -16),
    trial_end: addDays(now, 14),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    category: 'food',
    city: 'Abidjan (Marcory Zone 4)',
    opening_hours: {
      enabled: true,
      open_time: '11:00',
      close_time: '23:30',
      days: [0, 1, 2, 3, 4, 5, 6],
      manual_override: false,
    },
    theme_config: {
      primary_color: '#C2410C',
      secondary_color: '#FEF2F2',
      font_family: 'Playfair Display',
      layout_style: 'card_landscape',
      theme_preset_id: 'food_braise',
      custom_banner_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: true,
      event_banner_text: '🔥 CHAUFFAGE AU CHARBON DE BOIS : COMMANDEZ AVANT 12H30 POUR ÊTRE LIVRÉ CHAUD !',
      advanced_css: {
        borderRadius: 'rounded-2xl',
        shadowIntensity: 'strong',
        accentGlow: true,
      },
    },
  },
  {
    id: 3,
    name: 'Kouassi Prêt-à-Porter & Wax',
    slug: 'kouassi-tech',
    whatsapp_number: '+2250102030405',
    pin_code_hash: '402138',
    theme_color: '#0F172A',
    welcome_message: 'Chemises en pagne tissé et costumes sur mesure à Treichville. Confection rapide et livraison express ✂️👔',
    is_open: true,
    is_active: true,
    subscription_status: 'trialing',
    trial_start: addDays(now, -15),
    trial_end: addDays(now, 15),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Abidjan (Treichville)',
    opening_hours: {
      enabled: true,
      open_time: '08:30',
      close_time: '19:30',
      days: [1, 2, 3, 4, 5, 6],
      manual_override: false,
    },
    theme_config: {
      primary_color: '#0F172A',
      secondary_color: '#F8FAFC',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_minimal',
      custom_banner_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-xl',
        shadowIntensity: 'subtle',
        accentGlow: false,
      },
    },
  },
  {
    id: 4,
    name: 'Bijoux & Perles Traditionnelles',
    slug: 'perles-abidjan',
    whatsapp_number: '+2250700001122',
    pin_code_hash: '402138',
    theme_color: '#D97706',
    welcome_message: 'Créations artisanales, colliers baoulé et perles de hanches faites main à Grand-Bassam 📿✨',
    is_open: true,
    is_active: true,
    subscription_status: 'trialing',
    trial_start: addDays(now, -26),
    trial_end: addDays(now, 4),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 86 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Grand-Bassam / Abidjan',
    opening_hours: {
      enabled: true,
      open_time: '09:00',
      close_time: '20:00',
      days: [0, 1, 2, 3, 4, 5, 6],
      manual_override: false,
    },
    theme_config: {
      primary_color: '#D97706',
      secondary_color: '#FFFBEB',
      font_family: 'Cinzel',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_minimal',
      custom_banner_url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-xl',
        shadowIntensity: 'subtle',
        accentGlow: false,
      },
    },
  },
];

const shops: ShopRecord[] = shouldSeedDemoData() ? demoShops : [];

const products: ProductRecord[] = shouldSeedDemoData()
  ? [
      {
        id: 1,
        shop_id: 1,
        title: 'Nuisette en Soie Sauvage & Dentelle de Calais',
        description: 'Satin de soie ultra-doux au toucher. Bretelles réglables croisées au dos. Tailles disponibles : M, L, XL. Parfait pour vos nuits douces et élégantes.',
        price: 14500,
        stock: 8,
        image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['S', 'M', 'L', 'XL'],
        colors: [
          { name: 'Rose Poudré', hex: '#E11D48' },
          { name: 'Noir Nuit', hex: '#0F172A' },
          { name: 'Blanc Ivoire', hex: '#F8FAFC' },
        ],
        lookbook_image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200&auto=format&fit=crop&q=80',
      },
      {
        id: 2,
        shop_id: 1,
        title: 'Body Galbant Minceur Invisible Sans Couture',
        description: 'Matière microfibre respirante gainante ventre plat. Totalement invisible sous robe en pagne wax ou tailleur. Confort quotidien 100% garanti.',
        price: 12000,
        stock: 15,
        image_url: 'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['M', 'L', 'XL'],
        colors: [
          { name: 'Beige Peau', hex: '#D97706' },
          { name: 'Noir Profond', hex: '#0F172A' },
        ],
      },
      {
        id: 3,
        shop_id: 1,
        title: 'Ensemble Soutien-Gorge Push-Up & Culotte Soie',
        description: 'Maintien ferme sans armature métallique blessante. Bonnet B et C. Dentelle florale brodée main. Teinte Rouge Passion intemporelle.',
        price: 9500,
        stock: 4,
        image_url: 'https://images.unsplash.com/photo-1579613832125-5d34a13ffe0a?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['S', 'M', 'L'],
        colors: [
          { name: 'Rouge Passion', hex: '#BE123C' },
          { name: 'Noir Satin', hex: '#1E293B' },
        ],
      },
      {
        id: 4,
        shop_id: 1,
        title: 'Peignoir Kimono Satin Doré avec Ceinture',
        description: 'Finition brillante luxueuse, manches 3/4 évasées, passants et ceinture amovible. Longueur genoux. Taille standard ajustable du 36 au 44.',
        price: 18000,
        stock: 2,
        image_url: 'https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['Taille Unique (36-44)'],
        colors: [
          { name: 'Or Champêtre', hex: '#F59E0B' },
          { name: 'Bordeaux Velours', hex: '#881337' },
        ],
        lookbook_image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&auto=format&fit=crop&q=80',
      },
      {
        id: 5,
        shop_id: 2,
        title: 'Poulet Braisé Entier Fermier & Alloco Doré',
        description: 'Poulet fermier mariné 24h au gingembre, ail sauvage et épices de Man. Braisé minute au feu de bois. Servi avec alloco croustillant et piment maison.',
        price: 7000,
        stock: 20,
        image_url: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        prep_time: 20,
        modifier_groups: [
          {
            name: 'Sauce au choix',
            required: true,
            options: [
              { label: 'Piment Rouge Pilé (Babi Hot 🔥)', price_delta: 0 },
              { label: 'Piment Vert Doux Ail & Oignon', price_delta: 0 },
              { label: 'Moutarde & Jus de Citron', price_delta: 0 },
            ],
          },
          {
            name: 'Accompagnement Extra',
            required: false,
            options: [
              { label: 'Attiéké Agbodjama Frais (+500 F)', price_delta: 500 },
              { label: 'Double Alloco Banane Mûre (+500 F)', price_delta: 500 },
              { label: 'Frites d\'Igname Braisées (+1 000 F)', price_delta: 1000 },
            ],
          },
        ],
      },
      {
        id: 6,
        shop_id: 2,
        title: 'Garba Spécial Thon Braisé & Huile Rouge',
        description: 'Gros morceau de thon croustillant à l\'extérieur et tendre à cœur. Servi avec attiéké agbodjama frais de Dabou, oignons émincés et piment rouge pilé.',
        price: 2500,
        stock: 25,
        image_url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        prep_time: 10,
        modifier_groups: [
          {
            name: 'Piment & Assaisonnement',
            required: true,
            options: [
              { label: 'Piment bien écrasé + Cubes', price_delta: 0 },
              { label: 'Piment moyen + Tomate fraîche', price_delta: 0 },
              { label: 'Sans piment (Doux)', price_delta: 0 },
            ],
          },
          {
            name: 'Supplément Poisson',
            required: false,
            options: [
              { label: '2ème Tranche de Thon Frais (+1 500 F)', price_delta: 1500 },
              { label: 'Attiéké Double Dose (+500 F)', price_delta: 500 },
            ],
          },
        ],
      },
      {
        id: 7,
        shop_id: 2,
        title: 'Poisson Bar Frais Braisé (Format XL 1kg)',
        description: 'Pêché du jour à Grand-Bassam. Braisage lent au charbon de bois avec sauce tomate mijotée, frites d\'igname ou attiéké au choix.',
        price: 8500,
        stock: 5,
        image_url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        prep_time: 25,
        modifier_groups: [
          {
            name: 'Cuisson du Poisson',
            required: true,
            options: [
              { label: 'Bien grillé & croustillant', price_delta: 0 },
              { label: 'Tendre & juteux', price_delta: 0 },
            ],
          },
          {
            name: 'Accompagnement Principal',
            required: true,
            options: [
              { label: 'Attiéké de Dabou (Inclus)', price_delta: 0 },
              { label: 'Alloco Banane Mûre (Inclus)', price_delta: 0 },
              { label: 'Frites d\'Igname Salées (Inclus)', price_delta: 0 },
            ],
          },
        ],
      },
      {
        id: 8,
        shop_id: 3,
        title: 'Chemise Homme Pagne Wax & Lin Beige',
        description: 'Coupe slim moderne, col mandarin boutonné, finitions en lin pur et empiècement wax véritable. Idéal pour cérémonies ou vendredis chic.',
        price: 18500,
        stock: 7,
        image_url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['M', 'L', 'XL', 'XXL'],
        colors: [
          { name: 'Beige & Bleu Wax', hex: '#2563EB' },
          { name: 'Blanc & Or', hex: '#D97706' },
        ],
      },
      {
        id: 9,
        shop_id: 3,
        title: 'Ensemble Veste Tailleur Femme Wax Imprimé',
        description: 'Veste cintrée avec épaulettes structurées et pantalon carotte assorti. Tissu coton wax certifié ne déteint pas au lavage.',
        price: 32000,
        stock: 5,
        image_url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['S', 'M', 'L'],
        colors: [
          { name: 'Motif Étoile Babi', hex: '#C2410C' },
          { name: 'Motif Soleil Royal', hex: '#E11D48' },
        ],
        lookbook_image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&auto=format&fit=crop&q=80',
      },
      {
        id: 10,
        shop_id: 3,
        title: 'Boubou Moderne Brodé Main Deux Pièces',
        description: 'Bazin riche teinté artisanalement à Bouaké. Broderies fines au fil de soie sur le col et les manches. Vient avec pantalon coupe droite.',
        price: 45000,
        stock: 3,
        image_url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80',
        is_available: true,
        sizes: ['L', 'XL', 'XXL'],
        colors: [
          { name: 'Bleu Nuit Brodé Or', hex: '#1E3A8A' },
          { name: 'Blanc Majestueux', hex: '#F8FAFC' },
        ],
      },
    ]
  : [];

const orders: OrderRecord[] = shouldSeedDemoData()
  ? [
      {
        id: 1,
        shop_id: 1,
        customer_name: 'Affoué Konan',
        customer_phone: '+2250748123456',
        delivery_location: 'Cocody Riviera 3, près du carrefour Cap Nord',
        delivery_note: 'Portail blanc en face de la pharmacie',
        payment_method_preference: 'wave',
        total_amount: 26500,
        created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
        status: 'confirmed',
        items: [
          { id: 1, order_id: 1, product_id: 1, product_title: 'Nuisette en Soie Sauvage', quantity: 1, unit_price: 14500 },
          { id: 2, order_id: 1, product_id: 2, product_title: 'Body Galbant Minceur', quantity: 1, unit_price: 12000 },
        ],
      },
      {
        id: 2,
        shop_id: 1,
        customer_name: 'Mariam Diabaté',
        customer_phone: '+2250567891011',
        delivery_location: 'Marcory Biétry, Rue du Canal',
        delivery_note: 'Appelez dès que le livreur est au carrefour',
        payment_method_preference: 'mobile_money',
        total_amount: 18000,
        created_at: new Date(Date.now() - 22 * 3600000).toISOString(),
        status: 'delivered',
        items: [
          { id: 3, order_id: 2, product_id: 4, product_title: 'Peignoir Kimono Satin Doré', quantity: 1, unit_price: 18000 },
        ],
      },
      {
        id: 3,
        shop_id: 2,
        customer_name: 'Bamba Souleymane',
        customer_phone: '+2250102039988',
        delivery_location: 'Koumassi Remblais, Terminus 05',
        delivery_note: 'Paiement à la livraison',
        payment_method_preference: 'mobile_money',
        total_amount: 9500,
        created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
        status: 'pending',
        items: [
          { id: 4, order_id: 3, product_id: 5, product_title: 'Poulet Braisé Entier Fermier', quantity: 1, unit_price: 7000 },
          { id: 5, order_id: 3, product_id: 6, product_title: 'Garba Spécial Thon Braisé', quantity: 1, unit_price: 2500 },
        ],
      },
    ]
  : [];

const hashPin = (pin: string) => bcrypt.hashSync(String(pin).trim(), 10);
const hashAccessToken = (token: string) => createHash('sha256').update(token).digest('hex');
const timingSafeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && cryptoTimingSafeEqual(leftBuffer, rightBuffer);
};
const {
  merchantSessions,
  customerSessions,
  adminSessions,
  sessionDurationMs: SESSION_DURATION_MS,
  adminSessionDurationMs: ADMIN_SESSION_DURATION_MS,
  dummyCustomerPasswordHash: DUMMY_CUSTOMER_PASSWORD_HASH,
  getCookie,
  setCustomerSessionCookie,
  clearCustomerSessionCookie,
  createMerchantSession,
  clearSessionCookie,
  setAdminSessionCookie,
  getAdminSession,
  getSessionStateForResponse,
  requireCustomerAccess,
  getCustomerSessionState,
  requireAdminAccess,
  requireMerchantOwner,
  requireMerchantAccess,
  requireMerchantOwnShop,
  requireMerchantIdentityOwnShop,
  cleanupExpiredSessions,
} = createAuthSessionHelpers({ shops, refreshSubscriptionState });

export const isBlockedStaticAsset = (requestPath: string) => {
  const normalized = String(requestPath || '').split('?')[0].split('#')[0].replace(/\\+/g, '/');
  if (!normalized || normalized === '/') return false;
  const fileName = normalized.split('/').pop()?.toLowerCase() || '';
  return fileName.endsWith('.cjs') || fileName.endsWith('.map') || normalized.includes('server.cjs') || normalized.includes('server.cjs.map');
};

export function validateRuntimeConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const requiredKeys = ['ADMIN_ACCESS_KEY', 'APP_URL', 'PORT', 'DATABASE_URL'];
  const missing = requiredKeys.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length > 0) {
    throw new Error(`Configuration production incomplète : ${missing.join(', ')}.`);
  }

  const adminAccessKey = String(process.env.ADMIN_ACCESS_KEY || '').trim();
  if (adminAccessKey.length < 32 || /change_me|demo|example|03062004/i.test(adminAccessKey)) {
    throw new Error('ADMIN_ACCESS_KEY doit être une clé forte, unique et longue d’au moins 32 caractères en production.');
  }

  if (DEMO_MODE) {
    return;
  }

  const appUrl = String(process.env.APP_URL || '').trim();
  let parsedAppUrl: URL;
  try {
    parsedAppUrl = new URL(appUrl);
  } catch {
    throw new Error('APP_URL doit être une URL publique HTTPS complète en production.');
  }

  if (parsedAppUrl.protocol !== 'https:') {
    throw new Error('APP_URL doit être une URL publique HTTPS complète en production.');
  }

  if (/example\.com|localhost|127\.0\.0\.1/i.test(appUrl) || /change_me|demo/i.test(appUrl)) {
    throw new Error('APP_URL doit pointer vers un domaine public réel en production, pas vers example.com, localhost ou un domaine d’exemple.');
  }

  if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
    throw new Error('APP_URL doit pointer vers un domaine public réel en production, pas vers localhost.');
  }

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT doit être un entier valide entre 1 et 65535 en production.');
  }

}

export function getRateLimitClientAddress(req: Pick<Request, 'ip' | 'socket'>) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const rateLimitPublicRequest = createPublicRateLimitMiddleware(getRateLimitClientAddress);

export async function rotateMerchantAccessTokenForShop(shopId: number, previousToken?: string): Promise<string> {
  const token = randomUUID();
  const hashedToken = hashAccessToken(token);
  const params: unknown[] = [hashedToken, shopId];
  const expectedTokenCondition = previousToken ? ' AND owner_access_token_hash = ?' : '';
  if (previousToken) params.push(hashAccessToken(previousToken));
  const result = await dbRun(
    `UPDATE shops SET owner_access_token_hash = ? WHERE id = ?${expectedTokenCondition}`,
    params,
  );
  if (result.changes !== 1) throw new Error('Impossible de renouveler le lien marchand : boutique introuvable ou lien précédent déjà remplacé.');
  const cachedShop = shops.find((candidate) => candidate.id === shopId);
  if (cachedShop) cachedShop.owner_access_token_hash = hashedToken;
  return token;
}

setInterval(async () => {
  await cleanupExpiredSessions();
  try {
    await dbRun('DELETE FROM didit_webhook_events WHERE received_at < ?', [new Date(Date.now() - 30 * 86400000).toISOString()]);
    for (const shop of await loadShopsFromDatabase()) await refreshSubscriptionState(shop);
  } catch (error) {
    console.error('Unable to synchronize expired subscriptions or clean expired Didit events.', error);
  }
  await processSubscriptionAutomation();
}, 15 * 60 * 1000).unref();

const toSafeShop = (shop: ShopRecord) => {
  const subscription = getSubscriptionState(shop);
  const {
    pin_code_hash: _pinCodeHash,
    owner_access_token_hash: _ownerAccessTokenHash,
    owner_email: _ownerEmail,
    ...safeShop
  } = shop;
  return { ...safeShop, subscription };
};
const verifyPin = (inputPin: string, storedHash: string) => {
  const pin = String(inputPin).trim();
  if (!pin || !storedHash) return false;
  try {
    return bcrypt.compareSync(pin, storedHash);
  } catch {
    return false;
  }
};

const findShopByPhone = (phone: string) => {
  const cleanInputPhone = phone.replace(/[^0-9]/g, '');
  return shops.find((s) => {
    const cleanShopPhone = s.whatsapp_number.replace(/[^0-9]/g, '');
    return (
      cleanShopPhone === cleanInputPhone ||
      cleanShopPhone.includes(cleanInputPhone) ||
      cleanInputPhone.includes(cleanShopPhone) ||
      cleanShopPhone.slice(-8) === cleanInputPhone.slice(-8)
    );
  });
};

function sanitizeProductAttributes(attributes: unknown, category: ShopCategory): Record<string, string> | undefined {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return undefined;
  const allowedFields = new Set(getCategoryDefaults(category).productAttributes.map((field) => field.key));
  const entries = Object.entries(attributes as Record<string, unknown>)
    .filter(([key, value]) => allowedFields.has(key) && typeof value === 'string')
    .map(([key, value]) => [key, sanitizeTextField(value as string, 200)] as const)
    .filter(([, value]) => value.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function refreshRuntimeDataFromDatabase() {
  const persistedShops = await loadShopsFromDatabase();
  shops.splice(0, shops.length, ...persistedShops);
  products.splice(0, products.length, ...await loadProductsFromDatabase());
  orders.splice(0, orders.length, ...await loadOrdersFromDatabase());
}

async function startServer() {
  validateRuntimeConfig();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const verificationRouters = createMerchantVerificationRouter({ dbRun, dbGet, dbAll, dbTransaction, requireMerchantIdentityOwnShop });

  applySecurityHeaders(app);

  const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  app.set('trust proxy', Number.isInteger(trustedProxyHops) && trustedProxyHops > 0 ? trustedProxyHops : false);

  app.use((req: Request, res: Response, next: express.NextFunction) => {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const isSecureRequest = req.secure || forwardedProto === 'https';
    if (process.env.NODE_ENV === 'production' && !isSecureRequest) {
      return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
    }
    next();
  });

  app.use('/api/webhooks/didit', express.raw({ type: 'application/json', limit: '64kb' }), verificationRouters.webhookRouter);

  app.use('/api/shops/:id', async (req: Request, res: Response, next: express.NextFunction) => {
    const shopId = Number(req.params.id);
    const mutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (!mutatingMethod || !Number.isSafeInteger(shopId) || shopId <= 0
      || !await getShopFromDatabase(shopId) || !await getAdminSession(req)) {
      return next();
    }
    res.once('finish', () => {
      void dbRun(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'admin_shop_operation', shopId, JSON.stringify({
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
        }), new Date().toISOString()],
      ).catch((error: unknown) => console.error('Impossible d’enregistrer l’action super-admin sur la boutique.', error));
    });
    next();
  });

  app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buffer) => {
      if (req.url?.split('?')[0] === '/api/webhooks/kadevpay') {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      }
    },
  }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/api/admin', requireAdminAccess);
  app.use('/api/admin', createAdminRouter({
    shops,
    products,
    orders,
    databaseMode,
    dbAll,
    dbGet,
    dbRun,
    dbTransaction,
    refreshRuntimeDataFromDatabase,
    persistShop,
    toSafeShop,
    rotateMerchantAccessTokenForShop,
  }));
  app.use('/api/admin/identity-verifications', verificationRouters.adminRouter);
  const maintenanceHtmlPath = path.join(process.cwd(), process.env.NODE_ENV === 'production' ? 'dist' : 'public', 'maintenance.html');
  const maintenanceHtml = fs.readFileSync(maintenanceHtmlPath, 'utf-8');
  app.use(createMaintenanceModeMiddleware(async () => {
    const settings = await dbGet<{ maintenance_enabled: number | boolean; maintenance_message: string }>(
      'SELECT maintenance_enabled, maintenance_message FROM platform_settings WHERE id = 1',
    );
    return {
      enabled: Boolean(settings?.maintenance_enabled),
      message: settings?.maintenance_message || 'Le service revient bientôt. Merci de votre patience.',
    };
  }, maintenanceHtml));
  await initializeDatabase();
  await dbRun('DELETE FROM didit_webhook_events WHERE received_at < ?', [new Date(Date.now() - 30 * 86400000).toISOString()]);
  await migrateExistingSessionTokens();
  await seedDemoDatabaseIfEmpty({ shops, products, orders, shouldSeedDemoData, hashPin });

  shops.forEach((shop) => {
    if (!shop.pin_code_hash.startsWith('$2')) {
      shop.pin_code_hash = hashPin(shop.pin_code_hash);
    }
  });

  const persistedShops = await loadShopsFromDatabase();
  shops.splice(0, shops.length, ...persistedShops);
  const persistedProducts = await loadProductsFromDatabase();
  products.splice(0, products.length, ...persistedProducts);
  const persistedOrders = await loadOrdersFromDatabase();
  orders.splice(0, orders.length, ...persistedOrders);
  // --- API ROUTES ---

  app.use('/api', createTelemetryRouter({ shops, rateLimitPublicRequest, dbGet, dbRun }));
  app.use('/api', createKadevPayRouter({ shops, requireMerchantOwnShop }));

  // Health check

  // 1. SHOPS
  const publicShopsRouter = createPublicShopsRouter({
    merchantSessions,
    getCookie,
    isRequestFingerprintMatch,
    computeIsShopOpen,
    isAdminShopSession: async (req, shopId) =>
      Number(req.params.slug) === shopId && Boolean(await getAdminSession(req)),
  });
  app.use('/api/v1/catalog/storefronts', publicShopsRouter);
  app.use('/api/shops', publicShopsRouter);
  app.use('/api/shops', createShopManagementRouter({
    dbAll,
    requireMerchantAccess,
    requireMerchantOwnShop,
    addDays,
    trialDurationDays: TRIAL_DURATION_DAYS,
    rotateMerchantAccessTokenForShop,
    persistShop,
    toSafeShop,
    normalizeWhatsAppPhone,
    isWeakShopPin,
    hashPin,
    isShopCategory,
    normalizeCustomBannerImage,
    sanitizeTextField,
  }));
  app.use('/api/shops', verificationRouters.merchantRouter);

  app.use('/api/shops', createShopRegistrationRouter({
    rateLimitPublicRequest,
    allocateShopId: () => allocateRecordId('shops'),
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
    trialDurationDays: TRIAL_DURATION_DAYS,
    computeIsShopOpen,
    createMerchantSession,
    toSafeShop,
  }));

  app.use('/api/auth', createAuthRouter({
    sessionDurationMs: SESSION_DURATION_MS,
    adminSessionDurationMs: ADMIN_SESSION_DURATION_MS,
    dummyCustomerPasswordHash: DUMMY_CUSTOMER_PASSWORD_HASH,
    merchantSessions,
    customerSessions,
    adminSessions,
    rateLimitPublicRequest,
    getRateLimitClientAddress,
    verifyPin,
    toSafeShop,
    createMerchantSession,
    getCookie,
    clearSessionCookie,
    clearCustomerSessionCookie,
    getSessionStateForResponse,
    refreshSubscriptionState,
    deleteMerchantSessionRecord,
    deleteCustomerSessionRecord,
    hashAccessToken,
    dbGet,
    dbRun,
    sanitizeTextField,
    getCustomerSessionState,
    getAdminSession,
    deleteAdminSessionRecord,
    saveAdminSessionRecord,
    saveCustomerSessionRecord,
    setAdminSessionCookie,
    setCustomerSessionCookie,
    buildSessionFingerprint,
  }));
  app.use('/api/customer-engagement', createCustomerEngagementRouter({
    shops,
    products,
    getCustomerSessionState,
    rateLimitPublicRequest,
  }));

  // 3. PRODUCTS MANAGEMENT (Merchant /app)
  app.use('/api/shops/:id/products', createProductRouter({
    products,
    requireMerchantAccess,
    allocateProductId: () => allocateRecordId('products'),
    persistProduct,
    sanitizeTextField,
    normalizeProductImage,
    sanitizeGalleryImages,
    sanitizeProductAttributes,
    trialProductLimit: TRIAL_CATALOG_LIMIT,
  }));

  app.use('/api/shops', createMerchantOrdersRouter({
    shops,
    products,
    orders,
    requireMerchantAccess,
    isSameBusinessDay,
    summarizeOrderMetrics,
  }));

  app.use('/api', createOrderRouter({
    shops,
    products,
    orders,
    rateLimitPublicRequest,
    validateCustomerOrderInput,
    computeIsShopOpen,
    getCustomerSessionState,
    hashAccessToken,
    timingSafeEqual,
    getValidSelectedModifiers,
    getProductUnitPriceWithModifiers,
  }));

  const {
    getPublicOrigin,
    injectNoIndexSeo,
    injectFaqSeo,
    injectHowItWorksSeo,
    injectShopOpenGraph,
    injectLegalSeo,
    injectDiscoverySeo,
    injectShopDirectorySeo,
  } = createSeoHtmlHelpers({ shops, products, sanitizeTextField });

  const shouldServePublicHtml = (req: Request) => {
    const accept = String(req.headers.accept || '');
    const isGet = req.method === 'GET';
    const isLikelyHtml = accept.includes('text/html') || accept.includes('*/*') || accept === '' || (!accept.includes('application/json') && !accept.includes('application/javascript'));
    return isGet && isLikelyHtml;
  };
  const isPrivateSeoPath = (pathname: string) => {
    const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return ['/app', '/admin', '/compte', '/connexion', '/inscription', '/recuperation-acces']
      .some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
  };
  const isFrontendPagePath = (pathname: string) => pathname !== '/' && !pathname.startsWith('/api/') && !pathname.startsWith('/@') && !path.extname(pathname);

  app.use(createSeoRouter({ getPublicOrigin, escapeHtml }));

  // Vite middleware for development vs. Production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.NODE_ENV === 'test' ? false : { port: Math.min(PORT + 1, 65535) },
      },
      appType: 'spa',
    });

    app.use(async (req: Request, res: Response, next: express.NextFunction) => {
      if (req.path === '/app' && typeof req.query.access === 'string' && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          }).end(injectNoIndexSeo(transformed, 'Espace commerçant | MaTable.ci'));
        } catch (error) {
          return next(error);
        }
      }

      if (req.path === '/__preview/merchant-plans' && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectNoIndexSeo(transformed, 'Aperçu des formules commerçants | MaTable.ci'));
        } catch (error) {
          return next(error);
        }
      }

      const seoShops = await loadShopsFromDatabase();
      const seoProducts = await loadProductsFromDatabase();
      const {
        injectLegalSeo: injectCurrentLegalSeo,
        injectDiscoverySeo: injectCurrentDiscoverySeo,
        injectShopDirectorySeo: injectCurrentShopDirectorySeo,
        injectShopOpenGraph: injectCurrentShopOpenGraph,
      } = createSeoHtmlHelpers({ shops: seoShops, products: seoProducts, sanitizeTextField });
      const url = req.originalUrl.split('?')[0];
      const pathSegments = url.split('/').filter(Boolean);
      const matchSlug = pathSegments.length === 1 && !url.startsWith('/api') && !url.startsWith('/@') && !url.includes('.')
        ? pathSegments[0]
        : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug)
        ? seoShops.find((shop) => shop.slug === matchSlug && isShopPubliclyVisible(shop))
        : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;
      const discoveryPage = findPublicDiscoveryPage(url, seoShops.filter((shop) => isShopPubliclyVisible(shop)));

      if (req.path.replace(/\/+$/, '') === '/comment-ca-marche' && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectHowItWorksSeo(transformed, req));
        } catch (error) {
          return next(error);
        }
      }
      if (req.path.replace(/\/+$/, '') === '/boutiques' && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectCurrentShopDirectorySeo(transformed, req));
        } catch (error) {
          return next(error);
        }
      }
      if (req.path.replace(/\/+$/, '') === '/faq' && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectFaqSeo(transformed, req));
        } catch (error) {
          return next(error);
        }
      }
      if (targetShop && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          const finalHtml = injectCurrentShopOpenGraph(transformed, targetShop, req);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(finalHtml);
        } catch (e) {
          return next(e);
        }
      }
      if (legalPage && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectCurrentLegalSeo(transformed, legalPage, req));
        } catch (e) {
          return next(e);
        }
      }
      if (discoveryPage && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectCurrentDiscoverySeo(transformed, discoveryPage, req));
        } catch (e) {
          return next(e);
        }
      }
      if (isPrivateSeoPath(req.path) && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectNoIndexSeo(transformed, 'Espace MaTable.ci'));
        } catch (error) {
          return next(error);
        }
      }
      if (isFrontendPagePath(req.path) && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          return res.status(404).set({ 'Content-Type': 'text/html' }).end(injectNoIndexSeo(transformed, 'Page introuvable | MaTable.ci'));
        } catch (error) {
          return next(error);
        }
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    const baseHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf-8') : '';

    app.use((req: Request, res: Response, next: express.NextFunction) => {
      if (isBlockedStaticAsset(req.path)) {
        return res.status(403).json({ error: 'Fichier backend non autorisé.' });
      }
      next();
    });

    app.use(express.static(distPath, { index: false }));

    app.get('/{*splat}', async (req: Request, res: Response) => {
      if (req.path === '/app' && typeof req.query.access === 'string') {
        return res.status(200).set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          }).send(injectNoIndexSeo(baseHtml, 'Espace commerçant | MaTable.ci'));
      }

      const seoShops = await loadShopsFromDatabase();
      const seoProducts = await loadProductsFromDatabase();
      const {
        injectLegalSeo: injectCurrentLegalSeo,
        injectDiscoverySeo: injectCurrentDiscoverySeo,
        injectShopDirectorySeo: injectCurrentShopDirectorySeo,
        injectShopOpenGraph: injectCurrentShopOpenGraph,
      } = createSeoHtmlHelpers({ shops: seoShops, products: seoProducts, sanitizeTextField });
      const url = req.originalUrl.split('?')[0];
      const pathSegments = url.split('/').filter(Boolean);
      const matchSlug = pathSegments.length === 1 && !url.startsWith('/api') && !url.includes('.') ? pathSegments[0] : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug)
        ? seoShops.find((shop) => shop.slug === matchSlug && isShopPubliclyVisible(shop))
        : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;
      const discoveryPage = findPublicDiscoveryPage(req.path, seoShops.filter((shop) => isShopPubliclyVisible(shop)));

      if (req.path.replace(/\/+$/, '') === '/comment-ca-marche' && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectHowItWorksSeo(baseHtml, req));
      }
      if (req.path.replace(/\/+$/, '') === '/boutiques' && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectCurrentShopDirectorySeo(baseHtml, req));
      }
      if (req.path.replace(/\/+$/, '') === '/faq' && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectFaqSeo(baseHtml, req));
      }
      if (targetShop && baseHtml && shouldServePublicHtml(req)) {
        const customHtml = injectCurrentShopOpenGraph(baseHtml, targetShop, req);
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(customHtml);
      }

      if (legalPage && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectCurrentLegalSeo(baseHtml, legalPage, req));
      }

      if (discoveryPage && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectCurrentDiscoverySeo(baseHtml, discoveryPage, req));
      }

      if (isPrivateSeoPath(req.path) && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectNoIndexSeo(baseHtml, 'Espace MaTable.ci'));
      }
      if (isFrontendPagePath(req.path) && shouldServePublicHtml(req)) {
        return res.status(404).set({ 'Content-Type': 'text/html' }).send(injectNoIndexSeo(baseHtml, 'Page introuvable | MaTable.ci'));
      }
      return res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server MaTable.ci running on port ${PORT}`);
    void processSubscriptionAutomation();
  });
}

const isDirectServerRun = () => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  const resolved = path.resolve(invoked);
  return resolved === path.resolve(process.cwd(), 'server.ts') || resolved.endsWith('/server.ts') || resolved.endsWith('/build/server.cjs');
};

if (isDirectServerRun()) {
  startServer();
}
