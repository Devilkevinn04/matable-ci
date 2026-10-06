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
    title: `${heading} | MaTable.ci`,
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
    title: `${heading} | MaTable.ci`,
    description: `Découvrez les boutiques et commerces locaux à ${city}, consultez leurs vitrines et contactez directement les commerçants sur WhatsApp.`,
    heading,
    city,
    citySlug,
    shopCount,
  };
}

export function getPublicDiscoveryPages(shops: readonly DiscoveryShop[]): DiscoveryPage[] {
  const pages: DiscoveryPage[] = [];
  const shopsByCategory = new Map<ShopCategory, number>();
  const shopsByCity = new Map<string, { city: string; count: number }>();

  for (const shop of shops) {
    if (isShopCategory(shop.category)) {
      shopsByCategory.set(shop.category, (shopsByCategory.get(shop.category) || 0) + 1);
    }
    const city = shop.city ? getDiscoveryCityLabel(shop.city) : '';
    if (city) {
      const citySlug = toDiscoveryCitySlug(city);
      if (citySlug && !['cote-d-ivoire', 'cote-divoire'].includes(citySlug)) {
        const existing = shopsByCity.get(citySlug);
        shopsByCity.set(citySlug, { city: existing?.city || city, count: (existing?.count || 0) + 1 });
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

  return pages;
}

export function findPublicDiscoveryPage(path: string, shops: readonly DiscoveryShop[]): DiscoveryPage | undefined {
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return getPublicDiscoveryPages(shops).find((page) => page.path === normalizedPath);
}
