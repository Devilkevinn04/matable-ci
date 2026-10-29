import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_DB_PATH = path.join(tmpdir(), `matable-delivery-payments-${Date.now()}.db`);
const ADMIN_KEY = 'delivery-payments-test-super-admin-key';
const WEBHOOK_SECRET = 'delivery-payments-test-webhook-secret';
const DIDIT_WEBHOOK_SECRET = 'delivery-payments-test-didit-webhook-secret';
let baseUrl = '';
let serverProcess: ChildProcess | null = null;
let providerServer: ReturnType<typeof createServer> | null = null;
let providerSequence = 0;
let providerLookupCount = 0;
const providerPayments = new Map<string, {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata: { delivery_payment_id: string; payment_type: string };
}>();
const checkoutRequests: { idempotencyKey: string | null; body: Record<string, unknown> }[] = [];

async function reservePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

function signedWebhookHeaders(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'x-webhook-signature': signature,
    'x-webhook-timestamp': timestamp,
    'x-webhook-event': (JSON.parse(rawBody) as { event: string }).event,
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Retry while the subprocess initializes its database.
    }
    await delay(250);
  }
  throw new Error('Delivery payment test server did not become ready in time.');
}

async function api<T = Record<string, unknown>>(pathName: string, options: RequestInit = {}, cookie?: string) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set('Cookie', cookie);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}${pathName}`, { ...options, headers });
  return { response, payload: await response.json() as T };
}

async function loginCookie(pathName: string, body: object): Promise<string> {
  const { response } = await api(pathName, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

async function sendWebhook(eventId: string, event: string, transaction: Record<string, unknown>) {
  const rawBody = JSON.stringify({ id: eventId, event, data: { transaction } });
  return fetch(`${baseUrl}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: signedWebhookHeaders(rawBody),
    body: rawBody,
  });
}

async function registerAndVerifyDriver(phone: string, pin: string) {
  const registration = await api<{ driver: { id: number } }>('/api/delivery/drivers/register', {
    method: 'POST',
    body: JSON.stringify({ name: `Livreur ${phone.slice(-4)}`, phone, pin }),
  });
  assert.equal(registration.response.status, 201);
  const driverId = registration.payload.driver.id;
  const sessionId = randomUUID();
  const workflowId = randomUUID();
  const createdAt = new Date().toISOString();
  const database = new Database(TEST_DB_PATH);
  try {
    database.prepare(`INSERT INTO delivery_driver_identity_sessions
      (session_id, driver_id, workflow_id, status, consent_at, consent_version, created_at, updated_at)
      VALUES (?, ?, ?, 'In Review', ?, 'didit-driver-v1', ?, ?)`)
      .run(sessionId, driverId, workflowId, createdAt, createdAt, createdAt);
  } finally {
    database.close();
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event_id: randomUUID(), session_id: sessionId, status: 'Approved', webhook_type: 'status.updated', timestamp });
  const webhook = await fetch(`${baseUrl}/api/webhooks/didit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': String(timestamp),
      'x-signature': createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    },
    body: rawBody,
  });
  assert.equal(webhook.status, 204);
  const cookie = await loginCookie('/api/delivery/drivers/login', { phone, pin });
  return { driverId, cookie };
}

before(async () => {
  providerServer = createServer((request, response) => {
    if (request.method === 'GET') {
      providerLookupCount += 1;
      const reference = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname.split('/').at(-1) || '');
      const payment = providerPayments.get(reference);
      response.writeHead(payment ? 200 : 404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(payment
        ? { success: true, data: { transaction: payment } }
        : { success: false, error: { code: 'TRANSACTION_NOT_FOUND' } }));
      return;
    }
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { rawBody += chunk; });
    request.on('end', () => {
      const body = JSON.parse(rawBody) as {
        amount: number;
        currency: string;
        metadata: { delivery_payment_id: string; payment_type: string };
      };
      checkoutRequests.push({ idempotencyKey: request.headers['idempotency-key'] as string | null, body });
      providerSequence += 1;
      const reference = `DGP-${providerSequence}`;
      providerPayments.set(reference, {
        reference,
        amount: body.amount,
        currency: body.currency,
        status: 'pending',
        metadata: body.metadata,
      });
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        success: true,
        data: { reference, checkout_url: `https://checkout.geniuspay.ci/${reference}` },
      }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    providerServer?.once('error', reject);
    providerServer?.listen(0, '127.0.0.1', resolve);
  });
  const providerPort = (providerServer.address() as AddressInfo).port;
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: ADMIN_KEY,
      GENIUSPAY_API_KEY: 'pk_delivery_payments_test',
      GENIUSPAY_API_SECRET: 'sk_delivery_payments_test',
      GENIUSPAY_API_URL: `http://127.0.0.1:${providerPort}/api/v1/merchant/payments`,
      GENIUSPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      DIDIT_WEBHOOK_SECRET,
      NODE_ENV: 'test',
      DELIVERY_TEST_MODE: 'true',
      PORT: String(port),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: baseUrl,
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const serverExit = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await serverExit;
  }
  if (providerServer?.listening) {
    await new Promise<void>((resolve, reject) => providerServer?.close((error) => error ? reject(error) : resolve()));
  }
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

test('Mobile Money delivery checkout uses delivery metadata and a stable idempotency key', async () => {
  const phone = '+2250788990201';
  const pin = '519264';
  const { driverId, cookie } = await registerAndVerifyDriver(phone, pin);

  const session = await api<{ provider_payments_available: boolean; access_active: boolean }>(
    '/api/delivery/drivers/session',
    {},
    cookie,
  );
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.provider_payments_available, true);
  assert.equal(session.payload.access_active, false);

  const checkout = await api<{
    payment_id: string; checkout_url: string; amount: number; payment_mode: string; currency: string;
  }>('/api/delivery/drivers/subscription/checkout', { method: 'POST' }, cookie);
  assert.equal(checkout.response.status, 200);
  assert.equal(checkout.payload.payment_mode, 'provider');
  assert.equal(checkout.payload.amount, 1000);
  assert.equal(checkout.payload.currency, 'XOF');
  assert.match(checkout.payload.checkout_url, /^https:\/\/checkout\.geniuspay\.ci\/DGP-\d+$/);
  const paymentId = checkout.payload.payment_id;
  assert.ok(paymentId);

  const checkoutRequest = checkoutRequests[0];
  assert.ok(checkoutRequest);
  assert.equal(checkoutRequest.idempotencyKey, paymentId);
  assert.deepEqual(checkoutRequest.body.metadata, {
    delivery_payment_id: paymentId,
    payment_type: 'delivery',
  });
  assert.equal(checkoutRequest.body.amount, 1000);
  assert.match(String(checkoutRequest.body.success_url), /\/livreur\?payment_id=/);
  assert.match(String(checkoutRequest.body.error_url), /\/livreur\?payment_id=/);
  assert.doesNotMatch(String(checkoutRequest.body.success_url), /__preview/);

  const reused = await api<{ payment_id: string; reused: boolean; checkout_url: string }>(
    '/api/delivery/drivers/subscription/checkout',
    { method: 'POST' },
    cookie,
  );
  assert.equal(reused.response.status, 200);
  assert.equal(reused.payload.reused, true);
  assert.equal(reused.payload.payment_id, paymentId);
  assert.equal(reused.payload.checkout_url, checkout.payload.checkout_url);
  assert.equal(checkoutRequests.length, 1);

  const pending = await api<{ status: string; access_active: boolean; access_expires_at: string | null }>(
    `/api/delivery/drivers/subscription/payment/${paymentId}`,
    {},
    cookie,
  );
  assert.equal(pending.response.status, 200);
  assert.equal(pending.payload.status, 'pending');
  assert.equal(pending.payload.access_active, false);
  assert.ok(providerLookupCount >= 1);

  const providerPayment = providerPayments.get(`DGP-1`);
  assert.ok(providerPayment);
  providerPayment.status = 'completed';
  const settled = await sendWebhook(`delivery-settlement-${Date.now()}`, 'payment.success', {
    status: 'completed',
    reference: providerPayment.reference,
    amount: 1000,
    currency: 'XOF',
    metadata: { delivery_payment_id: paymentId, payment_type: 'delivery' },
  });
  assert.equal(settled.status, 200);
  assert.equal((await settled.json() as { received: boolean; duplicate?: boolean }).received, true);

  const paid = await api<{ status: string; access_active: boolean; access_expires_at: string; paid_at: string }>(
    `/api/delivery/drivers/subscription/payment/${paymentId}`,
    {},
    cookie,
  );
  assert.equal(paid.response.status, 200);
  assert.equal(paid.payload.status, 'paid');
  assert.equal(paid.payload.access_active, true);
  assert.ok(paid.payload.paid_at);
  assert.ok(Date.parse(paid.payload.access_expires_at) - Date.now() > 23 * 60 * 60 * 1000);
  assert.equal((await api('/api/delivery/courses', {}, cookie)).response.status, 200);

  const duplicate = await sendWebhook(`delivery-settlement-${Date.now()}`, 'payment.success', {
    status: 'completed',
    reference: providerPayment.reference,
    amount: 1000,
    currency: 'XOF',
    metadata: { delivery_payment_id: paymentId, payment_type: 'delivery' },
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json() as { duplicate?: boolean }).duplicate, true);

  const database = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const intent = database.prepare(`SELECT status, provider_reference, paid_at
      FROM delivery_driver_payment_intents WHERE id = ?`).get(paymentId) as {
      status: string; provider_reference: string; paid_at: string;
    };
    assert.equal(intent.status, 'paid');
    assert.equal(intent.provider_reference, providerPayment.reference);
    assert.ok(intent.paid_at);
    const subscription = database.prepare(`SELECT amount, payment_mode, payment_intent_id
      FROM delivery_driver_subscriptions WHERE driver_id = ?`).get(driverId) as {
      amount: number; payment_mode: string; payment_intent_id: string;
    };
    assert.equal(subscription.amount, 1000);
    assert.equal(subscription.payment_mode, 'provider');
    assert.equal(subscription.payment_intent_id, paymentId);
  } finally {
    database.close();
  }
});

test('failed delivery payment webhook keeps access inactive and can be retried with a fresh checkout', async () => {
  const phone = '+2250788990202';
  const pin = '481375';
  await registerAndVerifyDriver(phone, pin);

  const cookie = await loginCookie('/api/delivery/drivers/login', { phone, pin });
  const checkout = await api<{ payment_id: string }>('/api/delivery/drivers/subscription/checkout', {
    method: 'POST',
  }, cookie);
  assert.equal(checkout.response.status, 200);
  const paymentId = checkout.payload.payment_id;
  const providerPayment = providerPayments.get(`DGP-${providerSequence}`);
  assert.ok(providerPayment);
  assert.equal(providerPayment.metadata.delivery_payment_id, paymentId);

  const mismatch = await sendWebhook(`delivery-mismatch-${Date.now()}`, 'payment.success', {
    status: 'completed',
    reference: providerPayment.reference,
    amount: 999,
    currency: 'XOF',
    metadata: { delivery_payment_id: paymentId, payment_type: 'delivery' },
  });
  assert.equal(mismatch.status, 200);
  assert.deepEqual(await mismatch.json(), { received: true, rejected: true, reason: 'mismatch' });

  providerPayment.status = 'failed';
  const failed = await sendWebhook(`delivery-failure-${Date.now()}`, 'payment.failed', {
    status: 'failed',
    reference: providerPayment.reference,
    amount: 1000,
    currency: 'XOF',
    metadata: { delivery_payment_id: paymentId, payment_type: 'delivery' },
  });
  assert.equal(failed.status, 200);
  assert.equal((await failed.json() as { received: boolean }).received, true);

  const failedStatus = await api<{ status: string; access_active: boolean }>(
    `/api/delivery/drivers/subscription/payment/${paymentId}`,
    {},
    cookie,
  );
  assert.equal(failedStatus.response.status, 200);
  assert.equal(failedStatus.payload.status, 'failed');
  assert.equal(failedStatus.payload.access_active, false);

  const retry = await api<{ payment_id: string; payment_mode: string; reused?: boolean }>(
    '/api/delivery/drivers/subscription/checkout',
    { method: 'POST' },
    cookie,
  );
  assert.equal(retry.response.status, 200);
  assert.equal(retry.payload.payment_mode, 'provider');
  assert.notEqual(retry.payload.payment_id, paymentId);
  assert.notEqual(retry.payload.reused, true);
});

test('delivery webhook rejects a payment type mismatch without activating access', async () => {
  const database = new Database(TEST_DB_PATH, { readonly: true });
  let pendingPaymentId = '';
  let providerReference = '';
  try {
    const pending = database.prepare(`SELECT id FROM delivery_driver_payment_intents
      WHERE status = 'pending' AND provider_reference IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get() as {
      id: string;
    } | undefined;
    assert.ok(pending);
    pendingPaymentId = pending.id;
    const row = providerPayments.get(`DGP-${providerSequence}`);
    assert.ok(row);
    providerReference = row.reference;
  } finally {
    database.close();
  }

  const rejected = await sendWebhook(`delivery-type-mismatch-${Date.now()}`, 'payment.success', {
    status: 'completed',
    reference: providerReference,
    amount: 1000,
    currency: 'XOF',
    metadata: { subscription_payment_id: pendingPaymentId, payment_type: 'subscription' },
  });
  assert.equal(rejected.status, 200);
  assert.deepEqual(await rejected.json(), { received: true, rejected: true, reason: 'not_found' });

  const databaseAfter = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const intent = databaseAfter.prepare('SELECT status FROM delivery_driver_payment_intents WHERE id = ?')
      .get(pendingPaymentId) as { status: string };
    assert.equal(intent.status, 'pending');
  } finally {
    databaseAfter.close();
  }
});
