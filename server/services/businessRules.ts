import type { OrderRecord, ProductRecord, ShopRecord, SubscriptionPlanConfig, SubscriptionState, SubscriptionStatus, SubscriptionTier } from '../types.ts';
import { isSubscriptionFeatureIncluded, SUBSCRIPTION_PLANS, type SubscriptionFeature } from '../../src/utils/subscriptionFeatures.ts';

export function computeIsShopOpen(shop: ShopRecord): boolean {
  if (shop.opening_hours && shop.opening_hours.enabled && !shop.opening_hours.manual_override) {
    const now = new Date();
    const abidjanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Abidjan' }));
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Abidjan', weekday: 'short' }).format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentMinutes = abidjanNow.getHours() * 60 + abidjanNow.getMinutes();
    const currentDay = dayMap[weekday] ?? abidjanNow.getDay();
    if (shop.opening_hours.days?.length && !shop.opening_hours.days.includes(currentDay)) return false;

    const [openHour, openMinute] = (shop.opening_hours.open_time || '08:00').split(':').map(Number);
    const [closeHour, closeMinute] = (shop.opening_hours.close_time || '22:00').split(':').map(Number);
    const openAt = (openHour || 0) * 60 + (openMinute || 0);
    const closeAt = (closeHour || 0) * 60 + (closeMinute || 0);
    return closeAt >= openAt
      ? currentMinutes >= openAt && currentMinutes <= closeAt
      : currentMinutes >= openAt || currentMinutes <= closeAt;
  }
  return Boolean(shop.is_open);
}

export function getShopPublicationBlockReason(
  shop: ShopRecord,
  currentDate = new Date(),
): 'inactive' | 'verification' | 'subscription' | null {
  if (!shop.is_active) return 'inactive';
  const verificationStatus = shop.merchant_verification_status || 'not_required';
  if (verificationStatus !== 'verified' && verificationStatus !== 'not_required') return 'verification';
  const subscription = getSubscriptionState(shop, currentDate);
  if (subscription.status !== 'trialing' && subscription.status !== 'active') return 'subscription';
  return null;
}

export function canPublishShop(shop: ShopRecord, currentDate = new Date()): boolean {
  return getShopPublicationBlockReason(shop, currentDate) === null;
}

export function isShopPubliclyVisible(shop: ShopRecord, currentDate = new Date()): boolean {
  const publicationStatus = shop.publication_status ?? (shop.is_active ? 'active' : 'suspended');
  return publicationStatus === 'active' && canPublishShop(shop, currentDate);
}

export function canReceiveShopOrders(shop: ShopRecord, currentDate = new Date()): boolean {
  return isShopPubliclyVisible(shop, currentDate) && computeIsShopOpen(shop);
}

export const LOCAL_FACE_MATCH_MAX_DISTANCE = 0.62;
export const LOCAL_OCR_MIN_CONFIDENCE = 45;

function normalizeIdentityText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function evaluateLocalIdentityVerification(input: {
  faceDistance: number;
  ocrConfidence: number;
  ocrText: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
}) {
  if (!Number.isFinite(input.faceDistance) || input.faceDistance < 0 || input.faceDistance > LOCAL_FACE_MATCH_MAX_DISTANCE) {
    return { automaticApproval: false, reason: 'face_match_uncertain' as const };
  }
  if (!Number.isFinite(input.ocrConfidence) || input.ocrConfidence < LOCAL_OCR_MIN_CONFIDENCE) {
    return { automaticApproval: false, reason: 'ocr_confidence_low' as const };
  }

  const normalizedOcr = normalizeIdentityText(input.ocrText);
  const normalizedNumber = normalizeIdentityText(input.documentNumber).replace(/ /g, '');
  const hasDocumentMarker = /CARTE NATIONALE|PASSEPORT|IDENTITE|IDENTITY CARD|REPUBLIC OF COTE D IVOIRE/.test(normalizedOcr);
  const containsValue = (value: string) => {
    const normalizedValue = normalizeIdentityText(value);
    return normalizedValue.length >= 2 && normalizedOcr.includes(normalizedValue);
  };

  if (normalizedOcr.length < 30 || !hasDocumentMarker || normalizedNumber.length < 6 || !normalizedOcr.replace(/ /g, '').includes(normalizedNumber)) {
    return { automaticApproval: false, reason: 'document_text_uncertain' as const };
  }
  if (!containsValue(input.firstName) || !containsValue(input.lastName)) {
    return { automaticApproval: false, reason: 'identity_fields_uncertain' as const };
  }

  return { automaticApproval: true, reason: 'local_checks_passed' as const };
}

export function getProductUnitPriceWithModifiers(product: ProductRecord, selectedModifiers: string[] = []): number {
  const selected = new Set(selectedModifiers.map((value) => value.trim()).filter(Boolean));
  if (!product.modifier_groups?.length) return product.price;
  let modifierTotal = 0;
  for (const group of product.modifier_groups) {
    for (const option of group.options) {
      const label = typeof option === 'string' ? option : option.label;
      if (selected.has(label)) modifierTotal += typeof option === 'string' ? 0 : Number(option.price_delta || 0);
    }
  }
  return product.price + modifierTotal;
}

export function getValidSelectedModifiers(product: ProductRecord, selectedModifiers: string[]) {
  const selected = new Set(selectedModifiers.map((value) => value.trim()).filter(Boolean));
  const valid: string[] = [];
  for (const group of product.modifier_groups || []) {
    const labels = group.options.map((option) => option.label).filter((label) => selected.has(label));
    valid.push(...labels.slice(0, Math.max(1, Number(group.max_selections || 1))));
  }
  return valid;
}

export function normalizeWhatsAppPhone(phone: unknown): string | null {
  const cleaned = String(phone ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (/^(01|05|07)\d{8}$/.test(cleaned)) return `+225${cleaned}`;
  if (/^225(01|05|07)\d{8}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

export function isWeakShopPin(pin: unknown): boolean {
  const normalized = String(pin ?? '').trim();
  if (!/^\d{6}$/.test(normalized)) return true;
  return new Set(['000000', '000001', '111222', '123123', '123456', '222222', '999999']).has(normalized);
}

export function getSubscriptionPlanConfig(tier: SubscriptionTier | string): SubscriptionPlanConfig {
  const plan = SUBSCRIPTION_PLANS[normalizeSubscriptionTier(tier)];
  return { tier: plan.tier, amount: plan.price, label: plan.label, description: plan.description };
}

export function normalizeSubscriptionTier(tier?: SubscriptionTier | string): SubscriptionTier {
  return tier === 'premium' || tier === 'pro' ? tier : 'standard';
}

export function canUseSubscriptionFeature(
  shop: Pick<ShopRecord, 'subscription_status' | 'trial_start' | 'trial_end' | 'subscription_expires_at' | 'selected_subscription_tier'>,
  feature: SubscriptionFeature,
  currentDate = new Date(),
): boolean {
  const subscription = getSubscriptionState(shop, currentDate);
  return subscription.isActive
    && isSubscriptionFeatureIncluded(subscription.plan, feature);
}

export function getSubscriptionState(
  shop: Pick<ShopRecord, 'subscription_status' | 'trial_start' | 'trial_end' | 'subscription_expires_at' | 'selected_subscription_tier'>,
  currentDate = new Date(),
): SubscriptionState {
  const trialStart = shop.trial_start || null;
  const trialEnd = shop.trial_end || null;
  const expiresAt = shop.subscription_expires_at || null;
  const trialEndTime = trialEnd ? Date.parse(trialEnd) : NaN;
  const expiresAtTime = expiresAt ? Date.parse(expiresAt) : NaN;
  const trialDaysRemaining = Number.isFinite(trialEndTime)
    ? Math.max(0, Math.ceil((trialEndTime - currentDate.getTime()) / 86400000))
    : 0;
  const configuredStatus = shop.subscription_status || (trialDaysRemaining > 0 ? 'trialing' : 'active');
  const status: SubscriptionStatus = (configuredStatus === 'trialing' && trialEnd && trialDaysRemaining === 0)
    || (configuredStatus === 'active' && Number.isFinite(expiresAtTime) && expiresAtTime <= currentDate.getTime())
    ? 'expired'
    : configuredStatus;
  return {
    plan: normalizeSubscriptionTier(shop.selected_subscription_tier),
    status,
    trialStart,
    trialEnd,
    expiresAt,
    trialDaysRemaining,
    isActive: status === 'trialing' || status === 'active',
  };
}

function toBusinessDateKey(value: string | Date, timeZone = 'Africa/Abidjan'): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('fr-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/\//g, '-');
}

export function isSameBusinessDay(value: string | Date, referenceDate: Date = new Date(), timeZone = 'Africa/Abidjan'): boolean {
  return toBusinessDateKey(value, timeZone) === toBusinessDateKey(referenceDate, timeZone);
}

export function summarizeOrderMetrics<T extends Pick<OrderRecord, 'shop_id' | 'total_amount' | 'created_at' | 'status'>>(
  orders: T[],
  shopId?: number,
  referenceDate: Date = new Date(),
) {
  const filteredOrders = (typeof shopId === 'number' ? orders.filter((order) => order.shop_id === shopId) : orders)
    .filter((order) => isSameBusinessDay(order.created_at, referenceDate));
  const received = filteredOrders.length;
  const pending = filteredOrders.filter((order) => order.status === 'pending').length;
  const confirmed = filteredOrders.filter((order) => order.status === 'confirmed').length;
  const delivered = filteredOrders.filter((order) => order.status === 'delivered').length;
  const cancelled = filteredOrders.filter((order) => order.status === 'cancelled').length;
  const caOrdered = filteredOrders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const caConfirmed = filteredOrders.filter((order) => order.status === 'confirmed').reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const caDelivered = filteredOrders.filter((order) => order.status === 'delivered').reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
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
    panier_moyen_livre: delivered > 0 ? Math.round(caDelivered / delivered) : 0,
  };
}

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
