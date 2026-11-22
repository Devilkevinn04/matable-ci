import test from 'node:test';
import assert from 'node:assert/strict';
import { cityMatchesSlug, getCityFilterOptions, findPublicDiscoveryPage, getPublicDiscoveryPages, isAbidjanCity, toDiscoveryCitySlug } from '../src/utils/discoverySeo';

test('creates category and city pages only when they have multiple public shops', () => {
  const pages = getPublicDiscoveryPages([
    { slug: 'atelier-aya', category: 'fashion', city: 'Abidjan' },
    { slug: 'wax-cocody', category: 'fashion', city: 'Abidjan' },
    { slug: 'chez-mariam', category: 'food', city: 'Yamoussoukro' },
  ]);

  assert.deepEqual(pages.map((page) => page.path), [
    '/boutiques/categorie/fashion',
    '/boutiques/ville/abidjan',
    '/boutiques/ville/abidjan/categorie/fashion',
  ]);
  assert.match(pages[0].title, /mode en Côte d’Ivoire/);
  assert.match(pages[1].description, /à Abidjan/);
  assert.match(pages[2].title, /friperies à Abidjan/);
});

test('normalizes accented city names consistently and resolves only canonical discovery URLs', () => {
  assert.equal(toDiscoveryCitySlug('Grand-Bassam'), 'grand-bassam');
  assert.equal(toDiscoveryCitySlug('Yamoussoukro'), 'yamoussoukro');
  assert.equal(toDiscoveryCitySlug('Abidjan (Cocody Angré)'), 'abidjan');

  const shops = [
    { slug: 'shop-one', category: 'crafts', city: 'Grand-Bassam' },
    { slug: 'shop-two', category: 'crafts', city: 'Grand Bassam' },
  ];
  assert.equal(findPublicDiscoveryPage('/boutiques/ville/grand-bassam', shops)?.city, 'Grand-Bassam');
  assert.equal(findPublicDiscoveryPage('/boutiques/ville/unknown', shops), undefined);

  const groupedPages = getPublicDiscoveryPages([
    { slug: 'abidjan-one', category: 'fashion', city: 'Abidjan (Cocody Angré)' },
    { slug: 'abidjan-two', category: 'food', city: 'Abidjan (Marcory Zone 4)' },
  ]);
  assert.equal(groupedPages.find((page) => page.citySlug === 'abidjan')?.shopCount, 2);
});

test('creates city and category pages only when enough matching shops exist', () => {
  const pages = getPublicDiscoveryPages([
    { slug: 'restaurant-one', category: 'food', city: 'Cocody / Abidjan' },
    { slug: 'restaurant-two', category: 'food', city: 'Cocody / Abidjan' },
    { slug: 'beauty-one', category: 'beauty', city: 'Cocody / Abidjan' },
    { slug: 'friperie-one', category: 'fashion', city: 'Yopougon' },
    { slug: 'friperie-two', category: 'fashion', city: 'Yopougon' },
  ]);

  assert.ok(pages.some((page) => page.path === '/boutiques/ville/cocody/categorie/food' && page.shopCount === 2));
  assert.ok(pages.some((page) => page.path === '/boutiques/ville/yopougon/categorie/fashion' && page.shopCount === 2));
  assert.equal(pages.some((page) => page.path === '/boutiques/ville/cocody/categorie/beauty'), false);
  assert.equal(findPublicDiscoveryPage('/boutiques/ville/cocody/categorie/food', [
    { slug: 'restaurant-one', category: 'food', city: 'Cocody' },
    { slug: 'restaurant-two', category: 'food', city: 'Cocody' },
  ])?.heading, 'Restaurants à Cocody');
});

test('Abidjan includes its communes, without absorbing other cities', () => {
  for (const city of ['Abidjan', 'Cocody', 'Abobo', 'Port-Bouët', 'Abidjan · Cocody', 'cocody angré']) assert.equal(isAbidjanCity(city), true, city);
  for (const city of ['Bouaké', 'Yamoussoukro', 'Grand-Bassam', 'Autre ville / commune', '']) assert.equal(isAbidjanCity(city), false, city);
  assert.equal(cityMatchesSlug('Cocody', 'abidjan'), true);
  assert.equal(cityMatchesSlug('Cocody', 'cocody'), true);
  assert.equal(cityMatchesSlug('Abidjan', 'cocody'), false);
  assert.equal(cityMatchesSlug('Bouaké', 'abidjan'), false);
  const pages = getPublicDiscoveryPages([
    { slug: 'a', category: 'food', city: 'Cocody' },
    { slug: 'b', category: 'food', city: 'Abobo' },
    { slug: 'c', category: 'beauty', city: 'Abidjan' },
  ]);
  const abidjan = pages.find((page) => page.path === '/boutiques/ville/abidjan');
  assert.equal(abidjan?.shopCount, 3);
  assert.equal(abidjan?.city, 'Abidjan');
  assert.equal(pages.find((page) => page.path === '/boutiques/ville/abidjan/categorie/food')?.shopCount, 2);
});

test('city filters offer every commune plus all of Abidjan', () => {
  assert.deepEqual(getCityFilterOptions(['Cocody', 'Abidjan', 'Abobo', 'Cocody', undefined, 'Bouaké']), [
    { value: 'abidjan', label: 'Abidjan (toutes)' },
    { value: 'abobo', label: 'Abobo' },
    { value: 'bouake', label: 'Bouaké' },
    { value: 'cocody', label: 'Cocody' },
  ]);
  assert.deepEqual(getCityFilterOptions(['Abidjan']), [{ value: 'abidjan', label: 'Abidjan' }]);
});
