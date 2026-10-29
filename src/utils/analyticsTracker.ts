import { getAnalyticsCampaignFromSearch, getStoredAnalyticsCampaign, storeAnalyticsCampaign } from './analyticsAttribution';
import { hasAnalyticsConsent } from './cookieConsent';

export type AnalyticsAudience = 'public' | 'customer' | 'merchant' | 'courier' | 'admin';
export type AnalyticsEventType =
  | 'page_view'
  | 'login'
  | 'signup'
  | 'logout'
  | 'product_view'
  | 'product_click'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'checkout_start'
  | 'order_created'
  | 'whatsapp_click'
  | 'search'
  | 'filter_apply';

export interface AnalyticsEventInput {
  eventType: AnalyticsEventType;
  path?: string;
  shopId?: number | null;
  audience?: AnalyticsAudience;
  entityType?: 'page' | 'shop' | 'product' | 'search' | 'order';
  entityId?: number | null;
  metadata?: Record<string, string | number | boolean>;
}

const SESSION_STORAGE_KEY = 'matable_analytics_session';
const TRACKED_PREFIX = 'matable_analytics_tracked_';

function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Analytics stays best-effort when storage is unavailable.
  }
}

export function getAnalyticsSessionId(): string {
  const existing = safeSessionGet(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const generated = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  safeSessionSet(SESSION_STORAGE_KEY, generated);
  return generated;
}

function getAnalyticsDevice(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

function getAnalyticsLocale(): string | null {
  const locale = typeof navigator !== 'undefined' ? navigator.language : '';
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(locale) ? locale.toLowerCase() : null;
}

function resolveCampaign(): string | null {
  const fromUrl = getAnalyticsCampaignFromSearch(window.location.search);
  if (fromUrl) return storeAnalyticsCampaign(fromUrl) || fromUrl;
  return getStoredAnalyticsCampaign();
}

function getReferrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    return '';
  }
}

function markOnce(key: string): boolean {
  if (safeSessionGet(`${TRACKED_PREFIX}${key}`)) return false;
  safeSessionSet(`${TRACKED_PREFIX}${key}`, '1');
  return true;
}

function sendEvent(event: Record<string, unknown>): void {
  const sessionId = getAnalyticsSessionId();
  const body = JSON.stringify({
    events: [{
      ...event,
      session_id: sessionId,
      device: getAnalyticsDevice(),
      locale: getAnalyticsLocale(),
      referrer_host: getReferrerHost(),
    }],
  });
  fetch('/api/analytics/events', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => undefined);
}

export function trackAnalyticsEvent(input: AnalyticsEventInput): void {
  if (typeof window === 'undefined' || !hasAnalyticsConsent()) return;
  const path = input.path || window.location.pathname || '/';
  const audience = input.audience || 'public';
  const dedupeKey = `${input.eventType}:${audience}:${path}`;
  if ((input.eventType === 'page_view' || input.eventType === 'login' || input.eventType === 'signup')
    && !markOnce(dedupeKey)) {
    return;
  }
  sendEvent({
    event_type: input.eventType,
    path,
    shop_id: input.shopId ?? null,
    audience,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    campaign: resolveCampaign(),
    metadata: input.metadata,
  });
}

export function trackPageView(path: string, audience: AnalyticsAudience, shopId: number | null = null): void {
  trackAnalyticsEvent({
    eventType: 'page_view',
    path,
    audience,
    shopId,
    entityType: shopId === null ? 'page' : 'shop',
    entityId: shopId,
  });
}

export function trackLogin(audience: AnalyticsAudience, method: string): void {
  trackAnalyticsEvent({ eventType: 'login', audience, metadata: { method } });
}

export function trackSignup(audience: AnalyticsAudience, method: string): void {
  trackAnalyticsEvent({ eventType: 'signup', audience, metadata: { method } });
}

export function trackLogout(audience: AnalyticsAudience): void {
  trackAnalyticsEvent({ eventType: 'logout', audience });
}

export function trackProductView(shopId: number, productId: number): void {
  trackAnalyticsEvent({
    eventType: 'product_view',
    path: `/product/${productId}`,
    audience: 'customer',
    shopId,
    entityType: 'product',
    entityId: productId,
  });
}

export function trackProductClick(shopId: number, productId: number): void {
  trackAnalyticsEvent({
    eventType: 'product_click',
    path: `/product/${productId}`,
    audience: 'customer',
    shopId,
    entityType: 'product',
    entityId: productId,
  });
}

export function trackCartEvent(
  eventType: 'add_to_cart' | 'remove_from_cart',
  shopId: number,
  productId: number,
  quantity: number,
  cartSize: number,
): void {
  trackAnalyticsEvent({
    eventType,
    path: `/product/${productId}`,
    audience: 'customer',
    shopId,
    entityType: 'product',
    entityId: productId,
    metadata: { quantity, cart_size: cartSize },
  });
}

export function trackCheckoutStart(shopId: number, cartSize: number, cartValue: number): void {
  trackAnalyticsEvent({
    eventType: 'checkout_start',
    audience: 'customer',
    shopId,
    entityType: 'shop',
    entityId: shopId,
    metadata: { cart_size: cartSize, cart_value: cartValue },
  });
}

export function trackOrderCreated(shopId: number, orderId: number, cartSize: number, cartValue: number, deliveryFee: number): void {
  trackAnalyticsEvent({
    eventType: 'order_created',
    audience: 'customer',
    shopId,
    entityType: 'order',
    entityId: orderId,
    metadata: { cart_size: cartSize, cart_value: cartValue, step: deliveryFee > 0 ? 'delivery' : 'pickup' },
  });
}

export function trackWhatsAppClick(shopId: number, target: 'order' | 'catalog' | 'shop'): void {
  trackAnalyticsEvent({
    eventType: 'whatsapp_click',
    audience: 'customer',
    shopId,
    entityType: 'shop',
    entityId: shopId,
    metadata: { target },
  });
}

export function trackSearch(queryLength: number, results: number, surface: 'directory' | 'storefront'): void {
  trackAnalyticsEvent({
    eventType: 'search',
    audience: 'public',
    entityType: 'search',
    metadata: { query_length: queryLength, results, surface },
  });
}
