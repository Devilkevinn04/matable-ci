import { isShopCategory, type ShopCategory } from './categoryDefaults';

const STORAGE_KEY = 'matable_discovery_preferences_v1';
const MAX_CATEGORIES = 4;

type PreferenceStore = Partial<Record<ShopCategory, number>>;

function sanitizeScore(score: unknown): number {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? Math.max(0, Math.min(numericScore, 20)) : 0;
}

function readStore(): PreferenceStore {
  if (typeof window === 'undefined') return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const nextStore: PreferenceStore = {};
    for (const [category, score] of Object.entries(value)) {
      if (!isShopCategory(category)) continue;
      const sanitizedScore = sanitizeScore(score);
      if (sanitizedScore > 0) nextStore[category as ShopCategory] = sanitizedScore;
    }
    return nextStore;
  } catch {
    return {};
  }
}

export function getDiscoveryPreferences(): ShopCategory[] {
  return Object.entries(readStore())
    .filter(([, score]) => Number.isFinite(score) && score > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, MAX_CATEGORIES)
    .map(([category]) => category as ShopCategory);
}

/** Stores a small on-device interest signal. It is never sent with an identity. */
export function rememberDiscoveryCategory(category: string, weight = 1): ShopCategory[] {
  if (!isShopCategory(category) || typeof window === 'undefined') return getDiscoveryPreferences();

  const store = readStore();
  const normalizedWeight = sanitizeScore(weight);
  for (const key of Object.keys(store) as ShopCategory[]) {
    const previous = sanitizeScore(store[key]);
    store[key] = Math.max(0, previous * 0.85);
  }
  store[category] = Math.min((sanitizeScore(store[category]) || 0) + normalizedWeight, 20);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A private browser may reject storage; discovery remains usable.
  }
  return getDiscoveryPreferences();
}

export function clearDiscoveryPreferences() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no local storage available
  }
}
