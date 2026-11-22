import { cityMatchesSlug, getCityFilterOptions } from './discoverySeo.ts';
import { getActiveProductPrice, type ProductSaleFields } from './productPricing.ts';

/** Filtres communs à l’accueil et à l’annuaire ; ils vivent dans l’adresse de la page. */
export interface CatalogFilters {
  category: string;
  city: string;
  maxPrice: number | null;
  openOnly: boolean;
  sort: string;
}

export const DEFAULT_SORT = 'recommended';
const PRICE_STEPS = [2_000, 5_000, 10_000, 20_000, 50_000];

const PARAMS: Record<keyof CatalogFilters, string> = { category: 'categorie', city: 'commune', maxPrice: 'prix', openOnly: 'ouvertes', sort: 'tri' };

export const readCatalogFilters = (params: URLSearchParams): CatalogFilters => {
  const price = Number(params.get(PARAMS.maxPrice));
  return {
    category: params.get(PARAMS.category) || 'all',
    city: params.get(PARAMS.city) || 'all',
    maxPrice: PRICE_STEPS.includes(price) ? price : null,
    openOnly: params.get(PARAMS.openOnly) === '1',
    sort: params.get(PARAMS.sort) || DEFAULT_SORT,
  };
};

/** Garde les autres paramètres (recherche, campagne) et n’écrit jamais une valeur par défaut. */
export const writeCatalogFilters = (params: URLSearchParams, changes: Partial<CatalogFilters>): URLSearchParams => {
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(changes) as [keyof CatalogFilters, CatalogFilters[keyof CatalogFilters]][]) {
    if (value === null || value === false || value === 'all' || value === DEFAULT_SORT) next.delete(PARAMS[name]);
    else next.set(PARAMS[name], value === true ? '1' : String(value));
  }
  return next;
};

export const CLEARED_FILTERS: Partial<CatalogFilters> = { category: 'all', city: 'all', maxPrice: null, openOnly: false };

export interface FilterableProduct extends ProductSaleFields {
  created_at?: string | null;
  shop: { slug: string; category?: string; city?: string };
}

const categoryOf = (category?: string) => category || 'other';

const matches = <T extends FilterableProduct>(product: T, filters: CatalogFilters, closedShops: ReadonlySet<string>, now: number) =>
  (filters.category === 'all' || categoryOf(product.shop.category) === filters.category)
  && (filters.city === 'all' || cityMatchesSlug(product.shop.city, filters.city))
  && (filters.maxPrice === null || getActiveProductPrice(product, now) <= filters.maxPrice)
  && (!filters.openOnly || !closedShops.has(product.shop.slug));

export const filterCatalogProducts = <T extends FilterableProduct>(products: readonly T[], filters: CatalogFilters, closedShops: ReadonlySet<string>, now: number): T[] => {
  const filtered = products.filter((product) => matches(product, filters, closedShops, now));
  if (filters.sort === 'price') return filtered.sort((left, right) => getActiveProductPrice(left, now) - getActiveProductPrice(right, now));
  if (filters.sort === 'newest') return filtered.sort((left, right) => (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0));
  return filtered;
};

export interface CategoryFacet { value: string; count: number }

/** Nombre de résultats par catégorie, les autres filtres appliqués : un choix ne mène jamais à une surprise. */
export const getCategoryFacets = <T extends FilterableProduct>(products: readonly T[], filters: CatalogFilters, closedShops: ReadonlySet<string>, now: number): CategoryFacet[] => {
  const counts = new Map<string, number>(products.map((product) => [categoryOf(product.shop.category), 0]));
  for (const product of products) {
    if (!matches(product, { ...filters, category: 'all' }, closedShops, now)) continue;
    const category = categoryOf(product.shop.category);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
};

/** Seuls les paliers qui séparent vraiment les produits sont proposés. */
export const getPriceOptions = (products: readonly FilterableProduct[], now: number): number[] => {
  const prices = products.map((product) => getActiveProductPrice(product, now));
  return PRICE_STEPS.filter((step) => prices.some((price) => price <= step) && prices.some((price) => price > step));
};

export const getCityOptions = (products: readonly FilterableProduct[]) => getCityFilterOptions(products.map(({ shop }) => shop.city));
