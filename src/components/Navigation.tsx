import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Store, ShieldCheck, ShoppingBag, ArrowLeft, Compass, CircleHelp, Newspaper, Menu, X, Sparkles, ArrowUpRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { CustomerUser } from './CustomerAuth';

interface NavigationProps {
  currentRole: 'storefront' | 'merchant' | 'admin';
  onChangeRole: (role: 'storefront' | 'merchant' | 'admin') => void;
  onOpenDirectory: () => void;
  isDirectory?: boolean;
  isLegalPage?: boolean;
  customerUser?: CustomerUser | null;
  onOpenCustomerAuth: () => void;
  onOpenCustomerAccount: () => void;
  onLogoutCustomer: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentRole,
  onChangeRole,
  onOpenDirectory,
  isDirectory = false,
  isLegalPage = false,
  customerUser = null,
  onOpenCustomerAuth,
  onOpenCustomerAccount,
  onLogoutCustomer,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);
  const menuVariants = {
    closed: {
      opacity: 0,
      y: -12,
      scale: 0.98,
      height: 0,
      transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.14, ease: 'easeIn' as const },
    },
    open: {
      opacity: 1,
      y: 0,
      scale: 1,
      height: 'auto',
      transition: prefersReducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 360, damping: 30, staggerChildren: 0.055, delayChildren: 0.06 },
    },
  };
  const menuItemVariants = {
    closed: { opacity: 0, y: -8 },
    open: { opacity: 1, y: 0, transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' as const } },
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5d9ca] bg-[#fffdf9]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-8 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="MaTable.ci, accueil" className="flex items-center gap-2.5 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f4d3d] font-black text-white">M</span>
            <span className="text-xl font-black tracking-tight text-[#211712]">MaTable<span className="text-[#1D6B57]">.ci</span></span>
          </Link>
        </div>

        <motion.button
          type="button"
          aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
          whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#d9e7de] bg-[#f0f7f2] px-3 text-sm font-extrabold text-[#0f4d3d] shadow-sm transition hover:border-[#9bc5b0] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] xl:hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={mobileMenuOpen ? 'close' : 'open'}
              initial={prefersReducedMotion ? false : { opacity: 0, rotate: -70, scale: 0.7 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, rotate: 70, scale: 0.7 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              className="flex"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </motion.span>
          </AnimatePresence>
          <span>{mobileMenuOpen ? 'Fermer' : 'Menu'}</span>
        </motion.button>

        <nav className="hidden min-w-0 flex-1 items-center justify-end gap-3 xl:flex" aria-label="Navigation principale">
          {isDirectory && (
            <div className="mr-auto flex shrink-0 items-center gap-1 rounded-full border border-[#e9e1d7] bg-[#f8f5ef] p-1">
              <Link to="/#actualites" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-bold text-[#31584c] transition hover:bg-white hover:text-[#0f4d3d] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2">
                <Newspaper className="h-4 w-4" aria-hidden="true" />Le fil du jour
              </Link>
              <Link to="/boutiques" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-bold text-[#31584c] transition hover:bg-white hover:text-[#0f4d3d] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2">
                <Compass className="h-4 w-4" aria-hidden="true" />Boutiques
              </Link>
              <Link to="/comment-ca-marche" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-bold text-[#31584c] transition hover:bg-white hover:text-[#0f4d3d] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2">
                <CircleHelp className="h-4 w-4" aria-hidden="true" />Comment ça marche
              </Link>
            </div>
          )}
          {currentRole === 'storefront' && !isDirectory && (
            <button onClick={onOpenDirectory} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e4d9ca] bg-white px-3.5 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
              <ArrowLeft className="h-3.5 w-3.5" /> Annuaire
            </button>
          )}
          {currentRole === 'merchant' && (
            <button onClick={onOpenDirectory} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#e4d9ca] bg-white px-3.5 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
              <ShoppingBag className="h-3.5 w-3.5" /> Boutiques
            </button>
          )}
          {currentRole === 'admin' && (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#d5e5df] bg-[#edf8f4] px-3.5 py-2 text-sm font-semibold text-[#0f4d3d]">
              <ShieldCheck className="h-3.5 w-3.5" /> Super-admin
            </span>
          )}
          {currentRole !== 'admin' && (
            <>
              {customerUser ? (
                <>
                  <button onClick={onOpenCustomerAccount} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0f4d3d] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#176b55]">
                    <ShoppingBag className="h-3.5 w-3.5" /> Mon compte
                  </button>
                  <button onClick={onLogoutCustomer} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#e4d9ca] bg-white px-3.5 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
                    Déconnexion
                  </button>
                </>
              ) : null}
              <button onClick={() => onChangeRole('merchant')} className="inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#e4d9ca] bg-white px-4 py-2 text-sm font-semibold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
                <Store className="h-4 w-4" /> Vendre sur MaTable
              </button>
            </>
          )}
        </nav>

        <AnimatePresence initial={false}>
          {mobileMenuOpen && (
          <motion.nav
            id="mobile-navigation-menu"
            aria-label="Navigation mobile"
            variants={menuVariants}
            initial="closed"
            animate="open"
            exit="closed"
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
            className="basis-full origin-top overflow-hidden rounded-b-[1.5rem] border-x border-b border-[#e7ddcf] bg-[#fffdf9] px-3 pb-4 pt-3 shadow-[0_22px_45px_-22px_rgba(15,77,61,0.45)] sm:px-5 xl:hidden"
          >
            <motion.div variants={menuVariants} className="mx-auto grid max-w-[1440px] gap-3">
              {isDirectory && (
                <motion.div variants={menuItemVariants} className="relative isolate overflow-hidden rounded-[1.15rem] bg-gradient-to-br from-[#0f4d3d] via-[#176b55] to-[#36806a] p-4 text-white">
                  <span aria-hidden="true" className="absolute -right-6 -top-10 -z-10 h-32 w-32 rounded-full border-[18px] border-white/10" />
                  <span aria-hidden="true" className="absolute right-9 top-7 -z-10 h-12 w-12 rounded-full bg-[#efc781]/25 blur-xl" />
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#f3dcae]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> MaTable, côté découverte
                  </div>
                  <p className="mt-2 max-w-[15rem] text-lg font-black leading-tight">Votre prochain coup de cœur est tout près.</p>
                </motion.div>
              )}
              {isDirectory && (
                <motion.div variants={menuItemVariants} className="grid gap-1 rounded-2xl bg-[#f7f3ee] p-1">
                  <Link to="/#actualites" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#31584c] hover:bg-white">
                    <Newspaper className="h-4 w-4" aria-hidden="true" />Le fil du jour
                  </Link>
                  <Link to="/boutiques" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#31584c] hover:bg-white">
                    <Compass className="h-4 w-4" aria-hidden="true" />Boutiques
                  </Link>
                  <Link to="/comment-ca-marche" onClick={() => setMobileMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#31584c] hover:bg-white">
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />Comment ça marche
                  </Link>
                </motion.div>
              )}
              {currentRole === 'storefront' && !isDirectory && (
                <motion.button variants={menuItemVariants} onClick={() => { setMobileMenuOpen(false); onOpenDirectory(); }} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e4d9ca] bg-white px-3 text-left text-sm font-semibold text-[#332d2a]">
                  <ArrowLeft className="h-4 w-4" /> Annuaire
                </motion.button>
              )}
              {currentRole === 'merchant' && (
                <motion.button variants={menuItemVariants} onClick={() => { setMobileMenuOpen(false); onOpenDirectory(); }} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#e4d9ca] bg-white px-3 text-left text-sm font-semibold text-[#332d2a]">
                  <ShoppingBag className="h-4 w-4" /> Boutiques
                </motion.button>
              )}
              {currentRole === 'admin' && (
                <motion.span variants={menuItemVariants} className="flex min-h-11 items-center gap-3 rounded-xl border border-[#d5e5df] bg-[#edf8f4] px-3 text-sm font-semibold text-[#0f4d3d]">
                  <ShieldCheck className="h-4 w-4" /> Super-admin
                </motion.span>
              )}
              {customerUser && currentRole !== 'admin' && (
                <motion.div variants={menuItemVariants} className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setMobileMenuOpen(false); onOpenCustomerAccount(); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0f4d3d] px-3 text-sm font-semibold text-white">
                    <ShoppingBag className="h-4 w-4" /> Mon compte
                  </button>
                  <button onClick={() => { setMobileMenuOpen(false); onLogoutCustomer(); }} className="flex min-h-11 items-center justify-center rounded-xl border border-[#e4d9ca] bg-white px-3 text-sm font-semibold text-[#332d2a]">
                    Déconnexion
                  </button>
                </motion.div>
              )}
              {currentRole !== 'admin' && (
                <motion.button variants={menuItemVariants} onClick={() => { setMobileMenuOpen(false); onChangeRole('merchant'); }} whileHover={prefersReducedMotion ? undefined : { y: -2 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }} className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#f1c77f] via-[#f5d99e] to-[#f0c377] px-4 text-left text-sm font-black text-[#3e2a16] shadow-[0_8px_18px_rgba(150,94,34,0.15)] transition hover:shadow-[0_12px_24px_rgba(150,94,34,0.22)]">
                  <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/55"><Store className="h-4 w-4" /></span><span><span className="block">Vendre sur MaTable</span><span className="mt-0.5 block text-[11px] font-semibold text-[#654a2e]">Faites rayonner votre boutique</span></span></span>
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                </motion.button>
              )}
            </motion.div>
          </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
