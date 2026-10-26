import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BadgePercent, CheckCircle2, Clock3, MapPin, RotateCcw, Search, Store, X } from 'lucide-react';
import { getCategoryDefaults, getProductImageForDisplay, isShopCategory, normalizeCustomBannerImage, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { shopMatchesDirectorySearch } from '../utils/directorySearch';
import { getPublicDiscoveryPages, toDiscoveryCitySlug, type DiscoveryPage } from '../utils/discoverySeo';
import { ProductNewsFeed } from './ProductNewsFeed';
import { PublicCampaignCarousel } from './PublicCampaignCarousel';
import { PublicPartnerCarousel } from './PublicPartnerCarousel';

interface DirectoryShop {
  id?: number;
  slug: string;
  name: string;
  category?: string;
  city?: string;
  created_at?: string;
  is_open?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
  boost_placements?: string[];
  is_active?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  opening_hours?: { enabled?: boolean; open_time?: string; close_time?: string; days?: number[] };
  theme_config?: { custom_banner_url?: string; primary_color?: string; logo_url?: string; event_mode_enabled?: boolean; event_type?: string; event_banner_text?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

interface PublicDirectoryProps {
  shops: DirectoryShop[];
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onOpenShop: (slug: string) => void;
  onOpenDirectory: (query?: string) => void;
  discoveryPage?: DiscoveryPage;
  isShopDirectoryPage?: boolean;
  isPromotionsPage?: boolean;
}

const categoryTileColors: Record<string, string> = {
  fashion: '#d1fae5',
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

export const PublicDirectory: React.FC<PublicDirectoryProps> = ({ shops, isLoading, loadError, onRetry, onOpenShop, onOpenDirectory, discoveryPage, isShopDirectoryPage = false, isPromotionsPage = false }) => {
  const location = useLocation();
  const [query, setQuery] = useState(() => isShopDirectoryPage ? new URLSearchParams(location.search).get('q') || '' : '');
  const [category, setCategory] = useState(discoveryPage?.category || 'all');
  const [campaignEligible, setCampaignEligible] = useState(false);
  const [hasHeroCampaign, setHasHeroCampaign] = useState(false);
  useEffect(() => {
    if (isShopDirectoryPage) setQuery(new URLSearchParams(location.search).get('q') || '');
  }, [isShopDirectoryPage, location.search]);
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
  const homeShops = [...shops]
    .sort((left, right) => Number(Boolean(right.is_sponsored || right.is_featured)) - Number(Boolean(left.is_sponsored || left.is_featured)))
    .slice(0, 3);
  const heroShops = homeShops.slice(0, hasHeroCampaign ? 2 : 3);
  const categoryCounts = new Map<string, number>();
  for (const shop of shops) {
    if (shop.category) categoryCounts.set(shop.category, (categoryCounts.get(shop.category) || 0) + 1);
  }
  const popularSearches = [
    ...categories.slice(0, 4).map(categoryLabel),
    ...cityPages.slice(0, 1).map((page) => page.city || ''),
  ].filter(Boolean).slice(0, 5);
  const filteredShops = useMemo(() => {
    const filtered = shops.filter((shop) =>
    shopMatchesDirectorySearch(shop, query, categoryLabel(shop.category))
      && (category === 'all' || shop.category === category)
      && (!discoveryPage?.citySlug || toDiscoveryCitySlug(shop.city || '') === discoveryPage.citySlug)
    );
    const targetPlacement = discoveryPage?.citySlug
      ? 'city'
      : discoveryPage?.category || category !== 'all'
        ? 'category'
        : !isShopDirectoryPage
          ? 'home'
          : null;
    if (!targetPlacement) return filtered;
    return filtered.map((shop, index) => ({ shop, index })).sort((left, right) => {
      const leftBoosted = left.shop.boost_placements?.includes(targetPlacement) || left.shop.boost_placements?.includes('directory');
      const rightBoosted = right.shop.boost_placements?.includes(targetPlacement) || right.shop.boost_placements?.includes('directory');
      return Number(rightBoosted) - Number(leftBoosted) || left.index - right.index;
    }).map(({ shop }) => shop);
  }, [shops, query, category, discoveryPage?.citySlug, discoveryPage?.category, isShopDirectoryPage]);
  const getShopImage = (shop: DirectoryShop) => normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category)
    || (shop.products_preview?.[0]
      ? getProductImageForDisplay(shop.products_preview[0].image_url, shop.category)
      : getCategoryDefaults(shop.category).bannerPlaceholderImageUrl);
  const getShopColor = (shop: DirectoryShop) => shop.theme_color || shop.theme_config?.primary_color || '#047857';
  const searchForm = <form
    onSubmit={(event) => {
      event.preventDefault();
      if (isShopDirectoryPage) document.getElementById('boutiques')?.scrollIntoView({ behavior: 'smooth' });
      else onOpenDirectory(query);
    }}
    className={`mt-4 flex w-full max-w-[610px] items-center gap-1.5 rounded-[16px] border p-1.5 shadow-[0_10px_28px_rgba(0,0,0,.12)] focus-within:ring-2 focus-within:ring-[#f0ba80]/50 sm:mt-6 sm:gap-2 sm:rounded-[18px] sm:p-2 ${isShopDirectoryPage ? 'border-white/20 bg-white text-[#292d2a]' : 'border-[#d9cdbd] bg-white focus-within:border-[#047857] focus-within:ring-[#047857]/15'}`}
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
    <button type="submit" className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-xs font-bold text-white transition sm:min-h-11 sm:px-5 sm:text-sm ${isShopDirectoryPage ? 'bg-[#c2410c] hover:bg-[#a53a1d]' : 'bg-[#065f46] hover:bg-[#047857]'}`}>
      <span className="sm:hidden">Chercher</span>
      <span className="hidden sm:inline">{isShopDirectoryPage ? 'Rechercher' : 'Voir les boutiques'}</span>
    </button>
  </form>;

  if (isPromotionsPage) {
    return (
      <main className="min-h-screen bg-[#FAF8F2] text-[#292d2a]">
        <section className="relative isolate overflow-hidden bg-[#065f46] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 -z-10 h-80 w-80 rounded-full border border-white/10 sm:right-[12%] sm:h-[34rem] sm:w-[34rem]" />
          <div className="mx-auto max-w-[1184px] px-5 py-9 sm:px-8 sm:py-12">
            <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-white/65">
              <Link to="/" className="font-semibold text-white hover:underline">Accueil</Link>
              <span aria-hidden="true" className="px-2">/</span>
              <span>Promotions</span>
            </nav>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]"><BadgePercent className="h-4 w-4" aria-hidden="true" /> Bons plans des boutiques</p>
            <h1 className="mt-3 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-[-.04em] sm:text-5xl">Les offres locales, au bon moment.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">Des réductions datées, publiées par les commerçants. Le prix normal reste visible et le tarif promotionnel s’applique uniquement pendant la période indiquée.</p>
          </div>
        </section>
        <ProductNewsFeed key="promotions" onOpenShop={onOpenShop} categories={categories} promotionsOnly />
      </main>
    );
  }

  return (
    <main className="public-directory min-h-screen bg-[#FAF8F2] text-[#292d2a]">
      {discoveryPage ? (
        <section className="mx-auto w-full max-w-[1184px] px-5 pb-7 pt-10 sm:px-8 sm:pb-10 sm:pt-14">
          <nav aria-label="Fil d’Ariane" className="mb-5 text-sm text-[#647067]">
            <Link to="/" className="font-semibold text-[#065f46] hover:underline">Accueil</Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span>{discoveryPage.city || (discoveryPage.category ? categoryLabel(discoveryPage.category) : 'Boutiques')}</span>
          </nav>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c] sm:text-sm">Commerce local · Côte d’Ivoire</p>
          <h1 className="max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">{discoveryPage.heading}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f5a55] sm:text-lg">{discoveryPage.description.replace(' | MaTable.ci', '')}</p>
          {relatedDiscoveryPages.length > 0 && (
            <nav aria-label={discoveryPage.city ? 'Découvrir par catégorie' : 'Découvrir par ville'} className="mt-6 flex flex-wrap gap-2">
              <span className="self-center pr-1 text-sm font-bold text-[#47534b]">{discoveryPage.city ? 'Explorer les catégories :' : 'Explorer par ville :'}</span>
              {relatedDiscoveryPages.map((page) => (
                <Link key={page.path} to={page.path} className="rounded-full border border-[#e0d5c6] bg-white px-3 py-1.5 text-sm font-semibold text-[#065f46] transition hover:border-[#047857]">
                  {page.city || (page.category ? categoryLabel(page.category) : '')}
                </Link>
              ))}
            </nav>
          )}
        </section>
      ) : isShopDirectoryPage ? (
        <section className="relative isolate overflow-hidden bg-[#065f46] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-36 -z-10 h-[470px] w-[470px] rounded-full border border-white/10 sm:right-[8%] sm:top-[-250px] sm:h-[700px] sm:w-[700px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 top-20 -z-10 h-64 w-64 rounded-full border border-[#f0ba80]/20 sm:right-[15%] sm:top-8 sm:h-96 sm:w-96" />
          <div className="mx-auto grid w-full max-w-[1280px] gap-9 px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-10 lg:grid-cols-[1fr_340px] lg:items-end lg:gap-16 lg:px-12 lg:pb-16 lg:pt-12">
            <div className="min-w-0">
              <nav aria-label="Fil d’Ariane" className="mb-8 text-sm text-white/65">
                <Link to="/" className="font-semibold text-white hover:underline">Accueil</Link>
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
            <aside className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[#FFFFFF] p-5 text-[#292d2a] shadow-[0_24px_70px_rgba(0,0,0,.2)] sm:p-6" aria-label="Repères de l’annuaire">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c]">Le commerce à portée de main</p>
                  <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight">Une adresse, une histoire.</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d1fae5] text-xl" aria-hidden="true">✳</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#647067]">Trouvez votre prochain coup de cœur et prenez contact en direct.</p>
              <div className="mt-5 grid grid-cols-2 divide-x divide-[#e7ddd0] rounded-2xl bg-[#FAF8F2] py-3">
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#065f46]">{isLoading ? '…' : shops.length}</span>
                  <span className="text-xs font-semibold text-[#647067]">adresses locales</span>
                </div>
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#065f46]">{isLoading ? '…' : categories.length}</span>
                  <span className="text-xs font-semibold text-[#647067]">univers à explorer</span>
                </div>
              </div>
              {cityPages.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                {cityPages.slice(0, 3).map((page) => <Link key={page.path} to={page.path} className="inline-flex items-center gap-1 rounded-full bg-[#d1fae5] px-3 py-1.5 text-xs font-bold text-[#065f46] transition hover:bg-[#d2e8dd]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{page.city}</Link>)}
              </div>}
            </aside>
          </div>
        </section>
      ) : (
      <section className="mx-auto w-full max-w-[1280px] px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6 lg:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-[#e7dfd3] bg-white shadow-[0_8px_28px_rgba(20,40,30,.07)] lg:min-h-[330px] lg:grid-cols-[.88fr_1.12fr]">
          <div className="flex min-w-0 flex-col justify-center bg-gradient-to-br from-[#fffdf8] via-[#f8f5ef] to-[#edf5f0] p-5 sm:p-8 lg:p-9">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#c2410c] sm:text-xs">Le commerce local, simplifié</p>
            <h1 className="max-w-[600px] font-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.055em] text-[#065f46] sm:text-[48px] lg:text-[58px]">
              Le commerce local, <span className="text-[#c2410c]">tout près de vous.</span>
            </h1>
            <p className="mt-3 max-w-[480px] text-sm leading-6 text-[#47534b] sm:text-[15px]">
              Parcourez les boutiques, repérez leurs produits et contactez directement les commerçants de Côte d’Ivoire.
            </p>
            {searchForm}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-[#315548] sm:text-xs">
              <span className="inline-flex items-center gap-1.5"><Store className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Boutiques locales</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Échange direct</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Retrait ou livraison à convenir</span>
            </div>
            {!discoveryPage && !isShopDirectoryPage && <PublicPartnerCarousel />}
          </div>
          <div className="relative flex min-h-[250px] flex-col justify-end overflow-hidden bg-[#075f48] sm:min-h-[300px] lg:min-h-full">
            <img
              src={getShopImage(homeShops[0] || { slug: '', name: '', category: 'food' })}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#082e24]/95 via-[#082e24]/55 to-[#082e24]/10" />
            <div className="relative z-10 p-5 sm:p-8 lg:p-9">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#065f46] sm:text-[10px]">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Le meilleur de vos commerces locaux
              </p>
              <h2 className="mt-3 max-w-lg font-display text-2xl font-black leading-tight text-white sm:text-3xl lg:text-4xl">Consommez local. Soutenez nos commerçants.</h2>
              <p className="mt-2 max-w-md text-xs leading-5 text-white/85 sm:text-sm">Des adresses de quartier, des produits disponibles et un échange direct avec les boutiques.</p>
              <button type="button" onClick={() => onOpenDirectory()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#f97316] px-4 text-xs font-extrabold text-white shadow transition hover:bg-[#ea580c] sm:text-sm">
                Découvrir les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="relative z-10 grid grid-cols-2 gap-2.5 bg-gradient-to-b from-transparent to-[#082e24]/40 p-4 pt-2 sm:gap-3 sm:p-6">
              {!discoveryPage && !isShopDirectoryPage && <PublicCampaignCarousel
                onOpenShop={onOpenShop}
                eligible={campaignEligible}
                placement="hero"
                onCampaignVisibilityChange={setHasHeroCampaign}
              />}
              {heroShops.map((shop, index) => (
                <Link
                  key={shop.slug}
                  to={`/${encodeURIComponent(shop.slug)}`}
                  aria-label={`Découvrir la boutique ${shop.name}`}
                  className={`group min-w-0 overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_8px_22px_rgba(0,0,0,.16)] transition hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(0,0,0,.22)] ${index === 2 ? 'col-span-2 mx-auto w-[calc(50%-0.375rem)]' : ''}`}
                >
                  <span className="relative block aspect-[2.4/1] overflow-hidden bg-[#e9f5ee]">
                    <img src={getShopImage(shop)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(event) => { event.currentTarget.hidden = true; }} />
                    <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-[#8f351d] sm:text-[9px]">{categoryLabel(shop.category)}</span>
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2 p-2 sm:p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[10px] font-extrabold text-[#292d2a] sm:text-xs">{shop.name}</span>
                      {shop.city && <span className="mt-0.5 block truncate text-[9px] text-[#647067]">{shop.city}</span>}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#059669] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              ))}
              {heroShops.length === 0 && (
                <button type="button" onClick={() => onOpenDirectory()} className="col-span-2 flex min-h-24 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-[#065f46]">
                  <Store className="h-8 w-8" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {!discoveryPage && !isShopDirectoryPage && (isLoading || categories.length > 0) && <section className="mx-auto w-full max-w-[1280px] px-5 pb-4 sm:px-8 sm:pb-6 lg:px-10" aria-labelledby="home-categories-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c2410c]">Explorez par univers</p>
            <h2 id="home-categories-title" className="mt-1 font-display text-xl font-extrabold tracking-tight sm:text-2xl">Les catégories du moment</h2>
          </div>
          <button type="button" onClick={() => onOpenDirectory()} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-[#065f46] hover:text-[#047857]">
            Toutes les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {isLoading ? <div role="status" aria-label="Chargement des catégories" className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[94px] min-w-[118px] animate-pulse rounded-2xl bg-[#e9e4da] sm:min-w-[150px]" />)}
        </div> : <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
          {categories.map((item) => {
            const count = categoryCounts.get(item) || 0;
            return <button key={item} type="button" onClick={() => onOpenDirectory(categoryLabel(item))} className="group flex min-h-[94px] min-w-[118px] snap-start flex-col items-start justify-between rounded-2xl border border-black/[.04] px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(20,40,30,.08)] sm:min-w-0 sm:px-4" style={{ backgroundColor: categoryTileColors[item] || '#f1f5f2' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-xl" aria-hidden="true">{getCategoryDefaults(item).icon}</span>
              <span className="mt-2 flex w-full items-end justify-between gap-1">
                <span className="min-w-0">
                  <span className="block truncate font-display text-xs font-extrabold text-[#292d2a] sm:text-sm">{categoryLabel(item)}</span>
                  <span className="mt-0.5 block text-[9px] text-[#47534b]">{count} boutique{count === 1 ? '' : 's'}</span>
                </span>
                <ArrowRight className="mb-0.5 h-3.5 w-3.5 shrink-0 text-[#047857] transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>;
          })}
        </div>}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <PublicCampaignCarousel onOpenShop={onOpenShop} eligible={campaignEligible} placement="billboard" />}

      {!discoveryPage && !isShopDirectoryPage && <section className="mx-auto grid w-full max-w-[1280px] gap-6 px-5 pb-6 pt-3 sm:px-8 sm:pb-8 lg:grid-cols-[1.2fr_.8fr] lg:gap-8 lg:px-10" aria-label="Boutiques à la une et promotions">
        <section aria-labelledby="home-shops-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c2410c]">Adresses sélectionnées</p>
              <h2 id="home-shops-title" className="mt-1 font-display text-xl font-extrabold tracking-tight sm:text-2xl">Boutiques à la une</h2>
            </div>
            <button type="button" onClick={() => onOpenDirectory()} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-[11px] font-bold text-[#065f46] hover:text-[#047857] sm:text-sm">
              Toutes <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {isLoading ? (
            <div role="status" aria-label="Chargement des boutiques à la une" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[0, 1, 2].map((item) => <div key={item} className="h-[92px] animate-pulse rounded-2xl bg-[#e9e4da]" />)}
            </div>
          ) : homeShops.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-[#d8d0c3] bg-white px-5 text-center text-sm text-[#647067]">Les boutiques locales seront bientôt à découvrir ici.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {homeShops.map((shop) => (
                <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="group relative flex min-h-[94px] min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white p-2.5 shadow-[0_2px_12px_rgba(20,40,30,.05)] transition hover:-translate-y-0.5 hover:border-[#b9d5ca] hover:shadow-[0_12px_28px_rgba(20,40,30,.09)]">
                  <div className="relative h-[76px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-[#edf5f0]">
                    <img src={getShopImage(shop)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(event) => { event.currentTarget.hidden = true; }} />
                    {(shop.is_sponsored || shop.is_featured) && <span className="absolute left-1.5 top-1.5 rounded-full bg-[#fffdf8] px-2 py-0.5 text-[8px] font-black uppercase text-[#8f351d]">À la une</span>}
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#c2410c]">{categoryLabel(shop.category)}</span>
                    <h3 className="mt-0.5 line-clamp-1 font-display text-sm font-extrabold text-[#292d2a] sm:text-base">{shop.name}</h3>
                    {shop.city && <p className="mt-1 flex items-center gap-1 truncate text-xs text-[#647067]"><MapPin className="h-3 w-3 shrink-0 text-[#059669]" aria-hidden="true" />{shop.city}</p>}
                  </div>
                  <ArrowRight className="mr-1 h-4 w-4 shrink-0 text-[#059669] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <Link to="/promotions" className="group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl bg-[#fff0df] p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(150,70,30,.12)] sm:p-6">
          <span aria-hidden="true" className="absolute -right-7 -top-8 h-36 w-36 rounded-full border-[18px] border-[#f5d3b5]" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#c2410c] text-white"><BadgePercent className="h-5 w-5" aria-hidden="true" /></span>
          <span className="relative mt-5">
            <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#a53a1d]">Promotions des boutiques</span>
            <span className="mt-1 block font-display text-xl font-extrabold leading-tight text-[#292d2a]">Les prix réduits, sans chercher partout.</span>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#a53a1d]">Voir les promotions <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
          </span>
        </Link>
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <PublicCampaignCarousel onOpenShop={onOpenShop} eligible={campaignEligible} placement="tiles" />}

      {!discoveryPage && !isShopDirectoryPage && <ProductNewsFeed onOpenShop={onOpenShop} categories={categories} onCampaignEligibilityChange={setCampaignEligible} />}

      {isShopDirectoryPage && <section className="mx-auto w-full max-w-[1280px] px-5 pb-5 pt-9 sm:px-8 sm:pb-8 sm:pt-12 lg:px-12" aria-labelledby="categories-title">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c2410c]">Choisissez votre ambiance</p>
            <h2 id="categories-title" className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Choisir une ambiance</h2>
          </div>
          <span className="text-sm text-[#647067]">Un monde local à chaque détour</span>
        </div>
        {isLoading ? <div className="flex gap-3 overflow-hidden pb-2" role="status" aria-label="Chargement des catégories">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[88px] min-w-[190px] animate-pulse rounded-2xl bg-[#e9e4da]" />)}
        </div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((item) => {
            const count = shops.filter((shop) => shop.category === item).length;
            const selected = category === item;
            const className = `group flex min-h-[88px] min-w-0 flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selected ? 'border-[#065f46] ring-2 ring-[#065f46]/15' : 'border-transparent'}`;
            const contents = <>
                <span className="font-display text-base font-bold text-[#292d2a] sm:text-lg">{categoryLabel(item)} <span className="inline-block transition-transform group-hover:translate-x-1" aria-hidden="true">→</span></span>
                <span className="mt-1 text-xs text-[#47534b]">{count} boutique{count === 1 ? '' : 's'}</span>
              </>;
            const categoryPage = discoveryPages.find((page) => page.category === item);
            return categoryPage
              ? <Link key={item} to={categoryPage.path} className={className} style={{ backgroundColor: categoryTileColors[item] || '#e9e4da' }}>{contents}</Link>
              : <button key={item} type="button" aria-pressed={selected} onClick={() => { setCategory(selected ? 'all' : item); document.getElementById('boutiques')?.scrollIntoView({ behavior: 'smooth' }); }} className={className} style={{ backgroundColor: categoryTileColors[item] || '#e9e4da' }}>{contents}</button>;
          })}
        </div>}
      </section>}

      {(discoveryPage || isShopDirectoryPage) && <section id="boutiques" className={`mx-auto w-full scroll-mt-24 px-5 pb-12 pt-5 sm:px-8 sm:pb-16 ${isShopDirectoryPage ? 'max-w-[1280px] lg:px-12' : 'max-w-[1184px]'}`}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c]">{isShopDirectoryPage ? 'Le carnet des adresses' : 'Découverte'}</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {discoveryPage ? 'Les boutiques à découvrir' : query.trim() || category !== 'all' ? 'Adresses correspondantes' : 'Le répertoire des boutiques'}
            </h2>
          </div>
          <span className="text-sm text-[#647067]" aria-live="polite">{isLoading ? 'Chargement…' : `${filteredShops.length} adresse${filteredShops.length === 1 ? '' : 's'}`}</span>
        </div>

        {isShopDirectoryPage && cityPages.length > 0 && (
          <nav className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Découvrir les boutiques par ville">
            <span className="font-semibold text-[#647067]">Explorer par ville</span>
            {cityPages.map((page) => <Link key={page.path} to={page.path} className="font-bold text-[#065f46] underline decoration-[#b8d3c8] underline-offset-4 hover:text-[#047857]">{page.city}</Link>)}
          </nav>
        )}

        {isLoading ? (
          <div role="status" aria-label="Chargement des boutiques" className="grid grid-cols-2 gap-3 sm:gap-4 max-[360px]:grid-cols-1">
            {[0, 1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-[20px] border border-[#e7ddd0] bg-white sm:rounded-[24px]" aria-hidden="true">
              <div className="aspect-[1.35] animate-pulse bg-[#e5ded3]" />
              <div className="space-y-3 p-3 sm:p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-[#d8e7df]" />
                <div className="h-6 w-3/4 animate-pulse rounded bg-[#e9e4da]" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-[#eee9df]" />
              </div>
            </div>)}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-8 text-center">
            <h3 className="font-display text-lg font-bold text-[#292d2a]">Impossible de charger les boutiques</h3>
            <p className="mt-2 text-sm text-[#647067]">Vérifiez votre connexion, puis réessayez.</p>
            <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#065f46] px-4 text-sm font-bold text-white hover:bg-[#047857]"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer</button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfc8bc] bg-[#FFFFFF] p-8 text-center">
            <Store className="mx-auto h-10 w-10 text-[#047857]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold">{query.trim() || category !== 'all' ? 'Aucune boutique trouvée' : 'Aucune boutique disponible pour le moment'}</h3>
            <p className="mt-2 text-sm text-[#647067]">{query.trim() || category !== 'all' ? 'Essayez un autre mot-clé ou effacez votre recherche.' : 'La vitrine s’actualisera dès qu’une boutique sera publiée.'}</p>
            {(query.trim() || category !== 'all') && <button type="button" onClick={() => { setQuery(''); setCategory('all'); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#065f46] px-4 py-2 text-sm font-bold text-white">Effacer les filtres <X className="h-4 w-4" /></button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:gap-5 max-[360px]:grid-cols-1">
            {filteredShops.map((shop) => (
              <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#e3d9cc] bg-[#FFFFFF] transition hover:border-[#b7cfc3] hover:shadow-[0_16px_40px_rgba(36,28,22,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2 sm:rounded-[24px]">
                <div className="relative aspect-[1.35] shrink-0 overflow-hidden sm:aspect-[1.65]" style={{ backgroundColor: `${getShopColor(shop)}30` }}>
                  <img src={getShopImage(shop)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.hidden = true; }} />
                  <span className="absolute inset-0 bg-gradient-to-t from-[#17211f]/75 via-transparent to-[#17211f]/5" />
                  <span className="absolute bottom-3 left-3 rounded-full bg-[#FFFFFF]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#065f46] sm:bottom-4 sm:left-4 sm:px-3 sm:py-1.5 sm:text-xs">{categoryLabel(shop.category)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-5 lg:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-[#c2410c] sm:text-xs sm:tracking-[0.13em]"><span className="sm:hidden">Adresse</span><span className="hidden sm:inline">Une adresse à découvrir</span></span>
                    <div className="flex shrink-0 items-center gap-1">
                    {shop.boost_placements?.some((placement) => placement === (discoveryPage?.citySlug ? 'city' : discoveryPage?.category || category !== 'all' ? 'category' : !isShopDirectoryPage ? 'home' : 'directory') || placement === 'directory') && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-950 sm:text-[10px]">Sponsorisé</span>}
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${shop.is_open ? 'bg-[#e2eee6] text-[#065f46]' : 'bg-[#f3eee7] text-[#7a3e00]'}`}>
                      {shop.is_open ? <><CheckCircle2 className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />Ouverte</> : <><Clock3 className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />Fermée</>}
                    </span>
                    </div>
                  </div>
                  <div className="mt-2 flex min-w-0 items-center gap-2 sm:mt-4 sm:gap-3">
                    {shop.theme_config?.logo_url && <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e9e1d7] bg-white sm:h-12 sm:w-12 sm:rounded-2xl">
                      <img src={shop.theme_config.logo_url} alt="" className="h-full w-full object-cover" />
                    </span>}
                    <h3 className="line-clamp-2 min-w-0 font-display text-base font-extrabold leading-tight tracking-tight text-[#292d2a] sm:text-xl lg:text-2xl">{shop.name}</h3>
                  </div>
                  {shop.city && <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#47534b] sm:mt-3 sm:gap-2 sm:text-sm"><MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" /><span className="truncate">{shop.city}</span></p>}
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#647067] sm:mt-3 sm:text-sm sm:leading-6">{shop.welcome_message || 'Une vitrine locale à découvrir et un commerçant à rencontrer.'}</p>
                  <div className="mt-auto flex flex-col items-start gap-2 border-t border-[#eee6dd] pt-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:pt-4">
                    <span className="text-[10px] font-semibold leading-4 text-[#647067] sm:text-xs">
                      {shop.opening_hours?.enabled && shop.opening_hours.open_time && shop.opening_hours.close_time && `${shop.opening_hours.open_time}–${shop.opening_hours.close_time} · `}
                      {shop.products_count ? `${shop.products_count} article${shop.products_count === 1 ? '' : 's'} en vitrine` : 'Vitrine à découvrir'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#065f46] sm:gap-2 sm:text-sm">Découvrir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" aria-hidden="true" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <section className="mx-auto w-full max-w-[1184px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col items-start justify-between gap-6 overflow-hidden rounded-[24px] bg-[#065f46] px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10 sm:py-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f0ba80]">Vous vendez en Côte d’Ivoire ?</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">Présentez votre commerce sur MaTable.ci.</h2>
            <p className="mt-2 text-sm leading-6 text-[#e0eae3]">Découvrez les outils, les étapes de création et les formules pour commerçants.</p>
          </div>
          <Link to="/commercants" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#FFFFFF] px-6 text-sm font-bold text-[#065f46] transition hover:bg-[#f6eadc]">Espace commerçant <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>}
    </main>
  );
};
