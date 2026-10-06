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
  ]);
  assert.match(pages[0].title, /mode en Côte d’Ivoire/);
  assert.match(pages[1].description, /à Abidjan/);
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
