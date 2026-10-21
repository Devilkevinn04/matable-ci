import type { Request, RequestHandler } from 'express';
import { escapeHtml } from '../../src/utils/escapeHtml.ts';

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
}

export function isMaintenanceExemptRequest(req: Pick<Request, 'path' | 'method'>): boolean {
  const requestPath = req.path;
  if (requestPath === '/admin' || requestPath.startsWith('/admin/')) return true;
  if (requestPath.startsWith('/api/admin/')) return true;
  if (requestPath === '/api/health' || requestPath === '/api/webhooks/geniuspay') return true;
  if (requestPath === '/api/auth/session' || requestPath === '/api/auth/admin-login' || requestPath === '/api/auth/admin-logout') return true;
  if (requestPath.startsWith('/assets/') || requestPath.startsWith('/src/') || requestPath.startsWith('/node_modules/')) return true;
  if (['/manifest.json', '/sw.js', '/favicon.svg', '/vite.svg'].includes(requestPath)) return true;
  if (req.method === 'GET' && /\.(?:css|js|map|png|jpe?g|webp|svg|woff2?)$/i.test(requestPath)) return true;
  return false;
}

export function createMaintenanceModeMiddleware(
  getSettings: () => Promise<MaintenanceSettings>,
  maintenanceHtml: string,
): RequestHandler {
  return async (req, res, next) => {
    if (isMaintenanceExemptRequest(req)) return next();

    const settings = await getSettings();
    if (!settings.enabled) return next();

    res.set({ 'Cache-Control': 'no-store', 'Retry-After': '300', 'X-Robots-Tag': 'noindex, nofollow' });
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: 'maintenance', message: settings.message });
    }

    const html = maintenanceHtml.replace('__MAINTENANCE_MESSAGE__', escapeHtml(settings.message));
    return res.status(503).type('html').send(html);
  };
}