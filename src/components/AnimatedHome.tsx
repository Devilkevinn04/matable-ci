import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProductImageForDisplay } from '../utils/categoryDefaults';
import { formatFCFA } from '../utils/format';
import { getResponsiveImageProps } from '../utils/responsiveImages';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';

interface AnimatedHomeShop {
  slug: string;
  name: string;
  category?: string;
  city?: string;
  is_verified?: boolean;
  products_preview?: { title: string; description?: string | null; image_url: string; thumbnail_url?: string; price: number }[];
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
              {[...column, ...column].map(({ shop, product }, index) => (
                <div key={`${shop.slug}-${product.title}-${index}`} className="shrink-0 rounded-[22px] border border-[var(--mt-gray-200)] bg-white p-2 shadow-[0_18px_38px_rgb(33_38_34_/_18%)] sm:rounded-[22px]">
                  <span className="block aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--mt-gray-50)]">
                    <img {...getResponsiveImageProps(getProductImageForDisplay(product.thumbnail_url || product.image_url, shop.category), 420)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </span>
                  <span className="block truncate px-1 pt-2 text-[15px] font-bold text-[var(--mt-gray-900)]">{product.title}</span>
                  <span className="block truncate px-1 text-xs text-[var(--mt-gray-600)]">{shop.name}</span>
                  <span className="mt-1 inline-flex rounded-full bg-[#fff7ed] px-2 py-1 text-xs font-extrabold text-[var(--mt-orange-deep)]">{formatFCFA(product.price)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute right-2 top-10 flex items-center gap-3 rounded-2xl border border-[var(--mt-gray-200)] bg-white px-4 py-3 shadow-[0_18px_38px_rgb(33_38_34_/_16%)] sm:right-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--mt-green-soft)] text-[var(--mt-green-primary)]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
        <span><strong className="block text-sm">Vérifié</strong><span className="text-xs text-[var(--mt-gray-600)]">Identité contrôlée</span></span>
      </div>
    </div>
  );
};

export const AnimatedHome: React.FC<AnimatedHomeProps> = ({ shops, categories, neighbourhoods, onOpenDirectory }) => {
  const safeShops = useMemo(
    () => shops
      .filter((shop) => !/\b(?:puff|vape|tabac)\b/i.test(shop.name))
      .map((shop) => ({
        ...shop,
        products_preview: (shop.products_preview || []).filter((product) => !isAgeRestrictedProduct({ title: product.title, description: product.description || null })),
      })),
    [shops],
  );
  const verifiedShopCount = safeShops.filter((shop) => shop.is_verified).length;
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [typedPlaceholder, setTypedPlaceholder] = useState('Plat, produit, quartier…');
  const products = useMemo(
    () => safeShops.flatMap((shop) => (shop.products_preview || []).slice(0, 2).map((product) => ({ shop, product }))).slice(0, 12),
    [safeShops],
  );
  const featuredShops = safeShops.filter((shop) => shop.products_preview?.length).slice(0, 6);
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
            {verifiedShopCount > 0 && <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--mt-green-soft)] bg-white px-4 py-2 text-sm font-bold text-[var(--mt-green-deep)] shadow-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--mt-green-primary)]" />
              {verifiedShopCount} boutiques vérifiées à Abidjan
            </p>}
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

      <section className="mx-auto max-w-[1280px] px-5 py-16 sm:px-10 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="font-display text-4xl font-extrabold tracking-[-.06em] sm:text-6xl">Les boutiques <em className="not-italic text-[var(--mt-orange-deep)]">à la une</em></h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#68716b] sm:text-lg">Chaque vitrine est tenue par le commerçant lui-même, avec ses plats, ses produits et ses prix du jour.</p>
          </div>
          <Link to="/boutiques" className="inline-flex items-center gap-2 text-lg font-extrabold text-[#15513e]">Toutes les boutiques <ArrowRight className="h-5 w-5" /></Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featuredShops.map((shop) => {
            const product = shop.products_preview?.[0];
            return <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="group overflow-hidden rounded-[28px] bg-[#103e32] text-white shadow-[0_18px_40px_rgba(16,62,50,.14)]">
              <div className="relative aspect-[1.2] overflow-hidden">
                {product && <img {...getResponsiveImageProps(getProductImageForDisplay(product.thumbnail_url || product.image_url, shop.category), 720)} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" />}
                <span className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#c2410c]">{categoryLabel(shop.category)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 p-5">
                <span><strong className="block text-lg">{shop.name}</strong><span className="mt-1 flex items-center gap-1 text-sm text-white/70"><MapPin className="h-3.5 w-3.5" />{shop.city || 'Côte d’Ivoire'}</span></span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>;
          })}
        </div>
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
