import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  canonicalizeDiditPayload,
  createDiditVerificationSession,
  isMerchantKycEnabled,
  verifyDiditWebhookSignature,
} from '../didit.ts';

test('keeps merchant KYC asleep in production unless explicitly enabled', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousKycMode = process.env.MERCHANT_KYC_MODE;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.MERCHANT_KYC_MODE;
    assert.equal(isMerchantKycEnabled(), false);
    process.env.MERCHANT_KYC_MODE = 'disabled';
    assert.equal(isMerchantKycEnabled(), false);
    process.env.MERCHANT_KYC_MODE = 'didit';
    assert.equal(isMerchantKycEnabled(), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousKycMode === undefined) delete process.env.MERCHANT_KYC_MODE;
    else process.env.MERCHANT_KYC_MODE = previousKycMode;
  }
});

test('canonicalizes Didit webhook objects recursively while preserving arrays and Unicode', () => {
  assert.equal(canonicalizeDiditPayload({ z: 'Côte', a: { y: 2, b: 1 }, list: [2, 1] }), '{"a":{"b":1,"y":2},"list":[2,1],"z":"Côte"}');
});

test('verifies Didit HMAC signatures and rejects stale or changed payloads', () => {
  const payload = { event_id: 'evt-1', status: 'Approved', webhook_type: 'status.updated' };
  const timestamp = '1790000000';
  const secret = 'sandbox-webhook-secret';
  const signature = createHmac('sha256', secret).update(canonicalizeDiditPayload(payload)).digest('hex');

  assert.equal(verifyDiditWebhookSignature(payload, signature, timestamp, secret, Number(timestamp)), true);
  assert.equal(verifyDiditWebhookSignature({ ...payload, status: 'Declined' }, signature, timestamp, secret, Number(timestamp)), false);
  assert.equal(verifyDiditWebhookSignature(payload, signature, String(Number(timestamp) - 301), secret, Number(timestamp)), false);
  assert.equal(verifyDiditWebhookSignature(payload, signature, timestamp, secret, Number(timestamp)), true);
});

test('creates only Côte d’Ivoire ID or passport sessions and accepts Didit-hosted URLs', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ session_id: 'sandbox-session-1', url: 'https://verify.didit.me/session/sandbox-token' }), { status: 201 });
  };

  try {
    const session = await createDiditVerificationSession({
      shopId: 45,
      callbackUrl: 'https://matable.ci/api/merchant-verification/callback?shop_id=45',
      email: 'merchant@example.ci',
      configuration: { apiKey: 'sandbox-api-key', workflowId: 'sandbox-workflow', webhookSecret: 'sandbox-secret' },
    });
    assert.deepEqual(session, { sessionId: 'sandbox-session-1', url: 'https://verify.didit.me/session/sandbox-token' });
    assert.equal(requestBody?.vendor_data, 'shop:45');
    assert.deepEqual(requestBody?.expected_details, { id_country: 'CIV', expected_document_types: ['ID', 'P'] });
    assert.equal((requestBody?.contact_details as { send_notification_emails: boolean }).send_notification_emails, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects non-HTTPS callbacks and non-Didit hosted URLs', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ session_id: 'sandbox-session-1', url: 'https://attacker.example/session/token' }), { status: 201 });

  try {
    await assert.rejects(() => createDiditVerificationSession({
      shopId: 45,
      callbackUrl: 'http://matable.ci/callback',
      configuration: { apiKey: 'sandbox-api-key', workflowId: 'sandbox-workflow', webhookSecret: 'sandbox-secret' },
    }), /HTTPS/);
    await assert.rejects(() => createDiditVerificationSession({
      shopId: 45,
      callbackUrl: 'https://matable.ci/callback',
      configuration: { apiKey: 'sandbox-api-key', workflowId: 'sandbox-workflow', webhookSecret: 'sandbox-secret' },
    }), /session de vérification invalide/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});