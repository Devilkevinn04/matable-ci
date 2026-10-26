import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';

const hashSessionToken = (token: string) =>
  createHash('sha256').update(`matable-session:${token}`).digest('hex');

function makeRequest(cookie: string): Request {
  return {
    headers: {
      cookie,
      'user-agent': 'session-lifecycle-test',
      'accept-language': 'fr-CI',
    },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    originalUrl: '/api/auth/session',
    params: {},
  } as Request;
}

function makeResponse(): Response {
  const headers = new Map<string, string | string[]>();
  return {
    setHeader(name: string, value: string | string[]) {
      headers.set(name, value);
      return this;
    },
  } as Response;
}

test('customer, merchant, and admin sessions renew while active and reject expired records', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabasePath = process.env.MATABLE_DB_PATH;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-session-lifecycle-'));
  process.env.NODE_ENV = 'test';
  process.env.MATABLE_DB_PATH = path.join(directory, 'sessions.db');

  let database: typeof import('../db.ts') | undefined;
  try {
    database = await import('../db.ts');
    await database.initializeDatabase();
    const { createAuthSessionHelpers, buildSessionFingerprint } = await import('../server/services/authSessions.ts');
    const {
      saveAdminSessionRecord,
      saveCustomerSessionRecord,
      saveMerchantSessionRecord,
    } = await import('../server/repositories/sessions.ts');
    const refreshSubscriptionState = async () => undefined;
    const userResult = await database.dbRun(
      `INSERT INTO users (name, first_name, last_name, phone, email, password_hash, created_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      ['Session Test', 'Session', 'Test', '+2250700000000', `session-${randomUUID()}@example.ci`, 'test-hash', new Date().toISOString()],
    );
    const userId = Number(userResult.lastInsertRowid);
    const renewalWindow = 7 * 60 * 60 * 1000;

    const customerToken = randomUUID();
    const customerRequest = makeRequest(`matable_customer_session=${customerToken}`);
    const customerFingerprint = buildSessionFingerprint(customerRequest);
    await saveCustomerSessionRecord(customerToken, {
      userId,
      expiresAt: Date.now() + 60_000,
      fingerprint: customerFingerprint,
    });
    const customerHelpers = createAuthSessionHelpers({ shops: [], refreshSubscriptionState });
    const customerState = await customerHelpers.getCustomerSessionState(customerRequest, makeResponse());
    assert.equal(customerState.authenticated, true);
    const customerTokenHash = hashSessionToken(customerToken);
    const renewedCustomerSession = await database.dbGet<{ expires_at: number }>(
      'SELECT expires_at FROM user_sessions WHERE token = ?',
      [customerTokenHash],
    );
    assert.ok(Number(renewedCustomerSession?.expires_at) > Date.now() + renewalWindow);
    await database.dbRun('UPDATE user_sessions SET expires_at = ? WHERE token = ?', [Date.now() - 1, customerTokenHash]);
    const expiredCustomerState = await createAuthSessionHelpers({ shops: [], refreshSubscriptionState })
      .getCustomerSessionState(customerRequest);
    assert.equal(expiredCustomerState.authenticated, false);
    assert.equal(await database.dbGet('SELECT token FROM user_sessions WHERE token = ?', [customerTokenHash]), undefined);

    const merchantToken = randomUUID();
    const merchantRequest = makeRequest(`matable_session=${merchantToken}`);
    await saveMerchantSessionRecord(merchantToken, {
      shopId: 73,
      expiresAt: Date.now() + 60_000,
      fingerprint: buildSessionFingerprint(merchantRequest),
    });
    const merchantHelpers = createAuthSessionHelpers({ shops: [], refreshSubscriptionState });
    const merchantState = await merchantHelpers.getSessionStateForResponse(merchantRequest, makeResponse());
    assert.equal(merchantState.authenticated, true);
    const merchantTokenHash = hashSessionToken(merchantToken);
    const renewedMerchantSession = await database.dbGet<{ expires_at: number }>(
      'SELECT expires_at FROM merchant_sessions WHERE token = ?',
      [merchantTokenHash],
    );
    assert.ok(Number(renewedMerchantSession?.expires_at) > Date.now() + renewalWindow);
    await database.dbRun('UPDATE merchant_sessions SET expires_at = ? WHERE token = ?', [Date.now() - 1, merchantTokenHash]);
    const expiredMerchantState = await createAuthSessionHelpers({ shops: [], refreshSubscriptionState })
      .getSessionStateForResponse(merchantRequest);
    assert.equal(expiredMerchantState.authenticated, false);
    assert.equal(await database.dbGet('SELECT token FROM merchant_sessions WHERE token = ?', [merchantTokenHash]), undefined);

    const adminToken = randomUUID();
    const adminRequest = makeRequest(`matable_admin_session=${adminToken}`);
    await saveAdminSessionRecord(adminToken, {
      expiresAt: Date.now() + 60_000,
      fingerprint: buildSessionFingerprint(adminRequest),
      role: 'verification_admin',
    });
    const adminHelpers = createAuthSessionHelpers({ shops: [], refreshSubscriptionState });
    const adminState = await adminHelpers.getSessionStateForResponse(adminRequest, makeResponse());
    assert.equal(adminState.authenticated, true);
    assert.equal(adminState.role, 'verification_admin');
    const adminTokenHash = hashSessionToken(adminToken);
    const renewedAdminSession = await database.dbGet<{ expires_at: number }>(
      'SELECT expires_at FROM admin_sessions WHERE token = ?',
      [adminTokenHash],
    );
    assert.ok(Number(renewedAdminSession?.expires_at) > Date.now() + renewalWindow);
    await database.dbRun('UPDATE admin_sessions SET expires_at = ? WHERE token = ?', [Date.now() - 1, adminTokenHash]);
    const expiredAdminState = await createAuthSessionHelpers({ shops: [], refreshSubscriptionState })
      .getSessionStateForResponse(adminRequest);
    assert.equal(expiredAdminState.authenticated, false);
    assert.equal(await database.dbGet('SELECT token FROM admin_sessions WHERE token = ?', [adminTokenHash]), undefined);
  } finally {
    await database?.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabasePath === undefined) delete process.env.MATABLE_DB_PATH;
    else process.env.MATABLE_DB_PATH = previousDatabasePath;
  }
});
