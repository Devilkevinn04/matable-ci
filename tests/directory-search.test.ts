import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDirectorySearch, shopMatchesDirectorySearch } from '../src/utils/directorySearch.ts';

const shop = {
  name: 'Chez Awa',
  city: 'Abidjan Cocody',
  category: 'food',
  welcome_message: 'Cuisine ivoirienne faite maison',
  products_preview: [
    { title: 'Attiéké poisson braisé' },
    { title: 'Alloco pimenté' },
  ],
};

test('normalizes accents, casing and repeated whitespace in public search', () => {
  assert.equal(normalizeDirectorySearch('  ATTIKÉ   Poisson '), 'attike poisson');
});

test('public search matches shop names, product previews, city, welcome text and category labels', () => {
  assert.equal(shopMatchesDirectorySearch(shop, 'Chez Awa'), true);
  assert.equal(shopMatchesDirectorySearch(shop, 'Attieke'), true);
  assert.equal(shopMatchesDirectorySearch(shop, 'cocody'), true);
  assert.equal(shopMatchesDirectorySearch(shop, 'maison'), true);
  assert.equal(shopMatchesDirectorySearch(shop, 'restauration', 'Restauration'), true);
});

test('empty search matches every shop and unknown text does not match', () => {
  assert.equal(shopMatchesDirectorySearch(shop, '   '), true);
  assert.equal(shopMatchesDirectorySearch(shop, 'bijoux à bassam'), false);
});
