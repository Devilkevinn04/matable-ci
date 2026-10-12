export type SubscriptionTier = 'standard' | 'premium' | 'pro';
export type SubscriptionFeature = 'custom_branding' | 'event_mode' | 'social_links' | 'advanced_analytics' | 'boost_discount';
export type SubscriptionTerm = 'monthly' | 'annual';

export const SUBSCRIPTION_PRODUCT_LIMITS: Record<SubscriptionTier, number> = {
  standard: 30,
  premium: 100,
  pro: Number.POSITIVE_INFINITY,
};

export const SUBSCRIPTION_PRODUCT_PHOTO_LIMITS: Record<SubscriptionTier, number> = {
  standard: 2,
  premium: 5,
  pro: 6,
};

export const SUBSCRIPTION_ANALYTICS_DAY_LIMITS: Record<SubscriptionTier, number> = {
  standard: 7,
  premium: 30,
  pro: 90,
};

export function normalizeSubscriptionTier(tier: string | null | undefined): SubscriptionTier {
  return tier === 'premium' || tier === 'pro' ? tier : 'standard';
}

export function getSubscriptionProductLimit(tier: string | null | undefined): number {
  return SUBSCRIPTION_PRODUCT_LIMITS[normalizeSubscriptionTier(tier)];
}

export function getSubscriptionProductPhotoLimit(tier: string | null | undefined): number {
  return SUBSCRIPTION_PRODUCT_PHOTO_LIMITS[normalizeSubscriptionTier(tier)];
}

export function getSubscriptionAnalyticsDayLimit(tier: string | null | undefined): number {
  return SUBSCRIPTION_ANALYTICS_DAY_LIMITS[normalizeSubscriptionTier(tier)];
}

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_CATALOG_LIMIT = 2;
export const SUBSCRIPTION_EXPIRY_GRACE_DAYS = 2;
export const PRO_BOOST_DISCOUNT_PERCENT = 15;

export const SUBSCRIPTION_PLANS = {
  standard: {
    tier: 'standard',
    label: 'Standard',
    price: 3000,
    headline: 'Lancez votre boutique en ligne',
    description: 'Les essentiels pour présenter vos produits et recevoir des demandes.',
    benefits: [
      'Jusqu’à 30 articles et 2 photos par article',
      'Commandes directes sur WhatsApp',
      'Présence dans l’annuaire MaTable.ci',
      'Statistiques de base sur 7 jours',
    ],
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    price: 5000,
    headline: 'Faites-vous remarquer',
    description: 'Personnalisez votre vitrine et mettez en valeur votre marque.',
    benefits: [
      'Tout Standard',
      'Couleurs, polices, logo et bannière personnalisés',
      'Réseaux sociaux et bandeau événementiel',
      'Jusqu’à 100 articles et 5 photos par article',
      'Statistiques sur 30 jours et produits les plus consultés',
      'Meilleure visibilité dans l’annuaire',
    ],
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    price: 8000,
    headline: 'Pilotez votre croissance',
    description: 'Visibilité maximale et statistiques détaillées de la vitrine.',
    benefits: [
      'Tout Premium',
      'Articles illimités et jusqu’à 6 photos par article',
      'Statistiques détaillées sur 90 jours',
      'Meilleure visibilité naturelle dans l’annuaire',
      `Réduction de ${PRO_BOOST_DISCOUNT_PERCENT}% sur les boosts payants`,
    ],
  },
} as const;

const tierRank: Record<SubscriptionTier, number> = {
  standard: 0,
  premium: 1,
  pro: 2,
};

const featureMinimumTier: Record<SubscriptionFeature, SubscriptionTier> = {
  custom_branding: 'premium',
  event_mode: 'premium',
  social_links: 'premium',
  advanced_analytics: 'pro',
  boost_discount: 'pro',
};

export function getSubscriptionPrice(tier: SubscriptionTier, term: SubscriptionTerm = 'monthly'): number {
  const monthlyPrice = SUBSCRIPTION_PLANS[tier].price;
  return term === 'annual' ? monthlyPrice * 10 : monthlyPrice;
}

export function getSubscriptionDailyPrice(tier: SubscriptionTier): number {
  return Math.ceil(SUBSCRIPTION_PLANS[tier].price / 30);
}

export function getSubscriptionAccessCutoff(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const businessDate = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Africa/Abidjan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const dayStart = Date.parse(`${businessDate}T00:00:00.000Z`);
  return Number.isFinite(dayStart) ? dayStart + 86400000 : null;
}

export function getSubscriptionGraceCutoff(value: string | Date): number | null {
  const accessCutoff = getSubscriptionAccessCutoff(value);
  return accessCutoff === null
    ? null
    : accessCutoff + SUBSCRIPTION_EXPIRY_GRACE_DAYS * 86400000;
}

export function isSubscriptionFeatureIncluded(
  tier: string | null | undefined,
  feature: SubscriptionFeature,
): boolean {
  const normalizedTier: SubscriptionTier = tier === 'pro' || tier === 'premium' ? tier : 'standard';
  return tierRank[normalizedTier] >= tierRank[featureMinimumTier[feature]];
}