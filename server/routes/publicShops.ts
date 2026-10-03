import { Router, type Request } from 'express';
import { getSubscriptionState, isShopPubliclyVisible } from '../services/businessRules.ts';
import { rankShopsByVisibility } from '../services/visibility.ts';
import type { ProductRecord, ShopRecord } from '../types.ts';

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

  router.get('/', (_req, res) => {
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
    const rankedShops = rankShopsByVisibility(publicShopRecords, productCounts, computeIsShopOpen);
    res.json(rankedShops.map(({ shop, is_open, is_featured }) => {
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
          is_active: shop.is_active,
          publication_status: shop.publication_status,
          category: shop.category,
          city: shop.city,
          theme_config: shop.theme_config,
          opening_hours: shop.opening_hours,
        };
      }));
  });

  router.get('/:slug', (req, res) => {
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
    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        theme_color: shop.theme_color,
        welcome_message: shop.welcome_message,
        is_open: computeIsShopOpen(shop),
        is_active: shop.is_active,
        publication_status: shop.publication_status,
        merchant_verification_status: shop.merchant_verification_status,
        ...(isMerchantForShop ? { subscription: getSubscriptionState(shop) } : {}),
        category: shop.category,
        city: shop.city,
        theme_config: shop.theme_config,
        opening_hours: shop.opening_hours,
      },
      products: shopProducts,
    });
  });

  return router;
}
