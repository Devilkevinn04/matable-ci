import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
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
    body: JSON.stringify({ phone: '+2250708091011', pin: '402138' }),
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
  assert.equal(successfulOrders, 3, `Expected all three pending requests to be recorded, got ${successfulOrders}`);

  const productAfter = await apiFetch(`/api/shops/1/products`);
  assert.equal(productAfter.response.status, 200);
  const updatedProduct = productAfter.payload.find((item: any) => item.id === createdProduct.id);
  assert.ok(updatedProduct);
  assert.equal(updatedProduct.stock, 1);

  const duplicateProductCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Produit lignes dupliquées',
      description: 'Validation du regroupement de stock',
      price: 1000,
      stock: 5,
      image_url: 'https://example.com/duplicate-lines.jpg',
      is_available: true,
      category: 'fashion',
    }),
  });
  assert.equal(duplicateProductCreate.response.status, 200);
  const duplicateProduct = duplicateProductCreate.payload.product;
  const duplicateOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client doublon',
      customer_phone: '+2250500000003',
      delivery_location: 'Abidjan',
      payment_method_preference: 'wave',
      items: [
        { product_id: duplicateProduct.id, quantity: 2 },
        { product_id: duplicateProduct.id, quantity: 2 },
      ],
    }),
  });
  assert.equal(duplicateOrder.response.status, 200, JSON.stringify(duplicateOrder.payload));
  const duplicateProductAfter = await apiFetch(`/api/shops/1/products`);
  const duplicateProductState = duplicateProductAfter.payload.find((item: any) => item.id === duplicateProduct.id);
  assert.equal(duplicateProductState.stock, 5);
});

test('existing merchant full flow: login, product management, order lifecycle, billing snapshot, and store status toggle', async () => {
  const login = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250708091011', pin: '402138' }),
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

  const stockBeforeConfirmation = await apiFetch('/api/shops/1/products');
  const productBeforeConfirmation = stockBeforeConfirmation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productBeforeConfirmation.stock, 5);

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

  const stockAfterConfirmation = await apiFetch('/api/shops/1/products');
  const productAfterConfirmation = stockAfterConfirmation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterConfirmation.stock, 3);

  const cancelledUpdate = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelledUpdate.response.status, 200);
  assert.equal(cancelledUpdate.payload.order.status, 'cancelled');

  const competingOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client stock concurrent',
      customer_phone: '+2250500000004',
      delivery_location: 'Abidjan Plateau',
      payment_method_preference: 'wave',
      items: [{ product_id: createdProduct.id, quantity: 5 }],
    }),
  });
  assert.equal(competingOrder.response.status, 200, JSON.stringify(competingOrder.payload));
  const competingStatus = await apiFetch(`/api/shops/1/orders/${competingOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(competingStatus.response.status, 200, JSON.stringify(competingStatus.payload));

  const unsafeReactivation = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(unsafeReactivation.response.status, 409);
  assert.match(String(unsafeReactivation.payload.error), /Stock insuffisant/i);

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
  assert.match(String(registration.payload.message), /Boutique créée/i);
  assert.ok(registration.payload.owner_access_token);

  const newShopId = registration.payload.shop.id;

  const merchantLogin = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin: '654321' }),
  });
  assert.equal(merchantLogin.response.status, 200, JSON.stringify(merchantLogin.payload));
  assert.equal(merchantLogin.payload.shop.is_active, true);

  const merchantSessionState = await apiFetch('/api/auth/session');
  assert.equal(merchantSessionState.response.status, 200, JSON.stringify(merchantSessionState.payload));
  assert.equal(merchantSessionState.payload.authenticated, true);
  assert.equal(merchantSessionState.payload.userType, 'merchant');
  assert.equal(merchantSessionState.payload.shopId, newShopId);

  const privateAccessLogin = await apiFetch('/api/auth/merchant-access-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: registration.payload.owner_access_token }),
  });
  assert.equal(privateAccessLogin.response.status, 200, JSON.stringify(privateAccessLogin.payload));

  const ownerLinks = await apiFetch(`/api/shops/${newShopId}/access-link`, { method: 'POST' });
  assert.equal(ownerLinks.response.status, 200, JSON.stringify(ownerLinks.payload));
  assert.ok(String(ownerLinks.payload.access_url).includes('/app?access='));
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

  const adminSessionState = await apiFetch('/api/auth/session');
  assert.equal(adminSessionState.response.status, 200, JSON.stringify(adminSessionState.payload));
  assert.equal(adminSessionState.payload.authenticated, true);
  assert.equal(adminSessionState.payload.userType, 'admin');

  const adminSessionStateAfterRefresh = await apiFetch('/api/auth/session');
  assert.equal(adminSessionStateAfterRefresh.response.status, 200, JSON.stringify(adminSessionStateAfterRefresh.payload));
  assert.equal(adminSessionStateAfterRefresh.payload.authenticated, true);

  const accessLink = await apiFetch(`/api/admin/shops/${shopId}/access-link`, { method: 'POST' });
  assert.equal(accessLink.response.status, 200);
  assert.ok(String(accessLink.payload.access_url).includes('/app?access='));

  const ownerNotification = await apiFetch(`/api/admin/shops/${shopId}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'welcome' }),
  });
  assert.equal(ownerNotification.response.status, 200, JSON.stringify(ownerNotification.payload));
  assert.equal(ownerNotification.payload.delivery_mode, 'whatsapp_click_to_chat');
  assert.ok(String(ownerNotification.payload.whatsapp_url).startsWith('https://wa.me/'));

  const listAfterReject = await apiFetch('/api/admin/shops');
  assert.equal(listAfterReject.response.status, 200);
  const rejectedShop = listAfterReject.payload.find((item: any) => item.id === shopId);
  assert.ok(rejectedShop);
  assert.equal(rejectedShop.is_active, true);

  const changedFingerprint = await apiFetch('/api/auth/session', {
    headers: { 'Accept-Language': 'en-US' },
  });
  assert.equal(changedFingerprint.response.status, 200);
  assert.equal(changedFingerprint.payload.authenticated, false);
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
      pin_code: '402138',
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
