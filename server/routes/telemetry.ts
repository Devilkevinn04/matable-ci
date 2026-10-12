import { Router, type RequestHandler } from 'express';
import { getShopFromDatabase } from '../repositories/shops.ts';
import { isShopPubliclyVisible } from '../services/businessRules.ts';
import type { ShopRecord } from '../types.ts';
import { normalizeAnalyticsCampaign } from '../../src/utils/analyticsAttribution.ts';

interface TelemetryRouterOptions {
  shops: ShopRecord[];
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
}

export type AnalyticsSource = 'direct' | 'search' | 'social' | 'referral' | 'internal';

export { normalizeAnalyticsCampaign } from '../../src/utils/analyticsAttribution.ts';

export function classifyAnalyticsSource(referrer: string, siteHost: string): AnalyticsSource {
  if (!referrer) return 'direct';
  try {
    const referrerUrl = referrer.includes('://') ? referrer : `https://${referrer}`;
    const hostname = new URL(referrerUrl).hostname.toLowerCase().replace(/^www\./, '');
    const currentHost = siteHost.toLowerCase().split(':')[0].replace(/^www\./, '');
    const matchesDomain = (domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);
    if (hostname === currentHost) return 'internal';
    if (/^google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(hostname)
      || ['bing.com', 'search.yahoo.com', 'duckduckgo.com', 'ecosia.org'].some(matchesDomain)) return 'search';
    if (['facebook.com', 'instagram.com', 'tiktok.com', 'wa.me', 'whatsapp.com', 'youtube.com', 'youtu.be', 'x.com', 't.co', 'linkedin.com'].some(matchesDomain)) return 'social';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export function createTelemetryRouter({ rateLimitPublicRequest, dbGet, dbRun }: TelemetryRouterOptions) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), integrations: { whatsapp_click_to_chat: 'available' } });
  });

  router.post('/analytics/page-view', rateLimitPublicRequest(120), async (req, res) => {
    const shopId = req.body?.shop_id == null ? null : Number(req.body.shop_id);
    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId || sessionId.length > 100 || (shopId !== null && !Number.isInteger(shopId))) {
      return res.status(400).json({ error: 'Événement analytics invalide.' });
    }
    if (shopId !== null && !await getShopFromDatabase(shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const referrer = typeof req.body?.referrer_host === 'string' ? req.body.referrer_host : String(req.get('referer') || '');
    const source = classifyAnalyticsSource(referrer, String(req.get('host') || ''));
    const campaign = normalizeAnalyticsCampaign(req.body?.campaign);
    const shopCondition = shopId === null ? 'shop_id IS NULL' : 'shop_id = ?';
    const path = String(req.body?.path || '').slice(0, 300);
    const analyticsParams = shopId === null
      ? [sessionId, path, `${today}%`]
      : [shopId, sessionId, path, `${today}%`];
    const alreadyTracked = await dbGet(`
      SELECT 1 FROM analytics_events
      WHERE ${shopCondition} AND event_type = 'page_view' AND session_id = ? AND path = ? AND created_at LIKE ?
      LIMIT 1
    `, analyticsParams);
    if (!alreadyTracked) {
      await dbRun('INSERT INTO analytics_events (shop_id, event_type, session_id, path, source, campaign, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        shopId,
        'page_view',
        sessionId,
        path,
        source,
        campaign,
        new Date().toISOString(),
      ]);
    }
    res.status(204).end();
  });

  router.post('/analytics/product-event', rateLimitPublicRequest(120), async (req, res) => {
    const shopId = Number(req.body?.shop_id);
    const productId = Number(req.body?.product_id);
    const eventType = req.body?.event_type;
    const sessionId = String(req.body?.session_id || '').trim();
    if (!Number.isInteger(shopId) || !Number.isInteger(productId)
      || !['product_view', 'product_click'].includes(eventType)
      || !sessionId || sessionId.length > 100) {
      return res.status(400).json({ error: 'Événement produit invalide.' });
    }
    const shop = await getShopFromDatabase(shopId);
    if (!shop || !isShopPubliclyVisible(shop)) return res.status(404).json({ error: 'Boutique introuvable.' });
    const product = await dbGet<{ id: number }>(
      'SELECT id FROM products WHERE id = ? AND shop_id = ?',
      [productId, shopId],
    );
    if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

    const today = new Date().toISOString().slice(0, 10);
    const eventPath = `/product/${productId}`;
    if (eventType === 'product_view') {
      const alreadyTracked = await dbGet(`
        SELECT 1 FROM analytics_events
        WHERE shop_id = ? AND event_type = 'product_view' AND session_id = ? AND path = ? AND created_at LIKE ?
        LIMIT 1
      `, [shopId, sessionId, eventPath, `${today}%`]);
      if (alreadyTracked) return res.status(204).end();
    }
    const referrer = typeof req.body?.referrer_host === 'string' ? req.body.referrer_host : String(req.get('referer') || '');
    const source = classifyAnalyticsSource(referrer, String(req.get('host') || ''));
    await dbRun(`INSERT INTO analytics_events (shop_id, event_type, session_id, path, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, [shopId, eventType, sessionId, eventPath, source, new Date().toISOString()]);
    res.status(204).end();
  });

  return router;
}
