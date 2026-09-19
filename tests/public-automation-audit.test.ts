import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
