import {
  SUBSCRIPTION_PLANS,
  getSubscriptionPrice,
  type SubscriptionTier,
} from '../../src/utils/subscriptionFeatures.ts';

export type SubscriptionPrices = Record<SubscriptionTier, number>;

const tiers: SubscriptionTier[] = ['standard', 'premium', 'pro'];

export function parseSubscriptionPrices(value: unknown): SubscriptionPrices {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('La configuration des tarifs d’abonnement est invalide.');
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('La configuration des tarifs d’abonnement est invalide.');
  }
  const prices = {} as SubscriptionPrices;
  for (const tier of tiers) {
    const price = (parsed as Record<string, unknown>)[tier];
    if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > 1_000_000) {
      throw new Error(`Le tarif ${SUBSCRIPTION_PLANS[tier].label} doit être un entier entre 1 et 1 000 000 FCFA.`);
    }
    prices[tier] = price;
  }
  return prices;
}

export function getDefaultSubscriptionPrices(): SubscriptionPrices {
  return Object.fromEntries(tiers.map((tier) => [tier, getSubscriptionPrice(tier)])) as SubscriptionPrices;
}

export function getSubscriptionPriceForTerm(
  prices: SubscriptionPrices,
  tier: SubscriptionTier,
  term: 'monthly' | 'annual',
): number {
  return term === 'annual' ? prices[tier] * 10 : prices[tier];
}
