import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { matchesSearchWords } from '../utils/directorySearch';
import { MotionGridItem } from './MotionSystem';
import { ProductOrderCard, type OrderableProduct } from './ProductOrderCard';

const PAGE_SIZE = 8;
const SEARCH_DELAY_MS = 250;

/** Produits publiés correspondant à la recherche, sur tout le catalogue de toutes les boutiques. */
export function useProductSearch(query: string): { products: OrderableProduct[]; isSearching: boolean } {
  const [products, setProducts] = useState<OrderableProduct[]>([]);
  const [answeredSearch, setAnsweredSearch] = useState('');
  const search = query.trim();
  useEffect(() => {
    if (search.length < 2) {
      setProducts([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/v1/catalog/storefronts/feed?sort=popular&limit=48&q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { products: [] }))
        .then((data: { products?: OrderableProduct[] }) => {
          // Un article nommé comme la recherche passe avant ceux qui la citent dans leur description.
          const inTitle = (product: OrderableProduct) => Number(matchesSearchWords([product.title], search));
          setAnsweredSearch(search);
          setProducts([...(data.products || [])].sort((left, right) => inTitle(right) - inTitle(left)));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setAnsweredSearch(search);
          setProducts([]);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  return { products, isSearching: search.length >= 2 && answeredSearch !== search };
}

export const ProductSearchResults: React.FC<{ products: OrderableProduct[]; closedShops: ReadonlySet<string> }> = ({ products, closedShops }) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [products]);
  if (products.length === 0) return null;
  const now = Date.now();
  return (
    <section aria-labelledby="product-results-title" className="relative z-10 mb-6">
      <h2 id="product-results-title" aria-live="polite" className="font-display text-xl font-extrabold tracking-tight text-[#183f32] sm:text-2xl">
        {products.length} produit{products.length > 1 ? 's' : ''} trouvé{products.length > 1 ? 's' : ''}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence initial={false} mode="popLayout">
          {products.slice(0, visibleCount).map((product) => (
            <MotionGridItem key={product.id} count={Math.min(visibleCount, products.length)} className="grid min-w-0">
              <ProductOrderCard product={product} isOpen={!closedShops.has(product.shop.slug)} now={now} />
            </MotionGridItem>
          ))}
        </AnimatePresence>
      </div>
      {visibleCount < products.length && (
        <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-[#cbd9d0] bg-white text-sm font-extrabold text-[var(--mt-green-deep)]">
          Voir plus de produits
        </button>
      )}
    </section>
  );
};
