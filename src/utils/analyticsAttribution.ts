export const ANALYTICS_CAMPAIGN_SESSION_KEY = 'matable_analytics_campaign';

export function normalizeAnalyticsCampaign(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const campaign = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(campaign) ? campaign : null;
}

export function getAnalyticsCampaignFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return normalizeAnalyticsCampaign(params.get('src') || params.get('utm_source') || params.get('utm_campaign'));
}

export function getStoredAnalyticsCampaign(): string | null {
  try {
    return normalizeAnalyticsCampaign(window.sessionStorage.getItem(ANALYTICS_CAMPAIGN_SESSION_KEY));
  } catch {
    return null;
  }
}
