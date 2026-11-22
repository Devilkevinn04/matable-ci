import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw, Search, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { CategoryChips, CitySelect, filterChipClass } from './DirectoryFilters';
import { MotionGridItem } from './MotionSystem';
import { ProductOrderCard, type OrderableProduct } from './ProductOrderCard';
import { useProductSearch } from './ProductSearchResults';
import { ShopCover } from './ShopCover';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { cityMatchesSlug, getCityFilterOptions, type DiscoveryPage } from '../utils/discoverySeo';
import { shopMatchesDirectorySearch } from '../utils/directorySearch';
import { suggestSearch } from '../utils/searchSuggestion';
import { cachedFetchJson } from '../utils/requestCache';
import { isShopExcludedFromPublicIndex } from '../utils/shopIndexing';

export interface MobileDirectoryShop {
  slug: string;
  name: string;
  category?: string;
  city?: string;
  welcome_message?: string | null;
  is_open?: boolean;
  is_verified?: boolean;
  products_count?: number;
  theme_color?: string;
  theme_config?: { custom_banner_url?: string; primary_color?: string };
  products_preview?: { id: number; title: string; image_url: string; thumbnail_url?: string; price: number }[];
}

interface MobileDirectoryProps {
  shops: MobileDirectoryShop[];
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  discoveryPage?: DiscoveryPage;
  relatedPages: DiscoveryPage[];
}

const QUERY_DELAY_MS = 350;
const PRODUCT_PAGE_SIZE = 8;
const POPULAR_URL = '/api/v1/catalog/storefronts/feed?sort=popular&limit=48';

const ShopCard: React.FC<{ shop: MobileDirectoryShop }> = ({ shop }) => (
  <Link to={`/${encodeURIComponent(shop.slug)}`} className="directory-vitrine-card mt-press flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7e2d9] bg-white">
    <span className="relative block aspect-[3/2]"><ShopCover shop={shop} className="absolute inset-0 h-full w-full" sizes="50vw" /></span>
    <span className="flex flex-1 flex-col p-2.5">
      <strong className="line-clamp-2 text-sm font-extrabold leading-[1.15rem] text-[#173c32]">
        {shop.name}
        {shop.is_verified && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--mt-green-primary)]" role="img" aria-label="Identité vérifiée" />}
      </strong>
      <span className="mt-0.5 truncate text-xs text-[var(--mt-gray-600)]">{getCategoryDefaults(shop.category).label} · {shop.city || 'Côte d’Ivoire'}</span>
      <span className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-1.5 text-xs">
        <span className={`font-bold ${shop.is_open === false ? 'text-[#8a5a12]' : 'text-[var(--mt-green-hover)]'}`}>{shop.is_open === false ? 'Fermée' : 'Ouverte'}</span>
        {Boolean(shop.products_count) && <span className="text-[var(--mt-gray-600)]">· {shop.products_count} article{shop.products_count === 1 ? '' : 's'}</span>}
      </span>
    </span>
  </Link>
);

/** Annuaire des téléphones. Recherche, filtres et onglet vivent dans l’adresse : le retour arrière les restaure. */
export const MobileDirectory: React.FC<MobileDirectoryProps> = ({ shops, isLoading, loadError, onRetry, discoveryPage, relatedPages }) => {
  const [params, setParams] = useSearchParams();
  const query = discoveryPage ? '' : params.get('q') || '';
  const category = discoveryPage?.category || params.get('categorie') || 'all';
  const city = discoveryPage?.citySlug || params.get('commune') || 'all';
  const openOnly = params.get('ouvertes') === '1';
  const [draft, setDraft] = useState(query);
  const [visibleProducts, setVisibleProducts] = useState(PRODUCT_PAGE_SIZE);
  const [popular, setPopular] = useState<OrderableProduct[]>([]);
  const lastCommitted = useRef(query);

  const update = (changes: Record<string, string | null>) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    }
    return next;
  }, { replace: true, preventScrollReset: true });

  // La saisie est reportée dans l’adresse ; un retour arrière remet la saisie à jour.
  useEffect(() => {
    if (query !== lastCommitted.current) {
      lastCommitted.current = query;
      setDraft(query);
    }
  }, [query]);
  useEffect(() => {
    const value = draft.trim();
    if (value === query.trim()) return undefined;
    const timer = window.setTimeout(() => {
      lastCommitted.current = value;
      update({ q: value, vue: null });
    }, QUERY_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  useEffect(() => setVisibleProducts(PRODUCT_PAGE_SIZE), [query, category, city, openOnly]);

  const { products: foundProducts, isSearching } = useProductSearch(query);
  const closedShops = useMemo(() => new Set(shops.filter((shop) => shop.is_open === false).map(({ slug }) => slug)), [shops]);
  const matchesPlace = (place: string | undefined) => city === 'all' || cityMatchesSlug(place, city);
  const products = foundProducts.filter((product) => !isShopExcludedFromPublicIndex(product.shop.name)
    && (category === 'all' || product.shop.category === category)
    && matchesPlace(product.shop.city)
    && (!openOnly || !closedShops.has(product.shop.slug)));
  const foundSlugs = new Set(foundProducts.map(({ shop }) => shop.slug));
  const visibleShops = shops.filter((shop) => (foundSlugs.has(shop.slug) || shopMatchesDirectorySearch(shop, query, getCategoryDefaults(shop.category).label))
    && (category === 'all' || shop.category === category)
    && matchesPlace(shop.city)
    && (!openOnly || shop.is_open !== false));

  const hasQuery = query.trim().length > 1;
  const hasFilters = category !== 'all' && !discoveryPage?.category || city !== 'all' && !discoveryPage?.citySlug || openOnly;
  const showShops = !hasQuery || products.length === 0 || params.get('vue') === 'boutiques';
  const isEmpty = !isLoading && !isSearching && !loadError && visibleShops.length === 0 && products.length === 0;

  useEffect(() => {
    if (!isEmpty || popular.length > 0) return undefined;
    let active = true;
    cachedFetchJson<{ products: OrderableProduct[] }>(POPULAR_URL, async () => {
      const response = await fetch(POPULAR_URL);
      if (!response.ok) throw new Error('feed_unavailable');
      return response.json();
    })
      .then((data) => { if (active) setPopular((data.products || []).filter(({ shop }) => !isShopExcludedFromPublicIndex(shop.name))); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isEmpty, popular.length]);
  const suggestion = isEmpty && hasQuery
    ? suggestSearch(query, [...popular.map(({ title }) => title), ...shops.map(({ name }) => name)])
    : null;

  const availableCategories = SHOP_CATEGORIES.filter((item) => shops.some((shop) => shop.category === item));
  const cities = useMemo(() => getCityFilterOptions(shops.map((shop) => shop.city)), [shops]);

  const tabClass = (selected: boolean) => `min-h-11 flex-1 rounded-full text-sm font-extrabold ${selected ? 'bg-white text-[var(--mt-green-deep)] shadow-sm' : 'text-[var(--mt-gray-600)]'}`;

  return (
    <main id="boutiques" className="min-h-[70vh] overflow-x-clip bg-[var(--mt-gray-50)] pb-6 text-[var(--mt-gray-900)]">
      <section className="px-4 pt-3">
        {discoveryPage && (
          <nav aria-label="Fil d’Ariane" className="text-xs text-[var(--mt-gray-600)]">
            <Link to="/boutiques" className="inline-flex min-h-8 items-center font-semibold text-[var(--mt-green-deep)]">Boutiques</Link>
            <span aria-hidden="true" className="px-1.5">/</span>
            <span>{discoveryPage.city || getCategoryDefaults(discoveryPage.category).label}</span>
          </nav>
        )}
        <h1 className="font-display text-[clamp(1.35rem,5.9vw,1.75rem)] font-extrabold leading-[1.1] tracking-tight text-[var(--mt-green-deep)]">{discoveryPage?.heading || 'Boutiques et produits'}</h1>
        {discoveryPage
          ? <p className="mt-1.5 text-sm leading-5 text-[var(--mt-gray-600)]">{discoveryPage.description}</p>
          : (
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                lastCommitted.current = draft.trim();
                update({ q: draft.trim(), vue: null });
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              className="mt-2.5 flex h-[52px] items-center rounded-full border-2 border-[var(--mt-green-deep)] bg-white pl-4 pr-1 focus-within:ring-2 focus-within:ring-[var(--mt-orange-soft)]"
            >
              <Search className="h-5 w-5 shrink-0 text-[var(--mt-gray-600)]" aria-hidden="true" />
              <input
                type="search"
                enterKeyHint="search"
                aria-label="Rechercher un produit, une boutique ou une commune"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Produit, boutique…"
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-[var(--mt-gray-600)] [&::-webkit-search-cancel-button]:hidden"
              />
              {draft && <button type="button" onClick={() => setDraft('')} aria-label="Effacer la recherche" className="grid h-11 w-11 shrink-0 place-items-center text-[var(--mt-gray-600)]"><X className="h-4 w-4" aria-hidden="true" /></button>}
              <button type="submit" aria-label="Chercher" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--mt-green-deep)] text-white"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </form>
          )}
      </section>

      <div role="group" aria-label="Filtrer les résultats" className="mt-chip-rail mt-2.5 flex min-h-11 scroll-px-4 gap-2 overflow-x-auto px-4">
        {!discoveryPage?.citySlug && cities.length > 1 && <CitySelect label="Filtrer par commune" cities={cities} selected={city} onSelect={(value) => update({ commune: value })} />}
        <button type="button" aria-pressed={openOnly} onClick={() => update({ ouvertes: openOnly ? null : '1' })} className={filterChipClass(openOnly)}>Ouvertes</button>
        {!discoveryPage?.category && <CategoryChips categories={availableCategories} selected={category} onSelect={(value) => update({ categorie: value })} />}
      </div>

      {hasQuery && products.length > 0 && (
        <div role="tablist" aria-label="Type de résultats" className="mx-4 mt-2.5 flex rounded-full bg-[#e8e2d6] p-0.5">
          <button type="button" role="tab" aria-selected={!showShops} onClick={() => update({ vue: null })} className={tabClass(!showShops)}>Produits ({products.length})</button>
          <button type="button" role="tab" aria-selected={showShops} onClick={() => update({ vue: 'boutiques' })} className={tabClass(showShops)}>Boutiques ({visibleShops.length})</button>
        </div>
      )}

      <section aria-label={showShops ? 'Boutiques' : 'Produits'} aria-busy={isLoading} className="px-4 pt-3">
        {isLoading || (isSearching && products.length === 0) ? (
          <div role="status" aria-label="Chargement des résultats" className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((item) => <div key={item} className="mt-skeleton h-52 rounded-2xl bg-white" aria-hidden="true" />)}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-5 text-center">
            <p className="text-sm font-bold">Impossible de charger les boutiques.</p>
            <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer</button>
          </div>
        ) : isEmpty ? (
          <div>
            <div role="status" className="rounded-2xl border border-dashed border-[#cfc8bc] bg-white p-5 text-center">
              <p className="font-display text-lg font-extrabold">{hasQuery ? `Aucun résultat pour « ${query.trim()} »` : 'Aucune boutique pour ce choix'}</p>
              {suggestion && <button type="button" onClick={() => setDraft(suggestion)} className="mt-2 min-h-11 text-sm font-bold text-[var(--mt-green-deep)] underline underline-offset-4">Vouliez-vous dire «&nbsp;{suggestion}&nbsp;»&nbsp;?</button>}
              {hasFilters && <button type="button" onClick={() => update({ categorie: null, commune: null, ouvertes: null })} className="mx-auto mt-3 flex min-h-11 items-center rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white">Retirer les filtres</button>}
            </div>
            {popular.length > 0 && (
              <>
                <h2 className="mt-5 font-display text-lg font-extrabold">À commander maintenant</h2>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {popular.slice(0, 4).map((product) => <ProductOrderCard key={product.id} product={product} isOpen={!closedShops.has(product.shop.slug)} now={Date.now()} />)}
                </div>
              </>
            )}
          </div>
        ) : showShops ? (
          <div className="grid grid-cols-2 gap-3">{visibleShops.map((shop) => <ShopCard key={shop.slug} shop={shop} />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {products.slice(0, visibleProducts).map((product) => <MotionGridItem key={product.id} count={Math.min(visibleProducts, products.length)} className="grid min-w-0"><ProductOrderCard product={product} isOpen={!closedShops.has(product.shop.slug)} now={Date.now()} /></MotionGridItem>)}
              </AnimatePresence>
            </div>
            {visibleProducts < products.length && <button type="button" onClick={() => setVisibleProducts((count) => count + PRODUCT_PAGE_SIZE)} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-[#cbd9d0] bg-white text-sm font-extrabold text-[var(--mt-green-deep)]">Voir plus de produits</button>}
          </>
        )}
        {showShops && hasQuery && products.length === 0 && visibleShops.length > 0 && <p className="mt-3 text-sm text-[var(--mt-gray-600)]">Aucun produit ne correspond, mais {visibleShops.length > 1 ? 'ces boutiques pourraient' : 'cette boutique pourrait'} vous aider.</p>}
      </section>

      {discoveryPage && relatedPages.length > 0 && (
        <nav aria-label="Autres pages" className="px-4 pt-6">
          <h2 className="font-display text-lg font-extrabold">Voir aussi</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {relatedPages.map((page) => <Link key={page.path} to={page.path} className={filterChipClass(false)}>{page.heading}</Link>)}
          </div>
        </nav>
      )}
    </main>
  );
};
