import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MerchantBoostPurchase } from '../src/components/MerchantDashboard/MerchantBoostPurchase';
import { findEarliestBoostStart, getBoostCapacityScope } from '../server/services/boosts.ts';
import { getBoostPrice } from '../src/utils/boostPricing.ts';
import type { Shop } from '../src/types';

const shop: Shop = {
  id: 12,
  name: 'Atelier Awa',
  slug: 'atelier-awa',
  whatsapp_number: '+2250700000000',
  pin_code_hash: '',
  theme_color: '#176b55',
  welcome_message: null,
  is_open: true,
  is_active: true,
  merchant_verification_status: 'verified',
  last_notification_sent_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  category: 'fashion',
  city: 'Abidjan',
  theme_config: {
    primary_color: '#176b55',
    secondary_color: '#f0ba80',
    font_family: 'Plus Jakarta Sans',
    layout_style: 'grid_portrait',
  },
};

test('boost prices apply the Pro discount and reject unsupported durations', () => {
  assert.equal(getBoostPrice(1, false), 1000);
  assert.equal(getBoostPrice(3, false), 1500);
  assert.equal(getBoostPrice(7, false), 2000);
  assert.equal(getBoostPrice(1, true), 850);
  assert.equal(getBoostPrice(3, true), 1275);
  assert.equal(getBoostPrice(7, true), 1700);
  assert.equal(getBoostPrice(15, false), null);
});

test('merchant boost prices use the standard FCFA currency format', () => {
  const html = renderToStaticMarkup(
    React.createElement(MerchantBoostPurchase, { shop, productCount: 2 }),
  ).replace(/\s+/g, ' ');

  assert.match(html, /24 h · 1 000 FCFA/);
  assert.match(html, /3 jours · 1 500 FCFA/);
  assert.match(html, /Payer 2 000 FCFA avec GeniusPay/);
  assert.doesNotMatch(html, /\d F(?:<|$)/);
});

test('boost scheduling starts immediately when fewer than five intervals overlap', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const intervals = Array.from({ length: 4 }, (_, index) => ({
    starts_at: new Date(now.getTime() - 86400000).toISOString(),
    ends_at: new Date(now.getTime() + 10 * 86400000 + index * 86400000).toISOString(),
  }));

  assert.equal(findEarliestBoostStart(intervals, 7, now).toISOString(), now.toISOString());
});

test('boost scheduling finds the first time one of five occupied slots expires', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const intervals = Array.from({ length: 5 }, (_, index) => ({
    starts_at: new Date(now.getTime() - 86400000).toISOString(),
    ends_at: new Date(now.getTime() + (index + 7) * 86400000).toISOString(),
  }));

  assert.equal(
    findEarliestBoostStart(intervals, 7, now).toISOString(),
    new Date(now.getTime() + 7 * 86400000).toISOString(),
  );
});

test('boost placements have separate capacity scopes', () => {
  assert.equal(getBoostCapacityScope('home', 'abidjan', 'beauty').lockKey, 'boost:placement:home');
  assert.deepEqual(getBoostCapacityScope('category', 'abidjan', 'beauty').params, ['category', 'beauty']);
  assert.deepEqual(getBoostCapacityScope('city', 'abidjan', 'beauty').params, ['city', 'abidjan']);
});
