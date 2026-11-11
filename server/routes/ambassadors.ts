import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction, databaseMode } from '../../db.ts';
import { AMBASSADOR_REFERRAL_DURATION_MS, normalizeAmbassadorCode } from '../../src/utils/ambassadors.ts';
import { createAmbassadorInvite, hashAmbassadorToken } from '../services/ambassadorInvites.ts';
import { notifyAmbassadorProgramEvent } from '../services/ambassadorNotifications.ts';
import { normalizeWhatsAppPhone } from '../services/businessRules.ts';
import { requireSameOriginJsonRequest } from '../middleware/authRequestSecurity.ts';
import { sendAmbassadorApplicationEmail } from '../services/email.ts';

const normalizeIdentityName = (value: string | null | undefined) => String(value || '')
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

type AmbassadorAdminRow = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  active: number | string;
  created_at: string;
  has_account: number | string;
  invite_expires_at: string | null;
  registrations: number | string;
  published: number | string;
  paying: number | string;
  commissions: number | string;
  total_clicks: number | string;
  active_tokens: number | string;
  total_referrals: number | string;
  conversion_rate: number | string;
  last_click_at: string | null;
  clicks_7d: number | string;
  clicks_30d: number | string;
  clicks_90d: number | string;
  referrals_7d: number | string;
  referrals_30d: number | string;
  referrals_90d: number | string;
  conversion_7d: number | string;
  conversion_30d: number | string;
  conversion_90d: number | string;
};

export function createAmbassadorRouters(rateLimitPublicRequest: (limit?: number) => RequestHandler) {
  const publicRouter = Router();
  const adminRouter = Router();

  publicRouter.post('/ambassador-applications', rateLimitPublicRequest(8), requireSameOriginJsonRequest, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || email.length > 254 || phone.length > 30) {
      return res.status(400).json({ error: 'Vérifiez votre nom, votre adresse e-mail et votre téléphone.' });
    }

    const existingAmbassador = await dbGet<{ id: string }>(
      'SELECT id FROM ambassadors WHERE LOWER(email) = ? LIMIT 1',
      [email],
    );
    let applicationCreated = false;
    if (!existingAmbassador) {
      const now = new Date().toISOString();
      const inserted = await dbRun(
        'INSERT INTO ambassador_applications (id, name, email, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [randomUUID(), name, email, phone || null, 'pending', now],
      );
      applicationCreated = inserted.changes === 1;
    }

    if (applicationCreated) {
      const delivery = await sendAmbassadorApplicationEmail({
        name,
        email,
        status: 'received',
        appUrl: String(process.env.APP_URL || 'https://matable-ci.com').trim(),
      });
      if (!delivery.sent && delivery.error !== 'email_disabled_in_test') {
        console.error(`Unable to send ambassador application receipt: ${delivery.error || 'unknown_error'}.`);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(202).json({
      success: true,
      message: 'Votre candidature a été reçue. Elle sera examinée avant toute activation de compte ou de code ambassadeur.',
    });
  });

  publicRouter.post('/ambassador-clicks', rateLimitPublicRequest(30), requireSameOriginJsonRequest, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = normalizeAmbassadorCode(req.body?.code);
    const ambassador = code && await dbGet<{ id: string }>('SELECT id FROM ambassadors WHERE code = ? AND active = 1', [code]);
    if (!ambassador) return res.status(404).json({ error: 'Code ambassadeur invalide.' });
    const now = new Date();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(now.getTime() + AMBASSADOR_REFERRAL_DURATION_MS).toISOString();
    await dbRun('INSERT INTO ambassador_clicks (token_hash, ambassador_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [hashAmbassadorToken(token), ambassador.id, now.toISOString(), expiresAt]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ token, expires_at: expiresAt });
  });

  publicRouter.post('/ambassador-link-visits', rateLimitPublicRequest(30), requireSameOriginJsonRequest, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const code = normalizeAmbassadorCode(req.body?.code);
    const ambassador = code && await dbGet<{ id: string }>(
      'SELECT id FROM ambassadors WHERE code = ? AND active = 1',
      [code],
    );
    if (!ambassador) return res.status(404).json({ error: 'Code ambassadeur invalide.' });
    await dbRun(
      'INSERT INTO ambassador_link_click_events (event_id, ambassador_id, created_at) VALUES (?, ?, ?)',
      [randomUUID(), ambassador.id, new Date().toISOString()],
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ success: true });
  });

  adminRouter.get('/overview', async (req, res) => {
    const requestedDays = typeof req.query.days === 'string' ? req.query.days : '30';
    if (!['7', '30', '90'].includes(requestedDays)) {
      return res.status(400).json({ error: 'Période de statistiques invalide.' });
    }

    const days = Number(requestedDays);
    const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const summary = await dbGet<{
      ambassadors_total: number | string;
      ambassadors_active: number | string;
      clicks: number | string;
      referrals: number | string;
      active_link_tokens: number | string;
      pending_applications: number | string;
    }>(`SELECT
      (SELECT COUNT(*) FROM ambassadors) AS ambassadors_total,
      (SELECT COUNT(*) FROM ambassadors WHERE active = 1) AS ambassadors_active,
      (SELECT COUNT(*) FROM ambassador_link_click_events WHERE created_at >= ?) AS clicks,
      (SELECT COUNT(*) FROM ambassador_referrals WHERE created_at >= ?) AS referrals,
      (SELECT COUNT(*) FROM ambassador_clicks WHERE expires_at > ?) AS active_link_tokens,
      (SELECT COUNT(*) FROM ambassador_applications WHERE status = 'pending') AS pending_applications`,
    [since, since, now]);

    if (!summary) throw new Error('Impossible de calculer les statistiques ambassadeurs.');
    const clicks = Number(summary.clicks);
    const referrals = Number(summary.referrals);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      days,
      ambassadors_total: Number(summary.ambassadors_total),
      ambassadors_active: Number(summary.ambassadors_active),
      clicks,
      referrals,
      active_link_tokens: Number(summary.active_link_tokens),
      pending_applications: Number(summary.pending_applications),
      conversion_rate: clicks > 0 ? Math.round((referrals / clicks) * 10000) / 100 : 0,
    });
  });

  adminRouter.get('/', async (_req, res) => {
    const now = new Date().toISOString();
    const applications = await dbAll(
      'SELECT id, name, email, phone, status, created_at, decided_at, decision_reason FROM ambassador_applications ORDER BY CASE WHEN status = ? THEN 0 ELSE 1 END, created_at DESC',
      ['pending'],
    );
    const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const ambassadorRows = await dbAll<AmbassadorAdminRow>(`SELECT a.id, a.name, a.code, a.email, a.phone, a.active, a.created_at,
      CASE WHEN a.password_hash IS NULL THEN 0 ELSE 1 END AS has_account,
      (SELECT i.expires_at FROM ambassador_invites i WHERE i.ambassador_id = a.id AND i.used_at IS NULL
        ORDER BY i.created_at DESC LIMIT 1) AS invite_expires_at,
      (SELECT COUNT(*) FROM ambassador_referrals r WHERE r.ambassador_id = a.id) AS registrations,
      (SELECT COUNT(*) FROM ambassador_referrals r JOIN shops s ON s.id = r.shop_id WHERE r.ambassador_id = a.id AND s.publication_status = 'active') AS published,
      (SELECT COUNT(*) FROM ambassador_commissions c JOIN subscription_payment_intents p ON p.id = c.payment_id WHERE c.ambassador_id = a.id AND p.status = 'paid' AND c.status <> 'cancelled') AS paying,
      (SELECT COALESCE(SUM(c.amount), 0) FROM ambassador_commissions c WHERE c.ambassador_id = a.id AND c.status IN ('pending', 'approved', 'withdrawal_requested', 'paid')) AS commissions,
      (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id) AS total_clicks,
      (SELECT COUNT(*) FROM ambassador_clicks WHERE ambassador_id = a.id AND expires_at > ?) AS active_tokens,
      (SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id) AS total_referrals,
      CASE WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id) > 0 THEN
        ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id), 2)
      ELSE 0 END AS conversion_rate,
      (SELECT MAX(created_at) FROM ambassador_link_click_events WHERE ambassador_id = a.id) AS last_click_at,
      (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) AS clicks_7d,
      (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) AS clicks_30d,
      (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) AS clicks_90d,
      (SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) AS referrals_7d,
      (SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) AS referrals_30d,
      (SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) AS referrals_90d,
      CASE WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) > 0 THEN
        ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?), 2)
      ELSE 0 END AS conversion_7d,
      CASE WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) > 0 THEN
        ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?), 2)
      ELSE 0 END AS conversion_30d,
      CASE WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?) > 0 THEN
        ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = a.id AND created_at >= ?) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = a.id AND created_at >= ?), 2)
      ELSE 0 END AS conversion_90d
      FROM ambassadors a ORDER BY a.created_at DESC`, [
      now,
      sevenDaysAgo,
      thirtyDaysAgo,
      ninetyDaysAgo,
      sevenDaysAgo,
      thirtyDaysAgo,
      ninetyDaysAgo,
      sevenDaysAgo,
      sevenDaysAgo,
      sevenDaysAgo,
      thirtyDaysAgo,
      thirtyDaysAgo,
      thirtyDaysAgo,
      ninetyDaysAgo,
      ninetyDaysAgo,
      ninetyDaysAgo,
    ]);
    const ambassadors = ambassadorRows.map((ambassador) => ({
      ...ambassador,
      active: Number(ambassador.active),
      has_account: Number(ambassador.has_account),
      registrations: Number(ambassador.registrations),
      published: Number(ambassador.published),
      paying: Number(ambassador.paying),
      commissions: Number(ambassador.commissions),
      total_clicks: Number(ambassador.total_clicks),
      active_tokens: Number(ambassador.active_tokens),
      total_referrals: Number(ambassador.total_referrals),
      conversion_rate: Number(ambassador.conversion_rate),
      clicks_7d: Number(ambassador.clicks_7d),
      clicks_30d: Number(ambassador.clicks_30d),
      clicks_90d: Number(ambassador.clicks_90d),
      referrals_7d: Number(ambassador.referrals_7d),
      referrals_30d: Number(ambassador.referrals_30d),
      referrals_90d: Number(ambassador.referrals_90d),
      conversion_7d: Number(ambassador.conversion_7d),
      conversion_30d: Number(ambassador.conversion_30d),
      conversion_90d: Number(ambassador.conversion_90d),
    }));
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
    res.json({ applications, ambassadors, referrals, payouts, withdrawals });
  });

  adminRouter.post('/applications/:id/:action', async (req, res) => {
    const applicationId = String(req.params.id || '').trim();
    const action = req.params.action;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
    if (!applicationId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action de candidature invalide.' });
    }
    if (action === 'reject' && reason.length < 3) {
      return res.status(400).json({ error: 'Indiquez un motif de refus de 3 à 500 caractères.' });
    }

    const now = new Date().toISOString();
    const outcome = await dbTransaction(async (transaction) => {
      const application = await transaction.get<{
        id: string; name: string; email: string; phone: string | null; status: string;
      }>(
        `SELECT id, name, email, phone, status FROM ambassador_applications WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [applicationId],
      );
      if (!application) return { status: 'not_found' as const };
      if (application.status !== 'pending') return { status: 'already_decided' as const };

      if (action === 'reject') {
        await transaction.run(
          "UPDATE ambassador_applications SET status = 'rejected', decided_at = ?, decision_reason = ? WHERE id = ? AND status = 'pending'",
          [now, reason, applicationId],
        );
        await transaction.run(
          'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
          ['super_admin', 'ambassador_application_rejected', null, JSON.stringify({ application_id: applicationId, reason }), now],
        );
        return { status: 'rejected' as const, name: application.name, email: application.email };
      }

      const existing = await transaction.get<{ id: string }>(
        'SELECT id FROM ambassadors WHERE LOWER(email) = ? LIMIT 1',
        [application.email.toLowerCase()],
      );
      if (existing) return { status: 'duplicate_email' as const };

      const ambassadorId = randomUUID();
      const code = `MT${randomBytes(6).toString('hex').toUpperCase()}`;
      await transaction.run(
        'INSERT INTO ambassadors (id, name, code, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [ambassadorId, application.name, code, application.email, application.phone, now],
      );
      const updated = await transaction.run(
        "UPDATE ambassador_applications SET status = 'approved', decided_at = ?, ambassador_id = ? WHERE id = ? AND status = 'pending'",
        [now, ambassadorId, applicationId],
      );
      if (updated.changes !== 1) throw new Error('La candidature a changé pendant son approbation.');
      await transaction.run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['super_admin', 'ambassador_application_approved', null, JSON.stringify({ application_id: applicationId, ambassador_id: ambassadorId }), now],
      );
      return { status: 'approved' as const, ambassadorId };
    });

    if (outcome.status === 'not_found') return res.status(404).json({ error: 'Candidature introuvable.' });
    if (outcome.status === 'already_decided') return res.status(409).json({ error: 'Cette candidature a déjà été traitée.' });
    if (outcome.status === 'duplicate_email') return res.status(409).json({ error: 'Cette adresse est déjà associée à un compte ambassadeur.' });
    if (outcome.status === 'rejected') {
      const delivery = await sendAmbassadorApplicationEmail({
        name: outcome.name,
        email: outcome.email,
        status: 'rejected',
        appUrl: String(process.env.APP_URL || 'https://matable-ci.com').trim(),
      });
      if (!delivery.sent && delivery.error !== 'email_disabled_in_test') {
        console.error(`Unable to send ambassador application decision: ${delivery.error || 'unknown_error'}.`);
      }
      return res.json({ success: true, status: 'rejected', email_sent: delivery.sent });
    }

    const appUrl = String(process.env.APP_URL || 'https://matable-ci.com').trim();
    const invite = await createAmbassadorInvite({
      ambassadorId: outcome.ambassadorId,
      appUrl,
      recovery: false,
      retainInviteOnEmailFailure: true,
    });
    if (invite.status !== 'created') throw new Error(`Impossible de créer l’invitation du compte ambassadeur approuvé: ${invite.status}.`);
    return res.json({
      success: true,
      status: 'approved',
      email_sent: invite.emailSent,
      ...(!invite.emailSent ? { invite_url: invite.inviteUrl, expires_at: invite.expiresAt } : {}),
    });
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
    const appUrl = String(process.env.APP_URL || 'https://matable-ci.com').trim();
    const result = await createAmbassadorInvite({
      ambassadorId: req.params.id,
      appUrl,
      recovery: false,
      retainInviteOnEmailFailure: true,
    });
    if (result.status === 'not_found') return res.status(404).json({ error: 'Ambassadeur introuvable.' });
    if (result.status === 'inactive') return res.status(409).json({ error: 'Réactivez cet ambassadeur avant de générer un accès.' });
    if (result.status === 'missing_email') return res.status(409).json({ error: 'Ajoutez une adresse e-mail à cet ambassadeur avant de générer son accès.' });
    return res.status(201).json({
      invite_url: result.inviteUrl,
      expires_at: result.expiresAt,
      email_sent: result.emailSent,
    });
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
      const withdrawal = await transaction.get<{
        id: string; ambassador_id: string; amount: number; status: string;
        ambassador_name: string; ambassador_email: string | null;
      }>(
        `SELECT w.id, w.ambassador_id, w.amount, w.status, a.name AS ambassador_name, a.email AS ambassador_email
         FROM ambassador_withdrawals w JOIN ambassadors a ON a.id = w.ambassador_id
         WHERE w.id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE OF w' : ''}`,
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
      return {
        status: 'updated' as const,
        notification: {
          ambassadorId: withdrawal.ambassador_id,
          name: withdrawal.ambassador_name,
          email: withdrawal.ambassador_email,
          event: action === 'approve' ? 'withdrawal_approved' as const
            : action === 'reject' ? 'withdrawal_rejected' as const : 'withdrawal_paid' as const,
          amount: Number(withdrawal.amount),
          reference: action === 'paid' ? reference : null,
          reason: action === 'reject' ? reason : null,
        },
      };
    });
    if (result === 'not_found') return res.status(404).json({ error: 'Demande de retrait introuvable.' });
    if (result === 'payment_review') return res.status(409).json({ error: 'Un paiement lié n’est plus confirmé. Examinez le dossier avant de traiter ce retrait.' });
    if (result === 'conflict') return res.status(409).json({ error: 'Cette demande a changé ou ne correspond plus aux commissions disponibles.' });
    await notifyAmbassadorProgramEvent(result.notification);
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
      const commission = await transaction.get<{
        ambassador_id: string;
        ambassador_name: string;
        ambassador_email: string | null;
        amount: number;
        shop_name: string;
      }>(`SELECT c.ambassador_id, a.name AS ambassador_name, a.email AS ambassador_email,
                c.amount, s.name AS shop_name
        FROM ambassador_commissions c
        JOIN ambassadors a ON a.id = c.ambassador_id
        JOIN shops s ON s.id = c.shop_id
        WHERE c.shop_id = ?`, [shopId]);
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
      return {
        changes: update.changes,
        selfReferral,
        notification: update.changes && commission ? {
          ambassadorId: commission.ambassador_id,
          name: commission.ambassador_name,
          email: commission.ambassador_email,
          event: action === 'approve' ? 'commission_approved' as const
            : action === 'reject' ? 'commission_rejected' as const : 'commission_paid' as const,
          amount: Number(commission.amount),
          shopName: commission.shop_name,
          reference: action === 'paid' ? reference : null,
          reason: null,
        } : null,
      };
    });
    if (result.selfReferral) return res.status(409).json({ error: 'La commission ne peut pas être approuvée : les coordonnées ou le nom du commerçant correspondent à ceux de l’ambassadeur.' });
    if (!result.changes) return res.status(409).json({ error: 'Action impossible : vérifiez le statut du paiement, la publication et la commission.' });
    if (result.notification) await notifyAmbassadorProgramEvent(result.notification);
    return res.json({ success: true });
  });

  return { publicRouter, adminRouter };
}