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

const testDbPath = path.join(tmpdir(), `matable-no-delivery-${Date.now()}.db`);
const adminKey = 'delivery-removed-test-admin-key';
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
  throw new Error('Test server did not become ready in time.');
}

before(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ADMIN_ACCESS_KEY: adminKey,
      DELIVERY_OPERATIONS_ENABLED: 'true',
      DELIVERY_TEST_MODE: 'true',
      PORT: String(port),
      MATABLE_DB_PATH: testDbPath,
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
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${testDbPath}${suffix}`, { force: true })));
});

test('delivery APIs stay unavailable even when legacy enable flags are set', async () => {
  for (const route of [
    '/api/delivery/zones',
    '/api/shops/1/delivery-options',
    '/api/shops/1/deliveries',
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404, `${route} should not be mounted`);
  }
  const login = await fetch(`${baseUrl}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKey, role: 'super_admin' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const adminResponse = await fetch(`${baseUrl}/api/admin/delivery/configuration`, {
    headers: { Cookie: cookie },
  });
  assert.equal(adminResponse.status, 404);
});
