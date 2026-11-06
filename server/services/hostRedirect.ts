/**
 * Builds the HTTPS URL used when a request arrives over HTTP. The configured
 * public origin wins so a forged Host header cannot redirect visitors elsewhere.
 */
export function getSecureRedirectUrl(input: {
  appUrl: string | undefined;
  host: string | undefined;
  originalUrl: string;
}): string {
  const configured = String(input.appUrl || '').trim().replace(/\/$/, '');
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === 'https:') return `${parsed.origin}${input.originalUrl}`;
  } catch {
    // Fall back to the request host below.
  }
  return `https://${String(input.host || '').trim()}${input.originalUrl}`;
}

/**
 * Visitors who reach the Render host (old links, TikTok bio) move to the public domain.
 * Only page views are redirected: API calls, webhooks, media and the health check keep
 * working on the Render host so providers configured with it are not broken.
 */
export function getPublicDomainRedirect(input: {
  nodeEnv: string | undefined;
  appUrl: string | undefined;
  host: string | undefined;
  method: string;
  path: string;
  originalUrl: string;
}): string | null {
  const publicOrigin = String(input.appUrl || '').trim().replace(/\/$/, '');
  const host = String(input.host || '').toLowerCase();
  if (input.nodeEnv !== 'production' || !/^https:\/\//.test(publicOrigin)) return null;
  if (!host.endsWith('.onrender.com') || publicOrigin.toLowerCase().includes(host)) return null;
  if (input.method !== 'GET' && input.method !== 'HEAD') return null;
  if (/^\/(api|media|health)(\/|$)/.test(input.path)) return null;
  return `${publicOrigin}${input.originalUrl}`;
}
