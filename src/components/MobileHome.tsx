import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Search, ShieldCheck, ShoppingBag, UserRoundCheck, Wallet } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import type { AnimatedHomeShop } from './AnimatedHome';
import { CategoryChips, CitySelect } from './DirectoryFilters';
import { ProductOrderCard, type OrderableProduct } from './ProductOrderCard';
import { MotionGridItem } from './MotionSystem';
import { ShopCover } from './ShopCover';
import { readActiveCart } from './useCustomerCart';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { cityMatchesSlug, getCityFilterOptions } from '../utils/discoverySeo';
import { getHomeSections } from '../utils/homeProducts';
import { COOKIE_CONSENT_KEY, COOKIE_PREFERENCES_KEY } from '../utils/cookieConsent';
import { useHomeFeed } from '../hooks/useHomeFeed';

const PAGE_SIZE = 6;
const MAX_SHOPS = 8;

const ProductRail: React.FC<{ id: string; title: string; products: OrderableProduct[]; closedShops: ReadonlySet<string>; now: number }> = ({ id, title, products, closedShops, now }) => (
  <section aria-labelledby={id} className="pt-6">
    <h2 id={id} className="px-4 font-display text-xl font-extrabold tracking-tight">{title}</h2>
    <div className="mt-chip-rail mt-3 flex snap-x snap-mandatory gap-3 scroll-px-4 overflow-x-auto px-4 pb-1">
      {products.map((product) => <ProductOrderCard key={product.id} product={product} isOpen={!closedShops.has(product.shop.slug)} now={now} className="w-[44vw] shrink-0 snap-start" />)}
    </div>
  </section>
);

const ResumeOrderBar: React.FC<{ shops: readonly AnimatedHomeShop[] }> = ({ shops }) => {
  const [cart] = useState(readActiveCart);
  const [cookieChoiceMade, setCookieChoiceMade] = useState(false);
  useEffect(() => {
    const sync = () => {
      try {
        setCookieChoiceMade(Boolean(localStorage.getItem(COOKIE_PREFERENCES_KEY) || localStorage.getItem(COOKIE_CONSENT_KEY)));
      } catch {
        setCookieChoiceMade(true);
      }
    };
    sync();
    window.addEventListener('matable-cookie-preferences-updated', sync);
    return () => window.removeEventListener('matable-cookie-preferences-updated', sync);
  }, []);
  const shop = cart && shops.find(({ slug }) => slug === cart.shopSlug);
  if (!cart || !shop || !cookieChoiceMade) return null;
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Link
      to={`/${encodeURIComponent(shop.slug)}#panier`}
      className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--mt-green-deep)] py-2 pl-4 pr-2 text-white shadow-[0_14px_30px_-10px_rgba(16,62,50,.6)]"
    >
      <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold">{count} article{count > 1 ? 's' : ''}</span>
        <span className="block truncate text-xs text-white/80">{shop.name}</span>
      </span>
      <span className="flex min-h-10 shrink-0 items-center rounded-xl bg-white px-4 text-sm font-extrabold text-[var(--mt-green-deep)]">Reprendre</span>
    </Link>
  );
};

/** Accueil des téléphones : les produits à commander d’abord, les boutiques ensuite. */
export const MobileHome: React.FC<{ shops: AnimatedHomeShop[]; onOpenDirectory: (query?: string) => void }> = ({ shops, onOpenDirectory }) => {
  const { products, visibleShops, closedShops, isLoading } = useHomeFeed(shops);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [city, setCity] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const categories = useMemo(() => [...new Set(products.map(({ shop }) => shop.category || 'other'))], [products]);
  const cities = useMemo(() => getCityFilterOptions(products.map(({ shop }) => shop.city)), [products]);
  const filtered = products.filter(({ shop }) => (category === 'all' || (shop.category || 'other') === category)
    && (city === 'all' || cityMatchesSlug(shop.city, city)));
  const { promotions, newest, grid } = getHomeSections(filtered, now);
  const shownGrid = grid.slice(0, visibleCount);

  const selectCategory = (value: string) => {
    setCategory(value);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <main className="overflow-x-clip bg-[var(--mt-gray-50)] pb-2 text-[var(--mt-gray-900)]">
      <section className="px-4 pt-4">
        <h1 className="font-display text-[clamp(1.4rem,6.2vw,1.9rem)] font-extrabold leading-[1.1] tracking-[-.03em] text-[var(--mt-green-deep)]">
          Commandez dans les boutiques <span className="text-[var(--mt-orange-deep)]">près de chez vous.</span>
        </h1>
        <p className="mt-1.5 text-[15px] leading-[1.35rem] text-[var(--mt-gray-600)]">Choisissez, envoyez votre demande, la boutique vous répond sur WhatsApp.</p>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onOpenDirectory(query.trim() || undefined);
          }}
          className="mt-3 flex h-[52px] items-center rounded-full border-2 border-[var(--mt-green-deep)] bg-white pl-4 pr-1 focus-within:ring-2 focus-within:ring-[var(--mt-orange-soft)]"
        >
          <Search className="h-5 w-5 shrink-0 text-[var(--mt-gray-600)]" aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Rechercher un produit, une boutique ou une commune"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Alloco, parfum, savon…"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-[var(--mt-gray-600)]"
          />
          <button type="submit" aria-label="Chercher" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--mt-green-deep)] text-white"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </form>
      </section>

      <div role="group" aria-label="Filtrer les produits par catégorie" className="mt-chip-rail mt-3 flex min-h-11 gap-2 scroll-px-4 overflow-x-auto px-4">
        <CategoryChips categories={categories} selected={category} onSelect={selectCategory} />
      </div>

      <section aria-labelledby="home-order-title" aria-busy={isLoading} className="px-4 pt-3">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <h2 id="home-order-title" className="min-w-0 font-display text-[1.0625rem] font-extrabold leading-tight tracking-tight">À commander maintenant</h2>
          {cities.length > 1 && (
            <CitySelect
              label="Filtrer les produits par commune"
              cities={cities}
              selected={city}
              onSelect={(value) => {
                setCity(value);
                setVisibleCount(PAGE_SIZE);
              }}
            />
          )}
        </div>
        {isLoading ? (
          <div className="mt-2 grid grid-cols-2 gap-3" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => <div key={item} className="mt-skeleton h-[19rem] rounded-2xl bg-white" />)}
          </div>
        ) : grid.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-dashed border-[#d6d0c6] bg-white p-5 text-center">
            <p className="text-sm font-semibold text-[var(--mt-gray-600)]">{products.length === 0 ? 'Les produits arrivent bientôt. Découvrez les boutiques en attendant.' : 'Aucun produit pour ce choix.'}</p>
            {products.length > 0 && <button type="button" onClick={() => { selectCategory('all'); setCity('all'); }} className="mt-3 min-h-11 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white">Tout afficher</button>}
          </div>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <AnimatePresence initial={false} mode="popLayout">
                {shownGrid.map((product) => <MotionGridItem key={product.id} count={shownGrid.length} className="grid min-w-0"><ProductOrderCard product={product} isOpen={!closedShops.has(product.shop.slug)} now={now} /></MotionGridItem>)}
              </AnimatePresence>
            </div>
            {shownGrid.length < grid.length && (
              <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#cbd9d0] bg-white text-sm font-extrabold text-[var(--mt-green-deep)]">
                Voir plus de produits
              </button>
            )}
          </>
        )}
      </section>

      {promotions.length > 0 && <ProductRail id="home-promotions-title" title="Promotions en cours" products={promotions} closedShops={closedShops} now={now} />}
      {newest.length > 0 && <ProductRail id="home-newest-title" title="Nouveautés" products={newest} closedShops={closedShops} now={now} />}

      <ul className="mx-4 mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-[#edf5f0] p-3 text-center text-xs font-bold leading-4 text-[var(--mt-green-deep)]">
        <li className="flex flex-col items-center gap-1"><ShieldCheck className="h-5 w-5" aria-hidden="true" />Identité vérifiée</li>
        <li className="flex flex-col items-center gap-1"><UserRoundCheck className="h-5 w-5" aria-hidden="true" />Sans compte</li>
        <li className="flex flex-col items-center gap-1"><Wallet className="h-5 w-5" aria-hidden="true" />Vous réglez la boutique</li>
      </ul>

      {visibleShops.length > 0 && (
        <section aria-labelledby="home-shops-title" className="pt-3">
          <div className="flex min-h-11 items-center justify-between gap-3 px-4">
            <h2 id="home-shops-title" className="font-display text-xl font-extrabold tracking-tight">Les boutiques</h2>
            <Link to="/boutiques" className="inline-flex min-h-11 items-center gap-1 text-sm font-extrabold text-[var(--mt-green-deep)]">Tout voir <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="mt-chip-rail mt-1 flex snap-x snap-mandatory gap-3 scroll-px-4 overflow-x-auto px-4 pb-1">
            {visibleShops.slice(0, MAX_SHOPS).map((shop) => (
              <Link key={shop.slug} to={`/${encodeURIComponent(shop.slug)}`} className="w-[46vw] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#e7e2d9] bg-white">
                <span className="relative block aspect-[2/1]"><ShopCover shop={shop} className="absolute inset-0 h-full w-full" sizes="46vw" /></span>
                <span className="block p-2.5">
                  <strong className="flex min-w-0 items-center gap-1 text-sm font-extrabold text-[#173c32]">
                    <span className="truncate">{shop.name}</span>
                    {shop.is_verified && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--mt-green-primary)]" role="img" aria-label="Identité vérifiée" />}
                  </strong>
                  <span className="block truncate text-xs text-[var(--mt-gray-600)]">{getCategoryDefaults(shop.category).label} · {shop.city || 'Côte d’Ivoire'}</span>
                  <span className={`mt-0.5 block text-xs font-bold ${shop.is_open === false ? 'text-[#8a5a12]' : 'text-[var(--mt-green-hover)]'}`}>{shop.is_open === false ? 'Fermée' : 'Ouverte'}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="home-sell-title" className="mx-4 mt-4 rounded-2xl bg-[var(--mt-green-hover)] p-4 text-white">
        <h2 id="home-sell-title" className="font-display text-xl font-extrabold">Vous vendez ?</h2>
        <p className="mt-1 text-sm leading-5 text-white/90">Vos produits en photo, vos prix, et les commandes sur votre WhatsApp.</p>
        <Link to="/commercants" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-[var(--mt-green-deep)]">Créer ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </section>

      <ResumeOrderBar shops={shops} />
    </main>
  );
};
