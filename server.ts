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
import { createMerchantOrdersRouter } from './server/routes/merchantOrders.ts';
import { createOrderRouter } from './server/routes/orders.ts';
import { createAdminRouter } from './server/routes/admin.ts';
import { createPublicShopsRouter } from './server/routes/publicShops.ts';
import { createShopManagementRouter } from './server/routes/shopManagement.ts';
import { createShopRegistrationRouter } from './server/routes/shopRegistration.ts';
import { createMerchantVerificationRouter } from './server/routes/merchantVerification.ts';
import { createTelemetryRouter } from './server/routes/telemetry.ts';
import { createKadevPayRouter } from './server/routes/kadevPay.ts';
import { toCustomerProfile } from './server/services/customerProfile.ts';
import { getWhatsAppSubscriptionReminderConfig, sendWhatsAppSubscriptionReminder } from './server/services/whatsappNotifications.ts';
import { applySecurityHeaders } from './server/middleware/securityHeaders.ts';
import type { OrderRecord, ProductRecord, ShopOpeningHours, ShopRecord, SubscriptionPlanConfig, SubscriptionState, SubscriptionStatus, SubscriptionTier } from './server/types.ts';
import { loadProductsFromDatabase, persistProduct } from './server/repositories/products.ts';
import { loadShopsFromDatabase, persistShop } from './server/repositories/shops.ts';
import { loadOrdersFromDatabase, persistOrder } from './server/repositories/orders.ts';
import { allocateRecordId } from './server/repositories/ids.ts';
import {
  deleteAdminSessionRecord,
  deleteCustomerSessionRecord,
  deleteMerchantSessionRecord,
  getAdminSessionRecord,
  getCustomerSessionRecord,
  getMerchantSessionRecord,
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
import type { ShopCategory } from './src/utils/categoryDefaults.ts';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number };
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

const TRIAL_DURATION_DAYS = 30;

// Set realistic future dates for subscriptions
const now = new Date();
const addDays = (d: Date, days: number) => {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res.toISOString().split('T')[0];
};

async function refreshSubscriptionState(shop: ShopRecord): Promise<SubscriptionState> {
  const state = getSubscriptionState(shop);
  if (state.status === 'expired' && shop.subscription_status !== 'expired') {
    shop.subscription_status = 'expired';
    await persistShop(shop);
  }
  return state;
}

async function processSubscriptionAutomation() {
  const now = new Date();
  const reminderConfig = getWhatsAppSubscriptionReminderConfig();
  for (const shop of shops) {
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

      await persistShop(shop);
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
const merchantSessions = new Map<string, { shopId: number; expiresAt: number; fingerprint: string }>();
const adminSessions = new Map<string, { expiresAt: number; fingerprint: string }>();
const customerSessions = new Map<string, { userId: number; expiresAt: number; fingerprint: string }>();

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const publicRequestLimits = new Map<string, { count: number; resetAt: number }>();
const DUMMY_CUSTOMER_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_REQUEST_WINDOW_MS = 60 * 1000;
const MAX_PUBLIC_REQUESTS_PER_WINDOW = 60;
const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const timingSafeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && cryptoTimingSafeEqual(leftBuffer, rightBuffer);
};

export const isBlockedStaticAsset = (requestPath: string) => {
  const normalized = String(requestPath || '').split('?')[0].split('#')[0].replace(/\\+/g, '/');
  if (!normalized || normalized === '/') return false;
  const fileName = normalized.split('/').pop()?.toLowerCase() || '';
  return fileName.endsWith('.cjs') || fileName.endsWith('.map') || normalized.includes('server.cjs') || normalized.includes('server.cjs.map');
};

function getCookie(req: Request, name: string): string | null {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.trim().slice(name.length + 1));
  } catch {
    return null;
  }
}

function setSessionCookie(res: Response, token: string, fingerprint: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAgeSeconds = Math.max(1, Math.floor(SESSION_DURATION_MS / 1000));
  const sessionCookie = `matable_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  const fingerprintCookie = `matable_session_fp=${encodeURIComponent(fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  res.setHeader('Set-Cookie', [sessionCookie, fingerprintCookie]);
}

function setCustomerSessionCookie(res: Response, token: string, fingerprint: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAgeSeconds = Math.max(1, Math.floor(SESSION_DURATION_MS / 1000));
  const sessionCookie = `matable_customer_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  const fingerprintCookie = `matable_customer_session_fp=${encodeURIComponent(fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  res.setHeader('Set-Cookie', [sessionCookie, fingerprintCookie]);
}

function clearCustomerSessionCookie(res: Response) {
  const expiredBase = '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  res.setHeader('Set-Cookie', [`matable_customer_session=;${expiredBase}`, `matable_customer_session_fp=;${expiredBase}`]);
}

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

export function buildSessionFingerprint(req: Request): string {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const acceptLanguage = String(req.headers['accept-language'] || '').trim();
  const normalized = `${userAgent}|${acceptLanguage}`;
  return createHash('sha256').update(normalized).digest('hex');
}

export function isRequestFingerprintMatch(session: { fingerprint?: string } | null | undefined, req: Request): boolean {
  if (!session?.fingerprint) return false;
  const current = buildSessionFingerprint(req);
  return timingSafeEqual(current, session.fingerprint);
}

async function createMerchantSession(res: Response, shopId: number, req: Request) {
  const sessionToken = randomUUID();
  const session = { shopId, expiresAt: Date.now() + SESSION_DURATION_MS, fingerprint: buildSessionFingerprint(req) };
  merchantSessions.set(sessionToken, session);
  await saveMerchantSessionRecord(sessionToken, session);
  setSessionCookie(res, sessionToken, session.fingerprint);
}

function clearSessionCookie(res: Response) {
  const expiredBase = '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  res.setHeader('Set-Cookie', [`matable_session=;${expiredBase}`, `matable_session_fp=;${expiredBase}`]);
}

function setAdminSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAgeSeconds = Math.max(1, Math.floor(ADMIN_SESSION_DURATION_MS / 1000));
  res.setHeader('Set-Cookie', `matable_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
}

async function getAdminSession(req: Request): Promise<string | null> {
  const token = getCookie(req, 'matable_admin_session');
  let session = token ? adminSessions.get(token) : undefined;

  if (!session && token) {
    session = (await getAdminSessionRecord(token)) ?? undefined;
    if (session) adminSessions.set(token, session);
  }

  if (!token || !session || session.expiresAt <= Date.now()) {
    if (token) {
      adminSessions.delete(token);
      await deleteAdminSessionRecord(token);
    }
    return null;
  }

  if (!isRequestFingerprintMatch(session, req)) {
    adminSessions.delete(token);
    await deleteAdminSessionRecord(token);
    return null;
  }

  const renewedSession = { ...session, expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS };
  adminSessions.set(token, renewedSession);
  await saveAdminSessionRecord(token, renewedSession);
  return token;
}

async function getSessionStateForResponse(req: Request, res?: Response) {
  const adminToken = getCookie(req, 'matable_admin_session');
  if (adminToken) {
    const adminSessionToken = await getAdminSession(req);
    if (adminSessionToken) {
      if (res) setAdminSessionCookie(res, adminSessionToken);
      return { authenticated: true, userType: 'admin', shopId: null };
    }
  }

  const merchantToken = getCookie(req, 'matable_session');
  const customerToken = getCookie(req, 'matable_customer_session');
  if (customerToken && !merchantToken) {
    let customerSession = customerSessions.get(customerToken) ?? (await getCustomerSessionRecord(customerToken)) ?? undefined;
    if (!customerSession) {
      return { authenticated: false, userType: null, shopId: null, user: null };
    }
    if (customerSession.expiresAt <= Date.now()) {
      customerSessions.delete(customerToken);
      await deleteCustomerSessionRecord(customerToken);
      return { authenticated: false, userType: null, shopId: null, user: null };
    }
    if (!isRequestFingerprintMatch(customerSession, req)) {
      customerSessions.delete(customerToken);
      await deleteCustomerSessionRecord(customerToken);
      if (res) clearCustomerSessionCookie(res);
      return { authenticated: false, userType: null, shopId: null, user: null };
    }
    const user = await dbGet<{ id: number; name: string; first_name: string | null; last_name: string | null; phone: string; email: string; is_active: number }>('SELECT id, name, first_name, last_name, phone, email, is_active FROM users WHERE id = ?', [customerSession.userId]);
    if (!user || !user.is_active) {
      customerSessions.delete(customerToken);
      await deleteCustomerSessionRecord(customerToken);
      if (res) clearCustomerSessionCookie(res);
      return { authenticated: false, userType: null, shopId: null, user: null };
    }
    const renewedSession = { ...customerSession, expiresAt: Date.now() + SESSION_DURATION_MS };
    customerSessions.set(customerToken, renewedSession);
    await saveCustomerSessionRecord(customerToken, renewedSession);
    if (res) setCustomerSessionCookie(res, customerToken, renewedSession.fingerprint);
    return { authenticated: true, userType: 'customer', shopId: null, user: toCustomerProfile(user) };
  }

  if (merchantToken) {
    let merchantSession = merchantSessions.get(merchantToken) ?? (await getMerchantSessionRecord(merchantToken)) ?? undefined;
    if (!merchantSession) {
      return { authenticated: false, userType: null, shopId: null };
    }
    if (merchantSession.expiresAt <= Date.now()) {
      merchantSessions.delete(merchantToken);
      await deleteMerchantSessionRecord(merchantToken);
      return { authenticated: false, userType: null, shopId: null };
    }
    if (!isRequestFingerprintMatch(merchantSession, req)) {
      merchantSessions.delete(merchantToken);
      await deleteMerchantSessionRecord(merchantToken);
      return { authenticated: false, userType: null, shopId: null };
    }

    const renewedSession = { ...merchantSession, expiresAt: Date.now() + SESSION_DURATION_MS };
    merchantSessions.set(merchantToken, renewedSession);
    await saveMerchantSessionRecord(merchantToken, renewedSession);
    if (res) setSessionCookie(res, merchantToken, renewedSession.fingerprint);
    const shop = shops.find((candidate) => candidate.id === renewedSession.shopId);
    if (shop) await refreshSubscriptionState(shop);
    return { authenticated: true, userType: 'merchant', shopId: renewedSession.shopId };
  }

  return { authenticated: false, userType: null, shopId: null };
}

async function requireCustomerAccess(req: Request, res: Response, next: express.NextFunction) {
  const token = getCookie(req, 'matable_customer_session');
  let session = token ? customerSessions.get(token) : undefined;

  if (!session && token) {
    session = (await getCustomerSessionRecord(token)) ?? undefined;
    if (session) customerSessions.set(token, session);
  }

  if (!token || !session || session.expiresAt <= Date.now()) {
    if (token) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
    }
    return res.status(401).json({ error: 'Authentification client requise.' });
  }

  if (!isRequestFingerprintMatch(session, req)) {
    if (token) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
    }
    return res.status(401).json({ error: 'Session client rejetée pour sécurité.' });
  }

  const user = await dbGet<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', [session.userId]);
  if (!user || !user.is_active) {
    customerSessions.delete(token);
    await deleteCustomerSessionRecord(token);
    clearCustomerSessionCookie(res);
    return res.status(401).json({ error: 'Authentification client requise.' });
  }

  const renewedSession = { ...session, expiresAt: Date.now() + SESSION_DURATION_MS };
  customerSessions.set(token, renewedSession);
  await saveCustomerSessionRecord(token, renewedSession);
  res.setHeader('Set-Cookie', [
    `matable_customer_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor(SESSION_DURATION_MS / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    `matable_customer_session_fp=${encodeURIComponent(renewedSession.fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor(SESSION_DURATION_MS / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ]);
  req.user = { id: session.userId } as any;
  next();
}

async function getCustomerSessionState(req: Request, res?: Response) {
  const token = getCookie(req, 'matable_customer_session');
  if (!token) return { authenticated: false, userType: null, user: null };
  let session = customerSessions.get(token) ?? (await getCustomerSessionRecord(token)) ?? undefined;

  if (!session) return { authenticated: false, userType: null, user: null };
  if (session.expiresAt <= Date.now()) {
    customerSessions.delete(token);
    await deleteCustomerSessionRecord(token);
    return { authenticated: false, userType: null, user: null };
  }
  if (!isRequestFingerprintMatch(session, req)) {
    customerSessions.delete(token);
    await deleteCustomerSessionRecord(token);
    if (res) clearCustomerSessionCookie(res);
    return { authenticated: false, userType: null, user: null };
  }

  const user = await dbGet<{ id: number; name: string; first_name: string | null; last_name: string | null; phone: string; email: string; created_at: string; is_active: number }>('SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE id = ?', [session.userId]);
  if (!user || !user.is_active) {
    customerSessions.delete(token);
    await deleteCustomerSessionRecord(token);
    if (res) clearCustomerSessionCookie(res);
    return { authenticated: false, userType: null, user: null };
  }

  const renewedSession = { ...session, expiresAt: Date.now() + SESSION_DURATION_MS };
  customerSessions.set(token, renewedSession);
  await saveCustomerSessionRecord(token, renewedSession);
  if (res) setCustomerSessionCookie(res, token, renewedSession.fingerprint);

  return { authenticated: true, userType: 'customer', user: toCustomerProfile(user) };
}

async function requireAdminAccess(req: Request, res: Response, next: express.NextFunction) {
  if (!await getAdminSession(req)) {
    return res.status(401).json({ error: 'Authentification super-admin requise.' });
  }
  next();
}

export function getRateLimitClientAddress(req: Pick<Request, 'ip' | 'socket'>) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimitPublicRequest(limit: number = MAX_PUBLIC_REQUESTS_PER_WINDOW) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    const key = `${req.method}:${req.path}:${getRateLimitClientAddress(req)}`;
    const now = Date.now();
    const current = publicRequestLimits.get(key);
    if (!current || current.resetAt <= now) {
      publicRequestLimits.set(key, { count: 1, resetAt: now + PUBLIC_REQUEST_WINDOW_MS });
      return next();
    }
    current.count += 1;
    if (current.count > limit) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    next();
  };
}

async function requireMerchantIdentity(req: Request, res: Response): Promise<ShopRecord | null> {
  const token = getCookie(req, 'matable_session');
  let session = token ? merchantSessions.get(token) : undefined;

  if (!session && token) {
    session = (await getMerchantSessionRecord(token)) ?? undefined;
    if (session) {
      merchantSessions.set(token, session);
    }
  }

  if (!session || session.expiresAt <= Date.now() || session.shopId !== Number(req.params.id)) {
    if (token) {
      merchantSessions.delete(token);
      await deleteMerchantSessionRecord(token);
    }
    res.status(401).json({ error: 'Session marchand invalide ou expirée.' });
    return null;
  }

  if (!isRequestFingerprintMatch(session, req)) {
    if (token) {
      merchantSessions.delete(token);
      await deleteMerchantSessionRecord(token);
    }
    clearSessionCookie(res);
    res.status(401).json({ error: 'Session rejetée pour sécurité : appareil ou navigateur non reconnu.' });
    return null;
  }

  const shop = shops.find((candidate) => candidate.id === session.shopId);
  if (!shop) {
    res.status(404).json({ error: 'Boutique introuvable.' });
    return null;
  }
  return shop;
}

async function requireMerchantOwner(req: Request, res: Response, next: express.NextFunction) {
  if (!await requireMerchantIdentity(req, res)) return;
  next();
}

async function requireMerchantAccess(req: Request, res: Response, next: express.NextFunction) {
  const shop = await requireMerchantIdentity(req, res);
  if (!shop) return;

  if (!shop.is_active) {
    return res.status(403).json({ error: 'Boutique inactive : contactez l’administration pour la réactivation.' });
  }

  next();
}

async function requireMerchantOwnShop(req: Request, res: Response, next: express.NextFunction) {
  const shop = await requireMerchantIdentity(req, res);
  if (!shop) return;
  if (!shop.is_active) return res.status(403).json({ error: 'Boutique inactive : contactez l’administration pour la réactivation.' });
  if (Number(req.params.id) !== shop.id) return res.status(403).json({ error: 'Accès refusé à cette boutique.' });
  next();
}

function isLoginRateLimited(key: string): boolean {
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_LOGIN_ATTEMPTS;
}

function getCustomerLoginLockSeconds(key: string): number {
  const current = loginAttempts.get(key);
  if (!current) return 0;
  if (current.resetAt <= Date.now()) {
    loginAttempts.delete(key);
    return 0;
  }
  return current.count >= MAX_LOGIN_ATTEMPTS ? Math.ceil((current.resetAt - Date.now()) / 1000) : 0;
}

function recordCustomerLoginFailure(key: string): number {
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
    return 1;
  }
  current.count += 1;
  return current.count;
}

export async function rotateMerchantAccessTokenForShop(shopId: number, previousToken?: string): Promise<string> {
  const token = randomUUID();
  const shop = shops.find((candidate) => candidate.id === shopId);
  if (!shop) return token;

  const hashedToken = hashAccessToken(token);
  shop.owner_access_token_hash = hashedToken;
  if (previousToken) {
    const previousHash = hashAccessToken(previousToken);
    if (shop.owner_access_token_hash === previousHash) {
      shop.owner_access_token_hash = hashedToken;
    }
  }
  await persistShop(shop);
  return token;
}

setInterval(async () => {
  const now = Date.now();
  for (const [token, session] of merchantSessions) {
    if (session.expiresAt <= now) {
      merchantSessions.delete(token);
      await deleteMerchantSessionRecord(token);
    }
  }
  await dbRun('DELETE FROM merchant_sessions WHERE expires_at <= ?', [now]);
  for (const [token, session] of adminSessions) {
    if (session.expiresAt <= now) {
      adminSessions.delete(token);
      await deleteAdminSessionRecord(token);
    }
  }
  await dbRun('DELETE FROM admin_sessions WHERE expires_at <= ?', [now]);
  for (const [key, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(key);
  }
  for (const [key, limit] of publicRequestLimits) {
    if (limit.resetAt <= now) publicRequestLimits.delete(key);
  }
  try {
    for (const shop of shops) await refreshSubscriptionState(shop);
  } catch (error) {
    console.error('Unable to synchronize expired subscriptions.', error);
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

async function seedDatabaseIfEmpty() {
  if (databaseMode === 'postgresql') return;
  if (process.env.NODE_ENV === 'production' && !shouldSeedDemoData()) {
    return;
  }

  const shopRow = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM shops');
  if (Number(shopRow?.count || 0) > 0) {
    return;
  }

  const insertShop = `
    INSERT INTO shops (
      id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active,
      publication_status, subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const insertProduct = `
    INSERT INTO products (
      id, shop_id, title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const shop of shops) {
    await dbRun(insertShop, [
      shop.id,
      shop.name,
      shop.slug,
      shop.whatsapp_number,
      hashPin(shop.pin_code_hash),
      shop.theme_color,
      shop.welcome_message,
      shop.is_open ? 1 : 0,
      shop.is_active ? 1 : 0,
      shop.publication_status || (shop.is_active ? 'active' : 'suspended'),
      shop.trial_end ?? null,
      shop.last_notification_sent_at,
      shop.created_at,
      shop.category,
      shop.city ?? null,
      'standard',
      JSON.stringify(shop.theme_config)
    ]);

    for (const product of products.filter((p) => p.shop_id === shop.id)) {
      await dbRun(insertProduct, [
        product.id,
        product.shop_id,
        product.title,
        product.description ?? null,
        product.price,
        product.stock,
        product.image_url,
        product.is_available ? 1 : 0,
        product.category ?? null,
        product.sizes ? JSON.stringify(product.sizes) : null,
        product.colors ? JSON.stringify(product.colors) : null,
        product.lookbook_image ?? null,
        product.prep_time ?? null,
        product.modifier_groups ? JSON.stringify(product.modifier_groups) : null
      ]);
    }
  }

  const orderCount = await dbGet<{ count: number }>('SELECT COUNT(*) as count FROM orders');
  if (Number(orderCount?.count || 0) === 0) {
    const insertOrder = `
      INSERT INTO orders (
        id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
        delivery_slot, payment_method_preference, total_amount, created_at, status, items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const order of orders) {
      await dbRun(insertOrder, [
        order.id,
        order.shop_id,
        order.customer_name,
        order.customer_phone,
        order.delivery_location,
        order.delivery_note ?? null,
        order.delivery_slot ?? null,
        order.payment_method_preference,
        order.total_amount,
        order.created_at,
        order.status || 'pending',
        JSON.stringify(order.items ?? [])
      ]);
    }
  }
}

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
  const verificationRouters = createMerchantVerificationRouter({ dbRun, dbGet, dbAll, requireMerchantOwnShop, shops });

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
    refreshRuntimeDataFromDatabase,
    persistShop,
    toSafeShop,
    rotateMerchantAccessTokenForShop,
  }));
  app.use('/api/admin/identity-verifications', verificationRouters.adminRouter);
  await initializeDatabase();
  await migrateExistingSessionTokens();
  await seedDatabaseIfEmpty();

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
  app.use('/api/shops', createPublicShopsRouter({
    shops,
    products,
    merchantSessions,
    getCookie,
    isRequestFingerprintMatch,
    computeIsShopOpen,
  }));
  app.use('/api/shops', createShopManagementRouter({
    shops,
    orders,
    dbAll,
    refreshRuntimeDataFromDatabase,
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
    shops,
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
    persistShop,
    createMerchantSession,
    toSafeShop,
    dbGet,
  }));

  app.use('/api/auth', createAuthRouter({
    shops,
    sessionDurationMs: SESSION_DURATION_MS,
    adminSessionDurationMs: ADMIN_SESSION_DURATION_MS,
    dummyCustomerPasswordHash: DUMMY_CUSTOMER_PASSWORD_HASH,
    merchantSessions,
    customerSessions,
    adminSessions,
    loginAttempts,
    rateLimitPublicRequest,
    isLoginRateLimited,
    getCustomerLoginLockSeconds,
    recordCustomerLoginFailure,
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

  // 3. PRODUCTS MANAGEMENT (Merchant /app)
  app.use('/api/shops/:id/products', createProductRouter({
    products,
    findShop: (shopId) => shops.find((shop) => shop.id === shopId),
    requireMerchantAccess,
    allocateProductId: () => allocateRecordId('products'),
    persistProduct,
    deleteProduct: async (productId, shopId) => {
      await dbRun('DELETE FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
    },
    sanitizeTextField,
    normalizeProductImage,
    sanitizeGalleryImages,
    sanitizeProductAttributes,
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

  const getPublicOrigin = (req: Request) => String(process.env.APP_URL || `${req.protocol || 'https'}://${req.get('host') || 'matable.ci'}`).replace(/\/$/, '');

  const injectShopOpenGraph = (html: string, targetShop: ShopRecord, req: Request) => {
    const origin = getPublicOrigin(req);
    const shopUrl = `${origin}/${encodeURIComponent(targetShop.slug)}`;
    const title = `${sanitizeTextField(targetShop.name, 100)} — Boutique locale en Côte d’Ivoire | MaTable.ci`;
    const description = sanitizeTextField(targetShop.welcome_message || `Découvrez le catalogue de ${targetShop.name} et commandez directement sur WhatsApp.`, 160);
    const defaultImage = `${origin}/icon-512.svg`;
    const customImage = targetShop.theme_config?.custom_banner_url;
    const image = customImage && /^https?:\/\//i.test(String(customImage)) ? String(customImage) : defaultImage;
    const shopProducts = products
      .filter((product) => product.shop_id === targetShop.id && product.is_available && product.stock > 0)
      .slice(0, 30);
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: targetShop.name,
      description,
      url: shopUrl,
      image,
      telephone: targetShop.whatsapp_number,
      address: {
        '@type': 'PostalAddress',
        addressLocality: targetShop.city || 'Abidjan',
        addressCountry: 'CI',
      },
      areaServed: 'Côte d’Ivoire',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Catalogue ${targetShop.name}`,
        itemListElement: shopProducts.map((product) => ({
          '@type': 'Offer',
          priceCurrency: 'XOF',
          price: product.price,
          availability: 'https://schema.org/InStock',
          itemOffered: {
            '@type': 'Product',
            name: product.title,
            description: product.description || undefined,
            image: product.image_url,
          },
        })),
      },
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const meta = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large" />`,
      `<link rel="canonical" href="${escapeHtml(shopUrl)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${escapeHtml(shopUrl)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(targetShop.name)}" />`,
      `<meta property="og:locale" content="fr_CI" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');

    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace('</head>', `  ${meta}\n  </head>`);
  };

  const injectLegalSeo = (html: string, page: string, req: Request) => {
    const metadata: Record<string, { title: string; description: string }> = {
      'mentions-legales': { title: 'Mentions légales | MaTable.ci', description: 'Mentions légales et responsabilités de la plateforme MaTable.ci.' },
      confidentialite: { title: 'Politique de confidentialité | MaTable.ci', description: 'Politique de confidentialité et traitement des données sur MaTable.ci.' },
      cgu: { title: 'Conditions générales d’utilisation | MaTable.ci', description: 'Conditions générales d’utilisation des vitrines et services MaTable.ci.' },
      cookies: { title: 'Politique relative aux cookies | MaTable.ci', description: 'Informations sur les cookies et traceurs utilisés par MaTable.ci.' },
    };
    const content = metadata[page];
    if (!content) return html;
    const canonical = `${getPublicOrigin(req)}/${page}`;
    return html
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(content.title)}</title>`)
      .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${escapeHtml(content.description)}" />`)
      .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
      .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${escapeHtml(content.title)}" />`)
      .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${escapeHtml(content.description)}" />`);
  };

  const shouldServePublicHtml = (req: Request) => {
    const accept = String(req.headers.accept || '');
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    const isGet = req.method === 'GET';
    const isLikelyHtml = accept.includes('text/html') || accept.includes('*/*') || accept === '' || (!accept.includes('application/json') && !accept.includes('application/javascript'));
    const isSocialCrawler = ua.includes('whatsapp') || ua.includes('facebookexternalhit') || ua.includes('twitterbot') || ua.includes('linkedin');
    return isGet && isLikelyHtml && !isSocialCrawler;
  };

  app.use(createSeoRouter({ shops, getPublicOrigin, escapeHtml }));

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
          }).end(transformed);
        } catch (error) {
          return next(error);
        }
      }

      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.startsWith('/@') && !url.includes('.')
        ? url.substring(1).split('/')[0]
        : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug)
        ? shops.find((shop) => shop.slug === matchSlug && isShopPubliclyVisible(shop))
        : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;

      if (targetShop && shouldServePublicHtml(req)) {
        try {
          const indexHtmlPath = path.join(process.cwd(), 'index.html');
          const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
          const transformed = await vite.transformIndexHtml(req.originalUrl, raw);
          const finalHtml = injectShopOpenGraph(transformed, targetShop, req);
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
          return res.status(200).set({ 'Content-Type': 'text/html' }).end(injectLegalSeo(transformed, legalPage, req));
        } catch (e) {
          return next(e);
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

    app.get('/{*splat}', (req: Request, res: Response) => {
      if (req.path === '/app' && typeof req.query.access === 'string') {
        return res.sendFile(indexHtmlPath, {
          headers: {
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      }

      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.includes('.') ? url.substring(1).split('/')[0] : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug)
        ? shops.find((shop) => shop.slug === matchSlug && isShopPubliclyVisible(shop))
        : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;

      if (targetShop && baseHtml && shouldServePublicHtml(req)) {
        const customHtml = injectShopOpenGraph(baseHtml, targetShop, req);
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(customHtml);
      }

      if (legalPage && baseHtml && shouldServePublicHtml(req)) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectLegalSeo(baseHtml, legalPage, req));
      }

      res.sendFile(indexHtmlPath);
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
