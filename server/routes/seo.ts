import { Router, type Request } from 'express';
import { isShopPubliclyVisible } from '../services/businessRules.ts';
import { loadShopsFromDatabase } from '../repositories/shops.ts';
import { getPublicDiscoveryPages } from '../../src/utils/discoverySeo.ts';

interface SeoRouterOptions {
  getPublicOrigin: (req: Request) => string;
  escapeHtml: (value: string) => string;
}

export function createSeoRouter({ getPublicOrigin, escapeHtml }: SeoRouterOptions) {
  const router = Router();

  router.get('/robots.txt', (req, res) => {
    const origin = getPublicOrigin(req);
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', async (req, res) => {
    const origin = getPublicOrigin(req);
    const publicShops = (await loadShopsFromDatabase()).filter((shop) => isShopPubliclyVisible(shop));
    const urls = [
      `${origin}/`,
      `${origin}/boutiques`,
      `${origin}/commercants`,
      `${origin}/comment-ca-marche`,
      `${origin}/faq`,
      ...publicShops.map((shop) => `${origin}/${encodeURIComponent(shop.slug)}`),
      ...getPublicDiscoveryPages(publicShops).map((page) => `${origin}${page.path}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeHtml(url)}</loc><changefreq>daily</changefreq><priority>${url === `${origin}/` ? '1.0' : '0.8'}</priority></url>`).join('')}</urlset>`;
    res.type('application/xml').send(xml);
  });

  return router;
}