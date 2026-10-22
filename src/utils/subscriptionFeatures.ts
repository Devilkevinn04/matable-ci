export type SubscriptionTier = 'standard' | 'premium' | 'pro';
export type SubscriptionFeature = 'custom_branding' | 'event_mode' | 'social_links' | 'advanced_analytics' | 'boost_discount';
export type SubscriptionTerm = 'monthly' | 'annual';

export interface SubscriptionProFeatures {
  productLimit: number | null;
  productPhotoLimit: number;
  analyticsDayLimit: number;
  boostDiscountPercent: number;
}

export const DEFAULT_SUBSCRIPTION_PRO_FEATURES: SubscriptionProFeatures = {
  productLimit: null,
  productPhotoLimit: 6,
  analyticsDayLimit: 90,
  boostDiscountPercent: 15,
};

export const SUBSCRIPTION_PRODUCT_LIMITS: Record<SubscriptionTier, number> = {
  standard: 20,
  premium: Number.POSITIVE_INFINITY,
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

export function getSubscriptionProductLimit(
  tier: string | null | undefined,
  proFeatures?: SubscriptionProFeatures,
): number {
  return getSubscriptionPlanFeatures(tier, proFeatures).productLimit ?? Number.POSITIVE_INFINITY;
}

export function getSubscriptionProductPhotoLimit(
  tier: string | null | undefined,
  proFeatures?: SubscriptionProFeatures,
): number {
  return getSubscriptionPlanFeatures(tier, proFeatures).productPhotoLimit;
}

export function getSubscriptionAnalyticsDayLimit(
  tier: string | null | undefined,
  proFeatures?: SubscriptionProFeatures,
): number {
  return getSubscriptionPlanFeatures(tier, proFeatures).analyticsDayLimit;
}

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_CATALOG_LIMIT = 2;
export const SUBSCRIPTION_EXPIRY_GRACE_DAYS = 2;
export const PRO_BOOST_DISCOUNT_PERCENT = DEFAULT_SUBSCRIPTION_PRO_FEATURES.boostDiscountPercent;

export const SUBSCRIPTION_PLANS = {
  standard: {
    tier: 'standard',
    label: 'Standard',
    price: 3000,
    headline: 'Lancez votre boutique en ligne',
    description: 'Les essentiels pour présenter vos produits et recevoir des demandes.',
    benefits: [
      'Jusqu’à 20 articles et 2 photos par article',
      'Un QR code général pour partager votre vitrine',
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
      'Catalogue illimité et jusqu’à 5 photos par article',
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

export function getSubscriptionPlanFeatures(
  tier: string | null | undefined,
  proFeatures: SubscriptionProFeatures = DEFAULT_SUBSCRIPTION_PRO_FEATURES,
): SubscriptionProFeatures {
  if (tier === 'pro') return proFeatures;
  const normalizedTier = normalizeSubscriptionTier(tier);
  return {
    productLimit: Number.isFinite(SUBSCRIPTION_PRODUCT_LIMITS[normalizedTier])
      ? SUBSCRIPTION_PRODUCT_LIMITS[normalizedTier]
      : null,
    productPhotoLimit: SUBSCRIPTION_PRODUCT_PHOTO_LIMITS[normalizedTier],
    analyticsDayLimit: SUBSCRIPTION_ANALYTICS_DAY_LIMITS[normalizedTier],
    boostDiscountPercent: 0,
  };
}

export function getSubscriptionPlanBenefits(
  tier: SubscriptionTier,
  proFeatures: SubscriptionProFeatures = DEFAULT_SUBSCRIPTION_PRO_FEATURES,
): string[] {
  if (tier !== 'pro') return [...SUBSCRIPTION_PLANS[tier].benefits];
  return [
    'Tout Premium',
    `${proFeatures.productLimit === null ? 'Articles illimités' : `Jusqu’à ${proFeatures.productLimit} articles`} et jusqu’à ${proFeatures.productPhotoLimit} photos par article`,
    `Statistiques détaillées sur ${proFeatures.analyticsDayLimit} jours`,
    'Meilleure visibilité naturelle dans l’annuaire',
    ...(proFeatures.boostDiscountPercent > 0
      ? [`Réduction de ${proFeatures.boostDiscountPercent}% sur les boosts payants`]
      : []),
  ];
}

export function parseSubscriptionProFeatures(value: unknown): SubscriptionProFeatures {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('La configuration des avantages Pro est invalide.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('La configuration des avantages Pro est invalide.');
  }
  const record = parsed as Record<string, unknown>;
  const productLimit = record.productLimit;
  const productPhotoLimit = record.productPhotoLimit;
  const analyticsDayLimit = record.analyticsDayLimit;
  const boostDiscountPercent = record.boostDiscountPercent;
  let validatedProductLimit: number | null;
  if (productLimit === null) {
    validatedProductLimit = null;
  } else if (typeof productLimit === 'number'
    && Number.isSafeInteger(productLimit)
    && productLimit >= 1
    && productLimit <= 100_000) {
    validatedProductLimit = productLimit;
  } else {
    throw new Error('La limite d’articles Pro doit être « illimitée » ou un entier entre 1 et 100 000.');
  }
  if (typeof productPhotoLimit !== 'number' || !Number.isSafeInteger(productPhotoLimit) || productPhotoLimit < 1 || productPhotoLimit > 20) {
    throw new Error('La limite de photos Pro doit être un entier entre 1 et 20.');
  }
  if (typeof analyticsDayLimit !== 'number' || !Number.isSafeInteger(analyticsDayLimit) || analyticsDayLimit < 1 || analyticsDayLimit > 365) {
    throw new Error('La période des statistiques Pro doit être un entier entre 1 et 365 jours.');
  }
  if (typeof boostDiscountPercent !== 'number' || !Number.isSafeInteger(boostDiscountPercent) || boostDiscountPercent < 0 || boostDiscountPercent > 100) {
    throw new Error('La réduction Pro doit être un entier entre 0 et 100 %.');
  }
  return { productLimit: validatedProductLimit, productPhotoLimit, analyticsDayLimit, boostDiscountPercent };
}

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