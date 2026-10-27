import React from 'react';
import { ArrowUpRight, MapPin, Store } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FooterProps {
  compact?: boolean;
}

const linkClassName = 'w-fit text-sm text-white/75 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0ba80]';

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`${compact ? 'mt-6' : ''} relative isolate overflow-hidden overflow-x-clip border-t border-[#164d3b] bg-[#064e3b] text-white`}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute -right-28 -top-40 h-96 w-96 rounded-full border border-white/[.08] sm:right-[8%]" />
      <div className="absolute -bottom-48 -left-28 h-96 w-96 rounded-full border border-[#f0ba80]/10" />
    </div>

    <div className={`relative z-10 mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10 ${compact ? 'py-7 sm:py-8' : 'py-9 sm:py-12'}`}>
      <div className="grid gap-9 lg:grid-cols-[1.05fr_1.4fr] lg:gap-16">
        <section aria-labelledby="footer-brand-title" className="max-w-md">
          <Link to="/" aria-label="MaTable.ci, accueil" className="inline-flex max-w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0ba80] focus-visible:ring-offset-4 focus-visible:ring-offset-[#064e3b]">
            <img id="footer-brand-title" src="/brand-kit/logo-reversed.svg" alt="MaTable.ci — Vos commerces, ici" className="h-auto w-[250px] max-w-full" />
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
            Les boutiques, les produits et les talents de Côte d’Ivoire, réunis au même endroit.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#f0ba80]">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Le commerce local, partout en Côte d’Ivoire
          </p>
        </section>

        <nav className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-x-8" aria-label="Navigation et informations">
          <section aria-labelledby="footer-discover-title">
            <h2 id="footer-discover-title" className="text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]">Découvrir</h2>
            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              <li><Link to="/boutiques" className={linkClassName}>Boutiques</Link></li>
              <li><Link to="/promotions" className={linkClassName}>Promotions</Link></li>
              <li><Link to="/comment-ca-marche" className={linkClassName}>Comment ça marche</Link></li>
              <li><Link to="/faq" className={linkClassName}>Questions fréquentes</Link></li>
            </ul>
          </section>

          <section aria-labelledby="footer-merchants-title">
            <h2 id="footer-merchants-title" className="text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]">Pour les commerçants</h2>
            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              <li><Link to="/commercants" className={linkClassName}>Espace commerçant</Link></li>
              <li><Link to="/guide" className={linkClassName}>Guide personnalisé</Link></li>
            </ul>
            <Link to="/commercants" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold text-[#065f46] transition hover:bg-[#fff0df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0ba80] focus-visible:ring-offset-2 focus-visible:ring-offset-[#064e3b]">
              <Store className="h-4 w-4" aria-hidden="true" />
              Présenter ma boutique
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="footer-legal-title" className="col-span-2 sm:col-span-1">
            <h2 id="footer-legal-title" className="text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]">Informations</h2>
            <ul className="mt-4 flex list-none flex-col gap-3 p-0">
              <li><Link to="/mentions-legales" className={linkClassName}>Mentions légales</Link></li>
              <li><Link to="/confidentialite" className={linkClassName}>Confidentialité</Link></li>
              <li><Link to="/cgu" className={linkClassName}>Conditions d’utilisation</Link></li>
              <li><Link to="/cookies" className={linkClassName}>Cookies</Link></li>
            </ul>
          </section>
        </nav>
      </div>

      <div className="mt-9 flex flex-col gap-2 border-t border-white/15 pt-5 text-xs text-white/65 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} MaTable.ci · Commerce local en Côte d’Ivoire</p>
        <p>Fait pour rapprocher les commerces et leurs clients.</p>
      </div>
    </div>
  </footer>
);
