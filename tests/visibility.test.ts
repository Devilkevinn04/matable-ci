import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShopRecord } from '../server/types';
import { getShopVisibilityScore, rankShopsByVisibility } from '../server/services/visibility';
import { canReceiveShopOrders, canUseSubscriptionFeature, getSubscriptionState, isShopPubliclyVisible } from '../server/services/businessRules';
import {
  getSubscriptionAnalyticsDayLimit,
  getSubscriptionPrice,
  getSubscriptionProductLimit,
  getSubscriptionProductPhotoLimit,
  isSubscriptionFeatureIncluded,
  addCalendarMonths,
  TRIAL_CATALOG_LIMIT,
  TRIAL_DURATION_MONTHS,
} from '../src/utils/subscriptionFeatures';
import { isFeatureAllowed } from '../src/utils/themePresets';

function makeShop(id: number, overrides: Partial<ShopRecord> = {}): ShopRecord {
  return {
    id,
    name: `Boutique ${id}`,
    slug: `boutique-${id}`,
    whatsapp_number: '+2250700000000',
    pin_code_hash: 'hash',
    theme_color: '#176b55',
    welcome_message: '',
    is_open: true,
    is_active: true,
    last_notification_sent_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    category: 'fashion',
    theme_config: {
      primary_color: '#176b55',
      secondary_color: '#ffffff',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'grid_portrait',
    },
    ...overrides,
  };
}

test('visibility score rewards only active paid tiers and useful shop content', () => {
  const now = Date.parse('2026-10-03T00:00:00.000Z');
  const trialPro = makeShop(1, { selected_subscription_tier: 'pro', subscription_status: 'trialing' });
  const paidPremium = makeShop(2, { selected_subscription_tier: 'premium', subscription_status: 'active' });
  const paidPro = makeShop(3, { selected_subscription_tier: 'pro', subscription_status: 'active' });

  assert.equal(getShopVisibilityScore(trialPro, 0, now), 0);
  assert.equal(getShopVisibilityScore(paidPremium, 0, now), 30);
  assert.equal(getShopVisibilityScore(paidPro, 0, now), 60);
  assert.equal(getShopVisibilityScore(makeShop(4), 1, now), 52);
  assert.equal(getShopVisibilityScore(makeShop(5), 100, now), 90);
});

test('visibility adds free improvements and active featuring without exposing the score', () => {
  const now = Date.parse('2026-10-03T00:00:00.000Z');
  const shop = makeShop(1, {
    featured_until: new Date(now + 86400000).toISOString(),
    selected_subscription_tier: 'pro',
    subscription_status: 'active',
    created_at: new Date(now - 13 * 86400000).toISOString(),
    welcome_message: 'Bienvenue chez nous',
    opening_hours: { enabled: true, open_time: '08:00', close_time: '18:00' },
    theme_config: {
      primary_color: '#176b55',
      secondary_color: '#ffffff',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'grid_portrait',
      logo_url: 'logo.png',
      custom_banner_url: 'banner.png',
    },
  });

  assert.equal(getShopVisibilityScore(shop, 100, now), 1240);
  const ranked = rankShopsByVisibility([shop], new Map([[shop.id, 100]]), () => true, now);
  assert.equal(ranked[0].is_featured, true);
  assert.equal('score' in ranked[0], false);
});

test('open shops lead and equal visibility rotates every three hours', () => {
  const interval = 3 * 60 * 60 * 1000;
  const now = Math.floor(Date.parse('2026-10-03T00:00:00.000Z') / interval) * interval;
  const first = makeShop(1);
  const second = makeShop(2);
  const closedFeatured = makeShop(3, { is_open: false, featured_until: new Date(now + interval).toISOString() });
  const shops = [first, second, closedFeatured];
  const isOpen = (shop: ShopRecord) => shop.is_open;

  const initial = rankShopsByVisibility(shops, new Map(), isOpen, now);
  const rotated = rankShopsByVisibility(shops, new Map(), isOpen, now + interval);
  assert.deepEqual(initial.map(({ shop }) => shop.id), [1, 2, 3]);
  assert.deepEqual(rotated.map(({ shop }) => shop.id), [2, 1, 3]);
});

test('subscription features follow the selected tier and are disabled after expiry', () => {
  const now = Date.parse('2026-10-03T00:00:00.000Z');
  const standard = makeShop(1, { selected_subscription_tier: 'standard', subscription_status: 'active' });
  const premiumTrial = makeShop(2, {
    selected_subscription_tier: 'premium',
    subscription_status: 'trialing',
    trial_start: new Date(now - 86400000).toISOString(),
    trial_end: new Date(now + 86400000).toISOString(),
  });
  const pro = makeShop(3, { selected_subscription_tier: 'pro', subscription_status: 'active' });
  const expiredPro = makeShop(4, {
    selected_subscription_tier: 'pro',
    subscription_status: 'active',
    subscription_expires_at: new Date(now - 1000).toISOString(),
  });

  assert.equal(canUseSubscriptionFeature(standard, 'custom_branding', new Date(now)), false);
  assert.equal(canUseSubscriptionFeature(premiumTrial, 'custom_branding', new Date(now)), false);
  assert.equal(canUseSubscriptionFeature(premiumTrial, 'advanced_analytics', new Date(now)), false);
  assert.equal(canUseSubscriptionFeature(pro, 'advanced_analytics', new Date(now)), true);
  assert.equal(canUseSubscriptionFeature(expiredPro, 'custom_branding', new Date(now)), false);
});

test('shared marketing tier matrix matches server feature thresholds', () => {
  for (const feature of ['custom_branding', 'event_mode', 'social_links'] as const) {
    assert.equal(isSubscriptionFeatureIncluded('standard', feature), false);
    assert.equal(isSubscriptionFeatureIncluded('premium', feature), true);
    assert.equal(isSubscriptionFeatureIncluded('pro', feature), true);
  }
  assert.equal(isSubscriptionFeatureIncluded('standard', 'advanced_analytics'), false);
  assert.equal(isSubscriptionFeatureIncluded('premium', 'advanced_analytics'), false);
  assert.equal(isSubscriptionFeatureIncluded('pro', 'advanced_analytics'), true);
  assert.equal(isSubscriptionFeatureIncluded('standard', 'boost_discount'), false);
  assert.equal(isSubscriptionFeatureIncluded('pro', 'boost_discount'), true);

  assert.equal(isFeatureAllowed('standard', 'preset_gallery'), true);
  assert.equal(isFeatureAllowed('standard', 'custom_banner'), false);
  assert.equal(isFeatureAllowed('premium', 'custom_banner'), true);
  assert.equal(isFeatureAllowed('premium', 'event_banner'), true);
  assert.equal(isFeatureAllowed('standard', 'event_banner'), false);
  assert.equal(isFeatureAllowed('pro', 'advanced_css'), true);
});

test('trial limits and annual subscription prices match the published offer', () => {
  assert.equal(TRIAL_DURATION_MONTHS, 2);
  assert.equal(addCalendarMonths(new Date('2026-01-31T12:00:00.000Z'), TRIAL_DURATION_MONTHS), '2026-03-31');
  assert.equal(addCalendarMonths(new Date('2026-12-31T12:00:00.000Z'), TRIAL_DURATION_MONTHS), '2027-02-28');
  assert.equal(TRIAL_CATALOG_LIMIT, 2);
  assert.equal(getSubscriptionProductLimit('standard'), 20);
  assert.equal(getSubscriptionProductLimit('premium'), Number.POSITIVE_INFINITY);
  assert.equal(getSubscriptionProductLimit('pro'), Number.POSITIVE_INFINITY);
  assert.equal(getSubscriptionProductPhotoLimit('standard'), 2);
  assert.equal(getSubscriptionProductPhotoLimit('premium'), 5);
  assert.equal(getSubscriptionProductPhotoLimit('pro'), 6);
  assert.equal(getSubscriptionAnalyticsDayLimit('standard'), 7);
  assert.equal(getSubscriptionAnalyticsDayLimit('premium'), 30);
  assert.equal(getSubscriptionAnalyticsDayLimit('pro'), 90);
  assert.equal(getSubscriptionPrice('standard'), 3000);
  assert.equal(getSubscriptionPrice('premium'), 5000);
  assert.equal(getSubscriptionPrice('pro'), 8000);
  assert.equal(getSubscriptionPrice('standard', 'annual'), 30000);
  assert.equal(getSubscriptionPrice('premium', 'annual'), 50000);
  assert.equal(getSubscriptionPrice('pro', 'annual'), 80000);
});

test('shops remain public through the grace period, then become suspended and hidden', () => {
  const shop = makeShop(1, {
    publication_status: 'active',
    merchant_verification_status: 'verified',
    subscription_status: 'active',
    subscription_expires_at: '2026-10-03T12:00:00.000Z',
  });
  assert.equal(isShopPubliclyVisible(shop, new Date('2026-10-04T12:00:00.000Z')), true);
  assert.equal(canReceiveShopOrders(shop, new Date('2026-10-04T12:00:00.000Z')), true);
  assert.equal(getSubscriptionState(shop, new Date('2026-10-04T12:00:00.000Z')).status, 'past_due');
  assert.equal(isShopPubliclyVisible(shop, new Date('2026-10-05T23:59:59.999Z')), true);
  assert.equal(getSubscriptionState(shop, new Date('2026-10-06T00:00:00.000Z')).status, 'suspended');
  assert.equal(isShopPubliclyVisible(shop, new Date('2026-10-06T00:00:00.000Z')), false);
  assert.equal(canReceiveShopOrders(shop, new Date('2026-10-06T00:00:00.000Z')), false);
});

test('past-due and suspended subscriptions respect expiry grace regardless of KYC status', () => {
  const verified = makeShop(1, {
    publication_status: 'active',
    merchant_verification_status: 'verified',
    subscription_status: 'past_due',
    subscription_expires_at: '2026-10-03T12:00:00.000Z',
  });
  const unverified = makeShop(2, {
    publication_status: 'active',
    merchant_verification_status: 'not_required',
    subscription_status: 'past_due',
    subscription_expires_at: '2026-10-03T12:00:00.000Z',
  });
  const suspended = { ...verified, subscription_status: 'suspended' as const };
  const duringGrace = new Date('2026-10-05T12:00:00.000Z');
  const afterGrace = new Date('2026-10-06T00:00:00.000Z');

  assert.equal(isShopPubliclyVisible(verified, duringGrace), true);
  assert.equal(isShopPubliclyVisible(unverified, duringGrace), true);
  assert.equal(isShopPubliclyVisible(suspended, duringGrace), false);
  assert.equal(isShopPubliclyVisible(verified, afterGrace), false);
});

test('verified shops still need an active publication status', () => {
  const draft = makeShop(1, { publication_status: 'draft', merchant_verification_status: 'verified' });
  assert.equal(isShopPubliclyVisible(draft), false);
});