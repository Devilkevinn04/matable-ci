import type { ShopEventType } from '../types';

export const SHOP_EVENT_VISUALS: Record<ShopEventType, {
  label: string;
  icon: string;
  badgeClass: string;
  bannerClass: string;
  suggestion: string;
}> = {
  sales: {
    label: 'Soldes',
    icon: '％',
    badgeClass: 'border-rose-200 bg-rose-100 text-rose-900',
    bannerClass: 'border-rose-200 bg-rose-50 text-rose-950',
    suggestion: 'SOLDES EN COURS — DÉCOUVREZ NOS PRIX RÉDUITS',
  },
  flash_sale: {
    label: 'Vente flash',
    icon: '⚡',
    badgeClass: 'border-amber-200 bg-amber-100 text-amber-950',
    bannerClass: 'border-amber-200 bg-amber-50 text-amber-950',
    suggestion: 'VENTE FLASH — OFFRE DISPONIBLE POUR UNE DURÉE LIMITÉE',
  },
  new_arrival: {
    label: 'Nouveautés',
    icon: '✦',
    badgeClass: 'border-sky-200 bg-sky-100 text-sky-900',
    bannerClass: 'border-sky-200 bg-sky-50 text-sky-950',
    suggestion: 'NOUVELLE COLLECTION — DÉCOUVREZ NOS DERNIÈRES ARRIVÉES',
  },
  launch: {
    label: 'Lancement',
    icon: '🚀',
    badgeClass: 'border-violet-200 bg-violet-100 text-violet-900',
    bannerClass: 'border-violet-200 bg-violet-50 text-violet-950',
    suggestion: 'C’EST NOUVEAU — CÉLÉBRONS NOTRE LANCEMENT ENSEMBLE',
  },
  special_offer: {
    label: 'Offre spéciale',
    icon: '★',
    badgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-900',
    bannerClass: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    suggestion: 'OFFRE SPÉCIALE — PROFITEZ-EN DÈS MAINTENANT',
  },
  custom: {
    label: 'Événement',
    icon: '✦',
    badgeClass: 'border-orange-200 bg-orange-100 text-orange-950',
    bannerClass: 'border-orange-200 bg-orange-50 text-orange-950',
    suggestion: 'PARTAGEZ VOTRE ACTUALITÉ AVEC VOS CLIENTS',
  },
};

export const SHOP_EVENT_TYPES = Object.keys(SHOP_EVENT_VISUALS) as ShopEventType[];

export function normalizeShopEventType(value: unknown): ShopEventType {
  return typeof value === 'string' && SHOP_EVENT_TYPES.includes(value as ShopEventType)
    ? value as ShopEventType
    : 'custom';
}
