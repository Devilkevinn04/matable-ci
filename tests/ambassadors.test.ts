import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBASSADOR_REFERRAL_DURATION_MS, calculateAmbassadorCommission, getAmbassadorToken, isCommissionPayableForMonth, normalizeAmbassadorCode, validAmbassadorReferral } from '../src/utils/ambassadors.ts';

test('ambassador referrals expire after 90 days and reject invalid codes and dates', () => {
  const now = 2 * AMBASSADOR_REFERRAL_DURATION_MS;
  assert.equal(normalizeAmbassadorCode(' kevin01 '), 'KEVIN01');
  assert.equal(normalizeAmbassadorCode('bad code'), null);
  assert.deepEqual(validAmbassadorReferral({ code: 'kevin01', capturedAt: now - 1 }, now), { code: 'KEVIN01', capturedAt: now - 1 });
  assert.equal(validAmbassadorReferral({ code: 'KEVIN01', capturedAt: now - AMBASSADOR_REFERRAL_DURATION_MS }, now), null);
  assert.equal(validAmbassadorReferral({ code: 'KEVIN01', capturedAt: now + 1 }, now), null);
});

test('ambassador link attribution is retained when audience analytics are refused', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const values = new Map<string, string>([['matable_cookie_preferences', JSON.stringify({ essential: true, analytics: false })]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let captures = 0;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, location: { search: '' } },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      captures += 1;
      return new Response(JSON.stringify({
        token: 'a'.repeat(64),
        expires_at: new Date(Date.now() + AMBASSADOR_REFERRAL_DURATION_MS).toISOString(),
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    },
  });

  try {
    const token = await getAmbassadorToken('KEVIN01');
    assert.equal(token, 'a'.repeat(64));
    assert.equal(captures, 1);
    assert.equal(await getAmbassadorToken('AUTRE01'), token);
    assert.equal(captures, 1);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});

test('commissions represent 20% of one monthly price for either payment term', () => {
  for (const [monthly, expected] of [[3000, 600], [5000, 1000], [8000, 1600]]) {
    assert.equal(calculateAmbassadorCommission(monthly, 'monthly'), expected);
    assert.equal(calculateAmbassadorCommission(monthly * 10, 'annual'), expected);
  }
  assert.throws(() => calculateAmbassadorCommission(-1, 'monthly'));
});

test('monthly payout preparation includes unpaid approved commissions through the selected month only', () => {
  const commission = { status: 'approved', payment_status: 'paid', approved_at: '2026-10-31T23:59:59.000Z' };
  assert.equal(isCommissionPayableForMonth(commission, '2026-10'), true);
  assert.equal(isCommissionPayableForMonth(commission, '2026-11'), true);
  assert.equal(isCommissionPayableForMonth(commission, '2026-09'), false);
  assert.equal(isCommissionPayableForMonth({ ...commission, status: 'paid' }, '2026-10'), false);
  assert.equal(isCommissionPayableForMonth({ ...commission, payment_status: 'refunded' }, '2026-10'), false);
  assert.equal(isCommissionPayableForMonth({ ...commission, approved_at: 'invalid' }, '2026-10'), false);
  assert.equal(isCommissionPayableForMonth(commission, '2026-13'), false);
});