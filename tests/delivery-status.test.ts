import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELIVERY_PROGRESS_STEPS,
  DELIVERY_STATUS_LABELS,
  deliveryProgressIndex,
  getDeliveryStatusTone,
  isDeliveryCancelled,
  isDeliveryDelivered,
  isDeliveryTerminal,
} from '../src/components/deliveryStatus.tsx';

test('delivery statuses share one French label across every screen', () => {
  assert.deepEqual(Object.keys(DELIVERY_STATUS_LABELS), [
    'requested',
    'accepted',
    'to_pickup',
    'picked_up',
    'delivered',
    'cancelled',
  ]);
  assert.equal(DELIVERY_STATUS_LABELS.requested, 'En attente d’un livreur');
  assert.equal(DELIVERY_STATUS_LABELS.picked_up, 'En cours de livraison');
});

test('delivery progress follows the five-step course order', () => {
  assert.equal(DELIVERY_PROGRESS_STEPS.length, 5);
  assert.equal(deliveryProgressIndex('requested'), 0);
  assert.equal(deliveryProgressIndex('accepted'), 1);
  assert.equal(deliveryProgressIndex('to_pickup'), 2);
  assert.equal(deliveryProgressIndex('picked_up'), 3);
  assert.equal(deliveryProgressIndex('delivered'), 4);
});

test('an unknown status falls back to the first step instead of breaking the progress bar', () => {
  assert.equal(deliveryProgressIndex('mystery'), 0);
  assert.equal(getDeliveryStatusTone('mystery'), 'neutral');
});

test('a cancelled course has no progress and is terminal', () => {
  assert.equal(deliveryProgressIndex('cancelled'), -1);
  assert.equal(isDeliveryCancelled('cancelled'), true);
  assert.equal(isDeliveryDelivered('cancelled'), false);
  assert.equal(isDeliveryTerminal('cancelled'), true);
  assert.equal(getDeliveryStatusTone('cancelled'), 'cancelled');
});

test('delivery tones distinguish waiting, active and delivered courses', () => {
  assert.equal(getDeliveryStatusTone('requested'), 'waiting');
  assert.equal(getDeliveryStatusTone('accepted'), 'active');
  assert.equal(getDeliveryStatusTone('to_pickup'), 'active');
  assert.equal(getDeliveryStatusTone('picked_up'), 'active');
  assert.equal(getDeliveryStatusTone('delivered'), 'done');
  assert.equal(isDeliveryDelivered('delivered'), true);
  assert.equal(isDeliveryTerminal('delivered'), true);
  assert.equal(isDeliveryTerminal('picked_up'), false);
});
