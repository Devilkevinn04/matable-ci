import React, { useEffect, useState } from 'react';
import { ArrowRight, BadgePercent, CheckCircle2, Flame, MapPin, RotateCcw, Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { formatFCFA } from '../utils/format';
import { getCategoryDefaults, getProductImageForDisplay } from '../utils/categoryDefaults';
import type { ShopCategory } from '../utils/categoryDefaults';
import { getDiscoveryCityLabel } from '../utils/discoverySeo';
import { deduplicateProductsById } from '../utils/productFeed';
import { getActiveProductPrice } from '../utils/productPricing';
import { MotionReveal } from './MotionSystem';
import { PublicCampaignCarousel, type PublicCampaign } from './PublicCampaignCarousel';
import { PublicPartnerRequestForm } from './PublicPartnerRequestForm';

interface FeedShop {
  id: number;
  name: string;
  slug: string;
  category: string;
  city?: string;
}

export interface FeedProduct {
  id: number;
  shop_id: number;
  title: string;
  description?: string | null;
  price: number;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  stock: number;
  image_url: string;
  created_at?: string | null;
  popularity: { views: number; clicks: number };
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
  categories: ShopCategory[];
  onCampaignEligibilityChange?: (eligible: boolean) => void;
  promotionsOnly?: boolean;
  demoProducts?: FeedProduct[];
  demoCampaigns?: PublicCampaign[];
  demoCategory?: string;
  demoSearch?: string;
}

const PAGE_SIZE = 8;

export const ProductNewsFeed: React.FC<ProductNewsFeedProps> = ({ onOpenShop, categories, onCampaignEligibilityChange, promotionsOnly = false, demoProducts, demoCampaigns, demoCategory = 'all', demoSearch = '' }) => {
  const location = useLocation();
  const [sort, setSort] = useState<'popular' | 'new' | 'promotions'>(promotionsOnly ? 'promotions' : 'popular');
  const [category, setCategory] = useState('all');
  const [offset, setOffset] = useState(0);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [rankingFallback, setRankingFallback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setSort(promotionsOnly ? 'promotions' : 'popular');
    setOffset(0);
    setCategory('all');
  }, [promotionsOnly]);

  useEffect(() => {
    setCategory(demoCategory);
    setOffset(0);
  }, [demoCategory]);

  useEffect(() => {
    onCampaignEligibilityChange?.(products.length >= 6);
  }, [products.length, onCampaignEligibilityChange]);

  useEffect(() => {
    if (location.hash !== '#decouvertes') return;
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById('decouvertes');
      if (!section) return;
      const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      const top = section.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  useEffect(() => {
    const nextSaleBoundary = products
      .flatMap((product) => [product.sale_starts_at, product.sale_ends_at])
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextSaleBoundary) return;
    const timer = window.setTimeout(() => setRetryKey((key) => key + 1), Math.max(0, nextSaleBoundary - Date.now() + 25));
    return () => window.clearTimeout(timer);
  }, [products]);

  useEffect(() => {
    if (demoProducts) {
      const search = demoSearch.trim().toLocaleLowerCase('fr');
      const filtered = demoProducts
        .filter((product) => category === 'all' || product.shop.category === category)
        .filter((product) => !search || [product.title, product.shop.name, product.shop.city, getCategoryDefaults(product.shop.category).label]
          .some((value) => value?.toLocaleLowerCase('fr').includes(search)))
        .filter((product) => sort !== 'promotions' || getActiveProductPrice(product) < product.price)
        .sort((left, right) => sort === 'new'
          ? Date.parse(right.created_at || '') - Date.parse(left.created_at || '')
          : right.popularity.views + right.popularity.clicks - left.popularity.views - left.popularity.clicks);
      const page = filtered.slice(offset, offset + PAGE_SIZE);
      setProducts((current) => deduplicateProductsById(offset === 0 ? page : [...current, ...page]));
      setHasMore(offset + PAGE_SIZE < filtered.length);
      setRankingFallback(false);
      setIsLoading(false);
      setError(false);
      return undefined;
    }

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
        setProducts((current) => deduplicateProductsById(offset === 0 ? payload.products : [...current, ...payload.products]));
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
  }, [sort, category, offset, retryKey, demoProducts, demoCategory, demoSearch]);

  const changeFilter = (update: () => void) => {
    update();
    setOffset(0);
  };
  const renderProductCard = (product: FeedProduct) => {
    const productTitle = product.title.trim() || 'Produit local';
    const activePrice = getActiveProductPrice(product);
    const isPromotion = activePrice < product.price;
    const discountPercent = isPromotion && product.price > 0
      ? Math.round(((product.price - activePrice) / product.price) * 100)
      : 0;
    const isRecent = product.created_at ? Date.now() - Date.parse(product.created_at) < 21 * 24 * 60 * 60 * 1000 : false;
    const label = sort === 'popular' && !rankingFallback && product.popularity.views + product.popularity.clicks > 0
      ? 'Tendance'
      : sort === 'new' && isRecent
        ? 'Nouveau'
        : null;

    return (
    <Link
      to={`/${encodeURIComponent(product.shop.slug)}`}
      onClick={(event) => {
        if (!demoProducts) return;
        event.preventDefault();
        onOpenShop(product.shop.slug);
      }}
      className="motion-interactive group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7e9e5] bg-white text-left shadow-[0_2px_12px_rgba(20,40,30,.06)] transition hover:-translate-y-1 hover:border-[#b9d5ca] hover:shadow-[0_12px_28px_rgba(20,40,30,.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#d1fae5]">
        <img src={getProductImageForDisplay(product.image_url, product.shop.category)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.hidden = true; }} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {isPromotion
            ? <span aria-label={discountPercent > 0 ? `Réduction de ${discountPercent} %` : 'Prix réduit'} className="inline-flex items-center gap-1 rounded-full bg-[#c2410c] px-2.5 py-1 text-[10px] font-bold text-white"><BadgePercent className="h-3 w-3" aria-hidden="true" />{discountPercent > 0 ? `−${discountPercent}%` : 'Prix réduit'}</span>
            : label && <span className="rounded-full bg-[#FFFFFF]/95 px-2.5 py-1 text-[10px] font-bold text-[#065f46]">{label}</span>}
        </div>
        {product.stock > 0 && <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#065f46]">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Disponible
        </span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
        <p className="line-clamp-1 text-xs font-semibold text-[#647067]">{product.shop.name}</p>
        <h3 className="mt-1 line-clamp-2 min-h-10 font-display text-[15px] font-bold leading-5 text-[#292d2a] sm:text-base">{productTitle}</h3>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={`text-base font-extrabold ${isPromotion ? 'text-[#c2410c]' : 'text-[#065f46]'}`}>{formatFCFA(activePrice)}</p>
            {isPromotion && <p className="text-xs font-semibold text-[#81786d]"><del>{formatFCFA(product.price)}</del></p>}
            {isPromotion && product.sale_ends_at && <p className="basis-full text-[10px] font-semibold text-[#a53a1d]">Jusqu’au {new Date(product.sale_ends_at).toLocaleDateString('fr-FR')}</p>}
          </div>
          {product.shop.city && <p className="flex items-center gap-1 text-[11px] text-[#647067]"><MapPin className="h-3 w-3 text-[#047857]" aria-hidden="true" />{getDiscoveryCityLabel(product.shop.city)}</p>}
        </div>
      </div>
    </Link>
  );
  };

  return (
    <section id={promotionsOnly ? undefined : 'decouvertes'} className="mx-auto w-full max-w-[1440px] scroll-mt-24 overflow-hidden py-8 sm:py-12" aria-labelledby="product-feed-title">
      <div className="mx-auto max-w-[1184px] px-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <MotionReveal>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c]">{promotionsOnly ? 'Offres à durée limitée' : 'À parcourir aujourd’hui'}</p>
            <h2 id="product-feed-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{promotionsOnly ? 'Les offres actives' : 'À découvrir près de chez vous'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#647067]">
              {promotionsOnly
                ? 'Chaque réduction est calculée à partir du prix habituel et affichée avec sa date de fin. Les offres expirées ne sont pas présentées comme actives.'
                : sort === 'popular'
                ? rankingFallback
                  ? 'Les tendances se dessinent au fil des consultations. En attendant, voici les produits récemment ajoutés.'
                  : 'Les produits les plus consultés et cliqués récemment, tous visiteurs confondus.'
                : 'Les derniers produits ajoutés aux vitrines publiques.'}
            </p>
          </MotionReveal>
          {!promotionsOnly && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end" aria-label="Trier les produits">
            <button type="button" aria-pressed={sort === 'popular'} onClick={() => changeFilter(() => setSort('popular'))} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${sort === 'popular' ? 'bg-[#065f46] text-white' : 'border border-[#e0d5c6] bg-white text-[#47534b] hover:border-[#047857]'}`}><Flame className="h-4 w-4" aria-hidden="true" />Tendances</button>
            <button type="button" aria-pressed={sort === 'new'} onClick={() => changeFilter(() => setSort('new'))} className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${sort === 'new' ? 'bg-[#065f46] text-white' : 'border border-[#e0d5c6] bg-white text-[#47534b] hover:border-[#047857]'}`}><Sparkles className="h-4 w-4" aria-hidden="true" />Nouveautés</button>
          </div>}
        </div>

        <div className="mt-4 max-w-sm">
          <label htmlFor="product-feed-category" className="flex min-h-10 items-center gap-3 rounded-xl border border-[#e0d5c6] bg-white px-3 text-sm font-semibold text-[#47534b]">
            <span className="shrink-0 text-[#647067]">{promotionsOnly ? 'Filtrer' : 'Catégorie'}</span>
            <select id="product-feed-category" value={category} onChange={(event) => changeFilter(() => setCategory(event.target.value))} className="min-w-0 flex-1 bg-transparent py-2 outline-none">
              <option value="all">Toutes les catégories</option>
              {categories.map((key) => <option key={key} value={key}>{getCategoryDefaults(key).label}</option>)}
            </select>
          </label>
        </div>

      {isLoading && products.length === 0 ? (
        <div role="status" className="mt-6 rounded-2xl border border-[#e7ddd0] bg-white p-8 text-center text-sm font-semibold text-[#647067]">Chargement des produits…</div>
      ) : error && products.length === 0 ? (
        <div role="alert" className="mt-6 rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-8 text-center">
          <p className="font-bold text-[#292d2a]">Impossible de charger les produits pour le moment.</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#065f46] px-4 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" aria-hidden="true" />Réessayer</button>
        </div>
      ) : products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#cfc8bc] bg-[#FFFFFF] p-8 text-center text-sm text-[#647067]">{promotionsOnly ? 'Aucune promotion active pour cette catégorie. Revenez bientôt pour découvrir les prochaines offres.' : 'Aucun produit disponible avec ces filtres pour l’instant.'}</div>
      ) : (
        <>
          <ul className="mt-5 grid list-none grid-cols-2 items-stretch gap-3 p-0 sm:mt-6 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-label="Produits à découvrir">
            {products.map((product, index) => (
              <React.Fragment key={`${product.shop_id}-${product.id}`}>
                <li className="min-w-0"><MotionReveal delay={Math.min(index, 7) * 0.045}>{renderProductCard(product)}</MotionReveal></li>
                {!promotionsOnly && index === 3 && products.length >= 6 && <PublicCampaignCarousel onOpenShop={onOpenShop} eligible placement="feed" previewCampaigns={demoCampaigns} />}
              </React.Fragment>
            ))}
          </ul>
          {error && <p role="alert" className="mt-4 text-center text-sm text-[#9a3412]">La suite du fil n’a pas pu être chargée.</p>}
          {hasMore && <div className="mt-7 text-center"><button type="button" disabled={isLoading} onClick={() => setOffset((current) => current + PAGE_SIZE)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#065f46] bg-white px-5 text-sm font-bold text-[#065f46] hover:bg-[#d1fae5] disabled:opacity-50">{isLoading ? 'Chargement…' : 'Voir plus de produits'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div>}
        </>
      )}
      {!promotionsOnly && <PublicPartnerRequestForm />}
      </div>
    </section>
  );
};
