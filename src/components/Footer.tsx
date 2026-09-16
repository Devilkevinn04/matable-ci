import React from 'react';
import { ArrowUpRight, MessageCircle } from 'lucide-react';

interface FooterProps {
  compact?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ compact = false }) => (
  <footer className={`site-footer${compact ? ' site-footer-compact' : ''}`}>
    <div className="site-footer-inner">
      <div>
        <a href="/" className="site-footer-brand">MaTable<span>.ci</span></a>
        <p>Des boutiques locales, des produits vrais et une commande simple.</p>
      </div>
      <nav className="site-footer-links" aria-label="Liens juridiques">
        <a href="/mentions-legales">Mentions légales</a>
        <a href="/confidentialite">Confidentialité</a>
        <a href="/cgu">CGU</a>
        <a href="/cookies">Cookies</a>
      </nav>
      <a className="site-footer-contact" href="/">
        <MessageCircle className="h-4 w-4" /> Découvrir les boutiques <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
    <div className="site-footer-bottom">© {new Date().getFullYear()} MaTable.ci · Commerce local en Côte d’Ivoire</div>
  </footer>
);
