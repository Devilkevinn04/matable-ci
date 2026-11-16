import { Router, type Request } from 'express';
import { isShopPubliclyVisible } from '../services/businessRules.ts';
import { loadShopsFromDatabase } from '../repositories/shops.ts';
import { getPublicDiscoveryPages } from '../../src/utils/discoverySeo.ts';
import { SEO_ARTICLES } from '../../src/utils/seoArticles.ts';
import { isShopExcludedFromPublicIndex } from '../../src/utils/shopIndexing.ts';

function toSitemapLastModified(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

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

  router.get('/.well-known/security.txt', (_req, res) => res.status(404).type('text/plain').send('Not Found'));
  router.get('/manifest.webmanifest', (_req, res) => res.redirect(308, '/manifest.json'));

  router.get('/sitemap.xml', async (req, res) => {
    const origin = getPublicOrigin(req);
    const publicShops = (await loadShopsFromDatabase()).filter((shop) =>
      isShopPubliclyVisible(shop) && !isShopExcludedFromPublicIndex(shop.name));
    const staticUrls = [
      `${origin}/`,
      `${origin}/boutiques`,
      `${origin}/promotions`,
      `${origin}/commercants`,
      `${origin}/comment-ca-marche`,
      `${origin}/faq`,
      `${origin}/guide`,
      ...SEO_ARTICLES.map((article) => `${origin}/guide/${article.slug}`),
      ...getPublicDiscoveryPages(publicShops).map((page) => `${origin}${page.path}`),
    ];
    const entries = [
      ...staticUrls.map((loc) => ({ loc, lastmod: null })),
      ...publicShops.map((shop) => ({
        loc: `${origin}/${encodeURIComponent(shop.slug)}`,
        lastmod: toSitemapLastModified(shop.catalog_updated_at || shop.created_at),
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(({ loc, lastmod }) => `<url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${escapeHtml(lastmod)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
    res.type('application/xml').send(xml);
  });

  return router;
}