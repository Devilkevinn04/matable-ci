import assert from 'node:assert/strict';
import test from 'node:test';
import { CLEARED_FILTERS, filterCatalogProducts, getCategoryFacets, getPriceOptions, readCatalogFilters, writeCatalogFilters } from '../src/utils/catalogFilters.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const product = (id: number, category: string, city: string, price: number, extra: Record<string, unknown> = {}) => ({ id, price, created_at: `2026-11-${String(id).padStart(2, '0')}T00:00:00Z`, shop: { slug: `s${id}`, category, city }, ...extra });
const products = [product(1, 'food', 'Cocody', 1500), product(2, 'food', 'Abobo', 6000), product(3, 'beauty', 'Cocody', 12000), product(4, 'beauty', 'Bouaké', 4000)];
const read = (query: string) => readCatalogFilters(new URLSearchParams(query));
const ids = (query: string, closed = new Set<string>()) => filterCatalogProducts(products, read(query), closed, NOW).map(({ id }) => id);

test('les filtres se combinent', () => {
  assert.deepEqual(ids(''), [1, 2, 3, 4]);
  assert.deepEqual(ids('categorie=food&commune=cocody'), [1]);
  assert.deepEqual(ids('commune=abidjan'), [1, 2, 3]);
  assert.deepEqual(ids('prix=5000'), [1, 4]);
  assert.deepEqual(ids('ouvertes=1', new Set(['s1', 's4'])), [2, 3]);
  assert.deepEqual(ids('tri=price'), [1, 4, 2, 3]);
  assert.deepEqual(ids('tri=newest'), [4, 3, 2, 1]);
});

test('le prix promotionnel compte pour le filtre de prix', () => {
  const sale = product(9, 'food', 'Cocody', 9000, { sale_price: 4500, sale_starts_at: '2026-11-01T00:00:00Z', sale_ends_at: '2026-12-01T00:00:00Z' });
  assert.equal(filterCatalogProducts([sale], read('prix=5000'), new Set(), NOW).length, 1);
});

test('le nombre d’une catégorie tient compte des autres filtres, pas d’elle-même', () => {
  const facets = (query: string) => Object.fromEntries(getCategoryFacets(products, read(query), new Set(), NOW).map(({ value, count }) => [value, count]));
  assert.deepEqual(facets('categorie=food'), { food: 2, beauty: 2 });
  assert.deepEqual(facets('commune=abobo'), { food: 1, beauty: 0 });
  for (const [category, count] of Object.entries(facets('prix=5000'))) assert.equal(ids(`prix=5000&categorie=${category}`).length, count);
});

test('seuls les paliers de prix utiles sont proposés', () => {
  assert.deepEqual(getPriceOptions(products, NOW), [2000, 5000, 10000]);
  assert.deepEqual(getPriceOptions([products[0]], NOW), []);
});

test('l’adresse ne garde que les choix, sans toucher au reste', () => {
  const start = new URLSearchParams('q=poulet&src=qr');
  const filtered = writeCatalogFilters(start, { category: 'food', maxPrice: 5000, openOnly: true, sort: 'price' });
  assert.equal(filtered.toString(), 'q=poulet&src=qr&categorie=food&prix=5000&ouvertes=1&tri=price');
  assert.equal(writeCatalogFilters(filtered, { ...CLEARED_FILTERS, sort: 'recommended' }).toString(), 'q=poulet&src=qr');
  assert.equal(read('prix=1&ouvertes=oui').maxPrice, null);
  assert.equal(read('prix=1&ouvertes=oui').openOnly, false);
});
