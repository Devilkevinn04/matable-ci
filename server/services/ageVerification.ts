import { createHmac, timingSafeEqual } from 'node:crypto';
import { isAtLeastAge } from '../../src/utils/ageRestrictedProducts.ts';

const AGE_VERIFICATION_TOKEN_LIFETIME_MS = 30 * 60 * 1000;

function getAgeVerificationSecret(): string {
  const secret = String(process.env.AGE_VERIFICATION_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AGE_VERIFICATION_SECRET is required for age verification.');
  }
  return 'local-only-age-verification-secret';
}

export function issueAgeVerificationToken(birthDate: unknown, shopId: number, now = Date.now()): string | null {
  if (typeof birthDate !== 'string' || !isAtLeastAge(birthDate, 18, new Date(now))) return null;
  const payload = Buffer.from(JSON.stringify({
    purpose: 'adult-catalog',
    shopId,
    expiresAt: now + AGE_VERIFICATION_TOKEN_LIFETIME_MS,
  })).toString('base64url');
  const signature = createHmac('sha256', getAgeVerificationSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function isAgeVerificationTokenValid(token: unknown, shopId: number, now = Date.now()): boolean {
  if (typeof token !== 'string' || token.length > 512) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;

  const expected = createHmac('sha256', getAgeVerificationSecret()).update(payload).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      purpose?: unknown;
      shopId?: unknown;
      expiresAt?: unknown;
    };
    return claims.purpose === 'adult-catalog'
      && claims.shopId === shopId
      && typeof claims.expiresAt === 'number'
      && Number.isSafeInteger(claims.expiresAt)
      && claims.expiresAt > now;
  } catch {
    return false;
  }
}
