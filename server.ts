import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash, createHmac, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { db, initializeDatabase } from './db.ts';
import { sendWhatsAppCloudTemplate, sendWhatsAppCloudText } from './whatsapp.ts';

const EXTERNAL_INTEGRATIONS_LOCKED = true;
const DEMO_MODE = String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';

export function shouldSeedDemoData(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return String(process.env.DEMO_MODE || '').trim().toLowerCase() === 'true';
}

interface ShopOpeningHours {
  enabled: boolean;
  open_time: string; // "08:00"
  close_time: string; // "22:00"
  days?: number[];
  manual_override?: boolean;
}

export type SubscriptionTier = 'standard' | 'premium' | 'pro';

export interface SubscriptionPlanConfig {
  tier: SubscriptionTier;
  amount: number;
  label: string;
  description: string;
}

interface ShopRecord {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string;
  pin_code_hash: string;
  theme_color: string;
  welcome_message: string | null;
  is_open: boolean;
  is_active: boolean;
  payment_status: 'pending' | 'awaiting_review' | 'approved' | 'rejected' | 'suspended';
  payment_deadline_at?: string | null;
  selected_subscription_tier?: SubscriptionTier;
  subscription_expires_at: string;
  last_notification_sent_at: string | null;
  created_at: string;
  category: 'fashion' | 'food' | 'beauty' | 'electronics' | 'home' | 'services' | 'health' | 'crafts' | 'education' | 'automotive' | 'other';
  city?: string;
  subscription_tier: SubscriptionTier;
  opening_hours?: ShopOpeningHours;
  owner_access_token_hash?: string | null;
  theme_config: {
    primary_color: string;
    secondary_color: string;
    font_family: 'Plus Jakarta Sans' | 'Playfair Display' | 'Cinzel' | 'Poppins';
    layout_style: 'grid_portrait' | 'card_landscape';
    theme_preset_id?: string;
    custom_banner_url?: string;
    logo_url?: string;
    event_mode_enabled?: boolean;
    event_banner_text?: string;
    advanced_css?: {
      borderRadius?: 'rounded-none' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl';
      shadowIntensity?: 'none' | 'subtle' | 'soft' | 'strong';
      accentGlow?: boolean;
    };
  };
}

interface ProductRecord {
  id: number;
  shop_id: number;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string;
  is_available: boolean;
  category?: string;
  // Fashion attributes
  sizes?: string[];
  colors?: { name: string; hex: string }[];
  lookbook_image?: string;
  // Food attributes
  prep_time?: number; // minutes
  modifier_groups?: {
    name: string;
    required?: boolean;
    max_selections?: number;
    options: { label: string; price_delta: number }[];
  }[];
}

interface OrderRecord {
  id: number;
  shop_id: number;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  delivery_note?: string;
  delivery_slot?: string;
  payment_method_preference: 'wave' | 'mobile_money';
  total_amount: number;
  created_at: string;
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  items?: {
    id: number;
    order_id: number;
    product_id: number;
    product_title?: string;
    quantity: number;
    unit_price: number;
    selected_size?: string;
    selected_color?: string;
    selected_modifiers?: string;
  }[];
}

// In-memory Database with persistent initial seed
let nextShopId = 5;
let nextProductId = 11;
let nextOrderId = 5;
let nextItemId = 10;

// Set realistic future dates for subscriptions
const now = new Date();
const addDays = (d: Date, days: number) => {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res.toISOString().split('T')[0];
};

// Automatic Shop Opening/Closing Engine (GMT / UTC+0 Ivory Coast)
function computeIsShopOpen(shop: ShopRecord): boolean {
  if (shop.opening_hours && shop.opening_hours.enabled && !shop.opening_hours.manual_override) {
    const d = new Date();
    // Ivory Coast (Abidjan) is UTC+0
    const currentMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    const currentDay = d.getUTCDay(); // 0 = Dimanche, 1 = Lundi...

    if (shop.opening_hours.days && shop.opening_hours.days.length > 0) {
      if (!shop.opening_hours.days.includes(currentDay)) {
        return false;
      }
    }

    const [openH, openM] = (shop.opening_hours.open_time || '08:00').split(':').map(Number);
    const [closeH, closeM] = (shop.opening_hours.close_time || '22:00').split(':').map(Number);
    const openMinutes = (openH || 0) * 60 + (openM || 0);
    const closeMinutes = (closeH || 0) * 60 + (closeM || 0);

    if (closeMinutes >= openMinutes) {
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } else {
      // Overnight (e.g. 18:00 to 02:00)
      return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    }
  }
  return Boolean(shop.is_open);
}

function getProductUnitPriceWithModifiers(product: ProductRecord, selectedModifiers: string[] = []): number {
  const selected = new Set(selectedModifiers.map((value) => value.trim()).filter(Boolean));

  if (!product.modifier_groups || product.modifier_groups.length === 0) {
    return product.price;
  }

  let modifierTotal = 0;

  for (const group of product.modifier_groups) {
    for (const option of group.options) {
      const label = typeof option === 'string' ? option : option.label;
      if (selected.has(label)) {
        modifierTotal += typeof option === 'string' ? 0 : Number(option.price_delta || 0);
      }
    }
  }

  return product.price + modifierTotal;
}

function getValidSelectedModifiers(product: ProductRecord, selectedModifiers: string[]) {
  const selected = new Set(selectedModifiers.map((value) => value.trim()).filter(Boolean));
  const valid: string[] = [];
  for (const group of product.modifier_groups || []) {
    const labels = group.options.map((option) => option.label).filter((label) => selected.has(label));
    const maxSelections = Math.max(1, Number(group.max_selections || 1));
    valid.push(...labels.slice(0, maxSelections));
  }
  return valid;
}

function normalizeWhatsAppPhone(phone: unknown): string | null {
  const cleaned = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (/^(01|05|07)\d{8}$/.test(cleaned)) return `+225${cleaned}`;
  if (/^225(01|05|07)\d{8}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

export function getSubscriptionPlanConfig(tier: SubscriptionTier | string): SubscriptionPlanConfig {
  const normalizedTier = (tier === 'premium' || tier === 'pro' || tier === 'standard') ? tier : 'standard';
  const options: Record<SubscriptionTier, SubscriptionPlanConfig> = {
    standard: { tier: 'standard', amount: 3000, label: 'Standard', description: 'Vitrine + catalogue + commandes' },
    premium: { tier: 'premium', amount: 4000, label: 'Premium', description: 'Tout Standard + thèmes premium' },
    pro: { tier: 'pro', amount: 5000, label: 'Pro', description: 'Tout Premium + studio avancé' },
  };
  return options[normalizedTier];
}

export type PaymentProvider = 'whatsapp' | 'paystack';

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

export function getConfiguredPaymentProvider(): PaymentProvider {
  return 'whatsapp';
}

export function buildPaymentInstructionMessage(
  shopName: string,
  tier: SubscriptionTier | string,
  amount: number,
  paymentLink: string,
  paymentProvider: PaymentProvider = 'paystack',
): string {
  const plan = getSubscriptionPlanConfig(tier);
  const chosenAmount = Number.isFinite(amount) && amount > 0 ? amount : plan.amount;
  const safePaymentLink = paymentLink || 'https://paystack.com/pay/matable-ci';

  if (paymentProvider === 'paystack') {
    return [
      `Bienvenue sur MaTable.ci, ${shopName}.`,
      `Pour activer votre boutique, choisissez le forfait ${plan.label} (${chosenAmount} FCFA).`,
      'Options disponibles : Standard 3000 FCFA | Premium 4000 FCFA | Pro 5000 FCFA.',
      `Paiement requis : cliquez sur ce lien sécurisé Paystack pour finaliser votre paiement : ${safePaymentLink}`,
      'Important : votre paiement doit être confirmé sur Paystack dans les 20 minutes. Sans confirmation, la boutique est suspendue automatiquement.',
      'Une fois le paiement confirmé, la boutique est activée automatiquement sans validation manuelle.',
    ].join('\n');
  }

  return [
    `Bienvenue sur MaTable.ci, ${shopName}.`,
    `Pour activer votre boutique, choisissez le forfait ${plan.label} (${chosenAmount} FCFA).`,
    'Options disponibles : Standard 3000 FCFA | Premium 4000 FCFA | Pro 5000 FCFA.',
    `Paiement requis : cliquez sur ce lien sécurisé Paystack pour finaliser votre paiement : ${safePaymentLink}`,
    'Important : votre paiement doit être confirmé sur Paystack dans les 20 minutes. Sans confirmation, la boutique est suspendue automatiquement.',
    'Une fois le paiement confirmé, la boutique est activée automatiquement sans validation manuelle.',
  ].join('\n');
}

function getPaymentContactPhone(): string {
  const configured = normalizeWhatsAppPhone(process.env.PAYMENT_CONTACT_PHONE || process.env.WHATSAPP_ADMIN_PHONE || '+2250700000000');
  return configured || '+2250700000000';
}

function getPaymentLinkForShop(shopName: string, selectedTier: SubscriptionTier): string {
  const plan = getSubscriptionPlanConfig(selectedTier);
  const contactNumber = getPaymentContactPhone().replace(/\D/g, '');
  const paymentText = encodeURIComponent(`Bonjour, je souhaite payer le forfait ${plan.label} (${plan.amount} FCFA) pour la boutique ${shopName}. Veuillez me confirmer la réception du paiement et m’envoyer le reçu.`);
  return `https://wa.me/${contactNumber}?text=${paymentText}`;
}

export function isPaymentReferenceProcessed(
  provider: PaymentProvider | string,
  reference: string,
  shopId?: number,
): boolean {
  const normalizedProvider = String(provider || 'paystack').trim() || 'paystack';
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) return false;

  const row = shopId
    ? db.prepare('SELECT 1 FROM payment_transactions WHERE provider = ? AND reference = ? AND shop_id = ? LIMIT 1').get(normalizedProvider, normalizedReference, shopId)
    : db.prepare('SELECT 1 FROM payment_transactions WHERE provider = ? AND reference = ? LIMIT 1').get(normalizedProvider, normalizedReference);

  return Boolean(row);
}

export function markPaymentReferenceProcessed(
  provider: PaymentProvider | string,
  reference: string,
  shopId: number,
  tier: SubscriptionTier | string,
  amount: number,
): boolean {
  const normalizedProvider = String(provider || 'paystack').trim() || 'paystack';
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference || !Number.isFinite(shopId)) {
    return false;
  }

  const normalizedTier = ['standard', 'premium', 'pro'].includes(String(tier || 'standard')) ? String(tier) : 'standard';
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;

  const result = db.prepare(`
    INSERT OR IGNORE INTO payment_transactions (provider, reference, shop_id, tier, amount, transaction_date, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(normalizedProvider, normalizedReference, shopId, normalizedTier, normalizedAmount, new Date().toISOString());

  return result.changes > 0;
}

export async function activateShopSubscription(
  shop: ShopRecord,
  tier: SubscriptionTier | string,
  provider: PaymentProvider = 'paystack',
  reference?: string,
  amount?: number,
): Promise<{ activated: boolean; already_processed: boolean; payment_status: ShopRecord['payment_status']; tier: SubscriptionTier; amount: number; message: string; }> {
  const normalizedTier = ['standard', 'premium', 'pro'].includes(String(tier || shop.subscription_tier || 'standard'))
    ? String(tier || shop.subscription_tier || 'standard') as SubscriptionTier
    : (shop.selected_subscription_tier || shop.subscription_tier || 'standard');

  const normalizedReference = reference ? String(reference).trim() : '';
  const planAmount = getSubscriptionPlanConfig(normalizedTier).amount;
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : planAmount;

  if (normalizedReference && isPaymentReferenceProcessed(provider, normalizedReference, shop.id)) {
    const currentTier = shop.subscription_tier || normalizedTier;
    return {
      activated: false,
      already_processed: true,
      payment_status: shop.payment_status === 'approved' ? 'approved' : shop.payment_status,
      tier: currentTier,
      amount: normalizedAmount,
      message: `Cette référence de paiement a déjà été consommée pour ${shop.name}.`,
    };
  }

  if (normalizedReference) {
    markPaymentReferenceProcessed(provider, normalizedReference, shop.id, normalizedTier, normalizedAmount);
  }

  shop.subscription_tier = normalizedTier;
  shop.selected_subscription_tier = normalizedTier;
  shop.payment_status = 'approved';
  shop.is_active = true;
  shop.payment_deadline_at = null;
  shop.subscription_expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
  persistShop(shop);

  const confirmationMessage = `Paiement validé pour ${shop.name}. Votre boutique MaTable.ci est désormais activée pour 30 jours.`;

  return {
    activated: true,
    already_processed: false,
    payment_status: 'approved',
    tier: normalizedTier,
    amount: normalizedAmount,
    message: confirmationMessage,
  };
}

export async function verifyPaystackTransaction(reference: string): Promise<{ verified: boolean; reference: string; shopId?: number; tier: SubscriptionTier; amount: number; currency: string; status: string; } | null> {
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) return null;

  const config = getPaystackConfig();
  if (!config.enabled) return null;

  if (isPaystackMockMode()) {
    const mockMatch = normalizedReference.match(/^MOCK-(\d+)-(standard|premium|pro)-(\d+)$/i);
    return {
      verified: true,
      reference: normalizedReference,
      shopId: mockMatch ? Number(mockMatch[1]) : undefined,
      tier: mockMatch ? mockMatch[2].toLowerCase() as SubscriptionTier : 'standard',
      amount: mockMatch ? Number(mockMatch[3]) : 0,
      currency: config.currency,
      status: 'success',
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/transaction/verify/${encodeURIComponent(normalizedReference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        Accept: 'application/json',
      },
    });

    const result: any = await response.json();
    if (!response.ok || !result?.status) {
      return { verified: false, reference: normalizedReference, tier: 'standard', amount: 0, currency: config.currency, status: String(result?.message || 'failed') };
    }

    const tierValue = String(result?.data?.metadata?.tier || 'standard');
    const tier = ['standard', 'premium', 'pro'].includes(tierValue) ? tierValue as SubscriptionTier : 'standard';
    const amount = Number(result?.data?.amount || 0) / 100;
    const currency = String(result?.data?.currency || '').trim().toUpperCase();
    const shopId = Number(result?.data?.metadata?.shop_id || 0) || undefined;

    return {
      verified: String(result?.data?.status || '').toLowerCase() === 'success',
      reference: normalizedReference,
      shopId,
      tier,
      amount,
      currency,
      status: String(result?.data?.status || 'unknown'),
    };
  } catch (error) {
    console.error('Paystack verification failed:', error);
    return null;
  }
}

export interface PaystackConfig {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  currency: string;
  baseUrl: string;
}

export function getPaystackConfig(): PaystackConfig {
  const publicKey = String(process.env.PAYSTACK_PUBLIC_KEY || '').trim();
  const secretKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.PAYSTACK_WEBHOOK_SECRET || '').trim();
  const currency = String(process.env.PAYSTACK_CURRENCY || 'XOF').trim().toUpperCase() || 'XOF';

  return {
    enabled: false,
    publicKey,
    secretKey,
    webhookSecret,
    currency,
    baseUrl: 'https://api.paystack.co',
  };
}

export function isPaystackMockMode(): boolean {
  return false;
}

export function buildPaystackCheckoutPayload({
  email,
  amount,
  reference,
  shopName,
  tier,
  callbackUrl,
  shopId,
}: {
  email: string;
  amount: number;
  reference: string;
  shopName?: string;
  tier?: SubscriptionTier | string;
  callbackUrl?: string;
  shopId?: number;
}): {
  email: string;
  amount: number;
  currency: string;
  reference: string;
  callback_url: string;
  channels: string[];
  metadata: {
    custom_fields: { display_name: string; variable_name: string; value: string }[];
    shop_name: string;
    tier: string;
    shop_id?: number;
    app: string;
  };
} {
  const config = getPaystackConfig();
  const parsedAmount = Number(amount || 0);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? Math.round(parsedAmount * 100) : 0;

  return {
    email: String(email || '').trim(),
    amount: normalizedAmount,
    currency: config.currency || 'NGN',
    reference: String(reference || `MAT-${Date.now()}`),
    callback_url: String(callbackUrl || `${process.env.APP_URL || 'http://localhost:3000'}/paystack/callback`),
    channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    metadata: {
      custom_fields: [{ display_name: 'Boutique', variable_name: 'shop_name', value: shopName || 'MaTable.ci' }],
      shop_name: shopName || 'MaTable.ci',
      tier: String(tier || 'standard'),
      ...(shopId ? { shop_id: Number(shopId) } : {}),
      app: 'matable-ci',
    },
  };
}

const shops: ShopRecord[] = [
  {
    id: 1,
    name: 'Aya Chic Lingerie & Nuisettes',
    slug: 'aya-chic',
    whatsapp_number: '+2250708091011',
    pin_code_hash: '123456',
    theme_color: '#E11D48',
    welcome_message: 'Lingerie fine & Nuisettes soyeuses à Abidjan. Livraison discrète et soignée dans toute la Côte d\'Ivoire ✨',
    is_open: true,
    is_active: true,
    payment_status: 'approved',
    payment_deadline_at: null,
    selected_subscription_tier: 'premium',
    subscription_expires_at: addDays(now, 26), // 26 days left
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Abidjan (Cocody Angré)',
    subscription_tier: 'premium',
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
    pin_code_hash: '123456',
    theme_color: '#C2410C',
    welcome_message: 'Le vrai goût d\'Abidjan ! Poulet fermier & poissons braisés minute au feu de bois. Attiéké frais de Dabou 🍗🔥',
    is_open: true,
    is_active: true,
    payment_status: 'approved',
    payment_deadline_at: null,
    selected_subscription_tier: 'pro',
    subscription_expires_at: addDays(now, 14),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    category: 'food',
    city: 'Abidjan (Marcory Zone 4)',
    subscription_tier: 'pro',
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
    pin_code_hash: '123456',
    theme_color: '#0F172A',
    welcome_message: 'Chemises en pagne tissé et costumes sur mesure à Treichville. Confection rapide et livraison express ✂️👔',
    is_open: true,
    is_active: true,
    payment_status: 'approved',
    payment_deadline_at: null,
    selected_subscription_tier: 'standard',
    subscription_expires_at: addDays(now, 45),
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Abidjan (Treichville)',
    subscription_tier: 'standard',
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
    pin_code_hash: '123456',
    theme_color: '#D97706',
    welcome_message: 'Créations artisanales, colliers baoulé et perles de hanches faites main à Grand-Bassam 📿✨',
    is_open: true,
    is_active: true,
    payment_status: 'approved',
    payment_deadline_at: null,
    selected_subscription_tier: 'standard',
    subscription_expires_at: addDays(now, 4), // J-4 alert demo!
    last_notification_sent_at: null,
    created_at: new Date(Date.now() - 86 * 86400000).toISOString(),
    category: 'fashion',
    city: 'Grand-Bassam / Abidjan',
    subscription_tier: 'standard',
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

const products: ProductRecord[] = [
  // Shop 1: Aya Chic Lingerie (Fashion)
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
      { name: 'Blanc Ivoire', hex: '#F8FAFC' }
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
      { name: 'Noir Profond', hex: '#0F172A' }
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
      { name: 'Noir Satin', hex: '#1E293B' }
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
      { name: 'Bordeaux Velours', hex: '#881337' }
    ],
    lookbook_image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&auto=format&fit=crop&q=80',
  },

  // Shop 2: Saveurs d'Attiéké (Food)
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

  // Shop 3: Kouassi Prêt-à-Porter (Fashion)
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
];

const orders: OrderRecord[] = [
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
];

const hashPin = (pin: string) => bcrypt.hashSync(String(pin).trim(), 10);
const hashAccessToken = (token: string) => createHash('sha256').update(token).digest('hex');
const merchantSessions = new Map<string, { shopId: number; expiresAt: number; fingerprint: string }>();
const adminSessions = new Map<string, number>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const merchantRecoveryAttempts = new Map<number, { count: number; resetAt: number }>();
const merchantRecoveryTokens = new Map<string, { shopId: number; expiresAt: number }>();
const merchantRecoveryCodes = new Map<string, { shopId: number; codeHash: string; expiresAt: number; attempts: number }>();
const publicRequestLimits = new Map<string, { count: number; resetAt: number }>();
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_REQUEST_WINDOW_MS = 60 * 1000;
const MAX_PUBLIC_REQUESTS_PER_WINDOW = 60;
const RECOVERY_TOKEN_VALIDITY_MS = 15 * 60 * 1000;
const RECOVERY_CODE_VALIDITY_MS = 10 * 60 * 1000;
const MAX_RECOVERY_CODE_ATTEMPTS = 5;
const MAX_RECOVERY_ATTEMPTS_PER_DAY = 2;
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;
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
  const sessionCookie = `matable_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`;
  const fingerprintCookie = `matable_session_fp=${encodeURIComponent(fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`;
  res.setHeader('Set-Cookie', [sessionCookie, fingerprintCookie]);
}

export function validateRuntimeConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (String(process.env.PAYSTACK_MOCK_MODE || '').trim().toLowerCase() === 'true') {
    throw new Error('PAYSTACK_MOCK_MODE ne doit pas être activé en production.');
  }

  const requiredKeys = ['ADMIN_ACCESS_KEY', 'APP_URL', 'PORT', 'MATABLE_DB_PATH'];
  const missing = requiredKeys.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length > 0) {
    throw new Error(`Configuration production incomplète : ${missing.join(', ')}.`);
  }

  const adminAccessKey = String(process.env.ADMIN_ACCESS_KEY || '').trim();
  if (adminAccessKey.length < 16 || /change_me|demo|example/i.test(adminAccessKey)) {
    throw new Error('ADMIN_ACCESS_KEY doit être une clé forte et non par défaut en production.');
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

  if (String(process.env.PAYSTACK_MOCK_MODE || '').trim().toLowerCase() === 'true') {
    throw new Error('PAYSTACK_MOCK_MODE ne doit pas être activé en production.');
  }
}

export function buildSessionFingerprint(req: Request): string {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const acceptLanguage = String(req.headers['accept-language'] || '').trim();
  const clientIp = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
  const normalized = `${userAgent}|${acceptLanguage}|${clientIp}`;
  return createHash('sha256').update(normalized).digest('hex');
}

export function isRequestFingerprintMatch(session: { fingerprint?: string } | null | undefined, req: Request): boolean {
  if (!session?.fingerprint) return false;
  const current = buildSessionFingerprint(req);
  return timingSafeEqual(current, session.fingerprint);
}

function createMerchantSession(res: Response, shopId: number, req: Request) {
  const sessionToken = randomUUID();
  const fingerprint = buildSessionFingerprint(req);
  merchantSessions.set(sessionToken, { shopId, expiresAt: Date.now() + SESSION_DURATION_MS, fingerprint });
  setSessionCookie(res, sessionToken, fingerprint);
}

function clearSessionCookie(res: Response) {
  const expiredBase = '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  res.setHeader('Set-Cookie', [`matable_session=;${expiredBase}`, `matable_session_fp=;${expiredBase}`]);
}

function setAdminSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `matable_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`);
}

function getAdminSession(req: Request): string | null {
  const token = getCookie(req, 'matable_admin_session');
  const expiresAt = token ? adminSessions.get(token) : undefined;
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    return null;
  }
  return token;
}

function requireAdminAccess(req: Request, res: Response, next: express.NextFunction) {
  if (!getAdminSession(req)) {
    return res.status(401).json({ error: 'Authentification super-admin requise.' });
  }
  next();
}

function rateLimitPublicRequest(limit: number = MAX_PUBLIC_REQUESTS_PER_WINDOW) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    const key = `${req.method}:${req.path}:${req.socket.remoteAddress || 'unknown'}`;
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

function requireMerchantAccess(req: Request, res: Response, next: express.NextFunction) {
  const token = getCookie(req, 'matable_session');
  const session = token ? merchantSessions.get(token) : undefined;

  if (!session || session.expiresAt <= Date.now() || session.shopId !== Number(req.params.id)) {
    if (token) merchantSessions.delete(token);
    return res.status(401).json({ error: 'Session marchand invalide ou expirée.' });
  }

  if (!isRequestFingerprintMatch(session, req)) {
    if (token) merchantSessions.delete(token);
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session rejetée pour sécurité : appareil ou IP non reconnue.' });
  }

  const shop = shops.find((candidate) => candidate.id === session.shopId);
  if (!shop || !shop.is_active) {
    return res.status(403).json({ error: 'Boutique inactive : contactez l’administrateur pour la réactivation.', payment_status: shop?.payment_status || 'approved' });
  }

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

export function checkAndRegisterRecoveryAttempt(shopId: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const current = merchantRecoveryAttempts.get(shopId);

  if (!current || current.resetAt <= now) {
    const nextState = { count: 1, resetAt: now + RECOVERY_WINDOW_MS };
    merchantRecoveryAttempts.set(shopId, nextState);
    return { allowed: true, remaining: MAX_RECOVERY_ATTEMPTS_PER_DAY - 1, resetAt: nextState.resetAt };
  }

  if (current.count >= MAX_RECOVERY_ATTEMPTS_PER_DAY) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, MAX_RECOVERY_ATTEMPTS_PER_DAY - current.count),
    resetAt: current.resetAt,
  };
}

export function resetRecoveryAttemptsForTests() {
  merchantRecoveryAttempts.clear();
  merchantRecoveryTokens.clear();
  merchantRecoveryCodes.clear();
}

export function rotateMerchantAccessTokenForShop(shopId: number, previousToken?: string): string {
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
  persistShop(shop);
  return token;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of merchantSessions) {
    if (session.expiresAt <= now) merchantSessions.delete(token);
  }
  for (const [token, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

const toSafeShop = (shop: ShopRecord) => {
  const { pin_code_hash: _pinCodeHash, owner_access_token_hash: _ownerAccessTokenHash, ...safeShop } = shop;
  return safeShop;
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

function seedDatabaseIfEmpty() {
  if (process.env.NODE_ENV === 'production' && !shouldSeedDemoData()) {
    return;
  }

  const shopRow = db.prepare('SELECT COUNT(*) as count FROM shops').get() as { count: number };
  if (shopRow.count > 0) {
    return;
  }

  const insertShop = db.prepare(`
    INSERT INTO shops (
      id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active,
      subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProduct = db.prepare(`
    INSERT INTO products (
      id, shop_id, title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const shop of shops) {
    insertShop.run(
      shop.id,
      shop.name,
      shop.slug,
      shop.whatsapp_number,
      hashPin(shop.pin_code_hash),
      shop.theme_color,
      shop.welcome_message,
      shop.is_open ? 1 : 0,
      shop.is_active ? 1 : 0,
      shop.subscription_expires_at,
      shop.last_notification_sent_at,
      shop.created_at,
      shop.category,
      shop.city ?? null,
      shop.subscription_tier,
      JSON.stringify(shop.theme_config)
    );

    for (const product of products.filter((p) => p.shop_id === shop.id)) {
      insertProduct.run(
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
      );
    }
  }

  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  if (orderCount.count === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
        delivery_slot, payment_method_preference, total_amount, created_at, status, items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const order of orders) {
      insertOrder.run(
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
      );
    }
  }
}

function loadProductsFromDatabase() {
  const rows = db.prepare('SELECT * FROM products ORDER BY id').all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    price: Number(row.price),
    stock: Number(row.stock),
    image_url: String(row.image_url ?? ''),
    is_available: Boolean(row.is_available),
    category: row.category ? String(row.category) : undefined,
    sizes: row.sizes ? JSON.parse(String(row.sizes)) : undefined,
    colors: row.colors ? JSON.parse(String(row.colors)) : undefined,
    lookbook_image: row.lookbook_image ? String(row.lookbook_image) : undefined,
    prep_time: row.prep_time == null ? undefined : Number(row.prep_time),
    modifier_groups: row.modifier_groups ? JSON.parse(String(row.modifier_groups)) : undefined,
  })) as ProductRecord[];
}

function loadShopsFromDatabase() {
  const rows = db.prepare('SELECT * FROM shops ORDER BY id').all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id), name: String(row.name), slug: String(row.slug),
    whatsapp_number: String(row.whatsapp_number), pin_code_hash: String(row.pin_code_hash),
    theme_color: String(row.theme_color || ''), welcome_message: row.welcome_message == null ? null : String(row.welcome_message),
    is_open: Boolean(row.is_open), is_active: Boolean(row.is_active),
    payment_status: (String(row.payment_status || 'approved')) as ShopRecord['payment_status'],
    payment_deadline_at: row.payment_deadline_at == null ? null : String(row.payment_deadline_at),
    selected_subscription_tier: row.selected_subscription_tier ? String(row.selected_subscription_tier) as SubscriptionTier : undefined,
    subscription_expires_at: String(row.subscription_expires_at || ''),
    last_notification_sent_at: row.last_notification_sent_at == null ? null : String(row.last_notification_sent_at),
    created_at: String(row.created_at), category: String(row.category) as ShopRecord['category'],
    city: row.city == null ? undefined : String(row.city), subscription_tier: String(row.subscription_tier) as ShopRecord['subscription_tier'],
    theme_config: row.theme_config ? JSON.parse(String(row.theme_config)) : {},
    opening_hours: row.opening_hours ? JSON.parse(String(row.opening_hours)) : undefined,
    owner_access_token_hash: row.owner_access_token_hash ? String(row.owner_access_token_hash) : null,
  })) as ShopRecord[];
}

function persistShop(shop: ShopRecord) {
  db.prepare(`
    INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active, payment_status, payment_deadline_at, selected_subscription_tier, subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config, opening_hours, owner_access_token_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, whatsapp_number=excluded.whatsapp_number,
      pin_code_hash=excluded.pin_code_hash, theme_color=excluded.theme_color, welcome_message=excluded.welcome_message,
      is_open=excluded.is_open, is_active=excluded.is_active, payment_status=excluded.payment_status,
      payment_deadline_at=excluded.payment_deadline_at, selected_subscription_tier=excluded.selected_subscription_tier,
      subscription_expires_at=excluded.subscription_expires_at, last_notification_sent_at=excluded.last_notification_sent_at,
      category=excluded.category, city=excluded.city, subscription_tier=excluded.subscription_tier,
      theme_config=excluded.theme_config, opening_hours=excluded.opening_hours, owner_access_token_hash=excluded.owner_access_token_hash
  `).run(
    shop.id, shop.name, shop.slug, shop.whatsapp_number, shop.pin_code_hash, shop.theme_color, shop.welcome_message,
    shop.is_open ? 1 : 0, shop.is_active ? 1 : 0, shop.payment_status || 'approved', shop.payment_deadline_at ?? null,
    shop.selected_subscription_tier ?? shop.subscription_tier, shop.subscription_expires_at, shop.last_notification_sent_at,
    shop.created_at, shop.category, shop.city ?? null, shop.subscription_tier, JSON.stringify(shop.theme_config),
    shop.opening_hours ? JSON.stringify(shop.opening_hours) : null, shop.owner_access_token_hash ?? null
  );
}

function persistProduct(product: ProductRecord) {
  db.prepare(`
    INSERT INTO products (id, shop_id, title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id, title=excluded.title, description=excluded.description,
      price=excluded.price, stock=excluded.stock, image_url=excluded.image_url, is_available=excluded.is_available,
      category=excluded.category, sizes=excluded.sizes, colors=excluded.colors, lookbook_image=excluded.lookbook_image, prep_time=excluded.prep_time,
      modifier_groups=excluded.modifier_groups
  `).run(
    product.id, product.shop_id, product.title, product.description ?? null, product.price, product.stock, product.image_url,
    product.is_available ? 1 : 0, product.category ?? null, product.sizes ? JSON.stringify(product.sizes) : null, product.colors ? JSON.stringify(product.colors) : null,
    product.lookbook_image ?? null, product.prep_time ?? null, product.modifier_groups ? JSON.stringify(product.modifier_groups) : null
  );
}

function loadOrdersFromDatabase() {
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    customer_name: String(row.customer_name),
    customer_phone: String(row.customer_phone),
    delivery_location: String(row.delivery_location),
    delivery_note: row.delivery_note ? String(row.delivery_note) : undefined,
    delivery_slot: row.delivery_slot ? String(row.delivery_slot) : undefined,
    payment_method_preference: String(row.payment_method_preference || 'wave') as OrderRecord['payment_method_preference'],
    total_amount: Number(row.total_amount),
    created_at: String(row.created_at),
    status: (String(row.status || 'pending')) as OrderRecord['status'],
    items: row.items ? JSON.parse(String(row.items)) : [],
  })) as OrderRecord[];
}

function persistOrder(order: OrderRecord) {
  db.prepare(`
    INSERT INTO orders (
      id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
      delivery_slot, payment_method_preference, total_amount, created_at, status, items
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status
  `).run(
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
  );
}

async function startServer() {
  validateRuntimeConfig();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: express.NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self' https://wa.me https://api.whatsapp.com",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
        'upgrade-insecure-requests',
      ].join('; '));
    }
    next();
  });

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

  app.use('/api/payments/paystack/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/shops/:id/toggle-status', requireMerchantAccess);
  app.use('/api/shops/:id/theme', requireMerchantAccess);
  app.use('/api/shops/:id/products', requireMerchantAccess);
  app.use('/api/shops/:id/orders', requireMerchantAccess);
  app.use('/api/shops/:id/flash-bilan', requireMerchantAccess);
  app.use('/api/admin', requireAdminAccess);
  app.use('/api/cron', requireAdminAccess);

  // Helper to calculate days remaining
  function getDaysRemaining(expirationDateStr: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDateStr);
    exp.setHours(0, 0, 0, 0);
    const diffTime = exp.getTime() - today.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  function runSubscriptionAutomation() {
    return { timestamp: new Date().toISOString(), deactivatedCount: 0, alertsGenerated: [] };
  }

  initializeDatabase();
  seedDatabaseIfEmpty();

  shops.forEach((shop) => {
    if (!shop.pin_code_hash.startsWith('$2')) {
      shop.pin_code_hash = hashPin(shop.pin_code_hash);
    }
  });

  const persistedShops = loadShopsFromDatabase();
  shops.splice(0, shops.length, ...persistedShops);
  const persistedProducts = loadProductsFromDatabase();
  products.splice(0, products.length, ...persistedProducts);
  const persistedOrders = loadOrdersFromDatabase();
  orders.splice(0, orders.length, ...persistedOrders);
  nextOrderId = Math.max(0, ...orders.map((order) => order.id)) + 1;
  nextItemId = Math.max(0, ...orders.flatMap((order) => (order.items || []).map((item) => item.id))) + 1;
  nextShopId = Math.max(0, ...shops.map((shop) => shop.id)) + 1;
  nextProductId = Math.max(0, ...products.map((product) => product.id)) + 1;

  // Free background automation: subscription checks run hourly without requiring a dashboard click.
  setInterval(() => runSubscriptionAutomation(), 60 * 60 * 1000).unref();
  runSubscriptionAutomation();

  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), whatsapp_cloud: 'locked', paystack: 'locked' });
  });

  app.post('/api/analytics/page-view', rateLimitPublicRequest(120), (req: Request, res: Response) => {
    const shopId = req.body?.shop_id == null ? null : Number(req.body.shop_id);
    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId || sessionId.length > 100 || (shopId !== null && !Number.isInteger(shopId))) {
      return res.status(400).json({ error: 'Événement analytics invalide.' });
    }
    if (shopId !== null && !shops.some((shop) => shop.id === shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const alreadyTracked = db.prepare(`
      SELECT 1 FROM analytics_events
      WHERE shop_id IS ? AND event_type = 'page_view' AND session_id = ? AND created_at LIKE ?
      LIMIT 1
    `).get(shopId, sessionId, `${today}%`);
    if (!alreadyTracked) {
      db.prepare('INSERT INTO analytics_events (shop_id, event_type, session_id, path, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(shopId, 'page_view', sessionId, String(req.body?.path || '').slice(0, 300), new Date().toISOString());
    }
    res.status(204).end();
  });

  // 1. SHOPS
  // Get all active public shops (for shop selector / discovery)
  app.get('/api/shops', (req: Request, res: Response) => {
    const publicShops = shops.filter((shop) => shop.is_active).map((s) => ({
      ...(() => {
        const shopProducts = products.filter((product) => product.shop_id === s.id);
        const availableProducts = shopProducts.filter((product) => product.is_available && product.stock > 0);
        const today = new Date().toISOString().slice(0, 10);
        return {
          products_preview: availableProducts.slice(0, 3).map((product) => ({
            id: product.id,
            title: product.title,
            image_url: product.image_url,
            price: product.price,
            stock: product.stock,
          })),
          orders_today: orders.filter((order) => order.shop_id === s.id && order.created_at.startsWith(today)).length,
          products_count: availableProducts.length,
          low_stock_count: availableProducts.filter((product) => product.stock <= 3).length,
        };
      })(),
      id: s.id,
      name: s.name,
      slug: s.slug,
      theme_color: s.theme_color,
      welcome_message: s.welcome_message,
      is_open: computeIsShopOpen(s),
      is_active: s.is_active,
      category: s.category,
      city: s.city,
      subscription_tier: s.subscription_tier,
      theme_config: s.theme_config,
      opening_hours: s.opening_hours,
    }));
    res.json(publicShops);
  });

  // Get single shop by slug or id (Storefront or Merchant Dashboard)
  app.get('/api/shops/:slug', (req: Request, res: Response) => {
    const param = req.params.slug;
    const isIdQuery = !isNaN(Number(param));
    const shop = shops.find((s) => s.slug === param || s.id.toString() === param);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const token = getCookie(req, 'matable_session');
    const session = token ? merchantSessions.get(token) : undefined;
    const isMerchantForShop = !!(session && session.shopId === shop.id && session.expiresAt > Date.now());

    if (isMerchantForShop && !isRequestFingerprintMatch(session, req)) {
      return res.status(401).json({ error: 'Session rejetée pour sécurité : appareil ou IP non reconnue.' });
    }

    if (isIdQuery && !isMerchantForShop) {
      return res.status(401).json({ error: 'Accès marchand requis pour ce catalogue.' });
    }

    // If shop subscription is expired/disabled (is_active === false) and queried publicly
    if (!shop.is_active && !isMerchantForShop) {
      return res.json({
        shop: {
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          is_active: false,
          category: shop.category,
          subscription_tier: shop.subscription_tier,
          theme_config: shop.theme_config,
          welcome_message: 'Boutique temporairement indisponible.',
        },
        products: [],
      });
    }

    const shopProducts = isIdQuery
      ? products.filter((p) => p.shop_id === shop.id)
      : products.filter((p) => p.shop_id === shop.id && p.is_available);

    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        theme_color: shop.theme_color,
        welcome_message: shop.welcome_message,
        is_open: computeIsShopOpen(shop),
        is_active: shop.is_active,
        payment_status: shop.payment_status,
        payment_deadline_at: shop.payment_deadline_at,
        selected_subscription_tier: shop.selected_subscription_tier || shop.subscription_tier,
        category: shop.category,
        city: shop.city,
        subscription_tier: shop.subscription_tier,
        theme_config: shop.theme_config,
        opening_hours: shop.opening_hours,
      },
      products: shopProducts,
    });
  });

  // Toggle shop ordering status (Ouvert / Fermé) - POST /api/shops/:id/toggle-status
  app.post('/api/shops/:id/toggle-status', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { is_open } = req.body;
    shop.is_open = is_open !== undefined ? Boolean(is_open) : !shop.is_open;
    if (shop.opening_hours) {
      shop.opening_hours.manual_override = true;
    }
    persistShop(shop);

    res.json({
      success: true,
      is_open: shop.is_open,
      shop: {
        ...toSafeShop(shop),
        is_open: shop.is_open,
      },
      message: shop.is_open 
        ? 'Prise de commande activée sur la boutique.' 
        : 'Prise de commande désactivée sur la boutique.'
    });
  });

  app.patch('/api/shops/:id/toggle-status', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { is_open } = req.body;
    shop.is_open = is_open !== undefined ? Boolean(is_open) : !shop.is_open;
    if (shop.opening_hours) {
      shop.opening_hours.manual_override = true;
    }
    persistShop(shop);

    res.json({
      success: true,
      is_open: shop.is_open,
      shop: {
        ...toSafeShop(shop),
        is_open: shop.is_open,
      },
      message: shop.is_open 
        ? 'Prise de commande activée sur la boutique.' 
        : 'Prise de commande désactivée sur la boutique.'
    });
  });

  // Update shop appearance / theme_config (Merchant)
  app.put('/api/shops/:id/theme', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { theme_config } = req.body;
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
      shop.theme_config = {
        ...shop.theme_config,
        ...requestedThemeConfig,
      };
      // Keep legacy theme_color in sync with primary_color
      if (requestedThemeConfig.primary_color) {
        shop.theme_color = requestedThemeConfig.primary_color;
      }
    }

    persistShop(shop);

    res.json({ success: true, shop: toSafeShop(shop), theme_config: shop.theme_config });
  });

  // Update subscription tier (Merchant upgrade simulation or Admin control)
  app.put('/api/shops/:id/tier', requireAdminAccess, (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { subscription_tier } = req.body;
    if (['standard', 'premium', 'pro'].includes(subscription_tier)) {
      shop.subscription_tier = subscription_tier;
    }

    persistShop(shop);

    res.json({ success: true, shop: toSafeShop(shop) });
  });

  // Update shop settings (Merchant)
  app.put('/api/shops/:id', requireMerchantAccess, (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { theme_color, welcome_message, is_open, whatsapp_number, name, category, theme_config, city, pin_code, opening_hours } = req.body;
    if (theme_color !== undefined) {
      shop.theme_color = theme_color;
      if (shop.theme_config) shop.theme_config.primary_color = theme_color;
    }
    if (welcome_message !== undefined) shop.welcome_message = welcome_message;
    if (is_open !== undefined) {
      shop.is_open = Boolean(is_open);
      if (shop.opening_hours) shop.opening_hours.manual_override = true;
    }
    if (whatsapp_number !== undefined) {
      const normalizedPhone = normalizeWhatsAppPhone(whatsapp_number);
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
      }
      shop.whatsapp_number = normalizedPhone;
    }
    if (name !== undefined) shop.name = name;
    if (city !== undefined) shop.city = city;
    if (pin_code !== undefined && String(pin_code).trim()) {
      shop.pin_code_hash = hashPin(String(pin_code).trim());
    }
    if (category && ['fashion', 'food', 'beauty', 'electronics', 'home', 'services', 'health', 'crafts', 'education', 'automotive', 'other'].includes(category)) {
      shop.category = category;
    }
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
      shop.theme_config = { ...shop.theme_config, ...requestedThemeConfig };
    }
    if (opening_hours) {
      shop.opening_hours = {
        ...(shop.opening_hours || { enabled: false, open_time: '08:00', close_time: '22:00', manual_override: false }),
        ...opening_hours,
      };
    }

    persistShop(shop);

    res.json({ success: true, shop: toSafeShop(shop) });
  });

  // Create new shop (Onboarding with category and subscription tier)
  app.post('/api/shops', rateLimitPublicRequest(10), async (req: Request, res: Response) => {
    const { name, whatsapp_number, pin_code, pin, category, city, subscription_tier, welcome_message } = req.body;
    const effectivePin = pin_code || pin;
    const safeName = sanitizeTextField(name, 100);
    const safeCity = sanitizeTextField(city || 'Abidjan', 100);
    const safeWelcomeMessage = sanitizeTextField(welcome_message, 300);

    if (safeName.length < 2 || !whatsapp_number || !/^\d{6}$/.test(String(effectivePin || '').trim())) {
      return res.status(400).json({ error: 'Nom, numéro WhatsApp et code PIN requis.' });
    }

    const reservedShopId = nextShopId;
    const normalizedWhatsAppPhone = normalizeWhatsAppPhone(whatsapp_number);
    if (!normalizedWhatsAppPhone) {
      return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
    }
    if (shops.some((shop) => shop.whatsapp_number === normalizedWhatsAppPhone)) {
      return res.status(409).json({ error: 'Ce numéro WhatsApp est déjà associé à une boutique. Utilisez son lien privé de gestion.' });
    }

    const shopCategory: ShopRecord['category'] = ['fashion', 'food', 'beauty', 'electronics', 'home', 'services', 'health', 'crafts', 'education', 'automotive', 'other'].includes(category) ? category as ShopRecord['category'] : 'fashion';
    const chosenTier: SubscriptionTier = 'standard';
    const plan = getSubscriptionPlanConfig(chosenTier);
    const hashedPin = hashPin(effectivePin);
    const ownerAccessToken = randomUUID();

    const slug = safeName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `boutique-${Date.now()}`;
    const uniqueSlug = shops.some((shop) => shop.slug === slug) ? `${slug}-${Date.now().toString().slice(-5)}` : slug;

    const defaultPrimaryColor = shopCategory === 'food' ? '#C2410C' : '#0F172A';
    const defaultSecondaryColor = shopCategory === 'food' ? '#FEF2F2' : '#F8FAFC';
    const defaultBanner = shopCategory === 'food'
      ? 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&auto=format&fit=crop&q=80';

    nextShopId += 1;

    const newShop: ShopRecord = {
      id: reservedShopId,
      name: safeName,
      slug: uniqueSlug,
      whatsapp_number: normalizedWhatsAppPhone,
      pin_code_hash: hashedPin,
      owner_access_token_hash: hashAccessToken(ownerAccessToken),
      theme_color: defaultPrimaryColor,
      welcome_message: safeWelcomeMessage || `Bienvenue chez ${safeName} ! Retrouvez nos meilleurs articles et commandez directement sur WhatsApp.`,
      is_open: false,
      is_active: true,
      payment_status: 'approved',
      payment_deadline_at: null,
      selected_subscription_tier: chosenTier,
      subscription_expires_at: addDays(new Date(), 30),
      last_notification_sent_at: null,
      created_at: new Date().toISOString(),
      category: shopCategory,
      city: safeCity,
      subscription_tier: chosenTier,
      theme_config: {
        primary_color: defaultPrimaryColor,
        secondary_color: defaultSecondaryColor,
        font_family: 'Plus Jakarta Sans',
        layout_style: shopCategory === 'food' ? 'card_landscape' : 'grid_portrait',
        theme_preset_id: shopCategory === 'food' ? 'food_braise' : 'fashion_minimal',
        custom_banner_url: defaultBanner,
        logo_url: '',
        event_mode_enabled: false,
        advanced_css: {
          borderRadius: 'rounded-xl',
          shadowIntensity: 'subtle',
          accentGlow: false,
        },
      },
    };

    shops.push(newShop);
    persistShop(newShop);

    createMerchantSession(res, newShop.id, req);
    res.json({
      success: true,
      shop: toSafeShop(newShop),
      owner_access_token: ownerAccessToken,
      payment_required: false,
      payment_status: 'approved',
      payment_deadline_at: null,
      payment_amount: 0,
      payment_tier: chosenTier,
      payment_provider: 'whatsapp',
      payment_message: 'Boutique créée. Les commandes clients sont envoyées au vendeur via un reçu WhatsApp à ouvrir manuellement.',
    });
  });

  // 2. AUTHENTICATION (Phone + 6-digit PIN)
  // Explicit route for merchant login
  app.post('/api/auth/merchant-login', (req: Request, res: Response) => {
    const { phone, pin } = req.body;
    if (!phone || !pin) {
      return res.status(400).json({ error: 'Numéro de téléphone et code PIN requis.' });
    }

    const attemptKey = `${req.ip}:${String(phone).replace(/\D/g, '')}`;
    if (isLoginRateLimited(attemptKey)) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }

    const cleanInputPhone = phone.replace(/[^0-9]/g, '');
    const shop = shops.find((s) => {
      const cleanShopPhone = s.whatsapp_number.replace(/[^0-9]/g, '');
      return (
        cleanShopPhone.includes(cleanInputPhone) ||
        cleanInputPhone.includes(cleanShopPhone) ||
        cleanShopPhone.slice(-8) === cleanInputPhone.slice(-8)
      );
    });

    if (!shop) {
      return res.status(404).json({ error: 'Aucune boutique associée à ce numéro de téléphone.' });
    }

    if (!verifyPin(pin, shop.pin_code_hash)) {
      return res.status(401).json({ error: 'Code PIN incorrect à 6 chiffres.' });
    }

    if (!shop.is_active) {
      return res.status(403).json({
        error: 'Votre boutique est en attente de validation du paiement. Envoyez votre reçu dans les 20 minutes pour éviter la suspension.',
        payment_status: shop.payment_status,
        payment_deadline_at: shop.payment_deadline_at,
        payment_amount: getSubscriptionPlanConfig(shop.selected_subscription_tier || shop.subscription_tier).amount,
      });
    }

    createMerchantSession(res, shop.id, req);
    loginAttempts.delete(attemptKey);

    res.json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        theme_color: shop.theme_color,
        welcome_message: shop.welcome_message,
        is_open: shop.is_open,
        is_active: shop.is_active,
        payment_status: shop.payment_status,
        payment_deadline_at: shop.payment_deadline_at,
        subscription_expires_at: shop.subscription_expires_at,
        category: shop.category,
        subscription_tier: shop.subscription_tier,
        theme_config: shop.theme_config,
      },
    });
  });

  app.get('/api/payments/paystack/config', (req: Request, res: Response) => {
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'Paystack est désactivé et verrouillé pour une amélioration future.' });
    }
    const config = getPaystackConfig();
    return res.json({
      enabled: config.enabled,
      publicKey: config.publicKey,
      currency: config.currency,
      paymentProvider: 'paystack',
    });
  });

  app.get('/paystack/callback', async (req: Request, res: Response) => {
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).send('Paystack est désactivé.');
    }
    const reference = String(req.query.reference || '').trim();
    if (!reference) {
      return res.redirect('/app?payment=missing_reference');
    }

    const verification = await verifyPaystackTransaction(reference);
    if (!verification || !verification.verified || !verification.shopId) {
      return res.redirect(`/app?payment=failed&reference=${encodeURIComponent(reference)}`);
    }

    const shop = shops.find((candidate) => candidate.id === verification.shopId);
    const expectedTier = shop?.selected_subscription_tier || shop?.subscription_tier;
    const expectedAmount = expectedTier ? getSubscriptionPlanConfig(expectedTier).amount : 0;
    if (!shop || verification.tier !== expectedTier || verification.amount !== expectedAmount || verification.currency !== getPaystackConfig().currency) {
      return res.redirect(`/app?payment=invalid&reference=${encodeURIComponent(reference)}`);
    }

    const result = await activateShopSubscription(shop, verification.tier, 'paystack', reference, verification.amount);
    return res.redirect(`/app?payment=${result.activated || result.already_processed ? 'success' : 'failed'}&reference=${encodeURIComponent(reference)}`);
  });

  app.post('/api/payments/paystack/webhook', rateLimitPublicRequest(120), async (req: Request, res: Response) => {
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'Webhook Paystack désactivé et verrouillé.' });
    }
    const config = getPaystackConfig();
    if (!config.enabled) {
      return res.status(503).json({ error: 'Paystack non configuré.' });
    }

    const signature = String(req.headers['x-paystack-signature'] || '');
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    const expected = createHmac('sha512', config.webhookSecret).update(rawBody).digest('hex');

    if (!timingSafeEqual(signature, expected)) {
      return res.status(401).json({ error: 'Signature Paystack invalide.' });
    }

    try {
      const event = JSON.parse(rawBody.toString('utf8'));
      if (event?.event === 'charge.success') {
        const reference = String(event?.data?.reference || '');
        if (!reference) {
          return res.sendStatus(200);
        }

        const verification = await verifyPaystackTransaction(reference);
        if (!verification || !verification.verified) {
          return res.sendStatus(200);
        }

        const eventShopId = Number(event?.data?.metadata?.shop_id || 0);
        const eventTier = String(event?.data?.metadata?.tier || '');
        const eventAmount = Number(event?.data?.amount || 0) / 100;
        if (!eventShopId || eventShopId !== verification.shopId || eventTier !== verification.tier || eventAmount !== verification.amount || verification.currency !== config.currency) {
          return res.sendStatus(200);
        }

        const shopId = verification.shopId;
        const shop = shopId ? shops.find((candidate) => candidate.id === shopId) : undefined;
        if (shop) {
          const expectedAmount = getSubscriptionPlanConfig(verification.tier).amount;
          if (verification.amount !== expectedAmount || shop.selected_subscription_tier !== verification.tier) return res.sendStatus(200);
          const result = await activateShopSubscription(shop, verification.tier, 'paystack', reference, verification.amount);
          if (result.activated) {
            await sendWhatsAppCloudText(shop.whatsapp_number, result.message);
          }
        }
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error('Paystack webhook parsing error:', error);
      return res.status(400).json({ error: 'Webhook Paystack invalide.' });
    }
  });

  app.get('/api/shops/:id/subscription/verify/:reference', requireMerchantAccess, async (req: Request, res: Response) => {
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'La vérification Paystack est désactivée et verrouillée.' });
    }
    const shopId = Number(req.params.id);
    const reference = String(req.params.reference || '').trim();
    if (!reference) {
      return res.status(400).json({ error: 'Référence Paystack manquante.' });
    }

    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    const verification = await verifyPaystackTransaction(reference);
    if (!verification || !verification.verified) {
      return res.status(400).json({ verified: false, reference, message: 'La vérification Paystack a échoué ou la transaction n’est pas validée.' });
    }

    const expectedTier = shop.selected_subscription_tier || shop.subscription_tier;
    const expectedAmount = getSubscriptionPlanConfig(expectedTier).amount;
    if (verification.shopId !== shop.id || verification.tier !== expectedTier || verification.amount !== expectedAmount || verification.currency !== getPaystackConfig().currency) {
      return res.status(403).json({ verified: false, reference, message: 'Transaction Paystack non associée à cette boutique ou montant invalide.' });
    }

    if (isPaymentReferenceProcessed('paystack', reference, shop.id)) {
      return res.json({
        success: true,
        verified: true,
        already_processed: true,
        payment_status: shop.payment_status,
        shop_id: shop.id,
        reference,
        tier: verification.tier,
        amount: verification.amount,
        message: 'Cette référence a déjà été consommée ; aucune réactivation supplémentaire n’est nécessaire.',
      });
    }

    const result = await activateShopSubscription(shop, verification.tier, 'paystack', reference, verification.amount);
    return res.json({
      success: true,
      verified: true,
      already_processed: result.already_processed,
      activated: result.activated,
      payment_status: shop.payment_status,
      shop_id: shop.id,
      reference,
      tier: result.tier,
      amount: result.amount,
      message: result.message,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = getCookie(req, 'matable_session');
    if (token) merchantSessions.delete(token);
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.post('/api/auth/merchant-access-login', (req: Request, res: Response) => {
    const token = String(req.body?.access_token || '').trim();
    if (!token || token.length > 200) return res.status(400).json({ error: 'Lien d’accès invalide.' });
    const tokenHash = hashAccessToken(token);
    const shop = shops.find((candidate) => candidate.owner_access_token_hash === tokenHash);
    if (!shop) return res.status(401).json({ error: 'Lien d’accès invalide.' });
    if (!shop.is_active) {
      return res.status(403).json({
        error: 'Boutique inactive : contactez l’administrateur pour la réactivation.',
        payment_status: shop.payment_status,
        payment_deadline_at: shop.payment_deadline_at,
      });
    }
    createMerchantSession(res, shop.id, req);
    res.json({ success: true, shop: toSafeShop(shop) });
  });

  app.post('/api/auth/merchant-recovery-request', rateLimitPublicRequest(5), async (req: Request, res: Response) => {
    return res.status(410).json({ error: 'La récupération automatique est désactivée. Utilisez votre identifiant et votre mot de passe.' });
    /*
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'La récupération automatique par WhatsApp est désactivée et verrouillée.' });
    }
    const phone = String(req.body?.phone || '').trim();
    if (!phone) {
      return res.status(400).json({ error: 'Numéro de boutique requis pour la récupération.' });
    }

    const shop = findShopByPhone(phone);
    if (!shop) {
      return res.status(404).json({ error: 'Aucune boutique correspondante trouvée.' });
    }

    const attempt = checkAndRegisterRecoveryAttempt(shop.id);
    if (!attempt.allowed) {
      return res.status(429).json({
        error: 'Limite atteinte : vous avez déjà utilisé 2 récupérations sur 24h pour cette boutique.',
        remaining: 0,
        resetAt: attempt.resetAt,
      });
    }

    const recoveryTemplateName = String(process.env.WHATSAPP_CLOUD_RECOVERY_TEMPLATE_NAME || '').trim();
    const recoveryTemplateLanguage = String(process.env.WHATSAPP_CLOUD_RECOVERY_TEMPLATE_LANGUAGE || '').trim();
    if (recoveryTemplateName && recoveryTemplateLanguage) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const challengeId = randomUUID();
      merchantRecoveryCodes.set(challengeId, {
        shopId: shop.id,
        codeHash: hashAccessToken(`recovery-code:${code}`),
        expiresAt: Date.now() + RECOVERY_CODE_VALIDITY_MS,
        attempts: 0,
      });

      const whatsappResult = await sendWhatsAppCloudTemplate(
        shop.whatsapp_number,
        recoveryTemplateName,
        recoveryTemplateLanguage,
        [{ type: 'text', text: code }],
      );
      if (!whatsappResult.sent) {
        merchantRecoveryCodes.delete(challengeId);
        return res.status(502).json({
          error: whatsappResult.reason || 'Le code de récupération n’a pas pu être envoyé par WhatsApp.',
          fallback_url: whatsappResult.fallbackUrl,
        });
      }

      return res.json({
        success: true,
        message: 'Un code de récupération a été envoyé au numéro WhatsApp enregistré de la boutique.',
        challenge_id: challengeId,
        expires_in_minutes: Math.round(RECOVERY_CODE_VALIDITY_MS / 60000),
        remaining: attempt.remaining,
        resetAt: attempt.resetAt,
        whatsapp_sent: true,
        whatsapp_status: 'envoyé',
      });
    }

    const recoveryToken = randomUUID();
    merchantRecoveryTokens.set(recoveryToken, { shopId: shop.id, expiresAt: Date.now() + RECOVERY_TOKEN_VALIDITY_MS });
    const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const recoveryUrl = `${appUrl}/app?access=${encodeURIComponent(recoveryToken)}`;

    const whatsappResult = await sendWhatsAppCloudText(
      shop.whatsapp_number,
      `Récupération d’accès MaTable.ci\nCliquez ici pour valider votre accès : ${recoveryUrl}\nCe lien expire dans 15 minutes.\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message.`
    );

    return res.json({
      success: true,
      message: whatsappResult.sent
        ? 'Le lien de récupération a été envoyé au numéro WhatsApp enregistré de la boutique.'
        : 'La demande a été enregistrée, mais WhatsApp Cloud n’a pas pu envoyer le lien au numéro enregistré.',
      expires_in_minutes: Math.round(RECOVERY_TOKEN_VALIDITY_MS / 60000),
      remaining: attempt.remaining,
      resetAt: attempt.resetAt,
      whatsapp_sent: whatsappResult.sent,
      whatsapp_status: whatsappResult.sent ? 'envoyé' : (whatsappResult.reason || 'non envoyé'),
      fallback_url: whatsappResult.fallbackUrl,
    });
    */
  });

  app.post('/api/auth/merchant-recovery-verify-code', rateLimitPublicRequest(10), async (req: Request, res: Response) => {
    const challengeId = String(req.body?.challenge_id || '').trim();
    const code = String(req.body?.code || '').trim();
    const challenge = merchantRecoveryCodes.get(challengeId);
    if (!challenge || challenge.expiresAt <= Date.now()) {
      merchantRecoveryCodes.delete(challengeId);
      return res.status(401).json({ error: 'Code de récupération expiré ou invalide.' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Le code de récupération doit contenir 6 chiffres.' });
    }
    challenge.attempts += 1;
    const validCode = timingSafeEqual(challenge.codeHash, hashAccessToken(`recovery-code:${code}`));
    if (!validCode) {
      if (challenge.attempts >= MAX_RECOVERY_CODE_ATTEMPTS) merchantRecoveryCodes.delete(challengeId);
      return res.status(401).json({ error: 'Code de récupération incorrect ou expiré.' });
    }

    const shop = shops.find((candidate) => candidate.id === challenge.shopId);
    merchantRecoveryCodes.delete(challengeId);
    if (!shop || !shop.is_active) {
      return res.status(401).json({ error: 'Boutique introuvable ou inactive.' });
    }

    const ownerAccessToken = rotateMerchantAccessTokenForShop(shop.id, undefined);
    return res.json({
      success: true,
      owner_access_token: ownerAccessToken,
      shop: toSafeShop(shop),
      message: 'Code validé. Votre accès privé a été renouvelé.',
    });
  });

  app.post('/api/auth/merchant-recovery-confirm', async (req: Request, res: Response) => {
    return res.status(410).json({ error: 'La récupération automatique est désactivée. Utilisez votre identifiant et votre mot de passe.' });
    /*
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'La récupération automatique par WhatsApp est désactivée et verrouillée.' });
    }
    const recoveryToken = String(req.body?.recovery_token || '').trim();
    if (!recoveryToken) {
      return res.status(400).json({ error: 'Jeton de récupération requis.' });
    }

    const recovery = merchantRecoveryTokens.get(recoveryToken);
    if (!recovery || recovery.expiresAt <= Date.now()) {
      merchantRecoveryTokens.delete(recoveryToken);
      return res.status(401).json({ error: 'Jeton de récupération expiré ou invalide.' });
    }

    const shop = shops.find((candidate) => candidate.id === recovery.shopId);
    if (!shop || !shop.is_active) {
      merchantRecoveryTokens.delete(recoveryToken);
      return res.status(401).json({ error: 'Boutique introuvable ou inactive.' });
    }

    const newToken = rotateMerchantAccessTokenForShop(shop.id, undefined);
    merchantRecoveryTokens.delete(recoveryToken);
    const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const newAccessUrl = `${appUrl}/app?access=${encodeURIComponent(newToken)}`;
    const whatsappResult = await sendWhatsAppCloudText(
      shop.whatsapp_number,
      `Votre accès privé MaTable.ci a été renouvelé.\nNouveau lien : ${newAccessUrl}\nLe précédent lien a été invalidé.\nConservez ce lien en lieu sûr.`
    );

    return res.json({
      success: true,
      shop: toSafeShop(shop),
      owner_access_token: newToken,
      message: 'Votre accès privé a été renouvelé automatiquement.',
      whatsapp_sent: whatsappResult.sent,
      whatsapp_status: whatsappResult.sent ? 'envoyé' : (whatsappResult.reason || 'non envoyé'),
    });
    */
  });

  app.post('/api/auth/admin-login', (req: Request, res: Response) => {
    const configuredKey = String(process.env.ADMIN_ACCESS_KEY || '').trim();
    if (!configuredKey) {
      return res.status(503).json({ error: 'ADMIN_ACCESS_KEY doit être configurée côté serveur.' });
    }
    const adminAttemptKey = `${req.ip}:admin`;
    if (isLoginRateLimited(adminAttemptKey)) {
      return res.status(429).json({ error: 'Trop de tentatives de connexion admin. Réessayez plus tard.' });
    }
    if (!timingSafeEqual(String(req.body?.key || ''), configuredKey)) {
      return res.status(401).json({ error: 'Clé super-admin incorrecte.' });
    }
    loginAttempts.delete(adminAttemptKey);
    const token = randomUUID();
    adminSessions.set(token, Date.now() + ADMIN_SESSION_DURATION_MS);
    setAdminSessionCookie(res, token);
    res.json({ success: true });
  });

  app.post('/api/auth/admin-logout', (req: Request, res: Response) => {
    const token = getAdminSession(req);
    if (token) adminSessions.delete(token);
    res.setHeader('Set-Cookie', 'matable_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    res.status(410).json({ error: 'Endpoint obsolète. Utilisez /api/auth/merchant-login.' });
  });

  // Forgot PIN uses the same verified access-recovery flow; it never exposes or replaces a PIN directly.
  app.post('/api/auth/merchant-forgot-pin', rateLimitPublicRequest(5), async (req: Request, res: Response) => {
    return res.status(410).json({ error: 'La récupération automatique est désactivée. Utilisez votre identifiant et votre mot de passe.' });
    /*
    if (EXTERNAL_INTEGRATIONS_LOCKED) {
      return res.status(410).json({ error: 'La récupération automatique par WhatsApp est désactivée et verrouillée.' });
    }
    const phone = String(req.body?.phone || '').trim();
    const shop = findShopByPhone(phone);
    if (!shop) return res.status(404).json({ error: 'Aucune boutique associée à ce numéro.' });

    const attempt = checkAndRegisterRecoveryAttempt(shop.id);
    if (!attempt.allowed) {
      return res.status(429).json({ error: 'Limite de récupération atteinte pour cette boutique.', remaining: 0, resetAt: attempt.resetAt });
    }

    const recoveryToken = randomUUID();
    merchantRecoveryTokens.set(recoveryToken, { shopId: shop.id, expiresAt: Date.now() + RECOVERY_TOKEN_VALIDITY_MS });
    const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const recoveryUrl = `${appUrl}/app?access=${encodeURIComponent(recoveryToken)}`;
    const whatsappResult = await sendWhatsAppCloudText(
      shop.whatsapp_number,
      `PIN oublié MaTable.ci\nUtilisez ce lien sécurisé pour récupérer votre accès : ${recoveryUrl}\nLe lien expire dans 15 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`
    );

    return res.json({
      success: true,
      message: whatsappResult.sent
        ? 'Un lien sécurisé a été envoyé au numéro WhatsApp enregistré de la boutique.'
        : 'La demande a été enregistrée, mais le lien n’a pas pu être envoyé automatiquement par WhatsApp.',
      whatsapp_sent: whatsappResult.sent,
      whatsapp_status: whatsappResult.sent ? 'envoyé' : (whatsappResult.reason || 'non envoyé'),
    });
    */
  });

  // Alias for backward compatibility
  app.post('/api/auth/reset-pin', async (req: Request, res: Response) => {
    return res.status(410).json({ error: 'La récupération automatique est désactivée. Utilisez votre identifiant et votre mot de passe.' });
  });

  // 3. PRODUCTS MANAGEMENT (Merchant /app)
  app.get('/api/shops/:id/products', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shopProducts = products.filter((p) => p.shop_id === shopId);
    res.json(shopProducts);
  });

  app.post('/api/shops/:id/products', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    if (!shops.some((shop) => shop.id === shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups } = req.body;

    const safeTitle = sanitizeTextField(title, 120);
    const numericPrice = Number(price);
    const numericStock = Number(stock ?? 0);
    if (safeTitle.length < 2 || !Number.isSafeInteger(numericPrice) || numericPrice < 0 || !Number.isSafeInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Titre et prix obligatoires.' });
    }

    const newProduct: ProductRecord = {
      id: nextProductId++,
      shop_id: shopId,
      title: safeTitle,
      description: description ? sanitizeTextField(description, 500) : null,
      price: numericPrice,
      stock: numericStock,
      image_url: image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
      is_available: is_available !== undefined ? Boolean(is_available) : true,
      category: category ? String(category).trim() : undefined,
      sizes: Array.isArray(sizes) ? sizes : undefined,
      colors: Array.isArray(colors) ? colors : undefined,
      lookbook_image: lookbook_image || undefined,
      prep_time: prep_time !== undefined ? Number(prep_time) : undefined,
      modifier_groups: Array.isArray(modifier_groups) ? modifier_groups : undefined,
    };

    products.unshift(newProduct);
    persistProduct(newProduct);
    res.json({ success: true, product: newProduct });
  });

  app.put('/api/shops/:id/products/:productId', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((p) => p.id === productId);
    if (!product || product.shop_id !== shopId) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups } = req.body;
    if (title !== undefined) {
      const safeTitle = sanitizeTextField(title, 120);
      if (safeTitle.length < 2) return res.status(400).json({ error: 'Titre de produit invalide.' });
      product.title = safeTitle;
    }
    if (description !== undefined) product.description = description ? sanitizeTextField(description, 500) : null;
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) return res.status(400).json({ error: 'Prix de produit invalide.' });
      product.price = numericPrice;
    }
    if (stock !== undefined) {
      const numericStock = Number(stock);
      if (!Number.isSafeInteger(numericStock) || numericStock < 0) return res.status(400).json({ error: 'Stock de produit invalide.' });
      product.stock = numericStock;
    }
    if (image_url !== undefined) product.image_url = image_url;
    if (is_available !== undefined) product.is_available = Boolean(is_available);
    if (category !== undefined) product.category = category ? String(category).trim() : undefined;
    if (sizes !== undefined) product.sizes = Array.isArray(sizes) ? sizes : undefined;
    if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : undefined;
    if (lookbook_image !== undefined) product.lookbook_image = lookbook_image;
    if (prep_time !== undefined) product.prep_time = Number(prep_time);
    if (modifier_groups !== undefined) product.modifier_groups = Array.isArray(modifier_groups) ? modifier_groups : undefined;

    persistProduct(product);

    res.json({ success: true, product });
  });

  // Fast stock stepper (+1 or -1)
  app.patch('/api/shops/:id/products/:productId/stock', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((p) => p.id === productId);
    if (!product || product.shop_id !== shopId) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    const { delta } = req.body;
    const change = Number(delta);
    if (!Number.isInteger(change) || Math.abs(change) > 100000) {
      return res.status(400).json({ error: 'Variation de stock invalide.' });
    }
    product.stock = Math.max(0, product.stock + change);
    product.is_available = product.stock > 0 && product.is_available;
    persistProduct(product);

    res.json({ success: true, stock: product.stock, product });
  });

  // Toggle visibility (Masquer / Afficher)
  app.patch('/api/shops/:id/products/:productId/toggle-visibility', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((p) => p.id === productId);
    if (!product || product.shop_id !== shopId) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    product.is_available = !product.is_available;
    persistProduct(product);
    res.json({ success: true, is_available: product.is_available, product });
  });

  app.delete('/api/shops/:id/products/:productId', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const index = products.findIndex((p) => p.id === productId && p.shop_id === shopId);
    if (index === -1) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    products.splice(index, 1);
    db.prepare('DELETE FROM products WHERE id = ? AND shop_id = ?').run(productId, Number(req.params.id));
    res.json({ success: true });
  });

  // 4. ORDERS & AUTOMATIC STOCK DECREMENTATION
  app.post('/api/orders', rateLimitPublicRequest(30), (req: Request, res: Response) => {
    const { shop_id, customer_name, customer_phone, delivery_location, delivery_note, delivery_slot, payment_method_preference, items, website, form_started_at } = req.body;

    if (String(website || '').trim()) {
      return res.status(400).json({ error: 'Requête rejetée.' });
    }
    if (form_started_at !== undefined) {
      const formAge = Date.now() - Number(form_started_at);
      if (!Number.isFinite(formAge) || formAge < 1200 || formAge > 2 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Veuillez remplir le formulaire avant de commander.' });
      }
    }

    if (!shop_id || !customer_name || !customer_phone || !delivery_location || !Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Champs requis manquants pour la commande.' });
    }

    const validatedCustomer = validateCustomerOrderInput({
      customer_name,
      customer_phone,
      delivery_location,
      delivery_note,
    });

    if (!validatedCustomer.ok) {
      return res.status(400).json({ error: validatedCustomer.error || 'Données client invalides.' });
    }

    const shop = shops.find((s) => s.id === Number(shop_id));
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    if (!shop.is_active) {
      return res.status(403).json({ error: 'Cette boutique est suspendue ou son abonnement est expiré.' });
    }

    if (payment_method_preference !== 'wave' && payment_method_preference !== 'mobile_money') {
      return res.status(400).json({ error: 'Le paiement doit être effectué par Wave ou Mobile Money.' });
    }

    const requestedQuantities = new Map<number, number>();
    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ error: 'Article ou quantité invalide.' });
      }
      requestedQuantities.set(productId, (requestedQuantities.get(productId) || 0) + quantity);
    }

    const isOpen = computeIsShopOpen(shop);
    if (!isOpen) {
      return res.status(400).json({
        error: 'Cette boutique est actuellement fermée. La prise de commande est temporairement désactivée.',
      });
    }

    const atomicOrderCreation = db.transaction(() => {
      const orderItemRecords: any[] = [];
      let calculatedTotal = 0;

      for (const item of items) {
        const productId = Number(item.product_id);
        const prod = products.find((p) => p.id === productId);
        if (!prod || prod.shop_id !== shop.id) {
          throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
        }

        const qty = requestedQuantities.get(prod.id) || 0;
        const stockRow = db.prepare('SELECT stock, is_available FROM products WHERE id = ? AND shop_id = ?').get(prod.id, shop.id) as { stock: number; is_available: number } | undefined;
        if (!stockRow) {
          throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
        }
        if (!stockRow.is_available || stockRow.stock <= 0) {
          throw Object.assign(new Error(`L'article "${prod.title}" est en rupture de stock.`), { statusCode: 409, product_id: prod.id, stock: 0 });
        }
        if (stockRow.stock < qty) {
          throw Object.assign(new Error(`Stock insuffisant pour "${prod.title}". Seulement ${stockRow.stock} unité(s) disponible(s).`), { statusCode: 409, product_id: prod.id, stock: stockRow.stock });
        }

        const selectedModifiers = Array.isArray(item.selected_modifiers)
          ? item.selected_modifiers
          : typeof item.selected_modifiers === 'string'
            ? [item.selected_modifiers]
            : [];
        const validSelectedModifiers = getValidSelectedModifiers(prod, selectedModifiers);
        const unitPrice = getProductUnitPriceWithModifiers(prod, validSelectedModifiers);
        const nextStock = stockRow.stock - qty;

        const updateResult = db.prepare('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?')
          .run(nextStock, nextStock > 0 ? 1 : 0, prod.id, shop.id, qty);

        if (updateResult.changes !== 1) {
          throw Object.assign(new Error(`Stock insuffisant pour "${prod.title}".`), { statusCode: 409, product_id: prod.id, stock: stockRow.stock });
        }

        prod.stock = nextStock;
        prod.is_available = nextStock > 0;
        persistProduct(prod);

        calculatedTotal += unitPrice * Number(item.quantity);

        orderItemRecords.push({
          id: nextItemId++,
          order_id: nextOrderId,
          product_id: prod.id,
          product_title: prod.title,
          quantity: Number(item.quantity),
          unit_price: unitPrice,
          selected_size: item.selected_size,
          selected_color: item.selected_color,
          selected_modifiers: validSelectedModifiers,
        });
      }

      const newOrder: OrderRecord = {
        id: nextOrderId++,
        shop_id: shop.id,
        customer_name: validatedCustomer.customer_name || customer_name,
        customer_phone: validatedCustomer.customer_phone || customer_phone,
        delivery_location: validatedCustomer.delivery_location || delivery_location,
        delivery_note: validatedCustomer.delivery_note || delivery_note,
        delivery_slot,
        payment_method_preference: payment_method_preference || 'wave',
        total_amount: calculatedTotal,
        created_at: new Date().toISOString(),
        status: 'pending',
        items: orderItemRecords,
      };

      orders.unshift(newOrder);
      persistOrder(newOrder);

      return newOrder;
    });

    try {
      const createdOrder = atomicOrderCreation();
      res.json({
        success: true,
        order: createdOrder,
        message: 'Commande validée et stock décrémenté automatiquement en base.',
      });
    } catch (error: unknown) {
      const err = error as any;
      const statusCode = Number(err?.statusCode) || 409;
      const payload: Record<string, unknown> = {
        error: err?.message || 'Stock insuffisant pour une ou plusieurs références.',
      };
      if (err?.product_id !== undefined) payload.product_id = err.product_id;
      if (err?.stock !== undefined) payload.stock = err.stock;
      res.status(statusCode).json(payload);
    }
  });

  // Merchant orders history
  app.get('/api/shops/:id/orders', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shopOrders = orders.filter((o) => o.shop_id === shopId);
    res.json(shopOrders);
  });

  // Update order status & automatic restock on cancellation
  app.patch('/api/shops/:id/orders/:orderId/status', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'delivered', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide. Valeurs possibles : pending, confirmed, delivered, cancelled.' });
    }

    const order = orders.find((o) => o.id === orderId && o.shop_id === shopId);
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    const previousStatus = order.status || 'pending';
    if (previousStatus === status) {
      return res.json({ success: true, order });
    }

    // If changing TO cancelled, restore stocks
    if (status === 'cancelled' && previousStatus !== 'cancelled') {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const prod = products.find((p) => p.id === item.product_id && p.shop_id === shopId);
          if (prod) {
            prod.stock += Number(item.quantity || 1);
            if (prod.stock > 0) {
              prod.is_available = true;
            }
            db.prepare('UPDATE products SET stock = ?, is_available = ? WHERE id = ?')
              .run(prod.stock, prod.is_available ? 1 : 0, prod.id);
          }
        }
      }
    }

    // If changing FROM cancelled to active, re-decrement stock if possible
    if (previousStatus === 'cancelled' && status !== 'cancelled') {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const prod = products.find((p) => p.id === item.product_id && p.shop_id === shopId);
          if (prod) {
            prod.stock = Math.max(0, prod.stock - Number(item.quantity || 1));
            if (prod.stock === 0) {
              prod.is_available = false;
            }
            db.prepare('UPDATE products SET stock = ?, is_available = ? WHERE id = ?')
              .run(prod.stock, prod.is_available ? 1 : 0, prod.id);
          }
        }
      }
    }

    order.status = status as OrderRecord['status'];
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id);

    res.json({
      success: true,
      order,
      message: status === 'cancelled'
        ? 'Commande annulée et articles remis en stock automatiquement.'
        : `Statut mis à jour (${status}).`,
    });
  });

  // 5. FLASH BILAN AUTOMATISATION (20h)
  // "Un script automatisé (Cron Job) calcule chaque jour à 20h le total des ventes, le nombre de commandes et la liste des articles les plus vendus pour l'envoyer au marchand."
  app.get('/api/shops/:id/flash-bilan', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    const shopOrders = orders.filter((o) => o.shop_id === shopId);
    const totalSales = shopOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // Calculate top selling products of the day
    const productSalesMap: Record<number, { title: string; quantity: number; revenue: number }> = {};
    shopOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (!productSalesMap[item.product_id]) {
          productSalesMap[item.product_id] = {
            title: item.product_title || `Article #${item.product_id}`,
            quantity: 0,
            revenue: 0,
          };
        }
        productSalesMap[item.product_id].quantity += item.quantity;
        productSalesMap[item.product_id].revenue += (item.unit_price || 0) * item.quantity;
      });
    });

    const topSellingProducts = Object.values(productSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((p) => ({
        title: p.title,
        quantity_sold: p.quantity,
        revenue: p.revenue,
      }));

    const shopProducts = products.filter((p) => p.shop_id === shopId);
    const lowStock = shopProducts.filter((p) => p.stock > 0 && p.stock <= 3);
    const outOfStock = shopProducts.filter((p) => p.stock === 0);

    const todayStr = new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const lines: string[] = [
      `🌙 *FLASH BILAN DE 20H — MATABLE.CI*`,
      `🏪 *Boutique :* ${shop.name}`,
      `📅 *Date :* ${todayStr}`,
      `----------------------------------------`,
      `💰 *Chiffre d'Affaires du Jour :* ${new Intl.NumberFormat('fr-FR').format(totalSales)} FCFA`,
      `📦 *Commandes Traitées :* ${shopOrders.length}`,
      `----------------------------------------`,
    ];

    if (topSellingProducts.length > 0) {
      lines.push(`🏆 *ARTICLES LES PLUS VENDUS :*`);
      topSellingProducts.forEach((p, idx) => {
        lines.push(` ${idx + 1}. *${p.title}* : ${p.quantity_sold} unité(s) (${new Intl.NumberFormat('fr-FR').format(p.revenue)} FCFA)`);
      });
      lines.push(`----------------------------------------`);
    }

    if (outOfStock.length > 0) {
      lines.push(`🚨 *RUPTURES DE STOCK (${outOfStock.length}) :*`);
      outOfStock.forEach((p) => lines.push(` • ${p.title} (0 restant)`));
      lines.push(`----------------------------------------`);
    }

    if (lowStock.length > 0) {
      lines.push(`⚠️ *ALERTE STOCK BAS (${lowStock.length}) :*`);
      lowStock.forEach((p) => lines.push(` • ${p.title} (${p.stock} restant(s))`));
      lines.push(`----------------------------------------`);
    }

    lines.push(`Bravo pour cette journée de vente ! À demain pour de nouvelles commandes. 🚀`);

    res.json({
      date: todayStr,
      total_sales: totalSales,
      orders_count: shopOrders.length,
      total_orders: shopOrders.length,
      top_selling_products: topSellingProducts,
      low_stock_products: lowStock.map((p) => ({ id: p.id, title: p.title, stock: p.stock })),
      out_of_stock_products: outOfStock.map((p) => ({ id: p.id, title: p.title })),
      whatsapp_message: lines.join('\n'),
    });
  });

  // Automated 20h Cron Job Trigger endpoint
  app.post('/api/cron/flash-bilan', (req: Request, res: Response) => {
    const results = shops.map((shop) => {
      const shopOrders = orders.filter((o) => o.shop_id === shop.id);
      const totalSales = shopOrders.reduce((sum, o) => sum + o.total_amount, 0);

      const productSalesMap: Record<number, { title: string; quantity: number; revenue: number }> = {};
      shopOrders.forEach((order) => {
        (order.items || []).forEach((item) => {
          if (!productSalesMap[item.product_id]) {
            productSalesMap[item.product_id] = {
              title: item.product_title || `Article #${item.product_id}`,
              quantity: 0,
              revenue: 0,
            };
          }
          productSalesMap[item.product_id].quantity += item.quantity;
          productSalesMap[item.product_id].revenue += (item.unit_price || 0) * item.quantity;
        });
      });

      const topSelling = Object.values(productSalesMap)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 3)
        .map((p) => ({ title: p.title, quantity_sold: p.quantity, revenue: p.revenue }));

      return {
        shop_id: shop.id,
        shop_name: shop.name,
        total_sales: totalSales,
        orders_count: shopOrders.length,
        top_selling_products: topSelling,
      };
    });

    res.json({
      success: true,
      executed_at: new Date().toISOString(),
      cron_label: 'Flash Bilan 20h Cron Job',
      shops_count: results.length,
      bilans: results,
    });
  });

  app.get('/api/admin/analytics', (req: Request, res: Response) => {
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const daily = db.prepare(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
        COUNT(DISTINCT session_id) AS unique_visitors
      FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      GROUP BY date ORDER BY date ASC
    `).all(since) as { date: string; page_views: number; unique_visitors: number }[];
    const orderDaily = db.prepare(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
      FROM orders WHERE created_at >= ? GROUP BY date ORDER BY date ASC
    `).all(since) as { date: string; orders: number; sales: number }[];
    const byShop = shops.map((shop) => {
      const traffic = db.prepare(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND shop_id = ? AND created_at >= ?
      `).get(shop.id, since) as { page_views: number; unique_visitors: number };
      const shopOrders = orders.filter((order) => order.shop_id === shop.id && order.created_at >= since);
      const sales = shopOrders.reduce((sum, order) => sum + order.total_amount, 0);
      return {
        shop_id: shop.id, shop_name: shop.name, slug: shop.slug,
        page_views: traffic.page_views, unique_visitors: traffic.unique_visitors,
        orders: shopOrders.length, sales,
        conversion_rate: traffic.unique_visitors ? Number(((shopOrders.length / traffic.unique_visitors) * 100).toFixed(1)) : 0,
      };
    }).sort((a, b) => b.page_views - a.page_views);
    const totalViews = byShop.reduce((sum, shop) => sum + shop.page_views, 0);
    const totalVisitors = byShop.reduce((sum, shop) => sum + shop.unique_visitors, 0);
    const totalAnalyticsOrders = byShop.reduce((sum, shop) => sum + shop.orders, 0);
    res.json({
      days, since, daily, order_daily: orderDaily, by_shop: byShop,
      totals: {
        page_views: totalViews, unique_visitors: totalVisitors, orders: totalAnalyticsOrders,
        sales: byShop.reduce((sum, shop) => sum + shop.sales, 0),
        conversion_rate: totalVisitors ? Number(((totalAnalyticsOrders / totalVisitors) * 100).toFixed(1)) : 0,
      },
    });
  });

  // 6. SUPER-ADMIN DASHBOARD (/admin)
  // "Dashboard Super-Admin (Votre Tour de Contrôle — /admin)"
  app.get('/api/admin/shops', (req: Request, res: Response) => {
    const adminShops = shops.map((s) => {
      const daysRemaining = getDaysRemaining(s.subscription_expires_at);
      let alertLevel = 'normal';
      let alertMessage = 'Abonnement actif';
      let shouldDeactivate = false;

      if (daysRemaining <= -1) {
        alertLevel = 'j_plus_1';
        alertMessage = 'Expiré (J+1) - Doit être désactivé';
        shouldDeactivate = true;
      } else if (daysRemaining === 0) {
        alertLevel = 'j0';
        alertMessage = 'Expire aujourd\'hui (J-0) - Alerte ultime';
      } else if (daysRemaining <= 2) {
        alertLevel = 'j2';
        alertMessage = `Expire dans ${daysRemaining} jours (J-2)`;
      } else if (daysRemaining <= 4) {
        alertLevel = 'j4';
        alertMessage = `Expire dans ${daysRemaining} jours (J-4)`;
      } else if (daysRemaining <= 6) {
        alertLevel = 'j6';
        alertMessage = `Expire dans ${daysRemaining} jours (J-6)`;
      } else if (daysRemaining <= 8) {
        alertLevel = 'j8';
        alertMessage = `Expire dans ${daysRemaining} jours (J-8)`;
      } else if (daysRemaining <= 10) {
        alertLevel = 'j10';
        alertMessage = `Expire dans ${daysRemaining} jours (J-10)`;
      }

      return {
        ...toSafeShop(s),
        daysRemaining,
        alertLevel,
        alertMessage,
        shouldDeactivate,
        products_count: products.filter((p) => p.shop_id === s.id).length,
        orders_count: orders.filter((o) => o.shop_id === s.id).length,
        total_sales: orders.filter((o) => o.shop_id === s.id).reduce((sum, order) => sum + order.total_amount, 0),
        average_order_value: (() => {
          const shopOrders = orders.filter((o) => o.shop_id === s.id);
          return shopOrders.length
            ? Math.round(shopOrders.reduce((sum, order) => sum + order.total_amount, 0) / shopOrders.length)
            : 0;
        })(),
        last_order_at: orders
          .filter((o) => o.shop_id === s.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null,
        low_stock_count: products.filter((p) => p.shop_id === s.id && p.stock > 0 && p.stock <= 3).length,
        out_of_stock_count: products.filter((p) => p.shop_id === s.id && p.stock <= 0).length,
      };
    });

    res.json(adminShops);
  });

  // Manual ON/OFF toggle
  app.patch('/api/admin/shops/:id/toggle-active', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    shop.is_active = !shop.is_active;
    if (shop.is_active) shop.payment_status = 'approved';
    persistShop(shop);
    res.json({ success: true, is_active: shop.is_active, shop: toSafeShop(shop) });
  });

  app.post('/api/admin/shops/:id/access-link', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = randomUUID();
    shop.owner_access_token_hash = hashAccessToken(ownerAccessToken);
    persistShop(shop);
    const publicUrl = `${String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/${shop.slug}`;
    const accessUrl = `${String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/app?access=${encodeURIComponent(ownerAccessToken)}`;
    res.json({ success: true, shop: toSafeShop(shop), public_url: publicUrl, access_url: accessUrl });
  });

  // Manual Subscription Extension: +1 Mois, +3 Mois, +6 Mois, +1 An
  app.post('/api/admin/shops/:id/extend-subscription', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const { months } = req.body;
    const addMonths = Number(months) || 1;

    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    // If already expired, extend from today, otherwise from expiration date
    const currentExp = new Date(shop.subscription_expires_at);
    const baseDate = currentExp > new Date() ? currentExp : new Date();

    baseDate.setMonth(baseDate.getMonth() + addMonths);
    shop.subscription_expires_at = baseDate.toISOString().split('T')[0];
    shop.is_active = true; // reactivate automatically on renewal
    persistShop(shop);

    res.json({
      success: true,
      new_expiration_date: shop.subscription_expires_at,
      shop: toSafeShop(shop),
      message: `Abonnement prolongé de +${addMonths} mois avec succès !`,
    });
  });

  app.patch('/api/admin/shops/:id/subscription-expiration', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    const { expires_at, days_from_now } = req.body ?? {};
    let nextExpiration: string | null = null;

    if (expires_at) {
      const parsedDate = new Date(expires_at);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Date d’échéance invalide.' });
      }
      nextExpiration = parsedDate.toISOString().split('T')[0];
    } else if (Number.isInteger(Number(days_from_now))) {
      const days = Number(days_from_now);
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);
      baseDate.setDate(baseDate.getDate() + days);
      nextExpiration = baseDate.toISOString().split('T')[0];
    }

    if (!nextExpiration) {
      return res.status(400).json({ error: 'Précisez expires_at ou days_from_now.' });
    }

    shop.subscription_expires_at = nextExpiration;
    shop.last_notification_sent_at = null;
    shop.is_active = true;
    persistShop(shop);

    res.json({
      success: true,
      new_expiration_date: shop.subscription_expires_at,
      shop: toSafeShop(shop),
      message: 'Date d’échéance mise à jour par le super-admin.',
    });
  });

  // Automatic Alert Engine / Daily Cron Job Simulator
  app.post('/api/admin/trigger-cron', (req: Request, res: Response) => {
    const automation = runSubscriptionAutomation();

    res.json({
      success: true,
      timestamp: automation.timestamp,
      deactivatedCount: automation.deactivatedCount,
      alertsCount: automation.alertsGenerated.length,
      alerts: automation.alertsGenerated,
    });
  });

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

  app.get('/robots.txt', (req: Request, res: Response) => {
    const origin = getPublicOrigin(req);
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req: Request, res: Response) => {
    const origin = getPublicOrigin(req);
    const urls = [
      `${origin}/`,
      ...shops.filter((shop) => shop.is_active).map((shop) => `${origin}/${encodeURIComponent(shop.slug)}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc><changefreq>daily</changefreq><priority>${url === `${origin}/` ? '1.0' : '0.8'}</priority></url>`).join('')}</urlset>`;
    res.type('application/xml').send(xml);
  });

  // Vite middleware for development vs. Production static serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(async (req: Request, res: Response, next: express.NextFunction) => {
      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.startsWith('/@') && !url.includes('.')
        ? url.substring(1).split('/')[0]
        : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug) ? shops.find((s) => s.slug === matchSlug) : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;

      if (targetShop && (req.headers.accept?.includes('text/html') || req.headers['user-agent']?.toLowerCase().includes('whatsapp') || req.headers['user-agent']?.toLowerCase().includes('facebookexternalhit'))) {
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
      if (legalPage && req.headers.accept?.includes('text/html')) {
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
      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.includes('.') ? url.substring(1).split('/')[0] : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug) ? shops.find((s) => s.slug === matchSlug) : null;
      const legalPage = matchSlug && ['mentions-legales', 'confidentialite', 'cgu', 'cookies'].includes(matchSlug) ? matchSlug : null;

      if (targetShop && baseHtml) {
        const customHtml = injectShopOpenGraph(baseHtml, targetShop, req);
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(customHtml);
      }

      if (legalPage && baseHtml) {
        return res.status(200).set({ 'Content-Type': 'text/html' }).send(injectLegalSeo(baseHtml, legalPage, req));
      }

      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server MaTable.ci running on port ${PORT}`);
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
