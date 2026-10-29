import { normalizeAnalyticsCampaign } from '../../src/utils/analyticsAttribution.ts';

export { normalizeAnalyticsCampaign } from '../../src/utils/analyticsAttribution.ts';

export type AnalyticsSource = 'direct' | 'search' | 'social' | 'referral' | 'internal';
export type AnalyticsAudience = 'public' | 'customer' | 'merchant' | 'courier' | 'admin';
export type AnalyticsEntityType = 'page' | 'shop' | 'product' | 'search' | 'order';
export type AnalyticsDevice = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export const ANALYTICS_EVENT_TYPES = new Set([
  'page_view',
  'login',
  'signup',
  'logout',
  'product_view',
  'product_click',
  'add_to_cart',
  'remove_from_cart',
  'checkout_start',
  'order_created',
  'whatsapp_click',
  'search',
  'filter_apply',
]);

export const ANALYTICS_AUDIENCES = new Set<AnalyticsAudience>([
  'public',
  'customer',
  'merchant',
  'courier',
  'admin',
]);

export const ANALYTICS_ENTITY_TYPES = new Set<AnalyticsEntityType>([
  'page',
  'shop',
  'product',
  'search',
  'order',
]);

const ANALYTICS_DEVICES = new Set<AnalyticsDevice>(['mobile', 'tablet', 'desktop', 'unknown']);

const METADATA_KEYS = new Set([
  'position',
  'results',
  'cart_size',
  'item_count',
  'cart_value',
  'quantity',
  'method',
  'step',
  'category',
  'city',
  'query_length',
  'target',
  'mode',
  'surface',
  'slot',
  'days',
]);

const METADATA_STRING_PATTERN = /^[a-zA-Z0-9 _-]{1,60}$/;

export function classifyAnalyticsSource(referrer: string, siteHost: string): AnalyticsSource {
  if (!referrer) return 'direct';
  try {
    const referrerUrl = referrer.includes('://') ? referrer : `https://${referrer}`;
    const hostname = new URL(referrerUrl).hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = siteHost.toLowerCase().split(':')[0].replace(/^www\./, '');
    const matchesDomain = (domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);
    if (hostname === currentHost) return 'internal';
    if (/^google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(hostname)
      || ['bing.com', 'search.yahoo.com', 'duckduckgo.com', 'ecosia.org'].some(matchesDomain)) return 'search';
    if (['facebook.com', 'instagram.com', 'tiktok.com', 'wa.me', 'whatsapp.com', 'youtube.com', 'youtu.be', 'x.com', 't.co', 'linkedin.com'].some(matchesDomain)) return 'social';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export function normalizeAnalyticsSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const sessionId = value.trim();
  if (sessionId.length < 8 || sessionId.length > 100) return null;
  return /^[A-Za-z0-9_.:-]+$/.test(sessionId) ? sessionId : null;
}

export function normalizeAnalyticsPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path || path.length > 300 || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path.startsWith('/api/') || path === '/api') return null;
  if (path.includes('?') || path.includes('#')) return null;
  return /^\/[A-Za-z0-9\-._~/%]*$/.test(path) ? path : null;
}

export function normalizeAnalyticsAudience(value: unknown, fallback: AnalyticsAudience = 'public'): AnalyticsAudience {
  return typeof value === 'string' && ANALYTICS_AUDIENCES.has(value as AnalyticsAudience)
    ? value as AnalyticsAudience
    : fallback;
}

export function normalizeAnalyticsEntityType(value: unknown): AnalyticsEntityType | null {
  return typeof value === 'string' && ANALYTICS_ENTITY_TYPES.has(value as AnalyticsEntityType)
    ? value as AnalyticsEntityType
    : null;
}

export function normalizeAnalyticsDevice(value: unknown): AnalyticsDevice {
  return typeof value === 'string' && ANALYTICS_DEVICES.has(value as AnalyticsDevice)
    ? value as AnalyticsDevice
    : 'unknown';
}

export function normalizeAnalyticsLocale(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const locale = value.trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(locale) ? locale : null;
}

export function normalizeAnalyticsEventType(value: unknown): string | null {
  return typeof value === 'string' && ANALYTICS_EVENT_TYPES.has(value) ? value : null;
}

export function sanitizeAnalyticsMetadata(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => METADATA_KEYS.has(key))
    .slice(0, 8);
  const metadata: Record<string, string | number | boolean> = {};
  for (const [key, rawValue] of entries) {
    if (typeof rawValue === 'boolean') {
      metadata[key] = rawValue;
      continue;
    }
    if (typeof rawValue === 'number') {
      if (Number.isFinite(rawValue) && Math.abs(rawValue) <= 100_000_000) metadata[key] = rawValue;
      continue;
    }
    if (typeof rawValue === 'string' && METADATA_STRING_PATTERN.test(rawValue.trim())) {
      metadata[key] = rawValue.trim();
    }
  }
  const keys = Object.keys(metadata);
  if (keys.length === 0) return null;
  const serialized = JSON.stringify(metadata);
  return serialized.length <= 600 ? serialized : null;
}

export function analyticsEntityFromPath(path: string): { type: AnalyticsEntityType; id: number | null } {
  const productMatch = path.match(/^\/product\/(\d+)$/);
  if (productMatch) return { type: 'product', id: Number(productMatch[1]) };
  return { type: 'page', id: null };
}

export function parseAnalyticsCampaign(value: unknown): string | null {
  return normalizeAnalyticsCampaign(value);
}
