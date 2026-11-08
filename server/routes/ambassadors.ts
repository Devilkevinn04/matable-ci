import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction, databaseMode } from '../../db.ts';
import { AMBASSADOR_REFERRAL_DURATION_MS, normalizeAmbassadorCode } from '../../src/utils/ambassadors.ts';
import { normalizeWhatsAppPhone } from '../services/businessRules.ts';

export const hashAmbassadorToken = (token: string) => createHash('sha256').update(token).digest('hex');

const normalizeIdentityName = (value: string | null | undefined) => String(value || '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export function createAmbassadorRouters(rateLimitPublicRequest: (limit?: number) => RequestHandler) {
  const publicRouter = Router();
  const adminRouter = Router();

  publicRouter.post('/ambassador-clicks', rateLimitPublicRequest(30), async (req, res) => {
    const code = normalizeAmbassadorCode(req.body?.code);
    const ambassador = code && await dbGet<{ id: string }>('SELECT id FROM ambassadors WHERE code = ? AND active = 1', [code]);
    if (!ambassador) return res.status(404).json({ error: 'Code ambassadeur invalide.' });
    const now = new Date();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + AMBASSADOR_REFERRAL_DURATION_MS).toISOString();
    await dbRun('DELETE FROM ambassador_clicks WHERE expires_at <= ?', [now.toISOString()]);
    await dbRun('INSERT INTO ambassador_clicks (token_hash, ambassador_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [hashAmbassadorToken(token), ambassador.id, now.toISOString(), expiresAt]);
    return res.status(201).json({ token, expires_at: expiresAt });
  });

  adminRouter.get('/', async (_req, res) => {
    const ambassadors = await dbAll(`SELECT a.id, a.name, a.code, a.email, a.phone, a.active, a.created_at,
      CASE WHEN a.password_hash IS NULL THEN 0 ELSE 1 END AS has_account,
      (SELECT i.expires_at FROM ambassador_invites i WHERE i.ambassador_id = a.id AND i.used_at IS NULL
        ORDER BY i.created_at DESC LIMIT 1) AS invite_expires_at,
      (SELECT COUNT(*) FROM ambassador_referrals r WHERE r.ambassador_id = a.id) AS registrations,
      (SELECT COUNT(*) FROM ambassador_referrals r JOIN shops s ON s.id = r.shop_id WHERE r.ambassador_id = a.id AND s.publication_status = 'active') AS published,
      (SELECT COUNT(*) FROM ambassador_commissions c JOIN subscription_payment_intents p ON p.id = c.payment_id WHERE c.ambassador_id = a.id AND p.status = 'paid' AND c.status <> 'cancelled') AS paying,
      (SELECT COALESCE(SUM(c.amount), 0) FROM ambassador_commissions c WHERE c.ambassador_id = a.id AND c.status IN ('pending', 'approved', 'withdrawal_requested', 'paid')) AS commissions
      FROM ambassadors a ORDER BY a.created_at DESC`);
    const referrals = await dbAll(`SELECT r.shop_id, r.ambassador_id, r.created_at, s.name AS shop_name,
      s.owner_email, s.whatsapp_number, s.publication_status, a.name AS ambassador_name,
      a.email AS ambassador_email, a.phone AS ambassador_phone,
      c.payment_id, c.amount, c.status, c.approved_at, c.paid_at, c.payout_reference,
      (SELECT l.details FROM admin_audit_logs l WHERE l.shop_id = r.shop_id
        AND l.action IN ('ambassador_commission_approve', 'ambassador_commission_reject')
        ORDER BY l.id DESC LIMIT 1) AS decision_details,
      p.status AS payment_status, p.tier, p.subscription_term, p.amount AS payment_amount
      FROM ambassador_referrals r JOIN ambassadors a ON a.id = r.ambassador_id
      JOIN shops s ON s.id = r.shop_id LEFT JOIN ambassador_commissions c ON c.shop_id = r.shop_id
      LEFT JOIN subscription_payment_intents p ON p.id = c.payment_id ORDER BY r.created_at DESC`);
    const payouts = await dbAll(`SELECT p.*, a.name AS ambassador_name FROM ambassador_payouts p
      JOIN ambassadors a ON a.id = p.ambassador_id ORDER BY p.paid_at DESC`);
    const withdrawals = await dbAll(`SELECT w.*, a.name AS ambassador_name, a.email AS ambassador_email
      FROM ambassador_withdrawals w JOIN ambassadors a ON a.id = w.ambassador_id ORDER BY w.created_at DESC`);
    res.json({ ambassadors, referrals, payouts, withdrawals });
  });

  adminRouter.post('/', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 100) : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim().slice(0, 30) : '';
    if (name.length < 2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return res.status(400).json({ error: 'Nom ou adresse e-mail invalide.' });
    if (email && await dbGet('SELECT id FROM ambassadors WHERE LOWER(email) = ?', [email])) return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée par un ambassadeur.' });
    const id = randomUUID();
    const code = `MT${randomBytes(6).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    await dbTransaction(async (transaction) => {
      await transaction.run('INSERT INTO ambassadors (id, name, code, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, name, code, email || null, phone || null, now]);
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)', ['super_admin', 'ambassador_created', null, JSON.stringify({ ambassador_id: id }), now]);
    });
    return res.status(201).json({ id, code });
  });

  adminRouter.post('/:id/invite', async (req, res) => {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();
    const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host') || ''}`).trim();
    const inviteUrl = new URL('/ambassadeur/activer', appUrl);
    inviteUrl.searchParams.set('token', token);
    const result = await dbTransaction(async (transaction) => {
      const ambassador = await transaction.get<{ id: string; email: string | null; active: number }>(
        `SELECT id, email, active FROM ambassadors WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [req.params.id],
      );
      if (!ambassador) return 'not_found' as const;
      if (!ambassador.active) return 'inactive' as const;
      if (!ambassador.email) return 'missing_email' as const;
      await transaction.run('UPDATE ambassador_invites SET used_at = ? WHERE ambassador_id = ? AND used_at IS NULL', [now.toISOString(), ambassador.id]);
      await transaction.run('INSERT INTO ambassador_invites (token_hash, ambassador_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
        [hashAmbassadorToken(token), ambassador.id, expiresAt, now.toISOString()]);
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'ambassador_invite_created', null, JSON.stringify({ ambassador_id: ambassador.id, expires_at: expiresAt }), now.toISOString()]);
      return 'created' as const;
    });
    if (result === 'not_found') return res.status(404).json({ error: 'Ambassadeur introuvable.' });
    if (result === 'inactive') return res.status(409).json({ error: 'Réactivez cet ambassadeur avant de générer un accès.' });
    if (result === 'missing_email') return res.status(409).json({ error: 'Ajoutez une adresse e-mail à cet ambassadeur avant de générer son accès.' });
    return res.status(201).json({ invite_url: inviteUrl.toString(), expires_at: expiresAt });
  });

  adminRouter.post('/withdrawals/:id/:action', async (req, res) => {
    const withdrawalId = String(req.params.id || '').trim();
    const action = req.params.action;
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 160) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (!withdrawalId || !['approve', 'reject', 'paid'].includes(action) || (action === 'paid' && !reference)) {
      return res.status(400).json({ error: 'Action ou référence de versement invalide.' });
    }
    if (action === 'reject' && reason.length < 3) return res.status(400).json({ error: 'Documentez le motif du refus en 3 à 500 caractères.' });
    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      const withdrawal = await transaction.get<{ id: string; ambassador_id: string; amount: number; status: string }>(
        `SELECT id, ambassador_id, amount, status FROM ambassador_withdrawals WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [withdrawalId],
      );
      if (!withdrawal) return 'not_found' as const;
      const allowedStatus = action === 'approve' || action === 'reject'
        ? ['requested', 'approved'].includes(withdrawal.status)
        : withdrawal.status === 'approved';
      if (!allowedStatus) return 'conflict' as const;
      const commissions = await transaction.all<{ shop_id: number; amount: number; shop_name: string; payment_status: string }>(
        `SELECT c.shop_id, c.amount, s.name AS shop_name, p.status AS payment_status
         FROM ambassador_commissions c JOIN shops s ON s.id = c.shop_id
         JOIN subscription_payment_intents p ON p.id = c.payment_id
         WHERE c.withdrawal_id = ? AND c.status = 'withdrawal_requested'`, [withdrawalId],
      );
      const commissionAmount = commissions.reduce((total, commission) => total + Number(commission.amount), 0);
      if (commissions.length === 0 || commissionAmount !== Number(withdrawal.amount)) return 'conflict' as const;
      if (commissions.some((commission) => commission.payment_status !== 'paid')) return 'payment_review' as const;
      if (action === 'approve') {
        const updated = await transaction.run(`UPDATE ambassador_withdrawals SET status = 'approved', processed_at = ?, admin_reason = ?
          WHERE id = ? AND status = 'requested'`, [now, reason || null, withdrawalId]);
        if (updated.changes !== 1) return 'conflict' as const;
      } else if (action === 'reject') {
        const updated = await transaction.run(`UPDATE ambassador_withdrawals SET status = 'rejected', processed_at = ?, admin_reason = ?
          WHERE id = ? AND status IN ('requested', 'approved')`, [now, reason, withdrawalId]);
        if (updated.changes !== 1) return 'conflict' as const;
        await transaction.run(`UPDATE ambassador_commissions SET status = 'approved', withdrawal_id = NULL
          WHERE withdrawal_id = ? AND status = 'withdrawal_requested'`, [withdrawalId]);
      } else {
        const updated = await transaction.run(`UPDATE ambassador_withdrawals SET status = 'paid', processed_at = ?, payout_reference = ?
          WHERE id = ? AND status = 'approved'`, [now, reference, withdrawalId]);
        if (updated.changes !== 1) return 'conflict' as const;
        const paid = await transaction.run(`UPDATE ambassador_commissions SET status = 'paid', paid_at = ?, payout_reference = ?
          WHERE withdrawal_id = ? AND status = 'withdrawal_requested'`, [now, reference, withdrawalId]);
        if (paid.changes !== commissions.length) throw new Error('Le nombre de commissions a changé pendant le versement.');
        for (const commission of commissions) {
          await transaction.run(`INSERT INTO ambassador_payouts
            (id, ambassador_id, shop_id, shop_name, payment_id, amount, reference, paid_at)
            SELECT ?, ?, ?, ?, c.payment_id, c.amount, ?, ? FROM ambassador_commissions c WHERE c.shop_id = ?`,
          [randomUUID(), withdrawal.ambassador_id, commission.shop_id, commission.shop_name, reference, now, commission.shop_id]);
        }
      }
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', `ambassador_withdrawal_${action}`, null, JSON.stringify({ withdrawal_id: withdrawalId, ambassador_id: withdrawal.ambassador_id, amount: withdrawal.amount, reference: reference || null, reason: reason || null }), now]);
      return 'updated' as const;
    });
    if (result === 'not_found') return res.status(404).json({ error: 'Demande de retrait introuvable.' });
    if (result === 'payment_review') return res.status(409).json({ error: 'Un paiement lié n’est plus confirmé. Examinez le dossier avant de traiter ce retrait.' });
    if (result === 'conflict') return res.status(409).json({ error: 'Cette demande a changé ou ne correspond plus aux commissions disponibles.' });
    return res.json({ success: true });
  });

  adminRouter.patch('/:id', async (req, res) => {
    const bodyKeys = Object.keys(req.body || {});
    if (bodyKeys.length === 1 && bodyKeys[0] === 'active') {
      if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'État invalide.' });
      const now = new Date().toISOString();
      const updated = await dbTransaction(async (transaction) => {
        const result = await transaction.run('UPDATE ambassadors SET active = ? WHERE id = ?', [req.body.active ? 1 : 0, req.params.id]);
        if (result.changes && !req.body.active) {
          await transaction.run('DELETE FROM ambassador_sessions WHERE ambassador_id = ?', [req.params.id]);
          await transaction.run('UPDATE ambassador_invites SET used_at = ? WHERE ambassador_id = ? AND used_at IS NULL', [now, req.params.id]);
        }
        if (result.changes) await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)', ['super_admin', 'ambassador_status_updated', null, JSON.stringify({ ambassador_id: req.params.id, active: req.body.active }), now]);
        return result.changes;
      });
      return updated ? res.json({ success: true }) : res.status(404).json({ error: 'Ambassadeur introuvable.' });
    }

    if (bodyKeys.length !== 3 || !bodyKeys.every((key) => ['name', 'email', 'phone'].includes(key))) {
      return res.status(400).json({ error: 'Informations de profil invalides.' });
    }
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    if (name.length < 2 || name.length > 100 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phone.length > 30) {
      return res.status(400).json({ error: 'Nom, adresse e-mail ou téléphone invalide.' });
    }
    const duplicateEmail = email && await dbGet<{ id: string }>(
      'SELECT id FROM ambassadors WHERE LOWER(email) = ? AND id <> ? LIMIT 1', [email, req.params.id],
    );
    if (duplicateEmail) return res.status(409).json({ error: 'Cette adresse e-mail est déjà utilisée par un ambassadeur.' });
    const now = new Date().toISOString();
    const updated = await dbTransaction(async (transaction) => {
      const current = await transaction.get<{ email: string | null }>(
        `SELECT email FROM ambassadors WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`, [req.params.id],
      );
      if (!current) return false;
      const emailChanged = (current.email || '').toLowerCase() !== email;
      const result = await transaction.run(`UPDATE ambassadors SET name = ?, email = ?, phone = ?${emailChanged ? ', password_hash = NULL' : ''} WHERE id = ?`,
        [name, email || null, phone || null, req.params.id]);
      if (emailChanged) {
        await transaction.run('DELETE FROM ambassador_sessions WHERE ambassador_id = ?', [req.params.id]);
        await transaction.run('UPDATE ambassador_invites SET used_at = ? WHERE ambassador_id = ? AND used_at IS NULL', [now, req.params.id]);
      }
      if (result.changes) await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'ambassador_profile_updated', null, JSON.stringify({ ambassador_id: req.params.id, email_changed: emailChanged }), now]);
      return result.changes;
    });
    return updated ? res.json({ success: true }) : res.status(404).json({ error: 'Ambassadeur introuvable.' });
  });

  adminRouter.post('/commissions/:shopId/:action', async (req, res) => {
    const shopId = Number(req.params.shopId);
    const action = req.params.action;
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 160) : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !['approve', 'reject', 'paid'].includes(action) || (action === 'paid' && !reference)) return res.status(400).json({ error: 'Action ou référence de versement invalide.' });
    if (reason.length > 500) return res.status(400).json({ error: 'Le motif ne peut pas dépasser 500 caractères.' });
    if (['approve', 'reject'].includes(action) && reason.length < 3) return res.status(400).json({ error: 'Documentez le contrôle en 3 à 500 caractères avant de valider ou refuser la commission.' });
    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      let selfReferral = false;
      const update = action === 'approve'
        ? await (async () => {
          const referral = await transaction.get<{
            owner_name: string | null;
            owner_email: string | null;
            whatsapp_number: string;
            ambassador_name: string;
            ambassador_email: string | null;
            ambassador_phone: string | null;
          }>(`SELECT s.owner_name, s.owner_email, s.whatsapp_number, a.name AS ambassador_name,
                    a.email AS ambassador_email, a.phone AS ambassador_phone
            FROM ambassador_commissions c
            JOIN subscription_payment_intents p ON p.id = c.payment_id
            JOIN shops s ON s.id = c.shop_id
            JOIN ambassadors a ON a.id = c.ambassador_id
            WHERE c.shop_id = ? AND c.status = 'pending' AND p.status = 'paid' AND s.publication_status = 'active'
            ${databaseMode === 'postgresql' ? 'FOR UPDATE OF s, a' : ''}`, [shopId]);
          if (!referral) return { changes: 0 };
          const sameEmail = Boolean(referral.owner_email && referral.ambassador_email
            && referral.owner_email.toLowerCase() === referral.ambassador_email.toLowerCase());
          const ownerName = normalizeIdentityName(referral.owner_name);
          const ambassadorName = normalizeIdentityName(referral.ambassador_name);
          const sameName = ownerName.split(' ').length > 1
            && ambassadorName.split(' ').length > 1
            && ownerName === ambassadorName;
          const shopPhone = normalizeWhatsAppPhone(referral.whatsapp_number);
          const ambassadorPhone = normalizeWhatsAppPhone(referral.ambassador_phone);
          if (sameEmail || sameName || (shopPhone && ambassadorPhone && shopPhone === ambassadorPhone)) {
            selfReferral = true;
            return { changes: 0 };
          }
          return transaction.run(`UPDATE ambassador_commissions SET status = 'approved', approved_at = ? WHERE shop_id = ? AND status = 'pending'
            AND EXISTS (SELECT 1 FROM subscription_payment_intents p WHERE p.id = ambassador_commissions.payment_id AND p.status = 'paid')
            AND EXISTS (SELECT 1 FROM shops s JOIN ambassadors a ON a.id = ambassador_commissions.ambassador_id
              WHERE s.id = ambassador_commissions.shop_id AND s.publication_status = 'active'
                AND (a.email IS NULL OR LOWER(a.email) <> LOWER(s.owner_email)))`, [now, shopId]);
        })()
        : action === 'reject'
          ? await transaction.run("UPDATE ambassador_commissions SET status = 'cancelled' WHERE shop_id = ? AND status IN ('pending', 'approved')", [shopId])
          : await transaction.run(`UPDATE ambassador_commissions SET status = 'paid', paid_at = ?, payout_reference = ? WHERE shop_id = ? AND status = 'approved'
            AND EXISTS (SELECT 1 FROM subscription_payment_intents p WHERE p.id = ambassador_commissions.payment_id AND p.status = 'paid')`, [now, reference, shopId]);
      if (update.changes) await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)', ['super_admin', `ambassador_commission_${action}`, shopId, JSON.stringify({ reference: reference || null, reason: reason || null }), now]);
      if (update.changes && action === 'paid') {
        const commission = await transaction.get<{ ambassador_id: string; payment_id: string; amount: number; shop_name: string }>(
          'SELECT c.ambassador_id, c.payment_id, c.amount, s.name AS shop_name FROM ambassador_commissions c JOIN shops s ON s.id = c.shop_id WHERE c.shop_id = ?', [shopId],
        );
        if (!commission) throw new Error('Commission introuvable pendant le versement.');
        await transaction.run('INSERT INTO ambassador_payouts (id, ambassador_id, shop_id, shop_name, payment_id, amount, reference, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [randomUUID(), commission.ambassador_id, shopId, commission.shop_name, commission.payment_id, commission.amount, reference, now]);
      }
      return { changes: update.changes, selfReferral };
    });
    if (result.selfReferral) return res.status(409).json({ error: 'La commission ne peut pas être approuvée : les coordonnées ou le nom du commerçant correspondent à ceux de l’ambassadeur.' });
    return result.changes ? res.json({ success: true }) : res.status(409).json({ error: 'Action impossible : vérifiez le statut du paiement, la publication et la commission.' });
  });

  return { publicRouter, adminRouter };
}