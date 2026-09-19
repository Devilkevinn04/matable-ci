import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const CONSENT_KEY = 'matable_cookie_consent';
const PREFS_KEY = 'matable_cookie_preferences';

export const hasAnalyticsConsent = (): boolean => {
  try {
    const prefsRaw = window.localStorage.getItem(PREFS_KEY);
    if (prefsRaw) {
      try {
        const prefs = JSON.parse(prefsRaw);
        return Boolean(prefs.analytics);
      } catch {
        // ignore invalid json and fall back to legacy value
      }
    }
    return window.localStorage.getItem(CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
};

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const prefsRaw = window.localStorage.getItem(PREFS_KEY);
      const hasUserChoice = Boolean(prefsRaw) || Boolean(window.localStorage.getItem(CONSENT_KEY));
      setVisible(!hasUserChoice);
    } catch {
      setVisible(false);
    }
  }, []);

  const persistPreferences = (analyticsEnabled: boolean) => {
    const preferences = {
      essential: true,
      analytics: analyticsEnabled,
      preferences: analyticsEnabled,
    };

    window.localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    window.localStorage.setItem(CONSENT_KEY, analyticsEnabled ? 'accepted' : 'refused');
  };

  const choose = (analyticsEnabled: boolean) => {
    persistPreferences(analyticsEnabled);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-banner" role="dialog" aria-label="Préférences de cookies">
      <div className="cookie-banner-copy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#176b55]" aria-hidden="true" />
        <p>
          MaTable.ci utilise des cookies essentiels au bon fonctionnement du site. Les cookies d’analyse anonymisée sont optionnels.
          Aucun cookie de paiement n’est utilisé. <a href="/cookies">Gérer mes cookies</a>
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose(false)} className="cookie-button cookie-button-secondary">Refuser tout</button>
        <button type="button" onClick={() => window.location.assign('/cookies')} className="cookie-button cookie-button-secondary">Personnaliser</button>
        <button type="button" onClick={() => choose(true)} className="cookie-button cookie-button-primary">Accepter tout</button>
      </div>
    </aside>
  );
};