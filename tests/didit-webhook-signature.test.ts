import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { validateDiditWebhook } from '../server/services/didit.ts';

const SECRET = 'didit-webhook-signature-test-secret';
const PREVIOUS_SECRET = 'didit-webhook-previous-secret';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildEvent() {
  return {
    event_id: randomUUID(),
    session_id: randomUUID(),
    status: 'Approved',
    webhook_type: 'status.updated',
    timestamp: Math.floor(Date.now() / 1000),
  };
}

const signV2 = (event: unknown, secret = SECRET) => createHmac('sha256', secret).update(canonicalJson(event)).digest('hex');
const signRaw = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex');

test('Didit webhook accepts the current V2 signature', () => {
  const event = buildEvent();
  const body = Buffer.from(JSON.stringify(event));
  const result = validateDiditWebhook(body, String(event.timestamp), signV2(event), undefined, SECRET);
  assert.equal(result.ok, true);
});

test('Didit webhook accepts the previous V2 signature during a secret rotation', () => {
  const event = buildEvent();
  const body = Buffer.from(JSON.stringify(event));
  // Didit signe les en-têtes `-Previous` avec l’ancien secret : le serveur encore
  // configuré avec cet ancien secret doit accepter la livraison.
  const result = validateDiditWebhook(
    body,
    String(event.timestamp),
    signV2(event, 'new-secret-not-yet-deployed'),
    undefined,
    PREVIOUS_SECRET,
    Date.now(),
    { signatureV2: signV2(event, PREVIOUS_SECRET) },
  );
  assert.equal(result.ok, true);
});

test('Didit webhook accepts the previous raw-body signature during a secret rotation', () => {
  const event = buildEvent();
  const raw = JSON.stringify(event);
  const result = validateDiditWebhook(
    Buffer.from(raw),
    String(event.timestamp),
    undefined,
    signRaw(raw, 'new-secret-not-yet-deployed'),
    PREVIOUS_SECRET,
    Date.now(),
    { signature: signRaw(raw, PREVIOUS_SECRET) },
  );
  assert.equal(result.ok, true);
});

test('Didit webhook rejects invalid and expired signatures', () => {
  const event = buildEvent();
  const body = Buffer.from(JSON.stringify(event));
  const invalid = validateDiditWebhook(
    body,
    String(event.timestamp),
    'deadbeef',
    undefined,
    SECRET,
    Date.now(),
    { signatureV2: 'deadbeef', signature: 'deadbeef' },
  );
  assert.equal(invalid.ok, false);

  const expired = validateDiditWebhook(body, String(event.timestamp - 3600), signV2(event), undefined, SECRET);
  assert.equal(expired.ok, false);
});
