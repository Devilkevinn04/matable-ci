import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, animate, m, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowRight, CheckCircle2, MapPin, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatFCFA } from '../utils/format';
import { getActiveProductPrice, getProductSaleStatus } from '../utils/productPricing';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';
import { isShopExcludedFromPublicIndex } from '../utils/shopIndexing';
import { TRIAL_DURATION_MONTHS, TRIAL_PROMOTION_SLOTS_PER_TIER } from '../utils/subscriptionFeatures';
import { FilterBar } from './FilterBar';
import { MotionGridItem } from './MotionSystem';
import { ProductOrderCard } from './ProductOrderCard';
import { useCatalogFilters } from '../hooks/useCatalogFilters';
import { useHomeFeed } from '../hooks/useHomeFeed';
import { filterCatalogProducts, getCategoryFacets, getCityOptions, getPriceOptions } from '../utils/catalogFilters';
import { CategoryProductImage } from './CategoryProductImage';
import { normalizeProductImage } from '../utils/categoryDefaults';
import { ShopCover, hasShopVisual } from './ShopCover';
import { MobileHome } from './MobileHome';
import { OrderStory } from './OrderStory';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MOTION_EASE, MOTION_SECONDS } from '../utils/motionTokens';

export interface AnimatedHomeShop {
  slug: string;
  name: string;
  category?: string;
  city?: string;
  is_verified?: boolean;
  is_open?: boolean;
  theme_color?: string;
  theme_config?: { custom_banner_url?: string; primary_color?: string };
  products_preview?: {
    id: number;
    title: string;
    description?: string | null;
    image_url: string;
    thumbnail_url?: string;
    price: number;
    sale_price?: number | null;
    sale_starts_at?: string | null;
    sale_ends_at?: string | null;
    in_stock?: boolean;
    created_at?: string | null;
  }[];
}

interface AnimatedHomeProps {
  shops: AnimatedHomeShop[];
  categories: string[];
  neighbourhoods: { label: string; path: string }[];
  abidjanShopCount: number | null;
  onOpenDirectory: (query?: string) => void;
}

const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const prefersReducedMotion = useReducedMotion() === true;
  const count = useMotionValue(prefersReducedMotion ? value : 0);
  const roundedCount = useTransform(count, (current) => Math.round(current).toLocaleString('fr-FR'));

  useEffect(() => {
    if (prefersReducedMotion) {
      count.set(value);
      return;
    }

    const controls = animate(count, value, { duration: MOTION_SECONDS.deliberate, ease: MOTION_EASE });
    return () => controls.stop();
  }, [count, prefersReducedMotion, value]);

  return <m.span aria-hidden="true">{roundedCount}</m.span>;
};

const categoryLabels: Record<string, string> = {
  fashion: 'Mode',
  food: 'Restauration',
  beauty: 'Beauté',
  electronics: 'Électronique',
  home: 'Maison',
  services: 'Services',
  health: 'Bien-être',
  crafts: 'Artisanat',
  education: 'Éducation',
  automotive: 'Automobile',
  other: 'Autres',
};

const PAGE_SIZE = 8;
const PRODUCT_SORTS = [
  { value: 'recommended', label: 'Recommandés' },
  { value: 'newest', label: 'Nouveautés' },
  { value: 'price', label: 'Prix croissant' },
];

const categoryLabel = (category?: string) => categoryLabels[category || 'other'] || 'Boutiques';
interface ProductWallProps {
  products: { shop: AnimatedHomeShop; product: NonNullable<AnimatedHomeShop['products_preview']>[number] }[];
}

/** Raccourcis visuels vers les mêmes produits que la grille : ignorés au clavier et par les lecteurs d’écran. */
const ProductWall: React.FC<ProductWallProps> = ({ products }) => {
  const columns = [products.filter((_, index) => index % 3 === 0), products.filter((_, index) => index % 3 === 1), products.filter((_, index) => index % 3 === 2)];
  return (
    <div className="mt-wall relative mx-auto h-[540px] w-full max-w-[640px] rotate-[-7deg]" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--mt-orange-bright)] sm:h-[460px] sm:w-[460px]" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--mt-orange-deep)]/30 sm:h-[560px] sm:w-[560px]" />
      <div className="absolute inset-0 grid grid-cols-2 gap-3 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)] sm:grid-cols-3 sm:gap-[18px]">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className={`${columnIndex === 2 ? 'hidden sm:block' : ''} overflow-hidden`}>
            <div className={`mt-wall-track flex flex-col gap-3 sm:gap-[18px] ${columnIndex === 1 ? 'mt-wall-track-reverse' : ''}`}>
              {[...column, ...column].map(({ shop, product }, index) => {
                const isPromotion = getProductSaleStatus(product) === 'active';
                return (
                  <Link key={`${shop.slug}-${product.title}-${index}`} to={`/${encodeURIComponent(shop.slug)}#product-${product.id}`} tabIndex={-1} className="block shrink-0 rounded-[22px] border border-[var(--mt-gray-200)] bg-white p-2 shadow-[0_18px_38px_rgb(33_38_34_/_18%)] sm:rounded-[22px]">
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--mt-gray-50)]">
                      <CategoryProductImage imageUrl={product.thumbnail_url || product.image_url} category={shop.category} title={product.title} sizes="420px" className="h-full w-full" />
                      {isPromotion && <span className="absolute left-2 top-2 rounded-full bg-[#c2410c] px-2 py-1 text-[11px] font-extrabold text-white">Promo</span>}
                      {shop.is_verified && <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[11px] font-extrabold text-[var(--mt-green-deep)]">Vérifié</span>}
                    </span>
                    <span className="line-clamp-2 px-1 pt-2 text-[15px] font-bold text-[var(--mt-gray-900)]">{product.title}</span>
                    <span className="mt-1 block truncate px-1 text-xs text-[var(--mt-gray-600)]">{shop.name} · {shop.city || 'Côte d’Ivoire'}</span>
                    <span className="mt-1 inline-flex flex-wrap items-baseline gap-1 rounded-full bg-[#fff7ed] px-2 py-1 text-xs font-extrabold text-[var(--mt-orange-deep)]">
                      {formatFCFA(getActiveProductPrice(product))}
                      {isPromotion && <del className="text-[11px] font-semibold text-[var(--mt-gray-600)]">{formatFCFA(product.price)}</del>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AnimatedHome: React.FC<AnimatedHomeProps> = (props) => {
  const isPhone = useMediaQuery('(max-width: 639px)');
  return isPhone
    ? <MobileHome shops={props.shops} onOpenDirectory={props.onOpenDirectory} />
    : <DesktopHome {...props} />;
};

const DesktopHome: React.FC<AnimatedHomeProps> = ({ shops, categories, neighbourhoods, abidjanShopCount, onOpenDirectory }) => {
  const safeShops = useMemo(
    () => shops
      .filter((shop) => !isShopExcludedFromPublicIndex(shop.name))
      .map((shop) => ({
        ...shop,
        products_preview: (shop.products_preview || []).filter((product) => !isAgeRestrictedProduct({ title: product.title, description: product.description || null })),
      })),
    [shops],
  );
  // Sous 1024 px, le mur passerait sous la recherche et repousserait les produits d’un écran.
  const hasWall = useMediaQuery('(min-width: 1024px)');
  const [query, setQuery] = useState('');
  const [visibleProductCount, setVisibleProductCount] = useState(PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const previews = useMemo(
    () => safeShops.flatMap((shop) => (shop.products_preview || []).map((product) => ({ shop, product }))),
    [safeShops],
  );
  // Le mur du hero n’affiche que de vraies photos : sans elles, il ressemblerait à un catalogue vide.
  const wallProducts = useMemo(
    () => previews.filter(({ product }) => Boolean(normalizeProductImage(product.thumbnail_url || product.image_url))),
    [previews],
  );
  const storyProduct = wallProducts.find(({ shop }) => shop.is_open !== false) ?? wallProducts[0];
  const { products, closedShops, isLoading } = useHomeFeed(shops);
  const { filters, update, clear } = useCatalogFilters();
  const facets = useMemo(() => getCategoryFacets(products, filters, closedShops, now), [products, filters, closedShops, now]);
  const cities = useMemo(() => getCityOptions(products), [products]);
  const priceOptions = useMemo(() => getPriceOptions(products, now), [products, now]);
  const filteredProducts = useMemo(() => filterCatalogProducts(products, filters, closedShops, now), [products, filters, closedShops, now]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  // Les boutiques avec un visuel (bannière ou photo produit) passent devant ; 8 au plus.
  const featuredShops = useMemo(
    () => [...safeShops].sort((left, right) => Number(hasShopVisual(right)) - Number(hasShopVisual(left))).slice(0, 8),
    [safeShops],
  );
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onOpenDirectory(query.trim() || undefined);
  };

  return (
    <main className="overflow-clip bg-[var(--mt-gray-50)] text-[var(--mt-gray-900)]">
      <section className="relative overflow-hidden border-y border-[var(--mt-gray-200)] bg-[var(--mt-gray-50)]">
        <div className="relative mx-auto grid max-w-[1440px] gap-6 px-4 pb-8 pt-8 sm:gap-8 sm:px-10 sm:pb-12 sm:pt-12 lg:min-h-[560px] lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-4 lg:px-16">
          <div className="relative z-10 min-w-0 max-w-2xl">
            <h1 className="font-display text-[clamp(2rem,9.2vw,2.75rem)] font-extrabold leading-[.98] tracking-[-.035em] text-[var(--mt-green-deep)] sm:text-[clamp(2.9rem,5.6vw,5rem)]">
              <span className="sr-only">Le commerce local, tout près de chez vous.</span>
              <span aria-hidden="true">
                {['Le', 'commerce'].map((word, index) => <React.Fragment key={word}><span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_var(--mt-motion-deliberate)_var(--mt-motion-ease)_both]" style={{ animationDelay: `${0.15 + index * 0.07}s` }}>{word}</span></span>{index === 0 ? ' ' : null}</React.Fragment>)}<br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_var(--mt-motion-deliberate)_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.29s' }}>local,</span></span>{' '}
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_var(--mt-motion-deliberate)_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.36s' }}>tout près</span></span><br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_var(--mt-motion-deliberate)_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.43s' }}>de chez vous.</span></span>
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[var(--mt-gray-600)] sm:mt-7 sm:text-xl sm:leading-8">
              Les vraies photos et les vrais prix des boutiques de votre quartier. Vous choisissez, le commerçant vous répond sur WhatsApp.
            </p>
            {abidjanShopCount !== null && (
              <p className="mt-3 text-sm font-bold text-[var(--mt-green-deep)] sm:text-base">
                <span className="sr-only">{abidjanShopCount.toLocaleString('fr-FR')} boutique{abidjanShopCount === 1 ? '' : 's'} à Abidjan</span>
                <span aria-hidden="true"><CountUp value={abidjanShopCount} /> boutique{abidjanShopCount === 1 ? '' : 's'} à Abidjan</span>
              </p>
            )}
            <form onSubmit={submitSearch} role="search" className="mt-5 flex w-full max-w-xl min-w-0 items-center gap-1 overflow-hidden rounded-full border-2 border-[var(--mt-green-deep)] bg-white p-2 shadow-[0_12px_30px_rgba(16,62,50,.12)] sm:mt-7 sm:gap-2">
              <Search className="ml-3 h-5 w-5 shrink-0 text-[var(--mt-gray-600)]" aria-hidden="true" />
              <input
                aria-label="Rechercher une boutique, un produit ou un quartier"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Alloco, parfum, savon…"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-[var(--mt-gray-600)]"
              />
              <button type="submit" aria-label="Chercher" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-3 text-sm font-extrabold text-white transition hover:bg-[var(--mt-green-primary)] sm:px-5">
                <span className="hidden sm:inline">Chercher</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </div>

          {hasWall && wallProducts.length >= 4 && <ProductWall products={wallProducts} />}
        </div>
      </section>

      {/* Ce qu’on peut commander passe avant le reste. */}
      <section aria-labelledby="home-products-title" aria-busy={isLoading} className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-10 sm:pt-12">
        <h2 id="home-products-title" className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">À commander <em className="not-italic text-[var(--mt-orange-deep)]">près de vous</em></h2>
        {isLoading ? (
          <div role="status" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <span className="sr-only">Chargement des produits…</span>
            {[0, 1, 2, 3].map((item) => <div key={item} aria-hidden="true" className="mt-skeleton h-80 rounded-2xl" />)}
          </div>
        ) : products.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[#d6d0c6] bg-white p-6 text-center text-sm font-semibold text-[var(--mt-gray-600)]">Les produits arrivent bientôt. Découvrez les boutiques en attendant.</p>
        ) : (
          <>
            <div className="mt-4">
              <FilterBar
                label="les produits"
                resultLabel={`${filteredProducts.length} produit${filteredProducts.length > 1 ? 's' : ''}`}
                filters={filters}
                facets={facets}
                cities={cities}
                priceOptions={priceOptions}
                sortOptions={PRODUCT_SORTS}
                onChange={(changes) => { update(changes); setVisibleProductCount(PAGE_SIZE); }}
                onClear={() => { clear(); setVisibleProductCount(PAGE_SIZE); }}
              />
            </div>
            {filteredProducts.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[#d6d0c6] bg-white p-6 text-center">
                <p className="text-sm font-semibold text-[var(--mt-gray-600)]">Aucun produit ne correspond à ces filtres.</p>
                <button type="button" onClick={() => clear()} className="mt-3 min-h-11 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white">Effacer les filtres</button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleProducts.map((product) => (
                    <MotionGridItem key={product.id} count={visibleProducts.length} className="grid min-w-0">
                      <ProductOrderCard product={product} isOpen={!closedShops.has(product.shop.slug)} now={now} />
                    </MotionGridItem>
                  ))}
                </AnimatePresence>
              </div>
            )}
            {visibleProducts.length < filteredProducts.length && (
              <button type="button" onClick={() => setVisibleProductCount((count) => count + PAGE_SIZE)} className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-full border border-[#cbd9d0] bg-white px-5 text-sm font-extrabold text-[#15513e] transition hover:bg-[#eff6f1]">
                Voir plus de produits <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </section>

      {/* Chaque boutique avec sa bannière ou, à défaut, ses propres photos. */}
      {featuredShops.length > 0 && (
        <section aria-labelledby="home-shops-title" className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-10 sm:pt-16">
          <div className="flex items-end justify-between gap-3">
            <h2 id="home-shops-title" className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">Boutiques à découvrir</h2>
            <nav aria-label="Boutiques par commune" className="ml-auto hidden flex-wrap items-center gap-x-4 text-sm font-semibold text-[var(--mt-gray-600)] md:flex">
              {neighbourhoods.map((place) => <Link key={place.path} to={place.path} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-[var(--mt-green-deep)] hover:underline">{place.label}</Link>)}
            </nav>
            <Link to="/boutiques" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-extrabold text-[#15513e]">Tout voir <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="mt-4 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 mt-chip-rail sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {featuredShops.map((shop) => (
              <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="group w-[72%] shrink-0 snap-start overflow-hidden rounded-3xl border border-[#e7e2d9] bg-white shadow-[0_8px_24px_rgba(16,62,50,.07)] sm:w-auto">
                <span className="relative block aspect-[4/3]">
                  <ShopCover shop={shop} className="absolute inset-0 h-full w-full transition-transform duration-[var(--mt-motion-standard)] group-hover:scale-[1.03]" sizes="(max-width: 640px) 72vw, 33vw" />
                  {shop.is_verified && <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-[var(--mt-green-deep)] shadow-sm"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Vérifié</span>}
                </span>
                <span className="block p-3.5">
                  <strong className="line-clamp-1 font-display text-base font-extrabold text-[#173c32]">{shop.name}</strong>
                  <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#68716b]">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{categoryLabel(shop.category)} · {shop.city || 'Côte d’Ivoire'}</span>
                  </span>
                  {shop.is_open !== undefined && <span className={`mt-2 inline-flex items-center gap-1.5 text-xs font-bold ${shop.is_open ? 'text-[var(--mt-green-primary)]' : 'text-[#9a6a3a]'}`}><span className={`h-1.5 w-1.5 rounded-full ${shop.is_open ? 'bg-[var(--mt-green-primary)]' : 'bg-[#d6a76c]'}`} />{shop.is_open ? 'Ouverte aux commandes' : 'Fermée pour le moment'}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {storyProduct && (
        <OrderStory
          title={storyProduct.product.title}
          price={getActiveProductPrice(storyProduct.product, now)}
          imageUrl={storyProduct.product.thumbnail_url || storyProduct.product.image_url}
          category={storyProduct.shop.category}
          shopName={storyProduct.shop.name}
        />
      )}

      <section className="mt-10 bg-[var(--mt-green-primary)] px-5 py-10 text-white sm:px-10 sm:py-14">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="max-w-4xl font-display text-3xl font-extrabold tracking-[-.06em] sm:text-5xl">Vous vendez ? <em className="not-italic text-[#ffe1bd]">Ouvrez votre vitrine.</em></h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">Vos produits en photo, vos prix, vos horaires, et les commandes qui arrivent directement sur votre WhatsApp. {TRIAL_DURATION_MONTHS} mois d’essai pour les {TRIAL_PROMOTION_SLOTS_PER_TIER} premières Standard et les {TRIAL_PROMOTION_SLOTS_PER_TIER} premières Premium.</p>
          <Link to="/commercants" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 font-extrabold text-[var(--mt-green-deep)] transition hover:bg-[var(--mt-gray-50)]">Ajouter ma boutique <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
};
