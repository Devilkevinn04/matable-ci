import { useEffect, useMemo, useState } from 'react';
import type { AnimatedHomeShop } from '../components/AnimatedHome';
import type { OrderableProduct } from '../components/ProductOrderCard';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';
import { orderHomeProducts } from '../utils/homeProducts';
import { cachedFetchJson } from '../utils/requestCache';
import { isShopExcludedFromPublicIndex } from '../utils/shopIndexing';

const FEED_URL = '/api/v1/catalog/storefronts/feed?sort=popular&limit=48';

/** Repli si le fil produits est indisponible : les aperçus déjà chargés avec les boutiques. */
function getPreviewItems(shops: readonly AnimatedHomeShop[]): OrderableProduct[] {
  return shops.flatMap((shop) => (shop.products_preview || [])
    .filter((product) => !isAgeRestrictedProduct({ title: product.title, description: product.description || null }, shop.name))
    .map((product) => ({ ...product, stock: null, shop })));
}

/** Produits à commander depuis l’accueil, dans le même ordre sur téléphone et sur ordinateur. */
export function useHomeFeed(shops: AnimatedHomeShop[]) {
  const [feed, setFeed] = useState<OrderableProduct[] | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let active = true;
    cachedFetchJson<{ products: OrderableProduct[] }>(FEED_URL, async () => {
      const response = await fetch(FEED_URL);
      if (!response.ok) throw new Error('feed_unavailable');
      return response.json();
    })
      .then((data) => { if (active) setFeed(data.products || []); })
      .catch(() => { if (active) setHasFailed(true); });
    return () => { active = false; };
  }, []);

  const visibleShops = useMemo(() => shops.filter((shop) => !isShopExcludedFromPublicIndex(shop.name)), [shops]);
  // Tant que les boutiques chargent, un article n’est pas présenté comme fermé.
  const closedShops = useMemo(() => new Set(shops.filter((shop) => shop.is_open === false).map(({ slug }) => slug)), [shops]);
  const products = useMemo(() => {
    const available = (feed ?? (hasFailed ? getPreviewItems(visibleShops) : []))
      .filter((product) => !isShopExcludedFromPublicIndex(product.shop.name));
    const openShops = new Set(available.map(({ shop }) => shop.slug).filter((slug) => !closedShops.has(slug)));
    return orderHomeProducts(available, openShops);
  }, [feed, hasFailed, visibleShops, closedShops]);

  return { products, visibleShops, closedShops, isLoading: feed === null && !hasFailed };
}
