import test from 'node:test';
import assert from 'node:assert/strict';
import { getHomeSections, orderHomeProducts } from '../src/utils/homeProducts.ts';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const product = (id: number, shop: string, extra: Record<string, unknown> = {}) => ({
  id, title: `P${id}`, price: 1000, stock: 5, image_url: '/media/products/1/0-x.jpg', created_at: '2026-01-01T00:00:00Z',
  shop: { slug: shop }, ...extra,
});

test('open shops come first, then products with a photo, then the feed order', () => {
  const ordered = orderHomeProducts(
    [product(1, 'fermee'), product(2, 'a', { image_url: '' }), product(3, 'b'), product(4, 'a')],
    new Set(['a', 'b']),
  );
  assert.deepEqual(ordered.map(({ id }) => id), [3, 4, 2, 1]);
});

test('no shop shows more than two products in a row while others are available', () => {
  const ordered = orderHomeProducts(
    [product(1, 'a'), product(2, 'a'), product(3, 'a'), product(4, 'a'), product(5, 'b'), product(6, 'c')],
    new Set(['a', 'b', 'c']),
  );
  assert.deepEqual(ordered.map(({ id }) => id), [1, 2, 5, 3, 4, 6]);
  assert.equal(orderHomeProducts([product(1, 'a'), product(2, 'a'), product(3, 'a')], new Set(['a'])).length, 3);
});

test('conditional sections appear only past their threshold and never repeat a product', () => {
  const promo = product(1, 'a', { sale_price: 800, sale_starts_at: '2026-11-01T00:00:00Z', sale_ends_at: '2026-12-01T00:00:00Z' });
  const recent = [2, 3, 4, 5].map((id) => product(id, 'b', { created_at: '2026-11-20T00:00:00Z' }));
  const full = getHomeSections([promo, ...recent, product(6, 'c')], NOW);
  assert.deepEqual(full.promotions.map(({ id }) => id), [1]);
  assert.deepEqual(full.newest.map(({ id }) => id), [2, 3, 4, 5]);
  assert.deepEqual(full.grid.map(({ id }) => id), [6]);
  const thin = getHomeSections([...recent.slice(0, 3), product(6, 'c')], NOW);
  assert.deepEqual(thin.promotions, []);
  assert.deepEqual(thin.newest, []);
  assert.equal(thin.grid.length, 4);
});

test('the grid is never emptied by the conditional sections', () => {
  const onlyRecent = [1, 2, 3, 4].map((id) => product(id, 'b', { created_at: '2026-11-20T00:00:00Z' }));
  const sections = getHomeSections(onlyRecent, NOW);
  assert.equal(sections.grid.length, 4);
  assert.deepEqual(sections.newest, []);
});
