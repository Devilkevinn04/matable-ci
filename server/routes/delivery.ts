import { createHash, randomUUID } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { normalizeCustomerPhone } from '../../src/utils/normalizeCustomerPhone.ts';
import { getCustomerLoginLockSeconds, recordCustomerLoginFailure, clearLoginAttempts } from '../services/rateLimits.ts';
import { checkContactRevealRateLimit, hashContactIp } from '../services/contactGuard.ts';
import { createGeniusPayCheckout, GeniusPayApiError } from '../services/geniusPay.ts';
import { getVapidConfiguration, parseBrowserPushSubscription } from '../services/pushNotifications.ts';
import {
  dispatchDeliveryAssignedPush,
  dispatchDeliveryCancelledPush,
  dispatchDeliveryCreatedPush,
  dispatchDeliveryProofPush,
  dispatchDeliveryReleasedPush,
  dispatchDeliveryStatusPush,
} from '../services/deliveryNotifications.ts';
import {
  DELIVERY_SUBSCRIPTION_AMOUNT,
  expireStaleDeliveryPaymentIntents,
  findReusableDeliveryPaymentIntent,
  getDeliveryPaymentIntent,
  isDeliveryProviderPaymentConfigured,
  reconcileDeliveryPaymentById,
} from '../services/deliveryPayments.ts';

const DRIVER_SESSION_COOKIE = 'matable_delivery_session';
const DRIVER_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const SUBSCRIPTION_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_COURSE_RELEASES = 3;
const SANDBOX_SUBSCRIPTION_AMOUNT = 1000;
const MIN_DELIVERY_QUOTE = 1500;
const MAX_DELIVERY_QUOTE = 2500;
const MAX_PROOF_BYTES = 307_200;
const PROOF_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACTIVE_DELIVERY_STATES = new Set(['accepted', 'to_pickup', 'picked_up']);

interface DeliveryRouterOptions {
  hashAccessToken: (token: string) => string;
  hashPin: (pin: string) => string;
  verifyPin: (pin: string, storedHash: string) => boolean;
  getCookie: (req: Request, name: string) => string | null;
  buildSessionFingerprint: (req: Request) => string;
  isRequestFingerprintMatch: (session: { fingerprint?: string } | null | undefined, req: Request) => boolean;
  requireMerchantAccess: RequestHandler;
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  sandboxPaymentsEnabled: boolean;
  requireProof: boolean;
  getCustomerSessionState: (req: Request, res?: Response) => Promise<{ authenticated: boolean; user?: { id: number } | null }>;
  databaseMode: 'sqlite' | 'postgresql';
}

interface DriverRow {
  id: number | string;
  name: string;
  phone: string;
  pin_hash: string;
  status: string;
  access_expires_at: string | null;
}

interface DeliveryRow {
  id: number | string;
  order_id: number | string;
  shop_id: number | string;
  pickup_zone_id: number | string;
  destination_zone_id: number | string;
  quoted_amount: number;
  status: string;
  driver_id: number | string | null;
  created_at: string;
  ticket_number?: string | null;
  proof_available?: number | boolean | null;
  shop_name?: string;
  shop_phone?: string;
  pickup_address?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_location?: string;
  pickup_zone?: string;
  destination_zone?: string;
}

interface DeliveryEventRow {
  id: number | string;
  actor_type: string;
  actor_id: number | string | null;
  actor_name: string | null;
  previous_status: string | null;
  next_status: string;
  created_at: string;
}

function toEventPayload(event: DeliveryEventRow) {
  return {
    id: toId(event.id),
    actor_type: event.actor_type,
    actor_id: toId(event.actor_id),
    actor_name: event.actor_name,
    previous_status: event.previous_status,
    next_status: event.next_status,
    created_at: event.created_at,
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function toId(value: number | string | null): number | null {
  if (value === null) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid delivery identifier returned by the database.');
  return id;
}

function toPublicDelivery(row: DeliveryRow) {
  return {
    id: toId(row.id),
    order_id: toId(row.order_id),
    shop_id: toId(row.shop_id),
    pickup_zone_id: toId(row.pickup_zone_id),
    destination_zone_id: toId(row.destination_zone_id),
    quoted_amount: Number(row.quoted_amount),
    status: row.status,
    driver_id: toId(row.driver_id),
    created_at: row.created_at,
    ...(row.ticket_number ? { ticket_number: row.ticket_number } : {}),
    ...(row.proof_available !== undefined && row.proof_available !== null
      ? { proof_available: Boolean(row.proof_available) }
      : {}),
    ...(row.shop_name ? { shop_name: row.shop_name } : {}),
    ...(row.pickup_address ? { pickup_address: row.pickup_address } : {}),
    ...(row.delivery_location ? { delivery_location: row.delivery_location } : {}),
    ...(row.pickup_zone ? { pickup_zone: row.pickup_zone } : {}),
    ...(row.destination_zone ? { destination_zone: row.destination_zone } : {}),
  };
}

function buildDeliveryTicket(deliveryId: number, createdAt: string): string {
  const date = new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear()).slice(-2);
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  return `LIV-${year}${month}${day}-${String(deliveryId).padStart(6, '0')}`;
}

function decodeDeliveryProof(rawImage: unknown, rawContentType: unknown) {
  let contentType = typeof rawContentType === 'string' ? rawContentType.trim().toLowerCase() : '';
  let base64 = typeof rawImage === 'string' ? rawImage.trim() : '';
  const dataUrl = /^data:([a-z0-9.+/-]+);base64,([\s\S]+)$/i.exec(base64);
  if (dataUrl) {
    contentType = dataUrl[1].toLowerCase();
    base64 = dataUrl[2].replace(/\s+/g, '');
  }
  if (!PROOF_CONTENT_TYPES.has(contentType) || !base64 || base64.length > MAX_PROOF_BYTES * 2) {
    return { error: 'La photo doit être un fichier JPEG, PNG ou WebP de moins de 300 Ko.' } as const;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    return { error: 'La photo envoyée est invalide.' } as const;
  }
  if (buffer.length < 1 || buffer.length > MAX_PROOF_BYTES) {
    return { error: 'La photo doit être un fichier JPEG, PNG ou WebP de moins de 300 Ko.' } as const;
  }
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if ((contentType === 'image/jpeg' && !isJpeg)
    || (contentType === 'image/png' && !isPng)
    || (contentType === 'image/webp' && !isWebp)) {
    return { error: 'Le contenu de la photo ne correspond pas au format annoncé.' } as const;
  }
  return {
    contentType,
    base64: buffer.toString('base64'),
    byteSize: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  } as const;
}

function toProofPayload(proof: {
  content_type: string;
  byte_size: number | string;
  image_base64: string;
  sha256: string;
  captured_at: string;
  created_at: string;
}) {
  return {
    content_type: proof.content_type,
    byte_size: Number(proof.byte_size),
    sha256: proof.sha256,
    captured_at: proof.captured_at,
    created_at: proof.created_at,
    data_url: `data:${proof.content_type};base64,${proof.image_base64}`,
  };
}

function setDriverCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.floor(DRIVER_SESSION_DURATION_MS / 1000);
  res.setHeader('Set-Cookie', `${DRIVER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearDriverCookie(res: Response) {
  res.setHeader('Set-Cookie', `${DRIVER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function createDeliveryRouter({
  hashAccessToken,
  hashPin,
  verifyPin,
  getCookie,
  buildSessionFingerprint,
  isRequestFingerprintMatch,
  requireMerchantAccess,
  rateLimitPublicRequest,
  sandboxPaymentsEnabled,
  requireProof,
  getCustomerSessionState,
  databaseMode: mode,
}: DeliveryRouterOptions) {
  const router = Router();

  const getDriverSession = async (req: Request, res?: Response) => {
    const token = getCookie(req, DRIVER_SESSION_COOKIE);
    if (!token) return null;
    const session = await dbGet<{ driver_id: number | string; expires_at: number; fingerprint: string }>(
      `SELECT driver_id, expires_at, fingerprint FROM delivery_driver_sessions WHERE token_hash = ?`,
      [hashAccessToken(token)],
    );
    if (!session || Number(session.expires_at) <= Date.now() || !isRequestFingerprintMatch(session, req)) {
      await dbRun('DELETE FROM delivery_driver_sessions WHERE token_hash = ?', [hashAccessToken(token)]);
      if (res) clearDriverCookie(res);
      return null;
    }
    const driver = await dbGet<DriverRow>(
      'SELECT id, name, phone, pin_hash, status, access_expires_at FROM delivery_drivers WHERE id = ?',
      [session.driver_id],
    );
    if (!driver || driver.status === 'suspended') {
      await dbRun('DELETE FROM delivery_driver_sessions WHERE token_hash = ?', [hashAccessToken(token)]);
      if (res) clearDriverCookie(res);
      return null;
    }
    return { tokenHash: hashAccessToken(token), driver };
  };

  const requireDriver = async (req: Request, res: Response) => {
    const session = await getDriverSession(req, res);
    if (!session) {
      res.status(401).json({ error: 'Connexion livreur requise.' });
      return null;
    }
    return session;
  };

  const getDriverZones = async (driverId: number | string) => dbAll<{ id: number | string; label: string; is_active: number | boolean }>(
    `SELECT zones.id, zones.label, driver_zones.is_active
     FROM delivery_driver_zones AS driver_zones
     JOIN delivery_zones AS zones ON zones.id = driver_zones.zone_id
     WHERE driver_zones.driver_id = ? AND zones.is_active = 1
     ORDER BY zones.label`,
    [driverId],
  );

  const isAccessActive = (driver: DriverRow) =>
    driver.status === 'active'
    && Boolean(driver.access_expires_at)
    && Date.parse(String(driver.access_expires_at)) > Date.now();

  const deliveryQuoteSql = `
    SELECT shop_origins.zone_id AS pickup_zone_id,
      tariffs.destination_zone_id, tariffs.amount,
      origin.label AS origin_label, destination.label AS destination_label
    FROM delivery_shop_origins AS shop_origins
    JOIN delivery_zones AS origin ON origin.id = shop_origins.zone_id AND origin.is_active = 1
    JOIN delivery_zone_tariffs AS tariffs
      ON tariffs.origin_zone_id = shop_origins.zone_id
      AND tariffs.destination_zone_id = ?
      AND tariffs.is_active = 1
    JOIN delivery_zones AS destination
      ON destination.id = tariffs.destination_zone_id AND destination.is_active = 1
    WHERE shop_origins.shop_id = ?
      AND tariffs.amount BETWEEN ? AND ?
  `;

  const getQuote = async (shopId: number, destinationZoneId: number) => dbGet<{
    pickup_zone_id: number | string;
    destination_zone_id: number | string;
    amount: number;
    origin_label: string;
    destination_label: string;
  }>(deliveryQuoteSql, [destinationZoneId, shopId, MIN_DELIVERY_QUOTE, MAX_DELIVERY_QUOTE]);

  const listDeliveryEvents = async (deliveryId: number) => {
    const events = await dbAll<DeliveryEventRow>(`
      SELECT events.id, events.actor_type, events.actor_id, events.previous_status,
        events.next_status, events.created_at,
        CASE
          WHEN events.actor_type = 'driver' THEN drivers.name
          WHEN events.actor_type = 'merchant' THEN shops.name
          ELSE NULL
        END AS actor_name
      FROM delivery_course_events AS events
      LEFT JOIN delivery_drivers AS drivers
        ON events.actor_type = 'driver' AND drivers.id = events.actor_id
      LEFT JOIN shops
        ON events.actor_type = 'merchant' AND shops.id = events.actor_id
      WHERE events.delivery_id = ?
      ORDER BY events.created_at ASC, events.id ASC
    `, [deliveryId]);
    return events.map(toEventPayload);
  };

  router.get('/delivery/zones', async (_req, res) => {
    const zones = await dbAll<{ id: number | string; label: string }>(
      'SELECT id, label FROM delivery_zones WHERE is_active = 1 ORDER BY label',
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ zones: zones.map((zone) => ({ id: toId(zone.id), label: zone.label })) });
  });

  router.post('/delivery/drivers/register', rateLimitPublicRequest(10), async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 80) : '';
    const phone = normalizeCustomerPhone(String(req.body?.phone || ''));
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (name.length < 2 || !phone || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'Nom, numéro ivoirien valide et code PIN de 6 chiffres requis.' });
    }
    const existing = await dbGet<{ id: number }>('SELECT id FROM delivery_drivers WHERE phone = ?', [phone]);
    if (existing) return res.status(409).json({ error: 'Un compte livreur existe déjà pour ce numéro.' });

    const now = new Date().toISOString();
    const inserted = await dbGet<{ id: number | string }>(`INSERT INTO delivery_drivers
      (name, phone, pin_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?) RETURNING id`,
    [name, phone, hashPin(pin), now, now]);
    const driverId = inserted ? Number(inserted.id) : undefined;
    if (!driverId) throw new Error('Unable to allocate a delivery driver identifier.');
    return res.status(201).json({ driver: { id: driverId, name, phone, status: 'pending' } });
  });

  router.post('/delivery/drivers/login', rateLimitPublicRequest(20), async (req, res) => {
    const phone = normalizeCustomerPhone(String(req.body?.phone || ''));
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
    if (!phone || !/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'Numéro ou code PIN invalide.' });
    const attemptKey = `delivery:${req.ip}:${phone.replace(/\D/g, '')}`;
    if (await getCustomerLoginLockSeconds(attemptKey) > 0) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    }
    const driver = await dbGet<DriverRow>(
      'SELECT id, name, phone, pin_hash, status, access_expires_at FROM delivery_drivers WHERE phone = ?',
      [phone],
    );
    if (!driver || !verifyPin(pin, driver.pin_hash) || driver.status === 'suspended') {
      await recordCustomerLoginFailure(attemptKey);
      return res.status(401).json({ error: 'Numéro ou code PIN invalide.' });
    }
    await clearLoginAttempts(attemptKey, 'customer-login');
    const token = randomUUID();
    const expiresAt = Date.now() + DRIVER_SESSION_DURATION_MS;
    await dbRun(`INSERT INTO delivery_driver_sessions (token_hash, driver_id, expires_at, fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    [hashAccessToken(token), driver.id, expiresAt, buildSessionFingerprint(req), new Date().toISOString()]);
    setDriverCookie(res, token);
    return res.json({
      driver: { id: toId(driver.id), name: driver.name, phone: driver.phone, status: driver.status },
      access_active: isAccessActive(driver),
    });
  });

  router.get('/delivery/drivers/session', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const zones = await getDriverZones(session.driver.id);
    return res.json({
      driver: { id: toId(session.driver.id), name: session.driver.name, phone: session.driver.phone, status: session.driver.status },
      access_active: isAccessActive(session.driver),
      access_expires_at: session.driver.access_expires_at,
      zones: zones.map((zone) => ({ id: toId(zone.id), label: zone.label, is_active: Boolean(zone.is_active) })),
      sandbox_payments_enabled: sandboxPaymentsEnabled,
      provider_payments_available: isDeliveryProviderPaymentConfigured(),
      proof_required: requireProof,
    });
  });

  router.get('/delivery/drivers/push/config', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const vapid = getVapidConfiguration();
    const subscriptions = await dbAll<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM delivery_driver_push_subscriptions WHERE driver_id = ?',
      [session.driver.id],
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      configured: Boolean(vapid),
      public_key: vapid?.publicKey || null,
      subscribed_devices: Number(subscriptions[0]?.count || 0),
    });
  });

  router.put('/delivery/drivers/push/subscription', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    if (!getVapidConfiguration()) {
      return res.status(503).json({ error: 'Les notifications Push ne sont pas encore configurées sur le serveur.' });
    }
    const subscription = parseBrowserPushSubscription(req.body);
    if (!subscription) return res.status(400).json({ error: 'Abonnement navigateur invalide.' });
    const now = new Date().toISOString();
    const saved = await dbRun(`INSERT INTO delivery_driver_push_subscriptions
      (driver_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at
      WHERE delivery_driver_push_subscriptions.driver_id = excluded.driver_id`,
    [session.driver.id, subscription.endpoint, subscription.p256dh, subscription.auth, now, now]);
    if (saved.changes !== 1) return res.status(409).json({ error: 'Cet appareil est déjà associé à un autre compte livreur.' });
    return res.json({ success: true });
  });

  router.delete('/delivery/drivers/push/subscription', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (!endpoint || endpoint.length > 2048) return res.status(400).json({ error: 'Appareil invalide.' });
    await dbRun('DELETE FROM delivery_driver_push_subscriptions WHERE driver_id = ? AND endpoint = ?', [session.driver.id, endpoint]);
    return res.json({ success: true });
  });

  router.post('/delivery/drivers/logout', async (req, res) => {
    const token = getCookie(req, DRIVER_SESSION_COOKIE);
    if (token) await dbRun('DELETE FROM delivery_driver_sessions WHERE token_hash = ?', [hashAccessToken(token)]);
    clearDriverCookie(res);
    return res.json({ success: true });
  });

  router.post('/delivery/drivers/subscription/sandbox', rateLimitPublicRequest(5), async (req, res) => {
    if (!sandboxPaymentsEnabled) return res.status(404).json({ error: 'Le paiement de test n’est pas activé.' });
    const session = await requireDriver(req, res);
    if (!session) return;
    if (session.driver.status !== 'active') return res.status(403).json({ error: 'Le compte livreur doit être activé par MaTable.' });
    const now = Date.now();
    const currentExpiry = session.driver.access_expires_at ? Date.parse(session.driver.access_expires_at) : 0;
    if (currentExpiry > now) return res.status(409).json({ error: 'Le forfait livreur est déjà actif.' });
    const expiresAt = new Date(now + SUBSCRIPTION_DURATION_MS).toISOString();
    const activation = await dbTransaction(async (transaction) => {
      const current = await transaction.get<{ status: string; access_expires_at: string | null }>(
        `SELECT status, access_expires_at FROM delivery_drivers WHERE id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [session.driver.id],
      );
      if (!current || current.status !== 'active') {
        return 'inactive' as const;
      }
      if (current.access_expires_at && Date.parse(current.access_expires_at) > now) {
        return 'already_active' as const;
      }
      await transaction.run(`INSERT INTO delivery_driver_subscriptions
        (driver_id, amount, payment_mode, status, created_at, expires_at)
        VALUES (?, ?, 'sandbox', 'active', ?, ?)`,
      [session.driver.id, SANDBOX_SUBSCRIPTION_AMOUNT, new Date(now).toISOString(), expiresAt]);
      await transaction.run('UPDATE delivery_drivers SET access_expires_at = ?, updated_at = ? WHERE id = ?',
        [expiresAt, new Date(now).toISOString(), session.driver.id]);
      return 'created' as const;
    });
    if (activation === 'inactive') return res.status(403).json({ error: 'Le compte livreur doit être activé par MaTable.' });
    if (activation === 'already_active') return res.status(409).json({ error: 'Le forfait livreur est déjà actif.' });
    return res.json({ success: true, amount: SANDBOX_SUBSCRIPTION_AMOUNT, payment_mode: 'sandbox', expires_at: expiresAt });
  });

  router.post('/delivery/drivers/subscription/checkout', rateLimitPublicRequest(5), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    if (session.driver.status !== 'active') return res.status(403).json({ error: 'Le compte livreur doit être activé par MaTable.' });
    if (!isDeliveryProviderPaymentConfigured()) {
      return res.status(503).json({ error: 'Le paiement Mobile Money n’est pas encore configuré. Utilisez le mode de test si disponible.' });
    }
    if (isAccessActive(session.driver)) return res.status(409).json({ error: 'Le forfait livreur est déjà actif.' });
    const driverId = Number(session.driver.id);
    await expireStaleDeliveryPaymentIntents(driverId);
    const appUrl = String(process.env.APP_URL || '').trim();
    let intent = await findReusableDeliveryPaymentIntent(driverId);
    if (!intent) {
      const paymentId = randomUUID();
      const createdAt = new Date().toISOString();
      await dbRun(`INSERT INTO delivery_driver_payment_intents
        (id, driver_id, amount, currency, status, created_at)
        VALUES (?, ?, ?, 'XOF', 'pending', ?)`,
      [paymentId, driverId, DELIVERY_SUBSCRIPTION_AMOUNT, createdAt]);
      intent = await getDeliveryPaymentIntent(paymentId, driverId);
    }
    if (!intent) throw new Error('Unable to load the delivery payment intent after insertion.');
    if (intent.provider_checkout_url && intent.provider_reference) {
      return res.json({
        payment_id: intent.id,
        checkout_url: intent.provider_checkout_url,
        amount: Number(intent.amount),
        currency: intent.currency,
        payment_mode: 'provider',
        reused: true,
      });
    }
    const driverContact = await dbGet<{ email: string | null }>('SELECT email FROM delivery_drivers WHERE id = ?', [driverId]);
    try {
      const checkout = await createGeniusPayCheckout({
        amount: Number(intent.amount),
        description: 'Forfait livreur MaTable.ci (24 h)',
        customer: {
          name: session.driver.name,
          email: driverContact?.email || `livreur-${driverId}@matable.ci`,
          phone: session.driver.phone,
          country: 'CI',
        },
        success_url: new URL(`/__preview/delivery-courier?payment_id=${encodeURIComponent(intent.id)}`, appUrl).toString(),
        error_url: new URL(`/__preview/delivery-courier?payment_id=${encodeURIComponent(intent.id)}`, appUrl).toString(),
        metadata: { delivery_payment_id: intent.id, payment_type: 'delivery' },
      });
      await dbRun(`UPDATE delivery_driver_payment_intents
        SET provider_reference = ?, provider_checkout_url = ?
        WHERE id = ? AND status = 'pending'`,
      [checkout.reference, checkout.checkoutUrl, intent.id]);
      return res.json({
        payment_id: intent.id,
        checkout_url: checkout.checkoutUrl,
        amount: Number(intent.amount),
        currency: intent.currency,
        payment_mode: 'provider',
      });
    } catch (error) {
      const message = error instanceof GeniusPayApiError ? error.message : 'Impossible de préparer le paiement Mobile Money.';
      if (!(error instanceof GeniusPayApiError)) console.error('Delivery fee checkout preparation failed.', error);
      return res.status(502).json({ error: message, payment_id: intent.id });
    }
  });

  router.get('/delivery/drivers/subscription/payment/:paymentId', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const paymentId = String(req.params.paymentId || '');
    if (!paymentId || paymentId.length > 100) return res.status(400).json({ error: 'Identifiant de paiement invalide.' });
    await expireStaleDeliveryPaymentIntents(Number(session.driver.id));
    try {
      await reconcileDeliveryPaymentById(paymentId, Number(session.driver.id), 30_000);
    } catch (error) {
      console.warn(`Delivery payment status reconciliation failed for ${paymentId}.`, error);
    }
    const payment = await getDeliveryPaymentIntent(paymentId, Number(session.driver.id));
    if (!payment) return res.status(404).json({ error: 'Paiement introuvable.' });
    const driver = await dbGet<DriverRow>(
      'SELECT id, name, phone, pin_hash, status, access_expires_at FROM delivery_drivers WHERE id = ?',
      [session.driver.id],
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      payment_id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      checkout_url: payment.provider_checkout_url,
      paid_at: payment.paid_at,
      access_active: driver ? isAccessActive(driver) : false,
      access_expires_at: driver?.access_expires_at || null,
    });
  });

  router.put('/delivery/drivers/zones', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const zoneIds = req.body?.zone_ids;
    if (!Array.isArray(zoneIds) || zoneIds.length > 30 || zoneIds.some((id: unknown) => !isPositiveSafeInteger(id))) {
      return res.status(400).json({ error: 'La sélection de zones est invalide.' });
    }
    const selected = [...new Set<number>(zoneIds)];
    const assignedZones = await dbAll<{ zone_id: number | string }>(
      `SELECT driver_zones.zone_id FROM delivery_driver_zones AS driver_zones
       JOIN delivery_zones AS zones ON zones.id = driver_zones.zone_id AND zones.is_active = 1
       WHERE driver_zones.driver_id = ?`,
      [session.driver.id],
    );
    const assigned = new Set(assignedZones.map((zone) => Number(zone.zone_id)));
    if (selected.some((zoneId) => !assigned.has(zoneId))) {
      return res.status(403).json({ error: 'Vous ne pouvez activer que les zones attribuées par MaTable.' });
    }
    const now = new Date().toISOString();
    await dbTransaction(async (transaction) => {
      await transaction.run('UPDATE delivery_driver_zones SET is_active = 0 WHERE driver_id = ?', [session.driver.id]);
      for (const zoneId of selected) {
        await transaction.run('UPDATE delivery_driver_zones SET is_active = 1 WHERE driver_id = ? AND zone_id = ?', [session.driver.id, zoneId]);
      }
      await transaction.run('UPDATE delivery_drivers SET updated_at = ? WHERE id = ?', [now, session.driver.id]);
    });
    const zones = await getDriverZones(session.driver.id);
    return res.json({ zones: zones.map((zone) => ({ id: toId(zone.id), label: zone.label, is_active: Boolean(zone.is_active) })) });
  });

  router.get('/delivery/courses', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    if (!isAccessActive(session.driver)) return res.status(403).json({ error: 'Activez votre forfait de 1 000 FCFA pour recevoir des courses.' });
    const zones = await dbAll<{ zone_id: number | string }>(
      'SELECT zone_id FROM delivery_driver_zones WHERE driver_id = ? AND is_active = 1',
      [session.driver.id],
    );
    const activeZoneIds = zones.map((zone) => Number(zone.zone_id));
    if (activeZoneIds.length === 0) return res.json({ offers: [], active_delivery: null });
    const ownActive = await dbGet<DeliveryRow>(`
      SELECT deliveries.*, shops.name AS shop_name, shops.city AS pickup_address, orders.delivery_location,
        pickup.label AS pickup_zone, destination.label AS destination_zone,
        EXISTS (SELECT 1 FROM delivery_proofs WHERE delivery_id = deliveries.id) AS proof_available
      FROM delivery_orders AS deliveries
      JOIN shops ON shops.id = deliveries.shop_id
      JOIN orders ON orders.id = deliveries.order_id
      JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
      JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
      WHERE deliveries.driver_id = ? AND deliveries.status IN ('accepted', 'to_pickup', 'picked_up')
      ORDER BY deliveries.created_at DESC LIMIT 1
    `, [session.driver.id]);
    const offers = await dbAll<DeliveryRow>(`
      SELECT deliveries.*, shops.name AS shop_name, shops.city AS pickup_address, orders.delivery_location,
        pickup.label AS pickup_zone, destination.label AS destination_zone,
        EXISTS (SELECT 1 FROM delivery_proofs WHERE delivery_id = deliveries.id) AS proof_available
      FROM delivery_orders AS deliveries
      JOIN shops ON shops.id = deliveries.shop_id
      JOIN orders ON orders.id = deliveries.order_id
      JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
      JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
      WHERE deliveries.status = 'requested' AND deliveries.driver_id IS NULL
        AND orders.status IN ('confirmed', 'preparing', 'ready')
        AND deliveries.pickup_zone_id IN (${activeZoneIds.map(() => '?').join(',')})
        AND deliveries.destination_zone_id IN (${activeZoneIds.map(() => '?').join(',')})
      ORDER BY deliveries.created_at ASC, deliveries.id ASC
      LIMIT 50
    `, [...activeZoneIds, ...activeZoneIds]);
    return res.json({
      offers: offers.map(toPublicDelivery),
      active_delivery: ownActive ? toPublicDelivery(ownActive) : null,
    });
  });

  router.get('/delivery/courses/:id/events', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    if (!isPositiveSafeInteger(deliveryId)) return res.status(400).json({ error: 'Identifiant de course invalide.' });
    const delivery = await dbGet<{ id: number | string }>(
      'SELECT id FROM delivery_orders WHERE id = ? AND driver_id = ?',
      [deliveryId, session.driver.id],
    );
    if (!delivery) return res.status(404).json({ error: 'Course introuvable pour ce livreur.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ events: await listDeliveryEvents(deliveryId) });
  });

  router.post('/delivery/courses/:id/accept', rateLimitPublicRequest(30), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    if (!isPositiveSafeInteger(Number(req.params.id))) return res.status(400).json({ error: 'Identifiant de course invalide.' });
    const deliveryId = Number(req.params.id);
    if (!isAccessActive(session.driver)) return res.status(403).json({ error: 'Votre forfait livreur est inactif.' });
    const now = new Date().toISOString();
    const accepted = await dbTransaction(async (transaction) => {
      const driver = await transaction.get<DriverRow>(
        `SELECT id, name, phone, pin_hash, status, access_expires_at FROM delivery_drivers WHERE id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [session.driver.id],
      );
      if (!driver || !isAccessActive(driver)) return 'inactive' as const;
      const activeCourse = await transaction.get<{ id: number | string }>(
        `SELECT id FROM delivery_orders
         WHERE driver_id = ? AND status IN ('accepted', 'to_pickup', 'picked_up')
         LIMIT 1${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [driver.id],
      );
      if (activeCourse && Number(activeCourse.id) !== deliveryId) return 'busy' as const;
      const delivery = await transaction.get<DeliveryRow>(
        `SELECT * FROM delivery_orders WHERE id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId],
      );
      if (!delivery || delivery.status !== 'requested' || delivery.driver_id !== null) return 'taken' as const;
      const order = await transaction.get<{ status: string }>(
        `SELECT status FROM orders WHERE id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [delivery.order_id],
      );
      if (!order || !['confirmed', 'preparing', 'ready'].includes(order.status)) return 'order_terminal' as const;
      const eligible = await transaction.get<{ count: number | string }>(`
        SELECT COUNT(*) AS count
        FROM delivery_driver_zones AS pickup_zone
        JOIN delivery_driver_zones AS destination_zone
          ON destination_zone.driver_id = pickup_zone.driver_id
        JOIN delivery_zones AS pickup
          ON pickup.id = pickup_zone.zone_id AND pickup.is_active = 1
        JOIN delivery_zones AS destination
          ON destination.id = destination_zone.zone_id AND destination.is_active = 1
        WHERE pickup_zone.driver_id = ?
          AND pickup_zone.zone_id = ? AND pickup_zone.is_active = 1
          AND destination_zone.zone_id = ? AND destination_zone.is_active = 1
          AND EXISTS (
            SELECT 1 FROM delivery_zone_tariffs AS tariffs
            WHERE tariffs.origin_zone_id = pickup_zone.zone_id
              AND tariffs.destination_zone_id = destination_zone.zone_id
              AND tariffs.amount = ?
              AND tariffs.amount BETWEEN 1500 AND 2500
              AND tariffs.is_active = 1
          )
      `, [driver.id, delivery.pickup_zone_id, delivery.destination_zone_id, delivery.quoted_amount]);
      if (Number(eligible?.count || 0) !== 1) return 'zones' as const;
      const result = await transaction.run(`UPDATE delivery_orders
        SET status = 'accepted', driver_id = ?, accepted_at = ?
        WHERE id = ? AND status = 'requested' AND driver_id IS NULL`,
      [driver.id, now, deliveryId]);
      if (result.changes !== 1) return 'taken' as const;
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'driver', ?, 'requested', 'accepted', ?)`,
      [deliveryId, driver.id, now]);
      return 'accepted' as const;
    });
    if (accepted === 'inactive') return res.status(403).json({ error: 'Votre forfait livreur est inactif.' });
    if (accepted === 'zones') return res.status(403).json({ error: 'La course ne correspond plus à vos zones actives.' });
    if (accepted === 'busy') return res.status(409).json({ error: 'Terminez votre course active avant d’en accepter une autre.' });
    if (accepted === 'order_terminal') return res.status(409).json({ error: 'La commande liée à cette course n’est plus active.' });
    if (accepted === 'taken') return res.status(409).json({ error: 'Cette course n’est plus disponible.' });
    const delivery = await dbGet<DeliveryRow>(`
      SELECT deliveries.*, shops.name AS shop_name, shops.city AS pickup_address, orders.delivery_location,
        pickup.label AS pickup_zone, destination.label AS destination_zone
      FROM delivery_orders AS deliveries
      JOIN shops ON shops.id = deliveries.shop_id JOIN orders ON orders.id = deliveries.order_id
      JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
      JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
      WHERE deliveries.id = ?
    `, [deliveryId]);
    void dispatchDeliveryAssignedPush(deliveryId, session.driver.name);
    return res.json({ delivery: delivery ? toPublicDelivery(delivery) : null });
  });

  router.post('/delivery/courses/:id/release', rateLimitPublicRequest(10), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    if (!isPositiveSafeInteger(deliveryId)) {
      return res.status(400).json({ error: 'Identifiant de course invalide.' });
    }
    const now = new Date().toISOString();
    const releaseWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await dbTransaction(async (transaction) => {
      const delivery = await transaction.get<DeliveryRow>(
        `SELECT * FROM delivery_orders WHERE id = ? AND driver_id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId, session.driver.id],
      );
      if (!delivery) return 'missing' as const;
      if (!['accepted', 'to_pickup'].includes(delivery.status)) return 'state' as const;
      const releases = await transaction.get<{ count: number | string }>(`
        SELECT COUNT(*) AS count FROM delivery_course_events
        WHERE actor_type = 'driver' AND actor_id = ? AND next_status = 'requested'
          AND previous_status IN ('accepted', 'to_pickup') AND created_at >= ?
      `, [session.driver.id, releaseWindowStart]);
      if (Number(releases?.count || 0) >= MAX_DAILY_COURSE_RELEASES) return 'limit' as const;
      await transaction.run(`UPDATE delivery_orders SET status = 'requested', driver_id = NULL,
        accepted_at = NULL, to_pickup_at = NULL WHERE id = ? AND driver_id = ? AND status = ?`,
      [deliveryId, session.driver.id, delivery.status]);
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'driver', ?, ?, 'requested', ?)`,
      [deliveryId, session.driver.id, delivery.status, now]);
      return { type: 'released' as const, previousStatus: delivery.status };
    });
    if (result === 'missing') return res.status(404).json({ error: 'Course introuvable pour ce livreur.' });
    if (result === 'state') return res.status(409).json({ error: 'Une course ne peut être libérée qu’avant la récupération du colis.' });
    if (result === 'limit') {
      return res.status(429).json({ error: 'Trop de courses libérées aujourd’hui. Contactez MaTable pour débloquer votre compte.' });
    }
    void dispatchDeliveryReleasedPush(deliveryId, session.driver.name);
    console.info(`Delivery ${deliveryId} released by driver ${session.driver.id} from ${result.previousStatus}.`);
    return res.json({ success: true, status: 'requested' });
  });

  router.patch('/delivery/courses/:id/status', rateLimitPublicRequest(30), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    const requestedStatus = req.body?.status;
    const transitions: Record<string, string> = { accepted: 'to_pickup', to_pickup: 'picked_up', picked_up: 'delivered' };
    if (!isPositiveSafeInteger(deliveryId) || typeof requestedStatus !== 'string') {
      return res.status(400).json({ error: 'Identifiant ou statut de course invalide.' });
    }
    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      const delivery = await transaction.get<DeliveryRow>(
        `SELECT * FROM delivery_orders WHERE id = ? AND driver_id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId, session.driver.id],
      );
      if (!delivery) return 'missing' as const;
      if (transitions[delivery.status] !== requestedStatus) return 'transition' as const;
      if (requestedStatus === 'delivered' && requireProof) {
        const proof = await transaction.get<{ id: number | string }>(
          'SELECT id FROM delivery_proofs WHERE delivery_id = ?',
          [deliveryId],
        );
        if (!proof) return 'proof_required' as const;
      }
      const order = await transaction.get<{ status: string }>(
        `SELECT status FROM orders WHERE id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [delivery.order_id],
      );
      if (!order || ['delivered', 'cancelled', 'expired', 'refunded'].includes(order.status)) return 'order_terminal' as const;
      const timeColumn = requestedStatus === 'to_pickup' ? 'to_pickup_at'
        : requestedStatus === 'picked_up' ? 'picked_up_at' : 'delivered_at';
      await transaction.run(
        `UPDATE delivery_orders SET status = ?, ${timeColumn} = ? WHERE id = ? AND driver_id = ? AND status = ?`,
        [requestedStatus, now, deliveryId, session.driver.id, delivery.status],
      );
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'driver', ?, ?, ?, ?)`,
      [deliveryId, session.driver.id, delivery.status, requestedStatus, now]);
      if (requestedStatus === 'delivered') {
        await transaction.run(`UPDATE orders SET status = 'delivered'
          WHERE id = ? AND status IN ('confirmed', 'preparing', 'ready')`,
        [delivery.order_id]);
      }
      return { type: 'updated' as const, previousStatus: delivery.status };
    });
    if (typeof result === 'string') {
      if (result === 'missing') return res.status(404).json({ error: 'Course introuvable.' });
      if (result === 'transition') return res.status(409).json({ error: 'Cette transition de course est interdite.' });
      if (result === 'proof_required') return res.status(409).json({ error: 'Ajoutez une photo de preuve de livraison avant de clôturer la course.', code: 'delivery_proof_required' });
      if (result === 'order_terminal') return res.status(409).json({ error: 'La commande liée à cette course n’est plus active.' });
      return res.status(400).json({ error: 'Statut de course invalide.' });
    }
    void dispatchDeliveryStatusPush(deliveryId, result.previousStatus, requestedStatus);
    return res.json({ success: true, status: requestedStatus, updated_at: now });
  });

  router.put('/delivery/courses/:id/proof', rateLimitPublicRequest(30), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    if (!isPositiveSafeInteger(deliveryId)) return res.status(400).json({ error: 'Identifiant de course invalide.' });
    const proof = decodeDeliveryProof(req.body?.image_base64 ?? req.body?.image, req.body?.content_type);
    if ('error' in proof) return res.status(400).json({ error: proof.error });
    const capturedAt = typeof req.body?.captured_at === 'string' && Number.isFinite(Date.parse(req.body.captured_at))
      ? new Date(req.body.captured_at).toISOString()
      : new Date().toISOString();
    const now = new Date().toISOString();
    const saved = await dbTransaction(async (transaction) => {
      const delivery = await transaction.get<DeliveryRow>(
        `SELECT * FROM delivery_orders WHERE id = ? AND driver_id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId, session.driver.id],
      );
      if (!delivery) return 'missing' as const;
      if (delivery.status === 'delivered') return 'terminal' as const;
      if (!ACTIVE_DELIVERY_STATES.has(delivery.status)) return 'inactive' as const;
      await transaction.run(`INSERT INTO delivery_proofs
        (delivery_id, driver_id, content_type, byte_size, image_base64, sha256, captured_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(delivery_id) DO UPDATE SET
          driver_id = excluded.driver_id,
          content_type = excluded.content_type,
          byte_size = excluded.byte_size,
          image_base64 = excluded.image_base64,
          sha256 = excluded.sha256,
          captured_at = excluded.captured_at,
          created_at = excluded.created_at`,
      [deliveryId, session.driver.id, proof.contentType, proof.byteSize, proof.base64, proof.sha256, capturedAt, now]);
      return 'saved' as const;
    });
    if (saved === 'missing') return res.status(404).json({ error: 'Course introuvable pour ce livreur.' });
    if (saved === 'terminal') return res.status(409).json({ error: 'Une course livrée ne peut plus être modifiée.' });
    if (saved === 'inactive') return res.status(409).json({ error: 'La preuve ne peut être ajoutée que sur une course active.' });
    void dispatchDeliveryProofPush(deliveryId);
    return res.json({
      success: true,
      proof: {
        content_type: proof.contentType,
        byte_size: proof.byteSize,
        sha256: proof.sha256,
        captured_at: capturedAt,
        created_at: now,
      },
    });
  });

  router.get('/delivery/courses/:id/proof', async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    if (!isPositiveSafeInteger(deliveryId)) return res.status(400).json({ error: 'Identifiant de course invalide.' });
    const proof = await dbGet<{
      content_type: string;
      byte_size: number | string;
      image_base64: string;
      sha256: string;
      captured_at: string;
      created_at: string;
    }>(`SELECT proofs.content_type, proofs.byte_size, proofs.image_base64, proofs.sha256,
        proofs.captured_at, proofs.created_at
      FROM delivery_proofs AS proofs
      JOIN delivery_orders AS deliveries ON deliveries.id = proofs.delivery_id
      WHERE proofs.delivery_id = ? AND deliveries.driver_id = ?`, [deliveryId, session.driver.id]);
    if (!proof) return res.status(404).json({ error: 'Aucune preuve de livraison enregistrée.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ proof: toProofPayload(proof) });
  });

  router.post('/delivery/courses/:id/contacts/:role/reveal', rateLimitPublicRequest(60), async (req, res) => {
    const session = await requireDriver(req, res);
    if (!session) return;
    const deliveryId = Number(req.params.id);
    const role = req.params.role;
    if (!isPositiveSafeInteger(deliveryId) || (role !== 'merchant' && role !== 'customer')) {
      return res.status(400).json({ error: 'Course ou type de contact invalide.' });
    }
    const ipHash = hashContactIp(req, hashAccessToken);
    res.setHeader('Cache-Control', 'no-store');
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const revealed = await dbTransaction(async (transaction) => {
      const row = await transaction.get<DeliveryRow & { shop_phone: string; order_status: string }>(`
        SELECT deliveries.*, orders.customer_phone, orders.status AS order_status,
          shops.whatsapp_number AS shop_phone
        FROM delivery_orders AS deliveries
        JOIN orders ON orders.id = deliveries.order_id
        JOIN shops ON shops.id = deliveries.shop_id
        WHERE deliveries.id = ? AND deliveries.driver_id = ?
      `, [deliveryId, session.driver.id]);
      if (!row) return { type: 'missing' as const };
      if (!ACTIVE_DELIVERY_STATES.has(row.status)
        || ['delivered', 'cancelled', 'expired', 'refunded'].includes(row.order_status)) {
        return { type: 'terminal' as const };
      }
      const allowed = await checkContactRevealRateLimit(transaction, {
        actorType: 'driver',
        actorId: Number(session.driver.id),
        ipHash,
        nowMs,
        hashAccessToken,
      });
      if (!allowed) return { type: 'limited' as const };
      const contactValue = role === 'merchant' ? row.shop_phone : row.customer_phone;
      await transaction.run(`INSERT INTO contact_audits
        (delivery_id, order_id, driver_id, contact_role, ip_hash, revealed_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [deliveryId, row.order_id, session.driver.id, role, ipHash, nowIso]);
      return { type: 'revealed' as const, phone: contactValue };
    });
    if (revealed.type === 'missing') return res.status(404).json({ error: 'Course introuvable pour ce livreur.' });
    if (revealed.type === 'terminal') return res.status(403).json({ error: 'Le contact est verrouillé hors d’une course active.' });
    if (revealed.type === 'limited') return res.status(429).json({ error: 'Limite de révélations atteinte. Réessayez plus tard.' });
    return res.json({ role, phone: revealed.phone, revealed_at: nowIso });
  });

  router.get('/shops/:id/orders/:orderId/delivery-quote', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const destinationZoneId = Number(req.query.destination_zone_id);
    if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(orderId) || !isPositiveSafeInteger(destinationZoneId)) {
      return res.status(400).json({ error: 'Boutique, commande ou zone de destination invalide.' });
    }
    const order = await dbGet<{ id: number }>('SELECT id FROM orders WHERE id = ? AND shop_id = ?', [orderId, shopId]);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    const quote = await getQuote(shopId, destinationZoneId);
    if (!quote) return res.status(404).json({ error: 'Aucun tarif actif entre ces zones dans la plage autorisée de 1 500 à 2 500 FCFA.' });
    return res.json({
      quote: {
        origin_zone_id: toId(quote.pickup_zone_id),
        origin_zone: quote.origin_label,
        destination_zone_id: toId(quote.destination_zone_id),
        destination_zone: quote.destination_label,
        amount: Number(quote.amount),
      },
    });
  });

  router.post('/shops/:id/orders/:orderId/delivery', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const destinationZoneId = req.body?.destination_zone_id;
    if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(orderId) || !isPositiveSafeInteger(destinationZoneId)) {
      return res.status(400).json({ error: 'Boutique, commande ou zone de destination invalide.' });
    }
    const now = new Date().toISOString();
    const creation = await dbTransaction(async (transaction) => {
      const order = await transaction.get<{ id: number; status: string }>(
        `SELECT id, status FROM orders WHERE id = ? AND shop_id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [orderId, shopId],
      );
      if (!order) return { type: 'missing' as const };
      if (!['confirmed', 'preparing', 'ready'].includes(order.status)) return { type: 'order_status' as const };
      const quote = await transaction.get<{
        pickup_zone_id: number | string;
        destination_zone_id: number | string;
        amount: number;
      }>(deliveryQuoteSql, [destinationZoneId, shopId, MIN_DELIVERY_QUOTE, MAX_DELIVERY_QUOTE]);
      if (!quote) return { type: 'quote' as const };
      const inserted = await transaction.get<{ id: number | string }>(`INSERT INTO delivery_orders
        (order_id, shop_id, pickup_zone_id, destination_zone_id, quoted_amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'requested', ?)
        ON CONFLICT(order_id) DO UPDATE SET
          shop_id = excluded.shop_id,
          pickup_zone_id = excluded.pickup_zone_id,
          destination_zone_id = excluded.destination_zone_id,
          quoted_amount = excluded.quoted_amount,
          status = 'requested',
          driver_id = NULL,
          created_at = excluded.created_at,
          accepted_at = NULL,
          to_pickup_at = NULL,
          picked_up_at = NULL,
          delivered_at = NULL,
          cancelled_at = NULL
        WHERE delivery_orders.status = 'cancelled'
        RETURNING id`,
      [orderId, shopId, quote.pickup_zone_id, quote.destination_zone_id, quote.amount, now]);
      if (!inserted) return { type: 'exists' as const };
      const deliveryId = Number(inserted.id);
      if (!Number.isSafeInteger(deliveryId) || deliveryId <= 0) throw new Error('Invalid delivery identifier returned by the database.');
      const ticketNumber = buildDeliveryTicket(deliveryId, now);
      await transaction.run('UPDATE delivery_orders SET ticket_number = ? WHERE id = ?', [ticketNumber, deliveryId]);
      // A cancelled course reuses the same row: never let a new driver inherit the previous proof.
      await transaction.run('DELETE FROM delivery_proofs WHERE delivery_id = ?', [deliveryId]);
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'merchant', ?, NULL, 'requested', ?)`,
      [deliveryId, shopId, now]);
      return { type: 'created' as const, deliveryId, quote, ticketNumber };
    });
    if (creation.type === 'missing') return res.status(404).json({ error: 'Commande introuvable.' });
    if (creation.type === 'order_status') return res.status(409).json({ error: 'La commande doit être confirmée et non terminée avant une demande de livraison.' });
    if (creation.type === 'quote') return res.status(404).json({ error: 'Aucun tarif actif entre ces zones dans la plage autorisée de 1 500 à 2 500 FCFA.' });
    if (creation.type === 'exists') return res.status(409).json({ error: 'Une demande de livraison existe déjà pour cette commande.' });
    void dispatchDeliveryCreatedPush(creation.deliveryId);
    return res.status(201).json({
      delivery: {
        id: creation.deliveryId,
        order_id: orderId,
        shop_id: shopId,
        pickup_zone_id: toId(creation.quote.pickup_zone_id),
        destination_zone_id: toId(creation.quote.destination_zone_id),
        quoted_amount: Number(creation.quote.amount),
        status: 'requested',
        created_at: now,
        ticket_number: creation.ticketNumber,
      },
    });
  });

  router.get('/shops/:id/deliveries', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    if (!isPositiveSafeInteger(shopId)) return res.status(400).json({ error: 'Identifiant de boutique invalide.' });
    const deliveries = await dbAll<DeliveryRow>(`
      SELECT deliveries.*, orders.customer_name, orders.delivery_location,
        pickup.label AS pickup_zone, destination.label AS destination_zone,
        EXISTS (SELECT 1 FROM delivery_proofs WHERE delivery_id = deliveries.id) AS proof_available
      FROM delivery_orders AS deliveries
      JOIN orders ON orders.id = deliveries.order_id
      JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
      JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
      WHERE deliveries.shop_id = ?
      ORDER BY deliveries.created_at DESC
    `, [shopId]);
    return res.json({ deliveries: deliveries.map((delivery) => ({
      ...toPublicDelivery(delivery),
      customer_name: delivery.customer_name,
      pickup_zone: delivery.pickup_zone,
      destination_zone: delivery.destination_zone,
    })) });
  });

  router.get('/shops/:id/deliveries/:deliveryId/events', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const deliveryId = Number(req.params.deliveryId);
    if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(deliveryId)) {
      return res.status(400).json({ error: 'Boutique ou course invalide.' });
    }
    const delivery = await dbGet<{ id: number | string }>(
      'SELECT id FROM delivery_orders WHERE id = ? AND shop_id = ?',
      [deliveryId, shopId],
    );
    if (!delivery) return res.status(404).json({ error: 'Course introuvable.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ events: await listDeliveryEvents(deliveryId) });
  });

  router.get('/shops/:id/deliveries/:deliveryId/proof', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const deliveryId = Number(req.params.deliveryId);
    if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(deliveryId)) {
      return res.status(400).json({ error: 'Boutique ou course invalide.' });
    }
    const proof = await dbGet<{
      content_type: string;
      byte_size: number | string;
      image_base64: string;
      sha256: string;
      captured_at: string;
      created_at: string;
    }>(`SELECT proofs.content_type, proofs.byte_size, proofs.image_base64, proofs.sha256,
        proofs.captured_at, proofs.created_at
      FROM delivery_proofs AS proofs
      JOIN delivery_orders AS deliveries ON deliveries.id = proofs.delivery_id
      WHERE proofs.delivery_id = ? AND deliveries.shop_id = ?`, [deliveryId, shopId]);
    if (!proof) return res.status(404).json({ error: 'Aucune preuve de livraison enregistrée.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ proof: toProofPayload(proof) });
  });

  router.post('/shops/:id/deliveries/:deliveryId/cancel', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const deliveryId = Number(req.params.deliveryId);
    if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(deliveryId)) {
      return res.status(400).json({ error: 'Boutique ou course invalide.' });
    }
    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      const delivery = await transaction.get<DeliveryRow>(
        `SELECT * FROM delivery_orders WHERE id = ? AND shop_id = ?${mode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [deliveryId, shopId],
      );
      if (!delivery) return 'missing' as const;
      if (!['requested', 'accepted', 'to_pickup'].includes(delivery.status)) return 'terminal' as const;
      await transaction.run(`UPDATE delivery_orders SET status = 'cancelled', cancelled_at = ?
        WHERE id = ? AND shop_id = ? AND status = ?`, [now, deliveryId, shopId, delivery.status]);
      await transaction.run(`INSERT INTO delivery_course_events
        (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
        VALUES (?, 'merchant', ?, ?, 'cancelled', ?)`,
      [deliveryId, shopId, delivery.status, now]);
      return { type: 'cancelled' as const, previousStatus: delivery.status, driverId: toId(delivery.driver_id) };
    });
    if (result === 'missing') return res.status(404).json({ error: 'Course introuvable.' });
    if (result === 'terminal') return res.status(409).json({ error: 'Cette course ne peut plus être annulée après récupération ou clôture.' });
    void dispatchDeliveryCancelledPush(deliveryId, result.previousStatus, result.driverId);
    return res.json({ success: true, status: 'cancelled', cancelled_at: now });
  });

  router.get('/customers/orders/:orderId/delivery', async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!isPositiveSafeInteger(orderId)) return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }
    const delivery = await dbGet<DeliveryRow & { driver_name: string | null }>(`
      SELECT deliveries.*, shops.name AS shop_name, pickup.label AS pickup_zone, destination.label AS destination_zone,
        drivers.name AS driver_name,
        EXISTS (SELECT 1 FROM delivery_proofs WHERE delivery_id = deliveries.id) AS proof_available
      FROM delivery_orders AS deliveries
      JOIN orders ON orders.id = deliveries.order_id
      JOIN shops ON shops.id = deliveries.shop_id
      JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
      JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
      LEFT JOIN delivery_drivers AS drivers ON drivers.id = deliveries.driver_id
      WHERE deliveries.order_id = ? AND orders.customer_user_id = ?
    `, [orderId, customerSession.user.id]);
    if (!delivery) return res.status(404).json({ error: 'Aucune livraison MaTable pour cette commande.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      delivery: {
        ...toPublicDelivery(delivery),
        shop_name: delivery.shop_name,
        driver_name: delivery.driver_name,
        pickup_zone: delivery.pickup_zone,
        destination_zone: delivery.destination_zone,
      },
    });
  });

  router.get('/customers/orders/:orderId/delivery/events', async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!isPositiveSafeInteger(orderId)) return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }
    const delivery = await dbGet<{ id: number | string }>(`
      SELECT deliveries.id
      FROM delivery_orders AS deliveries
      JOIN orders ON orders.id = deliveries.order_id
      WHERE deliveries.order_id = ? AND orders.customer_user_id = ?
    `, [orderId, customerSession.user.id]);
    if (!delivery) return res.status(404).json({ error: 'Aucune livraison MaTable pour cette commande.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ events: await listDeliveryEvents(Number(delivery.id)) });
  });

  router.get('/customers/orders/:orderId/delivery/proof', async (req, res) => {
    const orderId = Number(req.params.orderId);
    if (!isPositiveSafeInteger(orderId)) return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }
    const proof = await dbGet<{
      content_type: string;
      byte_size: number | string;
      image_base64: string;
      sha256: string;
      captured_at: string;
      created_at: string;
    }>(`SELECT proofs.content_type, proofs.byte_size, proofs.image_base64, proofs.sha256,
        proofs.captured_at, proofs.created_at
      FROM delivery_proofs AS proofs
      JOIN delivery_orders AS deliveries ON deliveries.id = proofs.delivery_id
      JOIN orders ON orders.id = deliveries.order_id
      WHERE orders.id = ? AND orders.customer_user_id = ?`, [orderId, customerSession.user.id]);
    if (!proof) return res.status(404).json({ error: 'Aucune preuve de livraison enregistrée.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ proof: toProofPayload(proof) });
  });

  return router;
}
