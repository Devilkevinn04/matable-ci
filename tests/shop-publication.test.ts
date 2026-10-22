import test from 'node:test';
import assert from 'node:assert/strict';
import { hasShopPublicationSubscriptionAccess, isShopPubliclyVisible } from '../src/utils/shopPublication.ts';
import type { Shop } from '../src/types.ts';

const visibleShop: Pick<Shop, 'is_active' | 'publication_status' | 'merchant_verification_status' | 'subscription'> = {
  is_active: true,
  publication_status: 'active',
  merchant_verification_status: 'verified',
  subscription: {
    plan: 'standard',
    planFeatures: undefined,
    upcomingPlan: null,
    upcomingPlanAt: null,
    cancellationAt: null,
    status: 'active',
    trialStart: null,
    trialEnd: null,
    expiresAt: null,
    trialDaysRemaining: 0,
    isActive: true,
  },
};

test('shop is visible only when publication, identity and subscription requirements pass', () => {
  assert.equal(isShopPubliclyVisible(visibleShop), true);
  assert.equal(isShopPubliclyVisible({ ...visibleShop, publication_status: 'draft' }), false);
  assert.equal(isShopPubliclyVisible({ ...visibleShop, subscription: undefined }), false);
  assert.equal(isShopPubliclyVisible({ ...visibleShop, merchant_verification_status: 'pending' }), false);
  assert.equal(isShopPubliclyVisible({ ...visibleShop, is_active: false }), false);
});

test('subscription access includes only the configured past-due grace period', () => {
  const subscription = {
    ...visibleShop.subscription!,
    status: 'past_due' as const,
    isActive: false,
    expiresAt: '2026-10-20T23:59:59.999Z',
  };

  assert.equal(hasShopPublicationSubscriptionAccess(subscription, new Date('2026-10-22T12:00:00.000Z')), true);
  assert.equal(hasShopPublicationSubscriptionAccess(subscription, new Date('2026-10-23T00:00:00.000Z')), false);
});
