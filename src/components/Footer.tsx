import React from 'react';
import { ArrowUpRight, MessageCircle } from 'lucide-react';

interface FooterProps {
  compact?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`${compact ? 'mt-6 border-t border-[#e5d9ca] bg-[#fffdf9]' : 'border-t border-[#e5d9ca] bg-[#fffdf9]'}`}>
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-md">
        <a href="/" className="text-xl font-black tracking-tight text-[#211712]">MaTable<span className="text-[#1D6B57]">.ci</span></a>
        <p className="mt-2 text-sm leading-6 text-[#625b54]">Des boutiques locales, des produits vrais et une commande simple.</p>
      </div>

      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#4a3a30]" aria-label="Aide et informations">
        <a href="/faq" className="transition hover:text-[#0f4d3d]">Questions fréquentes</a>
        <a href="/mentions-legales" className="transition hover:text-[#0f4d3d]">Mentions légales</a>
        <a href="/confidentialite" className="transition hover:text-[#0f4d3d]">Confidentialité</a>
        <a href="/cgu" className="transition hover:text-[#0f4d3d]">CGU</a>
        <a href="/cookies" className="transition hover:text-[#0f4d3d]">Cookies</a>
      </nav>

      <a href="/" className="inline-flex items-center gap-2 rounded-full border border-[#e5d9ca] bg-white px-3.5 py-2 text-sm font-bold text-[#0f4d3d] transition hover:border-[#1d6b57]">
        <MessageCircle className="h-4 w-4" /> Découvrir les boutiques <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
    <div className="border-t border-[#f0e7df] bg-[#f9f5f1] px-5 py-3 text-center text-xs text-[#625b54]">© {new Date().getFullYear()} MaTable.ci · Commerce local en Côte d’Ivoire</div>
  </footer>
);
