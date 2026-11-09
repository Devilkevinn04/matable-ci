import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgePercent, CheckCircle2, MapPin, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProductImageForDisplay } from '../utils/categoryDefaults';
import { formatFCFA } from '../utils/format';
import { getActiveProductPrice, getProductSaleStatus } from '../utils/productPricing';
import { getResponsiveImageProps } from '../utils/responsiveImages';
import { handlePublicImageError } from '../utils/imageFallback';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';
import { isShopExcludedFromPublicIndex } from '../utils/shopIndexing';
import { getProductImageAlt } from '../utils/productImageAlt';
import { getDiscoveryCityLabel } from '../utils/discoverySeo';
import { MotionReveal } from './MotionSystem';

interface AnimatedHomeShop {
  slug: string;
  name: string;
  category?: string;
  city?: string;
  is_verified?: boolean;
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
  onOpenDirectory: (query?: string) => void;
}

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
const repeatToFill = <T,>(items: T[], minItems = 12) => {
  if (items.length === 0) return [];
  return Array.from({ length: Math.max(minItems, items.length) }, (_, index) => items[index % items.length]);
};

interface ProductWallProps {
  products: { shop: AnimatedHomeShop; product: NonNullable<AnimatedHomeShop['products_preview']>[number] }[];
}

const ProductWall: React.FC<ProductWallProps> = ({ products }) => {
  const columns = [products.filter((_, index) => index % 3 === 0), products.filter((_, index) => index % 3 === 1), products.filter((_, index) => index % 3 === 2)];
  return (
    <div className="mt-wall relative mx-auto h-[470px] w-full max-w-[680px] rotate-[-6deg] scale-[1.02] sm:h-[640px] sm:rotate-[-7deg] sm:scale-105" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--mt-orange-bright)] sm:h-[460px] sm:w-[460px]" />
      <div className="absolute left-1/2 top-1/2 h-[370px] w-[370px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--mt-orange-deep)]/30 sm:h-[560px] sm:w-[560px]" />
      <div className="absolute inset-0 grid grid-cols-2 gap-3 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)] sm:grid-cols-3 sm:gap-[18px]">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className={`${columnIndex === 2 ? 'hidden sm:block' : ''} overflow-hidden`}>
            <div className={`mt-wall-track flex flex-col gap-3 sm:gap-[18px] ${columnIndex === 1 ? 'mt-wall-track-reverse' : ''}`} style={{ animationDuration: `${[40, 52, 46][columnIndex]}s` }}>
              {[...column, ...column].map(({ shop, product }, index) => {
                const isPromotion = getProductSaleStatus(product) === 'active';
                return (
                  <div key={`${shop.slug}-${product.title}-${index}`} className="shrink-0 rounded-[22px] border border-[var(--mt-gray-200)] bg-white p-2 shadow-[0_18px_38px_rgb(33_38_34_/_18%)] sm:rounded-[22px]">
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--mt-gray-50)]">
                      <img {...getResponsiveImageProps(getProductImageForDisplay(product.thumbnail_url || product.image_url, shop.category), 420)} alt={getProductImageAlt(product.title, shop.name, shop.city)} className="h-full w-full object-cover" loading="lazy" onError={handlePublicImageError} />
                      {isPromotion && <span className="absolute left-2 top-2 rounded-full bg-[#c2410c] px-2 py-1 text-[10px] font-extrabold text-white">Promo</span>}
                      {shop.is_verified && <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-extrabold text-[var(--mt-green-deep)]">Vérifié</span>}
                    </span>
                    <span className="block truncate px-1 pt-2 text-[15px] font-bold text-[var(--mt-gray-900)]">{product.title}</span>
                    <span className="block truncate px-1 text-xs text-[var(--mt-gray-600)]">{shop.name}</span>
                    <span className="mt-1 inline-flex flex-wrap items-baseline gap-1 rounded-full bg-[#fff7ed] px-2 py-1 text-xs font-extrabold text-[var(--mt-orange-deep)]">
                      {formatFCFA(getActiveProductPrice(product))}
                      {isPromotion && <del className="text-[10px] font-semibold text-[var(--mt-gray-600)]">{formatFCFA(product.price)}</del>}
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

export const AnimatedHome: React.FC<AnimatedHomeProps> = ({ shops, categories, neighbourhoods, onOpenDirectory }) => {
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
  const [visibleProductCount, setVisibleProductCount] = useState(12);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const products = useMemo(
    () => safeShops.flatMap((shop) => (shop.products_preview || []).map((product) => ({ shop, product }))),
    [safeShops],
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

    if (productSort === 'newest') {
      filtered.sort((left, right) => (Date.parse(right.product.created_at || '') || 0) - (Date.parse(left.product.created_at || '') || 0));
    } else if (productSort === 'price') {
      filtered.sort((left, right) => getActiveProductPrice(left.product, now) - getActiveProductPrice(right.product, now));
    }

    return filtered;
  }, [now, products, productSort, selectedCategory, selectedNeighborhood]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const marqueeCities = repeatToFill(neighbourhoods.length > 0 ? neighbourhoods : [{ label: 'Abidjan', path: '/boutiques?q=Abidjan' }]);
  const marqueeCategories = repeatToFill((categories.length > 0 ? categories.map(categoryLabel) : ['Restauration', 'Mode', 'Beauté', 'Maison']).filter((label) => label !== 'Autres'));

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
        <div className="relative mx-auto grid max-w-[1440px] gap-8 px-5 pb-12 pt-12 sm:px-10 sm:pb-20 sm:pt-20 lg:min-h-[680px] lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-4 lg:px-16">
          <div className="relative z-10 min-w-0 max-w-2xl">
            <h1 className="font-display text-[clamp(2.9rem,6.2vw,5.25rem)] font-extrabold leading-[.98] tracking-[-.035em] text-[var(--mt-green-deep)]">
              <span className="sr-only">Le commerce local, tout près de chez vous.</span>
              <span aria-hidden="true">
                {['Le', 'commerce'].map((word, index) => <React.Fragment key={word}><span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: `${0.15 + index * 0.07}s` }}>{word}</span></span>{index === 0 ? ' ' : null}</React.Fragment>)}<br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.29s' }}>local,</span></span>{' '}
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.36s' }}>tout près</span></span><br />
                <span className="inline-block overflow-hidden align-bottom pb-[.1em] text-[var(--mt-orange-deep)]"><span className="inline-block animate-[mt-rise_.9s_var(--mt-motion-ease)_both]" style={{ animationDelay: '0.43s' }}>de chez vous.</span></span>
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[var(--mt-gray-600)] sm:text-xl sm:leading-8">
              Les vraies photos et les vrais prix des boutiques de votre quartier. Vous choisissez, le commerçant vous répond sur WhatsApp.
            </p>
            <form onSubmit={submitSearch} role="search" className="mt-7 flex w-full max-w-xl min-w-0 items-center gap-1 overflow-hidden rounded-full border-2 border-[var(--mt-green-deep)] bg-white p-2 shadow-[0_12px_30px_rgba(16,62,50,.12)] sm:gap-2">
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
            <div className="mt-5 flex flex-wrap gap-2">
              {neighbourhoods.slice(0, 2).map((place) => <Link key={place.path} to={place.path} className="inline-flex min-h-11 items-center rounded-full border border-[var(--mt-green-soft)] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)] hover:border-[var(--mt-green-primary)]">{place.label}</Link>)}
              {['Restauration', 'Beauté', 'Mode'].map((term) => <button key={term} type="button" onClick={() => onOpenDirectory(term)} className="inline-flex min-h-11 items-center rounded-full border border-[var(--mt-gray-200)] bg-white px-4 text-sm font-bold text-[var(--mt-gray-600)] hover:border-[var(--mt-orange-deep)]">{term}</button>)}
            </div>
          </div>

          <ProductWall products={products} />
        </div>
      </section>

      <div className="overflow-hidden border-b border-[var(--mt-gray-200)] bg-[var(--mt-orange-bright)] py-3 text-2xl font-extrabold text-[var(--mt-green-deep)] sm:text-4xl">
        <div className="home-marquee mt-loop flex w-max gap-10 whitespace-nowrap">{[...marqueeCities, ...marqueeCities].map((place, index) => <React.Fragment key={`${place.path}-${index}`}><span>{place.label}</span><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0"><path d="m12 2 1.8 6.2L20 6.5l-4.1 4.7L22 14l-6.2 1.8 1.7 6.2-4.7-4.1L8 22l-1.8-6.2L0 17.5l4.1-4.7L2 8l6.2-1.8L6.5 0l4.7 4.1L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></React.Fragment>)}</div>
      </div>
      <div className="overflow-hidden bg-[var(--mt-green-deep)] py-3 text-xl font-extrabold text-[var(--mt-orange-soft)] sm:text-3xl">
        <div className="home-marquee-reverse mt-loop flex w-max gap-8 whitespace-nowrap">{[...marqueeCategories, ...marqueeCategories].map((label, index) => <React.Fragment key={`${label}-${index}`}><span>{label}</span><span aria-hidden="true">·</span></React.Fragment>)}</div>
      </div>

      <section className="mx-auto max-w-[1280px] px-4 py-10 sm:px-10 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="font-display text-3xl font-extrabold tracking-[-.06em] sm:text-6xl">À découvrir <em className="not-italic text-[var(--mt-orange-deep)]">près de vous</em></h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#68716b] sm:mt-4 sm:text-lg sm:leading-7">Des produits et des plats proposés par les boutiques de votre quartier, avec leurs prix.</p>
          </div>
          <Link to="/boutiques" className="inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[#15513e] sm:text-lg">Explorer les boutiques <ArrowRight className="h-5 w-5" /></Link>
        </div>
        <div className="mt-5 space-y-3 sm:mt-8 sm:space-y-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label="Filtrer les produits par catégorie">
            <button type="button" aria-pressed={selectedCategory === 'all'} onClick={() => { setSelectedCategory('all'); setVisibleProductCount(12); }} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${selectedCategory === 'all' ? 'bg-[#103e32] text-white' : 'border border-[#e7e2d9] bg-white text-[#47534b] hover:border-[#b9d5ca]'}`}>Tout</button>
            {categories.map((category) => (
              <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => { setSelectedCategory(category); setVisibleProductCount(12); }} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-bold transition ${selectedCategory === category ? 'bg-[#103e32] text-white' : 'border border-[#e7e2d9] bg-white text-[#47534b] hover:border-[#b9d5ca]'}`}>{categoryLabel(category)}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-between">
            <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#e7e2d9] bg-white px-3 text-xs font-semibold text-[#47534b] sm:max-w-[260px] sm:text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-[#15513e]" aria-hidden="true" />
              <span className="shrink-0">Ville / quartier</span>
              <select value={selectedNeighborhood} onChange={(event) => { setSelectedNeighborhood(event.target.value); setVisibleProductCount(12); }} aria-label="Filtrer les produits par quartier" className="min-w-0 flex-1 truncate bg-transparent py-2 outline-none">
                <option value="all">Tous</option>
                {visibleNeighborhoods.map((neighborhood) => <option key={neighborhood} value={neighborhood}>{neighborhood}</option>)}
              </select>
            </label>
            <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#e7e2d9] bg-white px-3 text-xs font-semibold text-[#47534b] sm:max-w-[250px] sm:text-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
              <span className="shrink-0">Trier</span>
              <select value={productSort} onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === 'recommended' || value === 'newest' || value === 'price') setProductSort(value);
                setVisibleProductCount(12);
              }} aria-label="Trier les produits" className="min-w-0 flex-1 bg-transparent py-2 outline-none">
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
              {visibleProducts.map(({ shop, product }, index) => {
                const activePrice = getActiveProductPrice(product, now);
                const isPromotion = getProductSaleStatus(product, now) === 'active';
                const isNew = product.created_at
                  ? now - Date.parse(product.created_at) >= 0
                    && now - Date.parse(product.created_at) < 21 * 24 * 60 * 60 * 1000
                  : false;
                const city = shop.city ? getDiscoveryCityLabel(shop.city) : '';
                return (
                  <MotionReveal key={`${shop.slug}-${product.id}`} delay={Math.min(index, 8) * 0.035} className="h-full min-w-0">
                    <Link to={`/${encodeURIComponent(shop.slug)}#product-${product.id}`} className="group block h-full min-w-0 overflow-hidden rounded-2xl border border-[#e7e2d9] bg-white shadow-[0_8px_24px_rgba(16,62,50,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(16,62,50,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15513e] focus-visible:ring-offset-2 sm:rounded-[24px]">
                      <span className="relative block aspect-square overflow-hidden bg-[#f2eee8]">
                        <img {...getResponsiveImageProps(getProductImageForDisplay(product.thumbnail_url || product.image_url, shop.category), 480)} alt={getProductImageAlt(product.title, shop.name, shop.city)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onError={handlePublicImageError} />
                        <span className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 sm:left-3 sm:top-3">
                          {isPromotion && <span className="inline-flex items-center gap-1 rounded-full bg-[#c2410c] px-2 py-1 text-[9px] font-extrabold text-white sm:px-2.5 sm:text-[10px]"><BadgePercent className="h-3 w-3" aria-hidden="true" />Promo</span>}
                          {isNew && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[9px] font-extrabold text-[#15513e] shadow-sm sm:px-2.5 sm:text-[10px]"><Sparkles className="h-3 w-3" aria-hidden="true" />Nouveau</span>}
                        </span>
                        {product.in_stock && <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[9px] font-bold text-[#15513e] sm:bottom-3 sm:left-3 sm:text-[10px]"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Disponible</span>}
                      </span>
                      <span className="block min-w-0 p-2.5 sm:p-4">
                        <strong className="block truncate text-sm font-extrabold text-[#173c32] sm:text-base">{product.title}</strong>
                        <span className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-[#68716b] sm:text-sm">
                          <MapPin className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                          <span className="truncate">{shop.name}{city ? ` · ${city}` : ''}</span>
                        </span>
                        <span className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2">
                          <span className={`truncate text-sm font-black sm:text-base ${isPromotion ? 'text-[#c2410c]' : 'text-[#173c32]'}`}>{formatFCFA(activePrice)}</span>
                          {isPromotion && <del className="truncate text-[10px] font-semibold text-[#68716b] sm:text-xs">{formatFCFA(product.price)}</del>}
                        </span>
                      </span>
                    </Link>
                  </MotionReveal>
                );
              })}
            </div>
            {visibleProductCount < filteredProducts.length && (
              <button type="button" onClick={() => setVisibleProductCount((count) => count + 12)} className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-full border border-[#cbd9d0] bg-white px-5 text-sm font-extrabold text-[#15513e] transition hover:bg-[#eff6f1]">
                Voir plus de produits <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </section>

      <section className="bg-[var(--mt-green-primary)] px-5 py-16 text-white sm:px-10 sm:py-24">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="max-w-4xl font-display text-4xl font-extrabold tracking-[-.06em] text-white sm:text-6xl">Vous vendez ? <em className="not-italic text-[var(--mt-orange-soft)]">Ouvrez votre vitrine.</em></h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">Vos produits en photo, vos prix, vos horaires, et les commandes qui arrivent directement sur votre WhatsApp.</p>
          <Link to="/commercants" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-extrabold text-[var(--mt-green-deep)] hover:bg-[var(--mt-gray-50)]">Ajouter ma boutique <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
};
