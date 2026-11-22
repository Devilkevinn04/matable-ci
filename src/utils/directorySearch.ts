import { isAbidjanCity } from './discoverySeo';

export interface DirectorySearchProduct {
  title: string;
}

export interface DirectorySearchShop {
  name: string;
  city?: string;
  category?: string;
  welcome_message?: string | null;
  products_preview?: DirectorySearchProduct[];
}

export function normalizeDirectorySearch(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-CI')
    .trim()
    .replace(/\s+/g, ' ');
}

const STOP_WORDS = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'un', 'une']);

export function toSearchWords(value: string): string[] {
  return normalizeDirectorySearch(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    // Le pluriel simple ne doit pas empêcher de trouver un article.
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, '') : word));
}

/** Chaque mot cherché doit commencer un mot du texte, sans tenir compte de l’ordre ni des accents. */
export function matchesSearchWords(texts: readonly (string | null | undefined)[], query: string): boolean {
  const wanted = toSearchWords(query).filter((word) => !STOP_WORDS.has(word));
  if (wanted.length === 0) return true;
  const words = texts.flatMap((text) => toSearchWords(text || ''));
  return wanted.every((word) => words.some((candidate) => candidate.startsWith(word)));
}

/** Une commune d’Abidjan se retrouve aussi en cherchant « Abidjan ». */
export function getSearchableCity(city: string | null | undefined): string {
  return isAbidjanCity(city) ? `${city} Abidjan` : city || '';
}

export function shopMatchesDirectorySearch(shop: DirectorySearchShop, query: string, categoryLabel?: string) {
  return matchesSearchWords([
    shop.name,
    getSearchableCity(shop.city),
    shop.category,
    categoryLabel,
    shop.welcome_message,
    ...(shop.products_preview || []).map((product) => product.title),
  ], query);
}
