import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultSelectedModifiers, requiresShopSwitchConfirmation } from '../src/utils/cart';

test('does not ask to switch when the active basket is empty', () => {
  assert.equal(requiresShopSwitchConfirmation('shop-a', 'shop-b', 0), false);
});

test('keeps adding items without confirmation inside the same shop', () => {
  assert.equal(requiresShopSwitchConfirmation('shop-a', 'shop-a', 2), false);
});

test('asks before replacing a non-empty basket from another shop', () => {
  assert.equal(requiresShopSwitchConfirmation('shop-a', 'shop-b', 1), true);
});

test('does not preselect optional modifiers and initializes every required group', () => {
  assert.deepEqual(getDefaultSelectedModifiers([
    { required: false, options: ['Doux', 'Pimenté'] },
    { required: true, options: [{ label: 'Alloco', price_delta: 500 }, 'Attiéké'] },
    { required: true, options: [] },
    { required: true, options: ['Jus'] },
  ]), ['Alloco', 'Jus']);
});
