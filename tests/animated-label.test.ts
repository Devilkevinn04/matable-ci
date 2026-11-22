import assert from 'node:assert/strict';
import test from 'node:test';
import { interpolateLabel, parseLabel } from '../src/utils/animatedLabel.ts';
import { getCartItemKey } from '../src/components/useCustomerCart.ts';
import type { Product } from '../src/types.ts';

const plain = (value: string | null) => value?.replace(/[  ]/g, ' ');

test('un libellé chiffré évolue puis se termine sur le texte exact reçu', () => {
  assert.equal(plain(interpolateLabel('1 000 FCFA', '2 000 FCFA', 0.5)), '1 500 FCFA');
  assert.equal(interpolateLabel('1 000 FCFA', '2 000 FCFA', 1), '2 000 FCFA');
  assert.equal(plain(interpolateLabel('2,0 %', '4,0 %', 0.5)), '3,0 %');
  assert.equal(plain(interpolateLabel('3', '-1', 0.5)), '1');
  assert.equal(plain(interpolateLabel('12500', '13500', 0.5)), '13 000');
});

test('un chargement part de zéro', () => {
  assert.equal(plain(interpolateLabel('…', '40 points', 0.5)), '20 points');
});

test('un texte sans mesure comparable s’affiche d’un coup', () => {
  assert.equal(interpolateLabel('10', '22/11/2026', 0.5), null);
  assert.equal(interpolateLabel('10 FCFA', '10 %', 0.5), null);
  assert.equal(interpolateLabel('10', '…', 0.5), null);
  assert.equal(interpolateLabel('Aucun', '3', 0.5), null);
  assert.equal(parseLabel('3 sur 10'), null);
});

test('une ligne de panier garde la même clé, sauf si ses options changent', () => {
  const product = { id: 7 } as Product;
  assert.equal(getCartItemKey({ product }), getCartItemKey({ product, selected_modifiers: [] }));
  assert.notEqual(getCartItemKey({ product, selected_size: 'M' }), getCartItemKey({ product, selected_color: 'M' }));
  assert.notEqual(getCartItemKey({ product, selected_modifiers: ['Piment'] }), getCartItemKey({ product }));
});
