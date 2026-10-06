import { Router, type Request } from 'express';
import { dbAll, dbGet } from '../../db.ts';
import { getSubscriptionState, isShopPubliclyVisible } from '../services/businessRules.ts';
import { rankShopsByVisibility } from '../services/visibility.ts';
import type { ProductRecord, ShopRecord } from '../types.ts';
import { isShopCategory } from '../../src/utils/categoryDefaults.ts';
import { toDiscoveryCitySlug } from '../../src/utils/discoverySeo.ts';

interface MerchantSession {
  shopId: number;
  expiresAt: number;
  fingerprint: string;
}

interface PublicShopsRouterOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  merchantSessions: Map<string, MerchantSession>;
  getCookie: (req: Request, name: string) => string | null;
  isRequestFingerprintMatch: (session: { fingerprint?: string } | null | undefined, req: Request) => boolean;
  computeIsShopOpen: (shop: ShopRecord) => boolean;
}

export function createPublicShopsRouter({
  shops,
  products,
  merchantSessions,
  getCookie,
  isRequestFingerprintMatch,
  computeIsShopOpen,
}: PublicShopsRouterOptions) {
  const router = Router();
  const getProductLikeCounts = async (productIds: number[]) => {
    if (productIds.length === 0) return new Map<number, number>();
    const rows = await dbAll<{ product_id: number; like_count: number | string }>(
      `SELECT product_id, COUNT(*) AS like_count FROM customer_product_likes
       WHERE product_id IN (${productIds.map(() => '?').join(', ')})
       GROUP BY product_id`,
      productIds,
    );
    return new Map(rows.map((row) => [Number(row.product_id), Number(row.like_count) || 0]));
  };

  router.get('/feed', async (req, res) => {
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'popular';
    if (sort !== 'popular' && sort !== 'new') return res.status(400).json({ error: 'Tri de fil invalide.' });
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    if (category && !isShopCategory(category)) return res.status(400).json({ error: 'Catégorie invalide.' });
    const citySlug = typeof req.query.city === 'string' ? toDiscoveryCitySlug(req.query.city) : '';
    const limitValue = Number(req.query.limit ?? 24);
    const offsetValue = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(limitValue) ? Math.min(48, Math.max(1, limitValue)) : 24;
    const offset = Number.isInteger(offsetValue) ? Math.max(0, offsetValue) : 0;

    const publicShopRecords = shops.filter((shop) => isShopPubliclyVisible(shop)
      && (!category || shop.category === category)
      && (!citySlug || toDiscoveryCitySlug(shop.city || '') === citySlug));
    const publicShopsById = new Map(publicShopRecords.map((shop) => [shop.id, shop]));
    let feedProducts = products.filter((product) => {
      const shop = publicShopsById.get(product.shop_id);
      return Boolean(shop && product.is_available && product.stock > 0);
    });
    const countsByProduct = new Map<string, { views: number; clicks: number }>();
    if (sort === 'popular' && publicShopRecords.length > 0) {
      const shopIds = publicShopRecords.map((shop) => shop.id);
      const eventCounts = await dbAll<{ shop_id: number; path: string | null; views: number | string; clicks: number | string }>(
        `SELECT shop_id, path,
          SUM(CASE WHEN event_type = 'product_view' THEN 1 ELSE 0 END) AS views,
          SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS clicks
         FROM analytics_events
         WHERE shop_id IN (${shopIds.map(() => '?').join(', ')})
           AND event_type IN ('product_view', 'product_click')
           AND path LIKE '/product/%'
           AND created_at >= ?
         GROUP BY shop_id, path`,
        [...shopIds, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()],
      );
      for (const row of eventCounts) {
        const productId = /^\/product\/(\d+)$/.exec(String(row.path || ''))?.[1];
        if (!productId) continue;
        countsByProduct.set(`${Number(row.shop_id)}:${productId}`, {
          views: Number(row.views) || 0,
          clicks: Number(row.clicks) || 0,
        });
      }
    }

    const getPopularity = (product: ProductRecord) => countsByProduct.get(`${product.shop_id}:${product.id}`) || { views: 0, clicks: 0 };
    const getCreatedAt = (product: ProductRecord) => product.created_at ? Date.parse(product.created_at) || 0 : 0;
    const hasPopularityData = feedProducts.some((product) => {
      const counts = getPopularity(product);
      return counts.views + counts.clicks > 0;
    });
    feedProducts = [...feedProducts].sort((left, right) => {
      if (sort === 'popular' && hasPopularityData) {
        const leftCounts = getPopularity(left);
        const rightCounts = getPopularity(right);
        const popularityDifference = rightCounts.views + rightCounts.clicks - leftCounts.views - leftCounts.clicks;
        if (popularityDifference) return popularityDifference;
      }
      return getCreatedAt(right) - getCreatedAt(left) || right.id - left.id;
    });

    const now = new Date().toISOString();
    const activeBoosts = publicShopRecords.length > 0
      ? await dbAll<{ shop_id: number }>(
        `SELECT DISTINCT shop_id FROM shop_boosts
         WHERE shop_id IN (${publicShopRecords.map(() => '?').join(', ')})
           AND status IN ('scheduled', 'active') AND starts_at <= ? AND ends_at > ?`,
        [...publicShopRecords.map((shop) => shop.id), now, now],
      )
      : [];
    const sponsoredShopIds = new Set(activeBoosts.map((boost) => Number(boost.shop_id)));
    const page = feedProducts.slice(offset, offset + limit);
    const likeCounts = await getProductLikeCounts(page.map((product) => product.id));
    res.json({
      sort,
      ranking_fallback: sort === 'popular' && !hasPopularityData,
      has_more: offset + limit < feedProducts.length,
      products: page.map((product) => {
        const shop = publicShopsById.get(product.shop_id)!;
        const popularity = getPopularity(product);
        return {
          ...product,
          popularity,
          like_count: likeCounts.get(product.id) || 0,
          is_sponsored: sponsoredShopIds.has(shop.id),
          shop: {
            id: shop.id,
            name: shop.name,
            slug: shop.slug,
            category: shop.category,
            city: shop.city,
          },
        };
      }),
    });
  });

  router.get('/', async (_req, res) => {
    const availableProductsByShop = new Map<number, ProductRecord[]>();
    for (const product of products) {
      if (!product.is_available || product.stock <= 0) continue;
      const shopProducts = availableProductsByShop.get(product.shop_id) || [];
      shopProducts.push(product);
      availableProductsByShop.set(product.shop_id, shopProducts);
    }
    const publicShopRecords = shops.filter((shop) => isShopPubliclyVisible(shop));
    const productCounts = new Map<number, number>();
    for (const shop of publicShopRecords) {
      productCounts.set(shop.id, availableProductsByShop.get(shop.id)?.length || 0);
    }
    const now = new Date().toISOString();
    const activeBoosts = await dbAll<{ shop_id: number }>(
      `SELECT DISTINCT shop_id FROM shop_boosts
        WHERE status IN ('scheduled', 'active') AND starts_at <= ? AND ends_at > ?`,
      [now, now],
    );
    const sponsoredShopIds = new Set(activeBoosts.map((boost) => Number(boost.shop_id)));
    const rankedShops = rankShopsByVisibility(publicShopRecords, productCounts, computeIsShopOpen, Date.parse(now), sponsoredShopIds);
    res.json(rankedShops.map(({ shop, is_open, is_featured, is_sponsored }) => {
        const availableProducts = availableProductsByShop.get(shop.id) || [];
        return {
          products_preview: availableProducts.slice(0, 3).map((product) => ({
            id: product.id,
            title: product.title,
            image_url: product.image_url,
            price: product.price,
          })),
          products_count: availableProducts.length,
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          theme_color: shop.theme_color,
          welcome_message: shop.welcome_message,
          is_open,
          is_featured,
          is_sponsored,
          is_active: shop.is_active,
          publication_status: shop.publication_status,
          category: shop.category,
          city: shop.city,
          theme_config: shop.theme_config,
          opening_hours: shop.opening_hours,
        };
      }));
  });

  router.get('/:slug', async (req, res) => {
    const { slug } = req.params;
    const isIdQuery = !Number.isNaN(Number(slug));
    const shop = shops.find((candidate) => candidate.slug === slug || candidate.id.toString() === slug);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });

    const token = getCookie(req, 'matable_session');
    const session = token ? merchantSessions.get(token) : undefined;
    const isMerchantForShop = Boolean(session && session.shopId === shop.id && session.expiresAt > Date.now());
    if (isMerchantForShop && !isRequestFingerprintMatch(session, req)) {
      return res.status(401).json({ error: 'Session rejetée : le navigateur ne correspond plus à celui utilisé lors de la connexion.' });
    }
    if (isIdQuery && !isMerchantForShop) return res.status(401).json({ error: 'Accès marchand requis pour ce catalogue.' });
    if (!isShopPubliclyVisible(shop) && !isMerchantForShop) return res.status(404).json({ error: 'Boutique introuvable' });
    if (!shop.is_active && !isMerchantForShop) {
      return res.json({
        shop: {
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          is_active: false,
          category: shop.category,
          theme_config: shop.theme_config,
          welcome_message: 'Boutique temporairement indisponible.',
        },
        products: [],
      });
    }

    const shopProducts = isIdQuery
      ? products.filter((product) => product.shop_id === shop.id)
      : products.filter((product) => product.shop_id === shop.id && product.is_available);
    const productLikeCounts = await getProductLikeCounts(shopProducts.map((product) => product.id));
    const activeBoost = await dbGet<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at, ends_at FROM shop_boosts
        WHERE shop_id = ? AND status IN ('scheduled', 'active')
          AND starts_at <= ? AND ends_at > ?
        ORDER BY ends_at DESC LIMIT 1`,
      [shop.id, new Date().toISOString(), new Date().toISOString()],
    );
    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        theme_color: shop.theme_color,
        welcome_message: shop.welcome_message,
        is_open: computeIsShopOpen(shop),
        is_sponsored: Boolean(activeBoost),
        is_active: shop.is_active,
        publication_status: shop.publication_status,
        merchant_verification_status: shop.merchant_verification_status,
        ...(isMerchantForShop ? { subscription: getSubscriptionState(shop) } : {}),
        category: shop.category,
        city: shop.city,
        theme_config: shop.theme_config,
        opening_hours: shop.opening_hours,
      },
      products: shopProducts.map((product) => ({ ...product, like_count: productLikeCounts.get(product.id) || 0 })),
    });
  });

  return router;
}
