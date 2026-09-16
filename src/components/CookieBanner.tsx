import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const CONSENT_KEY = 'matable_cookie_consent';

export const hasAnalyticsConsent = (): boolean => {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
};

export const CookieBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(CONSENT_KEY));
    } catch {
      setVisible(false);
    }
  }, []);

  const choose = (value: 'accepted' | 'refused') => {
    window.localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="cookie-banner" role="dialog" aria-label="Préférences de cookies">
      <div className="cookie-banner-copy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[#176b55]" aria-hidden="true" />
        <p>
          Nous utilisons une mesure d’audience anonymisée pour améliorer les vitrines. Les cookies essentiels restent actifs.
          <a href="/cookies"> En savoir plus</a>
        </p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" onClick={() => choose('refused')} className="cookie-button cookie-button-secondary">Refuser</button>
        <button type="button" onClick={() => choose('accepted')} className="cookie-button cookie-button-primary">Accepter</button>
      </div>
    </aside>
  );
};