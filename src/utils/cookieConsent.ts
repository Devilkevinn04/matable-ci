export const COOKIE_CONSENT_KEY = 'matable_cookie_consent';
export const COOKIE_PREFERENCES_KEY = 'matable_cookie_preferences';

export const hasAnalyticsConsent = (): boolean => {
  try {
    const prefsRaw = window.localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (prefsRaw) {
      try {
        const prefs = JSON.parse(prefsRaw);
        return Boolean(prefs.analytics);
      } catch {
        // Ignore malformed preferences and fall back to the legacy value.
      }
    }
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === 'accepted';
  } catch {
    return false;
  }
};

export const saveCookiePreferences = (analyticsEnabled: boolean): boolean => {
  try {
    window.localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({ essential: true, analytics: analyticsEnabled }));
    window.localStorage.setItem(COOKIE_CONSENT_KEY, analyticsEnabled ? 'accepted' : 'refused');
    window.dispatchEvent(new Event('matable-cookie-preferences-updated'));
    return true;
  } catch {
    return false;
  }
};
