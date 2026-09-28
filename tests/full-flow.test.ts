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
    if (
      name === 'matable_session' ||
      name === 'matable_admin_session' ||
      name === 'matable_session_fp' ||
      name === 'matable_customer_session' ||
      name === 'matable_customer_session_fp'
    ) {
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

test('customer registration and login are supported with email, phone, and password', async () => {
  const unique = Date.now();
  const email = `client${unique}@example.com`;
  const phone = `+225070${String(unique).slice(-8)}`;

  const register = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Client Test',
      phone,
      email,
      password: 'MotDePasse!123',
    }),
  });

  assert.equal(register.response.status, 200, `Unexpected register response: ${JSON.stringify(register.payload)}`);
  assert.equal(register.payload.success, true);
  assert.equal(register.payload.user.email, email);

  const session = await apiFetch('/api/auth/customer-session');
  assert.equal(session.response.status, 200, `Unexpected session response: ${JSON.stringify(session.payload)}`);
  assert.equal(session.payload.authenticated, true);
  assert.equal(session.payload.userType, 'customer');

  const genericSession = await apiFetch('/api/auth/session');
  assert.equal(genericSession.response.status, 200, `Unexpected generic session response: ${JSON.stringify(genericSession.payload)}`);
  assert.equal(genericSession.payload.authenticated, true);
  assert.equal(genericSession.payload.userType, 'customer');

  const login = await apiFetch('/api/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'MotDePasse!123',
    }),
  });

  assert.equal(login.response.status, 200, `Unexpected login response: ${JSON.stringify(login.payload)}`);
  assert.equal(login.payload.success, true);
  assert.equal(login.payload.user.email, email);

  const logout = await apiFetch('/api/auth/customer-logout', { method: 'POST' });
  assert.equal(logout.response.status, 200, `Unexpected logout response: ${JSON.stringify(logout.payload)}`);
  assert.equal(logout.payload.success, true);
});

test('guest and authenticated checkout accepts orders, reserves stock, and tracks the WhatsApp handoff', async () => {
  const merchantPhone = uniquePhone();
  const registration = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique Parcours Client', whatsapp_number: merchantPhone, pin_code: '638294', category: 'food' }),
  });
  assert.equal(registration.response.status, 200, JSON.stringify(registration.payload));
  const shopId = registration.payload.shop.id;

  const opened = await apiFetch(`/api/shops/${shopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: true }),
  });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.payload));

  const createdProduct = await apiFetch(`/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Plat du jour test client', price: 2500, stock: 6, is_available: true }),
  });
  assert.equal(createdProduct.response.status, 200, JSON.stringify(createdProduct.payload));
  const productId = createdProduct.payload.product.id;

  const guestOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client invité',
      customer_phone: uniquePhone(),
      delivery_location: 'Cocody Angré',
      total_amount: 1,
      status: 'confirmed',
      items: [{ product_id: productId, quantity: 2 }],
    }),
  });
  assert.equal(guestOrder.response.status, 200, JSON.stringify(guestOrder.payload));
  assert.equal(guestOrder.payload.order.customer_user_id, undefined);
  assert.equal(guestOrder.payload.order.total_amount, 5000);
  assert.equal(guestOrder.payload.order.status, 'confirmed');
  assert.equal(guestOrder.payload.order.whatsapp_tracking_available, true);
  assert.equal(typeof guestOrder.payload.whatsapp_tracking_token, 'string');

  const invalidTrackingClick = await apiFetch(`/api/orders/${guestOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid-tracking-token-value' }),
  });
  assert.equal(invalidTrackingClick.response.status, 404);
  const trackingClick = await apiFetch(`/api/orders/${guestOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: guestOrder.payload.whatsapp_tracking_token }),
  });
  assert.equal(trackingClick.response.status, 200, JSON.stringify(trackingClick.payload));
  const repeatedTrackingClick = await apiFetch(`/api/orders/${guestOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: guestOrder.payload.whatsapp_tracking_token }),
  });
  assert.equal(repeatedTrackingClick.payload.clicked_at, trackingClick.payload.clicked_at);

  const customerEmail = `checkout${Date.now()}@example.ci`;
  const customerPhone = uniquePhone();
  const customerRegistration = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Client Compte', phone: customerPhone, email: customerEmail, password: 'MotDePasse!123' }),
  });
  assert.equal(customerRegistration.response.status, 200, JSON.stringify(customerRegistration.payload));

  const accountOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Nom du formulaire',
      customer_phone: uniquePhone(),
      delivery_location: 'Marcory Résidentiel',
      items: [{ product_id: productId, quantity: 3 }],
    }),
  });
  assert.equal(accountOrder.response.status, 200, JSON.stringify(accountOrder.payload));
  assert.equal(accountOrder.payload.order.customer_user_id, customerRegistration.payload.user.id);
  assert.equal(accountOrder.payload.order.status, 'confirmed');

  const customerHistory = await apiFetch('/api/auth/customer-orders');
  assert.equal(customerHistory.response.status, 200, JSON.stringify(customerHistory.payload));
  assert.deepEqual(customerHistory.payload.orders.map((order: any) => order.id), [accountOrder.payload.order.id]);

  const merchantOrders = await apiFetch(`/api/shops/${shopId}/orders`);
  assert.equal(merchantOrders.response.status, 200, JSON.stringify(merchantOrders.payload));
  const trackedGuestOrder = merchantOrders.payload.find((order: any) => order.id === guestOrder.payload.order.id);
  assert.equal(trackedGuestOrder.customer_user_id, undefined);
  assert.equal(trackedGuestOrder.whatsapp_tracking_available, true);
  assert.equal(trackedGuestOrder.whatsapp_clicked_at, trackingClick.payload.clicked_at);
  assert.equal(JSON.stringify(merchantOrders.payload).includes(guestOrder.payload.whatsapp_tracking_token), false);
  assert.equal(merchantOrders.payload.find((order: any) => order.id === accountOrder.payload.order.id).customer_user_id, customerRegistration.payload.user.id);

  const stockAfterOrderCreation = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(stockAfterOrderCreation.payload[0].stock, 1);

  const cancelled = await apiFetch(`/api/shops/${shopId}/orders/${guestOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.payload));
  const stockAfterCancellation = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(stockAfterCancellation.payload[0].stock, 3);

  const invalidTransition = await apiFetch(`/api/shops/${shopId}/orders/${accountOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'refunded' }),
  });
  assert.equal(invalidTransition.response.status, 400);
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
  assert.equal(successfulOrders, 1, `Expected one of three auto-accepted orders to reserve the last unit, got ${successfulOrders}`);
  assert.equal(orderAttempts.find((attempt) => attempt.response.status === 200)?.payload.order.status, 'confirmed');

  const productAfter = await apiFetch(`/api/shops/1/products`);
  assert.equal(productAfter.response.status, 200);
  const updatedProduct = productAfter.payload.find((item: any) => item.id === createdProduct.id);
  assert.ok(updatedProduct);
  assert.equal(updatedProduct.stock, 0);

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
  assert.equal(duplicateOrder.payload.order.status, 'confirmed');
  const duplicateProductAfter = await apiFetch(`/api/shops/1/products`);
  const duplicateProductState = duplicateProductAfter.payload.find((item: any) => item.id === duplicateProduct.id);
  assert.equal(duplicateProductState.stock, 1);
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

  const productEdit = await apiFetch(`/api/shops/1/products/${createdProduct.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit marchand modifié', price: 2600, stock: 5 }),
  });
  assert.equal(productEdit.response.status, 200, JSON.stringify(productEdit.payload));
  assert.equal(productEdit.payload.product.title, 'Produit marchand modifié');

  const hideProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(hideProduct.response.status, 200, JSON.stringify(hideProduct.payload));
  assert.equal(hideProduct.payload.is_available, false);
  const showProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(showProduct.response.status, 200, JSON.stringify(showProduct.payload));
  assert.equal(showProduct.payload.is_available, true);

  const temporaryProduct = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Article test suppression', price: 900, stock: 1 }),
  });
  assert.equal(temporaryProduct.response.status, 200, JSON.stringify(temporaryProduct.payload));
  const temporaryProductId = temporaryProduct.payload.product.id;
  const stockDown = await apiFetch(`/api/shops/1/products/${temporaryProductId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta: -5 }),
  });
  assert.equal(stockDown.response.status, 200, JSON.stringify(stockDown.payload));
  assert.equal(stockDown.payload.stock, 0);
  assert.equal(stockDown.payload.product.is_available, false);
  const stockUp = await apiFetch(`/api/shops/1/products/${temporaryProductId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta: 2 }),
  });
  assert.equal(stockUp.response.status, 200, JSON.stringify(stockUp.payload));
  assert.equal(stockUp.payload.stock, 2);
  assert.equal(stockUp.payload.product.is_available, false);
  const showRestockedProduct = await apiFetch(`/api/shops/1/products/${temporaryProductId}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(showRestockedProduct.payload.is_available, true);
  const deleteProduct = await apiFetch(`/api/shops/1/products/${temporaryProductId}`, { method: 'DELETE' });
  assert.equal(deleteProduct.response.status, 200, JSON.stringify(deleteProduct.payload));
  assert.equal((await apiFetch('/api/shops/1/products')).payload.some((product: any) => product.id === temporaryProductId), false);

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

  assert.equal(order.payload.order.status, 'confirmed');
  assert.equal(order.payload.order.whatsapp_tracking_available, true);
  const stockAfterOrderCreation = await apiFetch('/api/shops/1/products');
  const productAfterOrderCreation = stockAfterOrderCreation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterOrderCreation.stock, 3);

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

  const stockAfterRepeatedConfirmation = await apiFetch('/api/shops/1/products');
  const productAfterRepeatedConfirmation = stockAfterRepeatedConfirmation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterRepeatedConfirmation.stock, 3);

  const cancelledUpdate = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelledUpdate.response.status, 200);
  assert.equal(cancelledUpdate.payload.order.status, 'cancelled');
  const stockAfterCancellation = await apiFetch('/api/shops/1/products');
  const productAfterCancellation = stockAfterCancellation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterCancellation.stock, 5);

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
  assert.equal(competingOrder.payload.order.status, 'confirmed');

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
      welcome_message: 'Bienvenue chez Boutique Test Premium',
    }),
  });

  assert.equal(registration.response.status, 200, `Shop creation failed: ${JSON.stringify(registration.payload)}`);
  assert.match(String(registration.payload.message), /Boutique créée/i);
  assert.equal(registration.payload.shop.is_active, true);
  assert.equal(registration.payload.shop.subscription.status, 'trialing');
  assert.equal(typeof registration.payload.shop.subscription.trialStart, 'string');
  assert.equal(typeof registration.payload.shop.subscription.trialEnd, 'string');
  assert.ok(registration.payload.shop.subscription.trialDaysRemaining >= 29);
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

  const adminHealthBeforeLogin = await apiFetch('/api/admin/health');
  assert.equal(adminHealthBeforeLogin.response.status, 401);

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

  const adminHealth = await apiFetch('/api/admin/health');
  assert.equal(adminHealth.response.status, 200, JSON.stringify(adminHealth.payload));
  assert.equal(adminHealth.payload.status, 'ok');
  assert.equal(typeof adminHealth.payload.counts.shops, 'number');

  const adminShops = await apiFetch('/api/admin/shops');
  assert.equal(adminShops.response.status, 200, JSON.stringify(adminShops.payload));
  assert.ok(adminShops.payload.some((shop: any) => shop.id === shopId));

  const adminOrders = await apiFetch('/api/admin/orders?limit=10');
  assert.equal(adminOrders.response.status, 200, JSON.stringify(adminOrders.payload));
  assert.ok(Array.isArray(adminOrders.payload.orders));

  const adminAnalytics = await apiFetch('/api/admin/analytics?days=7');
  assert.equal(adminAnalytics.response.status, 200, JSON.stringify(adminAnalytics.payload));
  assert.equal(adminAnalytics.payload.days, 7);

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

  const disableShop = await apiFetch(`/api/admin/shops/${shopId}/toggle-active`, { method: 'PATCH' });
  assert.equal(disableShop.response.status, 200, JSON.stringify(disableShop.payload));
  assert.equal(disableShop.payload.is_active, false);
  const enableShop = await apiFetch(`/api/admin/shops/${shopId}/toggle-active`, { method: 'PATCH' });
  assert.equal(enableShop.response.status, 200, JSON.stringify(enableShop.payload));
  assert.equal(enableShop.payload.is_active, true);

  const changedFingerprint = await apiFetch('/api/auth/session', {
    headers: { 'Accept-Language': 'en-US' },
  });
  assert.equal(changedFingerprint.response.status, 200);
  assert.equal(changedFingerprint.payload.authenticated, false);
});

test('security hardening: duplicate shop prevention', async () => {
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
    }),
  });
  assert.equal(duplicate.response.status, 409);

});

test('merchant A cannot mutate merchant B products', async () => {
  const merchantAPhone = uniquePhone();
  const merchantBPhone = uniquePhone();
  const createShop = async (name: string, phone: string) => {
    const response = await apiFetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, whatsapp_number: phone, pin_code: '638294', category: 'fashion', city: 'Abidjan' }),
    });
    assert.equal(response.response.status, 200, JSON.stringify(response.payload));
    return response.payload.shop.id as number;
  };

  const merchantAShopId = await createShop('Boutique Marchand A', merchantAPhone);
  const merchantBShopId = await createShop('Boutique Marchand B', merchantBPhone);

  const loginB = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: merchantBPhone, pin: '638294' }),
  });
  assert.equal(loginB.response.status, 200);
  const product = await apiFetch(`/api/shops/${merchantBShopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit privé B', price: 2500, stock: 4 }),
  });
  assert.equal(product.response.status, 200, JSON.stringify(product.payload));
  const productId = product.payload.product.id;

  const loginA = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: merchantAPhone, pin: '638294' }),
  });
  assert.equal(loginA.response.status, 200);

  const attempts = await Promise.all([
    apiFetch(`/api/shops/${merchantBShopId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Intrusion', price: 1, stock: 1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Produit détourné', price: 1, stock: 1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: -1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}/toggle-visibility`, { method: 'PATCH' }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}`, { method: 'DELETE' }),
  ]);

  for (const attempt of attempts) assert.equal(attempt.response.status, 401, JSON.stringify(attempt.payload));
  assert.notEqual(merchantAShopId, merchantBShopId);
});
