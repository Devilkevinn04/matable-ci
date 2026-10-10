import test from 'node:test';
import assert from 'node:assert/strict';
import { isAgeRestrictedProduct, isAtLeastAge } from '../src/utils/ageRestrictedProducts.ts';

test('identifies tobacco and nicotine products without matching ordinary goods', () => {
  assert.equal(isAgeRestrictedProduct({ title: 'Puff rechargeable', description: '' }), true);
  assert.equal(isAgeRestrictedProduct({ title: 'Cigarette électronique', description: '' }), true);
  assert.equal(isAgeRestrictedProduct({ title: 'Huile essentielle', description: 'Sans nicotine' }), true);
  assert.equal(isAgeRestrictedProduct({ title: 'Jus de gingembre', description: 'Fait maison' }), false);
});

test('checks the eighteenth birthday using calendar dates and rejects invalid dates', () => {
  const today = new Date(2026, 9, 10);
  assert.equal(isAtLeastAge('2008-10-10', 18, today), true);
  assert.equal(isAtLeastAge('2008-10-11', 18, today), false);
  assert.equal(isAtLeastAge('2009-02-01', 18, today), false);
  assert.equal(isAtLeastAge('2008-02-30', 18, today), false);
  assert.equal(isAtLeastAge('', 18, today), false);
});
