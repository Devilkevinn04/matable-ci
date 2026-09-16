import React from 'react';
import { Store, ShieldCheck, ShoppingBag, ChevronDown, ArrowLeft } from 'lucide-react';

interface NavigationProps {
  currentRole: 'storefront' | 'merchant' | 'admin';
  onChangeRole: (role: 'storefront' | 'merchant' | 'admin') => void;
  onOpenDirectory: () => void;
  isDirectory?: boolean;
  isLegalPage?: boolean;
  selectedShopSlug: string;
  onSelectShopSlug: (slug: string) => void;
  availableShops: { slug: string; name: string; category?: string }[];
}

export const Navigation: React.FC<NavigationProps> = ({
  currentRole,
  onChangeRole,
  selectedShopSlug,
  onSelectShopSlug,
  availableShops,
  onOpenDirectory,
  isDirectory = false,
  isLegalPage = false,
}) => {
  return (
    <header className="sticky top-0 z-50 border-b border-[#ded8ce] bg-[#fffdf9]/95 backdrop-blur-xl">
      <div className="app-nav-inner max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="app-nav-brand flex items-center gap-3">
          <div className="brand-mark brand-mark-header">M</div>
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-[#211712]">MaTable<span className="text-[#1D6B57]">.ci</span></span>
              </div>
              <div className="text-[10px] text-[#4a3a30] flex items-center gap-1.5">
                <span>🇨🇮</span>
                <span>Côte d’Ivoire</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="app-nav-actions flex items-center gap-2 flex-wrap">
          {currentRole === 'storefront' && !isDirectory && (
            <button onClick={onOpenDirectory} className="nav-pill nav-pill-muted">
              <ArrowLeft className="w-3.5 h-3.5" /> Annuaire
            </button>
          )}
          {currentRole === 'merchant' && (
            <button onClick={onOpenDirectory} className="nav-pill nav-pill-muted">
              <ShoppingBag className="w-3.5 h-3.5" /> Boutiques
            </button>
          )}
          {currentRole === 'admin' && (
            <span className="nav-pill nav-pill-strong">
              <ShieldCheck className="w-3.5 h-3.5" /> Super-admin
            </span>
          )}
          {currentRole !== 'admin' && (
            <button onClick={() => onChangeRole('merchant')} className="nav-pill nav-pill-muted">
              <Store className="w-3.5 h-3.5" /> Espace propriétaire
            </button>
          )}
        </nav>

        {currentRole === 'storefront' && !isDirectory && !isLegalPage && (
          <div className="app-nav-selector flex items-center gap-2">
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold">Boutique</span>
            <div className="relative">
              <select
                id="shop-selector-dropdown"
                value={selectedShopSlug}
                onChange={(e) => onSelectShopSlug(e.target.value)}
                className="appearance-none rounded-xl border-[2px] border-[#211712] bg-[#fffaf2] px-3 py-2 pr-8 text-xs font-bold text-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)] outline-none focus:border-[#1b3a63]"
              >
                {!availableShops.some(shop => shop.slug === selectedShopSlug) && (
                  <option value={selectedShopSlug}>Boutique en cours de chargement</option>
                )}
                {availableShops.map(s => {
                  const prefix = s.category === 'food' ? '🍲 ' : s.category === 'fashion' ? '👗 ' : '';
                  return (
                    <option key={s.slug} value={s.slug} className="text-slate-900">
                      {prefix}{s.name}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
