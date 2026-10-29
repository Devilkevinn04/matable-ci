import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_DB_PATH = path.join(tmpdir(), `matable-delivery-e2e-${Date.now()}.db`);
const ADMIN_KEY = 'delivery-e2e-test-super-admin-key';
const VERIFICATION_KEY = 'delivery-e2e-test-verification-key';
const EVENT_SECRET = 'delivery-e2e-test-signing-secret-32';
const DIDIT_WEBHOOK_SECRET = 'delivery-e2e-test-didit-webhook-secret';
// 1x1 transparent PNG used to exercise the proof upload contract.
const PROOF_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PROOF_SHA256 = createHash('sha256').update(Buffer.from(PROOF_BASE64, 'base64')).digest('hex');
let baseUrl = '';
let serverProcess: ChildProcess | null = null;

async function reservePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Retry while the subprocess initializes its database.
    }
    await delay(250);
  }
  throw new Error('Delivery E2E test server did not become ready in time.');
}

async function api<T = Record<string, unknown>>(
  pathName: string,
  options: RequestInit = {},
  cookie?: string,
) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set('Cookie', cookie);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}${pathName}`, { ...options, headers });
  return { response, payload: await response.json() as T };
}

async function loginCookie(pathName: string, body: object): Promise<string> {
  const { response } = await api(pathName, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

async function approveDriverWithDidit(driverId: number) {
  const sessionId = randomUUID();
  const workflowId = randomUUID();
  const createdAt = new Date().toISOString();
  const database = new Database(TEST_DB_PATH);
  try {
    database.prepare(`INSERT INTO delivery_driver_identity_sessions
      (session_id, driver_id, workflow_id, status, consent_at, consent_version, created_at, updated_at)
      VALUES (?, ?, ?, 'In Review', ?, 'didit-driver-v1', ?, ?)`)
      .run(sessionId, driverId, workflowId, createdAt, createdAt, createdAt);
  } finally {
    database.close();
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({
    event_id: randomUUID(),
    session_id: sessionId,
    status: 'Approved',
    webhook_type: 'status.updated',
    timestamp,
  });
  const response = await fetch(`${baseUrl}/api/webhooks/didit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timestamp': String(timestamp),
      'x-signature': createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    },
    body: rawBody,
  });
  assert.equal(response.status, 204);
}

before(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: ADMIN_KEY,
      VERIFICATION_ADMIN_ACCESS_KEY: VERIFICATION_KEY,
      AD_EVENT_SIGNING_SECRET: EVENT_SECRET,
      DIDIT_WEBHOOK_SECRET,
      NODE_ENV: 'test',
      DELIVERY_TEST_MODE: 'true',
      DELIVERY_SANDBOX_PAYMENTS: 'true',
      PORT: String(port),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: baseUrl,
    },
    stdio: 'ignore',
  });
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

test('local delivery flow covers account approval, sandbox fee, zone quote, course, contacts and terminal locks', async () => {
  const admin = await loginCookie('/api/auth/admin-login', { key: ADMIN_KEY, role: 'super_admin' });
  const zonesResponse = await api<{ zones: { id: number; label: string }[] }>('/api/admin/delivery/configuration', {
    method: 'GET',
  }, admin);
  assert.equal(zonesResponse.response.status, 200);
  const zonesByName = new Map(zonesResponse.payload.zones.map((zone) => [zone.label, zone.id]));
  for (const label of ['Cocody', 'Bingerville', 'Abatta', 'Palmeraie', 'Angré']) {
    if (zonesByName.has(label)) continue;
    const added = await api<{ zones: { id: number; label: string }[] }>('/api/admin/delivery/zones', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }, admin);
    assert.equal(added.response.status, 201);
    for (const zone of added.payload.zones) zonesByName.set(zone.label, zone.id);
  }
  const cocodyId = zonesByName.get('Cocody');
  const bingervilleId = zonesByName.get('Bingerville');
  const abattaId = zonesByName.get('Abatta');
  const palmeraieId = zonesByName.get('Palmeraie');
  assert.ok(cocodyId && bingervilleId && abattaId && palmeraieId);

  const driverRegistration = await api<{ driver: { id: number; status: string } }>('/api/delivery/drivers/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Livreur E2E', phone: '+2250788990101', pin: '638294' }),
  });
  assert.equal(driverRegistration.response.status, 201);
  const driverId = driverRegistration.payload.driver.id;
  assert.equal(driverRegistration.payload.driver.status, 'pending');
  const driverCookie = await loginCookie('/api/delivery/drivers/login', {
    phone: '+2250788990101',
    pin: '638294',
  });

  const preApproval = await api('/api/delivery/drivers/subscription/sandbox', {
    method: 'POST',
  }, driverCookie);
  assert.equal(preApproval.response.status, 403);
  const missingConsent = await api('/api/delivery/drivers/identity/session', {
    method: 'POST',
    body: JSON.stringify({ consent: false }),
  }, driverCookie);
  assert.equal(missingConsent.response.status, 400);
  await approveDriverWithDidit(driverId);
  const verifiedSession = await api<{ driver: { status: string; identity_status: string }; zones: { id: number; is_active: boolean }[] }>(
    '/api/delivery/drivers/session',
    {},
    driverCookie,
  );
  assert.equal(verifiedSession.response.status, 200);
  assert.equal(verifiedSession.payload.driver.status, 'active');
  assert.equal(verifiedSession.payload.driver.identity_status, 'verified');
  assert.equal(verifiedSession.payload.zones.length, 5);
  assert.ok(verifiedSession.payload.zones.every((zone) => !zone.is_active));

  const setOrigin = await api('/api/admin/delivery/shop-origins/1', {
    method: 'PUT',
    body: JSON.stringify({ zone_id: cocodyId }),
  }, admin);
  assert.equal(setOrigin.response.status, 200);

  const merchantCookie = await loginCookie('/api/auth/merchant-login', {
    phone: '0708091011',
    pin: '402138',
  });

  const cocodyToBingerville = await api('/api/admin/delivery/tariffs', {
    method: 'PUT',
    body: JSON.stringify({ origin_zone_id: cocodyId, destination_zone_id: bingervilleId, amount: 2000 }),
  }, admin);
  assert.equal(cocodyToBingerville.response.status, 200);
  const outOfRangeTariff = await api('/api/admin/delivery/tariffs', {
    method: 'PUT',
    body: JSON.stringify({ origin_zone_id: cocodyId, destination_zone_id: abattaId, amount: 2800 }),
  }, admin);
  assert.equal(outOfRangeTariff.response.status, 200);
  const missingTariffQuote = await api(
    `/api/shops/1/orders/1/delivery-quote?destination_zone_id=${palmeraieId}`,
    {},
    merchantCookie,
  );
  assert.equal(missingTariffQuote.response.status, 404);
  const outOfRangeQuote = await api(
    `/api/shops/1/orders/1/delivery-quote?destination_zone_id=${abattaId}`,
    {},
    merchantCookie,
  );
  assert.equal(outOfRangeQuote.response.status, 404);
  const validQuote = await api<{ quote: { amount: number; origin_zone: string; destination_zone: string } }>(
    `/api/shops/1/orders/1/delivery-quote?destination_zone_id=${bingervilleId}`,
    {},
    merchantCookie,
  );
  assert.equal(validQuote.response.status, 200);
  assert.deepEqual(validQuote.payload.quote, {
    amount: 2000,
    origin_zone: 'Cocody',
    destination_zone: 'Bingerville',
    origin_zone_id: cocodyId,
    destination_zone_id: bingervilleId,
  });

  const driverAccessBeforePay = await api('/api/delivery/courses', {}, driverCookie);
  assert.equal(driverAccessBeforePay.response.status, 403);
  const fee = await api<{ amount: number; payment_mode: string; expires_at: string }>('/api/delivery/drivers/subscription/sandbox', {
    method: 'POST',
  }, driverCookie);
  assert.equal(fee.response.status, 200);
  assert.equal(fee.payload.amount, 1000);
  assert.equal(fee.payload.payment_mode, 'sandbox');
  assert.ok(Date.parse(fee.payload.expires_at) - Date.now() > 23 * 60 * 60 * 1000);

  const selectedZones = await api('/api/delivery/drivers/zones', {
    method: 'PUT',
    body: JSON.stringify({ zone_ids: [cocodyId, bingervilleId] }),
  }, driverCookie);
  assert.equal(selectedZones.response.status, 200);
  const forbiddenZone = await api('/api/delivery/drivers/zones', {
    method: 'PUT',
    body: JSON.stringify({ zone_ids: [zonesByName.get('Cocody'), 999999] }),
  }, driverCookie);
  assert.equal(forbiddenZone.response.status, 403);

  const request = await api<{ delivery: { id: number; status: string; quoted_amount: number; ticket_number: string; created_at: string } }>(
    '/api/shops/1/orders/1/delivery',
    {
      method: 'POST',
      body: JSON.stringify({ destination_zone_id: bingervilleId }),
    },
    merchantCookie,
  );
  assert.equal(request.response.status, 201);
  assert.equal(request.payload.delivery.status, 'requested');
  assert.equal(request.payload.delivery.quoted_amount, 2000);
  assert.match(request.payload.delivery.ticket_number, /^LIV-\d{6}-\d{6}$/);
  const deliveryId = request.payload.delivery.id;
  assert.equal(
    request.payload.delivery.ticket_number,
    `LIV-${request.payload.delivery.created_at.slice(2, 10).replace(/-/g, '')}-${String(deliveryId).padStart(6, '0')}`,
  );

  const createdTimeline = await api<{ events: { next_status: string; actor_type: string; actor_name: string }[] }>(
    `/api/shops/1/deliveries/${deliveryId}/events`,
    {},
    merchantCookie,
  );
  assert.equal(createdTimeline.response.status, 200);
  assert.equal(createdTimeline.payload.events.length, 1);
  assert.equal(createdTimeline.payload.events[0].next_status, 'requested');
  assert.equal(createdTimeline.payload.events[0].actor_type, 'merchant');
  assert.equal(createdTimeline.payload.events[0].actor_name, 'Aya Chic Lingerie & Nuisettes');
  assert.equal((await api(`/api/delivery/courses/${deliveryId}/events`, {}, driverCookie)).response.status, 404);
  assert.equal((await api(`/api/shops/1/deliveries/${deliveryId}/events`)).response.status, 401);

  const driverPushConfig = await api<{ configured: boolean; public_key: string | null; subscribed_devices: number }>(
    '/api/delivery/drivers/push/config',
    {},
    driverCookie,
  );
  assert.equal(driverPushConfig.response.status, 200);
  assert.equal(driverPushConfig.payload.configured, false);
  assert.equal(driverPushConfig.payload.public_key, null);
  assert.equal(driverPushConfig.payload.subscribed_devices, 0);
  const disabledPushSubscription = {
    subscription: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/delivery-e2e',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    },
  };
  const driverPushSubscription = await api('/api/delivery/drivers/push/subscription', {
    method: 'PUT',
    body: JSON.stringify(disabledPushSubscription),
  }, driverCookie);
  assert.equal(driverPushSubscription.response.status, 503);
  assert.equal((await api('/api/delivery/drivers/push/subscription', { method: 'DELETE', body: JSON.stringify({ endpoint: disabledPushSubscription.subscription.endpoint }) }, driverCookie)).response.status, 200);
  assert.equal((await api('/api/delivery/drivers/push/config')).response.status, 401);

  const testDb = new Database(TEST_DB_PATH);
  try {
    testDb.prepare(`INSERT INTO orders (
      id, shop_id, customer_name, customer_phone, delivery_location, total_amount,
      created_at, status, items
    ) SELECT 101, shop_id, customer_name, customer_phone, delivery_location, total_amount,
      ?, 'confirmed', items FROM orders WHERE id = 1`).run(new Date().toISOString());
  } finally {
    testDb.close();
  }
  const secondRequest = await api<{ delivery: { id: number } }>('/api/shops/1/orders/101/delivery', {
    method: 'POST',
    body: JSON.stringify({ destination_zone_id: bingervilleId }),
  }, merchantCookie);
  assert.equal(secondRequest.response.status, 201);
  const secondDeliveryId = secondRequest.payload.delivery.id;

  const customerRegistration = await api<{ user: { id: number } }>('/api/auth/customer-register', {
    method: 'POST',
    body: JSON.stringify({
      first_name: 'Client',
      last_name: 'Contacts',
      phone: '+2250788990140',
      email: `order-contact-${Date.now()}@example.ci`,
      password: 'MotDePasse!123',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(customerRegistration.response.status, 200);
  const customerCookie = customerRegistration.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(customerCookie);
  const contactDb = new Database(TEST_DB_PATH);
  try {
    contactDb.prepare('UPDATE orders SET customer_user_id = ?, customer_phone = ? WHERE id = ?')
      .run(customerRegistration.payload.user.id, '+2250788990140', 101);
  } finally {
    contactDb.close();
  }
  const orderHistory = await api<{ orders: Record<string, unknown>[] }>('/api/auth/customer-orders', {}, customerCookie);
  assert.equal(orderHistory.response.status, 200);
  assert.equal(orderHistory.payload.orders.length, 1);
  assert.equal('customer_phone' in orderHistory.payload.orders[0], false);
  const historyDelivery = orderHistory.payload.orders[0].delivery as {
    id: number; status: string; ticket_number: string; quoted_amount: number; proof_available: boolean;
  };
  assert.equal(historyDelivery.id, secondDeliveryId);
  assert.equal(historyDelivery.status, 'requested');
  assert.equal(historyDelivery.quoted_amount, 2000);
  assert.equal(historyDelivery.proof_available, false);
  assert.match(historyDelivery.ticket_number, /^LIV-\d{6}-\d{6}$/);
  const customerDelivery = await api<{ delivery: { ticket_number: string; status: string; proof_available: boolean } }>(
    '/api/customers/orders/101/delivery',
    {},
    customerCookie,
  );
  assert.equal(customerDelivery.response.status, 200);
  assert.equal(customerDelivery.payload.delivery.ticket_number, historyDelivery.ticket_number);
  assert.equal(customerDelivery.payload.delivery.status, 'requested');
  assert.equal(customerDelivery.payload.delivery.proof_available, false);
  assert.equal((await api('/api/customers/orders/101/delivery/proof', {}, customerCookie)).response.status, 404);
  const customerOrders = await api<{ id: number; customer_phone: string }[]>('/api/shops/1/orders', {}, merchantCookie);
  assert.equal(customerOrders.response.status, 200);
  const listedOrder = customerOrders.payload.find((order) => order.id === 101);
  assert.ok(listedOrder);
  assert.notEqual(listedOrder.customer_phone, '+2250788990140');
  assert.ok(listedOrder.customer_phone.includes('••'));

  const customerPreview = await api<{ phone_masked: string; can_reveal: boolean }>(
    '/api/customers/orders/101/contacts/merchant',
    {},
    customerCookie,
  );
  assert.equal(customerPreview.response.status, 200);
  assert.equal(customerPreview.payload.can_reveal, true);
  assert.ok(customerPreview.payload.phone_masked.includes('••'));
  const customerReveal = await api<{ role: string; phone: string }>(
    '/api/customers/orders/101/contacts/merchant',
    { method: 'POST' },
    customerCookie,
  );
  assert.equal(customerReveal.response.status, 200);
  assert.equal(customerReveal.payload.role, 'merchant');
  assert.equal(customerReveal.payload.phone, '+2250708091011');
  const otherCustomerCookie = await loginCookie('/api/auth/customer-register', {
    first_name: 'Autre',
    last_name: 'Client',
    phone: '+2250788990141',
    email: `other-order-contact-${Date.now()}@example.ci`,
    password: 'MotDePasse!123',
    accepted_terms_privacy: true,
  });
  assert.equal((await api('/api/customers/orders/101/contacts/merchant', {}, otherCustomerCookie)).response.status, 404);
  assert.equal((await api('/api/customers/orders/101/contacts/merchant', { method: 'POST' }, otherCustomerCookie)).response.status, 404);
  assert.equal((await api('/api/customers/orders/101/delivery', {}, otherCustomerCookie)).response.status, 404);
  assert.equal((await api('/api/customers/orders/101/delivery/events', {}, otherCustomerCookie)).response.status, 404);
  assert.equal((await api('/api/customers/orders/101/delivery/proof', {}, otherCustomerCookie)).response.status, 404);

  const customerTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    '/api/customers/orders/101/delivery/events',
    {},
    customerCookie,
  );
  assert.equal(customerTimeline.response.status, 200);
  assert.equal(customerTimeline.payload.events.length, 1);
  assert.equal(customerTimeline.payload.events[0].next_status, 'requested');
  assert.equal(customerTimeline.payload.events[0].actor_type, 'merchant');

  const customerPushConfig = await api<{ configured: boolean; public_key: string | null; subscribed_devices: number }>(
    '/api/auth/customer-push/config',
    {},
    customerCookie,
  );
  assert.equal(customerPushConfig.response.status, 200);
  assert.equal(customerPushConfig.payload.configured, false);
  assert.equal(customerPushConfig.payload.public_key, null);
  assert.equal(customerPushConfig.payload.subscribed_devices, 0);
  const customerPushSubscription = await api('/api/auth/customer-push/subscription', {
    method: 'PUT',
    body: JSON.stringify(disabledPushSubscription),
  }, customerCookie);
  assert.equal(customerPushSubscription.response.status, 503);
  assert.equal((await api('/api/auth/customer-push/subscription', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: disabledPushSubscription.subscription.endpoint }),
  }, customerCookie)).response.status, 200);
  assert.equal((await api('/api/auth/customer-push/config')).response.status, 401);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await api('/api/customers/orders/101/contacts/merchant', { method: 'POST' }, customerCookie)).response.status, 200);
  }
  assert.equal((await api('/api/customers/orders/101/contacts/merchant', { method: 'POST' }, customerCookie)).response.status, 429);

  const merchantPreview = await api<{ phone_masked: string; can_reveal: boolean }>(
    '/api/shops/1/orders/101/contacts/customer',
    {},
    merchantCookie,
  );
  assert.equal(merchantPreview.response.status, 200);
  assert.equal(merchantPreview.payload.can_reveal, true);
  assert.ok(merchantPreview.payload.phone_masked.includes('••'));
  const merchantReveal = await api<{ role: string; phone: string }>(
    '/api/shops/1/orders/101/contacts/customer',
    { method: 'POST' },
    merchantCookie,
  );
  assert.equal(merchantReveal.response.status, 200);
  assert.equal(merchantReveal.payload.role, 'customer');
  assert.equal(merchantReveal.payload.phone, '+2250788990140');
  assert.equal((await api('/api/shops/1/orders/101/contacts/customer', {}, admin)).response.status, 403);
  assert.equal((await api('/api/shops/1/orders/101/contacts/customer', { method: 'POST' }, admin)).response.status, 403);
  const unauthorizedCustomer = await api('/api/customers/orders/101/contacts/merchant');
  assert.equal(unauthorizedCustomer.response.status, 401);

  // Keep the courier quota check independent from the order-contact quota above.
  const resetRateLimitsDb = new Database(TEST_DB_PATH);
  try {
    resetRateLimitsDb.prepare('DELETE FROM request_rate_limits').run();
  } finally {
    resetRateLimitsDb.close();
  }

  const offers = await api<{ offers: { id: number; customer_phone?: string; shop_phone?: string }[] }>(
    '/api/delivery/courses',
    {},
    driverCookie,
  );
  assert.equal(offers.response.status, 200);
  assert.equal(offers.payload.offers.length, 2);
  assert.equal(offers.payload.offers[0].id, deliveryId);
  assert.equal('customer_phone' in offers.payload.offers[0], false);
  assert.equal('shop_phone' in offers.payload.offers[0], false);
  const earlyReveal = await api(`/api/delivery/courses/${deliveryId}/contacts/customer/reveal`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(earlyReveal.response.status, 404);

  const accepted = await api(`/api/delivery/courses/${deliveryId}/accept`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(accepted.response.status, 200);
  const acceptedTimeline = await api<{ events: { next_status: string; actor_type: string; actor_name: string }[] }>(
    `/api/delivery/courses/${deliveryId}/events`,
    {},
    driverCookie,
  );
  assert.equal(acceptedTimeline.response.status, 200);
  assert.deepEqual(acceptedTimeline.payload.events.map((event) => event.next_status), ['requested', 'accepted']);
  assert.equal(acceptedTimeline.payload.events[1].actor_type, 'driver');
  assert.equal(acceptedTimeline.payload.events[1].actor_name, 'Livreur E2E');
  const released = await api(`/api/delivery/courses/${deliveryId}/release`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(released.response.status, 200, JSON.stringify(released.payload));
  const releasedTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    `/api/shops/1/deliveries/${deliveryId}/events`,
    {},
    merchantCookie,
  );
  assert.equal(releasedTimeline.response.status, 200);
  assert.deepEqual(releasedTimeline.payload.events.map((event) => event.next_status), ['requested', 'accepted', 'requested']);
  assert.deepEqual(releasedTimeline.payload.events.map((event) => event.actor_type), ['merchant', 'driver', 'driver']);
  assert.equal((await api(`/api/delivery/courses/${deliveryId}/release`, { method: 'POST' }, driverCookie)).response.status, 404);
  assert.equal((await api(`/api/delivery/courses/${deliveryId}/accept`, { method: 'POST' }, driverCookie)).response.status, 200);
  const overlappingCourse = await api(`/api/delivery/courses/${secondDeliveryId}/accept`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(overlappingCourse.response.status, 409);
  for (const role of ['merchant', 'customer']) {
    const reveal = await api<{ role: string; phone: string }>(`/api/delivery/courses/${deliveryId}/contacts/${role}/reveal`, {
      method: 'POST',
    }, driverCookie);
    assert.equal(reveal.response.status, 200);
    assert.equal(reveal.payload.role, role);
    assert.match(reveal.payload.phone, /^\+225\d{10}$/);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const reveal = await api(`/api/delivery/courses/${deliveryId}/contacts/merchant/reveal`, {
      method: 'POST',
    }, driverCookie);
    assert.equal(reveal.response.status, 200);
  }
  const rateLimitedReveal = await api(`/api/delivery/courses/${deliveryId}/contacts/merchant/reveal`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(rateLimitedReveal.response.status, 429);

  for (const status of ['to_pickup', 'picked_up']) {
    const update = await api(`/api/delivery/courses/${deliveryId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }, driverCookie);
    assert.equal(update.response.status, 200);
    assert.equal((update.payload as { status: string }).status, status);
  }
  const prematureDelivery = await api<{ code: string }>(`/api/delivery/courses/${deliveryId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'delivered' }),
  }, driverCookie);
  assert.equal(prematureDelivery.response.status, 409);
  assert.equal(prematureDelivery.payload.code, 'delivery_proof_required');
  const unsupportedProof = await api(`/api/delivery/courses/${deliveryId}/proof`, {
    method: 'PUT',
    body: JSON.stringify({ image_base64: PROOF_BASE64, content_type: 'text/plain' }),
  }, driverCookie);
  assert.equal(unsupportedProof.response.status, 400);
  const mismatchedProof = await api(`/api/delivery/courses/${deliveryId}/proof`, {
    method: 'PUT',
    body: JSON.stringify({ image_base64: PROOF_BASE64, content_type: 'image/jpeg' }),
  }, driverCookie);
  assert.equal(mismatchedProof.response.status, 400);
  const savedProof = await api<{ proof: { sha256: string; byte_size: number; content_type: string } }>(
    `/api/delivery/courses/${deliveryId}/proof`,
    {
      method: 'PUT',
      body: JSON.stringify({ image_base64: PROOF_BASE64, content_type: 'image/png' }),
    },
    driverCookie,
  );
  assert.equal(savedProof.response.status, 200);
  assert.equal(savedProof.payload.proof.sha256, PROOF_SHA256);
  assert.equal(savedProof.payload.proof.byte_size, Buffer.from(PROOF_BASE64, 'base64').length);
  assert.equal(savedProof.payload.proof.content_type, 'image/png');
  const driverProof = await api<{ proof: { data_url: string; sha256: string } }>(
    `/api/delivery/courses/${deliveryId}/proof`,
    {},
    driverCookie,
  );
  assert.equal(driverProof.response.status, 200);
  assert.equal(driverProof.payload.proof.sha256, PROOF_SHA256);
  assert.ok(driverProof.payload.proof.data_url.startsWith('data:image/png;base64,'));
  const merchantProof = await api<{ proof: { sha256: string } }>(
    `/api/shops/1/deliveries/${deliveryId}/proof`,
    {},
    merchantCookie,
  );
  assert.equal(merchantProof.response.status, 200);
  assert.equal(merchantProof.payload.proof.sha256, PROOF_SHA256);
  const delivered = await api(`/api/delivery/courses/${deliveryId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'delivered' }),
  }, driverCookie);
  assert.equal(delivered.response.status, 200);
  assert.equal((delivered.payload as { status: string }).status, 'delivered');
  const deliveredTimeline = await api<{ events: { next_status: string }[] }>(
    `/api/shops/1/deliveries/${deliveryId}/events`,
    {},
    merchantCookie,
  );
  assert.equal(deliveredTimeline.response.status, 200);
  assert.deepEqual(
    deliveredTimeline.payload.events.map((event) => event.next_status),
    ['requested', 'accepted', 'requested', 'accepted', 'to_pickup', 'picked_up', 'delivered'],
  );
  const replaceAfterDelivery = await api(`/api/delivery/courses/${deliveryId}/proof`, {
    method: 'PUT',
    body: JSON.stringify({ image_base64: PROOF_BASE64, content_type: 'image/png' }),
  }, driverCookie);
  assert.equal(replaceAfterDelivery.response.status, 409);
  const afterDeliveryReveal = await api(`/api/delivery/courses/${deliveryId}/contacts/customer/reveal`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(afterDeliveryReveal.response.status, 403);

  const auditDb = new Database(TEST_DB_PATH);
  try {
    const auditCount = auditDb.prepare(
      'SELECT COUNT(*) AS count FROM contact_audits WHERE delivery_id = ?',
    ).get(deliveryId) as { count: number };
    assert.equal(auditCount.count, 5);
  } finally {
    auditDb.close();
  }

  assert.equal((await api(`/api/delivery/courses/${secondDeliveryId}/accept`, { method: 'POST' }, driverCookie)).response.status, 200);
  const adminCourses = await api<{ courses: { id: number; status: string; driver_name: string | null }[] }>(
    '/api/admin/delivery/courses?status=all',
    {},
    admin,
  );
  assert.equal(adminCourses.response.status, 200);
  assert.deepEqual(
    adminCourses.payload.courses.map((course) => course.id).sort((left, right) => left - right),
    [deliveryId, secondDeliveryId].sort((left, right) => left - right),
  );

  const adminRelease = await api(`/api/admin/delivery/courses/${secondDeliveryId}/release`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Réaffectation de test' }),
  }, admin);
  assert.equal(adminRelease.response.status, 200);
  const afterAdminReleaseTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    '/api/customers/orders/101/delivery/events',
    {},
    customerCookie,
  );
  assert.equal(afterAdminReleaseTimeline.response.status, 200);
  assert.deepEqual(afterAdminReleaseTimeline.payload.events.map((event) => event.next_status), ['requested', 'accepted', 'requested']);
  assert.equal(afterAdminReleaseTimeline.payload.events[2].actor_type, 'admin');
  assert.equal((await api(`/api/admin/delivery/courses/${secondDeliveryId}/release`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Sans livreur' }),
  }, admin)).response.status, 409);
  assert.equal((await api(`/api/delivery/courses/${secondDeliveryId}/accept`, { method: 'POST' }, driverCookie)).response.status, 200);
  const secondProofUpload = await api(`/api/delivery/courses/${secondDeliveryId}/proof`, {
    method: 'PUT',
    body: JSON.stringify({ image_base64: PROOF_BASE64, content_type: 'image/png', captured_at: '2026-10-28T10:00:00.000Z' }),
  }, driverCookie);
  assert.equal(secondProofUpload.response.status, 200);
  assert.equal(
    (secondProofUpload.payload as { proof: { captured_at: string } }).proof.captured_at,
    '2026-10-28T10:00:00.000Z',
  );
  const customerProof = await api<{ proof: { data_url: string; sha256: string } }>(
    '/api/customers/orders/101/delivery/proof',
    {},
    customerCookie,
  );
  assert.equal(customerProof.response.status, 200);
  assert.equal(customerProof.payload.proof.sha256, PROOF_SHA256);
  assert.ok(customerProof.payload.proof.data_url.startsWith('data:image/png;base64,'));
  const refreshedHistory = await api<{ orders: { delivery: { status: string; proof_available: boolean } }[] }>(
    '/api/auth/customer-orders',
    {},
    customerCookie,
  );
  assert.equal(refreshedHistory.response.status, 200);
  assert.equal(refreshedHistory.payload.orders[0].delivery.status, 'accepted');
  assert.equal(refreshedHistory.payload.orders[0].delivery.proof_available, true);
  const customerSecondTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    '/api/customers/orders/101/delivery/events',
    {},
    customerCookie,
  );
  assert.equal(customerSecondTimeline.response.status, 200);
  assert.deepEqual(customerSecondTimeline.payload.events.map((event) => event.next_status), ['requested', 'accepted', 'requested', 'accepted']);
  assert.deepEqual(customerSecondTimeline.payload.events.map((event) => event.actor_type), ['merchant', 'driver', 'admin', 'driver']);
  assert.equal((await api(`/api/shops/1/deliveries/${secondDeliveryId}/cancel`, { method: 'POST' }, merchantCookie)).response.status, 200);
  const afterCancellationReveal = await api(`/api/delivery/courses/${secondDeliveryId}/contacts/customer/reveal`, {
    method: 'POST',
  }, driverCookie);
  assert.equal(afterCancellationReveal.response.status, 403);
  const reRequested = await api<{ delivery: { id: number; status: string; ticket_number: string } }>(
    '/api/shops/1/orders/101/delivery',
    {
      method: 'POST',
      body: JSON.stringify({ destination_zone_id: bingervilleId }),
    },
    merchantCookie,
  );
  assert.equal(reRequested.response.status, 201);
  assert.equal(reRequested.payload.delivery.id, secondDeliveryId);
  assert.equal(reRequested.payload.delivery.status, 'requested');
  assert.match(reRequested.payload.delivery.ticket_number, /^LIV-\d{6}-\d{6}$/);
  const reRequestedList = await api<{ deliveries: { id: number; proof_available?: boolean }[] }>(
    '/api/shops/1/deliveries',
    {},
    merchantCookie,
  );
  assert.equal(reRequestedList.response.status, 200);
  assert.equal(
    reRequestedList.payload.deliveries.find((delivery) => delivery.id === secondDeliveryId)?.proof_available,
    false,
  );
  assert.equal((await api('/api/customers/orders/101/delivery/proof', {}, customerCookie)).response.status, 404);
  assert.equal((await api(`/api/shops/1/deliveries/${secondDeliveryId}/cancel`, { method: 'POST' }, merchantCookie)).response.status, 200);
  const cancelOrder = await api(`/api/shops/1/orders/101/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  }, merchantCookie);
  assert.equal(cancelOrder.response.status, 200);
  const afterOrderCancellationPreview = await api('/api/shops/1/orders/101/contacts/customer', {}, merchantCookie);
  assert.equal(afterOrderCancellationPreview.response.status, 403);
  const afterCustomerOrderCancellationPreview = await api('/api/customers/orders/101/contacts/merchant', {}, customerCookie);
  assert.equal(afterCustomerOrderCancellationPreview.response.status, 403);
  const afterOrderCancellationReveal = await api('/api/shops/1/orders/101/contacts/customer', {
    method: 'POST',
  }, merchantCookie);
  assert.equal(afterOrderCancellationReveal.response.status, 403);
  const afterCustomerOrderCancellationReveal = await api('/api/customers/orders/101/contacts/merchant', {
    method: 'POST',
  }, customerCookie);
  assert.equal(afterCustomerOrderCancellationReveal.response.status, 403);

  const orderAuditDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const auditRows = orderAuditDb.prepare(`SELECT actor_type, actor_id, contact_role, COUNT(*) AS count
      FROM order_contact_audits WHERE order_id = ? GROUP BY actor_type, actor_id, contact_role`)
      .all(101) as { actor_type: string; actor_id: number; contact_role: string; count: number }[];
    assert.deepEqual(auditRows.map((row) => [row.actor_type, row.contact_role, row.count]).sort(), [
      ['customer', 'merchant', 5],
      ['merchant', 'customer', 1],
    ]);
  } finally {
    orderAuditDb.close();
  }

  const adminCoursesDb = new Database(TEST_DB_PATH);
  try {
    for (const orderId of [102, 103]) {
      adminCoursesDb.prepare(`INSERT INTO orders (
        id, shop_id, customer_name, customer_phone, delivery_location, total_amount,
        created_at, status, items
      ) SELECT ?, shop_id, customer_name, customer_phone, delivery_location, total_amount,
        ?, 'confirmed', items FROM orders WHERE id = 1`).run(orderId, new Date().toISOString());
    }
  } finally {
    adminCoursesDb.close();
  }

  const adminCancelledRequest = await api<{ delivery: { id: number } }>('/api/shops/1/orders/102/delivery', {
    method: 'POST',
    body: JSON.stringify({ destination_zone_id: bingervilleId }),
  }, merchantCookie);
  assert.equal(adminCancelledRequest.response.status, 201);
  const adminCancelledId = adminCancelledRequest.payload.delivery.id;
  assert.equal((await api(`/api/admin/delivery/courses/${adminCancelledId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'x' }),
  }, admin)).response.status, 400);
  const adminCancellation = await api(`/api/admin/delivery/courses/${adminCancelledId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Adresse erronée confirmée' }),
  }, admin);
  assert.equal(adminCancellation.response.status, 200);
  const adminCancellationTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    `/api/shops/1/deliveries/${adminCancelledId}/events`,
    {},
    merchantCookie,
  );
  assert.equal(adminCancellationTimeline.response.status, 200);
  assert.deepEqual(adminCancellationTimeline.payload.events.map((event) => event.next_status), ['requested', 'cancelled']);
  assert.equal(adminCancellationTimeline.payload.events[1].actor_type, 'admin');
  assert.equal((await api(`/api/admin/delivery/courses/${adminCancelledId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Déjà annulée' }),
  }, admin)).response.status, 409);

  const expiryRequest = await api<{ delivery: { id: number } }>('/api/shops/1/orders/103/delivery', {
    method: 'POST',
    body: JSON.stringify({ destination_zone_id: bingervilleId }),
  }, merchantCookie);
  assert.equal(expiryRequest.response.status, 201);
  const expiryId = expiryRequest.payload.delivery.id;
  const expiryDb = new Database(TEST_DB_PATH);
  try {
    expiryDb.prepare('UPDATE delivery_orders SET created_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), expiryId);
  } finally {
    expiryDb.close();
  }
  const expiry = await api<{ cancelled: number; ttl_minutes: number }>(
    '/api/admin/delivery/maintenance/expire-courses',
    { method: 'POST', body: JSON.stringify({ ttl_minutes: 120 }) },
    admin,
  );
  assert.equal(expiry.response.status, 200);
  assert.equal(expiry.payload.cancelled, 1);
  assert.equal(expiry.payload.ttl_minutes, 120);
  const expiredTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    `/api/shops/1/deliveries/${expiryId}/events`,
    {},
    merchantCookie,
  );
  assert.equal(expiredTimeline.response.status, 200);
  assert.deepEqual(expiredTimeline.payload.events.map((event) => event.next_status), ['requested', 'cancelled']);
  assert.equal(expiredTimeline.payload.events[1].actor_type, 'admin');

  const checkoutOptions = await api<{
    available: boolean;
    origin_zone: string | null;
    zones: { id: number; label: string; amount: number }[];
  }>('/api/shops/1/delivery-options');
  assert.equal(checkoutOptions.response.status, 200);
  assert.equal(checkoutOptions.payload.available, true);
  assert.equal(checkoutOptions.payload.origin_zone, 'Cocody');
  assert.deepEqual(checkoutOptions.payload.zones, [{ id: bingervilleId, label: 'Bingerville', amount: 2000 }]);
  assert.equal((await api('/api/shops/999999/delivery-options')).response.status, 404);

  const openShopDb = new Database(TEST_DB_PATH);
  try {
    openShopDb.prepare('UPDATE shops SET opening_hours = NULL, is_open = 1 WHERE id = 1').run();
  } finally {
    openShopDb.close();
  }

  const checkoutOrder = await api<{
    order: { id: number; total_amount: number; delivery_fee: number };
    delivery: { id: number; ticket_number: string; quoted_amount: number; status: string };
  }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client Livraison',
      customer_phone: '+2250788990170',
      delivery_location: 'Bingerville centre',
      payment_method_preference: 'cash',
      age_confirmed: true,
      delivery_zone_id: bingervilleId,
      items: [{ product_id: 1, quantity: 1 }],
    }),
  });
  assert.equal(checkoutOrder.response.status, 200, JSON.stringify(checkoutOrder.payload));
  assert.equal(checkoutOrder.payload.order.total_amount, 14500);
  assert.equal(checkoutOrder.payload.order.delivery_fee, 2000);
  assert.equal(checkoutOrder.payload.delivery.status, 'requested');
  assert.equal(checkoutOrder.payload.delivery.quoted_amount, 2000);
  assert.match(checkoutOrder.payload.delivery.ticket_number, /^LIV-\d{6}-\d{6}$/);
  const checkoutOrderId = checkoutOrder.payload.order.id;
  const checkoutTimeline = await api<{ events: { next_status: string; actor_type: string }[] }>(
    `/api/shops/1/deliveries/${checkoutOrder.payload.delivery.id}/events`,
    {},
    merchantCookie,
  );
  assert.equal(checkoutTimeline.response.status, 200);
  assert.deepEqual(checkoutTimeline.payload.events.map((event) => event.next_status), ['requested']);
  assert.equal(checkoutTimeline.payload.events[0].actor_type, 'admin');

  const merchantOrdersWithFee = await api<{ id: number; delivery_fee: number }[]>(
    '/api/shops/1/orders',
    {},
    merchantCookie,
  );
  assert.equal(merchantOrdersWithFee.response.status, 200);
  assert.equal(merchantOrdersWithFee.payload.find((order) => order.id === checkoutOrderId)?.delivery_fee, 2000);

  const countDb = new Database(TEST_DB_PATH);
  let orderCountBefore: number;
  try {
    orderCountBefore = Number((countDb.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count);
  } finally {
    countDb.close();
  }
  const unavailableZone = await api('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client Zone Inconnue',
      customer_phone: '+2250788990171',
      delivery_location: 'Palmeraie centre',
      age_confirmed: true,
      delivery_zone_id: palmeraieId,
      items: [{ product_id: 1, quantity: 1 }],
    }),
  });
  assert.equal(unavailableZone.response.status, 409);
  const afterRejectedDb = new Database(TEST_DB_PATH);
  try {
    const orderCountAfter = Number((afterRejectedDb.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count);
    assert.equal(orderCountAfter, orderCountBefore);
  } finally {
    afterRejectedDb.close();
  }

  const noDeliveryOrder = await api<{ order: { delivery_fee: number }; delivery: null }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client Sans Livraison',
      customer_phone: '+2250788990172',
      delivery_location: 'Cocody Angré',
      age_confirmed: true,
      items: [{ product_id: 1, quantity: 1 }],
    }),
  });
  assert.equal(noDeliveryOrder.response.status, 200, JSON.stringify(noDeliveryOrder.payload));
  assert.equal(noDeliveryOrder.payload.order.delivery_fee, 0);
  assert.equal(noDeliveryOrder.payload.delivery, null);

  const cancelledCheckout = await api(`/api/shops/1/orders/${checkoutOrderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  }, merchantCookie);
  assert.equal(cancelledCheckout.response.status, 200);
  const cancelledCheckoutDb = new Database(TEST_DB_PATH);
  try {
    const orderRow = cancelledCheckoutDb.prepare('SELECT delivery_fee, status FROM orders WHERE id = ?')
      .get(checkoutOrderId) as { delivery_fee: number; status: string };
    assert.equal(orderRow.delivery_fee, 0);
    assert.equal(orderRow.status, 'cancelled');
    const deliveryRow = cancelledCheckoutDb.prepare('SELECT status FROM delivery_orders WHERE id = ?')
      .get(checkoutOrder.payload.delivery.id) as { status: string };
    assert.equal(deliveryRow.status, 'cancelled');
  } finally {
    cancelledCheckoutDb.close();
  }

  // This wrong-shop request invalidates the merchant session, so it must stay last.
  const wrongShopContact = await api('/api/shops/2/orders/101/contacts/customer', {}, merchantCookie);
  assert.equal(wrongShopContact.response.status, 401);
});
