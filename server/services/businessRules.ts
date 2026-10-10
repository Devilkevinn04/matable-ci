import type { OrderRecord, ProductRecord, ShopRecord, SubscriptionPlanConfig, SubscriptionState, SubscriptionStatus, SubscriptionTier } from '../types.ts';
import {
  getSubscriptionAccessCutoff,
  getSubscriptionGraceCutoff,
  isSubscriptionFeatureIncluded,
  SUBSCRIPTION_PLANS,
  type SubscriptionFeature,
} from '../../src/utils/subscriptionFeatures.ts';
export { escapeHtml } from '../../src/utils/escapeHtml.ts';

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
  if (subscription.status === 'past_due' && isShopInSubscriptionGracePeriod(shop, currentDate)) return null;
  if (subscription.status !== 'trialing' && subscription.status !== 'active') return 'subscription';
  return null;
}

export function isShopInSubscriptionGracePeriod(
  shop: Pick<ShopRecord, 'trial_end' | 'subscription_expires_at'>,
  currentDate = new Date(),
): boolean {
  const expiration = shop.subscription_expires_at || shop.trial_end;
  if (!expiration) return false;
  const accessCutoff = getSubscriptionAccessCutoff(expiration);
  const graceCutoff = getSubscriptionGraceCutoff(expiration);
  return accessCutoff !== null
    && graceCutoff !== null
    && currentDate.getTime() >= accessCutoff
    && currentDate.getTime() < graceCutoff;
}

export function canPublishShop(shop: ShopRecord, currentDate = new Date()): boolean {
  return getShopPublicationBlockReason(shop, currentDate) === null;
}

export function isShopPubliclyVisible(shop: ShopRecord, currentDate = new Date()): boolean {
  const publicationStatus = shop.publication_status ?? (shop.is_active ? 'active' : 'suspended');
  if (!shop.is_active || publicationStatus === 'suspended') return false;
  return publicationStatus === 'active' && canPublishShop(shop, currentDate);
}

export function canReceiveShopOrders(shop: ShopRecord, currentDate = new Date()): boolean {
  return isShopPubliclyVisible(shop, currentDate)
    && getShopPublicationBlockReason(shop, currentDate) === null
    && computeIsShopOpen(shop);
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

function subscriptionExpiryCutoff(value: string): number {
  return getSubscriptionAccessCutoff(value) ?? NaN;
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
  const trialCutoff = trialEnd ? subscriptionExpiryCutoff(trialEnd) : NaN;
  const rawTrialDaysRemaining = Number.isFinite(trialEndTime)
    ? Math.ceil((trialEndTime - currentDate.getTime()) / 86400000)
    : 0;
  const trialDaysRemaining = Number.isFinite(trialCutoff) && trialCutoff > currentDate.getTime()
    ? Math.max(1, rawTrialDaysRemaining)
    : 0;
  const rawConfiguredStatus = shop.subscription_status || (trialDaysRemaining > 0 ? 'trialing' : 'active');
  const configuredStatus: SubscriptionStatus = ['not_started', 'trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended'].includes(rawConfiguredStatus)
    ? (rawConfiguredStatus as SubscriptionStatus)
    : (trialDaysRemaining > 0 ? 'trialing' : 'active');
  const isTrial = configuredStatus === 'trialing' || (!expiresAt && Boolean(trialEnd));
  const expiration = isTrial ? trialEnd : expiresAt || trialEnd;
  const expirationCutoff = expiration ? subscriptionExpiryCutoff(expiration) : NaN;
  const graceCutoff = expiration ? getSubscriptionGraceCutoff(expiration) : null;
  let status = configuredStatus;
  if (['trialing', 'active', 'past_due', 'expired'].includes(configuredStatus)
    && Number.isFinite(expirationCutoff)
    && currentDate.getTime() >= expirationCutoff) {
    status = graceCutoff !== null && currentDate.getTime() < graceCutoff ? 'past_due' : 'suspended';
  }
  return {
    plan: status === 'trialing' ? 'standard' : normalizeSubscriptionTier(shop.selected_subscription_tier),
    status,
    trialStart,
    trialEnd,
    expiresAt,
    trialDaysRemaining,
    isActive: status === 'trialing' || status === 'active',
  };
}

export function getSubscriptionReminderAt(
  shop: Pick<ShopRecord, 'subscription_status' | 'trial_start' | 'trial_end' | 'subscription_expires_at' | 'selected_subscription_tier'>,
  currentDate = new Date(),
): Date | null {
  const subscription = getSubscriptionState(shop, currentDate);
  const endDate = subscription.status === 'trialing'
    ? subscription.trialEnd
    : subscription.status === 'active'
      ? subscription.expiresAt
      : null;
  const endTime = endDate ? Date.parse(endDate) : NaN;
  return Number.isFinite(endTime) ? new Date(endTime - 2 * 86400000) : null;
}

export function isSubscriptionReminderDue(
  shop: Pick<ShopRecord, 'subscription_status' | 'trial_start' | 'trial_end' | 'subscription_expires_at' | 'selected_subscription_tier'>,
  currentDate = new Date(),
): boolean {
  const reminderAt = getSubscriptionReminderAt(shop, currentDate);
  return getSubscriptionState(shop, currentDate).isActive
    && reminderAt !== null
    && currentDate.getTime() >= reminderAt.getTime();
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
  const caOrdered = filteredOrders
    .filter((order) => !['cancelled', 'expired'].includes(order.status || 'pending'))
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
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
