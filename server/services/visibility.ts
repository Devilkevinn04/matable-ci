import type { ShopRecord } from '../types.ts';

const ROTATION_INTERVAL_MS = 3 * 60 * 60 * 1000;

export function getShopVisibilityScore(shop: ShopRecord, productCount: number, now = Date.now()): number {
  let score = 0;
  if (shop.featured_until && Date.parse(shop.featured_until) > now) score += 1000;

  if (shop.subscription_status === 'active') {
    if (shop.selected_subscription_tier === 'pro') score += 300;
    else if (shop.selected_subscription_tier === 'premium') score += 150;
  }

  if (productCount > 0) score += 50 + Math.min(productCount, 20) * 2;

  const createdAt = Date.parse(shop.created_at);
  if (Number.isFinite(createdAt) && now - createdAt >= 0 && now - createdAt < 14 * 86400000) score += 40;

  if (shop.theme_config?.logo_url) score += 15;
  if (shop.theme_config?.custom_banner_url) score += 15;
  if ((shop.welcome_message || '').trim().length >= 10) score += 10;
  if (shop.opening_hours?.enabled) score += 10;
  return score;
}

export function rankShopsByVisibility(
  shops: ShopRecord[],
  productCounts: Map<number, number>,
  computeIsShopOpen: (shop: ShopRecord) => boolean,
  now = Date.now(),
) {
  const ranked = shops.map((shop) => ({
    shop,
    is_open: computeIsShopOpen(shop),
    is_featured: Boolean(shop.featured_until && Date.parse(shop.featured_until) > now),
    score: getShopVisibilityScore(shop, productCounts.get(shop.id) || 0, now),
  }));

  ranked.sort((left, right) => Number(right.is_open) - Number(left.is_open)
    || right.score - left.score
    || left.shop.id - right.shop.id);

  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length
      && ranked[end].is_open === ranked[start].is_open
      && ranked[end].score === ranked[start].score) end += 1;
    const groupSize = end - start;
    if (groupSize > 1) {
      const rotation = Math.floor(now / ROTATION_INTERVAL_MS) % groupSize;
      const tied = ranked.slice(start, end);
      ranked.splice(start, groupSize, ...tied.slice(rotation), ...tied.slice(0, rotation));
    }
    start = end;
  }

  return ranked.map(({ shop, is_open, is_featured }) => ({ shop, is_open, is_featured }));
}