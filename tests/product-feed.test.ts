import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateProductsById } from '../src/utils/productFeed.ts';

test('feed pagination keeps the first card when a product id repeats', () => {
  const first = { id: 12, title: 'Poulet braisé', source: 'page 1' };
  const duplicate = { id: 12, title: 'Poulet braisé', source: 'page 2' };
  const next = { id: 18, title: 'Jus de gingembre', source: 'page 2' };

  assert.deepEqual(deduplicateProductsById([first, duplicate, next]), [first, next]);
});

test('feed de-duplication does not merge separate product records with the same name', () => {
  const first = { id: 12, title: 'Poulet', shopId: 4 };
  const second = { id: 19, title: 'Poulet', shopId: 4 };

  assert.deepEqual(deduplicateProductsById([first, second]), [first, second]);
});
