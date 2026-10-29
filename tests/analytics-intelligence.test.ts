import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_PORT = 43135;
const TEST_DB_PATH = path.join(tmpdir(), `matable-analytics-intelligence-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;

function cookiesFrom(response: Response): string {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return values
    .flatMap((value) => value.split(/,(?=[^;]+=[^;]+)/))
    .map((value) => value.split(';')[0]?.trim())
    .filter((value) => value && value.includes('='))
    .join('; ');
}

async function postJson(url: string, body: unknown, cookie = '') {
  return fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

before(async () => {
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ADMIN_ACCESS_KEY: 'analytics-admin-test-key',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: BASE_URL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.on('data', () => undefined);
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error('Le serveur de test analytics ne répond pas.');
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const exited = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await exited;
  }
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

test('batch analytics keeps consented aggregates, strips PII and deduplicates page views', async () => {
  const sessionId = 'analytics-session-0001';
  const response = await postJson('/api/analytics/events', {
    events: [
      {
        event_type: 'page_view',
        session_id: sessionId,
        path: '/',
        audience: 'public',
        device: 'mobile',
        locale: 'fr-CI',
        campaign: 'qr',
        metadata: { category: 'fashion', email: 'client@example.com', phone: '0700000000' },
      },
      {
        event_type: 'page_view',
        session_id: sessionId,
        path: '/',
        audience: 'public',
        device: 'mobile',
        locale: 'fr-CI',
        campaign: 'qr',
      },
      {
        event_type: 'login',
        session_id: sessionId,
        path: '/connexion',
        audience: 'customer',
        device: 'mobile',
        metadata: { method: 'email' },
      },
      {
        event_type: 'search',
        session_id: sessionId,
        path: '/boutiques',
        audience: 'public',
        entity_type: 'search',
        metadata: { query_length: 12, results: 4, surface: 'directory' },
      },
      {
        event_type: 'not_allowed',
        session_id: sessionId,
        path: '/',
      },
      {
        event_type: 'page_view',
        session_id: sessionId,
        path: '/api/secret',
      },
    ],
  });
  assert.equal(response.status, 204);

  const tooMany = await postJson('/api/analytics/events', {
    events: Array.from({ length: 26 }, (_, index) => ({
      event_type: 'page_view',
      session_id: sessionId,
      path: `/page-${index}`,
    })),
  });
  assert.equal(tooMany.status, 400);

  const database = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const rows = database.prepare(`
      SELECT event_type, path, audience, device, locale, metadata, campaign
      FROM analytics_events WHERE session_id = ?
      ORDER BY id ASC
    `).all(sessionId) as Array<{
      event_type: string; path: string; audience: string; device: string;
      locale: string | null; metadata: string | null; campaign: string | null;
    }>;
    assert.deepEqual(rows.map((row) => row.event_type), ['page_view', 'login', 'search']);
    const pageView = rows[0];
    assert.equal(pageView.path, '/');
    assert.equal(pageView.audience, 'public');
    assert.equal(pageView.device, 'mobile');
    assert.equal(pageView.locale, 'fr-ci');
    assert.equal(pageView.campaign, 'qr');
    assert.ok(pageView.metadata, 'Les métadonnées autorisées sont conservées.');
    assert.deepEqual(JSON.parse(pageView.metadata || '{}'), { category: 'fashion' });
    assert.equal(rows[2].audience, 'public');
  } finally {
    database.close();
  }
});

test('legacy analytics endpoints stay compatible and enrich the schema', async () => {
  const pageView = await postJson('/api/analytics/page-view', {
    session_id: 'legacy-session-0001',
    path: '/boutiques',
    campaign: 'qr',
  });
  assert.equal(pageView.status, 204);

  const database = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const row = database.prepare(`
      SELECT event_type, entity_type, audience, campaign FROM analytics_events
      WHERE session_id = ? ORDER BY id DESC LIMIT 1
    `).get('legacy-session-0001') as { event_type: string; entity_type: string; audience: string; campaign: string };
    assert.equal(row.event_type, 'page_view');
    assert.equal(row.entity_type, 'page');
    assert.equal(row.audience, 'public');
    assert.equal(row.campaign, 'qr');
  } finally {
    database.close();
  }
});

test('admin analytics expose audiences, top pages, logins, funnel, QR scans and co-viewed products', async () => {
  const login = await postJson('/api/auth/admin-login', { key: 'analytics-admin-test-key', role: 'super_admin' });
  assert.equal(login.status, 200);
  const cookie = cookiesFrom(login);
  assert.ok(cookie.includes('matable_admin_session'));

  const response = await fetch(`${BASE_URL}/api/admin/analytics?days=7`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const analytics = await response.json() as {
    audiences: Array<{ audience: string }>;
    top_pages: Array<{ path: string }>;
    logins: Array<{ audience: string }>;
    signups: unknown[];
    funnel: Array<{ step: string }>;
    qr_scans: { total: number; by_shop: unknown[] };
    top_products: unknown[];
    co_viewed_products: unknown[];
  };
  assert.ok(Array.isArray(analytics.audiences));
  assert.ok(analytics.top_pages.some((page) => page.path === '/'));
  assert.ok(analytics.logins.some((row) => row.audience === 'customer'));
  assert.deepEqual(analytics.funnel.map((step) => step.step), [
    'visite', 'produit_vu', 'panier', 'commande_commencee', 'commande_creee',
  ]);
  assert.equal(analytics.qr_scans.total, 2);
  assert.ok(Array.isArray(analytics.top_products));
  assert.ok(Array.isArray(analytics.co_viewed_products));
});

test('merchant analytics scope new sections to the shop', async () => {
  const registration = await postJson('/api/shops', {
    name: 'Atelier Analytics',
    whatsapp_number: '+2250700000011',
    pin: '482915',
    email: 'analytics-test@example.com',
    category: 'fashion',
    city: 'Abidjan',
    accepted_terms_privacy: true,
  });
  assert.equal(registration.status, 200);
  const registrationBody = await registration.json() as { shop: { id: number; slug: string } };
  const cookie = cookiesFrom(registration);
  assert.ok(cookie.includes('matable_session'));

  const shopId = registrationBody.shop.id;
  const sessionId = 'merchant-analytics-session-01';
  const batch = await fetch(`${BASE_URL}/api/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      events: [
        { event_type: 'page_view', session_id: sessionId, path: `/${registrationBody.shop.slug}`, shop_id: shopId, audience: 'customer', device: 'tablet', campaign: 'qr', locale: 'fr-ci' },
        { event_type: 'add_to_cart', session_id: sessionId, path: '/product/12', shop_id: shopId, audience: 'customer', device: 'tablet', entity_type: 'product', entity_id: 12, metadata: { cart_size: 1 } },
        { event_type: 'checkout_start', session_id: sessionId, path: `/${registrationBody.shop.slug}`, shop_id: shopId, audience: 'customer', device: 'tablet', metadata: { cart_size: 1, cart_value: 5000 } },
      ],
    }),
  });
  assert.equal(batch.status, 204);

  const response = await fetch(`${BASE_URL}/api/shops/${shopId}/analytics?days=7`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const analytics = await response.json() as {
    summary: { qr_scans: number; qr_visitors: number };
    audiences: Array<{ audience: string }>;
    top_pages: Array<{ path: string }>;
    devices: Array<{ device: string }>;
    funnel: Array<{ step: string; count: number }>;
    co_viewed_products: unknown[];
  };
  assert.equal(analytics.summary.qr_scans, 1);
  assert.equal(analytics.summary.qr_visitors, 1);
  assert.ok(analytics.audiences.some((row) => row.audience === 'customer'));
  assert.ok(analytics.top_pages.some((page) => page.path === `/${registrationBody.shop.slug}`));
  assert.ok(analytics.devices.some((row) => row.device === 'tablet'));
  assert.equal(analytics.funnel.find((step) => step.step === 'panier')?.count, 1);
  assert.ok(Array.isArray(analytics.co_viewed_products));
});
