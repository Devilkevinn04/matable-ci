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
