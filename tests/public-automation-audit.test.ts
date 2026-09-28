import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { CATEGORY_DEFAULTS } from '../src/utils/categoryDefaults';

const TEST_PORT = 43124;
const TEST_DB_PATH = path.join(process.cwd(), 'data', `matable-public-audit-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error('Server did not become ready in time.');
}

before(async () => {
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'super-admin-demo-key',
      NODE_ENV: 'test',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
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

function uniquePhone() {
  const suffix = String(Date.now() + Math.floor(Math.random() * 100000)).slice(-8);
  return `+22507${suffix}`.slice(0, 15);
}

test('public directory shows active shops from the local onboarding flow', async () => {
  const publicShops = await fetch(`${BASE_URL}/api/shops`);
  assert.equal(publicShops.status, 200);
  const payload = await publicShops.json();
  assert.ok(Array.isArray(payload));
  assert.ok(payload.length > 0);
  assert.ok(payload.every((shop: any) => shop.is_active === true));

  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique privée de test',
      whatsapp_number: newPhone,
      pin_code: '456789',
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(created.status, 200);
  const createdShop = await created.json();
  assert.match(String(createdShop.message), /Boutique créée/i);

  const directoryAfterCreate = await fetch(`${BASE_URL}/api/shops`);
  const directoryPayload = await directoryAfterCreate.json();
  const found = directoryPayload.find((shop: any) => shop.slug === createdShop.shop.slug);
  assert.ok(found);

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdShop.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.is_active, true);
});

test('shop and product API defaults are category-aware and product placeholders are not persisted', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Atelier beauté API',
      whatsapp_number: uniquePhone(),
      pin_code: '274915',
      category: 'beauty',
      theme_config: {
        custom_banner_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200',
      },
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();
  assert.equal(createdPayload.shop.welcome_message, CATEGORY_DEFAULTS.beauty.welcomeMessage);
  assert.equal(createdPayload.shop.theme_config.custom_banner_url, '');
  assert.equal(createdPayload.shop.theme_config.primary_color, CATEGORY_DEFAULTS.beauty.primaryColor);

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const productResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      title: 'Soin hydratant',
      price: 5000,
      stock: 3,
      attributes: { care_type: 'Hydratant', volume: '250 ml', wrong_field: 'À ignorer' },
    }),
  });
  assert.equal(productResponse.status, 200);
  const productPayload = await productResponse.json();
  assert.equal(productPayload.product.image_url, '');
  assert.deepEqual(productPayload.product.attributes, { care_type: 'Hydratant', volume: '250 ml' });

  const persistedDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const persistedProduct = persistedDb.prepare('SELECT image_url, attributes FROM products WHERE id = ?').get(productPayload.product.id) as { image_url: string; attributes: string };
    assert.equal(persistedProduct.image_url, '');
    assert.deepEqual(JSON.parse(persistedProduct.attributes), { care_type: 'Hydratant', volume: '250 ml' });
  } finally {
    persistedDb.close();
  }

  const legacyImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600' }),
  });
  assert.equal(legacyImageUpdate.status, 200);
  assert.equal((await legacyImageUpdate.json()).product.image_url, '');

  const realImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: 'https://example.com/soin-hydratant.jpg' }),
  });
  assert.equal(realImageUpdate.status, 200);
  assert.equal((await realImageUpdate.json()).product.image_url, 'https://example.com/soin-hydratant.jpg');

  const clearImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: '' }),
  });
  assert.equal(clearImageUpdate.status, 200);
  assert.equal((await clearImageUpdate.json()).product.image_url, '');

  const publicShop = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicShop.status, 200);
  const publicShopPayload = await publicShop.json();
  assert.deepEqual(publicShopPayload.products[0].attributes, { care_type: 'Hydratant', volume: '250 ml' });

  const finalDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const persistedProduct = finalDb.prepare('SELECT image_url FROM products WHERE id = ?').get(productPayload.product.id) as { image_url: string };
    assert.equal(persistedProduct.image_url, '');
  } finally {
    finalDb.close();
  }

});

test('rejects unauthenticated payment activation and merchant mutations', async () => {
  const confirmation = await fetch(`${BASE_URL}/api/shops/1/payment-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_method: 'mobile_money', amount: 1 }),
  });
  assert.equal(confirmation.status, 404);

  const productMutation = await fetch(`${BASE_URL}/api/shops/1/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'attaque', price: 1, stock: 1 }),
  });
  assert.equal(productMutation.status, 401);

  const protectedMutations: Array<{ path: string; method: string; body?: unknown }> = [
    { path: '/api/shops/1/toggle-status', method: 'POST', body: { is_open: true } },
    { path: '/api/shops/1/toggle-status', method: 'PATCH', body: { is_open: true } },
    { path: '/api/shops/1/theme', method: 'PUT', body: { theme_config: { primary_color: '#176b55' } } },
    { path: '/api/shops/1', method: 'PUT', body: { name: 'Modification non autorisée' } },
    { path: '/api/shops/1/orders/1/status', method: 'PATCH', body: { status: 'confirmed' } },
    { path: '/api/shops/1/products/1', method: 'PUT', body: { title: 'Modification non autorisée' } },
    { path: '/api/shops/1/products/1/stock', method: 'PATCH', body: { delta: 1 } },
    { path: '/api/shops/1/products/1/toggle-visibility', method: 'PATCH' },
    { path: '/api/shops/1/products/1', method: 'DELETE' },
    { path: '/api/shops/1/access-link', method: 'POST' },
  ];
  for (const mutation of protectedMutations) {
    const response = await fetch(`${BASE_URL}${mutation.path}`, {
      method: mutation.method,
      ...(mutation.body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation.body),
      }),
    });
    assert.equal(response.status, 401, `${mutation.method} ${mutation.path} must require an authenticated merchant`);
  }

  const protectedReads = [
    '/api/shops/1/products',
    '/api/shops/1/orders',
    '/api/shops/1/flash-bilan',
  ];
  for (const route of protectedReads) {
    assert.equal((await fetch(`${BASE_URL}${route}`)).status, 401, `${route} must require an authenticated merchant`);
  }

  for (const route of ['/api/admin/shops', '/api/admin/orders', '/api/admin/analytics', '/api/admin/health']) {
    assert.equal((await fetch(`${BASE_URL}${route}`)).status, 401, `${route} must require an authenticated admin`);
  }
});

test('registration flow is coherent without external payment or WhatsApp API', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Paiement Test',
      whatsapp_number: newPhone,
      pin_code: '987654',
      category: 'food',
      city: 'San Pedro',
      subscription_tier: 'premium',
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();
  assert.match(String(createdPayload.message), /reçu WhatsApp/i);

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, pin: '987654' }),
  });
  assert.equal(merchantLogin.status, 200);
});

test('shop metadata keeps social links and delivery zones for the storefront checklist', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Checklist Social',
      whatsapp_number: newPhone,
      pin_code: '112233',
      category: 'fashion',
      city: 'Yopougon',
      subscription_tier: 'standard',
      theme_config: {
        social_links: {
          instagram: 'https://instagram.com/boutiquechecklist',
          facebook: 'https://facebook.com/boutiquechecklist',
        },
        delivery_zones: [
          { label: 'Cocody', mode: 'livraison', fee: 1500, description: 'Livraison rapide' },
          { label: 'Yopougon', mode: 'sur_place', fee: 0 },
        ],
      },
    }),
  });

  assert.equal(created.status, 200, 'Shop creation should succeed');
  const createdPayload = await created.json();
  assert.ok(createdPayload.shop.theme_config?.social_links?.instagram);
  assert.deepEqual(createdPayload.shop.theme_config?.delivery_zones?.[0]?.label, 'Cocody');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.ok(publicData.shop.theme_config?.social_links?.instagram);
  assert.equal(publicData.shop.theme_config?.delivery_zones?.[0]?.mode, 'livraison');
});

test('merchant can update storefront social links and service zones', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Métadonnées Merchant',
      whatsapp_number: newPhone,
      pin_code: '445566',
      category: 'beauty',
      city: 'Yopougon',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, pin: '445566' }),
  });
  assert.equal(merchantLogin.status, 200);
  const merchantCookies = merchantLogin.headers.get('set-cookie');
  const merchantCookieHeader = merchantCookies ? merchantCookies.split(';')[0] : undefined;

  const updateRes = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(merchantCookieHeader ? { Cookie: merchantCookieHeader } : {}),
    },
    body: JSON.stringify({
      theme_config: {
      brand_direction: 'moderne',
        social_links: {
          instagram: 'https://instagram.com/merchant-meta',
          facebook: 'https://facebook.com/merchant-meta',
          website: 'https://merchant-meta.ci',
        },
        delivery_zones: [
          { label: 'Cocody', mode: 'livraison', fee: 1200, description: 'Livraison rapide' },
          { label: 'Sur place', mode: 'sur_place', fee: 0 },
        ],
      },
    }),
  });

  assert.equal(updateRes.status, 200, 'merchant metadata update should succeed');
  const updated = await updateRes.json();
  assert.equal(updated.shop.theme_config?.social_links?.instagram, 'https://instagram.com/merchant-meta');
  assert.equal(updated.shop.theme_config?.brand_direction, 'moderne');
  assert.equal(updated.shop.theme_config?.delivery_zones?.[0]?.label, 'Cocody');

  const themeSave = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/theme`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(merchantCookieHeader ? { Cookie: merchantCookieHeader } : {}),
    },
    body: JSON.stringify({
      theme_config: {
        brand_direction: 'authentique',
        primary_color: '#176B55',
      },
    }),
  });
  assert.equal(themeSave.status, 200, 'theme save should succeed');
  const savedTheme = await themeSave.json();
  assert.equal(savedTheme.shop.theme_config?.brand_direction, 'authentique');
  assert.equal(savedTheme.shop.theme_config?.primary_color, '#176B55');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.theme_config?.social_links?.instagram, 'https://instagram.com/merchant-meta');
  assert.equal(publicData.shop.theme_config?.brand_direction, 'authentique');
  assert.equal(publicData.shop.theme_config?.primary_color, '#176B55');
  assert.equal(publicData.shop.theme_config?.delivery_zones?.[0]?.mode, 'livraison');
});

test('onboarding preserves explicit opening-hours and keeps the storefront open inside the configured schedule', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Horaires Publics',
      whatsapp_number: newPhone,
      pin_code: '778899',
      category: 'food',
      city: 'Abidjan',
      subscription_tier: 'standard',
      opening_hours: {
        enabled: true,
        open_time: '00:00',
        close_time: '23:59',
        days: [0, 1, 2, 3, 4, 5, 6],
        manual_override: false,
      },
    }),
  });

  assert.equal(created.status, 200, 'Shop creation with opening-hours should succeed');
  const createdPayload = await created.json();
  assert.equal(createdPayload.shop.opening_hours.enabled, true);
  assert.equal(createdPayload.shop.opening_hours.open_time, '00:00');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.opening_hours.enabled, true);
  assert.equal(publicData.shop.is_open, true);
});

test('public directory prioritizes open shops before closed ones in discovery order', async () => {
  const closedPhone = uniquePhone();
  const closedCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Fermée Prioritaire',
      whatsapp_number: closedPhone,
      pin_code: '332211',
      category: 'beauty',
      city: 'Abidjan',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(closedCreate.status, 200);
  const closedPayload = await closedCreate.json();

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  const openHour = Math.max(0, currentHour - 1);
  const closeHour = currentHour + 2;
  const pad = (value: number) => String(value).padStart(2, '0');
  const openFrom = `${pad(openHour)}:00`;
  const openUntil = `${pad(Math.min(23, closeHour))}:00`;

  const effectiveOpenHours = closeHour >= 24 ? {
    enabled: true,
    open_time: openFrom,
    close_time: '23:59',
    days: [currentDay],
    manual_override: false,
  } : {
    enabled: true,
    open_time: openFrom,
    close_time: openUntil,
    days: [currentDay],
    manual_override: false,
  };

  const openPhone = uniquePhone();
  const openCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Ouverte Prioritaire',
      whatsapp_number: openPhone,
      pin_code: '112244',
      category: 'food',
      city: 'Yopougon',
      subscription_tier: 'standard',
      opening_hours: effectiveOpenHours,
    }),
  });
  assert.equal(openCreate.status, 200);
  const openPayload = await openCreate.json();

  const directory = await fetch(`${BASE_URL}/api/shops`);
  assert.equal(directory.status, 200);
  const directoryPayload = await directory.json();
  const openIndex = directoryPayload.findIndex((shop: any) => shop.slug === openPayload.shop.slug);
  const closedIndex = directoryPayload.findIndex((shop: any) => shop.slug === closedPayload.shop.slug);
  assert.ok(openIndex >= 0, 'Open shop should appear in the directory');
  assert.ok(closedIndex >= 0, 'Closed shop should appear in the directory');
  assert.ok(openIndex < closedIndex, 'Open shops should be listed before closed shops in discovery order');
});

test('shop pages expose canonical SEO metadata for social sharing and indexing', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique SEO Test',
      whatsapp_number: newPhone,
      pin_code: '667788',
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'standard',
      theme_config: {
        custom_banner_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1200&auto=format&fit=crop&q=80',
      },
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();

  const publicPage = await fetch(`${BASE_URL}/${encodeURIComponent(createdPayload.shop.slug)}`);
  assert.equal(publicPage.status, 200);
  const html = await publicPage.text();
  assert.match(html, /<title>.*Boutique SEO Test.*MaTable\.ci.*<\/title>/i);
  assert.match(html, /<meta name="description"/i);
  assert.match(html, /<link rel="canonical" href=".*\/boutique-seo-test"/i);
  assert.match(html, /og:title|og:image|twitter:card/i);
});

test('free onboarding keeps the shop active without subscription controls', async () => {
  const shopCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Rappel Test',
      whatsapp_number: uniquePhone(),
      pin_code: '223344',
      category: 'food',
      city: 'Bouaké',
      subscription_tier: 'standard',
    }),
  });
  const shopCreateText = await shopCreate.text();
  assert.equal(shopCreate.status, 200, `Shop creation failed: ${shopCreateText}`);
  const reminderShop = JSON.parse(shopCreateText);
  assert.equal(reminderShop.shop.is_active, true);

  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const cookies = adminLogin.headers.get('set-cookie');
  const cookieHeader = cookies ? cookies.split(';')[0] : undefined;

  const adminShops = await fetch(`${BASE_URL}/api/admin/shops`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  assert.equal(adminShops.status, 200);
  const adminShop = (await adminShops.json()).find((shop: any) => shop.id === reminderShop.shop.id);
  assert.equal(adminShop.is_active, true);
});
