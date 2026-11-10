import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction, databaseMode } from '../../db.ts';
import { createAmbassadorInvite, hashAmbassadorToken } from '../services/ambassadorInvites.ts';
import { buildSessionFingerprint, isRequestFingerprintMatch } from '../services/authSessions.ts';
import { notifyAmbassadorProgramEvent } from '../services/ambassadorNotifications.ts';
import { normalizeWhatsAppPhone } from '../services/businessRules.ts';
import { clearLoginAttempts, isLoginRateLimited } from '../services/rateLimits.ts';
import { isEmailMfaRequired, startEmailMfaChallenge, verifyEmailMfaChallenge } from '../services/emailMfa.ts';
import { requireSameOriginJsonRequest } from '../middleware/authRequestSecurity.ts';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const INVITE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomUUID(), 10);

function readCookie(request: Request, name: string) {
  const entry = String(request.headers.cookie || '').split(';').find((cookie) => cookie.trim().startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.trim().slice(name.length + 1)); } catch { return null; }
}

function setAmbassadorCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `matable_ambassador_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}${secure}`);
}

function clearAmbassadorCookie(response: Response) {
  response.setHeader('Set-Cookie', 'matable_ambassador_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

export function createAmbassadorAuthRouter(rateLimitPublicRequest: (limit?: number) => RequestHandler) {
  const router = Router();
  const protectedPostPaths = new Set(['/activate', '/login', '/login/verify', '/request-access']);
  router.use((request, response, next) => {
    if (request.method !== 'POST' || !protectedPostPaths.has(request.path)) return next();
    return requireSameOriginJsonRequest(request, response, next);
  });

  const getSession = async (request: Request, response?: Response) => {
    const token = readCookie(request, 'matable_ambassador_session');
    if (!token) return null;
    const session = await dbGet<{ ambassador_id: string; expires_at: number; fingerprint: string }>(
      'SELECT ambassador_id, expires_at, fingerprint FROM ambassador_sessions WHERE token = ?', [token],
    );
    if (!session || Number(session.expires_at) <= Date.now() || !isRequestFingerprintMatch(session, request)) {
      await dbRun('DELETE FROM ambassador_sessions WHERE token = ?', [token]);
      if (response) clearAmbassadorCookie(response);
      return null;
    }
    const ambassador = await dbGet<{ id: string; name: string; email: string; code: string; active: number }>(
      'SELECT id, name, email, code, active FROM ambassadors WHERE id = ?', [session.ambassador_id],
    );
    if (!ambassador?.active) {
      await dbRun('DELETE FROM ambassador_sessions WHERE token = ?', [token]);
      if (response) clearAmbassadorCookie(response);
      return null;
    }
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    await dbRun('UPDATE ambassador_sessions SET expires_at = ? WHERE token = ?', [expiresAt, token]);
    if (response) setAmbassadorCookie(response, token);
    return { token, expiresAt, ambassador };
  };

  router.post('/activate', rateLimitPublicRequest(10), async (request, response) => {
    const token = typeof request.body?.token === 'string' ? request.body.token.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!INVITE_TOKEN_PATTERN.test(token)) return response.status(400).json({ error: 'Lien d’activation invalide ou expiré.' });
    if (password.length < 12 || password.length > 128) return response.status(400).json({ error: 'Choisissez un mot de passe de 12 à 128 caractères.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const sessionToken = randomUUID();
    const fingerprint = buildSessionFingerprint(request);
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      const invite = await transaction.get<{ ambassador_id: string; password_hash: string | null }>(
        `SELECT i.ambassador_id, a.password_hash FROM ambassador_invites i JOIN ambassadors a ON a.id = i.ambassador_id
         WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ? AND a.active = 1${databaseMode === 'postgresql' ? ' FOR UPDATE OF i' : ''}`,
        [hashAmbassadorToken(token), now],
      );
      if (!invite) return false;
      const duplicateEmail = await transaction.get<{ id: string }>(
        'SELECT id FROM ambassadors WHERE LOWER(email) = (SELECT LOWER(email) FROM ambassadors WHERE id = ?) AND id <> ?',
        [invite.ambassador_id, invite.ambassador_id],
      );
      if (duplicateEmail) return false;
      const used = await transaction.run('UPDATE ambassador_invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
        [now, hashAmbassadorToken(token)]);
      if (used.changes !== 1) return false;
      await transaction.run('UPDATE ambassadors SET password_hash = ? WHERE id = ?', [passwordHash, invite.ambassador_id]);
      await transaction.run('DELETE FROM ambassador_sessions WHERE ambassador_id = ?', [invite.ambassador_id]);
      await transaction.run('INSERT INTO ambassador_sessions (token, ambassador_id, expires_at, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)',
        [sessionToken, invite.ambassador_id, expiresAt, fingerprint, now]);
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          'ambassador',
          invite.password_hash ? 'ambassador_account_recovered' : 'ambassador_account_activated',
          null,
          JSON.stringify({ ambassador_id: invite.ambassador_id }),
          now,
        ]);
      return true;
    });
    if (!result) return response.status(400).json({ error: 'Lien d’activation invalide, expiré ou déjà utilisé. Demandez un nouveau lien au support MaTable.' });
    setAmbassadorCookie(response, sessionToken);
    return response.json({ success: true });
  });

  router.post('/request-access', rateLimitPublicRequest(8), async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return response.status(400).json({ error: 'Saisissez une adresse e-mail valide.' });
    }

    const attemptKey = `ambassador-recovery:${request.ip}:${email}`;
    if (await isLoginRateLimited(attemptKey)) {
      return response.status(429).json({ error: 'Trop de demandes. Réessayez dans 15 minutes.' });
    }

    const matches = await dbAll<{ id: string; active: number; email: string | null }>(
      'SELECT id, active, email FROM ambassadors WHERE LOWER(email) = ? LIMIT 2',
      [email],
    );
    if (matches.length === 1 && matches[0].active && matches[0].email) {
      const appUrl = String(process.env.APP_URL || 'https://matable-ci.com').trim();
      await createAmbassadorInvite({
        ambassadorId: matches[0].id,
        appUrl,
        recovery: true,
        retainInviteOnEmailFailure: false,
      });
    }

    response.setHeader('Cache-Control', 'no-store');
    return response.status(202).json({
      success: true,
      message: 'Si un compte ambassadeur correspond à cette adresse, un lien de récupération va être envoyé.',
    });
  });

  router.post('/login', rateLimitPublicRequest(15), async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) {
      return response.status(400).json({ error: 'E-mail ou mot de passe invalide.' });
    }
    const attemptKey = `ambassador:${request.ip}:${email}`;
    if (await isLoginRateLimited(attemptKey)) return response.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const matches = await dbAll<{ id: string; name: string; email: string; code: string; active: number; password_hash: string | null; created_at: string }>(
      'SELECT id, name, email, code, active, password_hash, created_at FROM ambassadors WHERE LOWER(email) = ? LIMIT 2', [email],
    );
    const ambassador = matches.length === 1 ? matches[0] : undefined;
    const validPassword = await bcrypt.compare(password, ambassador?.password_hash || DUMMY_PASSWORD_HASH);
    if (!ambassador || !ambassador.active || !ambassador.password_hash || !validPassword) {
      return response.status(401).json({ error: 'Identifiants incorrects ou compte désactivé.' });
    }
    await clearLoginAttempts(attemptKey);
    if (isEmailMfaRequired(ambassador.created_at)) {
      const challenge = await startEmailMfaChallenge({
        subject: 'ambassador',
        subjectId: ambassador.id,
        email: ambassador.email,
        appUrl: String(process.env.APP_URL || 'http://localhost:3000').trim() || 'http://localhost:3000',
      });
      if ('error' in challenge) {
        console.error(`Unable to send ambassador authentication code: ${challenge.error}.`);
        return response.status(503).json({ error: 'Le code de sécurité ne peut pas être envoyé pour le moment. Réessayez plus tard.' });
      }
      response.setHeader('Cache-Control', 'no-store');
      return response.status(202).json({ success: true, mfa_required: true, challenge_id: challenge.challengeId, expires_at: new Date(challenge.expiresAt).toISOString() });
    }
    await dbRun('DELETE FROM ambassador_sessions WHERE expires_at <= ?', [Date.now()]);
    const token = randomUUID();
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    await dbRun('INSERT INTO ambassador_sessions (token, ambassador_id, expires_at, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)',
      [token, ambassador.id, expiresAt, buildSessionFingerprint(request), new Date().toISOString()]);
    setAmbassadorCookie(response, token);
    return response.json({ success: true });
  });

  router.post('/login/verify', rateLimitPublicRequest(10), async (request, response) => {
    const challengeId = typeof request.body?.challenge_id === 'string' ? request.body.challenge_id : '';
    const code = typeof request.body?.code === 'string' ? request.body.code : '';
    const verified = await verifyEmailMfaChallenge({ challengeId, code, subject: 'ambassador' });
    if (typeof verified === 'string') {
      const message = verified === 'expired' ? 'Le code a expiré. Reconnectez-vous pour en recevoir un nouveau.'
        : verified === 'locked' ? 'Trop de codes incorrects. Reconnectez-vous pour recommencer.'
          : 'Code de vérification incorrect.';
      return response.status(verified === 'locked' ? 429 : 401).json({ error: message });
    }
    const ambassador = await dbGet<{ id: string; email: string; active: number }>(
      'SELECT id, email, active FROM ambassadors WHERE id = ?', [verified.subjectId],
    );
    if (!ambassador?.active || ambassador.email.trim().toLowerCase() !== verified.email) {
      return response.status(401).json({ error: 'Le compte a changé. Reconnectez-vous.' });
    }
    await dbRun('DELETE FROM ambassador_sessions WHERE expires_at <= ?', [Date.now()]);
    const token = randomUUID();
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    await dbRun('INSERT INTO ambassador_sessions (token, ambassador_id, expires_at, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)',
      [token, ambassador.id, expiresAt, buildSessionFingerprint(request), new Date().toISOString()]);
    setAmbassadorCookie(response, token);
    return response.json({ success: true });
  });

  router.get('/session', async (request, response) => {
    const session = await getSession(request, response);
    return response.json({ authenticated: Boolean(session), ambassador: session ? {
      name: session.ambassador.name, email: session.ambassador.email, code: session.ambassador.code,
    } : null });
  });

  router.get('/dashboard', async (request, response) => {
    const session = await getSession(request, response);
    if (!session) return response.status(401).json({ error: 'Connexion ambassadeur requise.' });
    const ambassadorId = session.ambassador.id;
    const summary = await dbGet(`SELECT
      COUNT(*) AS registrations,
      COUNT(*) FILTER (WHERE s.publication_status = 'active') AS published,
      COUNT(*) FILTER (WHERE p.status = 'paid') AS paying,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status IN ('pending', 'approved', 'withdrawal_requested', 'paid')), 0) AS total_commissions,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'approved'), 0) AS available_commissions,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'withdrawal_requested'), 0) AS withdrawal_commissions,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'pending'), 0) AS pending_commissions,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'approved'), 0) AS approved_commissions,
      COALESCE(SUM(c.amount) FILTER (WHERE c.status = 'paid'), 0) AS paid_commissions
      FROM ambassador_referrals r JOIN shops s ON s.id = r.shop_id
      LEFT JOIN ambassador_commissions c ON c.shop_id = r.shop_id
      LEFT JOIN subscription_payment_intents p ON p.id = c.payment_id
      WHERE r.ambassador_id = ?`, [ambassadorId]);
    const referrals = await dbAll(`SELECT s.name AS shop_name, r.created_at, s.publication_status,
      p.tier, p.subscription_term, p.status AS payment_status,
      c.amount AS commission_amount, c.status AS commission_status, c.created_at AS commission_created_at,
      c.approved_at, c.paid_at
      FROM ambassador_referrals r JOIN shops s ON s.id = r.shop_id
      LEFT JOIN ambassador_commissions c ON c.shop_id = r.shop_id
      LEFT JOIN subscription_payment_intents p ON p.id = c.payment_id
      WHERE r.ambassador_id = ? ORDER BY r.created_at DESC`, [ambassadorId]);
    const payouts = await dbAll(`SELECT shop_name, amount, reference, paid_at FROM ambassador_payouts
      WHERE ambassador_id = ? ORDER BY paid_at DESC`, [ambassadorId]);
    const withdrawals = await dbAll(`SELECT id, amount, status, payout_method, payout_phone,
      created_at, processed_at, payout_reference, admin_reason FROM ambassador_withdrawals
      WHERE ambassador_id = ? ORDER BY created_at DESC`, [ambassadorId]);
    const now = new Date().toISOString();
    const linkStats = await dbGet<{ total_clicks: number; active_tokens: number; total_referrals: number; conversion_rate: number; last_click_at: string | null; last_referral_at: string | null }>(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ?), 0) AS total_clicks,
        COALESCE((SELECT COUNT(*) FROM ambassador_clicks WHERE ambassador_id = ? AND expires_at > ?), 0) AS active_tokens,
        COALESCE((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = ?), 0) AS total_referrals,
        CASE
          WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ?) > 0 THEN
            ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = ?) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ?), 2)
          ELSE 0
        END AS conversion_rate,
        (SELECT MAX(created_at) FROM ambassador_link_click_events WHERE ambassador_id = ?) AS last_click_at,
        (SELECT MAX(created_at) FROM ambassador_referrals WHERE ambassador_id = ?) AS last_referral_at
    `, [ambassadorId, ambassadorId, now, ambassadorId, ambassadorId, ambassadorId, ambassadorId, ambassadorId, ambassadorId]);
    const rangeDays = [7, 30, 90];
    const linkStatsByRange = Object.fromEntries(await Promise.all(rangeDays.map(async (days) => {
      const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString();
      const rangeData = await dbGet<{ total_clicks: number; total_referrals: number; conversion_rate: number; last_click_at: string | null; last_referral_at: string | null }>(`
        SELECT
          COALESCE((SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ?), 0) AS total_clicks,
          COALESCE((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = ? AND created_at >= ?), 0) AS total_referrals,
          CASE
            WHEN (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ?) > 0 THEN
              ROUND(((SELECT COUNT(*) FROM ambassador_referrals WHERE ambassador_id = ? AND created_at >= ?) * 100.0) / (SELECT COUNT(*) FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ?), 2)
            ELSE 0
          END AS conversion_rate,
          (SELECT MAX(created_at) FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ?) AS last_click_at,
          (SELECT MAX(created_at) FROM ambassador_referrals WHERE ambassador_id = ? AND created_at >= ?) AS last_referral_at
      `, [ambassadorId, startDate, ambassadorId, startDate, ambassadorId, startDate, ambassadorId, startDate, ambassadorId, startDate, ambassadorId, startDate, ambassadorId, startDate]);
      return [`${days}d`, {
        total_clicks: Number(rangeData?.total_clicks || 0),
        total_referrals: Number(rangeData?.total_referrals || 0),
        conversion_rate: Number(rangeData?.conversion_rate || 0),
        last_click_at: rangeData?.last_click_at || null,
        last_referral_at: rangeData?.last_referral_at || null,
      }];
    })));
    const windowStart = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
    const linkActivityRows = await dbAll<{ day: string; clicks: number }>(databaseMode === 'postgresql'
      ? `SELECT DATE(created_at) AS day, COUNT(*) AS clicks FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ? GROUP BY DATE(created_at)`
      : `SELECT date(created_at) AS day, COUNT(*) AS clicks FROM ambassador_link_click_events WHERE ambassador_id = ? AND created_at >= ? GROUP BY date(created_at)`,
      [ambassadorId, windowStart],
    );
    const referralActivityRows = await dbAll<{ day: string; referrals: number }>(databaseMode === 'postgresql'
      ? `SELECT DATE(created_at) AS day, COUNT(*) AS referrals FROM ambassador_referrals WHERE ambassador_id = ? AND created_at >= ? GROUP BY DATE(created_at)`
      : `SELECT date(created_at) AS day, COUNT(*) AS referrals FROM ambassador_referrals WHERE ambassador_id = ? AND created_at >= ? GROUP BY date(created_at)`,
      [ambassadorId, windowStart],
    );
    const linkActivityByDay = new Map<string, { clicks: number; referrals: number }>();
    for (const row of linkActivityRows) {
      const day = String(row.day).slice(0, 10);
      linkActivityByDay.set(day, { clicks: Number(row.clicks || 0), referrals: Number(linkActivityByDay.get(day)?.referrals || 0) });
    }
    for (const row of referralActivityRows) {
      const day = String(row.day).slice(0, 10);
      const current = linkActivityByDay.get(day) || { clicks: 0, referrals: 0 };
      current.referrals = Number(row.referrals || 0);
      linkActivityByDay.set(day, current);
    }
    const activityDates = Array.from({ length: 90 }, (_, index) => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - (89 - index));
      return date.toISOString().slice(0, 10);
    });
    const linkActivity = activityDates.map((day) => {
      const stats = linkActivityByDay.get(day) || { clicks: 0, referrals: 0 };
      return {
        date: day,
        clicks: Number(stats.clicks || 0),
        referrals: Number(stats.referrals || 0),
        conversion_rate: stats.clicks > 0 ? Number(((stats.referrals * 100) / stats.clicks).toFixed(1)) : 0,
      };
    });
    const recentLinkEvents = await dbAll<{ type: string; created_at: string; shop_name: string | null }>(`
      SELECT 'click' AS type, created_at, NULL AS shop_name FROM ambassador_link_click_events WHERE ambassador_id = ?
      UNION ALL
      SELECT 'referral' AS type, r.created_at, s.name AS shop_name
      FROM ambassador_referrals r LEFT JOIN shops s ON s.id = r.shop_id WHERE r.ambassador_id = ?
      ORDER BY created_at DESC LIMIT 12
    `, [ambassadorId, ambassadorId]);
    return response.json({ ambassador: {
      name: session.ambassador.name, email: session.ambassador.email, code: session.ambassador.code,
    }, summary, referrals, payouts, withdrawals, link_stats: {
      total_clicks: Number(linkStats?.total_clicks || 0),
      active_tokens: Number(linkStats?.active_tokens || 0),
      total_referrals: Number(linkStats?.total_referrals || 0),
      conversion_rate: Number(linkStats?.conversion_rate || 0),
      last_click_at: linkStats?.last_click_at || null,
      last_referral_at: linkStats?.last_referral_at || null,
    }, link_stats_by_range: linkStatsByRange, link_activity: linkActivity, recent_link_events: recentLinkEvents.map((event) => ({
      type: event.type,
      created_at: event.created_at,
      shop_name: event.shop_name,
      label: event.type === 'click' ? 'Clic sur le lien' : `Inscription attribuée${event.shop_name ? ` · ${event.shop_name}` : ''}`,
    })) });
  });

  router.get('/link-stats', async (request, response) => {
    const session = await getSession(request, response);
    if (!session) return response.status(401).json({ error: 'Connexion ambassadeur requise.' });
    const allTime = request.query.all === '1';
    const from = typeof request.query.from === 'string' ? request.query.from : '';
    const to = typeof request.query.to === 'string' ? request.query.to : '';
    if ((allTime && (from || to)) || (!allTime && (!from || !to))) {
      return response.status(400).json({ error: 'Indiquez une période complète ou demandez les statistiques depuis le début.' });
    }

    const isValidDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    const today = new Date().toISOString().slice(0, 10);
    if (!allTime && (!isValidDate(from) || !isValidDate(to) || from > to || to > today)) {
      return response.status(400).json({ error: 'Les dates demandées sont invalides.' });
    }

    const ambassadorId = session.ambassador.id;
    const where = allTime ? '' : ' AND created_at >= ? AND created_at < ?';
    const endExclusive = allTime
      ? null
      : new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const params: unknown[] = allTime
      ? [ambassadorId]
      : [ambassadorId, `${from}T00:00:00.000Z`, endExclusive];
    const [clickStats, referralStats, clickActivity, referralActivity] = await Promise.all([
      dbGet<{ total: number | string; last_at: string | null }>(
        `SELECT COUNT(*) AS total, MAX(created_at) AS last_at FROM ambassador_link_click_events WHERE ambassador_id = ?${where}`,
        params,
      ),
      dbGet<{ total: number | string; last_at: string | null }>(
        `SELECT COUNT(*) AS total, MAX(created_at) AS last_at FROM ambassador_referrals WHERE ambassador_id = ?${where}`,
        params,
      ),
      dbAll<{ day: string; total: number | string }>(
        databaseMode === 'postgresql'
          ? `SELECT DATE(created_at) AS day, COUNT(*) AS total FROM ambassador_link_click_events WHERE ambassador_id = ?${where} GROUP BY DATE(created_at)`
          : `SELECT date(created_at) AS day, COUNT(*) AS total FROM ambassador_link_click_events WHERE ambassador_id = ?${where} GROUP BY date(created_at)`,
        params,
      ),
      dbAll<{ day: string; total: number | string }>(
        databaseMode === 'postgresql'
          ? `SELECT DATE(created_at) AS day, COUNT(*) AS total FROM ambassador_referrals WHERE ambassador_id = ?${where} GROUP BY DATE(created_at)`
          : `SELECT date(created_at) AS day, COUNT(*) AS total FROM ambassador_referrals WHERE ambassador_id = ?${where} GROUP BY date(created_at)`,
        params,
      ),
    ]);

    const activityByDay = new Map<string, { clicks: number; referrals: number }>();
    for (const row of clickActivity) {
      activityByDay.set(String(row.day).slice(0, 10), { clicks: Number(row.total), referrals: 0 });
    }
    for (const row of referralActivity) {
      const day = String(row.day).slice(0, 10);
      const current = activityByDay.get(day) || { clicks: 0, referrals: 0 };
      current.referrals = Number(row.total);
      activityByDay.set(day, current);
    }
    const totalClicks = Number(clickStats?.total || 0);
    const totalReferrals = Number(referralStats?.total || 0);
    response.setHeader('Cache-Control', 'no-store');
    return response.json({
      from: allTime ? null : from,
      to: allTime ? null : to,
      total_clicks: totalClicks,
      total_referrals: totalReferrals,
      conversion_rate: totalClicks > 0 ? Math.round((totalReferrals / totalClicks) * 10000) / 100 : 0,
      last_click_at: clickStats?.last_at || null,
      last_referral_at: referralStats?.last_at || null,
      activity: [...activityByDay.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, counts]) => ({ date, ...counts })),
    });
  });

  router.post('/withdrawals', rateLimitPublicRequest(10), async (request, response) => {
    const session = await getSession(request, response);
    if (!session) return response.status(401).json({ error: 'Connexion ambassadeur requise.' });
    const payoutMethod = request.body?.payout_method;
    const allowedMethods = new Set(['wave', 'orange_money', 'mtn_momo', 'moov_money']);
    const payoutPhone = normalizeWhatsAppPhone(request.body?.payout_phone);
    if (typeof payoutMethod !== 'string' || !allowedMethods.has(payoutMethod) || !payoutPhone) {
      return response.status(400).json({ error: 'Choisissez un moyen de paiement et un numéro mobile money ivoirien valide.' });
    }
    const now = new Date().toISOString();
    const withdrawalId = randomUUID();
    const result = await dbTransaction(async (transaction) => {
      if (databaseMode === 'postgresql') await transaction.get('SELECT id FROM ambassadors WHERE id = ? FOR UPDATE', [session.ambassador.id]);
      const openWithdrawal = await transaction.get<{ id: string }>(
        "SELECT id FROM ambassador_withdrawals WHERE ambassador_id = ? AND status IN ('requested', 'approved') LIMIT 1",
        [session.ambassador.id],
      );
      if (openWithdrawal) return { status: 'already_requested' as const };
      const commissions = await transaction.all<{ shop_id: number; amount: number }>(`SELECT c.shop_id, c.amount
        FROM ambassador_commissions c JOIN subscription_payment_intents p ON p.id = c.payment_id
        WHERE c.ambassador_id = ? AND c.status = 'approved' AND p.status = 'paid'`, [session.ambassador.id]);
      const amount = commissions.reduce((total, commission) => total + Number(commission.amount), 0);
      if (!Number.isSafeInteger(amount) || amount <= 0) return { status: 'no_available_balance' as const };
      const inserted = await transaction.run(`INSERT INTO ambassador_withdrawals
        (id, ambassador_id, amount, status, payout_method, payout_phone, created_at)
        VALUES (?, ?, ?, 'requested', ?, ?, ?)`,
      [withdrawalId, session.ambassador.id, amount, payoutMethod, payoutPhone, now]);
      if (inserted.changes !== 1) throw new Error('Impossible de créer la demande de retrait.');
      const updated = await transaction.run(`UPDATE ambassador_commissions SET status = 'withdrawal_requested', withdrawal_id = ?
        WHERE ambassador_id = ? AND status = 'approved'
          AND EXISTS (SELECT 1 FROM subscription_payment_intents p WHERE p.id = ambassador_commissions.payment_id AND p.status = 'paid')`,
      [withdrawalId, session.ambassador.id]);
      if (updated.changes !== commissions.length) throw new Error('Le solde disponible a changé pendant la demande de retrait.');
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['ambassador', 'ambassador_withdrawal_requested', null, JSON.stringify({ ambassador_id: session.ambassador.id, withdrawal_id: withdrawalId, amount, payout_method: payoutMethod }), now]);
      return { status: 'requested' as const, amount };
    });
    if (result.status === 'already_requested') return response.status(409).json({ error: 'Une demande de retrait est déjà en cours.' });
    if (result.status === 'no_available_balance') return response.status(409).json({ error: 'Aucune commission validée n’est disponible pour un retrait.' });
    await notifyAmbassadorProgramEvent({
      ambassadorId: session.ambassador.id,
      name: session.ambassador.name,
      email: session.ambassador.email,
      event: 'withdrawal_requested',
      amount: result.amount,
    });
    return response.status(201).json({ withdrawal: { id: withdrawalId, amount: result.amount, status: 'requested' } });
  });

  router.post('/withdrawals/:id/cancel', rateLimitPublicRequest(10), async (request, response) => {
    const session = await getSession(request, response);
    if (!session) return response.status(401).json({ error: 'Connexion ambassadeur requise.' });
    const withdrawalId = String(request.params.id || '').trim();
    const now = new Date().toISOString();
    const cancelled = await dbTransaction(async (transaction) => {
      const withdrawal = await transaction.get<{ id: string; amount: number }>(
        `SELECT id, amount FROM ambassador_withdrawals WHERE id = ? AND ambassador_id = ? AND status = 'requested'${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [withdrawalId, session.ambassador.id],
      );
      if (!withdrawal) return false;
      const updated = await transaction.run(`UPDATE ambassador_withdrawals SET status = 'rejected', processed_at = ?, admin_reason = ?
        WHERE id = ? AND ambassador_id = ? AND status = 'requested'`,
      [now, 'Annulée par l’ambassadeur avant traitement.', withdrawalId, session.ambassador.id]);
      if (updated.changes !== 1) return false;
      await transaction.run(`UPDATE ambassador_commissions SET status = 'approved', withdrawal_id = NULL
        WHERE withdrawal_id = ? AND status = 'withdrawal_requested'`, [withdrawalId]);
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['ambassador', 'ambassador_withdrawal_cancelled_by_owner', null, JSON.stringify({ ambassador_id: session.ambassador.id, withdrawal_id: withdrawalId }), now]);
      return { amount: Number(withdrawal.amount) };
    });
    if (!cancelled) return response.status(409).json({ error: 'Cette demande n’est plus annulable ; contactez l’assistance si une correction est nécessaire.' });
    await notifyAmbassadorProgramEvent({
      ambassadorId: session.ambassador.id,
      name: session.ambassador.name,
      email: session.ambassador.email,
      event: 'withdrawal_cancelled',
      amount: cancelled.amount,
      reason: 'Vous avez annulé la demande. Le solde est de nouveau disponible.',
    });
    return response.json({ success: true });
  });

  router.post('/password', rateLimitPublicRequest(10), async (request, response) => {
    const session = await getSession(request, response);
    if (!session) return response.status(401).json({ error: 'Connexion ambassadeur requise.' });
    const currentPassword = typeof request.body?.current_password === 'string' ? request.body.current_password : '';
    const newPassword = typeof request.body?.new_password === 'string' ? request.body.new_password : '';
    if (!currentPassword || currentPassword.length > 128) return response.status(400).json({ error: 'Saisissez votre mot de passe actuel.' });
    if (newPassword.length < 12 || newPassword.length > 128) return response.status(400).json({ error: 'Choisissez un nouveau mot de passe de 12 à 128 caractères.' });
    const account = await dbGet<{ password_hash: string | null }>('SELECT password_hash FROM ambassadors WHERE id = ?', [session.ambassador.id]);
    if (!account?.password_hash || !await bcrypt.compare(currentPassword, account.password_hash)) {
      return response.status(401).json({ error: 'Le mot de passe actuel est incorrect.' });
    }
    if (await bcrypt.compare(newPassword, account.password_hash)) {
      return response.status(400).json({ error: 'Choisissez un mot de passe différent de l’actuel.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const expiresAt = Date.now() + SESSION_DURATION_MS;
    const now = new Date().toISOString();
    await dbTransaction(async (transaction) => {
      await transaction.run('UPDATE ambassadors SET password_hash = ? WHERE id = ?', [passwordHash, session.ambassador.id]);
      await transaction.run('DELETE FROM ambassador_sessions WHERE ambassador_id = ? AND token <> ?', [session.ambassador.id, session.token]);
      await transaction.run('UPDATE ambassador_sessions SET expires_at = ? WHERE token = ?', [expiresAt, session.token]);
      await transaction.run('INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        ['ambassador', 'ambassador_password_changed', null, JSON.stringify({ ambassador_id: session.ambassador.id }), now]);
    });
    setAmbassadorCookie(response, session.token);
    return response.json({ success: true });
  });

  router.post('/logout', async (request, response) => {
    const token = readCookie(request, 'matable_ambassador_session');
    if (token) await dbRun('DELETE FROM ambassador_sessions WHERE token = ?', [token]);
    clearAmbassadorCookie(response);
    return response.json({ success: true });
  });

  return router;
}