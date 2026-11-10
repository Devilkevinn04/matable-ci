import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_PORT = 43126;
const TEST_DB_PATH = path.join(tmpdir(), `matable-commerce-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const WEBHOOK_SECRET = 'subscription-commerce-test-secret';
let serverProcess: ReturnType<typeof spawn> | null = null;
let providerServer: ReturnType<typeof createServer> | null = null;
let providerReference = 0;

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
  providerServer = createServer((request, response) => {
    if (request.method === 'GET') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: false, error: { code: 'TRANSACTION_NOT_FOUND' } }));
      return;
    }
    providerReference += 1;
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => { rawBody += chunk; });
    request.on('end', () => {
      const body = JSON.parse(rawBody) as { metadata?: { subscription_payment_id?: string } };
      const paymentId = body.metadata?.subscription_payment_id || String(providerReference);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: true, data: { reference: `GNP-${paymentId}`, checkout_url: `https://checkout.geniuspay.ci/${providerReference}` } }));
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
      ADMIN_ACCESS_KEY: 'subscription-commerce-test-admin-key',
      GENIUSPAY_API_KEY: 'pk_sandbox_subscription_commerce_test',
      GENIUSPAY_API_SECRET: 'subscription-commerce-api-secret',
      GENIUSPAY_API_URL: `http://127.0.0.1:${providerPort}/api/v1/merchant/payments`,
      GENIUSPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
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

async function signedWebhook(payload: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
  return fetch(`${BASE_URL}/api/webhooks/geniuspay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp },
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
  assert.ok(trialPayload.shop.subscription.trialDaysRemaining >= 59);
  assert.ok(trialPayload.shop.subscription.trialDaysRemaining <= 62);
  const earlyPaymentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier: 'pro', term: 'annual' }),
  });
  assert.equal(earlyPaymentResponse.status, 201);
  const earlyPayment = await earlyPaymentResponse.json();
  assert.equal(earlyPayment.amount, 80000);
  assert.equal(earlyPayment.currency, 'XOF');
  const unverifiedBoost = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 7 }),
  });
  assert.equal(unverifiedBoost.status, 409);

  const verificationDb = new Database(TEST_DB_PATH);
  verificationDb.prepare("UPDATE shops SET merchant_verification_status = 'verified', business_verification_status = 'approved' WHERE id = ?").run(shopId);
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
      description: 'Produit de test pour vérifier la limite de photos.',
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
    body: JSON.stringify({ title: 'Produit 1', description: 'Produit de test pour la boutique.', price: 1500, stock: 5 }),
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
      status: 'completed',
      reference: `GNP-${subscriptionIntent.payment_id}`,
      amount: 80000,
      currency: 'XOF',
      metadata: { subscription_payment_id: subscriptionIntent.payment_id, payment_type: 'subscription' },
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
      body: JSON.stringify({ title: `Produit ${index + 1}`, description: 'Produit de test pour le catalogue.', price: 1500, stock: 5 }),
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
      status: 'completed',
      reference: `GNP-${boostIntent.payment_id}`,
      amount: boostIntent.amount,
      currency: 'XOF',
      metadata: { subscription_payment_id: boostIntent.payment_id, payment_type: 'promotion' },
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

  const failedBoostIntentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 3, placement: 'category' }),
  });
  const failedBoostIntent = await failedBoostIntentResponse.json();
  assert.equal(failedBoostIntentResponse.status, 201, JSON.stringify(failedBoostIntent));
  const failedBoostWebhook = await signedWebhook(JSON.stringify({
    event: 'payment.failed',
    data: {
      status: 'failed',
      reference: `GNP-${failedBoostIntent.payment_id}`,
      amount: failedBoostIntent.amount,
      currency: 'XOF',
      metadata: { subscription_payment_id: failedBoostIntent.payment_id, payment_type: 'promotion' },
    },
  }));
  assert.equal(failedBoostWebhook.status, 200);
  const failedBoostStatus = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments/${failedBoostIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(failedBoostStatus.status, 'failed');
  assert.equal(failedBoostStatus.boost.status, 'cancelled');

  const sponsoredDirectory = await fetch(`${BASE_URL}/api/shops`).then((response) => response.json());
  const sponsoredShop = sponsoredDirectory.find((shop: { id: number }) => shop.id === shopId);
  assert.ok(sponsoredShop.boost_placements.includes('home'));
  assert.equal(sponsoredShop.is_sponsored, true);
  const directory = await fetch(`${BASE_URL}/api/shops`).then((response) => response.json());
  assert.equal(directory.find((listedShop: { id: number }) => listedShop.id === shopId)?.is_sponsored, true);
  const sessionAfterBoost = await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: merchantCookie } }).then((response) => response.json());
  assert.equal(sessionAfterBoost.subscription.expiresAt, subscriptionExpiryBeforeBoost);

  const lateBoostIntentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/boost-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ duration_days: 3, placement: 'home' }),
  });
  const lateBoostIntent = await lateBoostIntentResponse.json();
  assert.equal(lateBoostIntentResponse.status, 201, JSON.stringify(lateBoostIntent));
  const expiredReservationStart = new Date(Date.now() - 4 * 86400000).toISOString();
  const expiredReservationEnd = new Date(Date.now() - 86400000).toISOString();
  const expiredReservationAt = new Date(Date.now() - 60_000).toISOString();
  const reservationDb = new Database(TEST_DB_PATH);
  try {
    reservationDb.prepare(`UPDATE shop_boosts
      SET starts_at = ?, ends_at = ?, reservation_expires_at = ?
      WHERE payment_intent_id = ?`)
      .run(expiredReservationStart, expiredReservationEnd, expiredReservationAt, lateBoostIntent.payment_id);
  } finally {
    reservationDb.close();
  }
  const lateBoostWebhook = await signedWebhook(JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'completed',
      reference: `GNP-${lateBoostIntent.payment_id}`,
      amount: lateBoostIntent.amount,
      currency: 'XOF',
      metadata: { subscription_payment_id: lateBoostIntent.payment_id, payment_type: 'promotion' },
    },
  }));
  assert.equal(lateBoostWebhook.status, 200);
  const lateBoostStatus = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments/${lateBoostIntent.payment_id}`, {
    headers: { Cookie: merchantCookie },
  }).then((response) => response.json());
  assert.equal(lateBoostStatus.status, 'paid');
  assert.equal(lateBoostStatus.boost.status, 'active');
  assert.ok(Date.parse(lateBoostStatus.boost.starts_at) >= Date.now() - 5_000);

  const persistedDatabase = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const row = persistedDatabase.prepare('SELECT COUNT(*) AS total FROM shop_boosts WHERE shop_id = ? AND status = ?').get(shopId, 'active') as { total: number };
    assert.equal(row.total, 2);
    const reservation = persistedDatabase.prepare('SELECT reservation_expires_at FROM shop_boosts WHERE payment_intent_id = ?')
      .get(lateBoostIntent.payment_id) as { reservation_expires_at: string | null };
    assert.equal(reservation.reservation_expires_at, null);
  } finally {
    persistedDatabase.close();
  }
});

test('ambassador commissions follow the first confirmed subscription and refund', async () => {
  const login = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'subscription-commerce-test-admin-key', role: 'super_admin' }),
  });
  assert.equal(login.status, 200);
  const adminCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const adminRequest = (url: string, method: string, body?: object) => fetch(`${BASE_URL}/api/admin/ambassadors${url}`, {
    method, headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: body && JSON.stringify(body),
  });
  assert.equal((await fetch(`${BASE_URL}/api/admin/ambassadors`)).status, 401);
  assert.equal((await fetch(`${BASE_URL}/api/admin/ambassadors/overview`)).status, 401);
  assert.equal((await adminRequest('/overview?days=14', 'GET')).status, 400);
  const createdAmbassador = await adminRequest('', 'POST', { name: 'Partenaire test', email: 'partner@example.com' });
  assert.equal(createdAmbassador.status, 201);
  const ambassador = await createdAmbassador.json();
  const secondAmbassador = await (await adminRequest('', 'POST', { name: 'Autre partenaire' })).json();
  const click = await fetch(`${BASE_URL}/api/ambassador-clicks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  });
  assert.equal(click.status, 201);
  assert.equal(click.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-link-visits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ code: ambassador.code }),
  })).status, 403);
  const linkVisit = await fetch(`${BASE_URL}/api/ambassador-link-visits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  });
  assert.equal(linkVisit.status, 201);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-link-visits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'INCONNU' }),
  })).status, 404);
  const { token } = await click.json();
  const invalidCode = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Code invalide', whatsapp_number: `+22506${String(Date.now()).slice(-8)}`, email: `invalid-${Date.now()}@example.com`, pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true, ambassador_code: 'INCONNU' }),
  });
  assert.equal(invalidCode.status, 400);
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique partenaire', whatsapp_number: `+22505${String(Date.now()).slice(-8)}`, email: `affiliate-${Date.now()}@example.com`, pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true, ambassador_token: token, ambassador_code: secondAmbassador.code }),
  });
  const shop = await created.json();
  assert.equal(created.status, 200, JSON.stringify(shop));
  const ambassadorOverviewResponse = await adminRequest('/overview?days=7', 'GET');
  assert.equal(ambassadorOverviewResponse.status, 200);
  const ambassadorOverview = await ambassadorOverviewResponse.json();
  assert.equal(ambassadorOverview.ambassadors_total, 2);
  assert.equal(ambassadorOverview.ambassadors_active, 2);
  assert.equal(ambassadorOverview.clicks, 1);
  assert.equal(ambassadorOverview.referrals, 1);
  assert.equal(ambassadorOverview.active_link_tokens, 1);
  assert.equal(ambassadorOverview.conversion_rate, 100);
  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: shop.owner_access_token }),
  });
  const merchantCookie = merchantLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);
  const createPayment = async () => {
    const response = await fetch(`${BASE_URL}/api/shops/${shop.shop.id}/subscription-payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: merchantCookie }, body: JSON.stringify({ tier: 'pro', term: 'annual' }),
    });
    const payment = await response.json();
    assert.equal(response.status, 201, JSON.stringify(payment));
    return payment;
  };
  const payment = await createPayment();
  const event = (eventName: string, paymentStatus: string, paymentId: string) => JSON.stringify({
    event: eventName, data: { status: paymentStatus, reference: `GNP-${paymentId}`, amount: 80000, currency: 'XOF', metadata: { subscription_payment_id: paymentId, payment_type: 'subscription' } },
  });
  let state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals[0].ambassador_id, ambassador.id);
  assert.equal(state.referrals[0].status, null);
  const success = event('payment.success', 'completed', payment.payment_id);
  assert.equal((await signedWebhook(success)).status, 200);
  assert.equal((await signedWebhook(success)).status, 200);
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals[0].amount, 1600);
  assert.equal(state.referrals[0].status, 'pending');
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/reject`, 'POST', {})).status, 400);
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', { reason: 'Vérification avant paiement' })).status, 409);
  const testDb = new Database(TEST_DB_PATH);
  testDb.prepare("UPDATE shops SET publication_status = 'active' WHERE id = ?").run(shop.shop.id);
  testDb.close();
  const selfReferralDb = new Database(TEST_DB_PATH);
  selfReferralDb.prepare('UPDATE ambassadors SET phone = ? WHERE id = ?')
    .run(shop.shop.whatsapp_number.replace('+', ''), ambassador.id);
  selfReferralDb.close();
  const selfReferralApproval = await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', { reason: 'Contrôle auto-parrainage' });
  assert.equal(selfReferralApproval.status, 409);
  assert.match((await selfReferralApproval.json()).error, /coordonnées ou le nom du commerçant correspondent/);
  const resetAmbassadorPhoneDb = new Database(TEST_DB_PATH);
  resetAmbassadorPhoneDb.prepare('UPDATE ambassadors SET phone = NULL WHERE id = ?').run(ambassador.id);
  const ownerEmail = (resetAmbassadorPhoneDb.prepare('SELECT owner_email FROM shops WHERE id = ?')
    .get(shop.shop.id) as { owner_email: string }).owner_email;
  resetAmbassadorPhoneDb.prepare('UPDATE ambassadors SET email = ? WHERE id = ?').run(ownerEmail, ambassador.id);
  resetAmbassadorPhoneDb.close();
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', { reason: 'Contrôle e-mail auto-parrainage' })).status, 409);
  const resetAmbassadorEmailDb = new Database(TEST_DB_PATH);
  resetAmbassadorEmailDb.prepare('UPDATE ambassadors SET email = ? WHERE id = ?').run('partner@example.com', ambassador.id);
  resetAmbassadorEmailDb.close();
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', {})).status, 400);
  const selfReferralNameDb = new Database(TEST_DB_PATH);
  selfReferralNameDb.prepare('UPDATE shops SET owner_name = ? WHERE id = ?').run('Élodie Traoré', shop.shop.id);
  selfReferralNameDb.prepare('UPDATE ambassadors SET name = ? WHERE id = ?').run('Elodie-Traore', ambassador.id);
  selfReferralNameDb.close();
  const selfReferralNameApproval = await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', { reason: 'Contrôle des noms' });
  assert.equal(selfReferralNameApproval.status, 409);
  assert.match((await selfReferralNameApproval.json()).error, /nom du commerçant correspondent/);
  const restoreAmbassadorNameDb = new Database(TEST_DB_PATH);
  restoreAmbassadorNameDb.prepare('UPDATE ambassadors SET name = ? WHERE id = ?').run('Partenaire test', ambassador.id);
  restoreAmbassadorNameDb.close();
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/approve`, 'POST', { reason: 'Boutique et paiement vérifiés' })).status, 200);
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(JSON.parse(state.referrals[0].decision_details).reason, 'Boutique et paiement vérifiés');
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/paid`, 'POST', {})).status, 400);
  assert.equal((await adminRequest(`/commissions/${shop.shop.id}/paid`, 'POST', { reference: 'MOBILE-123' })).status, 200);
  assert.equal((await signedWebhook(event('payment.refunded', 'refunded', payment.payment_id))).status, 200);
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals[0].status, 'refund_review');
  assert.equal(state.referrals[0].payout_reference, 'MOBILE-123');
  assert.equal(state.payouts.length, 1);
  assert.equal(state.payouts[0].reference, 'MOBILE-123');
  const another = await createPayment();
  assert.equal((await signedWebhook(event('payment.success', 'completed', another.payment_id))).status, 200);
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals.length, 1);
  assert.equal(state.referrals[0].payment_id, payment.payment_id);
  assert.equal(state.referrals[0].status, 'refund_review');
  const cleanupDb = new Database(TEST_DB_PATH);
  try {
    cleanupDb.pragma('foreign_keys = ON');
    cleanupDb.prepare('DELETE FROM shops WHERE id = ?').run(shop.shop.id);
  } finally {
    cleanupDb.close();
  }
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals.length, 0);
  assert.equal(state.payouts.length, 1);
  assert.equal(state.payouts[0].reference, 'MOBILE-123');

  const secondShopResponse = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique à vérifier', whatsapp_number: `+22505${String(Date.now()).slice(-8)}`, email: `review-${Date.now()}@example.com`, pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true, ambassador_code: ambassador.code }),
  });
  const secondShop = await secondShopResponse.json();
  assert.equal(secondShopResponse.status, 200);
  const secondLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: secondShop.owner_access_token }),
  });
  const secondCookie = secondLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(secondCookie);
  const secondPaymentResponse = await fetch(`${BASE_URL}/api/shops/${secondShop.shop.id}/subscription-payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: secondCookie }, body: JSON.stringify({ tier: 'pro', term: 'annual' }),
  });
  const secondPayment = await secondPaymentResponse.json();
  assert.equal(secondPaymentResponse.status, 201);
  assert.equal((await signedWebhook(event('payment.success', 'completed', secondPayment.payment_id))).status, 200);
  assert.equal((await adminRequest(`/commissions/${secondShop.shop.id}/reject`, 'POST', { reason: 'Auto-inscription vérifiée' })).status, 200);
  state = await (await adminRequest('', 'GET')).json();
  assert.equal(state.referrals[0].status, 'cancelled');
  assert.equal(JSON.parse(state.referrals[0].decision_details).reason, 'Auto-inscription vérifiée');
  assert.equal((await adminRequest(`/commissions/${secondShop.shop.id}/approve`, 'POST', { reason: 'Vérification de la commission annulée' })).status, 409);
});

test('ambassador attribution handles reused, expired, inactive, malformed, and conflicting referrals', async () => {
  const clearTestRateLimits = () => {
    const db = new Database(TEST_DB_PATH);
    try {
      db.prepare('DELETE FROM request_rate_limits').run();
    } finally {
      db.close();
    }
  };
  clearTestRateLimits();
  const login = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'subscription-commerce-test-admin-key', role: 'super_admin' }),
  });
  const adminCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const adminRequest = (url: string, method: string, body?: object) => fetch(`${BASE_URL}/api/admin/ambassadors${url}`, {
    method, headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: body && JSON.stringify(body),
  });
  const firstAmbassador = await (await adminRequest('', 'POST', { name: 'Lien initial' })).json();
  const secondAmbassador = await (await adminRequest('', 'POST', { name: 'Code saisi' })).json();
  let shopSequence = 0;
  const registerShop = async (label: string, referral: { token?: string; code?: string }) => {
    shopSequence += 1;
    const response = await fetch(`${BASE_URL}/api/shops`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Boutique attribution ${label}`,
        whatsapp_number: `+22505${String(Date.now() + shopSequence).slice(-8)}`,
        email: `attribution-${label}-${Date.now()}@example.com`,
        pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true,
        ...(referral.token ? { ambassador_token: referral.token } : {}),
        ...(referral.code ? { ambassador_code: referral.code } : {}),
      }),
    });
    const payload = await response.json();
    return { response, payload };
  };
  const clickToken = async (code: string) => {
    const response = await fetch(`${BASE_URL}/api/ambassador-clicks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    assert.equal(response.status, 201);
    return (await response.json()).token as string;
  };
  const attributedAmbassador = (shopId: number) => {
    const db = new Database(TEST_DB_PATH, { readonly: true });
    try {
      return (db.prepare('SELECT ambassador_id FROM ambassador_referrals WHERE shop_id = ?')
        .get(shopId) as { ambassador_id: string } | undefined)?.ambassador_id || null;
    } finally {
      db.close();
    }
  };

  const reusableToken = await clickToken(firstAmbassador.code);
  const firstShop = await registerShop('lien-prioritaire', { token: reusableToken, code: secondAmbassador.code });
  assert.equal(firstShop.response.status, 200, JSON.stringify(firstShop.payload));
  assert.equal(attributedAmbassador(firstShop.payload.shop.id), firstAmbassador.id);
  const secondShop = await registerShop('lien-reutilise', { token: reusableToken, code: secondAmbassador.code });
  assert.equal(secondShop.response.status, 200, JSON.stringify(secondShop.payload));
  assert.equal(attributedAmbassador(secondShop.payload.shop.id), firstAmbassador.id);

  const expiredToken = await clickToken(secondAmbassador.code);
  const expireClickDb = new Database(TEST_DB_PATH);
  expireClickDb.prepare('UPDATE ambassador_clicks SET expires_at = ? WHERE ambassador_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), secondAmbassador.id);
  expireClickDb.close();
  const expiredFallback = await registerShop('lien-expire-code', { token: expiredToken, code: firstAmbassador.code });
  assert.equal(expiredFallback.response.status, 200, JSON.stringify(expiredFallback.payload));
  assert.equal(attributedAmbassador(expiredFallback.payload.shop.id), firstAmbassador.id);
  const expiredUnattributed = await registerShop('lien-expire-vide', { token: expiredToken });
  assert.equal(expiredUnattributed.response.status, 200, JSON.stringify(expiredUnattributed.payload));
  assert.equal(attributedAmbassador(expiredUnattributed.payload.shop.id), null);

  const inactiveToken = await clickToken(firstAmbassador.code);
  assert.equal((await adminRequest(`/${firstAmbassador.id}`, 'PATCH', { active: false })).status, 200);
  const inactiveFallback = await registerShop('lien-inactif-code-actif', { token: inactiveToken, code: secondAmbassador.code });
  assert.equal(inactiveFallback.response.status, 200, JSON.stringify(inactiveFallback.payload));
  assert.equal(attributedAmbassador(inactiveFallback.payload.shop.id), secondAmbassador.id);
  const malformedFallback = await registerShop('jeton-invalide-code-actif', { token: 'not-a-token', code: secondAmbassador.code });
  assert.equal(malformedFallback.response.status, 200, JSON.stringify(malformedFallback.payload));
  assert.equal(attributedAmbassador(malformedFallback.payload.shop.id), secondAmbassador.id);
  const inactiveCode = await registerShop('code-inactif', { code: firstAmbassador.code });
  assert.equal(inactiveCode.response.status, 400);
  clearTestRateLimits();
});

test('public ambassador applications require approval before account and referral-code creation', async () => {
  const applicationResponse = await fetch(`${BASE_URL}/api/ambassador-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Candidature test',
      email: 'application-ambassador@example.com',
      phone: '+2250708091011',
    }),
  });
  assert.equal(applicationResponse.status, 202);
  assert.match((await applicationResponse.json()).message, /avant toute activation/i);
  const repeatedApplicationResponse = await fetch(`${BASE_URL}/api/ambassador-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Candidature test',
      email: 'application-ambassador@example.com',
      phone: '+2250708091011',
    }),
  });
  assert.equal(repeatedApplicationResponse.status, 202);

  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'subscription-commerce-test-admin-key', role: 'super_admin' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const adminRequest = (path: string, method: string, body?: object) => fetch(`${BASE_URL}/api/admin/ambassadors${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: body && JSON.stringify(body),
  });
  let adminData = await (await adminRequest('', 'GET')).json();
  const application = adminData.applications.find((entry: { email: string }) => entry.email === 'application-ambassador@example.com');
  assert.ok(application);
  assert.equal(application.status, 'pending');
  assert.equal(adminData.ambassadors.some((entry: { email: string }) => entry.email === application.email), false);

  const approvalResponse = await adminRequest(`/applications/${application.id}/approve`, 'POST', {});
  assert.equal(approvalResponse.status, 200);
  const approval = await approvalResponse.json();
  assert.equal(approval.status, 'approved');
  assert.equal(approval.email_sent, false);
  assert.match(approval.invite_url, /\/ambassadeur\/activer\?token=/);

  adminData = await (await adminRequest('', 'GET')).json();
  const createdAmbassador = adminData.ambassadors.find((entry: { email: string }) => entry.email === application.email);
  assert.ok(createdAmbassador);
  assert.equal(createdAmbassador.code.startsWith('MT'), true);

  const activationToken = new URL(approval.invite_url).searchParams.get('token');
  const activationResponse = await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: activationToken, password: 'SecureAmbassadorPassword2026!' }),
  });
  assert.equal(activationResponse.status, 200, await activationResponse.clone().text());

  await fetch(`${BASE_URL}/api/ambassador-applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Candidature refusée', email: 'rejected-application@example.com' }),
  });
  adminData = await (await adminRequest('', 'GET')).json();
  const rejectedApplication = adminData.applications.find((entry: { email: string }) => entry.email === 'rejected-application@example.com');
  assert.ok(rejectedApplication);
  const rejectionResponse = await adminRequest(`/applications/${rejectedApplication.id}/reject`, 'POST', { reason: 'Informations insuffisantes.' });
  assert.equal(rejectionResponse.status, 200);
  adminData = await (await adminRequest('', 'GET')).json();
  assert.equal(adminData.applications.find((entry: { id: string }) => entry.id === rejectedApplication.id).status, 'rejected');
  assert.equal(adminData.ambassadors.some((entry: { email: string }) => entry.email === 'rejected-application@example.com'), false);
});

test('ambassador access uses one-time invitations and isolates each dashboard to its owner', async () => {
  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'subscription-commerce-test-admin-key', role: 'super_admin' }),
  });
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);
  const adminRequest = (path: string, method: string, body?: object) => fetch(`${BASE_URL}/api/admin/ambassadors${path}`, {
    method, headers: { 'Content-Type': 'application/json', Cookie: adminCookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body && JSON.stringify(body),
  });
  const createdResponse = await adminRequest('', 'POST', { name: 'Compte privé', email: 'private-ambassador@example.com' });
  assert.equal(createdResponse.status, 201);
  const ambassador = await createdResponse.json();
  assert.equal((await adminRequest('', 'POST', { name: 'Email dupliqué', email: 'PRIVATE-AMBASSADOR@example.com' })).status, 409);
  const inviteResponse = await adminRequest(`/${ambassador.id}/invite`, 'POST');
  assert.equal(inviteResponse.status, 201);
  const invite = await inviteResponse.json();
  assert.ok(Date.parse(invite.expires_at) > Date.now());
  const pendingAccount = await (await adminRequest('', 'GET')).json();
  const pendingAmbassador = pendingAccount.ambassadors.find((entry: { id: string }) => entry.id === ambassador.id);
  assert.equal(Number(pendingAmbassador.has_account), 0);
  assert.ok(Date.parse(pendingAmbassador.invite_expires_at) > Date.now());
  const activationToken = new URL(invite.invite_url).searchParams.get('token');
  assert.match(activationToken || '', /^[a-f0-9]{64}$/);
  const dashboardPage = await fetch(`${BASE_URL}/ambassadeur`);
  assert.equal(dashboardPage.status, 200);
  assert.match(await dashboardPage.text(), /name="robots" content="noindex, nofollow"/);
  const activationPage = await fetch(invite.invite_url);
  assert.equal(activationPage.status, 200);
  assert.match(await activationPage.text(), /name="robots" content="noindex, nofollow"/);
  const expireInviteDb = new Database(TEST_DB_PATH);
  expireInviteDb.prepare('UPDATE ambassador_invites SET expires_at = ? WHERE ambassador_id = ? AND used_at IS NULL')
    .run(new Date(Date.now() - 1000).toISOString(), ambassador.id);
  expireInviteDb.close();
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: activationToken, password: 'SecureAmbassadorPassword2026!' }),
  })).status, 400);
  const replacementInviteResponse = await adminRequest(`/${ambassador.id}/invite`, 'POST');
  assert.equal(replacementInviteResponse.status, 201);
  const replacementInvite = await replacementInviteResponse.json();
  const replacementInviteToken = new URL(replacementInvite.invite_url).searchParams.get('token');
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`)).status, 401);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/link-stats?all=1`)).status, 401);
  const weakPassword = await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: replacementInviteToken, password: 'short' }),
  });
  assert.equal(weakPassword.status, 400);
  const password = 'SecureAmbassadorPassword2026!';
  const activationResponse = await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: replacementInviteToken, password }),
  });
  assert.equal(activationResponse.status, 200, await activationResponse.clone().text());
  const ambassadorCookie = activationResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(ambassadorCookie);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: replacementInviteToken, password }),
  })).status, 400);
  const unknownRecoveryResponse = await fetch(`${BASE_URL}/api/ambassador-auth/request-access`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'unknown-ambassador@example.com' }),
  });
  const knownRecoveryResponse = await fetch(`${BASE_URL}/api/ambassador-auth/request-access`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com' }),
  });
  assert.equal(unknownRecoveryResponse.status, 202);
  assert.equal(knownRecoveryResponse.status, 202);
  assert.deepEqual(await unknownRecoveryResponse.json(), await knownRecoveryResponse.json());
  let dashboardResponse = await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } });
  assert.equal(dashboardResponse.status, 200);
  let dashboard = await dashboardResponse.json();
  assert.equal(Number(dashboard.summary.registrations), 0);
  const adminData = await (await adminRequest('', 'GET')).json();
  const activeAmbassador = adminData.ambassadors.find((entry: { id: string }) => entry.id === ambassador.id);
  assert.equal(Object.hasOwn(activeAmbassador, 'password_hash'), false);
  assert.equal(Number(activeAmbassador.has_account), 1);
  assert.equal(activeAmbassador.invite_expires_at, null);

  const referralClickResponse = await fetch(`${BASE_URL}/api/ambassador-clicks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  });
  assert.equal(referralClickResponse.status, 201);
  const firstVisit = await fetch(`${BASE_URL}/api/ambassador-link-visits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  });
  assert.equal(firstVisit.status, 201);
  const expireReferralClickDb = new Database(TEST_DB_PATH);
  expireReferralClickDb.prepare('UPDATE ambassador_clicks SET expires_at = ? WHERE ambassador_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), ambassador.id);
  expireReferralClickDb.close();
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-clicks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  })).status, 201);
  const secondVisit = await fetch(`${BASE_URL}/api/ambassador-link-visits`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: ambassador.code }),
  });
  assert.equal(secondVisit.status, 201);
  const referredShop = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique confidentielle', whatsapp_number: `+22505${String(Date.now()).slice(-8)}`, email: `private-shop-${Date.now()}@example.com`, pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true, ambassador_code: ambassador.code }),
  });
  const referredShopPayload = await referredShop.json();
  assert.equal(referredShop.status, 200, JSON.stringify(referredShopPayload));
  dashboardResponse = await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } });
  dashboard = await dashboardResponse.json();
  assert.equal(Number(dashboard.summary.registrations), 1);
  assert.equal(dashboard.referrals.length, 1);
  assert.equal(dashboard.referrals[0].shop_name, 'Boutique confidentielle');
  assert.equal('owner_email' in dashboard.referrals[0], false);
  assert.equal('whatsapp_number' in dashboard.referrals[0], false);
  const today = new Date().toISOString().slice(0, 10);
  const currentDayStatsResponse = await fetch(`${BASE_URL}/api/ambassador-auth/link-stats?from=${today}&to=${today}`, {
    headers: { Cookie: ambassadorCookie },
  });
  assert.equal(currentDayStatsResponse.status, 200);
  const currentDayStats = await currentDayStatsResponse.json();
  assert.equal(currentDayStats.from, today);
  assert.equal(currentDayStats.to, today);
  assert.equal(currentDayStats.total_clicks, 2);
  assert.equal(currentDayStats.total_referrals, 1);
  assert.equal(currentDayStats.conversion_rate, 50);
  assert.deepEqual(currentDayStats.activity, [{ date: today, clicks: 2, referrals: 1 }]);
  const allTimeStatsResponse = await fetch(`${BASE_URL}/api/ambassador-auth/link-stats?all=1`, {
    headers: { Cookie: ambassadorCookie },
  });
  assert.equal(allTimeStatsResponse.status, 200);
  const allTimeStats = await allTimeStatsResponse.json();
  assert.equal(allTimeStats.from, null);
  assert.equal(allTimeStats.total_clicks, 2);
  assert.equal(allTimeStats.total_referrals, 1);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/link-stats?from=2026-02-31&to=2026-03-01`, {
    headers: { Cookie: ambassadorCookie },
  })).status, 400);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/link-stats?from=${today}&to=2020-01-01`, {
    headers: { Cookie: ambassadorCookie },
  })).status, 400);

  const merchantLoginResponse = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: referredShopPayload.owner_access_token }),
  });
  const merchantCookie = merchantLoginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(merchantCookie);
  const subscriptionResponse = await fetch(`${BASE_URL}/api/shops/${referredShopPayload.shop.id}/subscription-payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: merchantCookie }, body: JSON.stringify({ tier: 'pro', term: 'monthly' }),
  });
  const subscription = await subscriptionResponse.json();
  assert.equal(subscriptionResponse.status, 201);
  const subscriptionSuccess = JSON.stringify({
    event: 'payment.success',
    data: { status: 'completed', reference: `GNP-${subscription.payment_id}`, amount: 8000, currency: 'XOF', metadata: { subscription_payment_id: subscription.payment_id, payment_type: 'subscription' } },
  });
  assert.equal((await signedWebhook(subscriptionSuccess)).status, 200);
  const publishingDb = new Database(TEST_DB_PATH);
  publishingDb.prepare("UPDATE shops SET publication_status = 'active' WHERE id = ?").run(referredShopPayload.shop.id);
  publishingDb.close();
  assert.equal((await adminRequest(`/commissions/${referredShopPayload.shop.id}/approve`, 'POST', { reason: 'Boutique publiée et paiement confirmé' })).status, 200);
  dashboardResponse = await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } });
  dashboard = await dashboardResponse.json();
  assert.equal(Number(dashboard.summary.available_commissions), 1600);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '12345' }),
  })).status, 400);
  const withdrawalRequest = await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '+2250701020304' }),
  });
  assert.equal(withdrawalRequest.status, 201);
  const withdrawal = await withdrawalRequest.json();
  assert.equal(withdrawal.withdrawal.amount, 1600);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '+2250701020304' }),
  })).status, 409);
  const withdrawalList = await (await adminRequest('', 'GET')).json();
  const withdrawalRecord = withdrawalList.withdrawals.find((item: { id: string }) => item.id === withdrawal.withdrawal.id);
  assert.equal(withdrawalRecord.payout_phone, '+2250701020304');
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals/${withdrawal.withdrawal.id}/cancel`, {
    method: 'POST', headers: { Cookie: ambassadorCookie },
  })).status, 200);
  assert.equal((await adminRequest(`/withdrawals/${withdrawal.withdrawal.id}/approve`, 'POST', {})).status, 409);
  dashboard = await (await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } })).json();
  assert.equal(Number(dashboard.summary.available_commissions), 1600);
  const secondWithdrawalResponse = await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '+2250701020304' }),
  });
  assert.equal(secondWithdrawalResponse.status, 201);
  const secondWithdrawal = await secondWithdrawalResponse.json();
  assert.equal(await (await adminRequest(`/withdrawals/${secondWithdrawal.withdrawal.id}/reject`, 'POST', { reason: 'Compte mobile money à revérifier' })).status, 200);
  dashboard = await (await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } })).json();
  assert.equal(Number(dashboard.summary.available_commissions), 1600);
  const thirdWithdrawalResponse = await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '+2250701020304' }),
  });
  assert.equal(thirdWithdrawalResponse.status, 201);
  const thirdWithdrawal = await thirdWithdrawalResponse.json();
  assert.equal(await (await adminRequest(`/withdrawals/${thirdWithdrawal.withdrawal.id}/approve`, 'POST', {})).status, 200);
  assert.equal(await (await adminRequest(`/withdrawals/${thirdWithdrawal.withdrawal.id}/paid`, 'POST', {})).status, 400);
  assert.equal(await (await adminRequest(`/withdrawals/${thirdWithdrawal.withdrawal.id}/paid`, 'POST', { reference: 'WAVE-RETRAIT-002' })).status, 200);
  dashboard = await (await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } })).json();
  assert.equal(Number(dashboard.summary.available_commissions), 0);
  assert.equal(Number(dashboard.summary.paid_commissions), 1600);
  assert.equal(dashboard.withdrawals[0].status, 'paid');
  assert.equal(dashboard.withdrawals[0].payout_reference, 'WAVE-RETRAIT-002');

  const refundShopResponse = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique avant retrait', whatsapp_number: `+22507${String(Date.now()).slice(-8)}`, email: `refund-shop-${Date.now()}@example.com`, pin_code: '224466', category: 'beauty', city: 'Abidjan', accepted_terms_privacy: true, ambassador_code: ambassador.code }),
  });
  const refundShopPayload = await refundShopResponse.json();
  assert.equal(refundShopResponse.status, 200);
  const refundMerchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: refundShopPayload.owner_access_token }),
  });
  const refundMerchantCookie = refundMerchantLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(refundMerchantCookie);
  const refundPaymentResponse = await fetch(`${BASE_URL}/api/shops/${refundShopPayload.shop.id}/subscription-payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: refundMerchantCookie }, body: JSON.stringify({ tier: 'pro', term: 'monthly' }),
  });
  const refundPayment = await refundPaymentResponse.json();
  assert.equal(refundPaymentResponse.status, 201);
  assert.equal((await signedWebhook(JSON.stringify({ event: 'payment.success', data: { status: 'completed', reference: `GNP-${refundPayment.payment_id}`, amount: 8000, currency: 'XOF', metadata: { subscription_payment_id: refundPayment.payment_id, payment_type: 'subscription' } } }))).status, 200);
  const refundPublicationDb = new Database(TEST_DB_PATH);
  refundPublicationDb.prepare("UPDATE shops SET publication_status = 'active' WHERE id = ?").run(refundShopPayload.shop.id);
  refundPublicationDb.close();
  assert.equal((await adminRequest(`/commissions/${refundShopPayload.shop.id}/approve`, 'POST', { reason: 'Publication et paiement vérifiés' })).status, 200);
  const refundWithdrawalResponse = await fetch(`${BASE_URL}/api/ambassador-auth/withdrawals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ambassadorCookie },
    body: JSON.stringify({ payout_method: 'wave', payout_phone: '+2250701020304' }),
  });
  assert.equal(refundWithdrawalResponse.status, 201);
  const refundWithdrawal = await refundWithdrawalResponse.json();
  assert.equal((await signedWebhook(JSON.stringify({ event: 'payment.refunded', data: { status: 'refunded', reference: `GNP-${refundPayment.payment_id}`, amount: 8000, amount_refunded: 8000, currency: 'XOF', metadata: { subscription_payment_id: refundPayment.payment_id, payment_type: 'subscription' } } }))).status, 200);
  const withdrawalsAfterRefund = await (await adminRequest('', 'GET')).json();
  const autoCancelledWithdrawal = withdrawalsAfterRefund.withdrawals.find((item: { id: string }) => item.id === refundWithdrawal.withdrawal.id);
  assert.equal(autoCancelledWithdrawal.status, 'rejected');
  assert.match(autoCancelledWithdrawal.admin_reason, /remboursement/i);
  assert.equal((await adminRequest(`/withdrawals/${refundWithdrawal.withdrawal.id}/paid`, 'POST', { reference: 'NE-DOIT-PAS-PASSER' })).status, 409);
  dashboard = await (await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: ambassadorCookie } })).json();
  assert.equal(Number(dashboard.summary.available_commissions), 0);
  assert.equal(Number(dashboard.summary.withdrawal_commissions), 0);

  const renewalInvite = await (await adminRequest(`/${ambassador.id}/invite`, 'POST')).json();
  const sessionBeforeActivation = await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: ambassadorCookie } }).then((response) => response.json());
  assert.equal(sessionBeforeActivation.authenticated, true);
  const renewedToken = new URL(renewalInvite.invite_url).searchParams.get('token');
  const replacementPassword = 'ReplacementAmbassadorPassword2026!';
  const renewedActivation = await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: renewedToken, password: replacementPassword }),
  });
  assert.equal(renewedActivation.status, 200);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: ambassadorCookie } }).then((response) => response.json())).authenticated, false);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com', password }),
  })).status, 401);
  const successfulLogin = await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com', password: replacementPassword }),
  });
  assert.equal(successfulLogin.status, 200);
  const renewedCookie = successfulLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(renewedCookie);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: renewedCookie } })).status, 200);
  const secondSessionLogin = await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com', password: replacementPassword }),
  });
  const secondSessionCookie = secondSessionLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(secondSessionCookie);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: renewedCookie },
    body: JSON.stringify({ current_password: 'incorrect-password', new_password: 'UpdatedAmbassadorPassword2026!' }),
  })).status, 401);
  const changedPassword = 'UpdatedAmbassadorPassword2026!';
  const passwordChange = await fetch(`${BASE_URL}/api/ambassador-auth/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: renewedCookie },
    body: JSON.stringify({ current_password: replacementPassword, new_password: changedPassword }),
  });
  assert.equal(passwordChange.status, 200);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: renewedCookie } })).status, 200);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: secondSessionCookie } }).then((response) => response.json())).authenticated, false);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com', password: replacementPassword }),
  })).status, 401);
  const finalLogin = await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador@example.com', password: changedPassword }),
  });
  assert.equal(finalLogin.status, 200);
  const finalCookie = finalLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(finalCookie);
  await fetch(`${BASE_URL}/api/ambassador-auth/logout`, { method: 'POST', headers: { Cookie: finalCookie } });
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/dashboard`, { headers: { Cookie: finalCookie } })).status, 401);

  const profileUpdate = await adminRequest(`/${ambassador.id}`, 'PATCH', {
    name: 'Compte privé mis à jour', email: 'private-ambassador-updated@example.com', phone: '+2250701020304',
  });
  assert.equal(profileUpdate.status, 200);
  const updatedAdminData = await (await adminRequest('', 'GET')).json();
  const updatedAmbassador = updatedAdminData.ambassadors.find((entry: { id: string }) => entry.id === ambassador.id);
  assert.equal(updatedAmbassador.email, 'private-ambassador-updated@example.com');
  assert.equal(Number(updatedAmbassador.has_account), 0);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: renewedCookie } }).then((response) => response.json())).authenticated, false);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'private-ambassador-updated@example.com', password: changedPassword }),
  })).status, 401);

  const profileInvite = await (await adminRequest(`/${ambassador.id}/invite`, 'POST')).json();
  const profileToken = new URL(profileInvite.invite_url).searchParams.get('token');
  const profilePassword = 'ProfileUpdatedAmbassadorPassword2026!';
  const profileActivation = await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: profileToken, password: profilePassword }),
  });
  assert.equal(profileActivation.status, 200);
  const profileCookie = profileActivation.headers.get('set-cookie')?.split(';')[0];
  assert.ok(profileCookie);
  const pendingSuspensionInvite = await (await adminRequest(`/${ambassador.id}/invite`, 'POST')).json();
  const pendingSuspensionToken = new URL(pendingSuspensionInvite.invite_url).searchParams.get('token');
  assert.equal((await adminRequest(`/${ambassador.id}`, 'PATCH', { active: false })).status, 200);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: profileCookie } }).then((response) => response.json())).authenticated, false);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/activate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pendingSuspensionToken, password: 'SuspendedAmbassadorPassword2026!' }),
  })).status, 400);
  assert.equal((await adminRequest(`/${ambassador.id}`, 'PATCH', { active: true })).status, 200);
  assert.equal((await fetch(`${BASE_URL}/api/ambassador-auth/session`, { headers: { Cookie: profileCookie } }).then((response) => response.json())).authenticated, false);
});
