import React, { useMemo, useState } from 'react';
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
  const products = useMemo(
    () => safeShops.flatMap((shop) => (shop.products_preview || []).slice(0, 2).map((product) => ({ shop, product }))).slice(0, 12),
    [safeShops],
  );
  const featuredShops = safeShops.filter((shop) => shop.products_preview?.length).slice(0, 6);
  const marqueeCities = neighbourhoods.length > 0 ? neighbourhoods : [{ label: 'Abidjan', path: '/boutiques?q=Abidjan' }];
  const marqueeCategories = categories.length > 0 ? categories.map(categoryLabel) : ['Restauration', 'Mode', 'Beauté', 'Maison'];

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
              Le commerce
              <br />
              local, <span className="text-[var(--mt-orange-deep)]">tout près</span>
              <br />
              <span className="text-[var(--mt-orange-deep)]">de chez vous.</span>
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
                placeholder="Plat, produit, quartier…"
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

          <div className="relative min-h-[420px] sm:min-h-[520px] lg:min-h-[620px]" aria-label="Produits de boutiques locales">
            <div className="absolute inset-8 rounded-[40%] bg-[var(--mt-orange-bright)] opacity-90 blur-[1px] sm:inset-16" />
            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(#d7d2c8_1px,transparent_1px)] [background-size:22px_22px]" />
            {products.length > 0 ? products.map(({ shop, product }, index) => (
              <Link
                key={`${shop.slug}-${product.title}-${index}`}
                to={`/${encodeURIComponent(shop.slug)}`}
                className="home-product-card absolute flex w-[170px] flex-col overflow-hidden rounded-[22px] border border-[#e4e0d8] bg-white shadow-[0_18px_38px_rgba(33,38,34,.18)] transition hover:z-20 hover:scale-105 sm:w-[210px]"
                style={{
                  left: `${8 + ((index * 29) % 70)}%`,
                  top: `${8 + ((index * 23) % 66)}%`,
                  transform: `rotate(${index % 2 ? 5 : -5}deg)`,
                  animationDelay: `${index * -0.45}s`,
                }}
              >
                <span className="block aspect-[1.25] overflow-hidden bg-[#edf1ed]">
                  <img {...getResponsiveImageProps(getProductImageForDisplay(product.thumbnail_url || product.image_url, shop.category), 420)} alt="" className="h-full w-full object-cover" loading={index < 3 ? 'eager' : 'lazy'} />
                </span>
                <span className="p-3">
                  <span className="block truncate text-sm font-extrabold">{product.title}</span>
                  <span className="mt-1 block truncate text-xs text-[#68716b]">{shop.name}</span>
                  <span className="mt-2 inline-flex rounded-full bg-[#fff1e1] px-2.5 py-1 text-xs font-extrabold text-[#c2410c]">{formatFCFA(product.price)}</span>
                </span>
              </Link>
            )) : <div className="absolute inset-20 rounded-[32px] bg-white/70" />}
            <div className="absolute right-2 top-10 flex items-center gap-3 rounded-2xl border border-[#e4e0d8] bg-white px-4 py-3 shadow-[0_18px_38px_rgba(33,38,34,.16)] sm:right-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d1fae5] text-[#087f62]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
              <span><strong className="block text-sm">Vérifié</strong><span className="text-xs text-[#68716b]">Identité contrôlée</span></span>
            </div>
          </div>
        </div>
      </section>

      <div className="overflow-hidden border-b border-[var(--mt-gray-200)] bg-[var(--mt-orange-bright)] py-3 text-2xl font-extrabold text-[var(--mt-green-deep)] sm:text-4xl">
        <div className="home-marquee flex w-max gap-10 whitespace-nowrap">{[...marqueeCities, ...marqueeCities].map((place, index) => <React.Fragment key={`${place.path}-${index}`}><span>{place.label}</span><span aria-hidden="true">✳</span></React.Fragment>)}</div>
      </div>
      <div className="overflow-hidden bg-[var(--mt-green-deep)] py-3 text-xl font-extrabold text-[var(--mt-orange-soft)] sm:text-3xl">
        <div className="home-marquee-reverse flex w-max gap-8 whitespace-nowrap">{[...marqueeCategories, ...marqueeCategories].map((label, index) => <React.Fragment key={`${label}-${index}`}><span>{label}</span><span aria-hidden="true">·</span></React.Fragment>)}</div>
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
