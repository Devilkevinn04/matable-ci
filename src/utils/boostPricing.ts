export const BOOST_DURATIONS_DAYS = [7, 15, 30] as const;
export const MAX_SIMULTANEOUS_BOOSTS_PER_CITY_CATEGORY = 5;
export const BOOST_PRICES: Record<(typeof BOOST_DURATIONS_DAYS)[number], number> = {
  7: 2000,
  15: 2800,
  30: 3000,
};
export const BOOST_PRO_DISCOUNT_RATE = 0.15;

export function getBoostPrice(durationDays: number, hasProDiscount: boolean): number | null {
  const duration = BOOST_DURATIONS_DAYS.find((value) => value === durationDays);
  if (duration === undefined) return null;
  const basePrice = BOOST_PRICES[duration];
  return hasProDiscount ? Math.round(basePrice * (1 - BOOST_PRO_DISCOUNT_RATE)) : basePrice;
}
