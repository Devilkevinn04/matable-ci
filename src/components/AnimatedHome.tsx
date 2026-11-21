import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, animate, m, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { ArrowRight, BadgePercent, CheckCircle2, MapPin, Search, Sparkles, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatFCFA } from '../utils/format';
import { getActiveProductPrice, getProductSaleStatus } from '../utils/productPricing';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';
import { isShopExcludedFromPublicIndex } from '../utils/shopIndexing';
import { getDiscoveryCityLabel } from '../utils/discoverySeo';
import { MotionReveal } from './MotionSystem';
import { CategoryProductImage } from './CategoryProductImage';
import { getCategoryDefaults, normalizeProductImage } from '../utils/categoryDefaults';
import { ShopCover, hasShopVisual } from './ShopCover';
import { CategoryIcon } from './CategoryIcon';

interface AnimatedHomeShop {
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

    const controls = animate(count, value, { duration: 0.8, ease: 'easeOut' });
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

const categoryLabel = (category?: string) => categoryLabels[category || 'other'] || 'Boutiques';
interface ProductWallProps {
  products: { shop: AnimatedHomeShop; product: NonNullable<AnimatedHomeShop['products_preview']>[number] }[];
}

const ProductWall: React.FC<ProductWallProps> = ({ products }) => {
  const columns = [products.filter((_, index) => index % 3 === 0), products.filter((_, index) => index % 3 === 1), products.filter((_, index) => index % 3 === 2)];
  return (
    <div className="mt-wall relative mx-auto h-[320px] w-full max-w-[680px] rotate-[-6deg] scale-[1.02] sm:h-[640px] sm:rotate-[-7deg] sm:scale-105" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--mt-orange-bright)] sm:h-[460px] sm:w-[460px]" />
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--mt-orange-deep)]/30 sm:h-[560px] sm:w-[560px]" />
      <div className="absolute inset-0 grid grid-cols-2 gap-3 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)] sm:grid-cols-3 sm:gap-[18px]">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className={`${columnIndex === 2 ? 'hidden sm:block' : ''} overflow-hidden`}>
            <div className={`mt-wall-track flex flex-col gap-3 sm:gap-[18px] ${columnIndex === 1 ? 'mt-wall-track-reverse' : ''}`} style={{ animationDuration: `${[40, 52, 46][columnIndex]}s` }}>
              {[...column, ...column].map(({ shop, product }, index) => {
                const isPromotion = getProductSaleStatus(product) === 'active';
                return (
                  <div key={`${shop.slug}-${product.title}-${index}`} className="shrink-0 rounded-[22px] border border-[var(--mt-gray-200)] bg-white p-2 shadow-[0_18px_38px_rgb(33_38_34_/_18%)] sm:rounded-[22px]">
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
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AnimatedHome: React.FC<AnimatedHomeProps> = ({ shops, categories, neighbourhoods, abidjanShopCount, onOpenDirectory }) => {
  const prefersReducedMotion = useReducedMotion() === true;
  const safeShops = useMemo(
    () => shops
      .filter((shop) => !isShopExcludedFromPublicIndex(shop.name))
      .map((shop) => ({
        ...shop,
        products_preview: (shop.products_preview || []).filter((product) => !isAgeRestrictedProduct({ title: product.title, description: product.description || null })),
      })),
    [shops],
  );
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState('Plat, produit, quartier…');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('all');
  const [productSort, setProductSort] = useState<'recommended' | 'newest' | 'price'>('recommended');
  const [visibleProductCount, setVisibleProductCount] = useState(8);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const products = useMemo(
    () => safeShops.flatMap((shop) => (shop.products_preview || []).map((product) => ({ shop, product }))),
    [safeShops],
  );
  // Le mur du hero n’affiche que de vraies photos : sans elles, il ressemblerait à un catalogue vide.
  const wallProducts = useMemo(
    () => products.filter(({ product }) => Boolean(normalizeProductImage(product.thumbnail_url || product.image_url))),
    [products],
  );
  const visibleNeighborhoods = useMemo(
    () => [...new Map(neighbourhoods.map((place) => [place.label.trim().toLocaleLowerCase(), place.label.trim()])).values()],
    [neighbourhoods],
  );
  const filteredProducts = useMemo(() => {
    const filtered = products.filter(({ shop }) => {
      const matchesCategory = selectedCategory === 'all' || shop.category === selectedCategory;
      const matchesNeighborhood = selectedNeighborhood === 'all'
        || (shop.city || '').toLocaleLowerCase().includes(selectedNeighborhood.toLocaleLowerCase());
      return matchesCategory && matchesNeighborhood;
    });

    // Par défaut, les articles avec photo passent devant (tri stable : l’ordre d’origine est conservé).
    const hasPhoto = (entry: (typeof filtered)[number]) => (normalizeProductImage(entry.product.thumbnail_url || entry.product.image_url) ? 1 : 0);
    if (productSort === 'recommended') {
      filtered.sort((left, right) => hasPhoto(right) - hasPhoto(left));
    } else if (productSort === 'newest') {
      filtered.sort((left, right) => (Date.parse(right.product.created_at || '') || 0) - (Date.parse(left.product.created_at || '') || 0));
    } else if (productSort === 'price') {
      filtered.sort((left, right) => getActiveProductPrice(left.product, now) - getActiveProductPrice(right.product, now));
    }

    return filtered;
  }, [now, products, productSort, selectedCategory, selectedNeighborhood]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  // Les boutiques avec un visuel (bannière ou photo produit) passent devant ; 8 au plus.
  const featuredShops = useMemo(
    () => [...safeShops].sort((left, right) => Number(hasShopVisual(right)) - Number(hasShopVisual(left))).slice(0, 8),
    [safeShops],
  );
  const categoryTiles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const shop of safeShops) counts.set(shop.category || 'other', (counts.get(shop.category || 'other') || 0) + 1);
    return [...counts.entries()]
      .filter(([category]) => category !== 'other')
      .sort((left, right) => right[1] - left[1])
      .map(([category, count]) => {
        const defaults = getCategoryDefaults(category);
        return { category, count, color: defaults.primaryColor, background: defaults.secondaryColor };
      });
  }, [safeShops]);

  useEffect(() => {
    if (query || searchFocused || products.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedPlaceholder('Plat, produit, quartier…');
      return undefined;
    }
    const terms = products.slice(0, 5).map(({ product }) => product.title).filter(Boolean);
    let termIndex = 0;
    let characterIndex = 0;
    let deleting = false;
    const timer = window.setInterval(() => {
      const term = terms[termIndex] || 'Plat, produit, quartier…';
      if (!deleting) {
        characterIndex += 1;
        setTypedPlaceholder(term.slice(0, characterIndex));
        if (characterIndex >= term.length) deleting = true;
      } else {
        characterIndex -= 1;
        setTypedPlaceholder(term.slice(0, characterIndex));
        if (characterIndex <= 0) {
          deleting = false;
          termIndex = (termIndex + 1) % terms.length;
        }
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [products, query, searchFocused]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    onOpenDirectory(query.trim() || undefined);
  };

  return (
    <main className="overflow-hidden bg-[var(--mt-gray-50)] text-[var(--mt-gray-900)]">
      <section className="relative overflow-hidden border-y border-[var(--mt-gray-200)] bg-[var(--mt-gray-50)]">
        <div className="relative mx-auto grid max-w-[1440px] gap-6 px-4 pb-8 pt-8 sm:gap-8 sm:px-10 sm:pb-20 sm:pt-20 lg:min-h-[680px] lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-4 lg:px-16">
          <div className="relative z-10 min-w-0 max-w-2xl">
            <h1 className="font-display text-[clamp(2rem,9.2vw,2.75rem)] font-extrabold leading-[.98] tracking-[-.035em] text-[var(--mt-green-deep)] sm:text-[clamp(2.9rem,6.2vw,5.25rem)]">
              <span className="sr-only">Le commerce local, tout près de chez vous.</span>
              <span aria-hidden="true">
                {['Le', 'commerce'].map((word, index) => <React.Fragment key={word}><span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: `${0.15 + index * 0.07}s` }}>{word}</span></span>{index === 0 ? ' ' : null}</React.Fragment>)}<br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.29s' }}>local,</span></span>{' '}
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.36s' }}>tout près</span></span><br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.43s' }}>de chez vous.</span></span>
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
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={typedPlaceholder}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base outline-none placeholder:text-[var(--mt-gray-600)]"
              />
              <button type="submit" aria-label="Chercher" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-3 text-sm font-extrabold text-white transition hover:bg-[var(--mt-green-primary)] sm:px-5">
                <span className="hidden sm:inline">Chercher</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
              {neighbourhoods.slice(0, 2).map((place) => <Link key={place.path} to={place.path} className="inline-flex min-h-11 items-center rounded-full border border-[var(--mt-green-soft)] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)] hover:border-[var(--mt-green-primary)]">{place.label}</Link>)}
              {['Restauration', 'Beauté', 'Mode'].map((term) => <button key={term} type="button" onClick={() => onOpenDirectory(term)} className="inline-flex min-h-11 items-center rounded-full border border-[var(--mt-gray-200)] bg-white px-4 text-sm font-bold text-[var(--mt-gray-600)] hover:border-[var(--mt-orange-deep)]">{term}</button>)}
            </div>
          </div>

          {wallProducts.length >= 4 && <ProductWall products={wallProducts} />}
        </div>
      </section>

      {/* Les boutiques d’abord : chacune avec sa bannière ou, à défaut, ses propres photos. */}
      {featuredShops.length > 0 && (
        <section aria-labelledby="home-shops-title" className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-10 sm:pt-16">
          <div className="flex items-end justify-between gap-3">
            <h2 id="home-shops-title" className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">Boutiques à découvrir</h2>
            <Link to="/boutiques" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-extrabold text-[#15513e]">Tout voir <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="mt-4 -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 mt-chip-rail sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {featuredShops.map((shop) => (
              <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="group w-[72%] shrink-0 snap-start overflow-hidden rounded-3xl border border-[#e7e2d9] bg-white shadow-[0_8px_24px_rgba(16,62,50,.07)] sm:w-auto">
                <span className="relative block aspect-[4/3]">
                  <ShopCover shop={shop} className="absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03]" sizes="(max-width: 640px) 72vw, 33vw" />
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

      {/* Les univers disponibles, et une invitation pour ceux qui manquent encore. */}
      {categoryTiles.length > 0 && (
        <section aria-labelledby="home-categories-title" className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-10 sm:pt-14">
          <h2 id="home-categories-title" className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">Par catégorie</h2>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {categoryTiles.map(({ category, count, color, background }) => (
              <button key={category} type="button" onClick={() => onOpenDirectory(categoryLabel(category))} className="flex min-h-[84px] items-center gap-3 rounded-2xl border border-[#e7e2d9] bg-white p-3 text-left transition hover:border-[#b9d5ca]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: background, color }}><CategoryIcon category={category} className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-extrabold leading-tight text-[#173c32]">{categoryLabel(category)}</span>
                  <span className="block text-xs text-[#68716b]">{count} boutique{count > 1 ? 's' : ''}</span>
                </span>
              </button>
            ))}
            <Link to="/commercants" className="col-span-2 flex min-h-[84px] items-center gap-3 rounded-2xl border border-dashed border-[#cbd9d0] bg-[#f4f8f5] p-3 sm:col-span-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[var(--mt-green-deep)]"><Store className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-[#173c32]">Votre activité n’y est pas encore ?</span>
                <span className="block text-xs text-[#68716b]">Ouvrez votre boutique sur MaTable, c’est gratuit pour commencer.</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--mt-green-deep)]" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-10 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-[-.06em] sm:text-6xl">À découvrir <em className="not-italic text-[var(--mt-orange-deep)]">près de vous</em></h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#68716b] sm:mt-4 sm:text-lg sm:leading-7">Des produits et des plats proposés par les boutiques de votre quartier, avec leurs prix.</p>
          </div>
          <Link to="/boutiques" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[#15513e] sm:text-lg">Explorer les boutiques <ArrowRight className="h-5 w-5" /></Link>
        </div>
        <div className="mt-5 space-y-3 sm:mt-8 sm:space-y-4">
          <div className="mt-chip-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filtrer les produits par catégorie">
            <button type="button" aria-pressed={selectedCategory === 'all'} onClick={() => { setSelectedCategory('all'); setVisibleProductCount(8); }} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${selectedCategory === 'all' ? 'bg-[#103e32] text-white' : 'border border-[#e7e2d9] bg-white text-[#47534b] hover:border-[#b9d5ca]'}`}>Tout</button>
            {categories.map((category) => (
              <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => { setSelectedCategory(category); setVisibleProductCount(8); }} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${selectedCategory === category ? 'bg-[#103e32] text-white' : 'border border-[#e7e2d9] bg-white text-[#47534b] hover:border-[#b9d5ca]'}`}>{categoryLabel(category)}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-between">
            <label className="mt-filter-field sm:max-w-[260px]">
              <span className="mt-filter-field-label"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#15513e]" aria-hidden="true" />Quartier</span>
              <select value={selectedNeighborhood} onChange={(event) => { setSelectedNeighborhood(event.target.value); setVisibleProductCount(8); }} aria-label="Filtrer les produits par quartier" className="mt-filter-field-select">
                <option value="all">Partout</option>
                {visibleNeighborhoods.map((neighborhood) => <option key={neighborhood} value={neighborhood}>{neighborhood}</option>)}
              </select>
            </label>
            <label className="mt-filter-field sm:max-w-[250px]">
              <span className="mt-filter-field-label"><Sparkles className="h-3.5 w-3.5 shrink-0 text-[#c2410c]" aria-hidden="true" />Trier par</span>
              <select value={productSort} onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === 'recommended' || value === 'newest' || value === 'price') setProductSort(value);
                setVisibleProductCount(8);
              }} aria-label="Trier les produits" className="mt-filter-field-select">
                <option value="recommended">Recommandés</option>
                <option value="newest">Nouveautés</option>
                <option value="price">Prix croissant</option>
              </select>
            </label>
          </div>
        </div>
        {filteredProducts.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-[#d6d0c6] bg-white p-6 text-center">
            <p className="text-sm font-semibold text-[#68716b]">Aucun produit dans cette sélection. Essayez un autre quartier ou une autre catégorie.</p>
            <button type="button" onClick={() => { setSelectedCategory('all'); setSelectedNeighborhood('all'); }} className="mt-3 min-h-10 rounded-full bg-[#103e32] px-4 text-sm font-bold text-white">Effacer les filtres</button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs font-semibold text-[#68716b]" aria-live="polite">{filteredProducts.length} produit{filteredProducts.length === 1 ? '' : 's'} à découvrir</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4" aria-live="polite">
              <AnimatePresence initial={false} mode="popLayout">
                {visibleProducts.map(({ shop, product }, index) => {
                  const activePrice = getActiveProductPrice(product, now);
                  const isPromotion = getProductSaleStatus(product, now) === 'active';
                  const isNew = product.created_at
                    ? now - Date.parse(product.created_at) >= 0
                      && now - Date.parse(product.created_at) < 21 * 24 * 60 * 60 * 1000
                    : false;
                  const city = shop.city ? getDiscoveryCityLabel(shop.city) : '';
                  return (
                    <m.div
                      key={`${shop.slug}-${product.id}`}
                      layout={!prefersReducedMotion}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                      className="h-full min-w-0"
                    >
                      <MotionReveal delay={Math.min(index, 8) * 0.035} className="h-full min-w-0">
                        <Link to={`/${encodeURIComponent(shop.slug)}#product-${product.id}`} className="group block h-full min-w-0 overflow-hidden rounded-2xl border border-[#e7e2d9] bg-white shadow-[0_8px_24px_rgba(16,62,50,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(16,62,50,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15513e] focus-visible:ring-offset-2 sm:rounded-[24px]">
                          <span className={`relative block overflow-hidden bg-[#f2eee8] ${normalizeProductImage(product.thumbnail_url || product.image_url) ? 'aspect-square' : 'aspect-[5/3]'}`}>
                            <CategoryProductImage imageUrl={product.thumbnail_url || product.image_url} category={shop.category} title={product.title} sizes="480px" className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
                            <span className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 sm:left-3 sm:top-3">
                              {isPromotion && <span className="inline-flex items-center gap-1 rounded-full bg-[#c2410c] px-2 py-1 text-[11px] font-extrabold text-white sm:px-2.5 sm:text-[11px]"><BadgePercent className="h-3 w-3" aria-hidden="true" />Promo</span>}
                              {isNew && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-extrabold text-[#15513e] shadow-sm sm:px-2.5 sm:text-[11px]"><Sparkles className="h-3 w-3" aria-hidden="true" />Nouveau</span>}
                            </span>
                            {product.in_stock && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold text-[#15513e] sm:bottom-3 sm:left-3 sm:text-[11px]"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Disponible</span>}
                          </span>
                          <span className="block min-w-0 p-2.5 sm:p-4">
                            <strong className="line-clamp-2 text-sm font-extrabold text-[#173c32] sm:text-base">{product.title}</strong>
                            <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-[#68716b] sm:text-sm">
                              <MapPin className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                              <span className="truncate">{shop.name}{city ? ` · ${city}` : ''}</span>
                            </span>
                            <span className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span className={`truncate text-sm font-black sm:text-base ${isPromotion ? 'text-[#c2410c]' : 'text-[#173c32]'}`}>{formatFCFA(activePrice)}</span>
                              {isPromotion && <del className="truncate text-[11px] font-semibold text-[#68716b] sm:text-xs">{formatFCFA(product.price)}</del>}
                            </span>
                          </span>
                        </Link>
                      </MotionReveal>
                    </m.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {visibleProductCount < filteredProducts.length && (
              <button type="button" onClick={() => setVisibleProductCount((count) => count + 8)} className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-full border border-[#cbd9d0] bg-white px-5 text-sm font-extrabold text-[#15513e] transition hover:bg-[#eff6f1]">
                Voir plus de produits <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </section>

      <section className="bg-[var(--mt-green-primary)] px-5 py-10 text-white sm:px-10 sm:py-14">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="max-w-4xl font-display text-3xl font-extrabold tracking-[-.06em] sm:text-5xl">Vous vendez ? <em className="not-italic text-[var(--mt-orange-soft)]">Ouvrez votre vitrine.</em></h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">Vos produits en photo, vos prix, vos horaires, et les commandes qui arrivent directement sur votre WhatsApp.</p>
          <Link to="/commercants" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 font-extrabold text-[var(--mt-green-deep)] transition hover:bg-[var(--mt-gray-50)]">Ajouter ma boutique <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
};
