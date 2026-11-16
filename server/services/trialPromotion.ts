import type { DatabaseTransaction } from '../../db.ts';
import { TRIAL_PROMOTION_SLOTS_PER_TIER } from '../../src/utils/subscriptionFeatures.ts';
import type { SubscriptionTier } from '../types.ts';

export async function claimTrialPromotionSlot(
  transaction: Pick<DatabaseTransaction, 'get'>,
  databaseMode: 'sqlite' | 'postgresql',
  tier: Extract<SubscriptionTier, 'standard' | 'premium'>,
  shopId: number,
  claimedAt: string,
): Promise<boolean> {
  if (databaseMode === 'postgresql') {
    await transaction.get('SELECT pg_advisory_xact_lock(74191, hashtext(?))', [tier]);
  }
  const result = await transaction.get<{ count: number | string }>(
    'SELECT COUNT(*) AS count FROM trial_promotion_claims WHERE tier = ?',
    [tier],
  );
  if (Number(result?.count || 0) >= TRIAL_PROMOTION_SLOTS_PER_TIER) return false;
  const claim = await transaction.get(
    'INSERT INTO trial_promotion_claims (shop_id, tier, claimed_at) VALUES (?, ?, ?) ON CONFLICT (shop_id) DO NOTHING RETURNING shop_id',
    [shopId, tier, claimedAt],
  );
  return Boolean(claim);
}
