import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProductRecord } from '../server/types.ts';
import { getProductUnitPriceWithModifiers, getValidSelectedModifiers } from '../server/services/businessRules.ts';

const product: ProductRecord = {
  id: 1,
  shop_id: 1,
  title: 'Plat test',
  description: 'Plat de test',
  price: 2500,
  stock: 5,
  image_url: '',
  is_available: true,
  modifier_groups: [
    { name: 'Sauce', required: true, options: ['Piment', 'Doux'] },
    {
      name: 'Suppléments',
      max_selections: 1,
      options: [{ label: 'Alloco', price_delta: 500 }, { label: 'Attiéké', price_delta: 0 }],
    },
  ],
};

test('validates string and structured modifier options and applies their server-side prices', () => {
  const selected = getValidSelectedModifiers(product, ['Piment', 'Alloco', 'Attiéké', 'inconnu']);

  assert.deepEqual(selected, ['Piment', 'Alloco']);
  assert.equal(getProductUnitPriceWithModifiers(product, selected), 3000);
});

test('does not drop a selected required string modifier', () => {
  const selected = getValidSelectedModifiers(product, ['Doux']);

  assert.deepEqual(selected, ['Doux']);
});
