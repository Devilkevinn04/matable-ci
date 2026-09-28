import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { dbAll, dbGet, dbRun, dbTransaction, databaseMode, initializeDatabase } from './db.ts';
import { createDiditVerificationSession, fetchDiditDecision, getDiditConfiguration, isMerchantKycEnabled, verifyDiditWebhookSignature } from './didit.ts';
import { sendWhatsAppCloudTemplate, sendWhatsAppCloudText } from './whatsapp.ts';
import { getCategoryDefaults, isShopCategory, normalizeCustomBannerImage, normalizeProductImage, normalizeWelcomeMessage } from './src/utils/categoryDefaults.ts';
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

interface ShopOpeningHours {
  enabled: boolean;
  open_time: string; // "08:00"
  close_time: string; // "22:00"
  days?: number[];
  manual_override?: boolean;
}

// Legacy plan identifiers remain accepted for compatibility with older records,
// while the V2 product experience stays free and not gated by tiers.
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
  merchant_verification_status?: 'not_required' | 'pending' | 'approved' | 'rejected' | 'retry_required';
  payment_status: 'pending' | 'awaiting_review' | 'approved' | 'rejected' | 'suspended';
  payment_deadline_at?: string | null;
  selected_subscription_tier?: SubscriptionTier;
  subscription_expires_at: string;
  last_notification_sent_at: string | null;
  created_at: string;
  category: ShopCategory;
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
    brand_direction?: 'luxe' | 'moderne' | 'authentique';
    custom_banner_url?: string;
    logo_url?: string;
    event_mode_enabled?: boolean;
    event_banner_text?: string;
    social_links?: {
      instagram?: string;
      facebook?: string;
      tiktok?: string;
      website?: string;
      whatsapp?: string;
    };
    delivery_zones?: Array<{
      label: string;
      mode: 'livraison' | 'sur_place' | 'retirer';
      fee: number;
      description?: string;
    }>;
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
  attributes?: Record<string, string>;
}

interface OrderRecord {
  id: number;
  shop_id: number;
  customer_user_id?: number;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  delivery_note?: string;
  delivery_slot?: string;
  payment_method_preference: 'wave' | 'mobile_money' | 'cash' | 'to_confirm';
  total_amount: number;
  created_at: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'expired';
  whatsapp_tracking_available?: boolean;
  whatsapp_clicked_at?: string | null;
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
    const abidjanNow = new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Abidjan' }));
    const abidjanWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Abidjan', weekday: 'short' }).format(d);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentMinutes = abidjanNow.getHours() * 60 + abidjanNow.getMinutes();
    const currentDay = dayMap[abidjanWeekday] ?? abidjanNow.getDay();

    if (shop.opening_hours.days && shop.opening_hours.days.length > 0 && !shop.opening_hours.days.includes(currentDay)) {
      return false;
    }

    const [openH, openM] = (shop.opening_hours.open_time || '08:00').split(':').map(Number);
    const [closeH, closeM] = (shop.opening_hours.close_time || '22:00').split(':').map(Number);
    const openMinutes = (openH || 0) * 60 + (openM || 0);
    const closeMinutes = (closeH || 0) * 60 + (closeM || 0);

    if (closeMinutes >= openMinutes) {
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    }

    return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
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

function isWeakShopPin(pin: unknown): boolean {
  const normalized = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(normalized)) {
    return true;
  }

  const blockedPins = new Set([
    '000000',
    '000001',
    '111222',
    '123123',
    '123456',
    '222222',
    '999999',
  ]);

  return blockedPins.has(normalized);
}

export function getSubscriptionPlanConfig(tier: SubscriptionTier | string): SubscriptionPlanConfig {
  const normalizedTier = (tier === 'premium' || tier === 'pro' || tier === 'standard') ? String(tier) : 'standard';
  const options: Record<SubscriptionTier, SubscriptionPlanConfig> = {
    standard: { tier: 'standard', amount: 0, label: 'Gratuit', description: 'Vitrine + catalogue + commandes' },
    premium: { tier: 'premium', amount: 0, label: 'Gratuit', description: 'Vitrine + catalogue + commandes' },
    pro: { tier: 'pro', amount: 0, label: 'Gratuit', description: 'Vitrine + catalogue + commandes' },
  };
  return options[normalizedTier as SubscriptionTier];
}

export function normalizeSubscriptionTier(tier?: SubscriptionTier | string): SubscriptionTier {
  return 'standard';
}

function toBusinessDateKey(value: string | Date, timeZone = 'Africa/Abidjan'): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function isSameBusinessDay(value: string | Date, referenceDate: Date = new Date(), timeZone = 'Africa/Abidjan'): boolean {
  return toBusinessDateKey(value, timeZone) === toBusinessDateKey(referenceDate, timeZone);
}

export function summarizeOrderMetrics<T extends { shop_id: number; total_amount: number; created_at: string; status?: string }>(
  orders: T[],
  shopId?: number,
  referenceDate: Date = new Date(),
) {
  const filteredOrders = (typeof shopId === 'number'
    ? orders.filter((order) => order.shop_id === shopId)
    : orders
  ).filter((order) => isSameBusinessDay(order.created_at, referenceDate));

  const received = filteredOrders.length;
  const pending = filteredOrders.filter((order) => order.status === 'pending').length;
  const confirmed = filteredOrders.filter((order) => order.status === 'confirmed').length;
  const delivered = filteredOrders.filter((order) => order.status === 'delivered').length;
  const cancelled = filteredOrders.filter((order) => order.status === 'cancelled').length;

  const caOrdered = filteredOrders
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const caConfirmed = filteredOrders
    .filter((order) => order.status === 'confirmed')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const caDelivered = filteredOrders
    .filter((order) => order.status === 'delivered')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  const panierMoyenLivre = delivered > 0 ? Math.round(caDelivered / delivered) : 0;

  return {
    received,
    pending,
    confirmed,
    delivered,
    cancelled,
    total_orders: received,
    ca_ordered: caOrdered,
    ca_confirmed: caConfirmed,
    ca_delivered: caDelivered,
    panier_moyen_livre: panierMoyenLivre,
  };
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
  paymentProvider: PaymentProvider = 'whatsapp',
): string {
  const plan = getSubscriptionPlanConfig(tier);
  const chosenAmount = Number.isFinite(amount) && amount > 0 ? amount : plan.amount;
  const safePaymentLink = paymentLink || 'https://wa.me/2250700000000?text=Je%20commande';

  if (paymentProvider === 'paystack') {
    return [
      `Bienvenue sur MaTable.ci, ${shopName}.`,
      `Votre accès est ${plan.label.toLowerCase()} : aucun paiement requis pour lancer votre boutique.`,
      `Le montant affiché est ${chosenAmount} FCFA, mais la V1 MaTable.ci reste gratuite et le parcours commande passe par WhatsApp.`,
      `Commande : ouvrez ce lien pour finaliser votre demande : ${safePaymentLink}`,
      'Aucun paiement requis. La commande est envoyée au commerçant via WhatsApp pour confirmation.',
    ].join('\n');
  }

  return [
    `Bienvenue sur MaTable.ci, ${shopName}.`,
    `Votre accès est ${plan.label.toLowerCase()} : aucun paiement requis pour lancer votre boutique.`,
    `Le montant affiché est ${chosenAmount} FCFA, mais la V1 MaTable.ci reste gratuite et le parcours commande passe par WhatsApp.`,
    `Commande : ouvrez ce lien pour finaliser votre demande : ${safePaymentLink}`,
    'Aucun paiement requis. La commande est envoyée au commerçant via WhatsApp pour confirmation.',
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

export async function isPaymentReferenceProcessed(
  provider: PaymentProvider | string,
  reference: string,
  shopId?: number,
): Promise<boolean> {
  const normalizedProvider = String(provider || 'paystack').trim() || 'paystack';
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference) return false;

  const row = shopId
    ? await dbGet('SELECT 1 FROM payment_transactions WHERE provider = ? AND reference = ? AND shop_id = ? LIMIT 1', [normalizedProvider, normalizedReference, shopId])
    : await dbGet('SELECT 1 FROM payment_transactions WHERE provider = ? AND reference = ? LIMIT 1', [normalizedProvider, normalizedReference]);

  return Boolean(row);
}

export async function markPaymentReferenceProcessed(
  provider: PaymentProvider | string,
  reference: string,
  shopId: number,
  tier: SubscriptionTier | string,
  amount: number,
): Promise<boolean> {
  const normalizedProvider = String(provider || 'paystack').trim() || 'paystack';
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference || !Number.isFinite(shopId)) {
    return false;
  }

  const normalizedTier = normalizeSubscriptionTier(tier || 'standard');
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;

  const result = databaseMode === 'postgresql'
    ? await dbRun(`INSERT INTO payment_transactions (provider, reference, shop_id, tier, amount, transaction_date, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW()) ON CONFLICT (provider, reference) DO NOTHING`,
      [normalizedProvider, normalizedReference, shopId, normalizedTier, normalizedAmount, new Date().toISOString()])
    : await dbRun(`INSERT OR IGNORE INTO payment_transactions (provider, reference, shop_id, tier, amount, transaction_date, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [normalizedProvider, normalizedReference, shopId, normalizedTier, normalizedAmount, new Date().toISOString()]);

  return result.changes > 0;
}

export async function activateShopSubscription(
  shop: ShopRecord,
  tier: SubscriptionTier | string,
  provider: PaymentProvider = 'paystack',
  reference?: string,
  amount?: number,
): Promise<{ activated: boolean; already_processed: boolean; payment_status: ShopRecord['payment_status']; tier: SubscriptionTier; amount: number; message: string; }> {
  const normalizedTier = normalizeSubscriptionTier(tier || shop.subscription_tier || shop.selected_subscription_tier || 'standard');

  const normalizedReference = reference ? String(reference).trim() : '';
  const planAmount = getSubscriptionPlanConfig(normalizedTier).amount;
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0 ? Number(amount) : planAmount;

  if (normalizedReference && await isPaymentReferenceProcessed(provider, normalizedReference, shop.id)) {
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
    await markPaymentReferenceProcessed(provider, normalizedReference, shop.id, normalizedTier, normalizedAmount);
  }

  shop.subscription_tier = normalizedTier;
  shop.selected_subscription_tier = normalizedTier;
  shop.payment_status = 'approved';
  shop.is_active = shop.merchant_verification_status === 'approved' || !shop.merchant_verification_status || shop.merchant_verification_status === 'not_required';
  shop.payment_deadline_at = null;
  shop.subscription_expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
  await persistShop(shop);

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
    pin_code_hash: '402138',
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
    pin_code_hash: '402138',
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
    pin_code_hash: '402138',
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

export async function saveMerchantSessionRecord(token: string, session: { shopId: number; expiresAt: number; fingerprint: string }) {
  await dbRun(`
    INSERT INTO merchant_sessions (token, shop_id, expires_at, fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      shop_id = excluded.shop_id,
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      created_at = excluded.created_at
  `, [token, session.shopId, session.expiresAt, session.fingerprint, new Date().toISOString()]);
}

export async function getMerchantSessionRecord(token: string): Promise<{ shopId: number; expiresAt: number; fingerprint: string } | null> {
  const row = await dbGet<{ shop_id: number; expires_at: number; fingerprint: string }>('SELECT shop_id, expires_at, fingerprint FROM merchant_sessions WHERE token = ?', [token]);
  if (!row) return null;
  return { shopId: Number(row.shop_id), expiresAt: Number(row.expires_at), fingerprint: row.fingerprint };
}

export async function deleteMerchantSessionRecord(token: string) {
  await dbRun('DELETE FROM merchant_sessions WHERE token = ?', [token]);
}

export async function saveAdminSessionRecord(token: string, session: { expiresAt: number; fingerprint: string }) {
  await dbRun(`
    INSERT INTO admin_sessions (token, expires_at, fingerprint, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      created_at = excluded.created_at
  `, [token, session.expiresAt, session.fingerprint, new Date().toISOString()]);
}

export async function getAdminSessionRecord(token: string): Promise<{ expiresAt: number; fingerprint: string } | null> {
  const row = await dbGet<{ expires_at: number; fingerprint: string }>('SELECT expires_at, fingerprint FROM admin_sessions WHERE token = ?', [token]);
  if (!row) return null;
  return { expiresAt: Number(row.expires_at), fingerprint: row.fingerprint };
}

export async function deleteAdminSessionRecord(token: string) {
  await dbRun('DELETE FROM admin_sessions WHERE token = ?', [token]);
}

export async function saveCustomerSessionRecord(token: string, session: { userId: number; expiresAt: number; fingerprint: string }) {
  await dbRun(`
    INSERT INTO user_sessions (token, user_id, expires_at, fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      created_at = excluded.created_at
  `, [token, session.userId, session.expiresAt, session.fingerprint, new Date().toISOString()]);
}

export async function getCustomerSessionRecord(token: string): Promise<{ userId: number; expiresAt: number; fingerprint: string } | null> {
  const row = await dbGet<{ user_id: number; expires_at: number; fingerprint: string }>('SELECT user_id, expires_at, fingerprint FROM user_sessions WHERE token = ?', [token]);
  if (!row) return null;
  return { userId: Number(row.user_id), expiresAt: Number(row.expires_at), fingerprint: row.fingerprint };
}

export async function deleteCustomerSessionRecord(token: string) {
  await dbRun('DELETE FROM user_sessions WHERE token = ?', [token]);
}

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
      return { authenticated: false, userType: null, shopId: null, user: null };
    }
    const renewedSession = { ...customerSession, expiresAt: Date.now() + SESSION_DURATION_MS };
    customerSessions.set(customerToken, renewedSession);
    await saveCustomerSessionRecord(customerToken, renewedSession);
    if (res) setCustomerSessionCookie(res, customerToken, renewedSession.fingerprint);
    const user = await dbGet<{ id: number; name: string; phone: string; email: string }>('SELECT id, name, phone, email FROM users WHERE id = ?', [customerSession.userId]);
    return { authenticated: true, userType: 'customer', shopId: null, user: user ? { id: user.id, name: user.name, phone: user.phone, email: user.email } : null };
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
    return { authenticated: false, userType: null, user: null };
  }

  const renewedSession = { ...session, expiresAt: Date.now() + SESSION_DURATION_MS };
  customerSessions.set(token, renewedSession);
  await saveCustomerSessionRecord(token, renewedSession);
  if (res) setCustomerSessionCookie(res, token, renewedSession.fingerprint);

  const user = await dbGet<{ id: number; name: string; phone: string; email: string; created_at: string; is_active: number }>('SELECT id, name, phone, email, created_at, is_active FROM users WHERE id = ?', [session.userId]);
  if (!user) return { authenticated: false, userType: null, user: null };

  return { authenticated: true, userType: 'customer', user: { id: user.id, name: user.name, phone: user.phone, email: user.email, created_at: user.created_at } };
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

  const verificationStatus = shop.merchant_verification_status || 'not_required';
  if (verificationStatus !== 'approved' && verificationStatus !== 'not_required') {
    if (req.method === 'GET') return next();
    return res.status(403).json({ error: 'Terminez la vérification d’identité avant de gérer votre catalogue ou vos commandes.', verification_status: verificationStatus });
  }
  if (!shop.is_active) {
    return res.status(403).json({ error: 'Boutique inactive : contactez l’administration pour la réactivation.' });
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
}, 15 * 60 * 1000).unref();

setInterval(() => {
  void purgeExpiredMerchantVerificationMetadata().catch(() => undefined);
}, 24 * 60 * 60 * 1000).unref();

const toSafeShop = (shop: ShopRecord) => {
  const {
    pin_code_hash: _pinCodeHash,
    owner_access_token_hash: _ownerAccessTokenHash,
    payment_status: _paymentStatus,
    payment_deadline_at: _paymentDeadlineAt,
    selected_subscription_tier: _selectedSubscriptionTier,
    subscription_expires_at: _subscriptionExpiresAt,
    subscription_tier: _subscriptionTier,
    ...safeShop
  } = shop;
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
      subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      shop.subscription_expires_at,
      shop.last_notification_sent_at,
      shop.created_at,
      shop.category,
      shop.city ?? null,
      shop.subscription_tier,
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

async function loadProductsFromDatabase() {
  const rows = await dbAll<Record<string, unknown>>('SELECT * FROM products ORDER BY id');
  return rows.map((row) => ({
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    customer_user_id: row.customer_user_id == null ? undefined : Number(row.customer_user_id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    price: Number(row.price),
    stock: Number(row.stock),
    image_url: String(row.image_url ?? ''),
    is_available: Boolean(row.is_available),
    category: row.category ? String(row.category) : undefined,
    sizes: row.sizes ? (typeof row.sizes === 'string' ? JSON.parse(row.sizes) : row.sizes) : undefined,
    colors: row.colors ? (typeof row.colors === 'string' ? JSON.parse(row.colors) : row.colors) : undefined,
    lookbook_image: row.lookbook_image ? String(row.lookbook_image) : undefined,
    prep_time: row.prep_time == null ? undefined : Number(row.prep_time),
    modifier_groups: row.modifier_groups ? (typeof row.modifier_groups === 'string' ? JSON.parse(row.modifier_groups) : row.modifier_groups) : undefined,
    attributes: row.attributes ? (typeof row.attributes === 'string' ? JSON.parse(row.attributes) : row.attributes) : undefined,
  })) as ProductRecord[];
}

async function loadShopsFromDatabase() {
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT shops.*, COALESCE(merchant_verifications.status, shops.merchant_verification_status, 'not_required') AS merchant_verification_status
    FROM shops LEFT JOIN merchant_verifications ON merchant_verifications.shop_id = shops.id
    ORDER BY shops.id
  `);
  return rows.map((row) => ({
    id: Number(row.id), name: String(row.name), slug: String(row.slug),
    whatsapp_number: String(row.whatsapp_number), pin_code_hash: String(row.pin_code_hash),
    theme_color: String(row.theme_color || ''), welcome_message: row.welcome_message == null ? null : String(row.welcome_message),
    is_open: Boolean(row.is_open), is_active: Boolean(row.is_active),
    merchant_verification_status: String(row.merchant_verification_status || 'not_required') as ShopRecord['merchant_verification_status'],
    payment_status: (String(row.payment_status || 'approved')) as ShopRecord['payment_status'],
    payment_deadline_at: row.payment_deadline_at == null ? null : String(row.payment_deadline_at),
    selected_subscription_tier: row.selected_subscription_tier ? String(row.selected_subscription_tier) as SubscriptionTier : undefined,
    subscription_expires_at: String(row.subscription_expires_at || ''),
    last_notification_sent_at: row.last_notification_sent_at == null ? null : String(row.last_notification_sent_at),
    created_at: String(row.created_at), category: String(row.category) as ShopRecord['category'],
    city: row.city == null ? undefined : String(row.city), subscription_tier: String(row.subscription_tier) as ShopRecord['subscription_tier'],
    theme_config: row.theme_config ? (typeof row.theme_config === 'string' ? JSON.parse(row.theme_config) : row.theme_config) : {},
    opening_hours: row.opening_hours ? (typeof row.opening_hours === 'string' ? JSON.parse(row.opening_hours) : row.opening_hours) : undefined,
    owner_access_token_hash: row.owner_access_token_hash ? String(row.owner_access_token_hash) : null,
  })) as ShopRecord[];
}

async function persistShop(shop: ShopRecord) {
  await dbRun(`
    INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active, merchant_verification_status, payment_status, payment_deadline_at, selected_subscription_tier, subscription_expires_at, last_notification_sent_at, created_at, category, city, subscription_tier, theme_config, opening_hours, owner_access_token_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, whatsapp_number=excluded.whatsapp_number,
      pin_code_hash=excluded.pin_code_hash, theme_color=excluded.theme_color, welcome_message=excluded.welcome_message,
      is_open=excluded.is_open, is_active=excluded.is_active, payment_status=excluded.payment_status,
      merchant_verification_status=excluded.merchant_verification_status,
      payment_deadline_at=excluded.payment_deadline_at, selected_subscription_tier=excluded.selected_subscription_tier,
      subscription_expires_at=excluded.subscription_expires_at, last_notification_sent_at=excluded.last_notification_sent_at,
      category=excluded.category, city=excluded.city, subscription_tier=excluded.subscription_tier,
      theme_config=excluded.theme_config, opening_hours=excluded.opening_hours, owner_access_token_hash=excluded.owner_access_token_hash
  `, [
    shop.id, shop.name, shop.slug, shop.whatsapp_number, shop.pin_code_hash, shop.theme_color, shop.welcome_message,
    shop.is_open ? 1 : 0, shop.is_active ? 1 : 0, shop.merchant_verification_status || 'not_required', shop.payment_status || 'approved', shop.payment_deadline_at ?? null,
    shop.selected_subscription_tier ?? shop.subscription_tier, shop.subscription_expires_at, shop.last_notification_sent_at,
    shop.created_at, shop.category, shop.city ?? null, shop.subscription_tier, JSON.stringify(shop.theme_config),
    shop.opening_hours ? JSON.stringify(shop.opening_hours) : null, shop.owner_access_token_hash ?? null
  ]);
}

async function persistProduct(product: ProductRecord) {
  await dbRun(`
    INSERT INTO products (id, shop_id, title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups, attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET shop_id=excluded.shop_id, title=excluded.title, description=excluded.description,
      price=excluded.price, stock=excluded.stock, image_url=excluded.image_url, is_available=excluded.is_available,
      category=excluded.category, sizes=excluded.sizes, colors=excluded.colors, lookbook_image=excluded.lookbook_image, prep_time=excluded.prep_time,
      modifier_groups=excluded.modifier_groups, attributes=excluded.attributes
  `, [
    product.id, product.shop_id, product.title, product.description ?? null, product.price, product.stock, product.image_url,
    product.is_available ? 1 : 0, product.category ?? null, product.sizes ? JSON.stringify(product.sizes) : null, product.colors ? JSON.stringify(product.colors) : null,
    product.lookbook_image ?? null, product.prep_time ?? null, product.modifier_groups ? JSON.stringify(product.modifier_groups) : null,
    product.attributes && Object.keys(product.attributes).length > 0 ? JSON.stringify(product.attributes) : null
  ]);
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

async function loadOrdersFromDatabase() {
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT orders.*, order_whatsapp_tracking.order_id IS NOT NULL AS whatsapp_tracking_available,
      order_whatsapp_tracking.clicked_at AS whatsapp_clicked_at
    FROM orders LEFT JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
    ORDER BY orders.created_at DESC, orders.id DESC
  `);
  return rows.map((row) => ({
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    customer_name: String(row.customer_name),
    customer_phone: String(row.customer_phone),
    delivery_location: String(row.delivery_location),
    delivery_note: row.delivery_note ? String(row.delivery_note) : undefined,
    delivery_slot: row.delivery_slot ? String(row.delivery_slot) : undefined,
    payment_method_preference: String(row.payment_method_preference || 'to_confirm') as OrderRecord['payment_method_preference'],
    total_amount: Number(row.total_amount),
    created_at: String(row.created_at),
    status: (String(row.status || 'pending')) as OrderRecord['status'],
    whatsapp_tracking_available: Boolean(row.whatsapp_tracking_available),
    whatsapp_clicked_at: row.whatsapp_clicked_at == null ? null : String(row.whatsapp_clicked_at),
    customer_user_id: row.customer_user_id == null ? undefined : Number(row.customer_user_id),
    items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : [],
  })) as OrderRecord[];
}

async function refreshRuntimeDataFromDatabase() {
  const persistedShops = await loadShopsFromDatabase();
  shops.splice(0, shops.length, ...persistedShops);
  products.splice(0, products.length, ...await loadProductsFromDatabase());
  orders.splice(0, orders.length, ...await loadOrdersFromDatabase());
}

async function persistOrder(order: OrderRecord) {
  await dbRun(`
    INSERT INTO orders (
      id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
      delivery_slot, payment_method_preference, total_amount, created_at, status, items, customer_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status
  `, [
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
    JSON.stringify(order.items ?? []),
    order.customer_user_id ?? null
  ]);
}

async function allocateRecordId(entity: 'shops' | 'products' | 'orders') {
  const row = await dbGet<{ id: number }>(`
    INSERT INTO id_allocators (name, last_id)
    SELECT ?, COALESCE(MAX(id), 0) + 1 FROM ${entity} WHERE TRUE
    ON CONFLICT(name) DO UPDATE SET last_id = id_allocators.last_id + 1
    RETURNING last_id AS id
  `, [entity]);
  if (!row) throw new Error(`Impossible d’allouer un identifiant pour ${entity}.`);
  return Number(row.id);
}

async function beginMerchantVerification(shop: ShopRecord, req: Request, email?: string) {
  const callbackToken = randomUUID();
  const configuredOrigin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const callbackUrl = new URL('/api/merchant-verification/callback', configuredOrigin);
  callbackUrl.searchParams.set('shop_id', String(shop.id));
  callbackUrl.searchParams.set('token', callbackToken);
  const session = await createDiditVerificationSession({ shopId: shop.id, callbackUrl: callbackUrl.toString(), email });
  const timestamp = new Date().toISOString();
  await dbTransaction(async (transaction) => {
    await transaction.run(`
    INSERT INTO merchant_verifications (
      shop_id, provider, provider_session_id, callback_token_hash, status, submitted_at, decided_at, updated_at
    ) VALUES (?, 'didit', ?, ?, 'pending', ?, NULL, ?)
    ON CONFLICT(shop_id) DO UPDATE SET provider='didit', provider_session_id=excluded.provider_session_id,
      callback_token_hash=excluded.callback_token_hash, status='pending', submitted_at=excluded.submitted_at,
      decided_at=NULL, updated_at=excluded.updated_at
    `, [shop.id, session.sessionId, hashAccessToken(callbackToken), timestamp, timestamp]);
    await transaction.run("UPDATE shops SET merchant_verification_status = 'pending', is_active = 0, is_open = 0 WHERE id = ?", [shop.id]);
  });
  shop.merchant_verification_status = 'pending';
  shop.is_active = false;
  shop.is_open = false;
  return session;
}

function mapDiditStatus(status: string): ShopRecord['merchant_verification_status'] | null {
  if (status === 'Approved') return 'approved';
  if (status === 'Declined') return 'rejected';
  if (status === 'Expired' || status === 'Abandoned' || status === 'Kyc Expired') return 'retry_required';
  if (status === 'Not Started' || status === 'In Progress' || status === 'In Review' || status === 'Resubmitted' || status === 'Awaiting User') return 'pending';
  return null;
}

async function applyMerchantVerificationDecision(sessionId: string, providerStatus: string, eventId?: string) {
  const nextStatus = mapDiditStatus(providerStatus);
  if (!nextStatus) return null;
  const result = await dbTransaction(async (transaction) => {
    if (eventId) {
      const insertedEvent = await transaction.run(
        'INSERT INTO merchant_verification_webhook_events (event_id, received_at) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING',
        [eventId, new Date().toISOString()],
      );
      if (insertedEvent.changes === 0) return null;
    }

    const verification = await transaction.get<{ shop_id: number; status: string }>(
      `SELECT shop_id, status FROM merchant_verifications WHERE provider_session_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [sessionId],
    );
    if (!verification) return null;
    if ((verification.status === 'approved' || verification.status === 'rejected' || verification.status === 'retry_required')
      && nextStatus === 'pending' && providerStatus !== 'Resubmitted') {
      return { shopId: Number(verification.shop_id), status: verification.status as ShopRecord['merchant_verification_status'] };
    }

    const decidedAt = ['approved', 'rejected', 'retry_required'].includes(nextStatus) ? new Date().toISOString() : null;
    await transaction.run(
      `UPDATE merchant_verifications SET status = ?, decided_at = ?, updated_at = ?,
        callback_token_hash = CASE WHEN ? = 'pending' THEN callback_token_hash ELSE NULL END
       WHERE provider_session_id = ?`,
      [nextStatus, decidedAt, new Date().toISOString(), nextStatus, sessionId],
    );
    await transaction.run(
      'UPDATE shops SET merchant_verification_status = ?, is_active = ?, is_open = CASE WHEN ? = 1 THEN is_open ELSE 0 END WHERE id = ?',
      [nextStatus, nextStatus === 'approved' ? 1 : 0, nextStatus === 'approved' ? 1 : 0, verification.shop_id],
    );
    return { shopId: Number(verification.shop_id), status: nextStatus };
  });

  if (result) {
    const shop = shops.find((candidate) => candidate.id === result.shopId);
    if (shop) {
      shop.merchant_verification_status = result.status;
      shop.is_active = result.status === 'approved';
      if (!shop.is_active) shop.is_open = false;
    }
  }
  return result;
}

async function purgeExpiredMerchantVerificationMetadata() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const expiredPendingIds = await dbTransaction(async (transaction) => {
    const expired = await transaction.all<{ shop_id: number }>(
      "SELECT shop_id FROM merchant_verifications WHERE status = 'pending' AND updated_at < ?",
      [cutoff],
    );
    for (const row of expired) {
      await transaction.run(
        "UPDATE shops SET merchant_verification_status = 'retry_required', is_active = 0, is_open = 0 WHERE id = ? AND merchant_verification_status = 'pending'",
        [row.shop_id],
      );
    }
    await transaction.run('DELETE FROM merchant_verifications WHERE updated_at < ?', [cutoff]);
    await transaction.run('DELETE FROM merchant_verification_webhook_events WHERE received_at < ?', [cutoff]);
    return expired.map((row) => Number(row.shop_id));
  });
  for (const shop of shops) {
    if (expiredPendingIds.includes(shop.id) && shop.merchant_verification_status === 'pending') {
      shop.merchant_verification_status = 'retry_required';
      shop.is_active = false;
      shop.is_open = false;
    }
  }
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

  app.use(express.json({ limit: '2mb' }));
  app.use('/api/shops/:id/toggle-status', requireMerchantAccess);
  app.use('/api/shops/:id/theme', requireMerchantAccess);
  app.use('/api/shops/:id/products', requireMerchantAccess);
  app.use('/api/shops/:id/orders', requireMerchantAccess);
  app.use('/api/shops/:id/flash-bilan', requireMerchantAccess);
  app.use('/api/admin', requireAdminAccess);
  await initializeDatabase();
  await purgeExpiredMerchantVerificationMetadata();
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
  const persistedMerchantSessions = await dbAll<{ token: string; shop_id: number; expires_at: number; fingerprint: string }>('SELECT token, shop_id, expires_at, fingerprint FROM merchant_sessions WHERE expires_at > ?', [Date.now()]);
  for (const record of persistedMerchantSessions) {
    merchantSessions.set(record.token, { shopId: record.shop_id, expiresAt: record.expires_at, fingerprint: record.fingerprint });
  }
  const persistedAdminSessions = await dbAll<{ token: string; expires_at: number; fingerprint: string }>('SELECT token, expires_at, fingerprint FROM admin_sessions WHERE expires_at > ?', [Date.now()]);
  for (const record of persistedAdminSessions) {
    adminSessions.set(record.token, { expiresAt: record.expires_at, fingerprint: record.fingerprint });
  }
  // --- API ROUTES ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), whatsapp_cloud: 'locked' });
  });

  app.get('/api/merchant-verification/config', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ required: isMerchantKycEnabled(), available: Boolean(getDiditConfiguration()) });
  });

  app.post('/api/webhooks/didit', async (req: Request, res: Response) => {
    const configuration = getDiditConfiguration();
    if (!configuration) return res.status(503).json({ error: 'Webhook KYC non configuré.' });
    const event = req.body as Record<string, unknown> | undefined;
    const signature = req.get('x-signature-v2');
    const timestamp = req.get('x-timestamp');
    if (!event || !verifyDiditWebhookSignature(event, signature, timestamp, configuration.webhookSecret)) {
      return res.status(401).json({ error: 'Signature de webhook invalide.' });
    }
    const expectedEnvironment = process.env.DIDIT_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');
    if (event.environment !== expectedEnvironment) return res.status(403).json({ error: 'Environnement de webhook inattendu.' });
    if (event.webhook_type !== 'status.updated') return res.status(204).end();

    const sessionId = String(event.session_id || '');
    const eventId = String(event.event_id || '');
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId) || !/^[A-Za-z0-9-]{1,100}$/.test(eventId)) {
      return res.status(400).json({ error: 'Événement Didit invalide.' });
    }
    try {
      const knownSession = await dbGet('SELECT 1 FROM merchant_verifications WHERE provider_session_id = ?', [sessionId]);
      if (!knownSession) return res.status(404).json({ error: 'Session de vérification inconnue.' });
      const decision = await fetchDiditDecision(sessionId, configuration);
      const applied = await applyMerchantVerificationDecision(sessionId, decision.status, eventId);
      if (!applied) return res.status(204).end();
      res.status(204).end();
    } catch {
      res.status(503).json({ error: 'La décision Didit n’a pas pu être confirmée.' });
    }
  });

  app.get('/api/merchant-verification/callback', rateLimitPublicRequest(30), async (req: Request, res: Response) => {
    const shopId = Number(req.query.shop_id);
    const callbackToken = String(req.query.token || '');
    const sessionId = String(req.query.verificationSessionId || '');
    const redirectToApp = (status: string) => {
      const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const destination = new URL('/app', origin);
      destination.searchParams.set('merchant-verification', status);
      return res.redirect(303, destination.toString());
    };
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !callbackToken || !sessionId) return redirectToApp('invalid');

    try {
      const verification = await dbGet<{ provider_session_id: string; callback_token_hash: string | null }>(
        'SELECT provider_session_id, callback_token_hash FROM merchant_verifications WHERE shop_id = ?', [shopId],
      );
      if (!verification || !verification.callback_token_hash || verification.provider_session_id !== sessionId
        || !timingSafeEqual(hashAccessToken(callbackToken), verification.callback_token_hash)) {
        return redirectToApp('invalid');
      }
      const decision = await fetchDiditDecision(sessionId);
      const claimedCallback = await dbRun(
        'UPDATE merchant_verifications SET callback_token_hash = ? WHERE shop_id = ? AND callback_token_hash = ?',
        [null, shopId, verification.callback_token_hash],
      );
      if (claimedCallback.changes !== 1) return redirectToApp('invalid');
      const applied = await applyMerchantVerificationDecision(sessionId, decision.status);
      if (!applied) return redirectToApp('invalid');
      await createMerchantSession(res, shopId, req);
      return redirectToApp(applied.status || 'pending');
    } catch {
      return redirectToApp('retry');
    }
  });

  app.get('/api/shops/:id/merchant-verification', requireMerchantOwner, (req: Request, res: Response) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    res.json({ verification_status: shop.merchant_verification_status || 'not_required' });
  });

  app.post('/api/shops/:id/merchant-verification/start', rateLimitPublicRequest(3), requireMerchantOwner, async (req: Request, res: Response) => {
    const shop = shops.find((candidate) => candidate.id === Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!isMerchantKycEnabled() || !getDiditConfiguration()) {
      return res.status(503).json({ error: 'La vérification d’identité n’est pas configurée.' });
    }
    if (!['rejected', 'retry_required'].includes(shop.merchant_verification_status || 'not_required')) {
      return res.status(409).json({ error: 'Aucune nouvelle vérification ne peut être démarrée dans l’état actuel.' });
    }
    try {
      const verification = await beginMerchantVerification(shop, req);
      await persistShop(shop);
      res.json({ success: true, verification_url: verification.url, verification_status: 'pending' });
    } catch {
      res.status(502).json({ error: 'Impossible de démarrer la vérification. Réessayez plus tard.' });
    }
  });

  app.post('/api/analytics/page-view', rateLimitPublicRequest(120), async (req: Request, res: Response) => {
    const shopId = req.body?.shop_id == null ? null : Number(req.body.shop_id);
    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId || sessionId.length > 100 || (shopId !== null && !Number.isInteger(shopId))) {
      return res.status(400).json({ error: 'Événement analytics invalide.' });
    }
    if (shopId !== null && !shops.some((shop) => shop.id === shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const shopCondition = shopId === null ? 'shop_id IS NULL' : 'shop_id = ?';
    const analyticsParams = shopId === null ? [sessionId, `${today}%`] : [shopId, sessionId, `${today}%`];
    const alreadyTracked = await dbGet(`
      SELECT 1 FROM analytics_events
      WHERE ${shopCondition} AND event_type = 'page_view' AND session_id = ? AND created_at LIKE ?
      LIMIT 1
    `, analyticsParams);
    if (!alreadyTracked) {
      await dbRun('INSERT INTO analytics_events (shop_id, event_type, session_id, path, created_at) VALUES (?, ?, ?, ?, ?)', [shopId, 'page_view', sessionId, String(req.body?.path || '').slice(0, 300), new Date().toISOString()]);
    }
    res.status(204).end();
  });

  // 1. SHOPS
  // Get all active public shops (for shop selector / discovery)
  app.get('/api/shops', (req: Request, res: Response) => {
    const publicShops = shops
      .filter((shop) => shop.is_active)
      .map((s) => ({
        ...(() => {
          const shopProducts = products.filter((product) => product.shop_id === s.id);
          const availableProducts = shopProducts.filter((product) => product.is_available && product.stock > 0);
          return {
            products_preview: availableProducts.slice(0, 3).map((product) => ({
              id: product.id,
              title: product.title,
              image_url: product.image_url,
              price: product.price,
            })),
            products_count: availableProducts.length,
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
        theme_config: s.theme_config,
        opening_hours: s.opening_hours,
      }))
      .sort((a, b) => {
        const openPriority = Number(b.is_open) - Number(a.is_open);
        if (openPriority !== 0) return openPriority;
        return String(a.name).localeCompare(String(b.name));
      });
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
      return res.status(401).json({ error: 'Session rejetée : le navigateur ne correspond plus à celui utilisé lors de la connexion.' });
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
        merchant_verification_status: shop.merchant_verification_status || 'not_required',
        category: shop.category,
        city: shop.city,
        theme_config: shop.theme_config,
        opening_hours: shop.opening_hours,
      },
      products: shopProducts,
    });
  });

  app.post('/api/shops/:id/access-link', requireMerchantAccess, async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id);
    const origin = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({
      success: true,
      public_url: `${origin}/${encodeURIComponent(shop.slug)}`,
      access_url: `${origin}/app?access=${encodeURIComponent(ownerAccessToken)}`,
    });
  });

  // Toggle shop ordering status (Ouvert / Fermé) - POST /api/shops/:id/toggle-status
  app.post('/api/shops/:id/toggle-status', async (req: Request, res: Response) => {
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
    await persistShop(shop);

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

  app.patch('/api/shops/:id/toggle-status', async (req: Request, res: Response) => {
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
    await persistShop(shop);

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
  app.put('/api/shops/:id/theme', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable' });
    }

    const { theme_config } = req.body;
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
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
      // Keep legacy theme_color in sync with primary_color
      if (requestedThemeConfig.primary_color) {
        shop.theme_color = requestedThemeConfig.primary_color;
      }
    }

    await persistShop(shop);

    res.json({ success: true, shop: toSafeShop(shop), theme_config: shop.theme_config });
  });

  // Update shop settings (Merchant)
  app.put('/api/shops/:id', requireMerchantAccess, async (req: Request, res: Response) => {
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
      const rawPin = String(pin_code).trim();
      if (isWeakShopPin(rawPin)) {
        return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN à 6 chiffres fort.' });
      }
      shop.pin_code_hash = hashPin(rawPin);
    }
    if (isShopCategory(category)) {
      shop.category = category;
    }
    if (theme_config) {
      const requestedThemeConfig = { ...theme_config };
      const requestedBrandDirection = ['luxe', 'moderne', 'authentique'].includes(requestedThemeConfig.brand_direction)
        ? requestedThemeConfig.brand_direction as ShopRecord['theme_config']['brand_direction']
        : shop.theme_config.brand_direction;
      const sanitizedThemeConfig = {
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
      shop.theme_config = sanitizedThemeConfig;
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

  // Create new shop (Onboarding with category and subscription tier)
  app.post('/api/shops', rateLimitPublicRequest(10), async (req: Request, res: Response) => {
    const kycEnabled = isMerchantKycEnabled();
    if (kycEnabled && !getDiditConfiguration()) {
      return res.status(503).json({ error: 'La vérification d’identité des commerçants n’est pas encore configurée.' });
    }
    if (kycEnabled && req.body?.identity_verification_consent !== true) {
      return res.status(400).json({ error: 'Votre accord est requis pour la vérification d’identité.' });
    }
    const { name, whatsapp_number, pin_code, pin, category, city, subscription_tier, welcome_message, theme_config, opening_hours } = req.body;
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
    const socialLinks = {
      ...(requestedThemeConfig.social_links || {}),
    };
    const deliveryZones = Array.isArray(requestedThemeConfig.delivery_zones)
      ? requestedThemeConfig.delivery_zones.slice(0, 8).map((zone: any) => ({
          label: String(zone?.label || 'Zone locale'),
          mode: zone?.mode === 'sur_place' || zone?.mode === 'retirer' ? zone.mode : 'livraison',
          fee: Number(zone?.fee || 0),
          description: zone?.description ? String(zone.description).slice(0, 120) : undefined,
        }))
      : [];

    if (safeName.length < 2 || !whatsapp_number || !/^[0-9]{6}$/.test(String(effectivePin || '').trim())) {
      return res.status(400).json({ error: 'Nom, numéro WhatsApp et code PIN requis.' });
    }
    if (isWeakShopPin(effectivePin)) {
      return res.status(400).json({ error: 'Le code PIN est trop simple ou invalide. Utilisez un PIN à 6 chiffres fort.' });
    }

    const reservedShopId = await allocateRecordId('shops');
    const normalizedWhatsAppPhone = normalizeWhatsAppPhone(whatsapp_number);
    if (!normalizedWhatsAppPhone) {
      return res.status(400).json({ error: 'Numéro WhatsApp ivoirien invalide. Utilisez +225 suivi de 10 chiffres.' });
    }
    if (shops.some((shop) => shop.whatsapp_number === normalizedWhatsAppPhone)) {
      return res.status(409).json({ error: 'Ce numéro WhatsApp est déjà associé à une boutique. Utilisez son lien privé de gestion.' });
    }

    const shopCategory: ShopRecord['category'] = isShopCategory(category) ? category : 'other';
    const categoryDefaults = getCategoryDefaults(shopCategory);
    const chosenTier: SubscriptionTier = normalizeSubscriptionTier(subscription_tier || 'standard');
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

    const mergedThemeConfig = {
      primary_color: requestedThemeConfig.primary_color || categoryDefaults.primaryColor,
      secondary_color: requestedThemeConfig.secondary_color || categoryDefaults.secondaryColor,
      font_family: requestedThemeConfig.font_family || 'Plus Jakarta Sans',
      layout_style: requestedThemeConfig.layout_style || categoryDefaults.layoutStyle,
      theme_preset_id: requestedThemeConfig.theme_preset_id || categoryDefaults.themePresetId,
      brand_direction: ['luxe', 'moderne', 'authentique'].includes(requestedThemeConfig.brand_direction)
        ? requestedThemeConfig.brand_direction as ShopRecord['theme_config']['brand_direction']
        : categoryDefaults.brandDirection,
      custom_banner_url: normalizeCustomBannerImage(requestedThemeConfig.custom_banner_url, shopCategory),
      logo_url: requestedThemeConfig.logo_url || '',
      event_mode_enabled: Boolean(requestedThemeConfig.event_mode_enabled),
      event_banner_text: requestedThemeConfig.event_banner_text || '🎉 Commande rapide • Livraison et retrait disponibles',
      social_links: {
        instagram: typeof requestedThemeConfig.social_links?.instagram === 'string' ? String(requestedThemeConfig.social_links.instagram).trim() : '',
        facebook: typeof requestedThemeConfig.social_links?.facebook === 'string' ? String(requestedThemeConfig.social_links.facebook).trim() : '',
        tiktok: typeof requestedThemeConfig.social_links?.tiktok === 'string' ? String(requestedThemeConfig.social_links.tiktok).trim() : '',
        website: typeof requestedThemeConfig.social_links?.website === 'string' ? String(requestedThemeConfig.social_links.website).trim() : '',
        whatsapp: typeof requestedThemeConfig.social_links?.whatsapp === 'string' ? String(requestedThemeConfig.social_links.whatsapp).trim() : '',
      },
      delivery_zones: deliveryZones,
      advanced_css: {
        borderRadius: requestedThemeConfig.advanced_css?.borderRadius || 'rounded-xl',
        shadowIntensity: requestedThemeConfig.advanced_css?.shadowIntensity || 'subtle',
        accentGlow: Boolean(requestedThemeConfig.advanced_css?.accentGlow),
      },
    };

    const newShop: ShopRecord = {
      id: reservedShopId,
      name: safeName,
      slug: uniqueSlug,
      whatsapp_number: normalizedWhatsAppPhone,
      pin_code_hash: hashedPin,
      owner_access_token_hash: hashAccessToken(ownerAccessToken),
      theme_color: categoryDefaults.primaryColor,
      welcome_message: normalizeWelcomeMessage(safeWelcomeMessage, shopCategory),
      is_open: false,
      is_active: !kycEnabled,
      merchant_verification_status: kycEnabled ? 'pending' : 'not_required',
      payment_status: 'approved',
      payment_deadline_at: null,
      selected_subscription_tier: chosenTier,
      subscription_expires_at: addDays(new Date(), 30),
      last_notification_sent_at: null,
      created_at: new Date().toISOString(),
      category: shopCategory,
      city: safeCity,
      subscription_tier: chosenTier,
      opening_hours: normalizedOpeningHours,
      theme_config: mergedThemeConfig,
    };

    if (!kycEnabled && normalizedOpeningHours.enabled && !normalizedOpeningHours.manual_override) {
      newShop.is_open = computeIsShopOpen(newShop);
    }

    shops.push(newShop);
    await persistShop(newShop);

    if (kycEnabled) {
      try {
        const contactEmail = typeof req.body?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())
          ? req.body.email.trim().slice(0, 254)
          : undefined;
        const verification = await beginMerchantVerification(newShop, req, contactEmail);
        await createMerchantSession(res, newShop.id, req);
        return res.status(201).json({
          success: true,
          shop: toSafeShop(newShop),
          verification_required: true,
          verification_url: verification.url,
          message: 'Votre boutique est créée. Terminez la vérification d’identité pour activer votre espace marchand.',
        });
      } catch (error) {
        console.error('Merchant identity session could not be started.');
        newShop.merchant_verification_status = 'retry_required';
        newShop.is_active = false;
        newShop.is_open = false;
        await persistShop(newShop);
        return res.status(503).json({
          error: 'Votre boutique est créée mais la vérification n’a pas pu démarrer. Connectez-vous avec votre WhatsApp et votre PIN pour réessayer.',
          account_created: true,
        });
      }
    }

    await createMerchantSession(res, newShop.id, req);
    res.json({
      success: true,
      shop: toSafeShop(newShop),
      owner_access_token: ownerAccessToken,
      message: 'Boutique créée. Les commandes clients sont envoyées au vendeur via un reçu WhatsApp à ouvrir manuellement.',
    });
  });

  // 2. AUTHENTICATION (Phone + 6-digit PIN)
  // Explicit route for merchant login
  app.post('/api/auth/merchant-login', async (req: Request, res: Response) => {
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

    const verificationStatus = shop.merchant_verification_status || 'not_required';
    const verificationPending = ['pending', 'rejected', 'retry_required'].includes(verificationStatus);
    if (!shop.is_active && !verificationPending) {
      return res.status(403).json({
        error: 'Votre boutique est inactive. Contactez l’administration MaTable.ci pour la réactivation.',
      });
    }

    await createMerchantSession(res, shop.id, req);
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
        merchant_verification_status: verificationStatus,
        category: shop.category,
        theme_config: shop.theme_config,
      },
    });
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    const token = getCookie(req, 'matable_session');
    if (token) {
      merchantSessions.delete(token);
      await deleteMerchantSessionRecord(token);
    }
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    const state = await getSessionStateForResponse(req, res);
    if (state.userType === 'merchant' && state.shopId) {
      const shop = shops.find((candidate) => candidate.id === state.shopId);
      return res.json({ ...state, merchantVerificationStatus: shop?.merchant_verification_status || 'not_required' });
    }
    res.json(state);
  });

  app.post('/api/auth/merchant-access-login', async (req: Request, res: Response) => {
    const token = String(req.body?.access_token || '').trim();
    if (!token || token.length > 200) return res.status(400).json({ error: 'Lien d’accès invalide.' });
    const tokenHash = hashAccessToken(token);
    const shop = shops.find((candidate) => candidate.owner_access_token_hash === tokenHash);
    if (!shop) return res.status(401).json({ error: 'Lien d’accès invalide.' });
    const verificationStatus = shop.merchant_verification_status || 'not_required';
    if (!shop.is_active && !['pending', 'rejected', 'retry_required'].includes(verificationStatus)) {
      return res.status(403).json({
        error: 'Boutique inactive : contactez l’administrateur pour la réactivation.',
      });
    }
    await createMerchantSession(res, shop.id, req);
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

    const ownerAccessToken = await rotateMerchantAccessTokenForShop(shop.id, undefined);
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

    const newToken = await rotateMerchantAccessTokenForShop(shop.id, undefined);
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

  app.post('/api/auth/admin-login', async (req: Request, res: Response) => {
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
    const adminSession = { expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS, fingerprint: buildSessionFingerprint(req) };
    adminSessions.set(token, adminSession);
    await saveAdminSessionRecord(token, adminSession);
    setAdminSessionCookie(res, token);
    res.json({ success: true });
  });

  app.post('/api/auth/admin-logout', async (req: Request, res: Response) => {
    const token = await getAdminSession(req);
    if (token) {
      adminSessions.delete(token);
      await deleteAdminSessionRecord(token);
    }
    res.setHeader('Set-Cookie', 'matable_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
  });

  app.post('/api/auth/customer-register', rateLimitPublicRequest(20), async (req: Request, res: Response) => {
    const { name, phone, email, password } = req.body || {};
    const safeName = sanitizeTextField(String(name || ''), 80).trim();
    const safePhone = String(phone || '').trim();
    const safeEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');

    if (!safeName || safeName.length < 2) {
      return res.status(400).json({ error: 'Le nom est requis.' });
    }
    const phoneIsValidIvorian = /^\+?225\d{8,12}$/.test(safePhone);
    if (!safePhone || !phoneIsValidIvorian) {
      return res.status(400).json({ error: 'Le téléphone est requis au format ivoirien.' });
    }
    if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return res.status(400).json({ error: 'Un email valide est requis.' });
    }
    if (!safePassword || safePassword.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    const existing = await dbGet<{ id: number }>('SELECT id FROM users WHERE email = ? OR phone = ?', [safeEmail, safePhone]);
    if (existing) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email ou ce téléphone.' });
    }

    const passwordHash = bcrypt.hashSync(safePassword, 10);
    const inserted = await dbGet<{ id: number }>('INSERT INTO users (name, phone, email, password_hash, created_at, is_active) VALUES (?, ?, ?, ?, ?, 1) RETURNING id', [safeName, safePhone, safeEmail, passwordHash, new Date().toISOString()]);
    const user = inserted ? await dbGet<{ id: number; name: string; phone: string; email: string; created_at: string }>('SELECT id, name, phone, email, created_at FROM users WHERE id = ?', [inserted.id]) : undefined;
    if (!user) return res.status(500).json({ error: 'Impossible de créer le compte.' });

    const token = randomUUID();
    const session = { userId: user.id, expiresAt: Date.now() + SESSION_DURATION_MS, fingerprint: buildSessionFingerprint(req) };
    customerSessions.set(token, session);
    await saveCustomerSessionRecord(token, session);
    setCustomerSessionCookie(res, token, session.fingerprint);

    res.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, created_at: user.created_at } });
  });

  app.post('/api/auth/customer-login', rateLimitPublicRequest(20), async (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const safeEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');

    if (!safeEmail || !safePassword) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const user = await dbGet<{ id: number; name: string; phone: string; email: string; password_hash: string; created_at: string; is_active: number }>('SELECT * FROM users WHERE email = ?', [safeEmail]);
    if (!user || !bcrypt.compareSync(safePassword, user.password_hash)) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte client désactivé.' });
    }

    const token = randomUUID();
    const session = { userId: user.id, expiresAt: Date.now() + SESSION_DURATION_MS, fingerprint: buildSessionFingerprint(req) };
    customerSessions.set(token, session);
    await saveCustomerSessionRecord(token, session);
    setCustomerSessionCookie(res, token, session.fingerprint);

    res.json({ success: true, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, created_at: user.created_at } });
  });

  app.get('/api/auth/customer-session', async (req: Request, res: Response) => {
    const state = await getCustomerSessionState(req, res);
    res.json({ ...state, authenticated: !!state.authenticated });
  });

  app.post('/api/auth/customer-logout', async (req: Request, res: Response) => {
    const token = getCookie(req, 'matable_customer_session');
    if (token) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
    }
    res.setHeader('Set-Cookie', [
      'matable_customer_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      'matable_customer_session_fp=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    ]);
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

  app.post('/api/shops/:id/products', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups, attributes } = req.body;

    const safeTitle = sanitizeTextField(title, 120);
    const numericPrice = Number(price);
    const numericStock = Number(stock ?? 0);
    if (safeTitle.length < 2 || !Number.isSafeInteger(numericPrice) || numericPrice < 0 || !Number.isSafeInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Titre et prix obligatoires.' });
    }

    const newProduct: ProductRecord = {
      id: await allocateRecordId('products'),
      shop_id: shopId,
      title: safeTitle,
      description: description ? sanitizeTextField(description, 500) : null,
      price: numericPrice,
      stock: numericStock,
      image_url: normalizeProductImage(image_url),
      is_available: is_available !== undefined ? Boolean(is_available) : true,
      category: category ? String(category).trim() : undefined,
      sizes: Array.isArray(sizes) ? sizes : undefined,
      colors: Array.isArray(colors) ? colors : undefined,
      lookbook_image: lookbook_image || undefined,
      prep_time: prep_time !== undefined ? Number(prep_time) : undefined,
      modifier_groups: Array.isArray(modifier_groups) ? modifier_groups : undefined,
      attributes: sanitizeProductAttributes(attributes, shop.category),
    };

    products.unshift(newProduct);
    await persistProduct(newProduct);
    res.json({ success: true, product: newProduct });
  });

  app.put('/api/shops/:id/products/:productId', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((p) => p.id === productId);
    if (!product || product.shop_id !== shopId) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, prep_time, modifier_groups, attributes } = req.body;
    const shop = shops.find((candidate) => candidate.id === shopId);
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
    if (image_url !== undefined) product.image_url = normalizeProductImage(image_url);
    if (is_available !== undefined) product.is_available = Boolean(is_available);
    if (category !== undefined) product.category = category ? String(category).trim() : undefined;
    if (sizes !== undefined) product.sizes = Array.isArray(sizes) ? sizes : undefined;
    if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : undefined;
    if (lookbook_image !== undefined) product.lookbook_image = lookbook_image;
    if (prep_time !== undefined) product.prep_time = Number(prep_time);
    if (modifier_groups !== undefined) product.modifier_groups = Array.isArray(modifier_groups) ? modifier_groups : undefined;
    if (attributes !== undefined && shop) product.attributes = sanitizeProductAttributes(attributes, shop.category);

    await persistProduct(product);

    res.json({ success: true, product });
  });

  // Fast stock stepper (+1 or -1)
  app.patch('/api/shops/:id/products/:productId/stock', async (req: Request, res: Response) => {
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
    await persistProduct(product);

    res.json({ success: true, stock: product.stock, product });
  });

  // Toggle visibility (Masquer / Afficher)
  app.patch('/api/shops/:id/products/:productId/toggle-visibility', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((p) => p.id === productId);
    if (!product || product.shop_id !== shopId) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    product.is_available = !product.is_available;
    await persistProduct(product);
    res.json({ success: true, is_available: product.is_available, product });
  });

  app.delete('/api/shops/:id/products/:productId', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const index = products.findIndex((p) => p.id === productId && p.shop_id === shopId);
    if (index === -1) {
      return res.status(404).json({ error: 'Produit introuvable.' });
    }

    products.splice(index, 1);
    await dbRun('DELETE FROM products WHERE id = ? AND shop_id = ?', [productId, Number(req.params.id)]);
    res.json({ success: true });
  });

  // 4. ORDERS & AUTOMATIC STOCK DECREMENTATION
  app.post('/api/orders', rateLimitPublicRequest(30), async (req: Request, res: Response) => {
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
      return res.status(403).json({ error: 'Cette boutique est inactive.' });
    }

    const allowedPaymentPreferences = new Set(['wave', 'mobile_money', 'cash', 'to_confirm', undefined, null, '']);
    if (!allowedPaymentPreferences.has(payment_method_preference)) {
      return res.status(400).json({ error: 'Mode de paiement souhaité invalide.' });
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

    const customerSession = await getCustomerSessionState(req);
    const customerUserId = customerSession.authenticated ? customerSession.user?.id : undefined;
    const whatsappTrackingToken = randomUUID();
    const stockUpdates: { product: ProductRecord; stock: number; isAvailable: boolean }[] = [];
    try {
      const createdOrder = await dbTransaction(async (transaction) => {
      const orderIdRecord = await transaction.get<{ id: number }>(`
        INSERT INTO id_allocators (name, last_id)
        SELECT ?, COALESCE(MAX(id), 0) + 1 FROM orders WHERE TRUE
        ON CONFLICT(name) DO UPDATE SET last_id = id_allocators.last_id + 1
        RETURNING last_id AS id
      `, ['orders']);
      if (!orderIdRecord) throw new Error('Impossible d’allouer un identifiant de commande.');
      const orderId = Number(orderIdRecord.id);
      const orderItemRecords: any[] = [];
      let calculatedTotal = 0;
      const reservedProductIds = new Set<number>();

      for (const item of items) {
        const productId = Number(item.product_id);
        const prod = products.find((p) => p.id === productId);
        if (!prod || prod.shop_id !== shop.id) {
          throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
        }

        const qty = Number(item.quantity);
        const stockQuantity = reservedProductIds.has(prod.id) ? 0 : (requestedQuantities.get(prod.id) || 0);
        const stockRow = await transaction.get<{ stock: number; is_available: number }>(`SELECT stock, is_available FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`, [prod.id, shop.id]);
        if (!stockRow) {
          throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
        }
        if (stockQuantity > 0 && (!stockRow.is_available || stockRow.stock <= 0)) {
          throw Object.assign(new Error(`L'article "${prod.title}" est en rupture de stock.`), { statusCode: 409, product_id: prod.id, stock: 0 });
        }
        if (stockQuantity > 0 && stockRow.stock < stockQuantity) {
          throw Object.assign(new Error(`Stock insuffisant pour "${prod.title}". Seulement ${stockRow.stock} unité(s) disponible(s).`), { statusCode: 409, product_id: prod.id, stock: stockRow.stock });
        }
        if (stockQuantity > 0) {
          const stock = Number(stockRow.stock) - stockQuantity;
          const update = await transaction.run(
            'UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?',
            [stock, stock > 0 ? 1 : 0, prod.id, shop.id, stockQuantity],
          );
          if (update.changes !== 1) {
            throw Object.assign(new Error(`Le stock de "${prod.title}" vient de changer. Réessayez la commande.`), { statusCode: 409, product_id: prod.id, stock: Number(stockRow.stock) });
          }
          stockUpdates.push({ product: prod, stock, isAvailable: stock > 0 });
          reservedProductIds.add(prod.id);
        }

        const selectedModifiers = Array.isArray(item.selected_modifiers)
          ? item.selected_modifiers
          : typeof item.selected_modifiers === 'string'
            ? [item.selected_modifiers]
            : [];
        const validSelectedModifiers = getValidSelectedModifiers(prod, selectedModifiers);
        for (const group of prod.modifier_groups || []) {
          const selectedInGroup = validSelectedModifiers.filter((label) => group.options.some((option) => (typeof option === 'string' ? option : option.label) === label));
          if (group.required && selectedInGroup.length === 0) {
            throw Object.assign(new Error(`Veuillez choisir une option pour « ${group.name} » dans "${prod.title}".`), { statusCode: 400, product_id: prod.id });
          }
        }
        const unitPrice = getProductUnitPriceWithModifiers(prod, validSelectedModifiers);
        calculatedTotal += unitPrice * Number(item.quantity);

        orderItemRecords.push({
          id: orderItemRecords.length + 1,
          order_id: orderId,
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
        id: orderId,
        shop_id: shop.id,
        customer_user_id: customerUserId,
        customer_name: validatedCustomer.customer_name || customer_name,
        customer_phone: validatedCustomer.customer_phone || customer_phone,
        delivery_location: validatedCustomer.delivery_location || delivery_location,
        delivery_note: validatedCustomer.delivery_note || delivery_note,
        delivery_slot,
        payment_method_preference: payment_method_preference || 'to_confirm',
        total_amount: calculatedTotal,
        created_at: new Date().toISOString(),
        status: 'confirmed',
        whatsapp_tracking_available: true,
        whatsapp_clicked_at: null,
        items: orderItemRecords,
      };

      await transaction.run(`
        INSERT INTO orders (
          id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
          delivery_slot, payment_method_preference, total_amount, created_at, status, items, customer_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        newOrder.id,
        newOrder.shop_id,
        newOrder.customer_name,
        newOrder.customer_phone,
        newOrder.delivery_location,
        newOrder.delivery_note ?? null,
        newOrder.delivery_slot ?? null,
        newOrder.payment_method_preference,
        newOrder.total_amount,
        newOrder.created_at,
        newOrder.status,
        JSON.stringify(newOrder.items ?? []),
        newOrder.customer_user_id ?? null,
      ]);

      await transaction.run(
        'INSERT INTO order_whatsapp_tracking (order_id, token_hash, clicked_at) VALUES (?, ?, NULL)',
        [orderId, hashAccessToken(whatsappTrackingToken)],
      );

      return newOrder;
      });
      for (const update of stockUpdates) {
        update.product.stock = update.stock;
        update.product.is_available = update.isAvailable;
      }
      orders.unshift(createdOrder);
      res.json({
        success: true,
        order: createdOrder,
        whatsapp_tracking_token: whatsappTrackingToken,
        message: 'Commande acceptée automatiquement et stock réservé. Contactez le vendeur sur WhatsApp pour échanger sur la livraison et le paiement.',
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

  app.post('/api/orders/:id/whatsapp-click', rateLimitPublicRequest(60), async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || token.length < 20 || token.length > 200) {
      return res.status(404).json({ error: 'Suivi de commande introuvable.' });
    }

    const tracking = await dbGet<{ token_hash: string; clicked_at: string | null }>(
      'SELECT token_hash, clicked_at FROM order_whatsapp_tracking WHERE order_id = ?',
      [orderId],
    );
    if (!tracking || !timingSafeEqual(hashAccessToken(token), String(tracking.token_hash))) {
      return res.status(404).json({ error: 'Suivi de commande introuvable.' });
    }

    const clickedAt = tracking.clicked_at || new Date().toISOString();
    if (!tracking.clicked_at) {
      await dbRun('UPDATE order_whatsapp_tracking SET clicked_at = COALESCE(clicked_at, ?) WHERE order_id = ?', [clickedAt, orderId]);
    }
    const order = orders.find((candidate) => candidate.id === orderId);
    if (order) order.whatsapp_clicked_at = clickedAt;
    res.json({ success: true, clicked_at: clickedAt });
  });

  app.get('/api/auth/customer-orders', async (req: Request, res: Response) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }

    res.json({ orders: orders.filter((order) => order.customer_user_id === customerSession.user?.id) });
  });

  // Merchant orders history
  app.get('/api/shops/:id/orders', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shopOrders = orders.filter((o) => o.shop_id === shopId);
    res.json(shopOrders);
  });

  // Update order status & automatic restock on cancellation
  app.patch('/api/shops/:id/orders/:orderId/status', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide. Valeurs possibles : pending, confirmed, preparing, ready, delivered, cancelled, expired.' });
    }

    const order = orders.find((o) => o.id === orderId && o.shop_id === shopId);
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    const previousStatus = order.status || 'pending';
    if (previousStatus === status) {
      return res.json({ success: true, order });
    }

    const allowedTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'delivered', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: ['confirmed'],
      expired: [],
    };
    if (!allowedTransitions[previousStatus]?.includes(status)) {
      return res.status(409).json({ error: `Transition impossible : ${previousStatus} → ${status}.` });
    }


    const stockUpdates: { product: ProductRecord; stock: number; isAvailable: boolean }[] = [];
    try {
      await dbTransaction(async (transaction) => {
        const quantities = new Map<number, number>();
        for (const item of order.items || []) {
          quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + Number(item.quantity || 1));
        }

        const stockReservedStatuses = new Set(['confirmed', 'preparing', 'ready', 'delivered']);
        const wasStockReserved = stockReservedStatuses.has(previousStatus);
        const willReserveStock = stockReservedStatuses.has(status);

        if (status === 'cancelled' && wasStockReserved) {
          for (const [productId, quantity] of quantities) {
            const prod = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
            if (!prod) continue;
            const stockRow = await transaction.get<{ stock: number }>(
              `SELECT stock FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [prod.id, shopId],
            );
            if (!stockRow) continue;
            const stock = Number(stockRow.stock) + quantity;
            const isAvailable = stock > 0;
            await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ?', [stock, isAvailable ? 1 : 0, prod.id, shopId]);
            stockUpdates.push({ product: prod, stock, isAvailable });
          }
        }

        if (willReserveStock && !wasStockReserved) {
          for (const [productId, quantity] of quantities) {
            const prod = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
            if (!prod) {
              throw Object.assign(new Error('Un article de cette commande n’existe plus dans le catalogue.'), { statusCode: 409 });
            }
            const stockRow = await transaction.get<{ stock: number }>(
              `SELECT stock FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [productId, shopId],
            );
            const currentStock = Number(stockRow?.stock || 0);
            if (!stockRow || currentStock < quantity) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${prod.title} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            const stock = currentStock - quantity;
            const isAvailable = stock > 0;
            const update = await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?', [stock, isAvailable ? 1 : 0, productId, shopId, quantity]);
            if (update.changes !== 1) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${prod.title} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            stockUpdates.push({ product: prod, stock, isAvailable });
          }
        }

        order.status = status as OrderRecord['status'];
        await transaction.run('UPDATE orders SET status = ? WHERE id = ? AND shop_id = ?', [status, order.id, shopId]);
      });
      for (const update of stockUpdates) {
        update.product.stock = update.stock;
        update.product.is_available = update.isAvailable;
      }
      order.status = status as OrderRecord['status'];
    } catch (error: unknown) {
      const err = error as { message?: string; statusCode?: number; product_id?: number; stock?: number };
      const payload: Record<string, unknown> = { error: err.message || 'Transition de commande impossible.' };
      if (err.product_id !== undefined) payload.product_id = err.product_id;
      if (err.stock !== undefined) payload.stock = err.stock;
      return res.status(Number(err.statusCode) || 409).json(payload);
    }

    res.json({
      success: true,
      order,
      message: status === 'confirmed' && previousStatus === 'pending'
        ? 'Commande confirmée et stock réservé.'
        : status === 'cancelled'
          ? 'Demande annulée.'
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

    const shopOrders = orders.filter((o) => o.shop_id === shopId && isSameBusinessDay(o.created_at));
    const metrics = summarizeOrderMetrics(orders, shopId);
    const totalSales = metrics.ca_ordered;

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
      `🌙 *FLASH BILAN — ${todayStr.toUpperCase()}*`,
      `🏪 *Boutique :* ${shop.name}`,
      `📅 *Période :* ${todayStr}`,
      `----------------------------------------`,
      `🧾 *Commandes reçues :* ${metrics.received}`,
      `✅ *Confirmées :* ${metrics.confirmed}`,
      `🚚 *Terminées :* ${metrics.delivered}`,
      `❌ *Annulées :* ${metrics.cancelled}`,
      `💰 *Valeur des commandes enregistrées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_ordered)} FCFA`,
      `✅ *Valeur des commandes confirmées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_confirmed)} FCFA`,
      `🚚 *Valeur des commandes terminées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_delivered)} FCFA`,
      `🧺 *Panier moyen livré :* ${new Intl.NumberFormat('fr-FR').format(metrics.panier_moyen_livre)} FCFA`,
      `----------------------------------------`,
      `ℹ️ *MaTable.ci ne collecte aucun paiement.* Les paiements sont convenus directement entre le client et le vendeur.`,
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

  app.get('/api/admin/analytics', async (req: Request, res: Response) => {
    await refreshRuntimeDataFromDatabase();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const daily = await dbAll<{ date: string; page_views: number; unique_visitors: number }>(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
        COUNT(DISTINCT session_id) AS unique_visitors
      FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      GROUP BY date ORDER BY date ASC
    `, [since]);
    const orderDaily = await dbAll<{ date: string; orders: number; sales: number }>(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
      FROM orders WHERE created_at >= ? GROUP BY date ORDER BY date ASC
    `, [since]);

    const validOrderStatuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired']);
    const byShop = (await Promise.all(shops.map(async (shop) => {
      const traffic = await dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND shop_id = ? AND created_at >= ?
      `, [shop.id, since]);
      const pageViews = Number(traffic?.page_views || 0);
      const uniqueVisitors = Number(traffic?.unique_visitors || 0);
      const shopOrders = orders.filter((order) => order.shop_id === shop.id && order.created_at >= since);
      const sales = shopOrders
        .filter((order) => validOrderStatuses.has(order.status ?? 'pending') && order.status !== 'cancelled')
        .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
      return {
        shop_id: shop.id, shop_name: shop.name, slug: shop.slug,
        page_views: pageViews, unique_visitors: uniqueVisitors,
        orders: shopOrders.length, sales,
        conversion_rate: uniqueVisitors ? Number(((shopOrders.length / uniqueVisitors) * 100).toFixed(1)) : 0,
      };
    }))).sort((a, b) => b.page_views - a.page_views);
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
  app.get('/api/admin/shops', async (req: Request, res: Response) => {
    await refreshRuntimeDataFromDatabase();
    const adminShops = shops.map((s) => {
      const shopOrders = orders.filter((order) => order.shop_id === s.id);
      const actionableOrders = shopOrders.filter((order) => order.status !== 'cancelled' && order.status !== 'expired');
      return {
        ...toSafeShop(s),
        products_count: products.filter((p) => p.shop_id === s.id).length,
        orders_count: actionableOrders.length,
        total_sales: actionableOrders.reduce((sum, order) => sum + order.total_amount, 0),
        average_order_value: (() => {
          return actionableOrders.length
            ? Math.round(actionableOrders.reduce((sum, order) => sum + order.total_amount, 0) / actionableOrders.length)
            : 0;
        })(),
        last_order_at: actionableOrders
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null,
      };
    });

    res.json(adminShops);
  });

  app.get('/api/admin/health', async (req: Request, res: Response) => {
    await refreshRuntimeDataFromDatabase();
    const latestAnalytics = await dbGet<{ created_at?: string }>('SELECT created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1');
    const counts = {
      shops: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM shops'))?.count || 0),
      products: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM products'))?.count || 0),
      orders: Number((await dbGet<{ count: number }>('SELECT COUNT(*) AS count FROM orders'))?.count || 0),
    };

    res.json({
      status: 'ok',
      checked_at: new Date().toISOString(),
      database: databaseMode,
      database_path: databaseMode === 'sqlite' ? process.env.MATABLE_DB_PATH || 'data/matable.db' : null,
      counts,
      latest_analytics_event_at: latestAnalytics?.created_at || null,
      integrations: { whatsapp_cloud: 'locked', whatsapp_click_to_chat: 'available' },
    });
  });

  app.get('/api/admin/orders', async (req: Request, res: Response) => {
    await refreshRuntimeDataFromDatabase();
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedStatus = String(req.query.status || 'all');
    const allowedStatuses = new Set(['pending', 'confirmed', 'delivered', 'cancelled']);
    const filteredOrders = orders
      .filter((order) => requestedStatus === 'all' || (allowedStatuses.has(requestedStatus) && order.status === requestedStatus))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((order) => ({
        id: order.id,
        shop_id: order.shop_id,
        shop_name: shops.find((shop) => shop.id === order.shop_id)?.name || 'Boutique inconnue',
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_location: order.delivery_location,
        total_amount: order.total_amount,
        status: order.status,
        created_at: order.created_at,
        items_count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      }));

    res.json({ orders: filteredOrders, total: filteredOrders.length, status: requestedStatus });
  });

  // Manual ON/OFF toggle
  app.patch('/api/admin/shops/:id/toggle-active', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }

    if (!shop.is_active && shop.merchant_verification_status && !['approved', 'not_required'].includes(shop.merchant_verification_status)) {
      return res.status(409).json({ error: 'La vérification d’identité doit être approuvée avant l’activation.' });
    }
    shop.is_active = !shop.is_active;
    if (shop.is_active) shop.payment_status = 'approved';
    await persistShop(shop);
    res.json({ success: true, is_active: shop.is_active, shop: toSafeShop(shop) });
  });

  app.post('/api/admin/shops/:id/access-link', async (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const ownerAccessToken = randomUUID();
    shop.owner_access_token_hash = hashAccessToken(ownerAccessToken);
    await persistShop(shop);
    const publicUrl = `${String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/${shop.slug}`;
    const accessUrl = `${String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/app?access=${encodeURIComponent(ownerAccessToken)}`;
    res.json({ success: true, shop: toSafeShop(shop), public_url: publicUrl, access_url: accessUrl });
  });

  app.post('/api/admin/shops/:id/notification', (req: Request, res: Response) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const templates: Record<string, string> = {
      welcome: `Bonjour ${shop.name}, votre espace MaTable.ci est prêt. Pensez à compléter votre catalogue et à partager votre vitrine avec vos clients.`,
      catalog: `Bonjour ${shop.name}, pensez à vérifier vos articles, vos prix et vos disponibilités afin que votre vitrine MaTable.ci reste à jour.`,
      orders: `Bonjour ${shop.name}, pensez à consulter vos nouvelles commandes et à confirmer rapidement les demandes reçues via MaTable.ci.`,
      support: `Bonjour ${shop.name}, nous vous contactons au sujet de votre boutique MaTable.ci. Répondez à ce message si vous avez besoin d’aide.`,
    };
    const template = String(req.body?.template || '').trim();
    if (!templates[template]) return res.status(400).json({ error: 'Modèle de notification invalide.' });

    const message = templates[template];
    const phone = shop.whatsapp_number.replace(/\D/g, '');
    res.json({
      success: true,
      delivery_mode: 'whatsapp_click_to_chat',
      template,
      message,
      whatsapp_url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
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

  const shouldServePublicHtml = (req: Request) => {
    const accept = String(req.headers.accept || '');
    const ua = String(req.headers['user-agent'] || '').toLowerCase();
    const isGet = req.method === 'GET';
    const isLikelyHtml = accept.includes('text/html') || accept.includes('*/*') || accept === '' || (!accept.includes('application/json') && !accept.includes('application/javascript'));
    const isSocialCrawler = ua.includes('whatsapp') || ua.includes('facebookexternalhit') || ua.includes('twitterbot') || ua.includes('linkedin');
    return isGet && isLikelyHtml && !isSocialCrawler;
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
      server: {
        middlewareMode: true,
        hmr: process.env.NODE_ENV === 'test' ? false : { port: Math.min(PORT + 1, 65535) },
      },
      appType: 'spa',
    });

    app.use(async (req: Request, res: Response, next: express.NextFunction) => {
      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.startsWith('/@') && !url.includes('.')
        ? url.substring(1).split('/')[0]
        : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug) ? shops.find((s) => s.slug === matchSlug) : null;
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
      const url = req.originalUrl.split('?')[0];
      const matchSlug = url.length > 1 && !url.startsWith('/api') && !url.includes('.') ? url.substring(1).split('/')[0] : null;
      const targetShop = matchSlug && !['app', 'admin'].includes(matchSlug) ? shops.find((s) => s.slug === matchSlug) : null;
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
