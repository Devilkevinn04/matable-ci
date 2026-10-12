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
export const BOOST_PRO_DISCOUNT_RATE = 0.15;

export function getBoostPrice(durationDays: number, hasProDiscount: boolean): number | null {
  const duration = BOOST_DURATIONS_DAYS.find((value) => value === durationDays);
  if (duration === undefined) return null;
  const basePrice = BOOST_PRICES[duration];
  return hasProDiscount ? Math.round(basePrice * (1 - BOOST_PRO_DISCOUNT_RATE)) : basePrice;
}
