import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalizeDiditPayload } from '../didit.ts';

let appPort = 0;
let mockPort = 0;
let appProcess: ChildProcess | null = null;
let mockServer: ReturnType<typeof createServer> | null = null;
let cookieJar = '';
let callbackUrl = '';
let decisionStatus = 'In Review';
const sessionId = 'sandbox-merchant-session';
const webhookSecret = 'didit-webhook-test-secret';
const databasePath = path.join(process.cwd(), 'data', `merchant-verification-flow-${Date.now()}.db`);

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local test port.');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function updateCookieJar(headers: Headers) {
  const rawCookie = headers.get('set-cookie');
  if (!rawCookie) return;
  const nextCookies = new Map(cookieJar.split('; ').filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator), part.slice(separator + 1)];
  }));
  for (const cookie of rawCookie.split(/,(?=[^;,]+=[^;]+)/g)) {
    const pair = cookie.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) nextCookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  cookieJar = Array.from(nextCookies, ([name, value]) => `${name}=${value}`).join('; ');
}

async function appFetch(route: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookieJar) headers.set('Cookie', cookieJar);
  const response = await fetch(`http://127.0.0.1:${appPort}${route}`, { ...init, headers, redirect: 'manual' });
  updateCookieJar(response.headers);
  const text = await response.text();
  let body: any = text;
  if (text) {
    try { body = JSON.parse(text); } catch { /* Keep non-JSON callback responses as text. */ }
  }
  return { response, body };
}

async function waitForApp() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/api/health`);
      if (response.ok) return;
    } catch { /* Retry while the child server starts. */ }
    await delay(200);
  }
  throw new Error('KYC test server failed to start.');
}

before(async () => {
  cookieJar = '';
  appPort = await freePort();
  mockPort = await freePort();
  mockServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'POST' && request.url === '/v3/session/') {
      callbackUrl = body.callback;
      response.writeHead(201);
      response.end(JSON.stringify({ session_id: sessionId, url: 'https://verify.didit.me/session/sandbox-token' }));
      return;
    }
    if (request.method === 'GET' && request.url === `/v3/session/${sessionId}/decision/`) {
      response.writeHead(200);
      response.end(JSON.stringify({ session_id: sessionId, status: decisionStatus }));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise<void>((resolve, reject) => {
    mockServer!.once('error', reject);
    mockServer!.listen(mockPort, '127.0.0.1', () => resolve());
  });

  appProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MERCHANT_KYC_MODE: 'didit',
      DIDIT_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
      DIDIT_API_KEY: 'test-api-key',
      DIDIT_WORKFLOW_ID: '11111111-2222-4333-8444-555555555555',
      DIDIT_WEBHOOK_SECRET: webhookSecret,
      DIDIT_ENVIRONMENT: 'sandbox',
      PORT: String(appPort),
      APP_URL: `http://127.0.0.1:${appPort}`,
      MATABLE_DB_PATH: databasePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  appProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  appProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await waitForApp();
});

after(async () => {
  if (appProcess && !appProcess.killed) {
    appProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => appProcess?.once('exit', () => resolve()));
  }
  if (mockServer) await new Promise<void>((resolve, reject) => mockServer!.close((error) => error ? reject(error) : resolve()));
  await Promise.all([rm(databasePath, { force: true }), rm(`${databasePath}-wal`, { force: true }), rm(`${databasePath}-shm`, { force: true })]);
});

test('merchant onboarding stays limited until a valid Didit approval webhook', async () => {
  const phone = `+22507${String(Date.now()).slice(-8)}`;
  const registrationBody = {
    name: 'Atelier KYC Test',
    whatsapp_number: phone,
    pin_code: '639247',
    category: 'fashion',
    city: 'Abidjan',
    identity_verification_consent: true,
  };

  const missingConsent = await appFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...registrationBody, identity_verification_consent: false }),
  });
  assert.equal(missingConsent.response.status, 400);

  const registration = await appFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registrationBody),
  });
  assert.equal(registration.response.status, 201, JSON.stringify(registration.body));
  assert.equal(registration.body.shop.is_active, false);
  assert.equal(registration.body.shop.merchant_verification_status, 'pending');
  assert.equal(registration.body.verification_required, true);
  assert.equal(registration.body.owner_access_token, undefined);
  assert.match(String(registration.body.verification_url), /^https:\/\/verify\.didit\.me\//);

  const createdProduct = await appFetch(`/api/shops/${registration.body.shop.id}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit bloqué avant KYC', price: 1000, stock: 2 }),
  });
  assert.equal(createdProduct.response.status, 403);

  const callback = new URL(callbackUrl);
  const invalidCallback = await appFetch(`${callback.pathname}?shop_id=${callback.searchParams.get('shop_id')}&token=wrong-token&verificationSessionId=${sessionId}`);
  assert.equal(invalidCallback.response.status, 303);
  assert.match(String(invalidCallback.response.headers.get('location')), /merchant-verification=invalid/);

  const callbackToken = callback.searchParams.get('token');
  const providerCallback = await appFetch(`${callback.pathname}?shop_id=${callback.searchParams.get('shop_id')}&token=${callbackToken}&verificationSessionId=${sessionId}&status=Approved`);
  assert.equal(providerCallback.response.status, 303);
  assert.match(String(providerCallback.response.headers.get('location')), /merchant-verification=pending/);
  const callbackReplay = await appFetch(`${callback.pathname}?shop_id=${callback.searchParams.get('shop_id')}&token=${callbackToken}&verificationSessionId=${sessionId}`);
  assert.match(String(callbackReplay.response.headers.get('location')), /merchant-verification=invalid/);

  const timestamp = String(Math.floor(Date.now() / 1000));
  const event = {
    event_id: 'evt-merchant-approval-1',
    session_id: sessionId,
    status: 'Approved',
    webhook_type: 'status.updated',
    environment: 'sandbox',
    timestamp: Number(timestamp),
  };
  decisionStatus = 'Approved';
  const signature = createHmac('sha256', webhookSecret).update(canonicalizeDiditPayload(event)).digest('hex');
  const invalidWebhook = await appFetch('/api/webhooks/didit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': timestamp, 'X-Signature-V2': '00'.repeat(32) },
    body: JSON.stringify(event),
  });
  assert.equal(invalidWebhook.response.status, 401);

  const approvedWebhook = await appFetch('/api/webhooks/didit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': timestamp, 'X-Signature-V2': signature },
    body: JSON.stringify(event),
  });
  assert.equal(approvedWebhook.response.status, 204);

  const duplicateWebhook = await appFetch('/api/webhooks/didit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': timestamp, 'X-Signature-V2': signature },
    body: JSON.stringify(event),
  });
  assert.equal(duplicateWebhook.response.status, 204);

  const shopAfterApproval = await appFetch(`/api/shops/${registration.body.shop.id}`);
  assert.equal(shopAfterApproval.response.status, 200);
  assert.equal(shopAfterApproval.body.shop.is_active, true);
  assert.equal(shopAfterApproval.body.shop.merchant_verification_status, 'approved');

  const productAfterApproval = await appFetch(`/api/shops/${registration.body.shop.id}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit après KYC', price: 1000, stock: 2 }),
  });
  assert.equal(productAfterApproval.response.status, 200, JSON.stringify(productAfterApproval.body));

  const crossShopVerification = await appFetch('/api/shops/999999/merchant-verification/start', { method: 'POST' });
  assert.equal(crossShopVerification.response.status, 401);
});
