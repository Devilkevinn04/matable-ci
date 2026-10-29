const RESERVED_SHOP_SLUGS = new Set([
  'app',
  'admin',
  'api',
  'boutiques',
  'promotions',
  'commercants',
  'comment-ca-marche',
  'faq',
  'guide',
  'connexion',
  'inscription',
  'compte',
  'livreur',
  'recuperation-acces',
  'mentions-legales',
  'confidentialite',
  'cgu',
  'cookies',
  '__preview',
]);

export function slugifyShopName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return 'boutique';
  return RESERVED_SHOP_SLUGS.has(slug) ? `${slug}-boutique` : slug;
}
