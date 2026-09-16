import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const TEST_PORT = 43123;
const TEST_DB_PATH = path.join(process.cwd(), 'data', `matable-test-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;
let cookieJar = '';

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry until server is ready
    }
    await delay(250);
  }
  throw new Error('Server did not become ready in time.');
}

function updateCookieJar(headers: Headers) {
  const rawSetCookie = headers.get('set-cookie');
  const setCookieValues = rawSetCookie
    ? rawSetCookie.split(/,(?=[^;,]+=[^;]+(?:;|$))/g)
    : headers.getSetCookie?.() ?? [];

  if (setCookieValues.length === 0) return;

  const nextCookies = new Map<string, string>();
  for (const entry of cookieJar.split('; ').map((piece) => piece.trim()).filter(Boolean)) {
    const [name, ...rest] = entry.split('=');
    if (name && rest.length) nextCookies.set(name, rest.join('='));
  }

  for (const cookie of setCookieValues) {
    const [nameValue] = cookie.split(';');
    if (!nameValue) continue;
    const idx = nameValue.indexOf('=');
    if (idx <= 0) continue;
    const name = nameValue.slice(0, idx).trim();
    const value = nameValue.slice(idx + 1).trim();
    if (name === 'matable_session' || name === 'matable_admin_session' || name === 'matable_session_fp') {
      nextCookies.set(name, value);
    }
  }

  cookieJar = Array.from(nextCookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (cookieJar) {
    headers.set('Cookie', cookieJar);
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
  });
  updateCookieJar(response.headers);

  const text = await response.text();
  let payload: any = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return { response, payload };
}

function uniquePhone() {
  const random = String(Date.now() + Math.floor(Math.random() * 100000)).slice(-8);
  return `+22507${random}`.slice(0, 15);
}

before(async () => {
  cookieJar = '';
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'super-admin-demo-key',
      NODE_ENV: 'test',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: BASE_URL,
      PAYSTACK_PUBLIC_KEY: 'pk_test_123',
      PAYSTACK_SECRET_KEY: 'sk_test_123',
      PAYSTACK_WEBHOOK_SECRET: 'test-paystack-secret',
      PAYSTACK_CURRENCY: 'NGN',
      PAYSTACK_MOCK_MODE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  await waitForServer();
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    await delay(500);
  }
});

test('concurrent single-item orders cannot oversell the last unit', async () => {
  const createProduct = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250708091011', pin: '123456' }),
  });
  assert.equal(createProduct.response.status, 200, `Unexpected login response: ${JSON.stringify(createProduct.payload)}`);

  const productCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Produit stock unique concurrent',
      description: 'Produit utilisé pour la validation de concurrence',
      price: 1500,
      stock: 1,
      image_url: 'https://example.com/concurrent.jpg',
      is_available: true,
      category: 'fashion',
      sizes: ['M'],
      colors: [{ name: 'Blanc', hex: '#ffffff' }],
    }),
  });
  assert.equal(productCreate.response.status, 200, `Product creation failed: ${JSON.stringify(productCreate.payload)}`);
  const createdProduct = productCreate.payload.product;
  assert.ok(createdProduct.id);

  const orderAttempts = await Promise.all([
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client A',
        customer_phone: '+2250500000001',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 1',
        delivery_slot: 'Midi',
        payment_method_preference: 'wave',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client B',
        customer_phone: '+2250500000002',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 2',
        delivery_slot: 'Midi',
        payment_method_preference: 'mobile_money',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client C',
        customer_phone: '+2250500000003',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 3',
        delivery_slot: 'Midi',
        payment_method_preference: 'wave',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
  ]);

  const successfulOrders = orderAttempts.filter((attempt) => attempt.response.status === 200).length;
  assert.equal(successfulOrders, 1, `Expected exactly one successful stock reservation, got ${successfulOrders}`);

  const productAfter = await apiFetch(`/api/shops/1/products`);
  assert.equal(productAfter.response.status, 200);
  const updatedProduct = productAfter.payload.find((item: any) => item.id === createdProduct.id);
  assert.ok(updatedProduct);
  assert.equal(updatedProduct.stock, 0);
});

test('paystack webhook remains locked in the base flow', async () => {
  const createdShop = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Paystack Test',
      whatsapp_number: uniquePhone(),
      pin_code: '777888',
      category: 'fashion',
      city: 'Yamoussoukro',
      subscription_tier: 'premium',
    }),
  });
  assert.equal(createdShop.response.status, 200, `Shop creation failed: ${JSON.stringify(createdShop.payload)}`);
  const shopId = createdShop.payload.shop.id;

  const payload = {
    event: 'charge.success',
    data: {
      reference: `MOCK-${shopId}-premium-4000`,
      amount: 400000,
      metadata: {
        shop_id: shopId,
        tier: 'premium',
      },
    },
  };

  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = createHmac('sha512', 'test-paystack-secret').update(raw).digest('hex');

  const response = await fetch(`${BASE_URL}/api/payments/paystack/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': signature,
    },
    body: raw,
  });

  assert.equal(response.status, 410, `Webhook should stay locked: ${await response.text()}`);

  const shop = await apiFetch(`/api/shops/${shopId}`);
  assert.equal(shop.response.status, 200);
  assert.equal(shop.payload.shop.payment_status, 'approved');
  assert.equal(shop.payload.shop.is_active, true);
});

test('existing merchant full flow: login, product management, order lifecycle, billing snapshot, and store status toggle', async () => {
  const login = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250708091011', pin: '123456' }),
  });
  assert.equal(login.response.status, 200, `Unexpected login response: ${JSON.stringify(login.payload)}`);
  assert.equal(login.payload.success, true);
  assert.equal(login.payload.shop.id, 1);

  const productCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test produit flux marchand',
      description: 'Produit de test pour validation du cycle complet',
      price: 2500,
      stock: 5,
      image_url: 'https://example.com/test.jpg',
      is_available: true,
      category: 'fashion',
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Noir', hex: '#111827' }],
    }),
  });
  assert.equal(productCreate.response.status, 200, `Product creation failed: ${JSON.stringify(productCreate.payload)}`);
  const createdProduct = productCreate.payload.product;
  assert.ok(createdProduct.id);

  const productList = await apiFetch('/api/shops/1/products');
  assert.equal(productList.response.status, 200);
  assert.ok(productList.payload.some((product: any) => product.id === createdProduct.id));

  const order = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client Test',
      customer_phone: '+2250500000001',
      delivery_location: 'Abidjan Plateau',
      delivery_note: 'Livraison urgente',
      delivery_slot: 'Midi',
      payment_method_preference: 'wave',
      items: [{ product_id: createdProduct.id, quantity: 2 }],
    }),
  });
  assert.equal(order.response.status, 200, `Order creation failed: ${JSON.stringify(order.payload)}`);
  assert.equal(order.payload.success, true);
  const orderId = order.payload.order.id;

  const orderCheck = await apiFetch(`/api/shops/1/orders`);
  assert.equal(orderCheck.response.status, 200);
  assert.ok(orderCheck.payload.some((item: any) => item.id === orderId));

  const statusUpdate = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(statusUpdate.response.status, 200);
  assert.equal(statusUpdate.payload.order.status, 'confirmed');

  const cancelledUpdate = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelledUpdate.response.status, 200);
  assert.equal(cancelledUpdate.payload.order.status, 'cancelled');

  const bilan = await apiFetch('/api/shops/1/flash-bilan');
  assert.equal(bilan.response.status, 200);
  assert.ok(String(bilan.payload.whatsapp_message).includes('FLASH BILAN'));

  const toggleStore = await apiFetch('/api/shops/1/toggle-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: false }),
  });
  assert.equal(toggleStore.response.status, 200);
  assert.equal(toggleStore.payload.is_open, false);

  const publicShop = await apiFetch('/api/shops/aya-chic');
  assert.equal(publicShop.response.status, 200);
  assert.ok(publicShop.payload.shop);
});

test('new merchant registration flow is local and immediately usable', async () => {
  const phone = uniquePhone();
  const registration = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Test Premium',
      whatsapp_number: phone,
      pin_code: '654321',
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'premium',
      welcome_message: 'Bienvenue chez Boutique Test Premium',
    }),
  });

  assert.equal(registration.response.status, 200, `Shop creation failed: ${JSON.stringify(registration.payload)}`);
  assert.equal(registration.payload.payment_required, false);
  assert.equal(registration.payload.payment_status, 'approved');

  const newShopId = registration.payload.shop.id;

  const merchantLogin = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin: '654321' }),
  });
  assert.equal(merchantLogin.response.status, 200, JSON.stringify(merchantLogin.payload));
  assert.equal(merchantLogin.payload.shop.is_active, true);
});

test('super-admin full watchdog workflow: wrong key rejection, access link generation, subscription extension, and cron execution', async () => {
  const phone = uniquePhone();
  const created = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Admin Test',
      whatsapp_number: phone,
      pin_code: '111111',
      category: 'food',
      city: 'Yamoussoukro',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(created.response.status, 200);
  const shopId = created.payload.shop.id;

  const insecureConfirmation = await apiFetch(`/api/shops/${shopId}/payment-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'standard', amount: 3000, payment_reference: 'ADMIN-FLOW-1', payment_method: 'mobile_money' }),
  });
  assert.equal(insecureConfirmation.response.status, 404);

  const adminWrongKey = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'wrong-key' }),
  });
  assert.equal(adminWrongKey.response.status, 401);

  const adminLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.response.status, 200);

  const accessLink = await apiFetch(`/api/admin/shops/${shopId}/access-link`, { method: 'POST' });
  assert.equal(accessLink.response.status, 200);
  assert.ok(String(accessLink.payload.access_url).includes('/app?access='));

  const extend = await apiFetch(`/api/admin/shops/${shopId}/extend-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ months: 3 }),
  });
  assert.equal(extend.response.status, 200);
  assert.ok(extend.payload.new_expiration_date);

  const cron = await apiFetch('/api/admin/trigger-cron', { method: 'POST' });
  assert.equal(cron.response.status, 200);
  assert.ok(Array.isArray(cron.payload.alerts));

  const listAfterReject = await apiFetch('/api/admin/shops');
  assert.equal(listAfterReject.response.status, 200);
  const rejectedShop = listAfterReject.payload.find((item: any) => item.id === shopId);
  assert.ok(rejectedShop);
  assert.equal(rejectedShop.payment_status, 'approved');
});

test('recovery and security hardening: duplicate shop prevention and limited merchant recovery attempts', async () => {
  const phone = uniquePhone();
  const first = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Récupération',
      whatsapp_number: phone,
      pin_code: '777777',
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(first.response.status, 200);

  const duplicate = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Deuxième boutique même numéro',
      whatsapp_number: phone,
      pin_code: '123456',
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'premium',
    }),
  });
  assert.equal(duplicate.response.status, 409);

  const recovery1 = await apiFetch('/api/auth/merchant-recovery-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.equal(recovery1.response.status, 410, JSON.stringify(recovery1.payload));

  const recovery2 = await apiFetch('/api/auth/merchant-recovery-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.equal(recovery2.response.status, 410, JSON.stringify(recovery2.payload));

  const recovery3 = await apiFetch('/api/auth/merchant-recovery-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  assert.equal(recovery3.response.status, 410, JSON.stringify(recovery3.payload));
});
