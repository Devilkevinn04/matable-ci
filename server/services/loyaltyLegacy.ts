import type { DatabaseTransaction } from '../../db.ts';
import { CUSTOMER_LOYALTY_REWARD_THRESHOLD } from '../../src/utils/customerLoyalty.ts';
import { addLegacyOrder, addLegacyRedemption, checkAccount, ensureProgram } from './loyaltyEngine.ts';

export interface LegacyImportResult {
  shopId: number;
  customers: number;
  orders: number;
  redemptions: number;
  skipped: boolean;
}

/**
 * Reprend dans le registre l’ancienne carte « 5 commandes » d’une boutique : +1 par commande remise avec compte,
 * −5 par récompense déjà donnée. Rejouable sans doublon tant que le programme n’a jamais été activé.
 * Le moindre écart avec l’ancien calcul lève une erreur : la transaction entière est annulée.
 */
export async function importLegacyLoyalty(tx: DatabaseTransaction, shopId: number, now: string): Promise<LegacyImportResult> {
  const program = await ensureProgram(tx, shopId, now);
  const result: LegacyImportResult = { shopId, customers: 0, orders: 0, redemptions: 0, skipped: false };
  if (program.activatedAt) return { ...result, skipped: true };

  const orders = await tx.all<{ id: number | string; user_id: number | string }>(
    `SELECT orders.id, orders.customer_user_id AS user_id FROM orders JOIN users ON users.id = orders.customer_user_id
     WHERE orders.shop_id = ? AND orders.status = 'delivered' ORDER BY orders.created_at, orders.id`,
    [shopId],
  );
  const redemptions = await tx.all<{ id: number | string; user_id: number | string }>(
    'SELECT id, user_id FROM customer_loyalty_redemptions WHERE shop_id = ? ORDER BY id',
    [shopId],
  );
  for (const order of orders) {
    if (await addLegacyOrder(tx, { programId: program.id, orderId: Number(order.id), userId: Number(order.user_id), now })) result.orders += 1;
  }
  for (const redemption of redemptions) {
    if (await addLegacyRedemption(tx, {
      programId: program.id, redemptionId: Number(redemption.id), userId: Number(redemption.user_id), points: CUSTOMER_LOYALTY_REWARD_THRESHOLD, now,
    })) result.redemptions += 1;
  }

  const count = (rows: { user_id: number | string }[], userId: number) => rows.filter((row) => Number(row.user_id) === userId).length;
  const userIds = new Set([...orders, ...redemptions].map((row) => Number(row.user_id)));
  for (const userId of userIds) {
    const account = await tx.get<{ id: number | string; balance: number | string }>(
      'SELECT id, balance FROM loyalty_accounts WHERE program_id = ? AND user_id = ?',
      [program.id, userId],
    );
    const oldRewards = Math.max(0, Math.floor(count(orders, userId) / CUSTOMER_LOYALTY_REWARD_THRESHOLD) - count(redemptions, userId));
    const newRewards = Math.max(0, Math.floor(Number(account?.balance || 0) / CUSTOMER_LOYALTY_REWARD_THRESHOLD));
    const expectedBalance = count(orders, userId) - count(redemptions, userId) * CUSTOMER_LOYALTY_REWARD_THRESHOLD;
    const isSound = account ? (await checkAccount(tx, Number(account.id))).isSound : false;
    if (!account || !isSound || oldRewards !== newRewards || Number(account.balance) !== expectedBalance) {
      throw new Error(`Reprise de fidélité incohérente : boutique ${shopId}, client ${userId}, attendu ${expectedBalance}, obtenu ${account?.balance ?? 'aucun compte'}.`);
    }
    result.customers += 1;
  }
  return result;
}
