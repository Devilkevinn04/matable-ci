import React, { useEffect, useState } from 'react';
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
        <p>On compte les visites pour améliorer MaTable.</p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose(true)} className="cookie-button cookie-button-primary">D’accord</button>
        <button type="button" onClick={() => choose(false)} className="cookie-button cookie-button-secondary">Non merci</button>
      </div>
    </section>
  );
};