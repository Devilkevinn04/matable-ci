import test from 'node:test';
import assert from 'node:assert/strict';
import { readMerchantLoginOutcome } from '../src/utils/merchantLoginResponse';

test('a 202 MFA challenge asks for the emailed code instead of opening a session', () => {
  const outcome = readMerchantLoginOutcome(true, {
    success: false,
    mfa_required: true,
    challenge_id: 'c0ffee00c0ffee00c0ffee00c0ffee00',
    expires_at: '2026-11-25T12:10:00.000Z',
  });

  assert.deepEqual(outcome, { type: 'mfa', challengeId: 'c0ffee00c0ffee00c0ffee00c0ffee00' });
});

test('an email setup response keeps the recovery form available', () => {
  const outcome = readMerchantLoginOutcome(false, {
    email_setup_required: true,
    error: 'Vérifiez ou remplacez l’adresse e-mail du compte avant de vous connecter.',
  });

  assert.equal(outcome.type, 'email_setup');
  if (outcome.type === 'email_setup') {
    assert.match(outcome.message, /adresse e-mail/);
  }
});

test('a successful login returns the shop and malformed responses fail cleanly', () => {
  const shop = { id: 7, name: 'Boutique Test' };
  assert.deepEqual(readMerchantLoginOutcome(true, { success: true, shop }), { type: 'session', shop });

  const missingShop = readMerchantLoginOutcome(true, { success: true });
  assert.equal(missingShop.type, 'error');
  if (missingShop.type === 'error') assert.match(missingShop.message, /session commerçant/);
});

test('authentication errors keep the server message', () => {
  const outcome = readMerchantLoginOutcome(false, { error: 'Code PIN incorrect à 6 chiffres.' });
  assert.deepEqual(outcome, { type: 'error', message: 'Code PIN incorrect à 6 chiffres.' });
});
