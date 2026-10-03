import test from 'node:test';
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { getRenewedSubscriptionExpiry, isValidKadevPaySignature } from '../server/services/kadevPay';
import { getSubscriptionState } from '../server/services/businessRules';

const TEST_PORT = 43125;
const TEST_DB_PATH = path.join(tmpdir(), `matable-kadevpay-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE_URL}/api/health`)).ok) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error('KadevPay test server did not become ready in time.');
}

before(async () => {
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'kadevpay-test-admin-key',
      KADEVPAY_PUBLIC_KEY: 'kdvp_test_public_key',
      KADEVPAY_WEBHOOK_SECRET: 'kadevpay-test-webhook-secret',
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
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

test('KadevPay webhook signatures are checked against the exact raw body', () => {
  const secret = 'test-webhook-secret';
  const rawBody = Buffer.from('{"event":"payment.success","data":{"status":"paid"}}');
  const signature = createHmac('sha512', secret).update(rawBody).digest('hex');

  assert.equal(isValidKadevPaySignature(rawBody, signature, secret), true);
  assert.equal(isValidKadevPaySignature(Buffer.from(`${rawBody.toString()} `), signature, secret), false);
  assert.equal(isValidKadevPaySignature(rawBody, signature, ''), false);
  assert.equal(isValidKadevPaySignature(rawBody, 'invalid', secret), false);
});

test('subscription renewal adds thirty days after the later of now or current expiry', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  assert.equal(
    getRenewedSubscriptionExpiry('2026-10-10T00:00:00.000Z', now),
    '2026-11-09T00:00:00.000Z',
  );
  assert.equal(
    getRenewedSubscriptionExpiry('2026-09-01T00:00:00.000Z', now),
    '2026-11-02T00:00:00.000Z',
  );
});

test('paid subscriptions expire when their persisted expiry date is reached', () => {
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

  assert.equal(expired.status, 'expired');
  assert.equal(expired.isActive, false);
  assert.equal(current.status, 'active');
  assert.equal(current.isActive, true);
});

test('KadevPay renewals require a signed webhook and apply exactly once', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique renouvellement Kadev',
      whatsapp_number: `+22507${String(Date.now()).slice(-8)}`,
      email: `kadev-${Date.now()}@example.com`,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
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
  assert.equal(startTrial.status, 200);

  const intentResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium' }),
  });
  const intent = await intentResponse.json();
  assert.equal(intentResponse.status, 201, JSON.stringify(intent));
  assert.equal(intent.amount, 4000);
  assert.equal(intent.currency, 'XOF');
  assert.equal(intent.public_key, 'kdvp_test_public_key');
  assert.equal(intent.is_test, true);
  assert.equal('secret_key' in intent, false);

  const webhookPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'paid',
      reference: `KDV-${Date.now()}`,
      amount: 4000,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id },
    },
  });
  const invalidWebhook = await fetch(`${BASE_URL}/api/webhooks/kadevpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kadevpay-signature': '0'.repeat(128) },
    body: webhookPayload,
  });
  assert.equal(invalidWebhook.status, 401);

  const pendingStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(pendingStatus.status, 200);
  assert.equal((await pendingStatus.json()).status, 'pending');

  const signature = createHmac('sha512', 'kadevpay-test-webhook-secret').update(webhookPayload).digest('hex');
  const sendWebhook = () => fetch(`${BASE_URL}/api/webhooks/kadevpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kadevpay-signature': signature },
    body: webhookPayload,
  });
  const acceptedWebhook = await sendWebhook();
  assert.equal(acceptedWebhook.status, 200, await acceptedWebhook.text());

  const paidStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${intent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal(paidStatus.status, 200);
  const paidPayload = await paidStatus.json();
  assert.equal(paidPayload.status, 'paid');
  assert.equal(paidPayload.subscription.status, 'active');
  assert.ok(Date.parse(paidPayload.subscription.expiresAt) > Date.now());

  const duplicateWebhook = await sendWebhook();
  assert.equal(duplicateWebhook.status, 200);
  assert.equal((await duplicateWebhook.json()).duplicate, true);
});