import type { Express, NextFunction, Request, Response } from 'express';

const envValue = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
};

function getSecureStorageOrigin(endpoint: string | undefined): string | undefined {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function getStorageConnectSources(): string[] {
  const sharedEndpoint = envValue(
    'R2_ENDPOINT',
    'CLOUDFLARE_R2_ENDPOINT',
    'AWS_S3_ENDPOINT',
    'AWS_ENDPOINT_URL_S3',
  );
  const publicStorageConfigured = Boolean(
    envValue('R2_BUCKET', 'CLOUDFLARE_R2_BUCKET', 'AWS_S3_BUCKET', 'S3_BUCKET')
    && envValue('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID')
    && envValue('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY')
    && envValue('R2_PUBLIC_BASE_URL', 'CLOUDFLARE_R2_PUBLIC_URL', 'R2_PUBLIC_URL'),
  );
  const publicEndpoint = sharedEndpoint || (publicStorageConfigured ? 'https://r2.cloudflarestorage.com' : undefined);
  const privateEndpoint = envValue('R2_PRIVATE_ENDPOINT') || sharedEndpoint;
  const privateStorageConfigured = Boolean(
    envValue('R2_PRIVATE_BUCKET')
    && envValue('R2_PRIVATE_ACCESS_KEY_ID')
    && envValue('R2_PRIVATE_SECRET_ACCESS_KEY')
    && privateEndpoint,
  );

  return [...new Set([
    getSecureStorageOrigin(publicEndpoint),
    privateStorageConfigured ? getSecureStorageOrigin(privateEndpoint) : undefined,
  ].filter((origin): origin is string => Boolean(origin)))];
}

export function applySecurityHeaders(app: Express) {
  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        'form-action \'self\' https://wa.me https://api.whatsapp.com',
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "script-src 'self'",
        "worker-src 'self' blob:",
        `connect-src 'self' ${getStorageConnectSources().join(' ')}`.trim(),
        'upgrade-insecure-requests',
      ].join('; '));
    }

    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    if (req.path === '/app' && typeof req.query.access === 'string') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }

    next();
  });
}