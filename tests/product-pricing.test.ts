import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveProductPrice, getProductSaleStatus, validateProductSale } from '../src/utils/productPricing.ts';

test('applies a valid product sale only inside its scheduled period', () => {
  const product = {
    price: 10000,
    sale_price: 7500,
    sale_starts_at: '2026-10-26T10:00:00.000Z',
    sale_ends_at: '2026-10-27T10:00:00.000Z',
  };

  assert.equal(getActiveProductPrice(product, Date.parse('2026-10-26T09:59:59.000Z')), 10000);
  assert.equal(getActiveProductPrice(product, Date.parse('2026-10-26T10:00:00.000Z')), 7500);
  assert.equal(getActiveProductPrice(product, Date.parse('2026-10-27T10:00:00.000Z')), 10000);
  assert.equal(getProductSaleStatus(product, Date.parse('2026-10-26T09:59:59.000Z')), 'scheduled');
  assert.equal(getProductSaleStatus(product, Date.parse('2026-10-26T10:00:00.000Z')), 'active');
  assert.equal(getProductSaleStatus(product, Date.parse('2026-10-27T10:00:00.000Z')), 'expired');
  assert.equal(getProductSaleStatus({ price: 10000 }), 'none');
  assert.equal(getProductSaleStatus({ ...product, sale_ends_at: 'not-a-date' }), 'invalid');
});

test('validates sale price and date range and normalizes accepted values', () => {
  assert.deepEqual(
    validateProductSale(10000, '7500', '2026-10-26T10:00:00.000Z', '2026-10-27T10:00:00.000Z'),
    {
      sale_price: 7500,
      sale_starts_at: '2026-10-26T10:00:00.000Z',
      sale_ends_at: '2026-10-27T10:00:00.000Z',
    },
  );
  assert.equal(validateProductSale(10000, 10000, '2026-10-26T10:00:00.000Z', '2026-10-27T10:00:00.000Z'), null);
  assert.equal(validateProductSale(10000, 7500, '2026-10-27T10:00:00.000Z', '2026-10-26T10:00:00.000Z'), null);
  assert.equal(validateProductSale(10000, 7500, '', '2026-10-27T10:00:00.000Z'), null);
  assert.deepEqual(validateProductSale(10000, null, null, null), {
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
  });
});
