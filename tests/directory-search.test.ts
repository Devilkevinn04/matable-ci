import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearchWords, normalizeDirectorySearch, shopMatchesDirectorySearch } from '../src/utils/directorySearch.ts';
import { suggestSearch } from '../src/utils/searchSuggestion.ts';

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

test('search matches every word separately, without accents, order or plural', () => {
  const text = ['Poulet', 'Poulet braisé accompagné d’alloco/ frite', 'Les saveurs de chez nous', 'Cocody'];
  assert.equal(matchesSearchWords(text, 'poulet braise'), true);
  assert.equal(matchesSearchWords(text, 'braisé poulet'), true);
  assert.equal(matchesSearchWords(text, 'alloco'), true);
  assert.equal(matchesSearchWords(text, 'poulets à Cocody'), true);
  assert.equal(matchesSearchWords(['Crêpes caramel'], 'crepe'), true);
  assert.equal(matchesSearchWords(['Crêpe fleurs'], 'crêpes'), true);
  assert.equal(matchesSearchWords(text, 'poulet yassa'), false);
  assert.equal(matchesSearchWords(['Commode en bois'], 'mode'), false);
  assert.equal(matchesSearchWords(text, '  '), true);
  assert.equal(matchesSearchWords(text, 'à la'), true);
});

test('searching Abidjan finds shops located in its communes', () => {
  assert.equal(shopMatchesDirectorySearch({ name: 'Crêpes', city: 'Cocody' }, 'abidjan'), true);
  assert.equal(shopMatchesDirectorySearch({ name: 'Crêpes', city: 'Bouaké' }, 'abidjan'), false);
});

test('a typo suggests the catalogue word one letter away, and nothing otherwise', () => {
  const catalogue = ['Poulet mayo', 'Crêpes caramel', 'Savon noir'];
  assert.equal(suggestSearch('poulte', catalogue), 'poulet');
  assert.equal(suggestSearch('poulett', catalogue), 'poulet');
  assert.equal(suggestSearch('savn noir', catalogue), 'savon noir');
  assert.equal(suggestSearch('crepse', catalogue), 'crepe');
  assert.equal(suggestSearch('poulet', catalogue), null);
  assert.equal(suggestSearch('ordinateur', catalogue), null);
  assert.equal(suggestSearch('zz', catalogue), null);
});
