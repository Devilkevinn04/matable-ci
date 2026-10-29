import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyShopName } from '../src/utils/shopSlug';

test('slugifies a merchant shop name for its public storefront URL', () => {
  assert.equal(slugifyShopName('Chez Mariam'), 'chez-mariam');
  assert.equal(slugifyShopName('Épicerie  d’Angré'), 'epicerie-d-angre');
  assert.equal(slugifyShopName('  Ma Table  '), 'ma-table');
});

test('keeps reserved application routes available to the platform', () => {
  for (const name of ['App', 'Admin', 'Boutiques', 'Promotions', 'Connexion', 'Livreur', 'Guide']) {
    const slug = slugifyShopName(name);
    assert.notEqual(slug, name.toLowerCase());
    assert.ok(slug.endsWith('-boutique'));
  }
});

test('falls back to a usable slug when the shop name has no latin letters or digits', () => {
  assert.equal(slugifyShopName('🍽️🔥'), 'boutique');
});
