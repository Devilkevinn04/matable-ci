import test from 'node:test';
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { createGeniusPayCheckout, GeniusPayApiError, getGeniusPayPayment, getRenewedSubscriptionExpiry, isValidGeniusPaySignature } from '../server/services/geniusPay';
import { getSubscriptionState } from '../server/services/businessRules';

const TEST_PORT = 43125;
const TEST_DB_PATH = path.join(tmpdir(), `matable-geniuspay-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;
let providerServer: ReturnType<typeof createServer> | null = null;
let providerReference = 0;
let failNextProviderResponse = false;
const providerPayments = new Map<string, {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata: { subscription_payment_id: string; payment_type: string };
}>();

function getSignedWebhookHeaders(payload: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', 'geniuspay-test-webhook-secret')
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return { 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE_URL}/api/health`)).ok) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error('GeniusPay test server did not become ready in time.');
}

before(async () => {
  providerServer = createServer((request, response) => {
    if (request.method === 'GET') {
      const reference = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname.split('/').at(-1) || '');
      const payment = providerPayments.get(reference);
      response.writeHead(payment ? 200 : 404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(payment
        ? { success: true, data: { transaction: payment } }
        : { success: false, error: { code: 'TRANSACTION_NOT_FOUND' } }));
      return;
    }
    providerReference += 1;
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { rawBody += chunk; });
    request.on('end', () => {
      const body = JSON.parse(rawBody) as {
        amount: number;
        currency: string;
        metadata: { subscription_payment_id: string; payment_type: string };
      };
      const paymentId = body.metadata.subscription_payment_id;
      const reference = `GNP-${paymentId}`;
      if (!providerPayments.has(reference)) {
        providerPayments.set(reference, {
          reference,
          amount: body.amount,
          currency: body.currency,
          status: 'pending',
          metadata: body.metadata,
        });
      }
      if (failNextProviderResponse) {
        failNextProviderResponse = false;
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ success: false, error: { message: 'simulated response loss after create' } }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        success: true,
        data: {
          reference,
          checkout_url: `https://checkout.geniuspay.ci/${providerReference}`,
        },
      }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    providerServer?.once('error', reject);
    providerServer?.listen(0, '127.0.0.1', resolve);
  });
  const providerPort = (providerServer.address() as AddressInfo).port;
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'geniuspay-test-admin-key',
      GENIUSPAY_API_KEY: 'pk_sandbox_test_public_key',
      GENIUSPAY_API_SECRET: 'geniuspay-test-api-secret',
      GENIUSPAY_API_URL: `http://127.0.0.1:${providerPort}/api/v1/merchant/payments`,
      GENIUSPAY_WEBHOOK_SECRET: 'geniuspay-test-webhook-secret',
      NODE_ENV: 'test',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: BASE_URL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const serverExit = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await serverExit;
  }
  if (providerServer?.listening) await new Promise<void>((resolve, reject) => providerServer?.close((error) => error ? reject(error) : resolve()));
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

test('GeniusPay webhook signatures are time-limited and bound to the exact raw body', () => {
  const secret = 'test-webhook-secret';
  const rawBody = Buffer.from('{"event":"payment.success","data":{"status":"paid"}}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');

  assert.equal(isValidGeniusPaySignature(rawBody, signature, timestamp, secret), true);
  assert.equal(isValidGeniusPaySignature(Buffer.from(`${rawBody.toString()} `), signature, timestamp, secret), false);
  assert.equal(isValidGeniusPaySignature(rawBody, signature, timestamp, ''), false);
  assert.equal(isValidGeniusPaySignature(rawBody, 'invalid', timestamp, secret), false);
  assert.equal(isValidGeniusPaySignature(rawBody, signature, '0', secret), false);
});

test('GeniusPay blocks new payments during manual suspension and preserves it if a pending checkout settles', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique suspension manuelle GeniusPay',
      whatsapp_number: `+22507${String(Date.now() + Math.floor(Math.random() * 100000)).slice(-8)}`,
      email: `manual-suspension-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const merchantCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);

  const database = new Database(TEST_DB_PATH);
  const shopId = Number(createdPayload.shop.id);
  try {
    const overrideUntil = `${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
    database.prepare(`UPDATE shops SET subscription_admin_override_status = 'suspended',
      subscription_admin_override_tier = 'standard', subscription_admin_override_until = ?
      WHERE id = ?`).run(overrideUntil, shopId);

    const paymentEndpoint = `${BASE_URL}/api/shops/${shopId}/subscription-payments`;
    const paymentHeaders = { 'Content-Type': 'application/json', Cookie: merchantCookie };
    const blockedPayment = await fetch(paymentEndpoint, {
      method: 'POST',
      headers: paymentHeaders,
      body: JSON.stringify({ tier: 'standard', term: 'monthly' }),
    });
    assert.equal(blockedPayment.status, 409);
    assert.equal((await blockedPayment.json()).code, 'subscription_access_manually_suspended');
    assert.equal((database.prepare('SELECT COUNT(*) AS count FROM subscription_payment_intents WHERE shop_id = ?').get(shopId) as { count: number }).count, 0);

    database.prepare(`UPDATE shops SET subscription_admin_override_status = NULL,
      subscription_admin_override_tier = NULL, subscription_admin_override_until = NULL
      WHERE id = ?`).run(shopId);
    const pendingResponse = await fetch(paymentEndpoint, {
      method: 'POST',
      headers: paymentHeaders,
      body: JSON.stringify({ tier: 'standard', term: 'monthly' }),
    });
    const pending = await pendingResponse.json();
    assert.equal(pendingResponse.status, 201, JSON.stringify(pending));

    database.prepare(`UPDATE shops SET subscription_admin_override_status = 'suspended',
      subscription_admin_override_tier = 'standard', subscription_admin_override_until = ?
      WHERE id = ?`).run(overrideUntil, shopId);
    const providerReference = `GNP-${pending.payment_id}`;
    const providerPayment = providerPayments.get(providerReference);
    assert.ok(providerPayment);
    providerPayment.status = 'completed';
    const webhookPayload = JSON.stringify({
      id: `manual-suspension-settlement-${Date.now()}`,
      event: 'payment.success',
      data: { transaction: {
        status: 'completed',
        reference: providerReference,
        amount: 3000,
        currency: 'XOF',
        metadata: { subscription_payment_id: pending.payment_id, payment_type: 'subscription' },
      } },
    });
    const webhook = await fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSignedWebhookHeaders(webhookPayload) },
      body: webhookPayload,
    });
    assert.equal(webhook.status, 200);

    const paymentStatus = await fetch(`${paymentEndpoint}/${pending.payment_id}`, {
      headers: { Cookie: merchantCookie },
    }).then((response) => response.json());
    assert.equal(paymentStatus.status, 'paid');
    assert.equal(paymentStatus.subscription.status, 'suspended');
    assert.equal(paymentStatus.subscription.isActive, false);
  } finally {
    database.prepare('DELETE FROM shops WHERE id = ?').run(shopId);
    database.close();
  }
});

test('GeniusPay checkout rejects HTTPS URLs outside the provider domain', async () => {
  const originalApiKey = process.env.GENIUSPAY_API_KEY;
  const originalApiSecret = process.env.GENIUSPAY_API_SECRET;
  process.env.GENIUSPAY_API_KEY = 'test-api-key';
  process.env.GENIUSPAY_API_SECRET = 'test-api-secret';
  try {
    await assert.rejects(createGeniusPayCheckout({
      amount: 3000,
      description: 'Test payment',
      customer: { name: 'Test Shop', email: 'shop@example.com', phone: '+2250700000000', country: 'CI' },
      success_url: 'https://matable.ci/app',
      error_url: 'https://matable.ci/app',
      metadata: { subscription_payment_id: 'payment-id', payment_type: 'subscription' },
    }, async () => new Response(JSON.stringify({
      success: true,
      data: { reference: 'GNP-TEST', checkout_url: 'https://checkout.attacker.example/pay' },
    }), { status: 200 })), GeniusPayApiError);
  } finally {
    if (originalApiKey === undefined) delete process.env.GENIUSPAY_API_KEY;
    else process.env.GENIUSPAY_API_KEY = originalApiKey;
    if (originalApiSecret === undefined) delete process.env.GENIUSPAY_API_SECRET;
    else process.env.GENIUSPAY_API_SECRET = originalApiSecret;
  }
});

test('GeniusPay creation sends documented idempotency fields and parses the nested payment response', async () => {
  const originalApiKey = process.env.GENIUSPAY_API_KEY;
  const originalApiSecret = process.env.GENIUSPAY_API_SECRET;
  process.env.GENIUSPAY_API_KEY = 'pk_sandbox_contract_test';
  process.env.GENIUSPAY_API_SECRET = 'sk_sandbox_contract_test';
  const paymentId = 'intent-contract-test';
  try {
    let checkoutRequest: Record<string, unknown> | null = null;
    const checkout = await createGeniusPayCheckout({
      amount: 5000,
      description: 'Abonnement MaTable.ci',
      customer: { name: 'Boutique test', email: 'shop@example.ci', phone: '+2250700000001', country: 'CI' },
      success_url: 'https://matable.ci/app?payment_id=intent-contract-test',
      error_url: 'https://matable.ci/app?payment_id=intent-contract-test',
      metadata: { subscription_payment_id: paymentId, payment_type: 'subscription' },
    }, async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('idempotency-key'), paymentId);
      checkoutRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ success: true, data: {
        reference: 'MTX-CONTRACT-1',
        checkout_url: 'https://geniuspay.ci/checkout/MTX-CONTRACT-1',
      } }), { status: 201 });
    });
    assert.equal(checkout.reference, 'MTX-CONTRACT-1');
    assert.ok(checkoutRequest);
    assert.equal('external_reference' in checkoutRequest, false);

    const payment = await getGeniusPayPayment('MTX-CONTRACT-1', async () => new Response(JSON.stringify({
      success: true,
      data: { transaction: {
        reference: 'MTX-CONTRACT-1', amount: 5000, currency: 'XOF', status: 'completed',
        metadata: { subscription_payment_id: paymentId, payment_type: 'subscription' },
      } },
    }), { status: 200 }));
    assert.deepEqual(payment, {
      reference: 'MTX-CONTRACT-1', amount: 5000, currency: 'XOF', status: 'completed',
      metadata: { subscription_payment_id: paymentId, payment_type: 'subscription' },
    });
  } finally {
    if (originalApiKey === undefined) delete process.env.GENIUSPAY_API_KEY;
    else process.env.GENIUSPAY_API_KEY = originalApiKey;
    if (originalApiSecret === undefined) delete process.env.GENIUSPAY_API_SECRET;
    else process.env.GENIUSPAY_API_SECRET = originalApiSecret;
  }
});

test('subscription renewal adds a calendar month or year after the later of now or current expiry', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  assert.equal(
    getRenewedSubscriptionExpiry('2026-10-10T00:00:00.000Z', now),
    '2026-11-10T00:00:00.000Z',
  );
  assert.equal(
    getRenewedSubscriptionExpiry('2026-09-01T00:00:00.000Z', now),
    '2026-11-03T00:00:00.000Z',
  );
  assert.equal(
    getRenewedSubscriptionExpiry('2026-01-31T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'), 'annual'),
    '2027-01-31T00:00:00.000Z',
  );
});

test('paid subscriptions enter grace at expiry and suspend after the two-day grace period', () => {
  const currentDate = new Date('2026-10-03T00:00:00.000Z');
  const expired = getSubscriptionState({
    subscription_status: 'active',
    trial_start: null,
    trial_end: null,
    subscription_expires_at: '2026-10-02T00:00:00.000Z',
    selected_subscription_tier: 'premium',
  }, currentDate);
  const current = getSubscriptionState({
    subscription_status: 'active',
    trial_start: null,
    trial_end: null,
    subscription_expires_at: '2026-10-04T00:00:00.000Z',
    selected_subscription_tier: 'premium',
  }, currentDate);

  assert.equal(expired.status, 'past_due');
  assert.equal(expired.isActive, false);
  assert.equal(
    getSubscriptionState({
      subscription_status: 'active',
      trial_start: null,
      trial_end: null,
      subscription_expires_at: '2026-10-02T00:00:00.000Z',
      selected_subscription_tier: 'premium',
    }, new Date('2026-10-05T00:00:00.000Z')).status,
    'suspended',
  );
  assert.equal(current.status, 'active');
  assert.equal(current.isActive, true);
});

test('active subscriptions can be renewed repeatedly and retries stay idempotent', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique renouvellement itératif',
      whatsapp_number: `+22507${String(Date.now() + 9).slice(-8)}`,
      email: `renewal-idempotent-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const merchantCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);

  const now = new Date();
  const futureExpiry = new Date(now.getTime() + 30 * 86400000).toISOString();
  const setActiveDb = new Database(TEST_DB_PATH);
  try {
    setActiveDb.prepare('UPDATE shops SET subscription_status = ?, selected_subscription_tier = ?, subscription_expires_at = ? WHERE id = ?')
      .run('active', 'premium', futureExpiry, createdPayload.shop.id);
  } finally {
    setActiveDb.close();
  }

  const clientRequestId = `repeat-${Date.now()}`;
  const createPayment = () => fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: clientRequestId }),
  });
  const lostResponseRequestId = `lost-response-${Date.now()}`;
  const providerPaymentCountBeforeRetry = providerPayments.size;
  failNextProviderResponse = true;
  const lostProviderResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: lostResponseRequestId }),
  });
  assert.equal(lostProviderResponse.status, 502);
  const recoveredResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: lostResponseRequestId }),
  });
  const recoveredPayload = await recoveredResponse.json();
  assert.equal(recoveredResponse.status, 200, JSON.stringify(recoveredPayload));
  assert.match(recoveredPayload.checkout_url, /^https:\/\/checkout\.geniuspay\.ci\/\d+$/);
  assert.equal(providerPayments.size, providerPaymentCountBeforeRetry + 1);
  const recoveredCount = new Database(TEST_DB_PATH);
  try {
    assert.equal((recoveredCount.prepare('SELECT COUNT(*) AS count FROM subscription_payment_intents WHERE shop_id = ? AND client_request_id = ?').get(createdPayload.shop.id, lostResponseRequestId) as { count: number }).count, 1);
  } finally {
    recoveredCount.close();
  }

  const firstPayment = await createPayment();
  const repeatedPayment = await createPayment();
  const firstPayload = await firstPayment.json();
  const repeatedPayload = await repeatedPayment.json();
  assert.deepEqual([firstPayment.status, repeatedPayment.status].sort(), [200, 201]);
  assert.equal(repeatedPayload.payment_id, firstPayload.payment_id);

  const conflictingPayment = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'annual', client_request_id: clientRequestId }),
  });
  assert.equal(conflictingPayment.status, 409);

  const duplicateCount = new Database(TEST_DB_PATH);
  try {
    const row = duplicateCount.prepare('SELECT COUNT(*) AS count FROM subscription_payment_intents WHERE shop_id = ? AND client_request_id = ?').get(createdPayload.shop.id, clientRequestId) as { count: number };
    assert.equal(row.count, 1);
  } finally {
    duplicateCount.close();
  }

  const nextExpiry = getRenewedSubscriptionExpiry(futureExpiry, new Date(futureExpiry), 'monthly');
  assert.ok(new Date(nextExpiry).getTime() > new Date(futureExpiry).getTime());

  const cleanupDb = new Database(TEST_DB_PATH);
  try {
    cleanupDb.prepare('DELETE FROM subscription_payment_intents WHERE shop_id = ?').run(createdPayload.shop.id);
  } finally {
    cleanupDb.close();
  }
});

test('GeniusPay renewals require a signed webhook and apply exactly once', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique renouvellement GeniusPay',
      whatsapp_number: `+22507${String(Date.now()).slice(-8)}`,
      email: `geniuspay-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const merchantCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);

  const startTrial = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium' }),
  });
  const trialPayload = await startTrial.json();
  assert.equal(startTrial.status, 200);
  const trialEnd = trialPayload.shop.subscription.trialEnd as string;

  const clearBillingEmail = new Database(TEST_DB_PATH);
  try {
    clearBillingEmail.prepare('UPDATE shops SET owner_email = NULL WHERE id = ?').run(createdPayload.shop.id);
  } finally {
    clearBillingEmail.close();
  }
  const paymentEndpoint = `${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`;
  const paymentHeaders = { 'Content-Type': 'application/json', Cookie: merchantCookie };
  const emailRequired = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'annual' }),
  });
  assert.equal(emailRequired.status, 409);
  assert.equal((await emailRequired.json()).code, 'billing_email_required');

  const invalidBillingEmail = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'annual', billing_email: 'not-an-email' }),
  });
  assert.equal(invalidBillingEmail.status, 400);
  assert.equal((await invalidBillingEmail.json()).code, 'invalid_billing_email');

  const intentResponse = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'annual', billing_email: 'facturation@example.com' }),
  });
  const intent = await intentResponse.json();
  assert.equal(intentResponse.status, 201, JSON.stringify(intent));
  assert.equal(intent.amount, 50000);
  assert.equal(intent.currency, 'XOF');
  assert.match(intent.checkout_url, /^https:\/\/checkout\.geniuspay\.ci\/\d+$/);
  assert.equal('is_test' in intent, false);
  assert.equal('secret_key' in intent, false);
  const savedBillingEmail = new Database(TEST_DB_PATH);
  try {
    assert.equal(
      (savedBillingEmail.prepare('SELECT owner_email FROM shops WHERE id = ?').get(createdPayload.shop.id) as { owner_email: string }).owner_email,
      'facturation@example.com',
    );
  } finally {
    savedBillingEmail.close();
  }

  const webhookPayload = JSON.stringify({
    id: `event-${Date.now()}`,
    event: 'payment.success',
    data: { transaction: {
      status: 'completed',
      reference: `GNP-${intent.payment_id}`,
      amount: 50000,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id, payment_type: 'subscription' },
    },
    },
  });
  const invalidWebhook = await fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': '0'.repeat(64), 'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)) },
    body: webhookPayload,
  });
  assert.equal(invalidWebhook.status, 401);

  const pendingStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(pendingStatus.status, 200);
  assert.equal((await pendingStatus.json()).status, 'pending');

  const otherShopResponse = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Autre boutique GeniusPay',
      whatsapp_number: `+22507${String(Date.now() + 1).slice(-8)}`,
      email: `geniuspay-other-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const otherShop = await otherShopResponse.json();
  assert.equal(otherShopResponse.status, 200, JSON.stringify(otherShop));
  const otherShopLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: otherShop.owner_access_token }),
  });
  assert.equal(otherShopLogin.status, 200);
  const otherShopCookie = otherShopLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(otherShopCookie);
  const otherShopPaymentStatus = await fetch(`${BASE_URL}/api/shops/${otherShop.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: otherShopCookie },
  });
  assert.equal(otherShopPaymentStatus.status, 404);

  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'geniuspay-test-admin-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const financeBeforePayment = await fetch(`${BASE_URL}/api/admin/payments?days=30`, { headers: { Cookie: adminCookie } }).then((response) => response.json());

  const sendSignedWebhook = (payload: string) => fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getSignedWebhookHeaders(payload),
    },
    body: payload,
  });
  const wrongAmountPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${intent.payment_id}`,
      amount: 39999,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id, payment_type: 'subscription' },
    },
  });
  const wrongAmountResponse = await sendSignedWebhook(wrongAmountPayload);
  assert.equal(wrongAmountResponse.status, 200);

  const wrongCurrencyPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${intent.payment_id}`,
      amount: 50000,
      currency: 'USD',
      metadata: { subscription_payment_id: intent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(wrongCurrencyPayload)).status, 200);

  const wrongReferencePayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: 'GNP-UNRELATED-TRANSACTION',
      amount: 50000,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(wrongReferencePayload)).status, 200);
  const webhookJournal = new Database(TEST_DB_PATH);
  try {
    const rejectedEvent = webhookJournal.prepare(`SELECT processing_status, result_code, LENGTH(payload_sha256) AS hash_length
      FROM geniuspay_webhook_events WHERE result_code = 'reference_mismatch' ORDER BY received_at DESC LIMIT 1`).get() as {
      processing_status: string;
      result_code: string;
      hash_length: number;
    };
    assert.deepEqual(rejectedEvent, { processing_status: 'rejected', result_code: 'reference_mismatch', hash_length: 64 });
  } finally {
    webhookJournal.close();
  }

  const malformedPayload = JSON.stringify({ event: 'payment.success', data: null });
  assert.equal((await sendSignedWebhook(malformedPayload)).status, 200);

  const stillPending = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(stillPending.status, 'pending');

  const sendWebhook = (payload = webhookPayload) => fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSignedWebhookHeaders(payload) },
    body: payload,
  });
  const confirmedProviderPayment = providerPayments.get(`GNP-${intent.payment_id}`);
  assert.ok(confirmedProviderPayment);
  providerPayments.set(`GNP-${intent.payment_id}`, { ...confirmedProviderPayment, status: 'completed' });
  const acceptedWebhook = await sendWebhook();
  assert.equal(acceptedWebhook.status, 200, await acceptedWebhook.text());

  const paidStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(paidStatus.status, 200);
  const paidPayload = await paidStatus.json();
  assert.equal(paidPayload.status, 'paid');
  assert.equal(paidPayload.subscription.status, 'active');
  assert.ok(Date.parse(paidPayload.subscription.expiresAt) > Date.parse(trialEnd) + 360 * 86400000);

  const failedIntentResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium' }),
  });
  const failedIntent = await failedIntentResponse.json();
  assert.equal(failedIntentResponse.status, 201, JSON.stringify(failedIntent));
  const failedWebhookPayload = JSON.stringify({
    event: 'payment.failed',
    data: {
      status: 'failed',
      reference: `GNP-${failedIntent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: failedIntent.payment_id, payment_type: 'subscription' },
    },
  });
  const failedWebhook = await fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSignedWebhookHeaders(failedWebhookPayload) },
    body: failedWebhookPayload,
  });
  assert.equal(failedWebhook.status, 200, await failedWebhook.text());
  const failedStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${failedIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal((await failedStatus.json()).status, 'failed');
  const lateSuccessAfterFailure = await sendSignedWebhook(JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${failedIntent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: failedIntent.payment_id, payment_type: 'subscription' },
    },
  }));
  assert.equal(lateSuccessAfterFailure.status, 200);
  const stillFailed = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${failedIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(stillFailed.status, 'failed');

  const cancelledIntentResponse = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium' }),
  });
  const cancelledIntent = await cancelledIntentResponse.json();
  assert.equal(cancelledIntentResponse.status, 201);
  const cancelledWebhookPayload = JSON.stringify({
    id: `cancel-event-${Date.now()}`,
    event: 'payment.cancelled',
    data: {
      status: 'cancelled',
      reference: `GNP-${cancelledIntent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: cancelledIntent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(cancelledWebhookPayload)).status, 200);
  const cancelledStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${cancelledIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(cancelledStatus.status, 'cancelled');

  const unauthenticatedPayments = await fetch(`${BASE_URL}/api/admin/payments`);
  assert.equal(unauthenticatedPayments.status, 401);
  const finance = await fetch(`${BASE_URL}/api/admin/payments?days=30`, { headers: { Cookie: adminCookie } });
  assert.equal(finance.status, 200);
  const financeData = await finance.json();
  assert.equal(financeData.summary.confirmed_count, 1);
  assert.equal(financeData.summary.collected_amount, 50000);
  assert.equal(financeData.summary.pending_count, 0);
  assert.equal(financeData.summary.failed_count, 2);
  assert.ok(financeData.summary.active_subscriptions >= 1);
  assert.equal(financeData.summary.mrr - financeBeforePayment.summary.mrr, Math.round(50000 / 12));
  const previousPremiumMrr = financeBeforePayment.summary.mrr_by_tier.find((tier: { tier: string }) => tier.tier === 'premium')?.amount || 0;
  assert.equal(financeData.summary.mrr_by_tier.find((tier: { tier: string }) => tier.tier === 'premium')?.amount - previousPremiumMrr, Math.round(50000 / 12));
  assert.equal(financeData.summary.mrr_estimated_subscriptions, financeBeforePayment.summary.mrr_estimated_subscriptions);
  assert.equal(financeData.summary.promotions.amount, 0);
  assert.equal(financeData.payments[0].shop_id, createdPayload.shop.id);
  assert.equal(financeData.payments[0].payment_type, 'subscription');
  assert.equal(financeData.payments.find((payment: { id: string }) => payment.id === intent.payment_id)?.subscription_term, 'annual');
  assert.ok(financeData.payments.some((payment: { status: string }) => payment.status === 'failed'));

  const testDb = new Database(TEST_DB_PATH);
  try {
    const insertPromotion = testDb.prepare(`
      INSERT INTO subscription_payment_intents (id, shop_id, payment_type, tier, amount, currency, status, provider_reference, created_at, paid_at)
      VALUES (?, ?, 'promotion', 'standard', 100, 'XOF', 'paid', ?, ?, ?)
    `);
    for (let index = 0; index < 205; index += 1) {
      const paidAt = new Date(Date.now() - index * 1000).toISOString();
      insertPromotion.run(`test-promotion-${index}`, createdPayload.shop.id, `test-ref-${index}`, paidAt, paidAt);
    }
  } finally {
    testDb.close();
  }
  const financeAfterMorePayments = await fetch(`${BASE_URL}/api/admin/payments?days=30&limit=100`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.equal(financeAfterMorePayments.payments.length, 100);
  assert.equal(financeAfterMorePayments.payment_count, 208);
  assert.equal(financeAfterMorePayments.payment_limit, 100);
  assert.equal(financeAfterMorePayments.payment_offset, 0);
  assert.equal(financeAfterMorePayments.summary.confirmed_count, 206);
  assert.equal(financeAfterMorePayments.summary.collected_amount, 70500);
  assert.equal(financeAfterMorePayments.summary.promotions.count, 205);
  assert.equal(financeAfterMorePayments.summary.promotions.amount, 20500);
  assert.equal(financeAfterMorePayments.summary.failed_count, 2);
  const secondPaymentPage = await fetch(`${BASE_URL}/api/admin/payments?days=30&limit=100&offset=100`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const lastPaymentPage = await fetch(`${BASE_URL}/api/admin/payments?days=30&limit=100&offset=200`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.equal(secondPaymentPage.payments.length, 100);
  assert.equal(lastPaymentPage.payments.length, 8);
  const filteredPaymentPage = await fetch(`${BASE_URL}/api/admin/payments?days=30&limit=10&search=test-ref-204&type=promotion&status=paid`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.equal(filteredPaymentPage.payment_count, 1);
  assert.equal(filteredPaymentPage.payments[0].id, 'test-promotion-204');
  const failedPaymentFilter = await fetch(`${BASE_URL}/api/admin/payments?days=30&status=failed`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.equal(failedPaymentFilter.payment_count, 1);
  assert.equal(failedPaymentFilter.payments[0].status, 'failed');

  const activeRenewalIntentResponse = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'monthly' }),
  });
  const activeRenewalIntent = await activeRenewalIntentResponse.json();
  assert.equal(activeRenewalIntentResponse.status, 201);
  const expiryBeforeActiveRenewal = paidPayload.subscription.expiresAt;
  const activeRenewalPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${activeRenewalIntent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: activeRenewalIntent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(activeRenewalPayload)).status, 200);
  const renewedStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${activeRenewalIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  const expectedActiveRenewalExpiry = getRenewedSubscriptionExpiry(expiryBeforeActiveRenewal, new Date(), 'monthly');
  assert.equal(renewedStatus.status, 'paid');
  assert.equal(renewedStatus.subscription.expiresAt, expectedActiveRenewalExpiry);
  assert.equal((await sendSignedWebhook(activeRenewalPayload)).status, 200);
  const renewedStatusAfterReplay = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${activeRenewalIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(renewedStatusAfterReplay.subscription.expiresAt, expectedActiveRenewalExpiry);

  const expiredRequestId = `expire-${Date.now()}`;
  const reusedReferenceIntentResponse = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: expiredRequestId }),
  });
  const reusedReferenceIntent = await reusedReferenceIntentResponse.json();
  assert.equal(reusedReferenceIntentResponse.status, 201);
  const reusedReferencePayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${intent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: reusedReferenceIntent.payment_id, payment_type: 'subscription' },
    },
  });
  const reusedReferenceResponse = await sendSignedWebhook(reusedReferencePayload);
  assert.equal(reusedReferenceResponse.status, 200);
  const reusedReferenceStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${reusedReferenceIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal((await reusedReferenceStatus.json()).status, 'pending');

  const expireIntentDb = new Database(TEST_DB_PATH);
  const lateProviderPayment = providerPayments.get(`GNP-${reusedReferenceIntent.payment_id}`);
  assert.ok(lateProviderPayment);
  providerPayments.set(`GNP-${reusedReferenceIntent.payment_id}`, { ...lateProviderPayment, status: 'completed' });
  try {
    expireIntentDb.prepare('UPDATE subscription_payment_intents SET created_at = ?, provider_checked_at = NULL WHERE id = ?')
      .run(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), reusedReferenceIntent.payment_id);
  } finally {
    expireIntentDb.close();
  }
  const expiredIntentStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${reusedReferenceIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(expiredIntentStatus.status, 'paid');
  const latePaymentPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${reusedReferenceIntent.payment_id}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: reusedReferenceIntent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(latePaymentPayload)).status, 200);
  const retryExpiredIntent = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: paymentHeaders,
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: expiredRequestId }),
  });
  assert.equal(retryExpiredIntent.status, 409);
  const reconciledFinance = await fetch(`${BASE_URL}/api/admin/payments?days=30&status=paid`, {
    headers: { Cookie: adminCookie },
  }).then((response) => response.json());
  assert.ok(reconciledFinance.payments.some((payment: { id: string; status: string }) => payment.id === reusedReferenceIntent.payment_id && payment.status === 'paid'));

  const reusedEvent = JSON.parse(webhookPayload);
  const conflictingEventPayload = JSON.stringify({
    ...reusedEvent,
    data: { ...reusedEvent.data, amount: reusedEvent.data.amount - 1 },
  });
  const conflictingEventResponse = await sendWebhook(conflictingEventPayload);
  assert.equal(conflictingEventResponse.status, 200);
  assert.equal((await conflictingEventResponse.json()).rejected, true);

  const duplicateWebhook = await sendWebhook();
  const duplicateWebhookPayload = await duplicateWebhook.json();
  assert.equal(duplicateWebhook.status, 200, JSON.stringify(duplicateWebhookPayload));
  assert.equal(duplicateWebhookPayload.duplicate, true, JSON.stringify(duplicateWebhookPayload));
  const expiryAfterDuplicate = new Database(TEST_DB_PATH);
  try {
    const row = expiryAfterDuplicate.prepare('SELECT subscription_expires_at FROM shops WHERE id = ?')
      .get(createdPayload.shop.id) as { subscription_expires_at: string };
    assert.equal(row.subscription_expires_at, getRenewedSubscriptionExpiry(expectedActiveRenewalExpiry, new Date(), 'monthly'));
  } finally {
    expiryAfterDuplicate.close();
  }

  const expiredAt = new Date(Date.now() - 4 * 86400000).toISOString();
  const expirationDb = new Database(TEST_DB_PATH);
  try {
    expirationDb.prepare('UPDATE shops SET subscription_status = ?, subscription_expires_at = ? WHERE id = ?')
      .run('active', expiredAt, createdPayload.shop.id);
  } finally {
    expirationDb.close();
  }
  const subscriptionOverview = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } });
  assert.equal(subscriptionOverview.status, 200);
  const expiredShop = (await subscriptionOverview.json()).shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(expiredShop.status, 'suspended');
  const merchantSessionAfterExpiry = await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: merchantCookie } });
  const expiredSession = await merchantSessionAfterExpiry.json();
  assert.equal(expiredSession.subscription.status, 'suspended');
  const persistedExpiry = new Database(TEST_DB_PATH);
  try {
    const storedStatus = persistedExpiry.prepare('SELECT subscription_status FROM shops WHERE id = ?').get(createdPayload.shop.id) as { subscription_status: string };
    assert.equal(storedStatus.subscription_status, 'suspended');
  } finally {
    persistedExpiry.close();
  }

  const refundPayload = JSON.stringify({
    event: 'payment.refunded',
    data: {
      status: 'refunded',
      reference: `GNP-${intent.payment_id}`,
      amount: 50000,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id, payment_type: 'subscription' },
    },
  });
  assert.equal((await sendSignedWebhook(refundPayload)).status, 200);
  const refundDb = new Database(TEST_DB_PATH);
  try {
    assert.equal((refundDb.prepare('SELECT status FROM subscription_payment_intents WHERE id = ?').get(intent.payment_id) as { status: string }).status, 'refunded');
    assert.ok(refundDb.prepare(`SELECT id FROM admin_audit_logs WHERE action = 'geniuspay_refund_review'
      AND details LIKE ?`).get(`%${intent.payment_id}%`));
  } finally {
    refundDb.close();
  }

  const partialRefundPayload = JSON.stringify({
    id: `partial-refund-${Date.now()}`,
    event: 'payment.refunded',
    data: { transaction: {
      status: 'refunded',
      reference: `GNP-${activeRenewalIntent.payment_id}`,
      amount: 5000,
      amount_refunded: 1200,
      currency: 'XOF',
      metadata: { subscription_payment_id: activeRenewalIntent.payment_id, payment_type: 'subscription' },
    } },
  });
  assert.equal((await sendSignedWebhook(partialRefundPayload)).status, 200);
  const partialRefundDb = new Database(TEST_DB_PATH);
  try {
    assert.equal((partialRefundDb.prepare('SELECT status FROM subscription_payment_intents WHERE id = ?').get(activeRenewalIntent.payment_id) as { status: string }).status, 'paid');
    assert.ok(partialRefundDb.prepare(`SELECT id FROM admin_audit_logs WHERE action = 'geniuspay_partial_refund_review'
      AND details LIKE ?`).get(`%${activeRenewalIntent.payment_id}%`));
  } finally {
    partialRefundDb.close();
  }

  const configuredPricesResponse = await fetch(`${BASE_URL}/api/admin/subscription-plans`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(configuredPricesResponse.status, 200);
  const originalPrices = (await configuredPricesResponse.json()).prices;
  const updatedPrices = { standard: 3300, premium: 6200, pro: 9500 };
  try {
    const updatePrices = await fetch(`${BASE_URL}/api/admin/subscription-plans`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ prices: updatedPrices, expected_prices: originalPrices }),
    });
    assert.equal(updatePrices.status, 200, await updatePrices.text());

    const configuredIntentResponse = await fetch(paymentEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
      body: JSON.stringify({ tier: 'premium', term: 'annual' }),
    });
    const configuredIntent = await configuredIntentResponse.json();
    assert.equal(configuredIntentResponse.status, 201, JSON.stringify(configuredIntent));
    assert.equal(configuredIntent.amount, 62000);

    const originalPaidIntent = new Database(TEST_DB_PATH, { readonly: true });
    try {
      const originalAmount = originalPaidIntent.prepare(
        'SELECT amount FROM subscription_payment_intents WHERE id = ?',
      ).get(intent.payment_id) as { amount: number };
      assert.equal(originalAmount.amount, 50000);
    } finally {
      originalPaidIntent.close();
    }
  } finally {
    const restorePrices = await fetch(`${BASE_URL}/api/admin/subscription-plans`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ prices: originalPrices, expected_prices: updatedPrices }),
    });
    assert.equal(restorePrices.status, 200, await restorePrices.text());
  }
});

test('scheduled tier checkout preserves the paid plan until the scheduled date', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique changement programmé GeniusPay',
      whatsapp_number: `+22507${String(Date.now() + 2).slice(-8)}`,
      email: `scheduled-plan-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const merchantCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);

  const effectiveAt = `${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
  const activeDb = new Database(TEST_DB_PATH);
  try {
    activeDb.prepare(`UPDATE shops
      SET subscription_status = 'active', selected_subscription_tier = 'premium',
        subscription_expires_at = ?, pending_subscription_tier = 'pro',
        pending_subscription_effective_at = ?
      WHERE id = ?`).run(effectiveAt, effectiveAt, createdPayload.shop.id);
  } finally {
    activeDb.close();
  }

  const paymentEndpoint = `${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`;
  const rejectedCheckout = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium' }),
  });
  assert.equal(rejectedCheckout.status, 409);
  assert.equal((await rejectedCheckout.json()).code, 'scheduled_subscription_tier_mismatch');

  const checkout = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro' }),
  });
  const checkoutPayload = await checkout.json();
  assert.equal(checkout.status, 201, JSON.stringify(checkoutPayload));
  assert.equal(checkoutPayload.amount, 8000);

  const webhookPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${checkoutPayload.payment_id}`,
      amount: 8000,
      currency: 'XOF',
      metadata: { subscription_payment_id: checkoutPayload.payment_id, payment_type: 'subscription' },
    },
  });
  const webhook = await fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSignedWebhookHeaders(webhookPayload) },
    body: webhookPayload,
  });
  assert.equal(webhook.status, 200, await webhook.text());

  const persistedDb = new Database(TEST_DB_PATH, { readonly: true });
  let savedSubscription: {
    subscription_status: 'active';
    selected_subscription_tier: 'premium';
    subscription_expires_at: string;
    pending_subscription_tier: 'pro';
    pending_subscription_effective_at: string | null;
  };
  try {
    savedSubscription = persistedDb.prepare(`SELECT subscription_status, selected_subscription_tier,
      subscription_expires_at, pending_subscription_tier, pending_subscription_effective_at
      FROM shops WHERE id = ?`).get(createdPayload.shop.id) as typeof savedSubscription;
  } finally {
    persistedDb.close();
  }
  assert.equal(savedSubscription.selected_subscription_tier, 'premium');
  assert.equal(savedSubscription.pending_subscription_tier, 'pro');
  assert.equal(savedSubscription.pending_subscription_effective_at, effectiveAt);

  const beforeChange = getSubscriptionState(savedSubscription, new Date(Date.parse(effectiveAt) - 86400000));
  assert.equal(beforeChange.plan, 'premium');
  assert.equal(beforeChange.upcomingPlan, 'pro');
  const afterChange = getSubscriptionState(savedSubscription, new Date(Date.parse(effectiveAt) + 1000));
  assert.equal(afterChange.plan, 'pro');
  assert.equal(afterChange.upcomingPlan, null);
  assert.equal(afterChange.isActive, true);

  const stateDb = new Database(TEST_DB_PATH);
  const renewedExpiry = (stateDb.prepare('SELECT subscription_expires_at FROM shops WHERE id = ?')
    .get(createdPayload.shop.id) as { subscription_expires_at: string }).subscription_expires_at;
  stateDb.prepare('UPDATE shops SET subscription_cancel_at = ? WHERE id = ?')
    .run(renewedExpiry, createdPayload.shop.id);
  stateDb.close();
  const cancellationRenewalCheckout = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro' }),
  });
  const cancellationRenewalPayload = await cancellationRenewalCheckout.json();
  assert.equal(cancellationRenewalCheckout.status, 201, JSON.stringify(cancellationRenewalPayload));

  const cancellationRenewalWebhookPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${cancellationRenewalPayload.payment_id}`,
      amount: cancellationRenewalPayload.amount,
      currency: 'XOF',
      metadata: {
        subscription_payment_id: cancellationRenewalPayload.payment_id,
        payment_type: 'subscription',
      },
    },
  });
  const cancellationRenewalWebhook = await fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSignedWebhookHeaders(cancellationRenewalWebhookPayload) },
    body: cancellationRenewalWebhookPayload,
  });
  assert.equal(cancellationRenewalWebhook.status, 200, await cancellationRenewalWebhook.text());

  const renewedDb = new Database(TEST_DB_PATH, { readonly: true });
  const renewedSubscription = renewedDb.prepare(
    'SELECT subscription_status, subscription_cancel_at FROM shops WHERE id = ?',
  ).get(createdPayload.shop.id) as { subscription_status: string; subscription_cancel_at: string | null };
  renewedDb.close();
  assert.equal(renewedSubscription.subscription_status, 'active');
  assert.equal(renewedSubscription.subscription_cancel_at, null);

  const suspensionDb = new Database(TEST_DB_PATH);
  suspensionDb.prepare(`UPDATE shops SET subscription_cancel_at = NULL, subscription_status = 'suspended',
    subscription_admin_suspended_at = ?, subscription_admin_suspended_status = 'active' WHERE id = ?`)
    .run(new Date().toISOString(), createdPayload.shop.id);
  suspensionDb.close();
  const suspendedCheckout = await fetch(paymentEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium' }),
  });
  assert.equal(suspendedCheckout.status, 409);
  assert.equal((await suspendedCheckout.json()).code, 'subscription_access_suspended');
});

test('GeniusPay payment intent creation is rate-limited before merchant authentication', async () => {
  const endpoint = `${BASE_URL}/api/shops/987654321/subscription-payments`;
  const requestPayment = () => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'standard' }),
  });
  const responses = await Promise.all(Array.from({ length: 21 }, requestPayment));
  assert.equal(responses.filter((response) => response.status === 429).length, 1);
  assert.ok(responses.filter((response) => response.status === 401).length >= 1);
});

test('merchant trial provides basic analytics limited to seven days', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Statistiques Pro',
      whatsapp_number: `+22507${String(Date.now() + 1).slice(-8)}`,
      email: `pro-analytics-${Date.now()}@example.com`,
      pin_code: '684219',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));
  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const merchantCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);
  const trial = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro' }),
  });
  assert.equal(trial.status, 200, await trial.text());
  const analytics = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/analytics?days=30`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(analytics.status, 200);
  const analyticsPayload = await analytics.json();
  assert.equal(analyticsPayload.days, 7);
});

test('admin can review and extend expiring trials with a durable audit entry', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique essai à relancer',
      whatsapp_number: `+22507${String(Date.now() + 2).slice(-8)}`,
      email: `trial-admin-${Date.now()}@example.com`,
      pin_code: '867530',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  const merchantCookie = merchantLogin.headers.get('set-cookie')?.split(';')[0];
  assert.equal(merchantLogin.status, 200);
  assert.ok(merchantCookie);

  const consentUnauthorized = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-reminder-consent`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(consentUnauthorized.status, 401);
  const consentEnabled = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-reminder-consent`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(consentEnabled.status, 200);
  assert.equal((await consentEnabled.json()).enabled, true);

  const trial = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'standard' }),
  });
  assert.equal(trial.status, 200, await trial.text());

  const upcomingTrialEnd = new Date(Date.now() + 4 * 86400000).toISOString();
  let testDb = new Database(TEST_DB_PATH);
  try {
    testDb.prepare('UPDATE shops SET trial_end = ?, subscription_expires_at = ? WHERE id = ?')
      .run(upcomingTrialEnd, '2026-10-31', createdPayload.shop.id);
  } finally {
    testDb.close();
  }

  const unauthorized = await fetch(`${BASE_URL}/api/admin/subscriptions`);
  assert.equal(unauthorized.status, 401);
  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'geniuspay-test-admin-key' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.equal(adminLogin.status, 200);
  assert.ok(adminCookie);

  const subscriptionsResponse = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } });
  const subscriptions = await subscriptionsResponse.json();
  assert.equal(subscriptionsResponse.status, 200, JSON.stringify(subscriptions));
  assert.ok(subscriptions.summary.active_trials >= 1);
  assert.ok(subscriptions.summary.trials_expiring_7d >= 1);
  assert.ok(subscriptions.summary.whatsapp_reminder_opt_ins >= 1);
  const trialShop = subscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(trialShop.status, 'trialing');
  assert.equal(trialShop.trial_days_remaining, 4);
  assert.equal(trialShop.whatsapp_reminders_opt_in, true);
  assert.equal(trialShop.trial_expiry_mismatch, true);

  const reconcileResponse = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/reconcile-trial-expiry`, {
    method: 'PATCH',
    headers: { Cookie: adminCookie },
  });
  assert.equal(reconcileResponse.status, 200, await reconcileResponse.text());
  const reconciledSubscriptions = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const reconciledShop = reconciledSubscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(reconciledShop.trial_expiry_mismatch, false);
  assert.equal(Date.parse(reconciledShop.subscription_expires_at), Date.parse(upcomingTrialEnd));

  const extensionWithoutReason = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 7, expected_trial_end: upcomingTrialEnd }),
  });
  assert.equal(extensionWithoutReason.status, 400);
  assert.match((await extensionWithoutReason.json()).error, /motif explicite d’au moins 10 caractères/i);

  testDb = new Database(TEST_DB_PATH);
  try {
    testDb.prepare('UPDATE shops SET subscription_expires_at = ? WHERE id = ?')
      .run('2026-10-31', createdPayload.shop.id);
  } finally {
    testDb.close();
  }

  const extensionResponse = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      days: 7,
      expected_trial_end: upcomingTrialEnd,
      reason: 'Incident de paiement documenté',
    }),
  });
  const extension = await extensionResponse.json();
  assert.equal(extensionResponse.status, 200, JSON.stringify(extension));
  assert.ok(Date.parse(extension.trial_end) >= Date.parse(upcomingTrialEnd) + 7 * 86400000 - 1000);
  assert.equal(Date.parse(extension.shop.subscription_expires_at), Date.parse(extension.trial_end));

  const refreshedSubscriptions = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.ok(refreshedSubscriptions.audit_logs.some((entry: { action: string; shop_id: number; details: string }) =>
    entry.action === 'trial_extended'
    && entry.shop_id === createdPayload.shop.id
    && entry.details.includes('Incident de paiement documenté')));
  assert.ok(refreshedSubscriptions.audit_logs.some((entry: { action: string; shop_id: number }) => entry.action === 'trial_expiry_reconciled' && entry.shop_id === createdPayload.shop.id));
  const afterFirstExtension = refreshedSubscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(afterFirstExtension.trial_extension_days_used, 7);
  assert.equal(afterFirstExtension.trial_extension_days_remaining, 23);

  const overLimitExtension = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 30, expected_trial_end: extension.trial_end, reason: 'Prolongation exceptionnelle demandée' }),
  });
  assert.equal(overLimitExtension.status, 409);
  assert.equal((await overLimitExtension.json()).days_remaining, 23);

  const finalAllowedExtension = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 23, expected_trial_end: extension.trial_end, reason: 'Finalisation de la période accordée' }),
  });
  assert.equal(finalAllowedExtension.status, 200);
  const finalExtension = await finalAllowedExtension.json();
  const cappedSubscriptions = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const cappedShop = cappedSubscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(cappedShop.trial_extension_days_used, 30);
  assert.equal(cappedShop.trial_extension_days_remaining, 0);
  const extensionAtCap = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 1, expected_trial_end: finalExtension.trial_end, reason: 'Prolongation au-delà du plafond' }),
  });
  assert.equal(extensionAtCap.status, 409);

  testDb = new Database(TEST_DB_PATH);
  try {
    testDb.prepare(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
      VALUES ('super_admin', 'trial_extended', ?, ?, ?)`)
      .run(createdPayload.shop.id, JSON.stringify({ days: 5 }), new Date().toISOString());
  } finally {
    testDb.close();
  }
  const overLimitSubscriptions = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const overLimitShop = overLimitSubscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(overLimitShop.trial_extension_days_used, 35);
  assert.equal(overLimitShop.trial_extension_days_remaining, 0);
  assert.equal(overLimitShop.trial_extension_over_limit, true);
  const extensionAboveHistoricalCap = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 1, expected_trial_end: finalExtension.trial_end, reason: 'Dépassement historique constaté' }),
  });
  assert.equal(extensionAboveHistoricalCap.status, 409);
  assert.match((await extensionAboveHistoricalCap.json()).error, /cumul historique de 35 jours/i);

  testDb = new Database(TEST_DB_PATH);
  try {
    testDb.prepare(`UPDATE shops SET subscription_status = 'active', subscription_expires_at = NULL WHERE id = ?`)
      .run(createdPayload.shop.id);
  } finally {
    testDb.close();
  }
  const manualExpiryResponse = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/set-expiry`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      expiry_date: '2026-11-30',
      expected_subscription_expires_at: null,
      reason: 'Justificatif de paiement vérifié.',
    }),
  });
  const manualExpiry = await manualExpiryResponse.json();
  assert.equal(manualExpiryResponse.status, 200, JSON.stringify(manualExpiry));
  assert.equal(manualExpiry.subscription_expires_at, '2026-11-30T23:59:59.999Z');
  const expiryAudit = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.ok(expiryAudit.audit_logs.some((entry: { action: string; shop_id: number; details: string }) =>
    entry.action === 'subscription_expiry_corrected'
    && entry.shop_id === createdPayload.shop.id
    && entry.details.includes('Justificatif de paiement vérifié.')));

  const consentDisabled = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-reminder-consent`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(consentDisabled.status, 200);
  assert.equal((await consentDisabled.json()).enabled, false);
  const reminderWithoutConsent = await fetch(`${BASE_URL}/api/admin/shops/${createdPayload.shop.id}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ template: 'trial_expiring' }),
  });
  assert.equal(reminderWithoutConsent.status, 409);
});