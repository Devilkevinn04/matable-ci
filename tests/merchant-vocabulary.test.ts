import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_CATEGORIES } from '../src/utils/categoryDefaults';
import { getMerchantVocabulary } from '../src/utils/merchantVocabulary';

test('chaque catégorie a un vocabulaire complet', () => {
  for (const category of SHOP_CATEGORIES) {
    const v = getMerchantVocabulary(category);
    assert.ok(v.catalogTitle && v.addItem && v.addFirstItem && v.editItem && v.soldOutFilter);
    assert.match(v.soldOutChip(2), /^2 /);
  }
});

test('restauration et services parlent leur langue', () => {
  const food = getMerchantVocabulary('food');
  assert.equal(food.addItem, 'Ajouter un plat');
  assert.equal(food.soldOutChip(1), '1 plat plus disponible');
  assert.equal(getMerchantVocabulary('services').addItem, 'Ajouter une prestation');
  assert.equal(getMerchantVocabulary('services').soldOutBadge, 'Complet');
});

test('accord au féminin', () => {
  assert.equal(getMerchantVocabulary('crafts').soldOutChip(1), '1 création épuisée');
  assert.equal(getMerchantVocabulary('crafts').soldOutChip(2), '2 créations épuisées');
});

test('catégorie inconnue : vocabulaire générique', () => {
  const v = getMerchantVocabulary('zzz');
  assert.equal(v.addItem, 'Ajouter un article');
  assert.equal(v.soldOutChip(2), '2 articles épuisés');
  assert.equal(v.lowStockChip(1), '1 stock bas');
});
