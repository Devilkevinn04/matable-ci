import { Router, type Request } from 'express';
import { isShopPubliclyVisible } from '../services/businessRules.ts';
import type { ShopRecord } from '../types.ts';

interface SeoRouterOptions {
  shops: readonly ShopRecord[];
  getPublicOrigin: (req: Request) => string;
  escapeHtml: (value: string) => string;
}

export function createSeoRouter({ shops, getPublicOrigin, escapeHtml }: SeoRouterOptions) {
  const router = Router();

  router.get('/robots.txt', (req, res) => {
    const origin = getPublicOrigin(req);
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', (req, res) => {
    const origin = getPublicOrigin(req);
    const urls = [
      `${origin}/`,
      ...shops.filter((shop) => isShopPubliclyVisible(shop)).map((shop) => `${origin}/${encodeURIComponent(shop.slug)}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc><changefreq>daily</changefreq><priority>${url === `${origin}/` ? '1.0' : '0.8'}</priority></url>`).join('')}</urlset>`;
    res.type('application/xml').send(xml);
  });

  return router;
}