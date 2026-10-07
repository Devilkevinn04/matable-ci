import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { dbGet, dbRun } from '../../db.ts';

interface RateLimitRow {
  request_count: number;
  reset_at: number;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_REQUEST_WINDOW_MS = 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_PUBLIC_REQUESTS_PER_WINDOW = 60;

function hashKey(scope: string, key: string) {
  return createHash('sha256').update(`${scope}:${key}`).digest('hex');
}

async function incrementCounter(scope: string, key: string, windowMs: number, now = Date.now()) {
  await dbRun('DELETE FROM request_rate_limits WHERE reset_at <= ?', [now]);
  const row = await dbGet<RateLimitRow>(`INSERT INTO request_rate_limits (key_hash, request_count, reset_at)
    VALUES (?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      request_count = CASE WHEN request_rate_limits.reset_at <= ? THEN 1 ELSE request_rate_limits.request_count + 1 END,
      reset_at = CASE WHEN request_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE request_rate_limits.reset_at END
    RETURNING request_count, reset_at`, [
    hashKey(scope, key),
    now + windowMs,
    now,
    now,
  ]);
  if (!row) throw new Error('Unable to update shared rate-limit state.');
  return { count: Number(row.request_count), resetAt: Number(row.reset_at) };
}

export async function isLoginRateLimited(key: string) {
  return (await incrementCounter('login', key, LOGIN_WINDOW_MS)).count > MAX_LOGIN_ATTEMPTS;
}

export async function getCustomerLoginLockSeconds(key: string, now = Date.now()) {
  const row = await dbGet<RateLimitRow>('SELECT request_count, reset_at FROM request_rate_limits WHERE key_hash = ?', [hashKey('customer-login', key)]);
  if (!row || Number(row.reset_at) <= now) return 0;
  return Number(row.request_count) >= MAX_LOGIN_ATTEMPTS
    ? Math.ceil((Number(row.reset_at) - now) / 1000)
    : 0;
}

export async function recordCustomerLoginFailure(key: string) {
  return (await incrementCounter('customer-login', key, LOGIN_WINDOW_MS)).count;
}

export async function clearLoginAttempts(key: string, scope: 'login' | 'customer-login' = 'login') {
  await dbRun('DELETE FROM request_rate_limits WHERE key_hash = ?', [hashKey(scope, key)]);
}

export function createPublicRateLimitMiddleware(getClientAddress: (req: Request) => string) {
  return (limit = MAX_PUBLIC_REQUESTS_PER_WINDOW): RequestHandler => (req, res, next) => {
    const key = `${req.method}:${req.path}:${getClientAddress(req)}`;
    void incrementCounter('public-request', key, PUBLIC_REQUEST_WINDOW_MS)
      .then(({ count }) => {
        if (count > limit) {
          res.setHeader('Retry-After', '60');
          res.status(429).json({ error: 'Trop de requêtes. Réessayez dans une minute.' });
          return;
        }
        next();
      })
      .catch(next);
  };
}
