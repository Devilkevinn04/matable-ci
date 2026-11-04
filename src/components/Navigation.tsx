import React, { useState } from 'react';
import { Store, ShieldCheck, ShoppingBag, Compass, CircleHelp, BookOpen, Menu, X, Sparkles, Search, Home, ArrowUpRight, BadgePercent, Bike } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { CustomerUser } from './CustomerAuth';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../utils/categoryDefaults';

interface NavigationProps {
  currentRole: 'storefront' | 'merchant' | 'admin';
  onOpenDirectory: (query?: string) => void;
  showSearch?: boolean;
  isLegalPage?: boolean;
  customerUser?: CustomerUser | null;
  onOpenCustomerAccount: () => void;
  onLogoutCustomer: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentRole,
  onOpenDirectory,
  showSearch = false,
  isLegalPage = false,
  customerUser = null,
  onOpenCustomerAccount,
  onLogoutCustomer,
}) => {
  const location = useLocation();
  const isMerchantPlansPage = location.pathname.replace(/\/+$/, '') === '/commercants';
  const isPromotionsPage = location.pathname.replace(/\/+$/, '') === '/promotions';
  const publicNavigationLinks = [
    { to: '/', label: 'Accueil', icon: Home, active: location.pathname === '/' },
    { to: '/boutiques', label: 'Boutiques', icon: Compass, active: location.pathname === '/boutiques' || location.pathname.startsWith('/boutiques/') },
    { to: '/promotions', label: 'Promotions', icon: BadgePercent, active: isPromotionsPage },
    { to: '/comment-ca-marche', label: 'Comment ça marche', icon: CircleHelp, active: location.pathname === '/comment-ca-marche' },
    { to: '/commercants', label: 'Commerçants', icon: Store, active: isMerchantPlansPage },
    { to: '/livreur', label: 'Livreurs', icon: Bike, active: location.pathname === '/livreur' },
  ];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);
  React.useEffect(() => {
    setSearchQuery(new URLSearchParams(location.search).get('q') || '');
  }, [location.search]);
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);
  const headerSearch = (className: string) => (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onOpenDirectory(searchQuery.trim() || undefined);
      }}
      className={`flex min-w-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#fafafa] p-1 pl-3 transition focus-within:border-[var(--mt-green-primary)] focus-within:ring-2 focus-within:ring-[var(--mt-green-primary)]/15 ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-[var(--mt-gray-600)]" aria-hidden="true" />
      <input
        type="search"
        aria-label="Rechercher un produit, une boutique ou une catégorie"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Boutique, produit, quartier…"
        className="min-h-9 min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--mt-gray-900)] outline-none placeholder:text-[#7b817d] sm:text-sm"
      />
      <button type="submit" aria-label="Rechercher" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mt-green-primary)] text-white transition hover:bg-[var(--mt-green-hover)]">
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5d9ca] bg-[var(--mt-surface)]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="MaTable, accueil" className="flex items-center gap-2.5 text-left">
            <img src="/brand-kit/monogram.svg" alt="" className="h-10 w-10 shrink-0" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-xl font-black leading-5 tracking-tight text-[var(--mt-green-deep)]">MaTable</span>
              <span className="mt-1 block whitespace-nowrap text-xs font-extrabold tracking-[0.09em] text-[#587067]">VOS COMMERCES, ICI.</span>
            </span>
          </Link>
        </div>
        {showSearch && headerSearch('hidden max-w-[320px] flex-1 2xl:flex')}

        <button
          ref={mobileMenuButtonRef}
          type="button"
          aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d9e7de] bg-[#f0f7f2] px-3 text-sm font-extrabold text-[var(--mt-green-deep)] shadow-sm transition hover:border-[#9bc5b0] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-hover)] xl:hidden"
        >
          <span className="flex">
              {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
          </span>
          <span>{mobileMenuOpen ? 'Fermer' : 'Menu'}</span>
        </button>

        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-3 xl:flex" aria-label="Navigation principale">
          {currentRole === 'storefront' && (
            <div className="mr-auto flex shrink-0 items-center gap-1">
              {publicNavigationLinks.map(({ to, label, icon: Icon, active }) => (
                <Link
                  key={label}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-bold transition hover:bg-[#f0f7f2] hover:text-[var(--mt-green-deep)] ${active ? 'bg-[#e9f5ee] text-[var(--mt-green-deep)]' : 'text-[#47534b]'}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />{label}
                </Link>
              ))}
            </div>
          )}
          {currentRole !== 'storefront' && currentRole !== 'admin' && (
            <Link to="/guide" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-bold text-[#47534b] transition hover:bg-[#f0f7f2] hover:text-[var(--mt-green-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-hover)] focus-visible:ring-offset-2">
              <BookOpen className="h-4 w-4" aria-hidden="true" />Guides
            </Link>
          )}
          {currentRole === 'merchant' && (
            <button onClick={() => onOpenDirectory()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e4d9ca] bg-white px-3.5 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[var(--mt-green-hover)] hover:text-[var(--mt-green-deep)]">
              <ShoppingBag className="h-3.5 w-3.5" /> Boutiques
            </button>
          )}
          {currentRole === 'admin' && (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d5e5df] bg-[#edf8f4] px-3.5 py-2 text-sm font-semibold text-[var(--mt-green-deep)]">
              <ShieldCheck className="h-3.5 w-3.5" /> Super-admin
            </span>
          )}
          {currentRole !== 'admin' && isMerchantPlansPage && (
            <Link to="/app/creer-boutique" className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#075f48] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--mt-green-hover)]">
              <Store className="h-4 w-4" aria-hidden="true" /> Créer ma boutique
            </Link>
          )}
          {currentRole !== 'admin' && customerUser && (
            <>
              <button onClick={onOpenCustomerAccount} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--mt-green-deep)] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--mt-green-hover)]">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> Mon compte
              </button>
              <button onClick={onLogoutCustomer} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#e4d9ca] bg-white px-3.5 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[var(--mt-green-hover)] hover:text-[var(--mt-green-deep)]">
                Déconnexion
              </button>
            </>
          )}
          {currentRole === 'storefront' && !customerUser && (
            <Link to="/connexion" className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border border-[#e4d9ca] bg-white px-4 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[var(--mt-green-hover)] hover:text-[var(--mt-green-deep)]">
              Connexion
            </Link>
          )}
        </nav>
        {showSearch && headerSearch('basis-full 2xl:hidden')}

        {mobileMenuOpen && (
          <nav
            id="mobile-navigation-menu"
            aria-label="Navigation mobile"
            className="basis-full origin-top overflow-hidden rounded-b-[1.5rem] border-x border-b border-[#e7ddcf] bg-[var(--mt-surface)] px-3 pb-4 pt-3 shadow-[0_22px_45px_-22px_rgba(15,77,61,0.45)] sm:px-5 xl:hidden"
          >
            <div className="mx-auto grid max-w-[1440px] gap-3">
              {currentRole === 'storefront' && (
                <div className="relative isolate overflow-hidden rounded-[1.15rem] bg-gradient-to-br from-[var(--mt-green-deep)] via-[var(--mt-green-hover)] to-[#36806a] p-4 text-white">
                  <span aria-hidden="true" className="absolute -right-6 -top-10 -z-10 h-32 w-32 rounded-full border-[18px] border-white/10" />
                  <span aria-hidden="true" className="absolute right-9 top-7 -z-10 h-12 w-12 rounded-full bg-[#efc781]/25 blur-xl" />
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[#f3dcae]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {isMerchantPlansPage ? 'Espace commerçant' : 'MaTable'}
                  </div>
                  <p className="mt-2 max-w-[18rem] text-lg font-black leading-tight">{isMerchantPlansPage ? 'Développez votre commerce, étape par étape.' : 'Votre prochain coup de cœur est tout près.'}</p>
                </div>
              )}
              {currentRole === 'storefront' && (
                <div className="grid gap-1 rounded-2xl bg-[var(--mt-gray-50)] p-1">
                  {publicNavigationLinks.map(({ to, label, icon: Icon, active }) => (
                    <Link
                      key={label}
                      to={to}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition hover:bg-white ${active ? 'bg-white text-[var(--mt-green-deep)]' : 'text-[#47534b]'}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />{label}
                    </Link>
                  ))}
                  <Link to="/guide" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#47534b] transition hover:bg-white">
                    <BookOpen className="h-4 w-4" aria-hidden="true" />Guide personnalisé
                  </Link>
                </div>
              )}
              {currentRole !== 'storefront' && currentRole !== 'admin' && (
                <Link to="/guide" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e4d9ca] bg-white px-3 text-sm font-semibold text-[#47534b]">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />Guide personnalisé
                </Link>
              )}
              {currentRole === 'merchant' && (
                <button onClick={() => { setMobileMenuOpen(false); onOpenDirectory(); }} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e4d9ca] bg-white px-3 text-left text-sm font-semibold text-[#332d2a]">
                  <ShoppingBag className="h-4 w-4" /> Boutiques
                </button>
              )}
              {currentRole === 'admin' && (
                <span className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d5e5df] bg-[#edf8f4] px-3 text-sm font-semibold text-[var(--mt-green-deep)]">
                  <ShieldCheck className="h-4 w-4" /> Super-admin
                </span>
              )}
              {customerUser && currentRole !== 'admin' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setMobileMenuOpen(false); onOpenCustomerAccount(); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-3 text-sm font-semibold text-white">
                    <ShoppingBag className="h-4 w-4" /> Mon compte
                  </button>
                  <button onClick={() => { setMobileMenuOpen(false); onLogoutCustomer(); }} className="flex min-h-11 items-center justify-center rounded-xl border border-[#e4d9ca] bg-white px-3 text-sm font-semibold text-[#332d2a]">
                    Déconnexion
                  </button>
                </div>
              )}
              {!customerUser && currentRole === 'storefront' && (
                <Link to="/connexion" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center justify-center rounded-xl border border-[#e4d9ca] bg-white px-3 text-sm font-semibold text-[#332d2a] transition hover:border-[var(--mt-green-hover)]">
                  Connexion client
                </Link>
              )}
              {currentRole !== 'admin' && (
                <Link
                  to={isMerchantPlansPage ? '/app/creer-boutique' : '/commercants'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#f1c77f] via-[#f5d99e] to-[#f0c377] px-4 text-left text-sm font-black text-[#3e2a16] shadow-[0_8px_18px_rgba(150,94,34,0.15)] transition hover:shadow-[0_12px_24px_rgba(150,94,34,0.22)]"
                >
                  <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/55"><Store className="h-4 w-4" aria-hidden="true" /></span><span><span className="block">{isMerchantPlansPage ? 'Créer ma boutique' : 'Vendre sur MaTable'}</span><span className="mt-0.5 block text-xs font-semibold text-[#654a2e]">{isMerchantPlansPage ? 'Démarrer mon inscription' : 'Découvrir l’espace commerçant'}</span></span></span>
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </nav>
          )}
      </div>
      {location.pathname === '/' && currentRole === 'storefront' && (
        <nav aria-label="Catégories de produits" className="hidden border-t border-[#f0ebe2] bg-white/80 xl:block">
          <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-8 py-1.5">
            <button type="button" onClick={() => onOpenDirectory()} className="mr-2 inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--mt-green-primary)] px-4 text-xs font-bold text-white transition hover:bg-[var(--mt-green-hover)]">
              <Store className="h-3.5 w-3.5" aria-hidden="true" /> Toutes les catégories
            </button>
            {SHOP_CATEGORIES.filter((category) => category !== 'other').map((category) => (
              <button key={category} type="button" onClick={() => onOpenDirectory(getCategoryDefaults(category).label)} className="min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-[#47534b] transition hover:bg-[#f0f7f2] hover:text-[var(--mt-green-deep)]">
                {getCategoryDefaults(category).label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
};
