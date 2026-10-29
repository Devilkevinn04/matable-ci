import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const TEST_DB_PATH = path.join(tmpdir(), `matable-delivery-operations-${Date.now()}.db`);
const ADMIN_KEY = 'delivery-operations-test-super-admin-key';
const VERIFICATION_KEY = 'delivery-operations-test-verification-key';
const EVENT_SECRET = 'delivery-operations-test-signing-secret';
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
  throw new Error('Delivery operations test server did not become ready in time.');
}

async function api<T = Record<string, unknown>>(pathName: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  return { response, payload: await response.json() as T };
}

async function adminCookie(role: 'super_admin' | 'verification_admin', key: string): Promise<string> {
  const { response } = await api('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, role }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
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
      NODE_ENV: 'test',
      DELIVERY_OPERATIONS_ENABLED: 'true',
      DELIVERY_TEST_MODE: 'false',
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

test('delivery operations can be enabled without exposing sandbox payments', async () => {
  const zones = await api<{ zones: unknown[] }>('/api/delivery/zones');
  assert.equal(zones.response.status, 200);
  assert.deepEqual(zones.payload.zones, []);

  const registration = await api<{ driver: { id: number; status: string } }>('/api/delivery/drivers/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Livreur Production', phone: '+2250700000042', pin: '482915' }),
  });
  assert.equal(registration.response.status, 201, JSON.stringify(registration.payload));
  assert.equal(registration.payload.driver.status, 'pending');

  const login = await api('/api/delivery/drivers/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250700000042', pin: '482915' }),
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const session = await api<{ sandbox_payments_enabled: boolean; proof_required: boolean }>(
    '/api/delivery/drivers/session',
    { headers: { Cookie: cookie } },
  );
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.sandbox_payments_enabled, false);
  assert.equal(session.payload.proof_required, true);

  const sandbox = await api('/api/delivery/drivers/subscription/sandbox', {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(sandbox.response.status, 404);

  const options = await api<{ available: boolean; zones: unknown[] }>('/api/shops/1/delivery-options');
  assert.equal(options.response.status, 200);
  assert.equal(options.payload.available, false);
  assert.deepEqual(options.payload.zones, []);

  const courierPage = await fetch(`${baseUrl}/livreur`, { headers: { Accept: 'text/html' } });
  assert.equal(courierPage.status, 200);
  assert.match(await courierPage.text(), /noindex/);
});

test('super admins can operate drivers and pickup zones without test mode', async () => {
  const superAdmin = await adminCookie('super_admin', ADMIN_KEY);
  const verificationAdmin = await adminCookie('verification_admin', VERIFICATION_KEY);

  const forbidden = await api('/api/admin/delivery/drivers', {
    headers: { Cookie: verificationAdmin },
  });
  assert.equal(forbidden.response.status, 403);

  const createdZone = await api<{ zones: { id: number; label: string; is_active: boolean }[] }>('/api/admin/delivery/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ label: 'Zone production' }),
  });
  assert.equal(createdZone.response.status, 201, JSON.stringify(createdZone.payload));
  const zone = createdZone.payload.zones.find((item) => item.label === 'Zone production');
  assert.ok(zone);

  const drivers = await api<{ drivers: { id: number; phone: string; status: string; zone_ids: number[] }[] }>('/api/admin/delivery/drivers', {
    headers: { Cookie: superAdmin },
  });
  assert.equal(drivers.response.status, 200);
  const driver = drivers.payload.drivers.find((item) => item.phone === '+2250700000042');
  assert.ok(driver);
  assert.equal(driver.status, 'pending');
  assert.deepEqual(driver.zone_ids, []);

  const activation = await api('/api/admin/delivery/drivers/' + driver.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ status: 'active', zone_ids: [zone.id] }),
  });
  assert.equal(activation.response.status, 200, JSON.stringify(activation.payload));

  const updated = await api<{ drivers: { id: number; status: string; zone_ids: number[] }[] }>('/api/admin/delivery/drivers', {
    headers: { Cookie: superAdmin },
  });
  assert.equal(updated.response.status, 200);
  const activeDriver = updated.payload.drivers.find((item) => item.id === driver.id);
  assert.equal(activeDriver?.status, 'active');
  assert.deepEqual(activeDriver?.zone_ids, [zone.id]);

  const login = await api('/api/delivery/drivers/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250700000042', pin: '482915' }),
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const session = await api<{ driver: { status: string }; zones: { id: number; label: string; is_active: boolean }[] }>(
    '/api/delivery/drivers/session',
    { headers: { Cookie: cookie } },
  );
  assert.equal(session.response.status, 200);
  assert.equal(session.payload.driver.status, 'active');
  assert.deepEqual(session.payload.zones, [{ id: zone.id, label: 'Zone production', is_active: false }]);

  const selected = await api<{ zones: { id: number; label: string; is_active: boolean }[] }>('/api/delivery/drivers/zones', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ zone_ids: [zone.id] }),
  });
  assert.equal(selected.response.status, 200, JSON.stringify(selected.payload));
  assert.deepEqual(selected.payload.zones, [{ id: zone.id, label: 'Zone production', is_active: true }]);

  const origins = await api<{ shops: unknown[] }>('/api/admin/delivery/shop-origins', {
    headers: { Cookie: superAdmin },
  });
  assert.equal(origins.response.status, 200);
});

