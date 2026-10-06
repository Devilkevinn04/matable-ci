import React, { useEffect, useState } from 'react';
import { ArrowRight, Flame, Heart, MapPin, RotateCcw, Sparkles } from 'lucide-react';
import { formatFCFA } from '../utils/format';
import { getCategoryDefaults, getProductImageForDisplay, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { getDiscoveryCityLabel } from '../utils/discoverySeo';

interface FeedShop {
  id: number;
  name: string;
  slug: string;
  category: string;
  city?: string;
}

interface FeedProduct {
  id: number;
  shop_id: number;
  title: string;
  description?: string | null;
  price: number;
  stock: number;
  image_url: string;
  created_at?: string | null;
  popularity: { views: number; clicks: number };
  is_sponsored: boolean;
  like_count: number;
  shop: FeedShop;
}

interface FeedResponse {
  products: FeedProduct[];
  has_more: boolean;
  ranking_fallback: boolean;
}

interface ProductNewsFeedProps {
  onOpenShop: (slug: string) => void;
}

const PAGE_SIZE = 24;

export const ProductNewsFeed: React.FC<ProductNewsFeedProps> = ({ onOpenShop }) => {
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const [category, setCategory] = useState('all');
  const [offset, setOffset] = useState(0);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [rankingFallback, setRankingFallback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const productGridColumns = products.length === 1
    ? 'lg:grid-cols-1'
    : products.length === 2
      ? 'sm:grid-cols-2'
      : products.length === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sort, limit: String(PAGE_SIZE), offset: String(offset) });
    if (category !== 'all') params.set('category', category);

    setIsLoading(true);
    setError(false);
    if (offset === 0) setProducts([]);
    fetch(`/api/v1/catalog/storefronts/feed?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Product feed request failed: ${response.status}`);
        const payload = await response.json() as FeedResponse;
        if (!Array.isArray(payload.products)) throw new Error('Product feed response is invalid.');
        setProducts((current) => offset === 0 ? payload.products : [...current, ...payload.products]);
        setHasMore(Boolean(payload.has_more));
        setRankingFallback(Boolean(payload.ranking_fallback));
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Unable to load the public product feed.', loadError);
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [sort, category, offset, retryKey]);

  const changeFilter = (update: () => void) => {
    update();
    setOffset(0);
  };

  return (
    <section id="actualites" className="mx-auto w-full max-w-[1184px] px-5 py-8 sm:px-8 sm:py-12" aria-labelledby="product-feed-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">À parcourir aujourd’hui</p>
          <h2 id="product-feed-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Des produits, des envies, du local.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a61]">
            {sort === 'popular'
              ? rankingFallback
                ? 'Les tendances se dessinent au fil des consultations. En attendant, voici les produits récemment ajoutés.'
                : 'Les produits les plus consultés et cliqués récemment, tous visiteurs confondus.'
              : 'Les derniers produits ajoutés aux vitrines publiques.'}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end" aria-label="Trier les produits">
          <button type="button" aria-pressed={sort === 'popular'} onClick={() => changeFilter(() => setSort('popular'))} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${sort === 'popular' ? 'bg-[#0f4d3d] text-white' : 'border border-[#e0d5c6] bg-white text-[#4a3a30] hover:border-[#176b55]'}`}><Flame className="h-4 w-4" aria-hidden="true" />Tendances</button>
          <button type="button" aria-pressed={sort === 'new'} onClick={() => changeFilter(() => setSort('new'))} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${sort === 'new' ? 'bg-[#0f4d3d] text-white' : 'border border-[#e0d5c6] bg-white text-[#4a3a30] hover:border-[#176b55]'}`}><Sparkles className="h-4 w-4" aria-hidden="true" />Nouveautés</button>
        </div>
      </div>

      <div className="mt-5 max-w-md">
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e0d5c6] bg-white px-3 text-sm font-semibold text-[#4a3a30]">
          <span className="shrink-0">Catégorie</span>
          <select value={category} onChange={(event) => changeFilter(() => setCategory(event.target.value))} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
            <option value="all">Toutes les catégories</option>
            {SHOP_CATEGORIES.map((key) => <option key={key} value={key}>{getCategoryDefaults(key).label}</option>)}
          </select>
        </label>
      </div>

      {isLoading && products.length === 0 ? (
        <div role="status" className="mt-6 rounded-2xl border border-[#e7ddd0] bg-white p-8 text-center text-sm font-semibold text-[#6f6a61]">Chargement des produits…</div>
      ) : error && products.length === 0 ? (
        <div role="alert" className="mt-6 rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-8 text-center">
          <p className="font-bold text-[#25231f]">Impossible de charger les produits pour le moment.</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0f4d3d] px-4 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" aria-hidden="true" />Réessayer</button>
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#cfc8bc] bg-[#fffdf9] p-8 text-center text-sm text-[#6f6a61]">Aucun produit disponible avec ces filtres pour l’instant.</div>
      ) : (
        <>
          <div className={`mt-6 grid gap-4 ${productGridColumns}`}>
            {products.map((product) => (
              <a key={`${product.shop_id}-${product.id}`} href={`/${encodeURIComponent(product.shop.slug)}`} onClick={(event) => { event.preventDefault(); onOpenShop(product.shop.slug); }} className={`group flex h-full overflow-hidden rounded-[20px] border border-[#e7ddd0] bg-white text-left shadow-[0_8px_24px_rgba(36,28,22,.05)] transition hover:-translate-y-1 hover:shadow-[0_18px_36px_rgba(36,28,22,.11)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2 ${products.length === 1 ? 'flex-col sm:flex-row' : 'flex-col'}`}>
                <div className={`relative overflow-hidden bg-[#e4f1ec] ${products.length === 1 ? 'aspect-[4/3] sm:aspect-auto sm:h-[360px] sm:w-[40%] sm:shrink-0' : 'aspect-[4/3]'}`}>
                  <img src={getProductImageForDisplay(product.image_url, product.shop.category)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                    {product.is_sponsored && <span className="rounded-full bg-[#25231f]/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Sponsorisé</span>}
                    {sort === 'popular' && !rankingFallback && product.popularity.views + product.popularity.clicks > 0 && <span className="rounded-full bg-[#fffdf9]/95 px-2.5 py-1 text-[10px] font-bold text-[#0f4d3d]">Tendance</span>}
                    {sort === 'new' && product.created_at && Date.now() - Date.parse(product.created_at) < 14 * 24 * 60 * 60 * 1000 && <span className="rounded-full bg-[#fffdf9]/95 px-2.5 py-1 text-[10px] font-bold text-[#0f4d3d]">Nouveau</span>}
                  </div>
                </div>
                <div className={`flex flex-1 flex-col ${products.length === 1 ? 'p-5 sm:justify-center sm:p-8' : 'p-4'}`}>
                  <p className="line-clamp-1 text-xs font-semibold text-[#6f6a61]">{product.shop.name}</p>
                  <h3 className="mt-1 line-clamp-2 min-h-11 font-display text-base font-bold leading-5 text-[#25231f]">{product.title}</h3>
                  {products.length === 1 && product.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#6f6a61]">{product.description}</p>}
                  <p className="mt-2 text-lg font-extrabold text-[#0f4d3d]">{formatFCFA(product.price)}</p>
                  {product.shop.city && <p className="mt-2 flex items-center gap-1 text-xs text-[#6f6a61]"><MapPin className="h-3.5 w-3.5 text-[#176b55]" aria-hidden="true" />{getDiscoveryCityLabel(product.shop.city)}</p>}
                  {product.like_count > 0 && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#9b4444]"><Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />{product.like_count} J’aime</p>}
                  <span className="mt-4 inline-flex items-center gap-1 border-t border-[#eee6dd] pt-3 text-sm font-bold text-[#0f4d3d]">Voir la boutique <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                </div>
              </a>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 text-center text-sm text-[#9a3412]">La suite du fil n’a pas pu être chargée.</p>}
          {hasMore && <div className="mt-7 text-center"><button type="button" disabled={isLoading} onClick={() => setOffset((current) => current + PAGE_SIZE)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#0f4d3d] bg-white px-5 text-sm font-bold text-[#0f4d3d] hover:bg-[#e4f1ec] disabled:opacity-50">{isLoading ? 'Chargement…' : 'Voir plus de produits'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div>}
        </>
      )}
    </section>
  );
};
