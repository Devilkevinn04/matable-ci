import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { sendMerchantPush } from '../services/pushNotifications.ts';
import {
  DIDIT_FINISHED_STATUSES,
  DIDIT_MAX_FINISHED_SESSIONS_PER_30_DAYS,
  DIDIT_UUID_PATTERN,
  canRestartDiditSession,
  describeDiditDeclineReasons,
  extractDiditDeclineReasons,
  isDiditSession,
  mapDiditStatus,
  parseDiditDeclineReasons,
  validateDiditWebhook,
} from '../services/didit.ts';

const CONSENT_VERSION = 'didit-v1';

type DbRun = (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
type DbGet = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
type DbAll = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type Transaction = {
  get: DbGet;
  run: DbRun;
};
type DbTransaction = <T>(operation: (transaction: Transaction) => Promise<T>) => Promise<T>;

interface MerchantVerificationOptions {
  dbRun: DbRun;
  dbGet: DbGet;
  dbAll: DbAll;
  dbTransaction: DbTransaction;
  requireMerchantIdentityOwnShop: RequestHandler;
  /** Limite les tentatives de création de session (5 par fenêtre côté routeur). */
  rateLimitPublicRequest?: (limit?: number) => RequestHandler;
}


export function createMerchantVerificationRouter(options: MerchantVerificationOptions) {
  const { dbRun, dbGet, dbAll, dbTransaction, requireMerchantIdentityOwnShop } = options;
  const router = Router();
  const webhookRouter = Router();
  const sessionRateLimit: RequestHandler = options.rateLimitPublicRequest
    ? options.rateLimitPublicRequest(5)
    : (_req, _res, next) => next();
  const finishedStatusPlaceholders = DIDIT_FINISHED_STATUSES.map(() => '?').join(', ');

  async function refreshDeclineReasons(sessionId: string): Promise<void> {
    const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
    if (!apiKey || !DIDIT_UUID_PATTERN.test(sessionId)) return;
    try {
      const response = await fetch(`https://verification.didit.me/v3/session/${sessionId}/decision/`, {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.error('Didit decision fetch failed:', response.status);
        return;
      }
      const decision: unknown = await response.json();
      const reasons = extractDiditDeclineReasons(decision);
      await dbRun(
        'UPDATE didit_verification_sessions SET decline_reasons = ?, decision_fetched_at = ? WHERE session_id = ?',
        [JSON.stringify(reasons), new Date().toISOString(), sessionId],
      );
    } catch (error) {
      console.error('Didit decision fetch failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  router.get('/:id/identity-verification', requireMerchantIdentityOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const [shop, session] = await Promise.all([
      dbGet<{ merchant_verification_status: string }>('SELECT merchant_verification_status FROM shops WHERE id = ?', [shopId]),
      dbGet<{
        session_id: string;
        status: string;
        created_at: string;
        last_webhook_at: string | null;
        session_url: string | null;
        decline_reasons: string | null;
      }>(
        `SELECT session_id, status, created_at, last_webhook_at, session_url, decline_reasons
         FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1`,
        [shopId],
      ),
    ]);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const mappedStatus = session ? mapDiditStatus(session.status) : shop.merchant_verification_status;
    const declineReasons = parseDiditDeclineReasons(session?.decline_reasons);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: mappedStatus,
      provider_status: session?.status || null,
      session_id: session?.session_id || null,
      session_url: session?.session_url || null,
      resume_available: Boolean(session?.session_url && mappedStatus === 'submitted'),
      restart_available: !session || canRestartDiditSession({
        status: session.status,
        lastWebhookAt: session.last_webhook_at,
        createdAt: session.created_at,
      }),
      submitted_at: session?.created_at || null,
      reviewer_note: null,
      decline_reasons: declineReasons,
      decline_advice: describeDiditDeclineReasons(declineReasons),
    });
  });

  router.post('/:id/identity-verification/session', sessionRateLimit, requireMerchantIdentityOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await dbGet<{ id: number; merchant_verification_status: string }>(
      'SELECT id, merchant_verification_status FROM shops WHERE id = ?',
      [shopId],
    );
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.merchant_verification_status === 'verified') return res.status(409).json({ error: 'Cette identité a déjà été vérifiée.' });
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Votre consentement explicite est requis pour continuer.' });
    const latestSession = await dbGet<{ status: string; created_at: string; last_webhook_at: string | null }>(
      'SELECT status, created_at, last_webhook_at FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
      [shopId],
    );
    if (latestSession && !canRestartDiditSession({
      status: latestSession.status,
      lastWebhookAt: latestSession.last_webhook_at,
      createdAt: latestSession.created_at,
    })) {
      return res.status(409).json({ error: 'Une vérification Didit est déjà en cours. Reprenez la session ouverte ou attendez 30 minutes avant d’en démarrer une autre.' });
    }
    const finishedWindowStart = new Date(Date.now() - 30 * 86400000).toISOString();
    const finishedSessions = await dbGet<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM didit_verification_sessions
       WHERE shop_id = ? AND created_at >= ? AND status IN (${finishedStatusPlaceholders})`,
      [shopId, finishedWindowStart, ...DIDIT_FINISHED_STATUSES],
    );
    if (Number(finishedSessions?.count || 0) >= DIDIT_MAX_FINISHED_SESSIONS_PER_30_DAYS) {
      return res.status(429).json({
        error: 'Trop de vérifications terminées sur les 30 derniers jours. Contactez l’assistance pour débloquer votre dossier.',
      });
    }

    const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
    const workflowId = String(process.env.DIDIT_WORKFLOW_ID || '').trim();
    if (!apiKey || !DIDIT_UUID_PATTERN.test(workflowId)) {
      return res.status(503).json({ error: 'La vérification Didit n’est pas encore configurée.' });
    }
    const appUrl = String(process.env.APP_URL || '').trim();
    let callback: string;
    try {
      const origin = new URL(appUrl);
      if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('APP_URL doit utiliser HTTPS.');
      callback = new URL('/app?verification=complete', origin).toString();
    } catch {
      return res.status(503).json({ error: 'L’URL de retour de vérification n’est pas correctement configurée.' });
    }

    const providerResponse = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: `matable-shop-${shop.id}-${randomUUID()}`,
        callback,
        callback_method: 'both',
        language: 'fr',
        metadata: { shop_id: String(shop.id) },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const providerPayload: unknown = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      console.error('Didit session creation failed:', providerResponse.status);
      return res.status(providerResponse.status === 429 ? 503 : 502).json({
        error: 'Didit n’a pas pu démarrer la vérification. Réessayez ou contactez le support.',
      });
    }
    if (!isDiditSession(providerPayload)) {
      console.error('Didit returned an invalid session response.');
      return res.status(502).json({ error: 'La réponse de Didit est invalide. Réessayez plus tard.' });
    }

    const consentAt = new Date().toISOString();
    const creationResult = await dbTransaction(async (transaction) => {
      if (process.env.NODE_ENV === 'production') {
        await transaction.get('SELECT id FROM shops WHERE id = ? FOR UPDATE', [shop.id]);
      }
      const currentShop = await transaction.get<{ merchant_verification_status: string }>(
        'SELECT merchant_verification_status FROM shops WHERE id = ?',
        [shop.id],
      );
      if (!currentShop) return 'shop_missing';
      if (currentShop.merchant_verification_status === 'verified') return 'already_verified';
      const latestSession = await transaction.get<{ created_at: string; status: string; last_webhook_at: string | null }>(
        'SELECT created_at, status, last_webhook_at FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
        [shop.id],
      );
      if (latestSession && !canRestartDiditSession({
        status: latestSession.status,
        lastWebhookAt: latestSession.last_webhook_at,
        createdAt: latestSession.created_at,
      })) {
        return 'verification_in_progress';
      }
      const currentTime = Date.now();
      const latestTime = latestSession ? Date.parse(latestSession.created_at) : 0;
      const createdAt = new Date(Math.max(currentTime, latestTime + 1)).toISOString();
      const inserted = await transaction.run(`INSERT INTO didit_verification_sessions
        (session_id, shop_id, workflow_id, status, consent_at, consent_version, created_at, updated_at, session_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO NOTHING`,
      [providerPayload.session_id, shop.id, workflowId, providerPayload.status, consentAt, CONSENT_VERSION, createdAt, createdAt, providerPayload.url]);
      if (inserted.changes !== 1) {
        const existingSession = await transaction.get<{ shop_id: number; workflow_id: string }>(
          'SELECT shop_id, workflow_id FROM didit_verification_sessions WHERE session_id = ?',
          [providerPayload.session_id],
        );
        if (!existingSession || existingSession.shop_id !== shop.id || existingSession.workflow_id !== workflowId) {
          return 'duplicate_session';
        }
      }
      await transaction.run(`UPDATE shops SET merchant_verification_status = 'submitted',
        publication_status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'draft' END WHERE id = ?`, [shop.id]);
      return 'created';
    });
    if (creationResult === 'already_verified') return res.status(409).json({ error: 'Cette identité a déjà été vérifiée.' });
    if (creationResult === 'shop_missing') return res.status(404).json({ error: 'Boutique introuvable.' });
    if (creationResult === 'verification_in_progress') {
      return res.status(409).json({ error: 'Une vérification Didit est déjà en cours. Reprenez la session ouverte ou attendez 30 minutes avant d’en démarrer une autre.' });
    }
    if (creationResult === 'duplicate_session') {
      console.error('Didit returned a duplicate session ID; refusing to associate it with another shop.');
      return res.status(502).json({ error: 'Didit a renvoyé une session invalide. Réessayez plus tard.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({
      session_id: providerPayload.session_id,
      session_url: providerPayload.url,
      status: mapDiditStatus(providerPayload.status),
      submitted_at: consentAt,
    });
  });

  const adminRouter = Router();
  adminRouter.get('/', async (_req, res) => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const [rows, merchantUsage, courierUsage] = await Promise.all([
      dbAll<Record<string, unknown>>(`SELECT
        s.id AS shop_id, s.name AS shop_name, s.slug AS shop_slug, s.merchant_verification_status AS status,
        v.session_id, v.status AS provider_status, v.created_at AS submitted_at, v.updated_at
        FROM shops s
        LEFT JOIN didit_verification_sessions v ON v.session_id = (
          SELECT latest.session_id FROM didit_verification_sessions latest
          WHERE latest.shop_id = s.id ORDER BY latest.created_at DESC LIMIT 1
        )
        WHERE s.merchant_verification_status <> 'not_required'
        ORDER BY CASE WHEN s.merchant_verification_status IN ('pending', 'submitted', 'under_review', 'rejected') THEN 0 ELSE 1 END,
          v.created_at DESC NULLS LAST`),
      dbGet<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM didit_verification_sessions
         WHERE created_at >= ? AND status IN (${finishedStatusPlaceholders})`,
        [monthStart, ...DIDIT_FINISHED_STATUSES],
      ),
      dbGet<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM delivery_driver_identity_sessions
         WHERE created_at >= ? AND status IN (${finishedStatusPlaceholders})`,
        [monthStart, ...DIDIT_FINISHED_STATUSES],
      ),
    ]);
    const merchantFinished = Number(merchantUsage?.count || 0);
    const courierFinished = Number(courierUsage?.count || 0);
    const totalFinished = merchantFinished + courierFinished;
    const threshold = 25;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      verifications: rows,
      usage: {
        month: monthStart.slice(0, 7),
        merchant_finished: merchantFinished,
        courier_finished: courierFinished,
        total_finished: totalFinished,
        threshold,
        alert: totalFinished >= threshold,
      },
    });
  });

  webhookRouter.post('/', async (req, res, next) => {
    const secret = String(process.env.DIDIT_WEBHOOK_SECRET || '').trim();
    const validation = validateDiditWebhook(
      req.body,
      req.get('x-timestamp'),
      req.get('x-signature-v2'),
      req.get('x-signature'),
      secret,
      Date.now(),
      {
        signatureV2: req.get('x-signature-v2-previous'),
        signature: req.get('x-signature-previous'),
      },
    );
    if (validation.ok === false) return res.status(validation.status).json({ error: validation.error });
    const { event, timestamp } = validation;
    if (event.webhook_type !== 'status.updated' || typeof event.event_id !== 'string' || !DIDIT_UUID_PATTERN.test(event.event_id)
      || typeof event.session_id !== 'string' || typeof event.status !== 'string') {
      return res.status(204).end();
    }

    const receivedAt = new Date(timestamp * 1000).toISOString();
    const possibleDriverSession = await dbGet<{ driver_id: number | string }>(
      'SELECT driver_id FROM delivery_driver_identity_sessions WHERE session_id = ?',
      [event.session_id],
    );
    const activeDeliveryZones = possibleDriverSession
      ? await dbAll<{ id: number | string }>('SELECT id FROM delivery_zones WHERE is_active = 1 ORDER BY id')
      : [];
    const webhookResult = await dbTransaction(async (transaction) => {
      const session = await transaction.get<{
        session_id: string;
        shop_id: number;
        last_webhook_at: string | null;
        decline_reasons: string | null;
      }>(
        `SELECT session_id, shop_id, last_webhook_at, decline_reasons FROM didit_verification_sessions WHERE session_id = ?${process.env.NODE_ENV === 'production' ? ' FOR UPDATE' : ''}`,
        [event.session_id],
      );
      if (!session) {
        const driverSession = await transaction.get<{
          session_id: string;
          driver_id: number | string;
          last_webhook_at: string | null;
        }>(
          `SELECT session_id, driver_id, last_webhook_at FROM delivery_driver_identity_sessions WHERE session_id = ?${process.env.NODE_ENV === 'production' ? ' FOR UPDATE' : ''}`,
          [event.session_id],
        );
        if (!driverSession) return false;
        if (process.env.NODE_ENV === 'production') {
          await transaction.get('SELECT id FROM delivery_drivers WHERE id = ? FOR UPDATE', [driverSession.driver_id]);
        }
        const latestDriverSession = await transaction.get<{ session_id: string }>(
          'SELECT session_id FROM delivery_driver_identity_sessions WHERE driver_id = ? ORDER BY created_at DESC LIMIT 1',
          [driverSession.driver_id],
        );
        if (latestDriverSession?.session_id !== driverSession.session_id) return { kind: 'ignored' as const };
        const inserted = await transaction.run(
          'INSERT INTO didit_webhook_events (event_id, received_at) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING',
          [event.event_id, new Date().toISOString()],
        );
        if (inserted.changes !== 1 || (driverSession.last_webhook_at && Date.parse(driverSession.last_webhook_at) > timestamp * 1000)) {
          return { kind: 'ignored' as const };
        }

        const currentDriver = await transaction.get<{ status: string; identity_status: string }>(
          'SELECT status, identity_status FROM delivery_drivers WHERE id = ?',
          [driverSession.driver_id],
        );
        if (!currentDriver) return false;
        const mappedStatus = mapDiditStatus(event.status);
        const identityStatus = currentDriver.identity_status === 'verified' ? 'verified' : mappedStatus;
        await transaction.run(
          'UPDATE delivery_driver_identity_sessions SET status = ?, updated_at = ?, last_webhook_at = ? WHERE session_id = ?',
          [event.status, receivedAt, receivedAt, driverSession.session_id],
        );
        await transaction.run(`UPDATE delivery_drivers SET identity_status = ?,
          status = CASE WHEN status = 'suspended' THEN 'suspended' WHEN ? = 'verified' THEN 'active' ELSE 'pending' END,
          updated_at = ? WHERE id = ?`, [identityStatus, identityStatus, receivedAt, driverSession.driver_id]);
        if (identityStatus === 'verified') {
          for (const zone of activeDeliveryZones) {
            await transaction.run(`INSERT INTO delivery_driver_zones (driver_id, zone_id, is_active, assigned_at)
              VALUES (?, ?, 0, ?) ON CONFLICT(driver_id, zone_id) DO NOTHING`,
            [driverSession.driver_id, zone.id, receivedAt]);
          }
        }
        if (currentDriver.identity_status !== identityStatus) {
          await transaction.run(
            'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
            ['didit_webhook', 'delivery_driver_identity_status_updated', null, JSON.stringify({
              driver_id: Number(driverSession.driver_id),
              previous_status: currentDriver.identity_status,
              status: identityStatus,
              event_id: event.event_id,
            }), receivedAt],
          );
        }
        return {
          kind: 'driver' as const,
          driverId: Number(driverSession.driver_id),
          previousStatus: currentDriver.identity_status,
          nextStatus: identityStatus,
        };
      }
      if (process.env.NODE_ENV === 'production') {
        await transaction.get('SELECT id FROM shops WHERE id = ? FOR UPDATE', [session.shop_id]);
      }
      const latestSession = await transaction.get<{ session_id: string }>(
        'SELECT session_id FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
        [session.shop_id],
      );
      if (latestSession?.session_id !== session.session_id) return { kind: 'ignored' as const };
      const inserted = await transaction.run(
        'INSERT INTO didit_webhook_events (event_id, received_at) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING',
        [event.event_id, new Date().toISOString()],
      );
      if (inserted.changes !== 1 || (session.last_webhook_at && Date.parse(session.last_webhook_at) > timestamp * 1000)) {
        return { kind: 'ignored' as const };
      }

      const merchantStatus = mapDiditStatus(event.status);
      const currentShop = await transaction.get<{ merchant_verification_status: string }>(
        'SELECT merchant_verification_status FROM shops WHERE id = ?',
        [session.shop_id],
      );
      await transaction.run(
        'UPDATE didit_verification_sessions SET status = ?, updated_at = ?, last_webhook_at = ? WHERE session_id = ?',
        [event.status, receivedAt, receivedAt, session.session_id],
      );
      await transaction.run(`UPDATE shops SET merchant_verification_status = ?,
        publication_status = CASE WHEN is_active = 0 OR publication_status = 'suspended' THEN 'suspended' WHEN ? = 'verified' THEN 'active' ELSE 'draft' END
        WHERE id = ?`, [merchantStatus, merchantStatus, session.shop_id]);
      if (currentShop && currentShop.merchant_verification_status !== merchantStatus) {
        await transaction.run(
          'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
          ['didit_webhook', 'identity_status_updated', session.shop_id, JSON.stringify({
            previous_status: currentShop.merchant_verification_status,
            status: merchantStatus,
            event_id: event.event_id,
          }), receivedAt],
        );
      }
      return {
        kind: 'shop' as const,
        shopId: session.shop_id,
        previousStatus: currentShop?.merchant_verification_status || '',
        nextStatus: merchantStatus,
        needsDecision: merchantStatus === 'rejected' && !session.decline_reasons,
      };
    });
    if (!webhookResult) return res.status(503).json({ error: 'Session Didit inconnue, réessayez le webhook.' });
    if (webhookResult.kind === 'shop' && webhookResult.needsDecision) {
      // Récupération asynchrone : le webhook répond 204 tout de suite et les
      // raisons (statuts + codes de risque, sans données personnelles) sont
      // enregistrées dès que Didit répond.
      void refreshDeclineReasons(event.session_id);
    }
    if (webhookResult.kind === 'shop' && webhookResult.shopId && webhookResult.previousStatus !== webhookResult.nextStatus) {
      const verified = webhookResult.nextStatus === 'verified';
      const expired = ['Expired', 'Kyc Expired', 'Abandoned'].includes(event.status);
      void sendMerchantPush(webhookResult.shopId, {
        eventKey: `identity-${event.event_id}`,
        category: 'identity',
        title: verified ? 'Identité vérifiée' : expired ? 'Vérification expirée' : webhookResult.nextStatus === 'rejected' ? 'Action requise pour votre identité' : 'Vérification mise à jour',
        body: verified
          ? 'Votre identité est vérifiée. Consultez votre tableau de bord pour la suite.'
          : expired
            ? 'Votre session de vérification a expiré avant la fin. Relancez-la depuis vos réglages pour republier votre boutique.'
            : webhookResult.nextStatus === 'rejected'
              ? 'Votre vérification nécessite une correction. Consultez les détails dans votre tableau de bord.'
              : 'Le statut de votre vérification a évolué. Consultez votre tableau de bord.',
        url: '/app',
        tag: `identity-${webhookResult.shopId}`,
      }).catch((error: unknown) => console.error(`Unable to queue identity notification for shop ${webhookResult.shopId}.`, error));
    }
    await dbRun('DELETE FROM didit_webhook_events WHERE received_at < ?', [new Date(Date.now() - 30 * 86400000).toISOString()]);
    res.status(204).end();
  });

  return { merchantRouter: router, adminRouter, webhookRouter };
}
