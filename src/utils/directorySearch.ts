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

export function shopMatchesDirectorySearch(shop: DirectorySearchShop, query: string, categoryLabel?: string) {
  const normalizedQuery = normalizeDirectorySearch(query);
  if (!normalizedQuery) return true;

  const searchableText = [
    shop.name,
    shop.city || '',
    shop.category || '',
    categoryLabel || '',
    shop.welcome_message || '',
    ...(shop.products_preview || []).map((product) => product.title),
  ].map(normalizeDirectorySearch).join(' ');

  return searchableText.includes(normalizedQuery);
}
