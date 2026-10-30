import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createMerchantVerificationRouter } from '../server/routes/merchantVerification.ts';
import { resolveDriverWorkflowId } from '../server/services/didit.ts';

test('courier Didit workflow falls back to the merchant workflow when no dedicated workflow is set', () => {
  const merchantWorkflow = randomUUID();
  const driverWorkflow = randomUUID();

  assert.equal(resolveDriverWorkflowId(undefined, merchantWorkflow), merchantWorkflow);
  assert.equal(resolveDriverWorkflowId('', merchantWorkflow), merchantWorkflow);
  assert.equal(resolveDriverWorkflowId('   ', merchantWorkflow), merchantWorkflow);
  assert.equal(resolveDriverWorkflowId(driverWorkflow, merchantWorkflow), driverWorkflow);
  assert.equal(resolveDriverWorkflowId('not-a-uuid', merchantWorkflow), null);
  assert.equal(resolveDriverWorkflowId(undefined, undefined), null);
});

test('merchant session creation records consent and returns only Didit hosted verification URL', async () => {
  const previousEnvironment = {
    apiKey: process.env.DIDIT_API_KEY,
    workflowId: process.env.DIDIT_WORKFLOW_ID,
    appUrl: process.env.APP_URL,
    nodeEnv: process.env.NODE_ENV,
  };
  const sessionId = randomUUID();
  const workflowId = randomUUID();
  const apiKey = 'server-only-test-api-key';
  const webhookStatus: string[] = [];
  let storedParameters: unknown[] = [];
  let insertChanges = 1;
  let existingSession: { shop_id: number; workflow_id: string } | undefined;
  let latestSession: { status: string; created_at: string } | undefined;
  let providerRequestCount = 0;
  const vendorDataValues: string[] = [];
  const originalFetch = globalThis.fetch;

  process.env.DIDIT_API_KEY = apiKey;
  process.env.DIDIT_WORKFLOW_ID = workflowId;
  process.env.APP_URL = 'https://matable.example';
  process.env.NODE_ENV = 'test';
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://verification.didit.me/v3/session/') return originalFetch(input, init);
    providerRequestCount += 1;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-api-key'), apiKey);
    const request = JSON.parse(String(init?.body));
    assert.equal(request.workflow_id, workflowId);
    assert.match(request.vendor_data, /^matable-shop-41-[0-9a-f-]{36}$/i);
    vendorDataValues.push(request.vendor_data);
    assert.equal(request.callback, 'https://matable.example/app?verification=complete');
    assert.deepEqual(request.metadata, { shop_id: '41' });
    assert.equal('contact_details' in request, false);
    return new Response(JSON.stringify({
      session_id: sessionId,
      status: 'Not Started',
      url: `https://verify.didit.me/session/${sessionId}`,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };

  const options = {
    dbGet: async <T>(sql: string) => sql.includes('didit_verification_sessions')
      ? latestSession as T | undefined
      : { id: 41, merchant_verification_status: 'pending' } as T,
    dbAll: async <T>() => [] as T[],
    dbRun: async () => ({ changes: 0 }),
    dbTransaction: async <T>(operation: (transaction: {
      get: <Row>(sql: string, params?: unknown[]) => Promise<Row | undefined>;
      run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
    }) => Promise<T>) => operation({
      get: async <Row>(sql: string) => sql.includes('merchant_verification_status')
        ? { merchant_verification_status: 'pending' } as Row
        : sql.includes('WHERE session_id = ?')
          ? existingSession as Row | undefined
        : sql.includes('didit_verification_sessions')
          ? latestSession as Row | undefined
        : undefined,
      run: async (sql, params = []) => {
        webhookStatus.push(sql);
        if (sql.startsWith('INSERT INTO didit_verification_sessions')) {
          storedParameters = params;
          latestSession = { status: 'Not Started', created_at: String(params[6]) };
          return { changes: insertChanges };
        }
        return { changes: 1 };
      },
    }),
    requireMerchantIdentityOwnShop: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  };

  const app = express();
  app.use(express.json());
  app.use('/api/shops', createMerchantVerificationRouter(options).merchantRouter);
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const missingConsent = await fetch(`http://127.0.0.1:${address.port}/api/shops/41/identity-verification/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: false }),
    });
    assert.equal(missingConsent.status, 400);
    const response = await fetch(`http://127.0.0.1:${address.port}/api/shops/41/identity-verification/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
    const payload = await response.json();
    assert.equal(response.status, 201, JSON.stringify(payload));
    assert.equal(payload.session_id, sessionId);
    assert.equal(payload.session_url, `https://verify.didit.me/session/${sessionId}`);
    assert.equal(storedParameters[0], sessionId);
    assert.equal(storedParameters[1], 41);
    assert.equal(storedParameters[2], workflowId);
    assert.ok(typeof storedParameters[4] === 'string' && Number.isFinite(Date.parse(storedParameters[4])));
    assert.equal(storedParameters[5], 'didit-v1');
    assert.equal(storedParameters[6], storedParameters[7]);
    assert.equal(storedParameters[8], `https://verify.didit.me/session/${sessionId}`);
    assert.equal(webhookStatus.length, 2);
    assert.equal(JSON.stringify(payload).includes(apiKey), false);

    const retryResponse = await fetch(`http://127.0.0.1:${address.port}/api/shops/41/identity-verification/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
    assert.equal(retryResponse.status, 409);
    assert.match((await retryResponse.json()).error, /vérification Didit est déjà en cours/i);
    assert.equal(providerRequestCount, 1);

    insertChanges = 0;
    latestSession = { ...latestSession!, status: 'Abandoned' };
    existingSession = { shop_id: 42, workflow_id: workflowId };
    const collisionResponse = await fetch(`http://127.0.0.1:${address.port}/api/shops/41/identity-verification/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
    assert.equal(collisionResponse.status, 502);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    globalThis.fetch = originalFetch;
    if (previousEnvironment.apiKey === undefined) delete process.env.DIDIT_API_KEY;
    else process.env.DIDIT_API_KEY = previousEnvironment.apiKey;
    if (previousEnvironment.workflowId === undefined) delete process.env.DIDIT_WORKFLOW_ID;
    else process.env.DIDIT_WORKFLOW_ID = previousEnvironment.workflowId;
    if (previousEnvironment.appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousEnvironment.appUrl;
    if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment.nodeEnv;
  }
});
