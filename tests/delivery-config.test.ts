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
import { normalizeDeliveryConfiguration } from '../server/routes/deliveryAdmin.ts';

const TEST_DB_PATH = path.join(tmpdir(), `matable-delivery-config-${Date.now()}.db`);
const ADMIN_KEY = 'delivery-config-test-super-admin-key';
const VERIFICATION_KEY = 'delivery-config-test-verification-key';
const EVENT_SECRET = 'delivery-config-test-signing-secret-32';
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
  throw new Error('Delivery configuration test server did not become ready in time.');
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
      DELIVERY_OPERATIONS_ENABLED: 'false',
      DELIVERY_TEST_MODE: 'false',
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

test('delivery API normalizes PostgreSQL BIGSERIAL identifiers for the client', () => {
  const configuration = normalizeDeliveryConfiguration([
    { id: '17', label: 'Cocody', is_active: 1, created_at: '2026-10-27T00:00:00.000Z', updated_at: '2026-10-27T00:00:00.000Z' },
  ], [
    {
      id: '29',
      origin_zone_id: '17',
      destination_zone_id: '18',
      origin_label: 'Cocody',
      destination_label: 'Abobo',
      amount: 2000,
      is_active: 1,
      created_at: '2026-10-27T00:00:00.000Z',
      updated_at: '2026-10-27T00:00:00.000Z',
    },
  ]);
  assert.equal(configuration.zones[0].id, 17);
  assert.equal(configuration.tariffs[0].id, 29);
  assert.equal(configuration.tariffs[0].origin_zone_id, 17);
  assert.equal(configuration.tariffs[0].destination_zone_id, 18);
  assert.equal(configuration.tariffs[0].is_active, true);
});

test('delivery zones and directed tariffs are super-admin managed and remain unconfigured by default', async () => {
  const superAdmin = await adminCookie('super_admin', ADMIN_KEY);
  const verificationAdmin = await adminCookie('verification_admin', VERIFICATION_KEY);

  const unauthorized = await api('/api/admin/delivery/configuration');
  assert.equal(unauthorized.response.status, 401);

  const forbidden = await api('/api/admin/delivery/configuration', {
    headers: { Cookie: verificationAdmin },
  });
  assert.equal(forbidden.response.status, 403);

  const initial = await api<{ zones: unknown[]; tariffs: unknown[] }>('/api/admin/delivery/configuration', {
    headers: { Cookie: superAdmin },
  });
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.payload, { zones: [], tariffs: [] });

  const badZone = await api('/api/admin/delivery/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ label: 'x' }),
  });
  assert.equal(badZone.response.status, 400);

  const cocody = await api<{ zones: { id: number; label: string; is_active: boolean }[]; tariffs: unknown[] }>('/api/admin/delivery/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ label: 'Cocody' }),
  });
  assert.equal(cocody.response.status, 201);
  const cocodyZone = cocody.payload.zones[0];
  assert.equal(cocodyZone.label, 'Cocody');
  assert.equal(cocodyZone.is_active, true);

  const duplicate = await api('/api/admin/delivery/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ label: ' cocody ' }),
  });
  assert.equal(duplicate.response.status, 409);

  const abobo = await api<{ zones: { id: number; label: string }[] }>('/api/admin/delivery/zones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ label: 'Abobo' }),
  });
  assert.equal(abobo.response.status, 201);
  const aboboZone = abobo.payload.zones.find((zone) => zone.label === 'Abobo');
  assert.ok(aboboZone);

  const invalidAmount = await api('/api/admin/delivery/tariffs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ origin_zone_id: cocodyZone.id, destination_zone_id: aboboZone.id, amount: 0 }),
  });
  assert.equal(invalidAmount.response.status, 400);

  const saved = await api<{ tariffs: { id: number; origin_zone_id: number; destination_zone_id: number; amount: number; is_active: boolean }[] }>('/api/admin/delivery/tariffs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ origin_zone_id: cocodyZone.id, destination_zone_id: aboboZone.id, amount: 1800 }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.payload.tariffs.length, 1);
  assert.equal(saved.payload.tariffs[0].amount, 1800);
  assert.equal(saved.payload.tariffs[0].is_active, true);

  const updated = await api<{ tariffs: { id: number; amount: number }[] }>('/api/admin/delivery/tariffs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ origin_zone_id: cocodyZone.id, destination_zone_id: aboboZone.id, amount: 2000 }),
  });
  assert.equal(updated.payload.tariffs.length, 1);
  assert.equal(updated.payload.tariffs[0].id, saved.payload.tariffs[0].id);
  assert.equal(updated.payload.tariffs[0].amount, 2000);

  const reverseDirection = await api<{ tariffs: { id: number; origin_zone_id: number; destination_zone_id: number; is_active: boolean }[] }>('/api/admin/delivery/tariffs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ origin_zone_id: aboboZone.id, destination_zone_id: cocodyZone.id, amount: 2400 }),
  });
  assert.equal(reverseDirection.payload.tariffs.length, 2);
  assert.ok(reverseDirection.payload.tariffs.some((tariff) =>
    tariff.origin_zone_id === aboboZone.id && tariff.destination_zone_id === cocodyZone.id));

  const reverseTariff = reverseDirection.payload.tariffs.find((tariff) => tariff.origin_zone_id === aboboZone.id);
  assert.ok(reverseTariff);
  const disabledTariff = await api<{ tariffs: { id: number; is_active: boolean }[] }>(`/api/admin/delivery/tariffs/${reverseTariff.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(disabledTariff.response.status, 200);
  assert.equal(disabledTariff.payload.tariffs.find((tariff) => tariff.id === reverseTariff.id)?.is_active, false);

  const reactivatedTariff = await api<{ tariffs: { id: number; is_active: boolean }[] }>(`/api/admin/delivery/tariffs/${reverseTariff.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ is_active: true }),
  });
  assert.equal(reactivatedTariff.response.status, 200);
  assert.equal(reactivatedTariff.payload.tariffs.find((tariff) => tariff.id === reverseTariff.id)?.is_active, true);

  const deactivated = await api<{ zones: { id: number; is_active: boolean }[] }>('/api/admin/delivery/zones/' + aboboZone.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(deactivated.response.status, 200);
  assert.equal(deactivated.payload.zones.find((zone) => zone.id === aboboZone.id)?.is_active, false);

  const cannotReactivate = await api('/api/admin/delivery/tariffs/' + reverseTariff.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: superAdmin },
    body: JSON.stringify({ is_active: true }),
  });
  assert.equal(cannotReactivate.response.status, 409);
});

test('delivery operations stay off by default and expose no payable course', async () => {
  const zones = await api('/api/delivery/zones');
  assert.equal(zones.response.status, 404);

  const options = await api<{ available: boolean; origin_zone: string | null; zones: unknown[] }>('/api/shops/1/delivery-options');
  assert.equal(options.response.status, 200);
  assert.equal(options.payload.available, false);
  assert.equal(options.payload.origin_zone, null);
  assert.deepEqual(options.payload.zones, []);

  const courierPage = await fetch(`${baseUrl}/livreur`, { headers: { Accept: 'text/html' } });
  assert.equal(courierPage.status, 200);
  assert.match(await courierPage.text(), /noindex/);
});
