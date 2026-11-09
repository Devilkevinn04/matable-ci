import assert from 'node:assert/strict';
import test from 'node:test';
import { AMBASSADOR_REFERRAL_DURATION_MS, calculateAmbassadorCommission, clearAmbassadorReferral, getAmbassadorMonthlyStats, getAmbassadorToken, getStoredAmbassadorCode, isCommissionPayableForMonth, normalizeAmbassadorCode, validAmbassadorReferral } from '../src/utils/ambassadors.ts';

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
  let storageUnavailable = false;
  let responseStatus = 201;
  const storage = {
    getItem: (key: string) => {
      if (storageUnavailable) throw new Error('Storage unavailable');
      return values.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (storageUnavailable) throw new Error('Storage unavailable');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      if (storageUnavailable) throw new Error('Storage unavailable');
      values.delete(key);
    },
  };
  const events: Event[] = [];
  let captures = 0;
  let responseToken = 'a'.repeat(64);
  let responseExpiry = new Date(Date.now() + AMBASSADOR_REFERRAL_DURATION_MS).toISOString();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage, location: { search: '' }, dispatchEvent: (event: Event) => { events.push(event); return true; } },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      captures += 1;
      return new Response(JSON.stringify({
        token: responseToken,
        expires_at: responseExpiry,
      }), { status: responseStatus, headers: { 'Content-Type': 'application/json' } });
    },
  });

  try {
    const token = await getAmbassadorToken('KEVIN01');
    assert.equal(token, 'a'.repeat(64));
    assert.equal(getStoredAmbassadorCode(), 'KEVIN01');
    assert.equal(captures, 1);
    assert.equal(await getAmbassadorToken('AUTRE01'), token);
    assert.equal(captures, 1);
    clearAmbassadorReferral();
    assert.equal(getStoredAmbassadorCode(), null);
    assert.equal(await getAmbassadorToken(), null);
    assert.equal(captures, 1);
    assert.equal(events.at(-1)?.type, 'matable-ambassador-referral-updated');
    responseToken = 'not-a-token';
    assert.equal(await getAmbassadorToken('INVALID'), null);
    responseToken = 'b'.repeat(64);
    responseExpiry = 'invalid-date';
    assert.equal(await getAmbassadorToken('INVALID'), null);
    assert.equal(values.has('matable_ambassador_referral'), false);
    assert.equal(captures, 3);

    clearAmbassadorReferral();
    storageUnavailable = true;
    responseToken = 'c'.repeat(64);
    responseExpiry = new Date(Date.now() + AMBASSADOR_REFERRAL_DURATION_MS).toISOString();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: storage,
        location: { search: '?ref=KEVIN02' },
        dispatchEvent: (event: Event) => { events.push(event); return true; },
      },
    });
    assert.equal(await getAmbassadorToken(), responseToken);
    assert.equal(getStoredAmbassadorCode(), 'KEVIN02');
    assert.equal(await getAmbassadorToken(), responseToken);
    clearAmbassadorReferral();
    assert.equal(getStoredAmbassadorCode(), null);

    responseStatus = 503;
    assert.equal(await getAmbassadorToken('KEVIN03'), null);
    assert.equal(getStoredAmbassadorCode(), 'KEVIN03');
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

test('ambassador monthly statistics count attributed registrations and paid commissions for six months', () => {
  const stats = getAmbassadorMonthlyStats([
    { created_at: '2026-06-02T10:00:00.000Z' },
    { created_at: '2026-11-08T10:00:00.000Z' },
    { created_at: 'invalid-date' },
    { created_at: '2026-05-31T23:59:59.000Z' },
  ], [
    { paid_at: '2026-06-30T10:00:00.000Z', amount: 600 },
    { paid_at: '2026-11-01T10:00:00.000Z', amount: 1000 },
    { paid_at: '2026-11-02T10:00:00.000Z', amount: -50 },
    { paid_at: 'invalid-date', amount: 500 },
  ], new Date('2026-11-08T12:00:00.000Z'));

  assert.equal(stats.length, 6);
  assert.equal(stats[0].month, '2026-06');
  assert.equal(stats[0].registrations, 1);
  assert.equal(stats[0].paidAmount, 600);
  assert.equal(stats[5].month, '2026-11');
  assert.equal(stats[5].registrations, 1);
  assert.equal(stats[5].paidAmount, 1000);
  assert.equal(stats.reduce((sum, month) => sum + month.registrations, 0), 2);
});