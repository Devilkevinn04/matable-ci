import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { sendMerchantPush } from '../services/pushNotifications.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
}

interface DiditSessionResponse {
  session_id: string;
  status: string;
  url: string;
}

interface DiditWebhookEvent {
  event_id: string;
  session_id: string;
  status: string;
  webhook_type: string;
  timestamp: number;
}

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${sortedJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signatureMatches(signature: string | undefined, payload: Buffer, secret: string, canonicalPayload?: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret)
    .update(canonicalPayload ?? payload)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function mapDiditStatus(status: string): 'verified' | 'rejected' | 'under_review' | 'submitted' | 'pending' {
  if (status === 'Approved') return 'verified';
  if (status === 'Declined') return 'rejected';
  if (status === 'In Review') return 'under_review';
  if (['Expired', 'Kyc Expired', 'Abandoned'].includes(status)) return 'pending';
  return 'submitted';
}

function isDiditSession(value: unknown): value is DiditSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DiditSessionResponse>;
  if (typeof session.session_id !== 'string' || !UUID_PATTERN.test(session.session_id)) return false;
  if (typeof session.status !== 'string' || typeof session.url !== 'string') return false;
  try {
    const url = new URL(session.url);
    return url.protocol === 'https:' && url.hostname === 'verify.didit.me';
  } catch {
    return false;
  }
}

export function createMerchantVerificationRouter(options: MerchantVerificationOptions) {
  const { dbRun, dbGet, dbAll, dbTransaction, requireMerchantIdentityOwnShop } = options;
  const router = Router();
  const webhookRouter = Router();

  router.get('/:id/identity-verification', requireMerchantIdentityOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const [shop, session] = await Promise.all([
      dbGet<{ merchant_verification_status: string }>('SELECT merchant_verification_status FROM shops WHERE id = ?', [shopId]),
      dbGet<{ session_id: string; status: string; created_at: string }>(
        'SELECT session_id, status, created_at FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
        [shopId],
      ),
    ]);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: session ? mapDiditStatus(session.status) : shop.merchant_verification_status,
      provider_status: session?.status || null,
      session_id: session?.session_id || null,
      submitted_at: session?.created_at || null,
      reviewer_note: null,
    });
  });

  router.post('/:id/identity-verification/session', requireMerchantIdentityOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await dbGet<{ id: number; merchant_verification_status: string }>(
      'SELECT id, merchant_verification_status FROM shops WHERE id = ?',
      [shopId],
    );
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (shop.merchant_verification_status === 'verified') return res.status(409).json({ error: 'Cette identité a déjà été vérifiée.' });
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Votre consentement explicite est requis pour continuer.' });

    const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
    const workflowId = String(process.env.DIDIT_WORKFLOW_ID || '').trim();
    if (!apiKey || !UUID_PATTERN.test(workflowId)) {
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
      const latestSession = await transaction.get<{ created_at: string }>(
        'SELECT created_at FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
        [shop.id],
      );
      const currentTime = Date.now();
      const latestTime = latestSession ? Date.parse(latestSession.created_at) : 0;
      const createdAt = new Date(Math.max(currentTime, latestTime + 1)).toISOString();
      const inserted = await transaction.run(`INSERT INTO didit_verification_sessions
        (session_id, shop_id, workflow_id, status, consent_at, consent_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO NOTHING`,
      [providerPayload.session_id, shop.id, workflowId, providerPayload.status, consentAt, CONSENT_VERSION, createdAt, createdAt]);
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
    const rows = await dbAll<Record<string, unknown>>(`SELECT
      s.id AS shop_id, s.name AS shop_name, s.slug AS shop_slug, s.merchant_verification_status AS status,
      v.session_id, v.status AS provider_status, v.created_at AS submitted_at, v.updated_at
      FROM shops s
      LEFT JOIN didit_verification_sessions v ON v.session_id = (
        SELECT latest.session_id FROM didit_verification_sessions latest
        WHERE latest.shop_id = s.id ORDER BY latest.created_at DESC LIMIT 1
      )
      WHERE s.merchant_verification_status <> 'not_required'
      ORDER BY CASE WHEN s.merchant_verification_status IN ('pending', 'submitted', 'under_review', 'rejected') THEN 0 ELSE 1 END,
        v.created_at DESC NULLS LAST`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ verifications: rows });
  });

  webhookRouter.post('/', async (req, res) => {
    const secret = String(process.env.DIDIT_WEBHOOK_SECRET || '').trim();
    if (!secret) return res.status(503).json({ error: 'Le webhook Didit n’est pas configuré.' });
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Corps webhook invalide.' });

    const timestamp = Number(req.get('x-timestamp'));
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
      return res.status(401).json({ error: 'Horodatage webhook invalide ou expiré.' });
    }
    let event: DiditWebhookEvent;
    try {
      event = JSON.parse(req.body.toString('utf8')) as DiditWebhookEvent;
    } catch {
      return res.status(400).json({ error: 'Corps webhook JSON invalide.' });
    }
    if (!Number.isFinite(event.timestamp) || Math.abs(Date.now() / 1000 - event.timestamp) > 300) {
      return res.status(401).json({ error: 'Horodatage signé du webhook invalide ou expiré.' });
    }
    const canonicalPayload = sortedJson(event);
    const validSignature = signatureMatches(req.get('x-signature-v2'), req.body, secret, canonicalPayload)
      || signatureMatches(req.get('x-signature'), req.body, secret);
    if (!validSignature) return res.status(401).json({ error: 'Signature webhook Didit invalide.' });
    if (event.webhook_type !== 'status.updated' || typeof event.event_id !== 'string' || !UUID_PATTERN.test(event.event_id)
      || typeof event.session_id !== 'string' || typeof event.status !== 'string') {
      return res.status(204).end();
    }

    const receivedAt = new Date(timestamp * 1000).toISOString();
    const webhookResult = await dbTransaction(async (transaction) => {
      const session = await transaction.get<{ session_id: string; shop_id: number; last_webhook_at: string | null }>(
        `SELECT session_id, shop_id, last_webhook_at FROM didit_verification_sessions WHERE session_id = ?${process.env.NODE_ENV === 'production' ? ' FOR UPDATE' : ''}`,
        [event.session_id],
      );
      if (!session) return false;
      if (process.env.NODE_ENV === 'production') {
        await transaction.get('SELECT id FROM shops WHERE id = ? FOR UPDATE', [session.shop_id]);
      }
      const latestSession = await transaction.get<{ session_id: string }>(
        'SELECT session_id FROM didit_verification_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 1',
        [session.shop_id],
      );
      if (latestSession?.session_id !== session.session_id) return { shopId: null, previousStatus: '', nextStatus: '' };
      const inserted = await transaction.run(
        'INSERT INTO didit_webhook_events (event_id, received_at) VALUES (?, ?) ON CONFLICT(event_id) DO NOTHING',
        [event.event_id, new Date().toISOString()],
      );
      if (inserted.changes !== 1 || (session.last_webhook_at && Date.parse(session.last_webhook_at) > timestamp * 1000)) {
        return { shopId: null, previousStatus: '', nextStatus: '' };
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
      return {
        shopId: session.shop_id,
        previousStatus: currentShop?.merchant_verification_status || '',
        nextStatus: merchantStatus,
      };
    });
    if (!webhookResult) return res.status(503).json({ error: 'Session Didit inconnue, réessayez le webhook.' });
    if (webhookResult.shopId && webhookResult.previousStatus !== webhookResult.nextStatus) {
      const verified = webhookResult.nextStatus === 'verified';
      void sendMerchantPush(webhookResult.shopId, {
        eventKey: `identity-${event.event_id}`,
        category: 'identity',
        title: verified ? 'Identité vérifiée' : webhookResult.nextStatus === 'rejected' ? 'Action requise pour votre identité' : 'Vérification mise à jour',
        body: verified
          ? 'Votre identité est vérifiée. Consultez votre tableau de bord pour la suite.'
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
