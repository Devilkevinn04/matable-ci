import test from 'node:test';
import assert from 'node:assert/strict';
import { findPublicDiscoveryPage, getPublicDiscoveryPages, toDiscoveryCitySlug } from '../src/utils/discoverySeo';

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
