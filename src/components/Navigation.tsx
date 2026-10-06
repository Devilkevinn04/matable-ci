import React from 'react';
import { Store, ShieldCheck, ShoppingBag, ArrowLeft } from 'lucide-react';
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
  return (
    <header className="sticky top-0 z-50 border-b border-[#e5d9ca] bg-[#fffdf9]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0f4d3d] text-base font-black text-white shadow-sm">M</div>
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black tracking-tight text-[#211712]">MaTable<span className="text-[#1D6B57]">.ci</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#4a3a30]">
                <span>🇨🇮</span>
                <span>Côte d’Ivoire</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {currentRole === 'storefront' && !isDirectory && (
            <button onClick={onOpenDirectory} className="inline-flex items-center gap-1.5 rounded-full border border-[#e4d9ca] bg-white px-3 py-2 text-[11px] font-bold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
              <ArrowLeft className="h-3.5 w-3.5" /> Annuaire
            </button>
          )}
          {currentRole === 'merchant' && (
            <button onClick={onOpenDirectory} className="inline-flex items-center gap-1.5 rounded-full border border-[#e4d9ca] bg-white px-3 py-2 text-[11px] font-bold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
              <ShoppingBag className="h-3.5 w-3.5" /> Boutiques
            </button>
          )}
          {currentRole === 'admin' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d5e5df] bg-[#edf8f4] px-3 py-2 text-[11px] font-bold text-[#0f4d3d]">
              <ShieldCheck className="h-3.5 w-3.5" /> Super-admin
            </span>
          )}
          {currentRole !== 'admin' && (
            <>
              {customerUser ? (
                <>
                  <button onClick={onOpenCustomerAccount} className="inline-flex items-center gap-1.5 rounded-full bg-[#0f4d3d] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#176b55]">
                    <ShoppingBag className="h-3.5 w-3.5" /> Mon compte
                  </button>
                  <button onClick={onLogoutCustomer} className="inline-flex items-center gap-1.5 rounded-full border border-[#e4d9ca] bg-white px-3 py-2 text-[11px] font-bold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
                    Déconnexion
                  </button>
                </>
              ) : null}
              <button onClick={() => onChangeRole('merchant')} className="inline-flex items-center gap-1.5 rounded-full border border-[#e4d9ca] bg-white px-3 py-2 text-[11px] font-bold text-[#332d2a] transition hover:border-[#1d6b57] hover:text-[#0f4d3d]">
                <Store className="h-3.5 w-3.5" /> Espace propriétaire
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
