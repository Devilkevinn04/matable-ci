import type { ShopCategory } from './categoryDefaults';

export interface MerchantVocabulary {
  catalogTitle: string;
  addItem: string;
  addFirstItem: string;
  editItem: string;
  searchPlaceholder: string;
  stockUnit: string;
  soldOutBadge: string;
  soldOutAction: string;
  soldOutFilter: string;
  lowStockBadge: string;
  lowStockFilter: string;
  soldOutChip: (count: number) => string;
  lowStockChip: (count: number) => string;
}

interface Noun {
  singular: string;
  plural: string;
  feminine?: boolean;
  catalogTitle: string;
  stockUnit?: string;
  /** Mots invariables : badge, filtre, texte après le nom (« 2 plats plus disponibles »). */
  soldOut?: { badge: string; action: string; filter: string; after: (count: number) => string };
  lowStock?: { badge: string; filter: string; after: (count: number) => string };
}

const places: Pick<Noun, 'stockUnit' | 'soldOut' | 'lowStock'> = {
  stockUnit: 'place',
  soldOut: { badge: 'Complet', action: 'Complet', filter: 'Sans place', after: () => 'sans place' },
  lowStock: { badge: 'Peu de places', filter: 'Peu de places', after: () => 'avec peu de places' },
};

const NOUNS: Record<ShopCategory, Noun> = {
  fashion: { singular: 'article', plural: 'articles', catalogTitle: 'Mes articles' },
  food: {
    singular: 'plat',
    plural: 'plats',
    catalogTitle: 'Mon menu',
    stockUnit: 'disponible',
    soldOut: { badge: 'Plus disponible', action: 'Plus dispo', filter: 'Plus disponibles', after: (count) => `plus disponible${count > 1 ? 's' : ''}` },
    lowStock: { badge: 'Bientôt épuisé', filter: 'Bientôt épuisés', after: (count) => `bientôt épuisé${count > 1 ? 's' : ''}` },
  },
  beauty: { singular: 'produit', plural: 'produits', catalogTitle: 'Mes produits et soins' },
  electronics: { singular: 'produit', plural: 'produits', catalogTitle: 'Mes produits' },
  home: { singular: 'article', plural: 'articles', catalogTitle: 'Mes articles' },
  services: { singular: 'prestation', plural: 'prestations', feminine: true, catalogTitle: 'Mes prestations', ...places },
  health: { singular: 'produit', plural: 'produits', catalogTitle: 'Mes produits et soins' },
  crafts: { singular: 'création', plural: 'créations', feminine: true, catalogTitle: 'Mes créations' },
  education: { singular: 'formation', plural: 'formations', feminine: true, catalogTitle: 'Mes formations', ...places },
  automotive: { singular: 'produit', plural: 'produits', catalogTitle: 'Mes produits et services' },
  other: { singular: 'article', plural: 'articles', catalogTitle: 'Mes articles' },
};

const pluralize = (word: string, count: number) => (count > 1 ? `${word}s` : word);

/** Mots du dashboard commerçant, adaptés à ce que vend la boutique. */
export function getMerchantVocabulary(category: unknown): MerchantVocabulary {
  const key = (Object.keys(NOUNS) as ShopCategory[]).find((candidate) => candidate === category) ?? 'other';
  const noun = NOUNS[key];
  const article = noun.feminine ? 'une' : 'un';

  return {
    catalogTitle: noun.catalogTitle,
    addItem: `Ajouter ${article} ${noun.singular}`,
    addFirstItem: `Ajouter ${noun.feminine ? 'ma première' : 'mon premier'} ${noun.singular}`,
    editItem: `Modifier ${noun.feminine ? 'la' : 'le'} ${noun.singular}`,
    searchPlaceholder: `Rechercher ${article} ${noun.singular}...`,
    stockUnit: noun.stockUnit ?? 'en stock',
    soldOutBadge: noun.soldOut?.badge ?? 'Épuisé',
    soldOutAction: noun.soldOut?.action ?? 'Épuiser',
    soldOutFilter: noun.soldOut?.filter ?? 'Épuisés',
    lowStockBadge: noun.lowStock?.badge ?? 'Stock bas',
    lowStockFilter: noun.lowStock?.filter ?? 'Stock bas',
    soldOutChip: (count) => `${count} ${pluralize(noun.singular, count)} ${noun.soldOut ? noun.soldOut.after(count) : `épuisé${count > 1 ? 's' : ''}`}`,
    lowStockChip: (count) => (noun.lowStock
      ? `${count} ${pluralize(noun.singular, count)} ${noun.lowStock.after(count)}`
      : `${count} stock${count > 1 ? 's' : ''} bas`),
  };
}
