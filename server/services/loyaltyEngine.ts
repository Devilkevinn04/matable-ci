import { randomInt } from 'node:crypto';
import { databaseMode, dbAll, dbTransaction, type DatabaseTransaction } from '../../db.ts';

/**
 * Moteur de fidélité. Toutes les règles sont ici : aucune interface ne calcule de points.
 * Chaque fonction reçoit la transaction SQL en cours et verrouille toujours dans le même ordre :
 * commande, programme, compte, récompense. Le registre loyalty_transactions n’est jamais modifié ni supprimé.
 */
export const LOYALTY_RESERVATION_MS = 7 * 24 * 60 * 60 * 1000;
export const LOYALTY_MIN_ORDER_GAP_MS = 2 * 60 * 60 * 1000;
export const LOYALTY_MAX_EARNS_PER_DAY = 3;
export const LOYALTY_MAX_ADJUSTMENT = 100;
export const LOYALTY_MIN_REASON_LENGTH = 10;

// Sans I, O, 0 ni 1 : un code dicté ou lu sur un téléphone ne prête pas à confusion.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_ATTEMPTS = 5;

const FOR_UPDATE = databaseMode === 'postgresql' ? ' FOR UPDATE' : '';

type Tx = DatabaseTransaction;
type MovementType = 'earn' | 'reverse' | 'redeem' | 'adjust' | 'legacy';
type ClosedStatus = 'used' | 'released' | 'expired';

interface AccountRow {
  id: number;
  programId: number;
  balance: number;
  reserved: number;
}

interface RedemptionRow {
  id: number;
  rewardId: number;
  cost: number;
  status: string;
  expiresAt: string;
}

async function readAccount(tx: Tx, where: string, params: unknown[]): Promise<AccountRow | null> {
  const row = await tx.get<{ id: number | string; program_id: number | string; balance: number | string; reserved: number | string }>(
    `SELECT id, program_id, balance, reserved FROM loyalty_accounts WHERE ${where}${FOR_UPDATE}`,
    params,
  );
  return row
    ? { id: Number(row.id), programId: Number(row.program_id), balance: Number(row.balance), reserved: Number(row.reserved) }
    : null;
}

const lockAccount = (tx: Tx, accountId: number) => readAccount(tx, 'id = ?', [accountId]);

async function lockOrCreateAccount(tx: Tx, programId: number, userId: number, now: string): Promise<AccountRow> {
  await tx.run(
    `INSERT INTO loyalty_accounts (program_id, user_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (program_id, user_id) DO NOTHING`,
    [programId, userId, now],
  );
  const account = await readAccount(tx, 'program_id = ? AND user_id = ?', [programId, userId]);
  if (!account) throw new Error(`Loyalty account missing for program ${programId}.`);
  return account;
}

/** Écrit un mouvement et met le solde à jour. Renvoie null si cette opération a déjà été enregistrée. */
async function addMovement(tx: Tx, account: AccountRow, movement: {
  type: MovementType;
  delta: number;
  key: string;
  ruleVersion: number;
  actor: string;
  now: string;
  orderId?: number;
  redemptionId?: number;
  reason?: string;
}): Promise<number | null> {
  const balance = account.balance + movement.delta;
  const inserted = await tx.get(
    `INSERT INTO loyalty_transactions
       (account_id, order_id, redemption_id, type, points_delta, balance_after, idempotency_key, rule_version, actor, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [account.id, movement.orderId ?? null, movement.redemptionId ?? null, movement.type, movement.delta, balance,
      movement.key, movement.ruleVersion, movement.actor, movement.reason ?? null, movement.now],
  );
  if (!inserted) return null;
  await tx.run('UPDATE loyalty_accounts SET balance = ?, updated_at = ? WHERE id = ?', [balance, movement.now, account.id]);
  account.balance = balance;
  return balance;
}

async function getRuleVersion(tx: Tx, programId: number): Promise<number> {
  const row = await tx.get<{ rule_version: number | string }>('SELECT rule_version FROM loyalty_programs WHERE id = ?', [programId]);
  return Number(row?.rule_version || 1);
}

/** Mouvements de cette commande, dans l’ordre. */
async function getOrderMovements(tx: Tx, orderId: number) {
  const rows = await tx.all<{ account_id: number | string; type: MovementType; points_delta: number | string }>(
    `SELECT account_id, type, points_delta FROM loyalty_transactions
     WHERE order_id = ? AND type IN ('earn', 'legacy', 'reverse') ORDER BY id`,
    [orderId],
  );
  return rows.map((row) => ({ accountId: Number(row.account_id), type: row.type, delta: Number(row.points_delta) }));
}

/** Limite par client et par boutique, mesurée sur la date de commande : remettre plusieurs commandes le soir n’est pas pénalisé. */
async function isEarnLimited(tx: Tx, accountId: number, orderCreatedAt: string): Promise<boolean> {
  const rows = await tx.all<{ created_at: string }>(
    `SELECT orders.created_at FROM loyalty_transactions AS movements
     JOIN orders ON orders.id = movements.order_id
     WHERE movements.account_id = ? AND movements.type IN ('earn', 'legacy', 'reverse')
     GROUP BY orders.id, orders.created_at HAVING SUM(movements.points_delta) > 0`,
    [accountId],
  );
  const orderTime = Date.parse(orderCreatedAt);
  // Abidjan est en UTC+0 toute l’année : le jour UTC est le jour local.
  const orderDay = new Date(orderTime).toISOString().slice(0, 10);
  const earnedTimes = rows.map((row) => Date.parse(row.created_at));
  return earnedTimes.some((time) => Math.abs(time - orderTime) < LOYALTY_MIN_ORDER_GAP_MS)
    || earnedTimes.filter((time) => new Date(time).toISOString().slice(0, 10) === orderDay).length >= LOYALTY_MAX_EARNS_PER_DAY;
}

export type EarnResult =
  | { type: 'earned'; points: number; balance: number }
  | { type: 'missing' | 'not_delivered' | 'guest' | 'inactive' | 'already_earned' | 'limited' };

/** Attribue les points d’une commande remise. Tout est relu en base : rien ne vient du navigateur. */
export async function earnForOrder(tx: Tx, { orderId, actor, now }: { orderId: number; actor: string; now: string }): Promise<EarnResult> {
  const order = await tx.get<{ shop_id: number | string; customer_user_id: number | string | null; status: string; created_at: string }>(
    `SELECT shop_id, customer_user_id, status, created_at FROM orders WHERE id = ?${FOR_UPDATE}`,
    [orderId],
  );
  if (!order) return { type: 'missing' };
  if (order.status !== 'delivered') return { type: 'not_delivered' };
  if (order.customer_user_id == null
    || !await tx.get('SELECT id FROM users WHERE id = ?', [Number(order.customer_user_id)])) return { type: 'guest' };
  // Verrouillé : une remise et l’activation du programme ne peuvent pas se croiser et perdre la commande.
  const program = await ensureProgram(tx, Number(order.shop_id), now);
  if (program.status !== 'active') return { type: 'inactive' };

  const account = await lockOrCreateAccount(tx, program.id, Number(order.customer_user_id), now);
  const movements = await getOrderMovements(tx, orderId);
  if (movements.reduce((sum, { delta }) => sum + delta, 0) > 0) return { type: 'already_earned' };
  if (await isEarnLimited(tx, account.id, order.created_at)) return { type: 'limited' };

  const points = program.pointsPerOrder;
  const rank = movements.filter(({ type }) => type !== 'reverse').length + 1;
  const balance = await addMovement(tx, account, {
    type: 'earn', delta: points, key: `earn:order:${orderId}:${rank}`, ruleVersion: program.ruleVersion, actor, now, orderId,
  });
  return balance === null ? { type: 'already_earned' } : { type: 'earned', points, balance };
}

/** Programme de la boutique, créé inactif au besoin et verrouillé. */
export async function ensureProgram(tx: Tx, shopId: number, now: string): Promise<{ id: number; status: string; activatedAt: string | null; pointsPerOrder: number; ruleVersion: number }> {
  await tx.run(
    'INSERT INTO loyalty_programs (shop_id, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT (shop_id) DO NOTHING',
    [shopId, now, now],
  );
  const row = await tx.get<{ id: number | string; status: string; activated_at: string | null; points_per_order: number | string; rule_version: number | string }>(
    `SELECT id, status, activated_at, points_per_order, rule_version FROM loyalty_programs WHERE shop_id = ?${FOR_UPDATE}`,
    [shopId],
  );
  if (!row) throw new Error(`Loyalty program missing for shop ${shopId}.`);
  return { id: Number(row.id), status: row.status, activatedAt: row.activated_at, pointsPerOrder: Number(row.points_per_order), ruleVersion: Number(row.rule_version) };
}

/** Ancienne commande remise : un point, sans les limites de rythme qui n’existaient pas. */
export async function addLegacyOrder(tx: Tx, { programId, orderId, userId, now }: {
  programId: number; orderId: number; userId: number; now: string;
}): Promise<boolean> {
  const account = await lockOrCreateAccount(tx, programId, userId, now);
  const movements = await getOrderMovements(tx, orderId);
  if (movements.reduce((sum, { delta }) => sum + delta, 0) > 0) return false;
  const rank = movements.filter(({ type }) => type !== 'reverse').length + 1;
  return await addMovement(tx, account, {
    type: 'legacy', delta: 1, key: `earn:order:${orderId}:${rank}`, ruleVersion: 0, actor: 'system', reason: 'Reprise de l’ancienne carte', now, orderId,
  }) !== null;
}

/** Récompense déjà donnée avec l’ancienne carte. */
export async function addLegacyRedemption(tx: Tx, { programId, redemptionId, userId, points, now }: {
  programId: number; redemptionId: number; userId: number; points: number; now: string;
}): Promise<boolean> {
  const account = await lockOrCreateAccount(tx, programId, userId, now);
  return await addMovement(tx, account, {
    type: 'legacy', delta: -points, key: `legacy:redemption:${redemptionId}`, ruleVersion: 0, actor: 'system', reason: 'Récompense déjà remise avec l’ancienne carte', now,
  }) !== null;
}

export type ReverseResult = { type: 'reversed'; points: number; balance: number } | { type: 'nothing_to_reverse' };

/** Reprend les points d’une commande qui n’est plus remise. Le solde peut devenir négatif ; toute utilisation est alors bloquée. */
export async function reverseForOrder(tx: Tx, { orderId, actor, reason, now }: {
  orderId: number; actor: string; reason: string; now: string;
}): Promise<ReverseResult> {
  await tx.get(`SELECT id FROM orders WHERE id = ?${FOR_UPDATE}`, [orderId]);
  const accountId = (await getOrderMovements(tx, orderId))[0]?.accountId;
  const account = accountId === undefined ? null : await lockAccount(tx, accountId);
  if (!account) return { type: 'nothing_to_reverse' };
  const movements = await getOrderMovements(tx, orderId);
  const points = movements.reduce((sum, { delta }) => sum + delta, 0);
  if (points <= 0) return { type: 'nothing_to_reverse' };
  const rank = movements.filter(({ type }) => type === 'reverse').length + 1;
  const balance = await addMovement(tx, account, {
    type: 'reverse', delta: -points, key: `reverse:order:${orderId}:${rank}`, ruleVersion: await getRuleVersion(tx, account.programId), actor, reason, now, orderId,
  });
  return balance === null ? { type: 'nothing_to_reverse' } : { type: 'reversed', points, balance };
}

function createCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export type ReserveResult =
  | { type: 'reserved'; redemptionId: number; code: string; expiresAt: string }
  | { type: 'missing' | 'unavailable' | 'insufficient' };

export async function reserveReward(tx: Tx, { userId, rewardId, now }: { userId: number; rewardId: number; now: string }): Promise<ReserveResult> {
  const reward = await tx.get<{ program_id: number | string; program_status: string }>(
    `SELECT rewards.program_id, programs.status AS program_status FROM loyalty_rewards AS rewards
     JOIN loyalty_programs AS programs ON programs.id = rewards.program_id WHERE rewards.id = ?`,
    [rewardId],
  );
  if (!reward) return { type: 'missing' };
  if (reward.program_status !== 'active') return { type: 'unavailable' };
  const account = await readAccount(tx, 'program_id = ? AND user_id = ?', [Number(reward.program_id), userId]);
  if (!account) return { type: 'insufficient' };

  const offer = await tx.get<{ label: string; cost_points: number | string; remaining: number | string | null; ends_at: string | null; is_active: number | string }>(
    `SELECT label, cost_points, remaining, ends_at, is_active FROM loyalty_rewards WHERE id = ?${FOR_UPDATE}`,
    [rewardId],
  );
  if (!offer || !Number(offer.is_active) || (offer.ends_at !== null && offer.ends_at <= now)
    || (offer.remaining !== null && Number(offer.remaining) <= 0)) return { type: 'unavailable' };
  const cost = Number(offer.cost_points);
  if (account.balance - account.reserved < cost) return { type: 'insufficient' };

  const expiresAt = new Date(Date.parse(now) + LOYALTY_RESERVATION_MS).toISOString();
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = createCode();
    const inserted = await tx.get<{ id: number | string }>(
      `INSERT INTO loyalty_redemptions (account_id, reward_id, reward_label, cost_points, code, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?) ON CONFLICT (code) DO NOTHING RETURNING id`,
      [account.id, rewardId, offer.label, cost, code, expiresAt, now],
    );
    if (!inserted) continue;
    await tx.run('UPDATE loyalty_accounts SET reserved = reserved + ?, updated_at = ? WHERE id = ?', [cost, now, account.id]);
    if (offer.remaining !== null) await tx.run('UPDATE loyalty_rewards SET remaining = remaining - 1 WHERE id = ?', [rewardId]);
    return { type: 'reserved', redemptionId: Number(inserted.id), code, expiresAt };
  }
  throw new Error('Unable to allocate a loyalty code.');
}

async function lockRedemption(tx: Tx, redemptionId: number): Promise<RedemptionRow | null> {
  const row = await tx.get<{ id: number | string; reward_id: number | string; cost_points: number | string; status: string; expires_at: string }>(
    `SELECT id, reward_id, cost_points, status, expires_at FROM loyalty_redemptions WHERE id = ?${FOR_UPDATE}`,
    [redemptionId],
  );
  return row
    ? { id: Number(row.id), rewardId: Number(row.reward_id), cost: Number(row.cost_points), status: row.status, expiresAt: row.expires_at }
    : null;
}

/** Clôt une réservation : les points ne sont plus bloqués, et la quantité revient si l’avantage n’a pas été remis. */
async function closeRedemption(tx: Tx, account: AccountRow, redemption: RedemptionRow, status: ClosedStatus, now: string): Promise<void> {
  await tx.run('UPDATE loyalty_redemptions SET status = ?, closed_at = ? WHERE id = ?', [status, now, redemption.id]);
  await tx.run('UPDATE loyalty_accounts SET reserved = reserved - ?, updated_at = ? WHERE id = ?', [redemption.cost, now, account.id]);
  account.reserved -= redemption.cost;
  if (status !== 'used') {
    await tx.run('UPDATE loyalty_rewards SET remaining = remaining + 1 WHERE id = ? AND remaining IS NOT NULL', [redemption.rewardId]);
  }
}

export type ConfirmResult =
  | { type: 'used'; points: number; balance: number }
  | { type: 'missing' | 'closed' | 'expired' | 'blocked' | 'insufficient' };

/** Le commerçant remet l’avantage : seul moment où les points sont débités. */
export async function confirmRedemption(tx: Tx, { shopId, code, actor, now }: {
  shopId: number; code: string; actor: string; now: string;
}): Promise<ConfirmResult> {
  const found = await tx.get<{ id: number | string; account_id: number | string; program_status: string; rule_version: number | string }>(
    `SELECT redemptions.id, redemptions.account_id, programs.status AS program_status, programs.rule_version
     FROM loyalty_redemptions AS redemptions
     JOIN loyalty_accounts AS accounts ON accounts.id = redemptions.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     WHERE redemptions.code = ? AND programs.shop_id = ?`,
    [code.trim().toUpperCase(), shopId],
  );
  if (!found) return { type: 'missing' };
  const account = await lockAccount(tx, Number(found.account_id));
  const redemption = await lockRedemption(tx, Number(found.id));
  if (!account || !redemption) return { type: 'missing' };
  if (redemption.status !== 'reserved') return { type: 'closed' };
  if (redemption.expiresAt <= now) {
    await closeRedemption(tx, account, redemption, 'expired', now);
    return { type: 'expired' };
  }
  if (found.program_status === 'blocked') return { type: 'blocked' };
  if (account.balance < redemption.cost) return { type: 'insufficient' };
  const balance = await addMovement(tx, account, {
    type: 'redeem', delta: -redemption.cost, key: `redeem:${redemption.id}`, ruleVersion: Number(found.rule_version), actor, now, redemptionId: redemption.id,
  });
  if (balance === null) return { type: 'closed' };
  await closeRedemption(tx, account, redemption, 'used', now);
  return { type: 'used', points: redemption.cost, balance };
}

/** Annule une réservation ouverte. `userId` limite l’action au client concerné. */
export async function releaseRedemption(tx: Tx, { redemptionId, userId, now, status = 'released' }: {
  redemptionId: number; userId?: number; now: string; status?: 'released' | 'expired';
}): Promise<{ type: 'released' | 'missing' | 'closed' }> {
  const found = await tx.get<{ account_id: number | string; user_id: number | string | null }>(
    `SELECT redemptions.account_id, accounts.user_id FROM loyalty_redemptions AS redemptions
     JOIN loyalty_accounts AS accounts ON accounts.id = redemptions.account_id WHERE redemptions.id = ?`,
    [redemptionId],
  );
  if (!found || (userId !== undefined && Number(found.user_id) !== userId)) return { type: 'missing' };
  const account = await lockAccount(tx, Number(found.account_id));
  const redemption = await lockRedemption(tx, redemptionId);
  if (!account || !redemption) return { type: 'missing' };
  if (redemption.status !== 'reserved') return { type: 'closed' };
  await closeRedemption(tx, account, redemption, status, now);
  return { type: 'released' };
}

/** Libère les réservations périmées. Chaque réservation a sa propre transaction. */
export async function expireReservations(nowMs = Date.now(), limit = 200): Promise<number> {
  const now = new Date(nowMs).toISOString();
  const rows = await dbAll<{ id: number | string }>(
    "SELECT id FROM loyalty_redemptions WHERE status = 'reserved' AND expires_at <= ? ORDER BY expires_at, id LIMIT ?",
    [now, limit],
  );
  let expired = 0;
  for (const row of rows) {
    const result = await dbTransaction((tx) => releaseRedemption(tx, { redemptionId: Number(row.id), now, status: 'expired' }));
    if (result.type === 'released') expired += 1;
  }
  return expired;
}

export type AdjustResult = { type: 'adjusted'; before: number; after: number } | { type: 'invalid' | 'missing' | 'duplicate' };

/** Correction du Super-admin : un mouvement de plus, jamais une réécriture. */
export async function adjustPoints(tx: Tx, { accountId, delta, reason, actor, requestKey, now }: {
  accountId: number; delta: number; reason: string; actor: string; requestKey: string; now: string;
}): Promise<AdjustResult> {
  const cleanReason = reason.trim();
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > LOYALTY_MAX_ADJUSTMENT
    || cleanReason.length < LOYALTY_MIN_REASON_LENGTH || !requestKey.trim()) return { type: 'invalid' };
  const account = await lockAccount(tx, accountId);
  if (!account) return { type: 'missing' };
  const before = account.balance;
  const after = await addMovement(tx, account, {
    type: 'adjust', delta, key: `adjust:${accountId}:${requestKey.trim()}`, ruleVersion: await getRuleVersion(tx, account.programId), actor, reason: cleanReason, now,
  });
  return after === null ? { type: 'duplicate' } : { type: 'adjusted', before, after };
}

/** À appeler avant la suppression d’un compte client : les réservations sont libérées, le registre reste sans identité. */
export async function closeCustomerAccounts(tx: Tx, userId: number, now: string): Promise<void> {
  const rows = await tx.all<{ id: number | string }>(
    `SELECT redemptions.id FROM loyalty_redemptions AS redemptions
     JOIN loyalty_accounts AS accounts ON accounts.id = redemptions.account_id
     WHERE accounts.user_id = ? AND redemptions.status = 'reserved' ORDER BY accounts.id, redemptions.id`,
    [userId],
  );
  for (const row of rows) await releaseRedemption(tx, { redemptionId: Number(row.id), now });
}

/** Vérifie que le solde et les points réservés correspondent exactement au registre. */
export async function checkAccount(tx: Tx, accountId: number) {
  const account = await lockAccount(tx, accountId);
  const ledger = await tx.get<{ total: number | string | null }>('SELECT SUM(points_delta) AS total FROM loyalty_transactions WHERE account_id = ?', [accountId]);
  const open = await tx.get<{ total: number | string | null }>("SELECT SUM(cost_points) AS total FROM loyalty_redemptions WHERE account_id = ? AND status = 'reserved'", [accountId]);
  const ledgerBalance = Number(ledger?.total || 0);
  const openReserved = Number(open?.total || 0);
  return {
    isSound: account !== null && account.balance === ledgerBalance && account.reserved === openReserved,
    balance: account?.balance ?? null,
    ledgerBalance,
    reserved: account?.reserved ?? null,
    openReserved,
  };
}

export async function recordOrderStatus(tx: Tx, { orderId, shopId, from, to, actor, now }: {
  orderId: number; shopId: number; from: string | null; to: string; actor: string; now: string;
}): Promise<void> {
  await tx.run(
    'INSERT INTO order_status_events (order_id, shop_id, from_status, to_status, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [orderId, shopId, from, to, actor, now],
  );
}

/** Point d’entrée unique des commandes : historise le statut, puis attribue ou reprend les points. */
export async function applyOrderStatusChange(tx: Tx, change: {
  orderId: number; shopId: number; from: string; to: string; actor: string; reason?: string; now: string;
}): Promise<void> {
  if (change.from === change.to) return;
  await recordOrderStatus(tx, change);
  if (change.to === 'delivered') await earnForOrder(tx, change);
  else if (change.from === 'delivered') {
    await reverseForOrder(tx, { ...change, reason: change.reason || `Commande repassée au statut ${change.to}` });
  }
}
