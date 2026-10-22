import type { Shop } from '../types';
import { getSubscriptionAccessCutoff, getSubscriptionGraceCutoff } from './subscriptionFeatures';

type PublicationShop = Pick<
  Shop,
  'is_active' | 'publication_status' | 'merchant_verification_status' | 'subscription'
>;

export function hasShopPublicationSubscriptionAccess(
  subscription: Shop['subscription'],
  currentDate = new Date(),
): boolean {
  if (!subscription) return false;
  if (subscription.status === 'trialing' || subscription.status === 'active') return true;
  if (subscription.status !== 'past_due') return false;

  const expiration = subscription.expiresAt || subscription.trialEnd;
  if (!expiration) return false;
  const accessCutoff = getSubscriptionAccessCutoff(expiration);
  const graceCutoff = getSubscriptionGraceCutoff(expiration);
  return accessCutoff !== null
    && graceCutoff !== null
    && currentDate.getTime() >= accessCutoff
    && currentDate.getTime() < graceCutoff;
}

export function isShopPubliclyVisible(shop: PublicationShop, currentDate = new Date()): boolean {
  const publicationStatus = shop.publication_status ?? (shop.is_active ? 'active' : 'suspended');
  const verificationStatus = shop.merchant_verification_status || 'not_required';
  return shop.is_active
    && publicationStatus === 'active'
    && ['not_required', 'verified'].includes(verificationStatus)
    && hasShopPublicationSubscriptionAccess(shop.subscription, currentDate);
}
