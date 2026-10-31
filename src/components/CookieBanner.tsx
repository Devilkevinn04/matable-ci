import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COOKIE_CONSENT_KEY, COOKIE_PREFERENCES_KEY, saveCookiePreferences } from '../utils/cookieConsent';

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncVisibility = () => {
      try {
        const prefsRaw = window.localStorage.getItem(COOKIE_PREFERENCES_KEY);
        const hasUserChoice = Boolean(prefsRaw) || Boolean(window.localStorage.getItem(COOKIE_CONSENT_KEY));
        setVisible(!hasUserChoice);
      } catch {
        setVisible(false);
      }
    };
    syncVisibility();
    window.addEventListener('matable-cookie-preferences-updated', syncVisibility);
    return () => window.removeEventListener('matable-cookie-preferences-updated', syncVisibility);
  }, []);

  const persistPreferences = (analyticsEnabled: boolean) => {
    saveCookiePreferences(analyticsEnabled);
  };

  const choose = (analyticsEnabled: boolean) => {
    persistPreferences(analyticsEnabled);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section className="cookie-banner" aria-label="Préférences de cookies">
      <div className="cookie-banner-copy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#047857]" aria-hidden="true" />
        <p>
          Cookies essentiels actifs. Autorisez-vous l’analyse d’audience facultative ?
          <Link to="/cookies"> Personnaliser</Link>
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose(false)} className="cookie-button cookie-button-secondary">Refuser tout</button>
        <button type="button" onClick={() => choose(true)} className="cookie-button cookie-button-primary">Accepter tout</button>
      </div>
    </section>
  );
};