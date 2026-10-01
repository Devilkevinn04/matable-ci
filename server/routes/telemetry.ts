import { Router, type RequestHandler } from 'express';
import type { ShopRecord } from '../types.ts';

interface TelemetryRouterOptions {
  shops: ShopRecord[];
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
}

export function createTelemetryRouter({ shops, rateLimitPublicRequest, dbGet, dbRun }: TelemetryRouterOptions) {
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
    if (shopId !== null && !shops.some((shop) => shop.id === shopId)) {
      return res.status(404).json({ error: 'Boutique introuvable.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const shopCondition = shopId === null ? 'shop_id IS NULL' : 'shop_id = ?';
    const analyticsParams = shopId === null ? [sessionId, `${today}%`] : [shopId, sessionId, `${today}%`];
    const alreadyTracked = await dbGet(`
      SELECT 1 FROM analytics_events
      WHERE ${shopCondition} AND event_type = 'page_view' AND session_id = ? AND created_at LIKE ?
      LIMIT 1
    `, analyticsParams);
    if (!alreadyTracked) {
      await dbRun('INSERT INTO analytics_events (shop_id, event_type, session_id, path, created_at) VALUES (?, ?, ?, ?, ?)', [
        shopId,
        'page_view',
        sessionId,
        String(req.body?.path || '').slice(0, 300),
        new Date().toISOString(),
      ]);
    }
    res.status(204).end();
  });

  return router;
}
