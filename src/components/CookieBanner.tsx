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

export const saveCookiePreferences = (analyticsEnabled: boolean): boolean => {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ essential: true, analytics: analyticsEnabled }));
    window.localStorage.setItem(CONSENT_KEY, analyticsEnabled ? 'accepted' : 'refused');
    window.dispatchEvent(new Event('matable-cookie-preferences-updated'));
    return true;
  } catch {
    return false;
  }
};

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncVisibility = () => {
      try {
        const prefsRaw = window.localStorage.getItem(PREFS_KEY);
        const hasUserChoice = Boolean(prefsRaw) || Boolean(window.localStorage.getItem(CONSENT_KEY));
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
    <aside className="cookie-banner" role="dialog" aria-label="Préférences de cookies">
      <div className="cookie-banner-copy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#047857]" aria-hidden="true" />
        <p>
          Cookies essentiels actifs. Autorisez-vous l’analyse d’audience facultative ?
          <a href="/cookies"> Personnaliser</a>
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose(false)} className="cookie-button cookie-button-secondary">Refuser tout</button>
        <button type="button" onClick={() => choose(true)} className="cookie-button cookie-button-primary">Accepter tout</button>
      </div>
    </aside>
  );
};