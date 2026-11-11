import test from 'node:test';
import assert from 'node:assert/strict';
import { issueAgeVerificationToken, isAgeVerificationTokenValid } from '../server/services/ageVerification.ts';

test('age verification tokens are signed, shop-scoped, and expire', () => {
  const previousSecret = process.env.AGE_VERIFICATION_SECRET;
  process.env.AGE_VERIFICATION_SECRET = 'age-verification-test-secret-that-is-long-enough';
  const now = new Date(2026, 10, 11).getTime();

  try {
    const token = issueAgeVerificationToken('2000-01-01', 42, now);
    assert.ok(token);
    assert.equal(isAgeVerificationTokenValid(token, 42, now), true);
    assert.equal(isAgeVerificationTokenValid(token, 43, now), false);
    assert.equal(isAgeVerificationTokenValid(token, 42, now + 30 * 60 * 1000), false);
    assert.equal(isAgeVerificationTokenValid(`${token}x`, 42, now), false);
    assert.equal(issueAgeVerificationToken('2010-01-01', 42, now), null);
    assert.equal(issueAgeVerificationToken('2000-02-30', 42, now), null);
  } finally {
    if (previousSecret === undefined) delete process.env.AGE_VERIFICATION_SECRET;
    else process.env.AGE_VERIFICATION_SECRET = previousSecret;
  }
});
