import test from 'node:test';
import assert from 'node:assert/strict';
import { findOrderShopCorrections, parseOrderItems } from '../scripts/repair-order-shop-attribution.ts';

test('parses PostgreSQL JSON and SQLite-compatible serialized order items', () => {
  const items = [{ product_id: 12 }];
  assert.deepEqual(parseOrderItems(items), items);
  assert.deepEqual(parseOrderItems(JSON.stringify(items)), items);
  assert.equal(parseOrderItems('{invalid json'), null);
  assert.equal(parseOrderItems(null), null);
});

test('repairs only orders whose products all belong to one different existing shop', () => {
  const result = findOrderShopCorrections([
    { id: 1, shop_id: 10, items: [{ product_id: 100 }, { product_id: 101 }] },
    { id: 2, shop_id: 10, items: [{ product_id: 102 }] },
    { id: 3, shop_id: 10, items: [{ product_id: 103 }, { product_id: 104 }] },
    { id: 4, shop_id: 10, items: [] },
    { id: 5, shop_id: 10, items: [{ product_id: 999 }] },
    { id: 6, shop_id: 10, items: [{ product_id: 'bad' }] },
    { id: 7, shop_id: 10, items: '{invalid' },
  ], [
    { id: 100, shop_id: 20 },
    { id: 101, shop_id: 20 },
    { id: 102, shop_id: 10 },
    { id: 103, shop_id: 20 },
    { id: 104, shop_id: 30 },
  ], new Set([10, 20, 30]));

  assert.deepEqual(result.candidates, [{ orderId: 1, previousShopId: 10, expectedShopId: 20 }]);
  assert.deepEqual(result.skipped, [
    { orderId: 3, reason: 'multiple_product_shops' },
    { orderId: 4, reason: 'empty_items' },
    { orderId: 5, reason: 'missing_product' },
    { orderId: 6, reason: 'invalid_items' },
    { orderId: 7, reason: 'invalid_items' },
  ]);
});

test('does not repair an order when its product owner shop no longer exists', () => {
  const result = findOrderShopCorrections(
    [{ id: 1, shop_id: 10, items: [{ product_id: 100 }] }],
    [{ id: 100, shop_id: 20 }],
    new Set([10]),
  );

  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.skipped, [{ orderId: 1, reason: 'missing_shop' }]);
});
