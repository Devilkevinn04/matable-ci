import { getProductSaleStatus, type ProductSaleFields } from './productPricing.ts';

const MAX_CONSECUTIVE_PER_SHOP = 2;
const MIN_PROMOTIONS = 1;
const MIN_NEWEST = 4;
const NEWEST_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

export interface HomeProduct extends ProductSaleFields {
  id: number;
  image_url?: string;
  thumbnail_url?: string;
  created_at?: string | null;
  shop: { slug: string };
}

/** Boutiques ouvertes, puis photos, puis ordre reçu ; jamais plus de deux articles de suite de la même boutique si un autre choix existe. */
export function orderHomeProducts<T extends HomeProduct>(products: readonly T[], openShopSlugs: ReadonlySet<string>): T[] {
  const rank = (product: T) => Number(openShopSlugs.has(product.shop.slug)) * 2
    + Number(Boolean(product.thumbnail_url || product.image_url));
  const remaining = [...products].sort((left, right) => rank(right) - rank(left));
  const ordered: T[] = [];
  while (remaining.length > 0) {
    const recent = ordered.slice(-MAX_CONSECUTIVE_PER_SHOP);
    const blockedSlug = recent.length === MAX_CONSECUTIVE_PER_SHOP && recent.every((item) => item.shop.slug === recent[0].shop.slug)
      ? recent[0].shop.slug
      : null;
    const nextIndex = blockedSlug
      ? remaining.findIndex((item) => item.shop.slug !== blockedSlug && rank(item) === rank(remaining[0]))
      : 0;
    ordered.push(...remaining.splice(Math.max(0, nextIndex), 1));
  }
  return ordered;
}

/** Répartit les articles sans jamais en montrer un deux fois ni vider la grille principale. */
export function getHomeSections<T extends HomeProduct>(products: readonly T[], now = Date.now()) {
  const isPromotion = (product: T) => getProductSaleStatus(product, now) === 'active';
  const isNew = (product: T) => {
    const age = now - Date.parse(product.created_at || '');
    return age >= 0 && age < NEWEST_MAX_AGE_MS;
  };
  let grid = [...products];
  const take = (matches: (product: T) => boolean, minimum: number): T[] => {
    const taken = grid.filter(matches);
    const rest = grid.filter((product) => !matches(product));
    if (taken.length < minimum || rest.length === 0) return [];
    grid = rest;
    return taken;
  };
  const promotions = take(isPromotion, MIN_PROMOTIONS);
  const newest = take(isNew, MIN_NEWEST);
  return { promotions, newest, grid };
}
