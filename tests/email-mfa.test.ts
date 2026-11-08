import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('email MFA applies rollout rules and consumes expiring, single-use codes', async () => {
  const keys = [
    'NODE_ENV',
    'MATABLE_DB_PATH',
    'AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT',
    'AUTH_EMAIL_MFA_PEPPER',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'APP_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-email-mfa-'));
  const originalFetch = globalThis.fetch;
  let rejectEmailDelivery = false;
  process.env.NODE_ENV = 'development';
  process.env.MATABLE_DB_PATH = path.join(directory, 'mfa.db');
  process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT = '2026-03-01T00:00:00.000Z';
  process.env.AUTH_EMAIL_MFA_PEPPER = 'test-email-mfa-pepper-that-is-over-32-characters';
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM_EMAIL = 'noreply@matable-ci.com';
  process.env.APP_URL = 'https://matable-ci.com';

  let emailText = '';
  globalThis.fetch = async (_input, init) => {
    if (rejectEmailDelivery) return new Response(JSON.stringify({ message: 'provider_unavailable' }), { status: 503 });
    const requestBody = JSON.parse(String(init?.body || '{}')) as { text?: string };
    emailText = requestBody.text || '';
    return new Response(JSON.stringify({ id: 'email-mfa-test' }), { status: 200 });
  };

  let database: typeof import('../db.ts') | undefined;
  try {
    database = await import('../db.ts');
    await database.initializeDatabase();
    const { isEmailMfaRequired, startEmailMfaChallenge, verifyEmailMfaChallenge } = await import('../server/services/emailMfa.ts');

    const rollout = Date.parse(process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT);
    assert.equal(isEmailMfaRequired('2026-02-28T23:59:59.999Z', rollout + 1), false);
    assert.equal(isEmailMfaRequired('2026-03-01T00:00:00.000Z', rollout + 1), true);
    assert.equal(isEmailMfaRequired('2026-02-28T23:59:59.999Z', rollout + 30 * 24 * 60 * 60 * 1000), true);

    const challenge = await startEmailMfaChallenge({
      subject: 'customer',
      subjectId: 'mfa-test-customer',
      email: 'customer@example.ci',
      appUrl: 'https://matable-ci.com',
    });
    assert.ok('challengeId' in challenge);
    if (!('challengeId' in challenge)) return;
    const code = emailText.match(/(\d{8})/)?.[1];
    assert.ok(code);
    assert.equal(await verifyEmailMfaChallenge({ challengeId: challenge.challengeId, code: '00000000', subject: 'customer' }), 'invalid');
    assert.deepEqual(await verifyEmailMfaChallenge({ challengeId: challenge.challengeId, code: code || '', subject: 'customer' }), {
      subjectId: 'mfa-test-customer',
      email: 'customer@example.ci',
    });
    assert.equal(await verifyEmailMfaChallenge({ challengeId: challenge.challengeId, code: code || '', subject: 'customer' }), 'invalid');

    const expiring = await startEmailMfaChallenge({
      subject: 'customer',
      subjectId: 'mfa-test-expiring',
      email: 'customer@example.ci',
    });
    assert.ok('challengeId' in expiring);
    if (!('challengeId' in expiring)) return;
    await database.dbRun('UPDATE auth_email_challenges SET expires_at = ? WHERE challenge_id = ?', [Date.now() - 1, expiring.challengeId]);
    assert.equal(await verifyEmailMfaChallenge({ challengeId: expiring.challengeId, code: '00000000', subject: 'customer' }), 'expired');

    const locked = await startEmailMfaChallenge({
      subject: 'customer',
      subjectId: 'mfa-test-locked',
      email: 'customer@example.ci',
    });
    assert.ok('challengeId' in locked);
    if (!('challengeId' in locked)) return;
    const wrongCode = code === '00000000' ? '00000001' : '00000000';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      assert.equal(await verifyEmailMfaChallenge({ challengeId: locked.challengeId, code: wrongCode, subject: 'customer' }), 'invalid');
    }
    assert.equal(await verifyEmailMfaChallenge({ challengeId: locked.challengeId, code: wrongCode, subject: 'customer' }), 'locked');

    rejectEmailDelivery = true;
    const undelivered = await startEmailMfaChallenge({
      subject: 'customer',
      subjectId: 'mfa-test-undelivered',
      email: 'customer@example.ci',
    });
    assert.deepEqual(undelivered, { error: 'provider_unavailable' });
    assert.equal(await database.dbGet('SELECT challenge_id FROM auth_email_challenges WHERE subject_id = ?', ['mfa-test-undelivered']), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await database?.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
