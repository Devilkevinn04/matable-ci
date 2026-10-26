import React from 'react';
import { Link } from 'react-router-dom';

interface FooterProps {
  compact?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`${compact ? 'mt-6' : ''} border-t border-[#e5d9ca] bg-[#FFFFFF]`}>
    <div className="mx-auto grid max-w-[1184px] gap-4 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <Link to="/" className="font-display text-lg font-extrabold tracking-tight text-[#292d2a]">MaTable<span className="text-[#1D6B57]">.ci</span></Link>
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#47534b]" aria-label="Navigation et informations">
        <Link to="/boutiques" className="transition hover:text-[#065f46]">Boutiques</Link>
        <Link to="/comment-ca-marche" className="transition hover:text-[#065f46]">Comment ça marche</Link>
        <Link to="/commercants" className="transition hover:text-[#065f46]">Espace commerçant</Link>
        <Link to="/guide" className="transition hover:text-[#065f46]">Guide personnalisé</Link>
        <Link to="/faq" className="transition hover:text-[#065f46]">Questions fréquentes</Link>
        <Link to="/mentions-legales" className="transition hover:text-[#065f46]">Mentions légales</Link>
        <Link to="/confidentialite" className="transition hover:text-[#065f46]">Confidentialité</Link>
        <Link to="/cgu" className="transition hover:text-[#065f46]">CGU</Link>
        <Link to="/cookies" className="transition hover:text-[#065f46]">Cookies</Link>
      </nav>
      <p className="border-t border-[#f0e7df] pt-3 text-xs text-[#625b54] lg:col-span-2">© {new Date().getFullYear()} MaTable.ci · Commerce local en Côte d’Ivoire</p>
    </div>
  </footer>
);
