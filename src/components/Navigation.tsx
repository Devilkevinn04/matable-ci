import React from 'react';
import { Store, ShieldCheck, ShoppingBag, ArrowLeft } from 'lucide-react';

interface NavigationProps {
  currentRole: 'storefront' | 'merchant' | 'admin';
  onChangeRole: (role: 'storefront' | 'merchant' | 'admin') => void;
  onOpenDirectory: () => void;
  isDirectory?: boolean;
  isLegalPage?: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentRole,
  onChangeRole,
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

      </div>
    </header>
  );
};
