import React from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FooterProps {
  compact?: boolean;
}

const linkClassName = 'footer-link inline-flex min-h-8 w-fit items-center text-[13px] text-white/70 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-orange-soft)] sm:min-h-9 sm:text-sm';

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`${compact ? 'mt-4' : ''} relative overflow-hidden border-t border-white/10 bg-[var(--mt-green-deep)] text-white`}>
    <div className={`mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-10 ${compact ? 'py-6 sm:py-7' : 'py-8 sm:py-10'}`}>
      <section className="mb-7 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[.045] p-4 sm:mb-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="max-w-xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--mt-orange-soft)]">Vous êtes commerçant ?</p>
          <h2 className="mt-1 text-lg font-extrabold leading-snug text-white sm:text-xl">Faites découvrir votre boutique sur MaTable.</h2>
          <p className="mt-1 text-sm leading-5 text-white/70">Présentez vos produits et échangez directement avec vos clients.</p>
        </div>
        <Link to="/commercants" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-[var(--mt-green-deep)] transition-colors hover:bg-[#fff0df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-orange-soft)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mt-green-deep)] sm:w-auto">
          Présenter ma boutique
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:gap-x-8 lg:grid-cols-4 md:gap-8">
        <section aria-labelledby="footer-brand-title" className="col-span-2 max-w-sm md:col-span-1">
          <Link to="/" aria-label="MaTable, accueil" className="inline-flex max-w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-orange-soft)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--mt-green-deep)]">
            <img id="footer-brand-title" src="/brand-kit/logo-reversed.svg" alt="MaTable — Vos commerces, ici" className="h-auto w-40 max-w-full sm:w-48" />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-5 text-white/70">
            Les boutiques, les produits et les talents de Côte d’Ivoire, réunis au même endroit.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--mt-orange-soft)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Le commerce local, partout en Côte d’Ivoire
          </p>
        </section>

        <nav className="contents" aria-label="Découvrir MaTable">
          <section aria-labelledby="footer-discover-title">
            <h2 id="footer-discover-title" className="text-sm font-bold text-white">Découvrir</h2>
            <ul className="mt-2 flex list-none flex-col gap-0.5 p-0">
              <li><Link to="/boutiques" className={linkClassName}>Boutiques</Link></li>
              <li><Link to="/promotions" className={linkClassName}>Promotions</Link></li>
              <li><Link to="/comment-ca-marche" className={linkClassName}>Comment ça marche</Link></li>
              <li><Link to="/faq" className={linkClassName}>Questions fréquentes</Link></li>
            </ul>
          </section>
        </nav>

        <nav className="contents" aria-label="Espace commerçant">
          <section aria-labelledby="footer-merchants-title">
            <h2 id="footer-merchants-title" className="text-sm font-bold text-white">Commerçants</h2>
            <ul className="mt-2 flex list-none flex-col gap-0.5 p-0">
              <li><Link to="/commercants" className={linkClassName}>Espace commerçant</Link></li>
              <li><Link to="/guide" className={linkClassName}>Guide personnalisé</Link></li>
            </ul>
          </section>
        </nav>

        <nav className="col-span-2 md:col-span-1" aria-label="Informations légales">
          <h2 id="footer-legal-title" className="text-sm font-bold text-white">Informations</h2>
          <ul className="mt-2 grid list-none grid-cols-2 gap-x-3 gap-y-0.5 p-0 md:grid-cols-1">
            <li><Link to="/mentions-legales" className={linkClassName}>Mentions légales</Link></li>
            <li><Link to="/confidentialite" className={linkClassName}>Confidentialité</Link></li>
            <li><Link to="/cgu" className={linkClassName}>Conditions d’utilisation</Link></li>
            <li><Link to="/cookies" className={linkClassName}>Cookies</Link></li>
          </ul>
        </nav>
      </div>

      <div className="mt-6 flex flex-col gap-1.5 border-t border-white/15 pt-4 text-xs leading-5 text-white/60 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} MaTable · Commerce local en Côte d’Ivoire</p>
        <p>Fait pour rapprocher les commerces et leurs clients.</p>
      </div>
    </div>
  </footer>
);
