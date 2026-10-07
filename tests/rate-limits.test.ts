import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  clearLoginAttempts,
  createPublicRateLimitMiddleware,
  getCustomerLoginLockSeconds,
  isLoginRateLimited,
  recordCustomerLoginFailure,
} from '../server/services/rateLimits.ts';

test('login attempt limits are persistent and can be cleared after authentication', async () => {
  const key = `rate-limit-test:${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(await isLoginRateLimited(key), false);
  }
  assert.equal(await isLoginRateLimited(key), true);

  await clearLoginAttempts(key);
  assert.equal(await isLoginRateLimited(key), false);
  await clearLoginAttempts(key);
});

test('customer login failures persist the lock across service calls', async () => {
  const key = `customer-rate-limit-test:${randomUUID()}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await recordCustomerLoginFailure(key);
  }

  assert.ok((await getCustomerLoginLockSeconds(key)) > 0);
  assert.equal(await recordCustomerLoginFailure(key), 6);
  await clearLoginAttempts(key, 'customer-login');
  assert.equal(await getCustomerLoginLockSeconds(key), 0);
});

test('public request middleware returns 429 after the shared limit is exceeded', async () => {
  const app = express();
  const route = `/rate-limit/${randomUUID()}`;
  app.get(route, createPublicRateLimitMiddleware((req) => req.ip || 'unknown')(1), (_req, res) => {
    res.status(200).json({ success: true });
  });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}${route}`;
    assert.equal((await fetch(url)).status, 200);
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
