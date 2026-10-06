import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, MapPin, RotateCcw, Search, Store, X } from 'lucide-react';
import { getCategoryDefaults, getProductImageForDisplay, isShopCategory, normalizeCustomBannerImage, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { shopMatchesDirectorySearch } from '../utils/directorySearch';
import { getPublicDiscoveryPages, toDiscoveryCitySlug, type DiscoveryPage } from '../utils/discoverySeo';
import { FeaturedCarousel, isShopPromotion } from './FeaturedCarousel';
import { ProductNewsFeed } from './ProductNewsFeed';

interface DirectoryShop {
  id?: number;
  slug: string;
  name: string;
  category?: string;
  city?: string;
  is_open?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
  is_active?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  opening_hours?: { enabled?: boolean; open_time?: string; close_time?: string; days?: number[] };
  theme_config?: { custom_banner_url?: string; primary_color?: string; logo_url?: string; event_mode_enabled?: boolean; event_banner_text?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

interface PublicDirectoryProps {
  shops: DirectoryShop[];
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onOpenShop: (slug: string) => void;
  onOpenDirectory: (query?: string) => void;
  onCreateShop: () => void;
  discoveryPage?: DiscoveryPage;
  isShopDirectoryPage?: boolean;
}

const categoryTileColors: Record<string, string> = {
  fashion: '#e4f1ec',
  food: '#fbe3d6',
  beauty: '#f3e3ea',
  electronics: '#e4e9ee',
  home: '#e9e4da',
  services: '#e2eee6',
  health: '#e0efec',
  crafts: '#f3e6c9',
  education: '#e6e9f3',
  automotive: '#e8e6e1',
  other: '#eee9df',
};

export const PublicDirectory: React.FC<PublicDirectoryProps> = ({ shops, isLoading, loadError, onRetry, onOpenShop, onOpenDirectory, onCreateShop, discoveryPage, isShopDirectoryPage = false }) => {
  const [query, setQuery] = useState(() => isShopDirectoryPage ? new URLSearchParams(window.location.search).get('q') || '' : '');
  const [category, setCategory] = useState(discoveryPage?.category || 'all');
  const availableCategories = new Set(shops.map((shop) => shop.category).filter(Boolean));
  const categories = SHOP_CATEGORIES.filter((item) => availableCategories.has(item));
  const discoveryPages = getPublicDiscoveryPages(shops);
  const cityPages = discoveryPages.filter((page) => page.city);
  const relatedDiscoveryPages = discoveryPage?.city
    ? discoveryPages.filter((page) => page.category)
    : cityPages;
  const categoryLabel = (value?: string) => {
    if (value === 'food' || value?.toLowerCase().includes('rest')) return 'Restauration';
    if (isShopCategory(value)) return getCategoryDefaults(value).label;
    return value || 'Commerce local';
  };
  const filteredShops = useMemo(() => shops.filter((shop) =>
    shopMatchesDirectorySearch(shop, query, categoryLabel(shop.category))
      && (category === 'all' || shop.category === category)
      && (!discoveryPage?.citySlug || toDiscoveryCitySlug(shop.city || '') === discoveryPage.citySlug)
  ), [shops, query, category, discoveryPage?.citySlug]);
  const popularSearches = ['Mode', 'Restauration', 'Beauté', 'Maison', 'Abidjan'];
  const heroCategories = ['fashion', 'food', 'crafts'] as const;
  const suggestions = <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#4a3a30] sm:text-sm" aria-label="Suggestions de recherche">
    <span className="font-bold">Essayez :</span>
    {popularSearches.map((term) => <button key={term} type="button" onClick={() => setQuery(term)} className="rounded-full border border-[#e0d5c6] bg-white px-3 py-1.5 text-[#4a3a30] transition hover:border-[#176b55] hover:text-[#0f4d3d]">{term}</button>)}
  </div>;
  const searchForm = <form
    onSubmit={(event) => {
      event.preventDefault();
      if (isShopDirectoryPage) document.getElementById('boutiques')?.scrollIntoView({ behavior: 'smooth' });
      else onOpenDirectory(query);
    }}
    className={`mt-4 flex w-full max-w-[610px] items-center gap-1.5 rounded-[16px] border p-1.5 shadow-[0_10px_28px_rgba(0,0,0,.12)] focus-within:ring-2 focus-within:ring-[#f0ba80]/50 sm:mt-6 sm:gap-2 sm:rounded-[18px] sm:p-2 ${isShopDirectoryPage ? 'border-white/20 bg-white text-[#25231f]' : 'border-[#d9cdbd] bg-white focus-within:border-[#176b55] focus-within:ring-[#176b55]/15'}`}
  >
    <Search className="ml-2 h-5 w-5 shrink-0 text-[#82796e]" aria-hidden="true" />
    <input
      aria-label={isShopDirectoryPage ? 'Rechercher une boutique, une ville ou un quartier' : 'Rechercher une boutique, un produit ou un quartier'}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={isShopDirectoryPage ? 'Boutique ou quartier…' : 'Boutique, produit, quartier…'}
      className="min-h-10 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs outline-none placeholder:text-[#898178] sm:min-h-11 sm:px-2 sm:text-base"
    />
    {query && <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
    <button type="submit" className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-xs font-bold text-white transition sm:min-h-11 sm:px-5 sm:text-sm ${isShopDirectoryPage ? 'bg-[#b9441f] hover:bg-[#a53a1d]' : 'bg-[#0f4d3d] hover:bg-[#176b55]'}`}>
      <span className="sm:hidden">Chercher</span>
      <span className="hidden sm:inline">{isShopDirectoryPage ? 'Rechercher' : 'Voir les boutiques'}</span>
    </button>
  </form>;
  const getShopImage = (shop: DirectoryShop) => normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category)
    || (shop.products_preview?.[0]
      ? getProductImageForDisplay(shop.products_preview[0].image_url, shop.category)
      : getCategoryDefaults(shop.category).bannerPlaceholderImageUrl);
  const getShopColor = (shop: DirectoryShop) => shop.theme_color || shop.theme_config?.primary_color || '#176b55';

  return (
    <main className="public-directory min-h-screen bg-[#f7f3ee] text-[#25231f]">
      {discoveryPage ? (
        <section className="mx-auto w-full max-w-[1184px] px-5 pb-7 pt-10 sm:px-8 sm:pb-10 sm:pt-14">
          <nav aria-label="Fil d’Ariane" className="mb-5 text-sm text-[#6f6a61]">
            <a href="/" className="font-semibold text-[#0f4d3d] hover:underline">Accueil</a>
            <span aria-hidden="true" className="px-2">/</span>
            <span>{discoveryPage.city || (discoveryPage.category ? categoryLabel(discoveryPage.category) : 'Boutiques')}</span>
          </nav>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f] sm:text-sm">Commerce local · Côte d’Ivoire</p>
          <h1 className="max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">{discoveryPage.heading}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f5a55] sm:text-lg">{discoveryPage.description.replace(' | MaTable.ci', '')}</p>
          {relatedDiscoveryPages.length > 0 && (
            <nav aria-label={discoveryPage.city ? 'Découvrir par catégorie' : 'Découvrir par ville'} className="mt-6 flex flex-wrap gap-2">
              <span className="self-center pr-1 text-sm font-bold text-[#4a3a30]">{discoveryPage.city ? 'Explorer les catégories :' : 'Explorer par ville :'}</span>
              {relatedDiscoveryPages.map((page) => (
                <a key={page.path} href={page.path} className="rounded-full border border-[#e0d5c6] bg-white px-3 py-1.5 text-sm font-semibold text-[#0f4d3d] transition hover:border-[#176b55]">
                  {page.city || (page.category ? categoryLabel(page.category) : '')}
                </a>
              ))}
            </nav>
          )}
        </section>
      ) : isShopDirectoryPage ? (
        <section className="relative isolate overflow-hidden bg-[#123b31] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-36 -z-10 h-[470px] w-[470px] rounded-full border border-white/10 sm:right-[8%] sm:top-[-250px] sm:h-[700px] sm:w-[700px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 top-20 -z-10 h-64 w-64 rounded-full border border-[#f0ba80]/20 sm:right-[15%] sm:top-8 sm:h-96 sm:w-96" />
          <div className="mx-auto grid w-full max-w-[1280px] gap-9 px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-10 lg:grid-cols-[1fr_340px] lg:items-end lg:gap-16 lg:px-12 lg:pb-16 lg:pt-12">
            <div className="min-w-0">
              <nav aria-label="Fil d’Ariane" className="mb-8 text-sm text-white/65">
                <a href="/" className="font-semibold text-white hover:underline">Accueil</a>
                <span aria-hidden="true" className="px-2">/</span>
                <span>Boutiques</span>
              </nav>
              <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f0ba80] sm:text-sm">
                <span className="h-px w-7 bg-[#f0ba80]" aria-hidden="true" /> Le carnet des bonnes adresses
              </p>
              <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[68px]">
                Les boutiques qui font <span className="text-[#f0ba80]">vivre</span> nos quartiers.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#e0ebe5] sm:text-lg">
                    Des créateurs aux bonnes tables, trouvez une adresse et découvrez l’histoire derrière chaque vitrine.
              </p>
              {searchForm}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/70 sm:text-sm" aria-label="Suggestions de recherche">
                <span className="mr-1 font-semibold text-white/90">Explorer :</span>
                {popularSearches.map((term) => <button key={term} type="button" onClick={() => setQuery(term)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-white transition hover:border-[#f0ba80] hover:bg-white/10">{term}</button>)}
              </div>
            </div>
            <aside className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[#fffdf9] p-5 text-[#25231f] shadow-[0_24px_70px_rgba(0,0,0,.2)] sm:p-6" aria-label="Repères de l’annuaire">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">Le commerce à portée de main</p>
                  <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight">Une adresse, une histoire.</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e4f1ec] text-xl" aria-hidden="true">✳</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Trouvez votre prochain coup de cœur et prenez contact en direct.</p>
              <div className="mt-5 grid grid-cols-2 divide-x divide-[#e7ddd0] rounded-2xl bg-[#f7f3ee] py-3">
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#0f4d3d]">{isLoading ? '…' : shops.length}</span>
                  <span className="text-xs font-semibold text-[#6f6a61]">adresses locales</span>
                </div>
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#0f4d3d]">{isLoading ? '…' : categories.length}</span>
                  <span className="text-xs font-semibold text-[#6f6a61]">univers à explorer</span>
                </div>
              </div>
              {cityPages.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                {cityPages.slice(0, 3).map((page) => <a key={page.path} href={page.path} className="inline-flex items-center gap-1 rounded-full bg-[#e4f1ec] px-3 py-1.5 text-xs font-bold text-[#0f4d3d] transition hover:bg-[#d2e8dd]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{page.city}</a>)}
              </div>}
            </aside>
          </div>
        </section>
      ) : (
      <section className="mx-auto grid w-full max-w-[1184px] items-center gap-5 px-4 pb-5 pt-7 sm:gap-8 sm:px-8 sm:pb-10 sm:pt-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:pt-16">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#b9441f] sm:mb-3 sm:text-sm">Commerce local · Côte d’Ivoire</p>
          <h1 className="max-w-[650px] font-display text-[34px] font-extrabold leading-[1.04] tracking-[-0.055em] text-[#25231f] sm:text-5xl lg:text-[56px]">
            De belles trouvailles <span className="text-[#0f4d3d]">locales</span>, juste à côté.
          </h1>
          <p className="mt-3 max-w-[540px] text-sm leading-6 text-[#5f5a55] sm:mt-5 sm:text-lg sm:leading-8">
            Parcourez les produits des commerces près de vous, puis échangez directement avec le vendeur sur WhatsApp.
          </p>
          {searchForm}
          <div className="hidden sm:block">{suggestions}</div>
        </div>

        <div className="relative mx-auto h-[200px] w-full max-w-[420px] sm:h-[340px] sm:max-w-[480px] lg:ml-auto">
          {heroCategories.map((category, index) => {
            const layout = [
              'left-[3%] top-[12%] z-10 h-[78%] w-[57%] -rotate-[5deg]',
              'right-[3%] top-[2%] z-20 h-[76%] w-[55%] rotate-[4deg]',
              'bottom-[0%] left-[30%] z-30 h-[52%] w-[53%] -rotate-[2deg]',
            ][index];
            return (
              <div key={category} aria-hidden="true" className={`absolute overflow-hidden rounded-[22px] border-[5px] border-[#fffaf3] bg-[#e4f1ec] shadow-[0_18px_34px_rgba(37,35,31,.16)] ${layout}`}>
                <img src={getCategoryDefaults(category).bannerPlaceholderImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-[#17211f]/75 via-transparent to-transparent" />
                <span className="absolute bottom-3 left-3 right-3 text-xs font-bold text-white drop-shadow sm:bottom-4 sm:left-4 sm:text-sm">{categoryLabel(category)}</span>
              </div>
            );
          })}
          <span className="absolute right-[2%] top-0 z-40 rounded-full border border-[#e0d5c6] bg-[#fffdf9] px-3 py-1.5 text-[10px] font-bold text-[#0f4d3d] shadow-md sm:right-[4%] sm:top-[4%] sm:px-4 sm:py-2 sm:text-sm">
            Les belles adresses de chez nous
          </span>
        </div>
      </section>
      )}

      {isShopDirectoryPage && <section className="mx-auto w-full max-w-[1280px] px-5 pb-5 pt-9 sm:px-8 sm:pb-8 sm:pt-12 lg:px-12" aria-labelledby="categories-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b9441f]">Choisissez votre ambiance</p>
            <h2 id="categories-title" className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Choisir une ambiance</h2>
          </div>
          <span className="text-sm text-[#6f6a61]">Un monde local à chaque détour</span>
        </div>
        {isLoading ? <div className="flex gap-3 overflow-hidden pb-2" role="status" aria-label="Chargement des catégories">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[88px] min-w-[190px] animate-pulse rounded-2xl bg-[#e9e4da]" />)}
        </div> : <div className="flex gap-3 overflow-x-auto pb-2">
          {categories.map((item) => {
            const count = shops.filter((shop) => shop.category === item).length;
            const selected = category === item;
            const className = `group flex min-h-[88px] min-w-[190px] flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-[#0f4d3d] ring-2 ring-[#0f4d3d]/15' : 'border-transparent'}`;
            const contents = <>
                <span className="font-display text-base font-bold text-[#25231f] sm:text-lg">{categoryLabel(item)} <span className="inline-block transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></span>
                <span className="mt-1 text-xs text-[#4a3a30]">{count} boutique{count === 1 ? '' : 's'}</span>
              </>;
            const categoryPage = discoveryPages.find((page) => page.category === item);
            return categoryPage
              ? <a key={item} href={categoryPage.path} className={className} style={{ backgroundColor: categoryTileColors[item] || '#e9e4da' }}>{contents}</a>
              : <button key={item} type="button" aria-pressed={selected} onClick={() => { setCategory(selected ? 'all' : item); document.getElementById('boutiques')?.scrollIntoView({ behavior: 'smooth' }); }} className={className} style={{ backgroundColor: categoryTileColors[item] || '#e9e4da' }}>{contents}</button>;
          })}
        </div>}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && isLoading && !loadError && <section className="mx-auto w-full max-w-[1184px] px-5 py-5 sm:px-8" aria-label="Chargement des boutiques à la une">
        <div className="h-[250px] animate-pulse rounded-[26px] bg-[#e5ded3] sm:h-[300px]" />
      </section>}

      {!discoveryPage && !isShopDirectoryPage && shops.some(isShopPromotion) && (
        <section className="mx-auto w-full max-w-[1184px] px-5 py-7 sm:px-8 sm:py-10" aria-labelledby="featured-shops-title">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">Sélection sponsorisée</p>
            <h2 id="featured-shops-title" className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">À la une dans le fil du jour</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6a61]">Offres et boutiques mises en avant par les commerçants.</p>
          </div>
          <FeaturedCarousel shops={shops.filter(isShopPromotion)} onOpenShop={onOpenShop} />
        </section>
      )}

      {!discoveryPage && !isShopDirectoryPage && <ProductNewsFeed onOpenShop={onOpenShop} />}

      {(discoveryPage || isShopDirectoryPage) && <section id="boutiques" className={`mx-auto w-full scroll-mt-24 px-5 pb-12 pt-5 sm:px-8 sm:pb-16 ${isShopDirectoryPage ? 'max-w-[1280px] lg:px-12' : 'max-w-[1184px]'}`}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">{isShopDirectoryPage ? 'Le carnet des adresses' : 'Découverte'}</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {discoveryPage ? 'Les boutiques à découvrir' : query.trim() || category !== 'all' ? 'Adresses correspondantes' : 'Le répertoire des boutiques'}
            </h2>
          </div>
          <span className="text-sm text-[#6f6a61]" aria-live="polite">{isLoading ? 'Chargement…' : `${filteredShops.length} adresse${filteredShops.length === 1 ? '' : 's'}`}</span>
        </div>

        {isShopDirectoryPage && cityPages.length > 0 && (
          <nav className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Découvrir les boutiques par ville">
            <span className="font-semibold text-[#6f6a61]">Explorer par ville</span>
            {cityPages.map((page) => <a key={page.path} href={page.path} className="font-bold text-[#0f4d3d] underline decoration-[#b8d3c8] underline-offset-4 hover:text-[#176b55]">{page.city}</a>)}
          </nav>
        )}

        {isLoading ? (
          <div role="status" aria-label="Chargement des boutiques" className="space-y-4">
            {[0, 1, 2].map((item) => <div key={item} className="grid overflow-hidden rounded-[24px] border border-[#e7ddd0] bg-white sm:grid-cols-[240px_1fr]" aria-hidden="true">
              <div className="h-44 animate-pulse bg-[#e5ded3] sm:h-52" />
              <div className="space-y-4 p-5 sm:p-7">
                <div className="h-3 w-28 animate-pulse rounded bg-[#d8e7df]" />
                <div className="h-7 w-3/4 animate-pulse rounded bg-[#e9e4da]" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-[#eee9df]" />
                <div className="h-12 animate-pulse rounded bg-[#f3efe9]" />
              </div>
            </div>)}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-8 text-center">
            <h3 className="font-display text-lg font-bold text-[#25231f]">Impossible de charger les boutiques</h3>
            <p className="mt-2 text-sm text-[#6f6a61]">Vérifiez votre connexion, puis réessayez.</p>
            <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0f4d3d] px-4 text-sm font-bold text-white hover:bg-[#176b55]"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer</button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfc8bc] bg-[#fffdf9] p-8 text-center">
            <Store className="mx-auto h-10 w-10 text-[#176b55]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold">{query.trim() || category !== 'all' ? 'Aucune boutique trouvée' : 'Aucune boutique disponible pour le moment'}</h3>
            <p className="mt-2 text-sm text-[#6f6a61]">{query.trim() || category !== 'all' ? 'Essayez un autre mot-clé ou effacez votre recherche.' : 'La vitrine s’actualisera dès qu’une boutique sera publiée.'}</p>
            {(query.trim() || category !== 'all') && <button type="button" onClick={() => { setQuery(''); setCategory('all'); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0f4d3d] px-4 py-2 text-sm font-bold text-white">Effacer les filtres <X className="h-4 w-4" /></button>}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredShops.map((shop, index) => (
              <a key={shop.slug} href={`/${encodeURIComponent(shop.slug)}`} onClick={(event) => { event.preventDefault(); onOpenShop(shop.slug); }} className="group grid overflow-hidden rounded-[24px] border border-[#e3d9cc] bg-[#fffdf9] transition hover:border-[#b7cfc3] hover:shadow-[0_16px_40px_rgba(36,28,22,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2 sm:min-h-[240px] sm:grid-cols-[minmax(210px,30%)_1fr] lg:grid-cols-[minmax(260px,32%)_1fr]">
                <div className="relative min-h-48 overflow-hidden sm:min-h-full" style={{ backgroundColor: `${getShopColor(shop)}30` }}>
                  <img src={getShopImage(shop)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.hidden = true; }} />
                  <span className="absolute inset-0 bg-gradient-to-t from-[#17211f]/75 via-transparent to-[#17211f]/5" />
                  <span className="absolute left-5 top-5 flex h-10 min-w-10 items-center justify-center rounded-full border border-white/60 bg-[#fffdf9]/90 px-3 font-display text-sm font-extrabold text-[#123b31]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="absolute bottom-4 left-5 rounded-full bg-[#fffdf9]/90 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#123b31]">{categoryLabel(shop.category)}</span>
                </div>
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-7 lg:p-9">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">Une adresse à découvrir</span>
                    <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${shop.is_open ? 'bg-[#e2eee6] text-[#0f4d3d]' : 'bg-[#f3eee7] text-[#7a3e00]'}`}>
                      {shop.is_open ? <><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Ouverte</> : <><Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Fermée</>}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    {shop.theme_config?.logo_url && <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e9e1d7] bg-white">
                      <img src={shop.theme_config.logo_url} alt="" className="h-full w-full object-cover" />
                    </span>}
                    <h3 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-[#25231f] sm:text-3xl">{shop.name}</h3>
                  </div>
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#31584c]"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{shop.city || 'Côte d’Ivoire'}</p>
                  <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-6 text-[#6f6a61]">{shop.welcome_message || 'Une vitrine locale à découvrir et un commerçant à rencontrer.'}</p>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee6dd] pt-4">
                    <span className="text-xs font-semibold text-[#6f6a61]">
                      {shop.opening_hours?.enabled && `${shop.opening_hours.open_time || '08:00'}–${shop.opening_hours.close_time || '22:00'} · `}
                      {shop.products_count ? `${shop.products_count} article${shop.products_count === 1 ? '' : 's'} en vitrine` : 'Vitrine à découvrir'}
                    </span>
                    <span className="inline-flex items-center gap-2 text-sm font-bold text-[#0f4d3d]">Entrer dans la boutique <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <section id="comment-ca-marche" className="bg-[#eee8df]">
        <div className="mx-auto grid w-full max-w-[1184px] gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[.75fr_1.25fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">Simple comme bonjour</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-[38px]">Le commerce local, <span className="text-[#0f4d3d]">en trois étapes.</span></h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#655e56]">Tout se passe simplement : vous choisissez, vous échangez, puis vous convenez de la livraison ou du retrait avec le commerçant.</p>
            <a href="/comment-ca-marche" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#0f4d3d] transition hover:text-[#b9441f]">
              Voir le tutoriel détaillé <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { number: '01', title: 'Je choisis', text: 'Je parcours les vitrines et les produits près de chez moi.', icon: '⌕', color: '#e2eee6' },
              { number: '02', title: 'Je commande', text: 'J’envoie ma commande au commerçant sur WhatsApp.', icon: '↗', color: '#f8e3d4' },
              { number: '03', title: 'Je reçois', text: 'Livraison ou retrait : je m’organise directement avec lui.', icon: '✓', color: '#f1e8cf' },
            ].map((step) => (
              <article key={step.number} className="min-h-[180px] rounded-2xl border border-[#e1d8cc] bg-[#fffdf9] p-5">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold text-[#0f4d3d]" style={{ backgroundColor: step.color }}>{step.icon}</span>
                  <span className="text-xs font-bold tracking-[0.08em] text-[#a79b8c]">{step.number}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{step.title}</h3>
                <p className="mt-1 text-sm leading-5 text-[#6c645b]">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <section className="mx-auto w-full max-w-[1184px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col items-start justify-between gap-6 overflow-hidden rounded-[24px] bg-[#0f4d3d] px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10 sm:py-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f0ba80]">Vous êtes commerçant ?</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-[40px]">Votre boutique mérite d’être découverte.</h2>
            <p className="mt-3 text-sm leading-6 text-[#e0eae3]">Créez votre vitrine et présentez vos produits aux clients de votre quartier.</p>
          </div>
          <button type="button" onClick={onCreateShop} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#fffdf9] px-6 text-sm font-bold text-[#0f4d3d] transition hover:bg-[#f6eadc]">Créer ma boutique <ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>}
    </main>
  );
};
