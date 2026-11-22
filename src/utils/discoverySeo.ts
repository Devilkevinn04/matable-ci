import { ABIDJAN_COMMUNES } from './abidjanCommunes';
import { isShopCategory, SHOP_CATEGORIES, type ShopCategory } from './categoryDefaults';

export interface DiscoveryShop {
  slug: string;
  category?: string;
  city?: string;
}

export interface DiscoveryPage {
  path: string;
  title: string;
  description: string;
  heading: string;
  category?: ShopCategory;
  city?: string;
  citySlug?: string;
  shopCount: number;
}

const MINIMUM_SHOPS_PER_DISCOVERY_PAGE = 2;
const categoryPhrases: Record<ShopCategory, string> = {
  fashion: 'de mode',
  food: 'de restauration',
  beauty: 'de beauté et bien-être',
  electronics: 'd’électronique',
  home: 'pour la maison et la décoration',
  services: 'de services',
  health: 'de santé',
  crafts: 'd’artisanat',
  education: 'de formation',
  automotive: 'automobiles',
  other: 'de commerces locaux',
};
const localCategoryNames: Record<ShopCategory, string> = {
  fashion: 'boutiques de mode et friperies',
  food: 'restaurants',
  beauty: 'boutiques de beauté',
  electronics: 'boutiques d’électronique',
  home: 'boutiques maison et décoration',
  services: 'prestataires de services',
  health: 'commerces de santé',
  crafts: 'boutiques d’artisanat',
  education: 'centres de formation',
  automotive: 'commerces automobiles',
  other: 'commerces locaux',
};

export function getDiscoveryCityLabel(city: string): string {
  const primaryCity = city.split(/[\/|]/, 1)[0].replace(/\s*\([^)]*\)/g, '').trim();
  return primaryCity || city.trim();
}

export function toDiscoveryCitySlug(city: string): string {
  return getDiscoveryCityLabel(city)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function makeCategoryPage(category: ShopCategory, shopCount: number): DiscoveryPage {
  const phrase = categoryPhrases[category];
  const heading = `Boutiques ${phrase} en Côte d’Ivoire`;
  return {
    path: `/boutiques/categorie/${category}`,
    title: `${heading} | MaTable`,
    description: `Parcourez les vitrines ${phrase} en Côte d’Ivoire, découvrez leurs catalogues et contactez directement les commerçants sur WhatsApp.`,
    heading,
    category,
    shopCount,
  };
}

function makeCityPage(city: string, citySlug: string, shopCount: number): DiscoveryPage {
  const heading = `Boutiques locales à ${city}`;
  return {
    path: `/boutiques/ville/${citySlug}`,
    title: `${heading} | MaTable`,
    description: `Découvrez les boutiques et commerces locaux à ${city}, consultez leurs vitrines et contactez directement les commerçants sur WhatsApp.`,
    heading,
    city,
    citySlug,
    shopCount,
  };
}

function makeCityCategoryPage(category: ShopCategory, city: string, citySlug: string, shopCount: number): DiscoveryPage {
  const categoryName = localCategoryNames[category];
  const heading = `${categoryName[0].toUpperCase()}${categoryName.slice(1)} à ${city}`;
  return {
    path: `/boutiques/ville/${citySlug}/categorie/${category}`,
    title: `${heading} | MaTable`,
    description: `Trouvez des ${categoryName} à ${city}. Parcourez les vitrines, consultez les produits et contactez directement les commerçants.`,
    heading,
    category,
    city,
    citySlug,
    shopCount,
  };
}

const ABIDJAN_SLUGS = ['abidjan', ...ABIDJAN_COMMUNES
  .filter((commune) => commune !== 'Autre ville / commune')
  .map(toDiscoveryCitySlug)];

export function isAbidjanCity(city: string | null | undefined): boolean {
  const slug = toDiscoveryCitySlug(city || '');
  return ABIDJAN_SLUGS.some((candidate) => slug === candidate || slug.startsWith(`${candidate}-`));
}

/** « Abidjan » regroupe toutes ses communes ; une commune ne regroupe qu’elle-même. */
export function cityMatchesSlug(city: string | null | undefined, slug: string): boolean {
  return toDiscoveryCitySlug(city || '') === slug || (slug === 'abidjan' && isAbidjanCity(city));
}

/** Choix de communes pour un filtre, avec « Abidjan (toutes) » dès qu’une de ses communes est présente. */
export function getCityFilterOptions(cities: readonly (string | undefined)[]): { value: string; label: string }[] {
  const bySlug = new Map<string, string>();
  for (const city of cities) {
    const label = city ? getDiscoveryCityLabel(city) : '';
    const slug = toDiscoveryCitySlug(label);
    if (!slug) continue;
    bySlug.set(slug, label);
    if (slug !== 'abidjan' && isAbidjanCity(label)) bySlug.set('abidjan', 'Abidjan (toutes)');
  }
  if (bySlug.has('abidjan') && [...bySlug.keys()].some((slug) => slug !== 'abidjan' && isAbidjanCity(slug))) bySlug.set('abidjan', 'Abidjan (toutes)');
  return [...bySlug.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'));
}

export function getPublicDiscoveryPages(shops: readonly DiscoveryShop[]): DiscoveryPage[] {
  const pages: DiscoveryPage[] = [];
  const shopsByCategory = new Map<ShopCategory, number>();
  const shopsByCity = new Map<string, { city: string; count: number }>();
  const shopsByCityCategory = new Map<string, { city: string; citySlug: string; category: ShopCategory; count: number }>();

  for (const shop of shops) {
    if (isShopCategory(shop.category)) {
      shopsByCategory.set(shop.category, (shopsByCategory.get(shop.category) || 0) + 1);
    }
    const city = shop.city ? getDiscoveryCityLabel(shop.city) : '';
    if (city) {
      const citySlug = toDiscoveryCitySlug(city);
      if (citySlug && !['cote-d-ivoire', 'cote-divoire'].includes(citySlug)) {
        const places = [{ slug: citySlug, label: city }];
        if (citySlug !== 'abidjan' && isAbidjanCity(city)) places.push({ slug: 'abidjan', label: 'Abidjan' });
        for (const place of places) {
          const existing = shopsByCity.get(place.slug);
          shopsByCity.set(place.slug, { city: existing?.city || place.label, count: (existing?.count || 0) + 1 });
          if (!isShopCategory(shop.category)) continue;
          const key = `${place.slug}:${shop.category}`;
          const localExisting = shopsByCityCategory.get(key);
          shopsByCityCategory.set(key, {
            city: localExisting?.city || place.label,
            citySlug: place.slug,
            category: shop.category,
            count: (localExisting?.count || 0) + 1,
          });
        }
      }
    }
  }

  for (const category of SHOP_CATEGORIES) {
    const count = shopsByCategory.get(category) || 0;
    if (count >= MINIMUM_SHOPS_PER_DISCOVERY_PAGE) pages.push(makeCategoryPage(category, count));
  }

  for (const [citySlug, group] of shopsByCity) {
    if (group.count >= MINIMUM_SHOPS_PER_DISCOVERY_PAGE) pages.push(makeCityPage(group.city, citySlug, group.count));
  }

  for (const group of shopsByCityCategory.values()) {
    if (group.count >= MINIMUM_SHOPS_PER_DISCOVERY_PAGE) {
      pages.push(makeCityCategoryPage(group.category, group.city, group.citySlug, group.count));
    }
  }

  return pages;
}

export function findPublicDiscoveryPage(path: string, shops: readonly DiscoveryShop[]): DiscoveryPage | undefined {
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return getPublicDiscoveryPages(shops).find((page) => page.path === normalizedPath);
}
