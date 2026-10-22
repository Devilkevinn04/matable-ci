import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionPlanBenefits,
  getSubscriptionProductLimit,
  parseSubscriptionProFeatures,
} from '../src/utils/subscriptionFeatures.ts';
import { getSubscriptionState } from '../server/services/businessRules.ts';
import { getBoostPrice } from '../src/utils/boostPricing.ts';

test('subscription feature configuration validates bounded limits', () => {
  assert.deepEqual(parseSubscriptionProFeatures(DEFAULT_SUBSCRIPTION_PRO_FEATURES), DEFAULT_SUBSCRIPTION_PRO_FEATURES);
  assert.throws(() => parseSubscriptionProFeatures({ ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, productPhotoLimit: 21 }));
  assert.throws(() => parseSubscriptionProFeatures({ ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, analyticsDayLimit: 0 }));
  assert.throws(() => parseSubscriptionProFeatures({ ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, boostDiscountPercent: 101 }));
  assert.throws(() => parseSubscriptionProFeatures({ ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, productLimit: 0 }));
});

test('Pro product limits and displayed benefits follow the configured values', () => {
  const proFeatures = {
    productLimit: 120,
    productPhotoLimit: 8,
    analyticsDayLimit: 180,
    boostDiscountPercent: 20,
  };
  assert.equal(getSubscriptionProductLimit('pro', proFeatures), 120);
  assert.ok(getSubscriptionPlanBenefits('pro', proFeatures).includes('Jusqu’à 120 articles et jusqu’à 8 photos par article'));
  assert.ok(getSubscriptionPlanBenefits('pro', proFeatures).includes('Statistiques détaillées sur 180 jours'));
  assert.ok(getSubscriptionPlanBenefits('pro', proFeatures).includes('Réduction de 20% sur les boosts payants'));
  assert.equal(getBoostPrice(1, proFeatures.boostDiscountPercent), 800);
  assert.equal(getBoostPrice(1, 0), 1000);
});

test('existing Pro features remain unchanged until their subscription renewal boundary', () => {
  const oldFeatures = { ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, productPhotoLimit: 5, boostDiscountPercent: 10 };
  const newFeatures = { ...DEFAULT_SUBSCRIPTION_PRO_FEATURES, productPhotoLimit: 8, boostDiscountPercent: 20 };
  const shop = {
    subscription_status: 'active',
    trial_start: null,
    trial_end: null,
    subscription_expires_at: '2026-08-15T23:59:59.999Z',
    selected_subscription_tier: 'pro',
    pending_subscription_tier: null,
    pending_subscription_effective_at: null,
    subscription_cancel_at: null,
    subscription_plan_features: newFeatures,
    subscription_features_snapshot: oldFeatures,
    subscription_features_effective_at: '2026-08-15T23:59:59.999Z',
  } as const;

  const beforeRenewal = getSubscriptionState(shop, new Date('2026-08-15T12:00:00.000Z'));
  const atRenewal = getSubscriptionState(shop, new Date('2026-08-16T00:00:00.000Z'));
  assert.equal(beforeRenewal.planFeatures.productPhotoLimit, 5);
  assert.equal(beforeRenewal.planFeatures.boostDiscountPercent, 10);
  assert.equal(atRenewal.planFeatures.productPhotoLimit, 8);
  assert.equal(atRenewal.planFeatures.boostDiscountPercent, 20);
});
