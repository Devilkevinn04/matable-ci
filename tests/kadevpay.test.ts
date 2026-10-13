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
import Database from 'better-sqlite3';
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
  const firstPayment = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: clientRequestId }),
  });
  const firstPayload = await firstPayment.json();
  assert.equal(firstPayment.status, 201, JSON.stringify(firstPayload));

  const repeatedPayment = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'monthly', client_request_id: clientRequestId }),
  });
  const repeatedPayload = await repeatedPayment.json();
  assert.equal(repeatedPayment.status, 200, JSON.stringify(repeatedPayload));
  assert.equal(repeatedPayload.payment_id, firstPayload.payment_id);

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
  assert.equal(startTrial.status, 200);

  const expiryDb = new Database(TEST_DB_PATH);
  try {
    const expiredAt = new Date(Date.now() - 3 * 86400000).toISOString();
    expiryDb.prepare('UPDATE shops SET trial_end = ?, subscription_expires_at = ? WHERE id = ?')
      .run(expiredAt, expiredAt, createdPayload.shop.id);
  } finally {
    expiryDb.close();
  }

  const intentResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'premium', term: 'annual' }),
  });
  const intent = await intentResponse.json();
  assert.equal(intentResponse.status, 201, JSON.stringify(intent));
  assert.equal(intent.amount, 50000);
  assert.equal(intent.currency, 'XOF');
  assert.equal(intent.public_key, 'kdvp_test_public_key');
  assert.equal(intent.is_test, true);
  assert.equal('secret_key' in intent, false);

  const webhookPayload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'paid',
      reference: `KDV-${Date.now()}`,
      amount: 50000,
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
  assert.ok(Date.parse(paidPayload.subscription.expiresAt) > Date.now() + 360 * 86400000);

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
      reference: `KDV-FAILED-${Date.now()}`,
      amount: 5000,
      currency: 'XOF',
      metadata: { subscription_payment_id: failedIntent.payment_id },
    },
  });
  const failedWebhookSignature = createHmac('sha512', 'kadevpay-test-webhook-secret').update(failedWebhookPayload).digest('hex');
  const failedWebhook = await fetch(`${BASE_URL}/api/webhooks/kadevpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kadevpay-signature': failedWebhookSignature },
    body: failedWebhookPayload,
  });
  assert.equal(failedWebhook.status, 200, await failedWebhook.text());
  const failedStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/subscription-payments/${failedIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  });
  assert.equal((await failedStatus.json()).status, 'failed');

  const unauthenticatedPayments = await fetch(`${BASE_URL}/api/admin/payments`);
  assert.equal(unauthenticatedPayments.status, 401);
  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'kadevpay-test-admin-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const finance = await fetch(`${BASE_URL}/api/admin/payments?days=30`, { headers: { Cookie: adminCookie } });
  assert.equal(finance.status, 200);
  const financeData = await finance.json();
  assert.equal(financeData.summary.confirmed_count, 1);
  assert.equal(financeData.summary.collected_amount, 50000);
  assert.equal(financeData.summary.pending_count, 0);
  assert.equal(financeData.summary.failed_count, 1);
  assert.ok(financeData.summary.active_subscriptions >= 1);
  assert.ok(financeData.summary.mrr >= 5000);
  assert.ok(financeData.summary.mrr_by_tier.find((tier: { tier: string }) => tier.tier === 'premium')?.amount >= 5000);
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
  const financeAfterMorePayments = await fetch(`${BASE_URL}/api/admin/payments?days=30`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.equal(financeAfterMorePayments.payments.length, 200);
  assert.equal(financeAfterMorePayments.summary.confirmed_count, 206);
  assert.equal(financeAfterMorePayments.summary.collected_amount, 70500);
  assert.equal(financeAfterMorePayments.summary.promotions.count, 205);
  assert.equal(financeAfterMorePayments.summary.promotions.amount, 20500);
  assert.equal(financeAfterMorePayments.summary.failed_count, 1);

  const duplicateWebhook = await sendWebhook();
  assert.equal(duplicateWebhook.status, 200);
  assert.equal((await duplicateWebhook.json()).duplicate, true);

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
    body: JSON.stringify({ key: 'kadevpay-test-admin-key' }),
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
    body: JSON.stringify({ days: 7, expected_trial_end: upcomingTrialEnd }),
  });
  const extension = await extensionResponse.json();
  assert.equal(extensionResponse.status, 200, JSON.stringify(extension));
  assert.ok(Date.parse(extension.trial_end) >= Date.parse(upcomingTrialEnd) + 7 * 86400000 - 1000);
  assert.equal(Date.parse(extension.shop.subscription_expires_at), Date.parse(extension.trial_end));

  const refreshedSubscriptions = await fetch(`${BASE_URL}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  assert.ok(refreshedSubscriptions.audit_logs.some((entry: { action: string; shop_id: number }) => entry.action === 'trial_extended' && entry.shop_id === createdPayload.shop.id));
  assert.ok(refreshedSubscriptions.audit_logs.some((entry: { action: string; shop_id: number }) => entry.action === 'trial_expiry_reconciled' && entry.shop_id === createdPayload.shop.id));
  const afterFirstExtension = refreshedSubscriptions.shops.find((shop: { id: number }) => shop.id === createdPayload.shop.id);
  assert.equal(afterFirstExtension.trial_extension_days_used, 7);
  assert.equal(afterFirstExtension.trial_extension_days_remaining, 23);

  const overLimitExtension = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 30, expected_trial_end: extension.trial_end }),
  });
  assert.equal(overLimitExtension.status, 409);
  assert.equal((await overLimitExtension.json()).days_remaining, 23);

  const finalAllowedExtension = await fetch(`${BASE_URL}/api/admin/subscriptions/${createdPayload.shop.id}/extend-trial`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 23, expected_trial_end: extension.trial_end }),
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
    body: JSON.stringify({ days: 1, expected_trial_end: finalExtension.trial_end }),
  });
  assert.equal(extensionAtCap.status, 409);

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