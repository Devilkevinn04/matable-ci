import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShopEventType, SHOP_EVENT_TYPES, SHOP_EVENT_VISUALS } from '../src/utils/shopEventVisuals.ts';

test('each commercial operation has a distinct visible label, icon, and color treatment', () => {
  const visuals = SHOP_EVENT_TYPES.map((type) => SHOP_EVENT_VISUALS[type]);
  assert.equal(SHOP_EVENT_TYPES.length, 6);
  assert.ok(visuals.every((visual) => visual.label && visual.icon && visual.badgeClass && visual.bannerClass && visual.suggestion));
  assert.equal(new Set(visuals.map((visual) => visual.label)).size, SHOP_EVENT_TYPES.length);
  assert.equal(new Set(visuals.map((visual) => visual.bannerClass)).size, SHOP_EVENT_TYPES.length);
});

test('normalizes unknown legacy event types to a safe custom visual', () => {
  assert.equal(normalizeShopEventType('flash_sale'), 'flash_sale');
  assert.equal(normalizeShopEventType('unrecognized'), 'custom');
  assert.equal(normalizeShopEventType(null), 'custom');
});
