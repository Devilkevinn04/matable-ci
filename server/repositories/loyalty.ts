import { dbAll, dbGet } from '../../db.ts';

export const LOYALTY_PAGE_SIZE = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ANOMALY_POINTS_PER_CUSTOMER = 10;
const ANOMALY_MIN_POINTS = 10;
const ANOMALY_TOP_SHARE = 0.8;

type Row = Record<string, unknown>;
const num = (value: unknown) => Number(value || 0);
const text = (value: unknown) => (value == null ? null : String(value));

export function parseCursor(value: unknown): number | null {
  if (value === undefined || value === '') return Number.MAX_SAFE_INTEGER;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : null;
}

function paginate<T extends { id: number }>(rows: T[]) {
  const items = rows.slice(0, LOYALTY_PAGE_SIZE);
  return { items, next_cursor: rows.length > LOYALTY_PAGE_SIZE ? items[items.length - 1].id : null };
}

const mapReward = (row: Row) => ({
  id: num(row.id),
  label: String(row.label),
  conditions: String(row.conditions || ''),
  cost_points: num(row.cost_points),
  remaining: row.remaining == null ? null : num(row.remaining),
  ends_at: text(row.ends_at),
  is_active: Boolean(num(row.is_active)),
});

export async function getProgram(shopId: number) {
  const row = await dbGet<Row>('SELECT * FROM loyalty_programs WHERE shop_id = ?', [shopId]);
  return row
    ? {
      id: num(row.id), status: String(row.status), points_per_order: num(row.points_per_order),
      blocked_reason: text(row.blocked_reason), activated_at: text(row.activated_at), updated_at: String(row.updated_at),
    }
    : null;
}

export async function getRewards(programId: number) {
  return (await dbAll<Row>('SELECT * FROM loyalty_rewards WHERE program_id = ? ORDER BY is_active DESC, cost_points, id', [programId])).map(mapReward);
}

/** Portefeuilles du client : un par boutique, jamais additionnés. */
export async function getCustomerPrograms(userId: number, now: string) {
  const accounts = await dbAll<Row>(
    `SELECT accounts.id, accounts.program_id, accounts.balance, accounts.reserved, programs.status,
       shops.id AS shop_id, shops.name AS shop_name, shops.slug AS shop_slug
     FROM loyalty_accounts AS accounts
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id
     WHERE accounts.user_id = ? ORDER BY accounts.updated_at DESC, accounts.id`,
    [userId],
  );
  return Promise.all(accounts.map(async (account) => {
    const available = Math.max(0, num(account.balance) - num(account.reserved));
    const isActive = account.status === 'active';
    const rewards = isActive
      ? (await getRewards(num(account.program_id)))
        .filter((reward) => reward.is_active && (!reward.ends_at || reward.ends_at > now) && reward.remaining !== 0)
        .map((reward) => ({ ...reward, is_affordable: reward.cost_points <= available }))
      : [];
    const redemptions = await dbAll<Row>(
      `SELECT id, reward_label, cost_points, code, expires_at FROM loyalty_redemptions
       WHERE account_id = ? AND status = 'reserved' AND expires_at > ? ORDER BY id DESC`,
      [account.id, now],
    );
    return {
      shop: { id: num(account.shop_id), name: String(account.shop_name), slug: String(account.shop_slug) },
      status: String(account.status),
      balance: num(account.balance),
      reserved: num(account.reserved),
      available,
      next_reward_points: rewards.filter((reward) => !reward.is_affordable).reduce<number | null>(
        (best, reward) => Math.min(best ?? Number.MAX_SAFE_INTEGER, reward.cost_points), null),
      rewards,
      open_redemptions: redemptions.map((row) => ({
        id: num(row.id), label: String(row.reward_label), cost_points: num(row.cost_points), code: String(row.code), expires_at: String(row.expires_at),
      })),
    };
  }));
}

export async function getCustomerTransactions(userId: number, cursor: number) {
  const rows = await dbAll<Row>(
    `SELECT movements.id, movements.type, movements.points_delta, movements.balance_after, movements.order_id, movements.reason,
       movements.created_at, redemptions.reward_label, shops.name AS shop_name
     FROM loyalty_transactions AS movements
     JOIN loyalty_accounts AS accounts ON accounts.id = movements.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id
     LEFT JOIN loyalty_redemptions AS redemptions ON redemptions.id = movements.redemption_id
     WHERE accounts.user_id = ? AND movements.id < ? ORDER BY movements.id DESC LIMIT ?`,
    [userId, cursor, LOYALTY_PAGE_SIZE + 1],
  );
  return paginate(rows.map((row) => ({
    id: num(row.id), type: String(row.type), points: num(row.points_delta), balance_after: num(row.balance_after),
    order_id: row.order_id == null ? null : num(row.order_id), reward_label: text(row.reward_label), reason: text(row.reason),
    shop_name: String(row.shop_name), created_at: String(row.created_at),
  })));
}

/** Membres d’une boutique : ni téléphone ni e-mail. */
export async function getShopMembers(shopId: number, cursor: number) {
  const rows = await dbAll<Row>(
    `SELECT accounts.id, accounts.balance, accounts.reserved, accounts.updated_at, users.first_name, users.name,
       (SELECT COALESCE(SUM(points_delta), 0) FROM loyalty_transactions WHERE account_id = accounts.id AND type IN ('earn', 'legacy', 'reverse') AND order_id IS NOT NULL) AS earned,
       (SELECT COALESCE(SUM(-points_delta), 0) FROM loyalty_transactions WHERE account_id = accounts.id AND (type = 'redeem' OR (type = 'legacy' AND order_id IS NULL))) AS spent,
       (SELECT MAX(created_at) FROM loyalty_transactions WHERE account_id = accounts.id) AS last_movement_at
     FROM loyalty_accounts AS accounts
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN users ON users.id = accounts.user_id
     WHERE programs.shop_id = ? AND accounts.id < ? ORDER BY accounts.id DESC LIMIT ?`,
    [shopId, cursor, LOYALTY_PAGE_SIZE + 1],
  );
  return paginate(rows.map((row) => ({
    id: num(row.id), name: String(row.first_name || row.name || 'Client'), balance: num(row.balance), reserved: num(row.reserved),
    earned: num(row.earned), spent: num(row.spent), last_activity_at: text(row.last_movement_at),
  })));
}

export async function getShopAnalytics(shopId: number, days: number, nowMs = Date.now()) {
  const since = new Date(nowMs - days * DAY_MS).toISOString();
  const movements = await dbAll<Row>(
    `SELECT movements.account_id, movements.type, movements.points_delta, movements.created_at, movements.order_id
     FROM loyalty_transactions AS movements
     JOIN loyalty_accounts AS accounts ON accounts.id = movements.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     WHERE programs.shop_id = ? AND movements.created_at >= ? AND movements.type <> 'legacy'`,
    [shopId, since],
  );
  const statuses = await dbAll<Row>(
    `SELECT redemptions.status, COUNT(*) AS count FROM loyalty_redemptions AS redemptions
     JOIN loyalty_accounts AS accounts ON accounts.id = redemptions.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     WHERE programs.shop_id = ? AND redemptions.created_at >= ? GROUP BY redemptions.status`,
    [shopId, since],
  );
  const byStatus = Object.fromEntries(statuses.map((row) => [String(row.status), num(row.count)]));
  const reserved = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const sum = (types: string[]) => movements.filter((row) => types.includes(String(row.type))).reduce((total, row) => total + num(row.points_delta), 0);
  const earnsByAccount = new Map<number, number>();
  for (const row of movements) {
    if (row.type === 'earn') earnsByAccount.set(num(row.account_id), (earnsByAccount.get(num(row.account_id)) || 0) + 1);
  }
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(nowMs - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    const ofDay = movements.filter((row) => String(row.created_at).startsWith(date));
    return {
      date,
      earned: ofDay.filter((row) => row.type === 'earn').reduce((total, row) => total + num(row.points_delta), 0),
      used: ofDay.filter((row) => row.type === 'redeem').reduce((total, row) => total - num(row.points_delta), 0),
    };
  });
  return {
    days,
    active_members: new Set(movements.filter((row) => row.type === 'earn' || row.type === 'redeem').map((row) => num(row.account_id))).size,
    returning_members: [...earnsByAccount.values()].filter((count) => count >= 2).length,
    points_earned: sum(['earn']),
    points_reversed: -sum(['reverse']),
    points_used: -sum(['redeem']),
    redemptions_reserved: reserved,
    redemptions_used: byStatus.used || 0,
    usage_rate: reserved > 0 ? Math.round(((byStatus.used || 0) / reserved) * 100) : null,
    daily,
  };
}

async function getAnomalies(nowMs: number) {
  const since = new Date(nowMs - 30 * DAY_MS).toISOString();
  const rows = await dbAll<Row>(
    `SELECT programs.shop_id, shops.name AS shop_name, shops.whatsapp_number, accounts.id AS account_id, users.phone,
       SUM(movements.points_delta) AS points
     FROM loyalty_transactions AS movements
     JOIN loyalty_accounts AS accounts ON accounts.id = movements.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id
     LEFT JOIN users ON users.id = accounts.user_id
     WHERE movements.type IN ('earn', 'reverse') AND movements.created_at >= ?
     GROUP BY programs.shop_id, shops.name, shops.whatsapp_number, accounts.id, users.phone`,
    [since],
  );
  const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10);
  const anomalies: { code: string; shop_id: number; shop_name: string; account_id: number | null; detail: string }[] = [];
  const byShop = new Map<number, Row[]>();
  for (const row of rows) {
    byShop.set(num(row.shop_id), [...(byShop.get(num(row.shop_id)) || []), row]);
    const base = { shop_id: num(row.shop_id), shop_name: String(row.shop_name), account_id: num(row.account_id) };
    if (num(row.points) > ANOMALY_POINTS_PER_CUSTOMER) anomalies.push({ ...base, code: 'many_points', detail: `${num(row.points)} points en 30 jours pour un client` });
    if (digits(row.phone) && digits(row.phone) === digits(row.whatsapp_number)) anomalies.push({ ...base, code: 'same_phone', detail: 'Le client et la boutique ont le même numéro' });
  }
  for (const shopRows of byShop.values()) {
    const points = shopRows.map((row) => num(row.points)).sort((left, right) => right - left);
    const total = points.reduce((sum, value) => sum + value, 0);
    if (shopRows.length > 2 && total >= ANOMALY_MIN_POINTS && (points[0] + points[1]) / total >= ANOMALY_TOP_SHARE) {
      anomalies.push({ code: 'concentrated', shop_id: num(shopRows[0].shop_id), shop_name: String(shopRows[0].shop_name), account_id: null, detail: 'Deux clients concentrent au moins 80 % des points' });
    }
  }
  return anomalies;
}

export async function getAdminOverview(nowMs = Date.now()) {
  const statuses = await dbAll<Row>('SELECT status, COUNT(*) AS count FROM loyalty_programs GROUP BY status');
  const accounts = await dbGet<Row>('SELECT COUNT(*) AS members, COALESCE(SUM(balance), 0) AS outstanding, COALESCE(SUM(reserved), 0) AS reserved FROM loyalty_accounts');
  const points = await dbGet<Row>(
    `SELECT COALESCE(SUM(CASE WHEN type IN ('earn', 'reverse') OR (type = 'legacy' AND points_delta > 0) THEN points_delta ELSE 0 END), 0) AS earned,
       COALESCE(SUM(CASE WHEN type = 'redeem' OR (type = 'legacy' AND points_delta < 0) THEN -points_delta ELSE 0 END), 0) AS used,
       COALESCE(SUM(CASE WHEN type = 'adjust' THEN points_delta ELSE 0 END), 0) AS adjusted
     FROM loyalty_transactions`,
  );
  const used = await dbGet<Row>("SELECT COUNT(*) AS count FROM loyalty_redemptions WHERE status = 'used'");
  const unsound = await dbGet<Row>(
    `SELECT COUNT(*) AS count FROM loyalty_accounts AS accounts
     WHERE balance <> (SELECT COALESCE(SUM(points_delta), 0) FROM loyalty_transactions WHERE account_id = accounts.id)
        OR reserved <> (SELECT COALESCE(SUM(cost_points), 0) FROM loyalty_redemptions WHERE account_id = accounts.id AND status = 'reserved')`,
  );
  return {
    programs: Object.fromEntries(['inactive', 'active', 'blocked'].map((status) => [status, num(statuses.find((row) => row.status === status)?.count)])),
    members: num(accounts?.members),
    points_earned: num(points?.earned),
    points_used: num(points?.used),
    points_adjusted: num(points?.adjusted),
    points_outstanding: num(accounts?.outstanding),
    points_reserved: num(accounts?.reserved),
    redemptions_used: num(used?.count),
    unsound_accounts: num(unsound?.count),
    anomalies: await getAnomalies(nowMs),
  };
}

export async function getAdminPrograms(cursor: number) {
  const rows = await dbAll<Row>(
    `SELECT programs.id, programs.shop_id, shops.name AS shop_name, programs.status, programs.blocked_reason, programs.activated_at,
       (SELECT COUNT(*) FROM loyalty_accounts WHERE program_id = programs.id) AS members,
       (SELECT COALESCE(SUM(balance), 0) FROM loyalty_accounts WHERE program_id = programs.id) AS outstanding,
       (SELECT COUNT(*) FROM loyalty_rewards WHERE program_id = programs.id AND is_active = 1) AS active_rewards
     FROM loyalty_programs AS programs JOIN shops ON shops.id = programs.shop_id
     WHERE programs.id < ? ORDER BY programs.id DESC LIMIT ?`,
    [cursor, LOYALTY_PAGE_SIZE + 1],
  );
  return paginate(rows.map((row) => ({
    id: num(row.id), shop_id: num(row.shop_id), shop_name: String(row.shop_name), status: String(row.status), blocked_reason: text(row.blocked_reason),
    activated_at: text(row.activated_at), members: num(row.members), points_outstanding: num(row.outstanding), active_rewards: num(row.active_rewards),
  })));
}

export async function getAdminAccounts(programId: number, cursor: number) {
  const rows = await dbAll<Row>(
    `SELECT accounts.id, accounts.user_id, accounts.balance, accounts.reserved, accounts.updated_at, users.first_name, users.name
     FROM loyalty_accounts AS accounts LEFT JOIN users ON users.id = accounts.user_id
     WHERE accounts.program_id = ? AND accounts.id < ? ORDER BY accounts.id DESC LIMIT ?`,
    [programId, cursor, LOYALTY_PAGE_SIZE + 1],
  );
  return paginate(rows.map((row) => ({
    id: num(row.id), name: row.user_id == null ? 'Compte supprimé' : String(row.first_name || row.name || 'Client'),
    balance: num(row.balance), reserved: num(row.reserved), updated_at: String(row.updated_at),
  })));
}

export async function getAdminAccount(accountId: number, cursor: number) {
  const account = await dbGet<Row>(
    `SELECT accounts.id, accounts.user_id, accounts.balance, accounts.reserved, programs.id AS program_id, shops.id AS shop_id, shops.name AS shop_name,
       users.first_name, users.name
     FROM loyalty_accounts AS accounts
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id
     LEFT JOIN users ON users.id = accounts.user_id WHERE accounts.id = ?`,
    [accountId],
  );
  if (!account) return null;
  const rows = await dbAll<Row>(
    `SELECT id, type, points_delta, balance_after, order_id, redemption_id, actor, reason, rule_version, created_at
     FROM loyalty_transactions WHERE account_id = ? AND id < ? ORDER BY id DESC LIMIT ?`,
    [accountId, cursor, LOYALTY_PAGE_SIZE + 1],
  );
  return {
    id: num(account.id), name: account.user_id == null ? 'Compte supprimé' : String(account.first_name || account.name || 'Client'),
    shop: { id: num(account.shop_id), name: String(account.shop_name) }, balance: num(account.balance), reserved: num(account.reserved),
    transactions: paginate(rows.map((row) => ({
      id: num(row.id), type: String(row.type), points: num(row.points_delta), balance_after: num(row.balance_after),
      order_id: row.order_id == null ? null : num(row.order_id), redemption_id: row.redemption_id == null ? null : num(row.redemption_id),
      actor: String(row.actor), reason: text(row.reason), rule_version: num(row.rule_version), created_at: String(row.created_at),
    }))),
  };
}

/** Données du client pour son export personnel. */
export async function getCustomerLoyaltyExport(userId: number) {
  const movements = await dbAll<Row>(
    `SELECT shops.name AS shop_name, movements.type, movements.points_delta, movements.balance_after, movements.order_id, movements.reason, movements.created_at
     FROM loyalty_transactions AS movements
     JOIN loyalty_accounts AS accounts ON accounts.id = movements.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id WHERE accounts.user_id = ? ORDER BY movements.id`,
    [userId],
  );
  const redemptions = await dbAll<Row>(
    `SELECT shops.name AS shop_name, redemptions.reward_label, redemptions.cost_points, redemptions.status, redemptions.created_at, redemptions.closed_at
     FROM loyalty_redemptions AS redemptions
     JOIN loyalty_accounts AS accounts ON accounts.id = redemptions.account_id
     JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
     JOIN shops ON shops.id = programs.shop_id WHERE accounts.user_id = ? ORDER BY redemptions.id`,
    [userId],
  );
  return { movements, redemptions };
}
