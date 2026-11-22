import { Router, type Request, type RequestHandler, type Response } from 'express';
import { databaseMode, dbTransaction, type DatabaseTransaction } from '../../db.ts';
import { requireSameOriginJsonRequest } from '../middleware/authRequestSecurity.ts';
import {
  adjustPoints, confirmRedemption, ensureProgram, LOYALTY_MIN_REASON_LENGTH, releaseRedemption, reserveReward,
} from '../services/loyaltyEngine.ts';
import { importLegacyLoyalty } from '../services/loyaltyLegacy.ts';
import {
  getAdminAccount, getAdminAccounts, getAdminOverview, getAdminPrograms, getCustomerPrograms, getCustomerTransactions,
  getProgram, getRewards, getShopAnalytics, getShopMembers, parseCursor,
} from '../repositories/loyalty.ts';

interface LoyaltyRouterOptions {
  getCustomerSessionState: (req: Request, res?: Response) => Promise<{ authenticated: boolean; user?: { id: number } | null }>;
  requireMerchantOwnShop: RequestHandler;
  requireSuperAdminAccess: RequestHandler;
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
}

/** Ouverture progressive : vide = aucune boutique, `*` = toutes, sinon la liste des boutiques pilotes. */
export function isLoyaltyOpenFor(shopId: number): boolean {
  const setting = String(process.env.LOYALTY_PILOT_SHOP_IDS || '').trim();
  return setting === '*' || setting.split(',').some((id) => id.trim() === String(shopId));
}

const MAX_REWARDS = 10;
const ANALYTICS_DAYS = [7, 30, 90];

const parseId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const cleanText = (value: unknown, maxLength: number) => (typeof value === 'string'
  ? value.trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, maxLength)
  : '');
const isIntegerBetween = (value: unknown, minimum: number, maximum: number): value is number => Number.isInteger(value)
  && Number(value) >= minimum && Number(value) <= maximum;

interface RewardInput {
  id: number | null;
  label: string;
  conditions: string;
  cost: number;
  remaining: number | null;
  /** Quantité affichée au commerçant quand il a ouvert son formulaire. */
  previousRemaining: number | null;
  endsAt: string | null;
  isActive: boolean;
}

function parseRewards(value: unknown): RewardInput[] | null {
  if (!Array.isArray(value) || value.length > MAX_REWARDS) return null;
  const rewards: RewardInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Record<string, unknown>;
    const id = raw.id === undefined || raw.id === null ? null : parseId(raw.id);
    const label = cleanText(raw.label, 80);
    const remaining = raw.remaining ?? null;
    const previousRemaining = raw.previous_remaining ?? null;
    const endsAt = raw.ends_at ?? null;
    if ((raw.id !== undefined && raw.id !== null && id === null) || label.length < 3 || !isIntegerBetween(raw.cost_points, 1, 50)
      || (remaining !== null && !isIntegerBetween(remaining, 0, 100_000))
      || (previousRemaining !== null && !isIntegerBetween(previousRemaining, 0, 100_000))
      || (endsAt !== null && (typeof endsAt !== 'string' || !Number.isFinite(Date.parse(endsAt))))) return null;
    rewards.push({
      id, label, conditions: cleanText(raw.conditions, 300), cost: raw.cost_points, remaining: remaining as number | null, previousRemaining: previousRemaining as number | null,
      endsAt: endsAt === null ? null : new Date(endsAt as string).toISOString(), isActive: raw.is_active !== false,
    });
  }
  const ids = rewards.map(({ id }) => id).filter((id) => id !== null);
  return new Set(ids).size === ids.length ? rewards : null;
}

/** Remplace la liste : une récompense absente est retirée de l’offre, jamais supprimée, car le registre s’y réfère. */
async function saveRewards(tx: DatabaseTransaction, programId: number, rewards: RewardInput[], now: string): Promise<boolean> {
  const existing = await tx.all<{ id: number | string; remaining: number | string | null }>(
    `SELECT id, remaining FROM loyalty_rewards WHERE program_id = ? ORDER BY id${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
    [programId],
  );
  const currentRemaining = new Map(existing.map((row) => [Number(row.id), row.remaining == null ? null : Number(row.remaining)]));
  if (rewards.some(({ id }) => id !== null && !currentRemaining.has(id))) return false;
  await tx.run('UPDATE loyalty_rewards SET is_active = 0 WHERE program_id = ?', [programId]);
  for (const reward of rewards) {
    // Des clients ont pu réserver pendant la saisie : on applique la modification du commerçant, sans effacer leurs réservations.
    const current = reward.id === null ? null : currentRemaining.get(reward.id) ?? null;
    const remaining = reward.remaining !== null && reward.previousRemaining !== null && current !== null
      ? Math.max(0, current + reward.remaining - reward.previousRemaining)
      : reward.remaining;
    const values = [reward.label, reward.conditions, reward.cost, remaining, reward.endsAt, reward.isActive ? 1 : 0];
    if (reward.id !== null) {
      await tx.run('UPDATE loyalty_rewards SET label = ?, conditions = ?, cost_points = ?, remaining = ?, ends_at = ?, is_active = ? WHERE id = ?', [...values, reward.id]);
    } else {
      await tx.run(
        'INSERT INTO loyalty_rewards (label, conditions, cost_points, remaining, ends_at, is_active, program_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [...values, programId, now],
      );
    }
  }
  return true;
}

async function audit(tx: DatabaseTransaction, action: string, shopId: number | null, details: Record<string, unknown>, now: string) {
  await tx.run(
    'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
    ['super_admin', action, shopId, JSON.stringify(details), now],
  );
}

export function createLoyaltyRouters({ getCustomerSessionState, requireMerchantOwnShop, requireSuperAdminAccess, rateLimitPublicRequest }: LoyaltyRouterOptions) {
  const customerRouter = Router();
  const merchantRouter = Router();
  const adminRouter = Router();

  const requireCustomer = async (req: Request, res: Response): Promise<number | null> => {
    const session = await getCustomerSessionState(req, res);
    res.setHeader('Cache-Control', 'private, no-store');
    if (session.authenticated && session.user?.id) return session.user.id;
    res.status(401).json({ error: 'Connectez-vous pour consulter vos points.' });
    return null;
  };
  const readCursor = (req: Request, res: Response): number | null => {
    const cursor = parseCursor(req.query.cursor);
    if (cursor === null) res.status(400).json({ error: 'Page invalide.' });
    return cursor;
  };
  /** Un administrateur qui consulte une boutique ne gère pas la fidélité à la place du commerçant. */
  const merchantOnly: RequestHandler = (req, res, next) => {
    if (req.adminShopAccess || req.adminRole) {
      res.status(403).json({ error: 'Seul le commerçant peut gérer son programme de fidélité.' });
      return;
    }
    next();
  };

  // Client
  customerRouter.get('/me', rateLimitPublicRequest(60), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (userId === null) return;
    const programs = await getCustomerPrograms(userId, new Date().toISOString());
    res.json({ programs, available_rewards: programs.reduce((sum, program) => sum + program.rewards.filter((reward) => reward.is_affordable).length, 0) });
  });

  customerRouter.get('/me/transactions', rateLimitPublicRequest(60), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (userId === null) return;
    const cursor = readCursor(req, res);
    if (cursor === null) return;
    res.json(await getCustomerTransactions(userId, cursor));
  });

  customerRouter.post('/rewards/:id/redeem', rateLimitPublicRequest(20), requireSameOriginJsonRequest, async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (userId === null) return;
    const rewardId = parseId(req.params.id);
    if (rewardId === null) return res.status(400).json({ error: 'Récompense invalide.' });
    const result = await dbTransaction((tx) => reserveReward(tx, { userId, rewardId, now: new Date().toISOString() }));
    if (result.type === 'reserved') {
      return res.status(201).json({ redemption: { id: result.redemptionId, code: result.code, expires_at: result.expiresAt } });
    }
    if (result.type === 'missing') return res.status(404).json({ error: 'Récompense introuvable.' });
    if (result.type === 'unavailable') return res.status(409).json({ error: 'Cette récompense n’est plus disponible.' });
    return res.status(409).json({ error: 'Vous n’avez pas encore assez de points.' });
  });

  customerRouter.post('/redemptions/:id/cancel', rateLimitPublicRequest(20), requireSameOriginJsonRequest, async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (userId === null) return;
    const redemptionId = parseId(req.params.id);
    if (redemptionId === null) return res.status(400).json({ error: 'Réservation invalide.' });
    const result = await dbTransaction((tx) => releaseRedemption(tx, { redemptionId, userId, now: new Date().toISOString() }));
    if (result.type === 'missing') return res.status(404).json({ error: 'Réservation introuvable.' });
    if (result.type === 'closed') return res.status(409).json({ error: 'Cette réservation est déjà terminée.' });
    return res.json({ success: true });
  });

  // Commerçant
  merchantRouter.get('/:id/loyalty/program', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const program = await getProgram(shopId);
    // Une boutique déjà en points garde son onglet, même retirée de la liste pilote.
    res.json({ is_open: isLoyaltyOpenFor(shopId) || Boolean(program?.activated_at), program, rewards: program ? await getRewards(program.id) : [] });
  });

  merchantRouter.put('/:id/loyalty/program', requireMerchantOwnShop, merchantOnly, async (req, res) => {
    const shopId = Number(req.params.id);
    const status = req.body?.status;
    if (status === 'active' && !isLoyaltyOpenFor(shopId)) return res.status(403).json({ error: 'Les points de fidélité ne sont pas encore ouverts à votre boutique.' });
    const rewards = parseRewards(req.body?.rewards);
    const pointsPerOrder = req.body?.points_per_order ?? 1;
    if ((status !== 'active' && status !== 'inactive') || !rewards || !isIntegerBetween(pointsPerOrder, 1, 10)) {
      return res.status(400).json({ error: `Programme invalide : ${MAX_REWARDS} récompenses au plus, de 1 à 50 points chacune.` });
    }
    const now = new Date().toISOString();
    if (status === 'active' && !rewards.some((reward) => reward.isActive && reward.remaining !== 0 && (!reward.endsAt || reward.endsAt > now))) {
      return res.status(400).json({ error: 'Définissez au moins une récompense disponible avant d’activer votre programme.' });
    }
    const result = await dbTransaction(async (tx) => {
      const program = await ensureProgram(tx, shopId, now);
      if (program.status === 'blocked') return 'blocked' as const;
      if (!await saveRewards(tx, program.id, rewards, now)) return 'unknown_reward' as const;
      // L’ancienne carte est reprise au moment de l’activation : aucune commande ne se perd entre les deux.
      if (status === 'active' && !program.activatedAt) await importLegacyLoyalty(tx, shopId, now);
      await tx.run(
        `UPDATE loyalty_programs SET status = ?, points_per_order = ?, rule_version = rule_version + ?, activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?`,
        [status, pointsPerOrder, program.pointsPerOrder === pointsPerOrder ? 0 : 1, status === 'active' ? now : null, now, program.id],
      );
      return 'saved' as const;
    });
    if (result === 'blocked') return res.status(409).json({ error: 'Votre programme est suspendu par MaTable. Contactez l’assistance.' });
    if (result === 'unknown_reward') return res.status(400).json({ error: 'Une récompense ne fait pas partie de votre programme.' });
    const program = await getProgram(shopId);
    return res.json({ is_open: true, program, rewards: program ? await getRewards(program.id) : [] });
  });

  merchantRouter.get('/:id/loyalty/members', requireMerchantOwnShop, async (req, res) => {
    const cursor = readCursor(req, res);
    if (cursor === null) return;
    res.json(await getShopMembers(Number(req.params.id), cursor));
  });

  merchantRouter.get('/:id/loyalty/analytics', requireMerchantOwnShop, async (req, res) => {
    const days = Number(req.query.days ?? 30);
    if (!ANALYTICS_DAYS.includes(days)) return res.status(400).json({ error: 'Période invalide : 7, 30 ou 90 jours.' });
    return res.json(await getShopAnalytics(Number(req.params.id), days));
  });

  merchantRouter.post('/:id/loyalty/redemptions/confirm', rateLimitPublicRequest(20), requireMerchantOwnShop, merchantOnly, async (req, res) => {
    const code = cleanText(req.body?.code, 20);
    if (!/^[A-Za-z0-9]{8}$/.test(code)) return res.status(400).json({ error: 'Le code comporte 8 caractères.' });
    const result = await dbTransaction((tx) => confirmRedemption(tx, { shopId: Number(req.params.id), code, actor: 'merchant', now: new Date().toISOString() }));
    switch (result.type) {
      case 'used': return res.json({ success: true, points: result.points });
      case 'missing': return res.status(404).json({ error: 'Code inconnu dans votre boutique.' });
      case 'expired': return res.status(409).json({ error: 'Ce code a expiré. Les points ont été rendus au client.' });
      case 'blocked': return res.status(409).json({ error: 'Votre programme est suspendu par MaTable.' });
      case 'insufficient': return res.status(409).json({ error: 'Le client n’a plus assez de points.' });
      default: return res.status(409).json({ error: 'Ce code a déjà été utilisé ou annulé.' });
    }
  });

  // Super-admin
  adminRouter.use(requireSuperAdminAccess);

  adminRouter.get('/overview', async (_req, res) => {
    res.json(await getAdminOverview());
  });

  adminRouter.get('/programs', async (req, res) => {
    const cursor = readCursor(req, res);
    if (cursor !== null) res.json(await getAdminPrograms(cursor));
  });

  adminRouter.get('/programs/:id/accounts', async (req, res) => {
    const programId = parseId(req.params.id);
    const cursor = readCursor(req, res);
    if (cursor === null) return;
    if (programId === null) return res.status(400).json({ error: 'Programme invalide.' });
    return res.json(await getAdminAccounts(programId, cursor));
  });

  adminRouter.get('/accounts/:id', async (req, res) => {
    const accountId = parseId(req.params.id);
    const cursor = readCursor(req, res);
    if (cursor === null) return;
    const account = accountId === null ? null : await getAdminAccount(accountId, cursor);
    if (!account) return res.status(404).json({ error: 'Compte de fidélité introuvable.' });
    return res.json(account);
  });

  adminRouter.post('/programs/:id/block', requireSameOriginJsonRequest, async (req, res) => {
    const programId = parseId(req.params.id);
    const blocked = req.body?.blocked;
    const reason = cleanText(req.body?.reason, 300);
    if (programId === null || typeof blocked !== 'boolean' || reason.length < LOYALTY_MIN_REASON_LENGTH) {
      return res.status(400).json({ error: `Indiquez un motif d’au moins ${LOYALTY_MIN_REASON_LENGTH} caractères.` });
    }
    const now = new Date().toISOString();
    const result = await dbTransaction(async (tx) => {
      const found = await tx.get<{ shop_id: number | string }>('SELECT shop_id FROM loyalty_programs WHERE id = ?', [programId]);
      if (!found) return 'missing' as const;
      const program = await ensureProgram(tx, Number(found.shop_id), now);
      if ((program.status === 'blocked') === blocked) return 'unchanged' as const;
      // Un programme débloqué revient en pause : c’est au commerçant de le réactiver.
      await tx.run('UPDATE loyalty_programs SET status = ?, blocked_reason = ?, updated_at = ? WHERE id = ?', [blocked ? 'blocked' : 'inactive', blocked ? reason : null, now, programId]);
      await audit(tx, blocked ? 'loyalty_program_blocked' : 'loyalty_program_unblocked', Number(found.shop_id), { program_id: programId, previous_status: program.status, reason }, now);
      return 'saved' as const;
    });
    if (result === 'missing') return res.status(404).json({ error: 'Programme introuvable.' });
    if (result === 'unchanged') return res.status(409).json({ error: 'Le programme est déjà dans cet état.' });
    return res.json({ success: true });
  });

  adminRouter.post('/adjustments', requireSameOriginJsonRequest, async (req, res) => {
    const accountId = parseId(req.body?.account_id);
    const reason = cleanText(req.body?.reason, 300);
    const requestKey = cleanText(req.body?.request_key, 80);
    const now = new Date().toISOString();
    if (accountId === null) return res.status(400).json({ error: 'Compte de fidélité invalide.' });
    const result = await dbTransaction(async (tx) => {
      const adjusted = await adjustPoints(tx, { accountId, delta: req.body?.delta, reason, actor: 'super_admin', requestKey, now });
      if (adjusted.type !== 'adjusted') return adjusted;
      const target = await tx.get<{ shop_id: number | string; user_id: number | string | null }>(
        `SELECT programs.shop_id, accounts.user_id FROM loyalty_accounts AS accounts
         JOIN loyalty_programs AS programs ON programs.id = accounts.program_id WHERE accounts.id = ?`,
        [accountId],
      );
      await audit(tx, 'loyalty_points_adjusted', Number(target?.shop_id), {
        account_id: accountId, user_id: target?.user_id == null ? null : Number(target.user_id), delta: req.body.delta, reason, before: adjusted.before, after: adjusted.after,
      }, now);
      return adjusted;
    });
    if (result.type === 'invalid') return res.status(400).json({ error: `Correction invalide : de 1 à 100 points, avec un motif d’au moins ${LOYALTY_MIN_REASON_LENGTH} caractères.` });
    if (result.type === 'adjusted') return res.json({ success: true, before: result.before, after: result.after });
    if (result.type === 'missing') return res.status(404).json({ error: 'Compte de fidélité introuvable.' });
    return res.status(409).json({ error: 'Cette correction a déjà été enregistrée.' });
  });

  return { customerRouter, merchantRouter, adminRouter };
}
