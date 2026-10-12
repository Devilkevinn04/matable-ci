import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_PORT = 43126;
const TEST_DB_PATH = path.join(tmpdir(), `matable-commerce-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const WEBHOOK_SECRET = 'subscription-commerce-test-secret';
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
  throw new Error('Subscription commerce test server did not become ready in time.');
}

before(async () => {
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'subscription-commerce-test-admin-key',
      KADEVPAY_PUBLIC_KEY: 'kdvp_test_public_key',
      KADEVPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
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

async function signedWebhook(payload: string) {
  const signature = createHmac('sha512', WEBHOOK_SECRET).update(payload).digest('hex');
  return fetch(`${BASE_URL}/api/webhooks/kadevpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kadevpay-signature': signature },
    body: payload,
  });
}

test('Pro subscription exposes consented product stats and activates discounted boosts exactly once', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique test stats et boost',
      whatsapp_number: `+22507${String(Date.now()).slice(-8)}`,
      email: `commerce-${Date.now()}@example.com`,
      pin_code: '224466',
      category: 'beauty',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  const createdPayload = await created.json();
  assert.equal(created.status, 200, JSON.stringify(createdPayload));
  const shopId = createdPayload.shop.id;

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(merchantLogin.status, 200);
  const merchantCookie = merchantLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);

  const trial = await fetch(`${BASE_URL}/api/shops/${shopId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro' }),
  });
  const trialPayload = await trial.json();
  assert.equal(trial.status, 200, JSON.stringify(trialPayload));
  assert.equal(trialPayload.shop.subscription.plan, 'standard');
  assert.equal(trialPayload.shop.subscription.trialDaysRemaining, 7);
  const earlyPaymentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro', term: 'annual' }),
  });
  assert.equal(earlyPaymentResponse.status, 409);
  assert.match((await earlyPaymentResponse.json()).error, /essai Standard reste actif/i);
  const unverifiedBoost = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 7 }),
  });
  assert.equal(unverifiedBoost.status, 409);

  const verificationDb = new Database(TEST_DB_PATH);
  verificationDb.prepare("UPDATE shops SET merchant_verification_status = 'verified' WHERE id = ?").run(shopId);
  verificationDb.close();
  const publication = await fetch(`${BASE_URL}/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(publication.status, 200, await publication.text());
  const emptyCatalogBoost = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 7 }),
  });
  assert.equal(emptyCatalogBoost.status, 409);

  const tooManyTrialPhotos = await fetch(`${BASE_URL}/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({
      title: 'Produit avec trop de photos',
      price: 1500,
      stock: 5,
      image_url: 'https://example.com/product-main.jpg',
      gallery_images: ['https://example.com/product-extra-1.jpg', 'https://example.com/product-extra-2.jpg'],
    }),
  });
  assert.equal(tooManyTrialPhotos.status, 409);

  const firstProductResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ title: 'Produit 1', price: 1500, stock: 5 }),
  });
  const firstProductPayload = await firstProductResponse.json();
  assert.equal(firstProductResponse.status, 200, JSON.stringify(firstProductPayload));
  const tooManyPhotosOnUpdate = await fetch(`${BASE_URL}/api/shops/${shopId}/products/${firstProductPayload.product.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({
      image_url: 'https://example.com/product-main.jpg',
      gallery_images: ['https://example.com/product-extra-1.jpg', 'https://example.com/product-extra-2.jpg'],
    }),
  });
  assert.equal(tooManyPhotosOnUpdate.status, 409);
  const withinTrialPhotoLimit = await fetch(`${BASE_URL}/api/shops/${shopId}/products/${firstProductPayload.product.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ image_url: 'https://example.com/product-main.jpg', gallery_images: ['https://example.com/product-extra-1.jpg'] }),
  });
  assert.equal(withinTrialPhotoLimit.status, 200, await withinTrialPhotoLimit.text());
  const singleProductBoost = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 7 }),
  });
  assert.equal(singleProductBoost.status, 409);
  assert.match((await singleProductBoost.json()).error, /au moins 2 produits/i);

  const testDb = new Database(TEST_DB_PATH);
  try {
    const expiredAt = new Date(Date.now() - 3 * 86400000).toISOString();
    testDb.prepare(`UPDATE shops SET trial_end = ?, subscription_expires_at = ? WHERE id = ?`)
      .run(expiredAt, expiredAt, shopId);
  } finally {
    testDb.close();
  }

  const subscriptionIntentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro', term: 'annual' }),
  });
  const subscriptionIntent = await subscriptionIntentResponse.json();
  assert.equal(subscriptionIntentResponse.status, 201, JSON.stringify(subscriptionIntent));
  assert.equal(subscriptionIntent.amount, 80000);
  const subscriptionPaymentBody = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'paid',
      reference: `KDV-PRO-${Date.now()}`,
      amount: 80000,
      currency: 'XOF',
      metadata: { subscription_payment_id: subscriptionIntent.payment_id },
    },
  });
  assert.equal((await signedWebhook(subscriptionPaymentBody)).status, 200);
  const paidSession = await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: merchantCookie } }).then((response) => response.json());
  assert.equal(paidSession.subscription.plan, 'pro');
  assert.ok(Date.parse(paidSession.subscription.expiresAt) > Date.now() + 360 * 86400000);

  const products: { id: number; title: string }[] = [firstProductPayload.product];
  for (let index = 1; index < 2; index += 1) {
    const productResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
      body: JSON.stringify({ title: `Produit ${index + 1}`, price: 1500, stock: 5 }),
    });
    const productPayload = await productResponse.json();
    assert.equal(productResponse.status, 200, JSON.stringify(productPayload));
    products.push(productPayload.product);
  }

  const sessionId = 'analytics-consented-session';
  const analyticsEvent = (productId: number, eventType: 'product_view' | 'product_click') => fetch(`${BASE_URL}/api/analytics/product-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop_id: shopId, product_id: productId, event_type: eventType, session_id: sessionId }),
  });
  assert.equal((await analyticsEvent(products[0].id, 'product_view')).status, 204);
  assert.equal((await analyticsEvent(products[0].id, 'product_view')).status, 204);
  assert.equal((await analyticsEvent(products[0].id, 'product_click')).status, 204);
  assert.equal((await analyticsEvent(products[0].id, 'product_click')).status, 204);
  const analyticsResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/analytics?days=7`, { headers: { Cookie: merchantCookie } });
  const analytics = await analyticsResponse.json();
  assert.equal(analyticsResponse.status, 200, JSON.stringify(analytics));
  assert.equal(analytics.summary.product_views, 1);
  assert.equal(analytics.summary.product_clicks, 2);
  assert.deepEqual(analytics.top_products[0], { product_id: products[0].id, title: products[0].title, views: 1, clicks: 2 });

  const subscriptionExpiryBeforeBoost = paidSession.subscription.expiresAt;
  const boostIntentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 7, placement: 'home' }),
  });
  const boostIntent = await boostIntentResponse.json();
  assert.equal(boostIntentResponse.status, 201, JSON.stringify(boostIntent));
  assert.equal(boostIntent.amount, 1700);
  assert.equal(boostIntent.placement, 'home');
  assert.equal(boostIntent.scheduled, false);
  const boostPaymentBody = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'paid',
      reference: `KDV-BOOST-${Date.now()}`,
      amount: boostIntent.amount,
      currency: 'XOF',
      metadata: { subscription_payment_id: boostIntent.payment_id },
    },
  });
  assert.equal((await signedWebhook(boostPaymentBody)).status, 200);
  const repeatedWebhook = await signedWebhook(boostPaymentBody);
  assert.equal(repeatedWebhook.status, 200);
  assert.equal((await repeatedWebhook.json()).duplicate, true);

  const boostStatusResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments/${boostIntent.payment_id}`, { headers: { Cookie: merchantCookie } });
  const boostStatus = await boostStatusResponse.json();
  assert.equal(boostStatus.status, 'paid');
  assert.equal(boostStatus.boost.status, 'active');
  assert.equal(boostStatus.boost.placement, 'home');
  assert.equal(Date.parse(boostStatus.boost.ends_at) - Date.parse(boostStatus.boost.starts_at), 7 * 86400000);
  const boostStoreVisit = await fetch(`${BASE_URL}/api/analytics/page-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      path: `/${createdPayload.shop.slug}`,
      session_id: 'boost-recap-consented-visitor',
    }),
  });
  assert.equal(boostStoreVisit.status, 204);
  const boostOrderResponse = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Visiteur boost',
      customer_phone: '+2250700000011',
      delivery_location: 'Abidjan',
      payment_method_preference: 'wave',
      items: [{ product_id: products[0].id, quantity: 1 }],
    }),
  });
  const boostOrder = await boostOrderResponse.json();
  assert.equal(boostOrderResponse.status, 200, JSON.stringify(boostOrder));
  const boostOrderClick = await fetch(`${BASE_URL}/api/orders/${boostOrder.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: boostOrder.whatsapp_tracking_token }),
  });
  assert.equal(boostOrderClick.status, 200);
  const boostHistoryResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/boosts`, { headers: { Cookie: merchantCookie } });
  const boostHistory = await boostHistoryResponse.json();
  assert.equal(boostHistoryResponse.status, 200, JSON.stringify(boostHistory));
  assert.equal(boostHistory.boosts[0].placement, 'home');
  assert.equal(boostHistory.boosts[0].views, 1);
  assert.equal(boostHistory.boosts[0].whatsapp_clicks, 1);
  const sponsoredDirectory = await fetch(`${BASE_URL}/api/shops`).then((response) => response.json());
  const sponsoredShop = sponsoredDirectory.find((shop: { id: number }) => shop.id === shopId);
  assert.ok(sponsoredShop.boost_placements.includes('home'));
  assert.equal(sponsoredShop.is_sponsored, true);
  const directory = await fetch(`${BASE_URL}/api/shops`).then((response) => response.json());
  assert.equal(directory.find((listedShop: { id: number }) => listedShop.id === shopId)?.is_sponsored, true);
  const sessionAfterBoost = await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: merchantCookie } }).then((response) => response.json());
  assert.equal(sessionAfterBoost.subscription.expiresAt, subscriptionExpiryBeforeBoost);

  const persistedDatabase = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const row = persistedDatabase.prepare('SELECT COUNT(*) AS total FROM shop_boosts WHERE shop_id = ? AND status = ?').get(shopId, 'active') as { total: number };
    assert.equal(row.total, 1);
  } finally {
    persistedDatabase.close();
  }
});
