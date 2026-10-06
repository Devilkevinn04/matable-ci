import React from 'react';

interface FooterProps {
  compact?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`${compact ? 'mt-6' : ''} border-t border-[#e5d9ca] bg-[#fffdf9]`}>
    <div className="mx-auto grid max-w-[1184px] gap-4 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <a href="/" className="font-display text-lg font-extrabold tracking-tight text-[#211712]">MaTable<span className="text-[#1D6B57]">.ci</span></a>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#4a3a30]" aria-label="Aide et informations">
        <a href="/faq" className="transition hover:text-[#0f4d3d]">Questions fréquentes</a>
        <a href="/mentions-legales" className="transition hover:text-[#0f4d3d]">Mentions légales</a>
        <a href="/confidentialite" className="transition hover:text-[#0f4d3d]">Confidentialité</a>
        <a href="/cgu" className="transition hover:text-[#0f4d3d]">CGU</a>
        <a href="/cookies" className="transition hover:text-[#0f4d3d]">Cookies</a>
      </nav>
      <p className="border-t border-[#f0e7df] pt-3 text-xs text-[#625b54] lg:col-span-2">© {new Date().getFullYear()} MaTable.ci · Commerce local en Côte d’Ivoire</p>
    </div>
  </footer>
);
