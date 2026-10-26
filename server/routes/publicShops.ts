import { Router, type Request } from 'express';
import { dbAll, dbGet } from '../../db.ts';
import { getSubscriptionState, isShopPubliclyVisible } from '../services/businessRules.ts';
import { rankShopsByVisibility } from '../services/visibility.ts';
import type { ProductRecord, ShopRecord } from '../types.ts';
import { isShopCategory } from '../../src/utils/categoryDefaults.ts';
import { toDiscoveryCitySlug } from '../../src/utils/discoverySeo.ts';
import { isAgeRestrictedProduct } from '../../src/utils/ageRestrictedProducts.ts';
import { mapProductRow } from '../repositories/products.ts';
import { mapShopRow } from '../repositories/shops.ts';

const publicShopColumns = `id, name, slug, theme_color, welcome_message, is_open, is_active,
  publication_status, featured_until, merchant_verification_status, selected_subscription_tier,
  subscription_status, trial_start, trial_end, subscription_expires_at,
  subscription_admin_override_status, subscription_admin_override_tier, subscription_admin_override_until,
  created_at, category, city, theme_config, opening_hours`;
const FEED_QUERY_BATCH_SIZE = 48;

interface MerchantSession {
  shopId: number;
  expiresAt: number;
  fingerprint: string;
}

interface PublicShopsRouterOptions {
  merchantSessions: Map<string, MerchantSession>;
  getCookie: (req: Request, name: string) => string | null;
  isRequestFingerprintMatch: (session: { fingerprint?: string } | null | undefined, req: Request) => boolean;
  computeIsShopOpen: (shop: ShopRecord) => boolean;
  isAdminShopSession: (req: Request, shopId: number) => Promise<boolean>;
}

export function createPublicShopsRouter({
  merchantSessions,
  getCookie,
  isRequestFingerprintMatch,
  computeIsShopOpen,
  isAdminShopSession,
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
    if (sort !== 'popular' && sort !== 'new' && sort !== 'for_you' && sort !== 'promotions') return res.status(400).json({ error: 'Tri de fil invalide.' });
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    if (category && !isShopCategory(category)) return res.status(400).json({ error: 'Catégorie invalide.' });
    const preferredCategories: string[] = typeof req.query.preferred_categories === 'string'
      ? req.query.preferred_categories.split(',').map((value) => value.trim()).filter(isShopCategory).slice(0, 4)
      : [];
    const citySlug = typeof req.query.city === 'string' ? toDiscoveryCitySlug(req.query.city) : '';
    const limitValue = Number(req.query.limit ?? 24);
    const offsetValue = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(limitValue) ? Math.min(48, Math.max(1, limitValue)) : 24;
    const offset = Number.isInteger(offsetValue) ? Math.max(0, offsetValue) : 0;

    const shopRows = await dbAll<Record<string, unknown>>(`SELECT ${publicShopColumns} FROM shops`);
    const currentShops = shopRows.map((row) => mapShopRow({ ...row, pin_code_hash: '' }));
    const publicShopRecords = currentShops.filter((shop) => isShopPubliclyVisible(shop)
      && (!category || shop.category === category)
      && (!citySlug || toDiscoveryCitySlug(shop.city || '') === citySlug));
    const publicShopsById = new Map(publicShopRecords.map((shop) => [shop.id, shop]));
    const shopIds = publicShopRecords.map((shop) => shop.id);
    const popularityByProductId = new Map<number, { views: number; clicks: number }>();
    const popularityJoin = sort === 'popular' && shopIds.length > 0
      ? `LEFT JOIN (
          SELECT shop_id, path,
            SUM(CASE WHEN event_type = 'product_view' THEN 1 ELSE 0 END) AS views,
            SUM(CASE WHEN event_type = 'product_click' THEN 1 ELSE 0 END) AS clicks
          FROM analytics_events
          WHERE shop_id IN (${shopIds.map(() => '?').join(', ')})
            AND event_type IN ('product_view', 'product_click')
            AND path LIKE '/product/%'
            AND created_at >= ?
          GROUP BY shop_id, path
        ) popularity ON popularity.shop_id = p.shop_id
          AND popularity.path = '/product/' || CAST(p.id AS TEXT)`
      : '';
    const queryParameters: (number | string)[] = [];
    if (popularityJoin) {
      queryParameters.push(...shopIds, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }
    if (sort === 'promotions') queryParameters.push(new Date().toISOString(), new Date().toISOString());
    queryParameters.push(...shopIds);

    let orderBy = 'p.created_at DESC, p.id DESC';
    if (sort === 'popular') {
      orderBy = 'COALESCE(popularity.views, 0) + COALESCE(popularity.clicks, 0) DESC, p.created_at DESC, p.id DESC';
    } else if (sort === 'for_you' && preferredCategories.length > 0) {
      const categoryPlaceholders = preferredCategories.map(() => '?').join(', ');
      orderBy = `CASE WHEN s.category IN (${categoryPlaceholders}) THEN 0 ELSE 1 END,
        CASE WHEN p.created_at >= ? THEN 0 ELSE 1 END,
        CASE ${preferredCategories.map((_, index) => `WHEN s.category = ? THEN ${index}`).join(' ')} ELSE ${preferredCategories.length} END,
        p.created_at DESC, p.id DESC`;
      queryParameters.push(...preferredCategories, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), ...preferredCategories);
    } else if (sort === 'promotions') {
      orderBy = 'p.sale_ends_at ASC, p.created_at DESC, p.id DESC';
    }

    const feedProducts: ProductRecord[] = [];
    let rawOffset = 0;
    const requiredProductCount = offset + limit + 1;
    let hasMoreRawProducts = shopIds.length > 0;
    while (feedProducts.length < requiredProductCount && hasMoreRawProducts) {
      const productRows = await dbAll<Record<string, unknown>>(
        `SELECT p.id, p.shop_id, p.title, p.description, p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at, p.stock, p.created_at,
          ${popularityJoin ? 'COALESCE(popularity.views, 0)' : '0'} AS views,
          ${popularityJoin ? 'COALESCE(popularity.clicks, 0)' : '0'} AS clicks
         FROM products p
         JOIN shops s ON s.id = p.shop_id
         ${popularityJoin}
         WHERE p.is_available = 1 AND p.stock > 0
           ${sort === 'promotions' ? 'AND p.sale_price IS NOT NULL AND p.sale_starts_at <= ? AND p.sale_ends_at > ?' : ''}
           AND p.shop_id IN (${shopIds.map(() => '?').join(', ')})
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...queryParameters, FEED_QUERY_BATCH_SIZE, rawOffset],
      );
      hasMoreRawProducts = productRows.length === FEED_QUERY_BATCH_SIZE;
      rawOffset += productRows.length;
      for (const row of productRows) {
        const product = {
          id: Number(row.id),
          shop_id: Number(row.shop_id),
          title: String(row.title),
          description: row.description == null ? null : String(row.description),
          price: Number(row.price),
          sale_price: row.sale_price == null ? null : Number(row.sale_price),
          sale_starts_at: row.sale_starts_at == null ? null : String(row.sale_starts_at),
          sale_ends_at: row.sale_ends_at == null ? null : String(row.sale_ends_at),
          stock: Number(row.stock),
          image_url: '',
          is_available: true,
          created_at: row.created_at == null ? null : String(row.created_at),
        } as ProductRecord;
        if (isAgeRestrictedProduct(product)) continue;
        popularityByProductId.set(product.id, {
          views: Number(row.views) || 0,
          clicks: Number(row.clicks) || 0,
        });
        feedProducts.push(product);
        if (feedProducts.length >= requiredProductCount) break;
      }
    }
    const hasPopularityData = [...popularityByProductId.values()].some(({ views, clicks }) => views > 0 || clicks > 0);

    const page = feedProducts.slice(offset, offset + limit);
    const pageProductIds = page.map((product) => product.id);
    const [likeCounts, imageRows] = await Promise.all([
      getProductLikeCounts(pageProductIds),
      pageProductIds.length > 0
        ? dbAll<{ id: number; image_url: string | null }>(
          `SELECT id, image_url FROM products WHERE id IN (${pageProductIds.map(() => '?').join(', ')})`,
          pageProductIds,
        )
        : Promise.resolve([]),
    ]);
    const imageByProductId = new Map(imageRows.map((row) => [Number(row.id), row.image_url || '']));
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({
      sort,
      ranking_fallback: (sort === 'popular' && !hasPopularityData) || (sort === 'for_you' && preferredCategories.length === 0),
      has_more: offset + limit < feedProducts.length,
      products: page.map((product) => {
        const shop = publicShopsById.get(product.shop_id)!;
        const popularity = popularityByProductId.get(product.id) || { views: 0, clicks: 0 };
        return {
          ...product,
          image_url: imageByProductId.get(product.id) || '',
          popularity,
          like_count: likeCounts.get(product.id) || 0,
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
    const shopRows = await dbAll<Record<string, unknown>>(`SELECT ${publicShopColumns} FROM shops`);
    const currentShops = shopRows.map((row) => mapShopRow({ ...row, pin_code_hash: '' }));
    const publicShopRecords = currentShops.filter((shop) => isShopPubliclyVisible(shop));
    const publicShopIds = publicShopRecords.map((shop) => shop.id);
    const [productCountRows, previewRows] = publicShopIds.length > 0
      ? await Promise.all([
        dbAll<{ shop_id: number; count: number | string }>(
          `SELECT shop_id, COUNT(*) AS count FROM products
           WHERE shop_id IN (${publicShopIds.map(() => '?').join(', ')}) AND is_available = 1 AND stock > 0
           GROUP BY shop_id`,
          publicShopIds,
        ),
        dbAll<Record<string, unknown>>(
          `SELECT id, shop_id, title, description, image_url, price FROM (
             SELECT id, shop_id, title, description, image_url, price,
               ROW_NUMBER() OVER (PARTITION BY shop_id ORDER BY id) AS preview_rank
             FROM products
             WHERE shop_id IN (${publicShopIds.map(() => '?').join(', ')}) AND is_available = 1 AND stock > 0
           ) AS ranked_products WHERE preview_rank <= 3`,
          publicShopIds,
        ),
      ])
      : [[], []];
    const productCounts = new Map(productCountRows.map((row) => [Number(row.shop_id), Number(row.count) || 0]));
    const productsPreviewByShop = new Map<number, { id: number; title: string; image_url: string; price: number }[]>();
    for (const row of previewRows) {
      if (isAgeRestrictedProduct({ title: String(row.title || ''), description: String(row.description || '') })) continue;
      const shopId = Number(row.shop_id);
      const previews = productsPreviewByShop.get(shopId) || [];
      previews.push({
        id: Number(row.id),
        title: String(row.title),
        image_url: String(row.image_url || ''),
        price: Number(row.price),
      });
      productsPreviewByShop.set(shopId, previews);
    }
    const now = new Date().toISOString();
    const activeBoosts = await dbAll<{ shop_id: number; placement: string }>(
      `SELECT DISTINCT shop_id, placement FROM shop_boosts
        WHERE status IN ('scheduled', 'active') AND starts_at <= ? AND ends_at > ?`,
      [now, now],
    );
    const boostPlacementsByShop = new Map<number, string[]>();
    for (const boost of activeBoosts) {
      const placements = boostPlacementsByShop.get(Number(boost.shop_id)) || [];
      placements.push(String(boost.placement));
      boostPlacementsByShop.set(Number(boost.shop_id), placements);
    }
    const sponsoredShopIds = new Set(activeBoosts
      .filter((boost) => ['home', 'directory'].includes(boost.placement))
      .map((boost) => Number(boost.shop_id)));
    const rankedShops = rankShopsByVisibility(publicShopRecords, productCounts, computeIsShopOpen, Date.parse(now), sponsoredShopIds);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(rankedShops.map(({ shop, is_open, is_featured, is_sponsored }) => {
        const availableProducts = productsPreviewByShop.get(shop.id) || [];
        return {
          products_preview: availableProducts,
          products_count: productCounts.get(shop.id) || 0,
          id: shop.id,
          name: shop.name,
          slug: shop.slug,
          created_at: shop.created_at,
          theme_color: shop.theme_color,
          welcome_message: shop.welcome_message,
          is_open,
          is_featured,
          is_sponsored,
          boost_placements: boostPlacementsByShop.get(shop.id) || [],
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
    const shopRow = await dbGet<Record<string, unknown>>(
      `SELECT id, name, slug, whatsapp_number, theme_color, welcome_message, is_open, is_active,
        publication_status, featured_until, merchant_verification_status, selected_subscription_tier,
        subscription_status, trial_start, trial_end, subscription_expires_at,
        subscription_admin_override_status, subscription_admin_override_tier, subscription_admin_override_until,
        created_at, category, city, theme_config, opening_hours
       FROM shops WHERE slug = ? OR CAST(id AS TEXT) = ? LIMIT 1`,
      [slug, slug],
    );
    const shop = shopRow ? mapShopRow({ ...shopRow, pin_code_hash: '', owner_access_token_hash: null }) : undefined;
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable' });

    const token = getCookie(req, 'matable_session');
    const session = token ? merchantSessions.get(token) : undefined;
    const isAdminForShop = await isAdminShopSession(req, shop.id);
    const isMerchantSessionForShop = Boolean(session && session.shopId === shop.id && session.expiresAt > Date.now());
    const isMerchantForShop = isMerchantSessionForShop || isAdminForShop;
    if (isMerchantSessionForShop && !isRequestFingerprintMatch(session, req)) {
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
          ...(isAdminForShop ? { admin_mode: true } : {}),
        },
        products: [],
      });
    }

    const productRows = await dbAll<Record<string, unknown>>(
      `SELECT * FROM products WHERE shop_id = ?${isIdQuery ? '' : ' AND is_available = 1'}`,
      [shop.id],
    );
    const shopProducts = productRows.map(mapProductRow);
    const hasAgeRestrictedProducts = shopProducts.some(isAgeRestrictedProduct);
    const ageConfirmed = req.query.age_confirmed === '1';
    const publicShopProducts = !isMerchantForShop && !ageConfirmed
      ? shopProducts.filter((product) => !isAgeRestrictedProduct(product))
      : shopProducts;
    const productLikeCounts = await getProductLikeCounts(shopProducts.map((product) => product.id));
    const activeBoost = await dbGet<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at, ends_at FROM shop_boosts
        WHERE shop_id = ? AND status IN ('scheduled', 'active')
          AND starts_at <= ? AND ends_at > ?
        ORDER BY ends_at DESC LIMIT 1`,
      [shop.id, new Date().toISOString(), new Date().toISOString()],
    );
    if (!isMerchantForShop && isShopPubliclyVisible(shop)) {
      res.setHeader('Cache-Control', ageConfirmed ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=60');
    }
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
        ...(isAdminForShop ? { admin_mode: true } : {}),
      },
      has_age_restricted_products: hasAgeRestrictedProducts,
      products: publicShopProducts.map((product) => ({ ...product, like_count: productLikeCounts.get(product.id) || 0 })),
    });
  });

  return router;
}
