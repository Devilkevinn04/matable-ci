import { Router, type RequestHandler } from 'express';
import { getShopFromDatabase } from '../repositories/shops.ts';
import { isShopPubliclyVisible } from '../services/businessRules.ts';
import type { ShopRecord } from '../types.ts';
import {
  analyticsEntityFromPath,
  classifyAnalyticsSource,
  normalizeAnalyticsAudience,
  normalizeAnalyticsDevice,
  normalizeAnalyticsEntityType,
  normalizeAnalyticsEventType,
  normalizeAnalyticsLocale,
  normalizeAnalyticsPath,
  normalizeAnalyticsSessionId,
  parseAnalyticsCampaign,
  sanitizeAnalyticsMetadata,
  type AnalyticsAudience,
  type AnalyticsEntityType,
} from '../services/analytics.ts';

interface TelemetryRouterOptions {
  shops: ShopRecord[];
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
}

export type { AnalyticsSource } from '../services/analytics.ts';
export { classifyAnalyticsSource, normalizeAnalyticsCampaign } from '../services/analytics.ts';

interface AnalyticsEventRecord {
  shopId: number | null;
  eventType: string;
  sessionId: string;
  path: string;
  source: string;
  campaign: string | null;
  audience: AnalyticsAudience;
  entityType: AnalyticsEntityType;
  entityId: number | null;
  device: string;
  locale: string | null;
  metadata: string | null;
}

const MAX_EVENTS_PER_BATCH = 25;
const PRODUCT_EVENT_TYPES = new Set(['product_view', 'product_click']);
const DEDUPLICATED_EVENT_TYPES = new Set(['page_view', 'product_view', 'login', 'signup']);

function analyticsInsertSql() {
  return `INSERT INTO analytics_events
    (shop_id, event_type, session_id, path, source, campaign, audience, entity_type, entity_id, device, locale, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
}

async function isDuplicateEvent(
  event: AnalyticsEventRecord,
  dbGet: TelemetryRouterOptions['dbGet'],
): Promise<boolean> {
  if (!DEDUPLICATED_EVENT_TYPES.has(event.eventType)) return false;
  const today = new Date().toISOString().slice(0, 10);
  const shopCondition = event.shopId === null ? 'shop_id IS NULL' : 'shop_id = ?';
  const params: unknown[] = [];
  if (event.shopId !== null) params.push(event.shopId);
  params.push(event.eventType, event.sessionId, event.path, `${today}%`);
  const existing = await dbGet<{ found: number }>(`
    SELECT 1 AS found FROM analytics_events
    WHERE ${shopCondition} AND event_type = ? AND session_id = ? AND path = ? AND created_at LIKE ?
    LIMIT 1
  `, params);
  return Boolean(existing);
}

async function insertAnalyticsEvent(
  event: AnalyticsEventRecord,
  { dbGet, dbRun }: Pick<TelemetryRouterOptions, 'dbGet' | 'dbRun'>,
  options: { deduplicate?: boolean } = {},
): Promise<boolean> {
  if (options.deduplicate !== false && await isDuplicateEvent(event, dbGet)) return false;
  await dbRun(analyticsInsertSql(), [
    event.shopId,
    event.eventType,
    event.sessionId,
    event.path,
    event.source,
    event.campaign,
    event.audience,
    event.entityType,
    event.entityId,
    event.device,
    event.locale,
    event.metadata,
    new Date().toISOString(),
  ]);
  return true;
}

export function createTelemetryRouter({ rateLimitPublicRequest, dbGet, dbRun }: TelemetryRouterOptions) {
  const router = Router();

  const record = (event: AnalyticsEventRecord, options?: { deduplicate?: boolean }) =>
    insertAnalyticsEvent(event, { dbGet, dbRun }, options);

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), integrations: { whatsapp_click_to_chat: 'available' } });
  });

  router.post('/analytics/page-view', rateLimitPublicRequest(120), async (req, res) => {
    const shopId = req.body?.shop_id == null ? null : Number(req.body.shop_id);
    const sessionId = normalizeAnalyticsSessionId(req.body?.session_id);
    if (!sessionId || (shopId !== null && !Number.isInteger(shopId))) {
      return res.status(400).json({ error: 'Événement analytics invalide.' });
    }
    if (shopId !== null && !await getShopFromDatabase(shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const path = normalizeAnalyticsPath(req.body?.path) || '/';
    const referrer = typeof req.body?.referrer_host === 'string' ? req.body.referrer_host : String(req.get('referer') || '');
    await record({
      shopId,
      eventType: 'page_view',
      sessionId,
      path,
      source: classifyAnalyticsSource(referrer, String(req.get('host') || '')),
      campaign: parseAnalyticsCampaign(req.body?.campaign),
      audience: normalizeAnalyticsAudience(req.body?.audience),
      entityType: shopId === null ? 'page' : 'shop',
      entityId: shopId,
      device: normalizeAnalyticsDevice(req.body?.device),
      locale: normalizeAnalyticsLocale(req.body?.locale),
      metadata: sanitizeAnalyticsMetadata(req.body?.metadata),
    });
    res.status(204).end();
  });

  router.post('/analytics/product-event', rateLimitPublicRequest(120), async (req, res) => {
    const shopId = Number(req.body?.shop_id);
    const productId = Number(req.body?.product_id);
    const eventType = req.body?.event_type;
    const sessionId = normalizeAnalyticsSessionId(req.body?.session_id);
    if (!Number.isInteger(shopId) || !Number.isInteger(productId)
      || !PRODUCT_EVENT_TYPES.has(eventType)
      || !sessionId) {
      return res.status(400).json({ error: 'Événement produit invalide.' });
    }
    const shop = await getShopFromDatabase(shopId);
    if (!shop || !isShopPubliclyVisible(shop)) return res.status(404).json({ error: 'Boutique introuvable.' });
    const product = await dbGet<{ id: number }>(
      'SELECT id FROM products WHERE id = ? AND shop_id = ?',
      [productId, shopId],
    );
    if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

    const referrer = typeof req.body?.referrer_host === 'string' ? req.body.referrer_host : String(req.get('referer') || '');
    await record({
      shopId,
      eventType,
      sessionId,
      path: `/product/${productId}`,
      source: classifyAnalyticsSource(referrer, String(req.get('host') || '')),
      campaign: parseAnalyticsCampaign(req.body?.campaign),
      audience: normalizeAnalyticsAudience(req.body?.audience, 'customer'),
      entityType: 'product',
      entityId: productId,
      device: normalizeAnalyticsDevice(req.body?.device),
      locale: normalizeAnalyticsLocale(req.body?.locale),
      metadata: sanitizeAnalyticsMetadata(req.body?.metadata),
    });
    res.status(204).end();
  });

  router.post('/analytics/events', rateLimitPublicRequest(240), async (req, res) => {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : null;
    if (!rawEvents || rawEvents.length === 0 || rawEvents.length > MAX_EVENTS_PER_BATCH) {
      return res.status(400).json({ error: 'Lot d’événements analytics invalide.' });
    }

    const requestReferrer = String(req.get('referer') || '');
    const requestHost = String(req.get('host') || '');
    const records: AnalyticsEventRecord[] = [];

    for (const rawEvent of rawEvents) {
      if (!rawEvent || typeof rawEvent !== 'object') continue;
      const eventType = normalizeAnalyticsEventType((rawEvent as Record<string, unknown>).event_type);
      const sessionId = normalizeAnalyticsSessionId((rawEvent as Record<string, unknown>).session_id);
      const path = normalizeAnalyticsPath((rawEvent as Record<string, unknown>).path);
      if (!eventType || !sessionId || !path) continue;

      const rawShopId = (rawEvent as Record<string, unknown>).shop_id;
      const shopId = rawShopId == null ? null : Number(rawShopId);
      if (shopId !== null && (!Number.isInteger(shopId) || shopId <= 0)) continue;
      if (shopId !== null && !await getShopFromDatabase(shopId)) continue;

      const rawEntityId = (rawEvent as Record<string, unknown>).entity_id;
      const entityId = rawEntityId == null ? null : Number(rawEntityId);
      if (entityId !== null && !Number.isInteger(entityId)) continue;

      const entityType = normalizeAnalyticsEntityType((rawEvent as Record<string, unknown>).entity_type)
        || analyticsEntityFromPath(path).type;

      if (PRODUCT_EVENT_TYPES.has(eventType)) {
        if (shopId === null || entityId === null) continue;
        const shop = await getShopFromDatabase(shopId);
        if (!shop || !isShopPubliclyVisible(shop)) continue;
        const product = await dbGet<{ id: number }>(
          'SELECT id FROM products WHERE id = ? AND shop_id = ?',
          [entityId, shopId],
        );
        if (!product) continue;
      }

      const eventReferrer = typeof (rawEvent as Record<string, unknown>).referrer_host === 'string'
        ? String((rawEvent as Record<string, unknown>).referrer_host)
        : requestReferrer;

      records.push({
        shopId,
        eventType,
        sessionId,
        path,
        source: classifyAnalyticsSource(eventReferrer, requestHost),
        campaign: parseAnalyticsCampaign((rawEvent as Record<string, unknown>).campaign),
        audience: normalizeAnalyticsAudience(
          (rawEvent as Record<string, unknown>).audience,
          eventType === 'login' || eventType === 'signup' ? 'customer' : 'public',
        ),
        entityType,
        entityId: entityId ?? (entityType === 'shop' ? shopId : null),
        device: normalizeAnalyticsDevice((rawEvent as Record<string, unknown>).device),
        locale: normalizeAnalyticsLocale((rawEvent as Record<string, unknown>).locale),
        metadata: sanitizeAnalyticsMetadata((rawEvent as Record<string, unknown>).metadata),
      });
    }

    for (const event of records) {
      await insertAnalyticsEvent(event, { dbGet, dbRun });
    }

    res.status(204).end();
  });

  return router;
}
