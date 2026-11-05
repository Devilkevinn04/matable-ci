import test from 'node:test';
import assert from 'node:assert/strict';
import { joinModifierOption, splitModifierOption, collectReusableModifierGroups } from '../src/components/MerchantDashboard/productForm';
import { buildBulkProductPatch } from '../src/components/MerchantDashboard/bulkActions';
import type { Product } from '../src/types';

test('splits and joins option surcharges without exposing the syntax', () => {
  assert.deepEqual(splitModifierOption('Alloco (+500 F)'), { name: 'Alloco', extra: 500 });
  assert.deepEqual(splitModifierOption('Jus (+1 000 FCFA)'), { name: 'Jus', extra: 1000 });
  assert.deepEqual(splitModifierOption('Riz'), { name: 'Riz', extra: 0 });
  assert.equal(joinModifierOption('Alloco', 500), 'Alloco (+500 F)');
  assert.equal(joinModifierOption('Alloco (+500 F)', 0), 'Alloco');
  assert.equal(joinModifierOption('Alloco (+500 F)', 1000), 'Alloco (+1000 F)');
  assert.deepEqual(splitModifierOption(joinModifierOption('', 500)), { name: '', extra: 500 });
});

test('reuses option groups from other products without duplicates', () => {
  const group = { name: 'Sauce', required: false, max_selections: 2, options: [{ label: 'Douce', price_delta: 0 }] };
  const products = [
    { id: 1, modifier_groups: [group] },
    { id: 2, modifier_groups: [group] },
    { id: 3, modifier_groups: [{ ...group, name: 'Boisson' }] },
  ] as unknown as Product[];
  assert.deepEqual(collectReusableModifierGroups(products).map((item) => item.name), ['Sauce', 'Boisson']);
  assert.deepEqual(collectReusableModifierGroups(products, 3).map((item) => item.name), ['Sauce']);
});

test('plans bulk actions only for products that need a change', () => {
  const product = { price: 1000, sale_price: null, is_available: true, stock: 5 };
  assert.deepEqual(buildBulkProductPatch(product, { type: 'hide' }), { is_available: false });
  assert.equal(buildBulkProductPatch({ ...product, is_available: false }, { type: 'hide' }), null);
  assert.equal(buildBulkProductPatch(product, { type: 'show' }), null);
  assert.deepEqual(buildBulkProductPatch(product, { type: 'soldout' }), { stock: 0 });
  assert.equal(buildBulkProductPatch({ ...product, stock: 0 }, { type: 'soldout' }), null);
  assert.deepEqual(buildBulkProductPatch(product, { type: 'promo', percent: 20, days: 7 }, 1_700_000_000_000), {
    sale_price: 800,
    sale_starts_at: new Date(1_700_000_000_000 - 60_000).toISOString(),
    sale_ends_at: new Date(1_700_000_000_000 + 7 * 86_400_000).toISOString(),
  });
  assert.equal(buildBulkProductPatch(product, { type: 'clear-promo' }), null);
  assert.deepEqual(buildBulkProductPatch({ ...product, sale_price: 800 }, { type: 'clear-promo' }), { sale_price: null, sale_starts_at: null, sale_ends_at: null });
});
