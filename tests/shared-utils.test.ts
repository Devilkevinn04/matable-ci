import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../src/utils/escapeHtml.ts';
import { normalizeCustomerPhone } from '../src/utils/normalizeCustomerPhone.ts';

test('normalizes customer phones to the Côte d’Ivoire country code', () => {
  assert.equal(normalizeCustomerPhone('07 12 34 56 78'), '+2250712345678');
  assert.equal(normalizeCustomerPhone('225 07 12 34 56 78'), '+2250712345678');
  assert.equal(normalizeCustomerPhone('+225 07 12 34 56 78'), '+2250712345678');
});

test('escapes HTML text and tolerates empty values', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#039;');
  assert.equal(escapeHtml(null), '');
});
