import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { createMerchantVerificationRouter } from '../server/routes/merchantVerification.ts';
import {
  DIDIT_RESUME_AFTER_MS,
  canRestartDiditSession,
  describeDiditDeclineReasons,
  extractDiditDeclineReasons,
  mapDiditStatus,
  parseDiditDeclineReasons,
} from '../server/services/didit.ts';

type RouterOptions = Parameters<typeof createMerchantVerificationRouter>[0];

test('une session sans webhook peut être relancée après 30 minutes, pas avant', () => {
  const now = Date.parse('2026-10-30T12:00:00.000Z');
  const recent = { status: 'Not Started', createdAt: new Date(now - 10 * 60 * 1000).toISOString(), lastWebhookAt: null };
  const abandoned = { status: 'Not Started', createdAt: new Date(now - DIDIT_RESUME_AFTER_MS - 1000).toISOString(), lastWebhookAt: null };
  const withWebhook = { status: 'Not Started', createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), lastWebhookAt: '2026-10-30T11:00:00.000Z' };

  assert.equal(canRestartDiditSession(recent, now), false);
  assert.equal(canRestartDiditSession(abandoned, now), true);
  assert.equal(canRestartDiditSession(withWebhook, now), false);
  assert.equal(canRestartDiditSession({ status: 'Declined' }, now), true);
  assert.equal(canRestartDiditSession({ status: 'Approved' }, now), true);
});

test('Kyc Expired reste un statut à relancer et non une validation', () => {
  assert.equal(mapDiditStatus('Kyc Expired'), 'pending');
  assert.equal(mapDiditStatus('Expired'), 'pending');
  assert.equal(mapDiditStatus('Abandoned'), 'pending');
});

test('les raisons de refus ne conservent que les statuts et codes de risque', () => {
  const decision = {
    session_id: randomUUID(),
    status: 'Declined',
    id_verifications: [{
      node_id: 'feature_ocr_1',
      status: 'Declined',
      full_name: 'Awa Koné',
      document_number: 'CI-99887766',
      front_image: 'https://media.example/front.jpg',
      warnings: [
        { risk: 'IMAGE_TOO_BLURRY', short_description: 'Photo floue' },
        { risk: 'DOCUMENT_EXPIRED', short_description: 'Pièce expirée' },
        { risk: 'name: Awa Koné', short_description: 'texte libre ignoré' },
      ],
    }],
    liveness_checks: [{ status: 'Declined', warnings: [{ risk: 'LIVENESS_FAILED' }] }],
    face_matches: [{ status: 'Approved', warnings: [] }],
    ip_analyses: [{ status: 'Approved', warnings: [{ risk: 'VPN_DETECTED' }] }],
    contact_details: { email: 'awa@example.com', phone: '+2250102030405' },
  };
  const reasons = extractDiditDeclineReasons(decision);
  const serialized = JSON.stringify(reasons);

  assert.deepEqual(reasons, [
    { check: 'document', status: 'Declined', risks: ['IMAGE_TOO_BLURRY', 'DOCUMENT_EXPIRED'] },
    { check: 'liveness', status: 'Declined', risks: ['LIVENESS_FAILED'] },
    { check: 'ip', status: 'Approved', risks: ['VPN_DETECTED'] },
  ]);
  assert.equal(serialized.includes('Awa'), false);
  assert.equal(serialized.includes('CI-99887766'), false);
  assert.equal(serialized.includes('media.example'), false);
  assert.equal(serialized.includes('+225'), false);
  assert.equal(serialized.includes('awa@example.com'), false);
});

test('les conseils de refus sont en français et sans donnée personnelle', () => {
  const advice = describeDiditDeclineReasons([
    { check: 'document', status: 'Declined', risks: ['IMAGE_TOO_BLURRY'] },
    { check: 'face_match', status: 'Declined', risks: [] },
  ]);
  assert.ok(advice.length >= 2);
  assert.ok(advice.every((item) => /[àâçéèêëîïôûùüÿœ]/i.test(item) || /[a-z]/i.test(item)));
  assert.match(advice.join(' '), /floue|selfie/i);
});

test('les raisons stockées en base sont revalidées avant d’être renvoyées', () => {
  assert.deepEqual(parseDiditDeclineReasons('[{"check":"document","status":"Declined","risks":["IMAGE_TOO_BLURRY"]}]'), [
    { check: 'document', status: 'Declined', risks: ['IMAGE_TOO_BLURRY'] },
  ]);
  assert.deepEqual(parseDiditDeclineReasons('pas du json'), []);
  assert.deepEqual(parseDiditDeclineReasons(JSON.stringify([{ check: 'document', status: 'Declined', risks: ['nom: Awa'] }])), [
    { check: 'document', status: 'Declined', risks: [] },
  ]);
});

function buildRouterOptions(overrides: {
  latestSession?: { status: string; created_at: string; last_webhook_at: string | null };
  finishedCount?: number;
  onProviderCall?: () => void;
} = {}): RouterOptions {
  return {
    dbGet: (async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { count: overrides.finishedCount ?? 0 };
      if (sql.includes('didit_verification_sessions')) return overrides.latestSession;
      return { id: 41, merchant_verification_status: 'pending' };
    }) as RouterOptions['dbGet'],
    dbAll: async () => [],
    dbRun: async () => ({ changes: 1 }),
    dbTransaction: (async (operation: (transaction: {
      get: (sql: string) => Promise<unknown>;
      run: (sql: string) => Promise<{ changes: number }>;
    }) => Promise<unknown>) => operation({
      get: async (sql: string) => {
        if (sql.includes('merchant_verification_status')) return { merchant_verification_status: 'pending' };
        if (sql.includes('WHERE session_id = ?')) return undefined;
        return overrides.latestSession;
      },
      run: async () => ({ changes: 1 }),
    })) as RouterOptions['dbTransaction'],
    requireMerchantIdentityOwnShop: (_req, _res, next) => next(),
  };
}

async function withServer(options: RouterOptions, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api/shops', createMerchantVerificationRouter(options).merchantRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function configureDiditEnvironment() {
  const previous = {
    apiKey: process.env.DIDIT_API_KEY,
    workflowId: process.env.DIDIT_WORKFLOW_ID,
    appUrl: process.env.APP_URL,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.DIDIT_API_KEY = 'server-only-test-key';
  process.env.DIDIT_WORKFLOW_ID = randomUUID();
  process.env.APP_URL = 'https://matable.example';
  process.env.NODE_ENV = 'test';
  return () => {
    for (const [key, value] of Object.entries({
      DIDIT_API_KEY: previous.apiKey,
      DIDIT_WORKFLOW_ID: previous.workflowId,
      APP_URL: previous.appUrl,
      NODE_ENV: previous.nodeEnv,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('la route refuse une 4e session terminée sur 30 jours', async () => {
  const restore = configureDiditEnvironment();
  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://verification.didit.me/v3/session/') {
      providerCalls += 1;
      const sessionId = randomUUID();
      return new Response(JSON.stringify({ session_id: sessionId, status: 'Not Started', url: `https://verify.didit.me/session/${sessionId}` }), { status: 201 });
    }
    return originalFetch(input, init);
  };
  try {
    await withServer(buildRouterOptions({ finishedCount: 3 }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/shops/41/identity-verification/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
      const payload = await response.json();
      assert.equal(response.status, 429, JSON.stringify(payload));
      assert.match(payload.error, /assistance/i);
      assert.equal(providerCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test('une session abandonnée depuis plus de 30 minutes peut être relancée', async () => {
  const restore = configureDiditEnvironment();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) === 'https://verification.didit.me/v3/session/') {
      providerCalls += 1;
      const sessionId = randomUUID();
      return new Response(JSON.stringify({ session_id: sessionId, status: 'Not Started', url: `https://verify.didit.me/session/${sessionId}` }), { status: 201 });
    }
    return originalFetch(input, init);
  };
  try {
    const abandoned = {
      status: 'Not Started',
      created_at: new Date(Date.now() - DIDIT_RESUME_AFTER_MS - 60_000).toISOString(),
      last_webhook_at: null,
    };
    await withServer(buildRouterOptions({ latestSession: abandoned }), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/shops/41/identity-verification/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
      assert.equal(response.status, 201, await response.text());
      assert.equal(providerCalls, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});
