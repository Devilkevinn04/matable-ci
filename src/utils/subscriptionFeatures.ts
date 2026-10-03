export type SubscriptionTier = 'standard' | 'premium' | 'pro';
export type SubscriptionFeature = 'custom_branding' | 'event_mode' | 'social_links' | 'advanced_analytics';

export const SUBSCRIPTION_PLANS = {
  standard: {
    tier: 'standard',
    label: 'Standard',
    price: 3000,
    headline: 'Lancez votre boutique en ligne',
    description: 'Les essentiels pour présenter vos produits et recevoir des demandes.',
    benefits: [
      'Vitrine publique et catalogue avec photos, prix et stock',
      'Commandes directes sur WhatsApp',
      'Horaires et zones de livraison',
      'Présence dans l’annuaire MaTable.ci',
    ],
  },
  premium: {
    tier: 'premium',
    label: 'Premium',
    price: 4000,
    headline: 'Faites-vous remarquer',
    description: 'Une vitrine de marque et une meilleure place dans l’annuaire.',
    benefits: [
      'Tout Standard',
      'Couleurs, polices, logo et bannière personnalisés',
      'Réseaux sociaux et bandeau événementiel',
      'Visibilité renforcée après activation de l’abonnement',
    ],
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    price: 5000,
    headline: 'Pilotez votre croissance',
    description: 'Visibilité maximale et statistiques détaillées de la vitrine.',
    benefits: [
      'Tout Premium',
      'Priorité maximale dans l’annuaire après activation',
      'Vues consenties, visiteurs, commandes et ventes sur 90 jours',
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
};

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

export function isSubscriptionFeatureIncluded(
  tier: string | null | undefined,
  feature: SubscriptionFeature,
): boolean {
  const normalizedTier: SubscriptionTier = tier === 'pro' || tier === 'premium' ? tier : 'standard';
  return tierRank[normalizedTier] >= tierRank[featureMinimumTier[feature]];
}