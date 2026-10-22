import { DEFAULT_SUBSCRIPTION_PRO_FEATURES } from './subscriptionFeatures';

export const BOOST_DURATIONS_DAYS = [1, 3, 7] as const;
export const BOOST_PLACEMENTS = ['home', 'category', 'city'] as const;
export type BoostPlacement = (typeof BOOST_PLACEMENTS)[number];
export const MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE = 5;
export const BOOST_MINIMUM_PRODUCT_COUNT = 2;
export const BOOST_PRICES: Record<(typeof BOOST_DURATIONS_DAYS)[number], number> = {
  1: 1000,
  3: 1500,
  7: 2000,
};
export const BOOST_PRO_DISCOUNT_RATE = DEFAULT_SUBSCRIPTION_PRO_FEATURES.boostDiscountPercent / 100;

export function getBoostPrice(durationDays: number, discount: boolean | number): number | null {
  const duration = BOOST_DURATIONS_DAYS.find((value) => value === durationDays);
  if (duration === undefined) return null;
  const basePrice = BOOST_PRICES[duration];
  const discountPercent = typeof discount === 'boolean'
    ? (discount ? DEFAULT_SUBSCRIPTION_PRO_FEATURES.boostDiscountPercent : 0)
    : discount;
  return discountPercent > 0 ? Math.round(basePrice * (1 - discountPercent / 100)) : basePrice;
}
