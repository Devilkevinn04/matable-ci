import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResendEmailConfig,
  sendCustomerPasswordResetEmail,
  sendCustomerWelcomeEmail,
  sendMerchantPinResetEmail,
  sendMerchantSubscriptionReceiptEmail,
  sendMerchantSubscriptionReminderEmail,
  sendMerchantWelcomeEmail,
  sendTransactionalEmail,
} from '../server/services/email.ts';

test('Resend config requires both API key and sender address', () => {
  assert.equal(getResendEmailConfig({}), null);
  assert.deepEqual(getResendEmailConfig({ RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'MaTable.ci <welcome@matable.ci>' }), {
    apiKey: 'key',
    from: 'MaTable.ci <welcome@matable.ci>',
  });
});

test('transactional email posts the payload to the Resend API', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';

  try {
    let requestedUrl = '';
    let requestedHeaders: Headers | undefined;
    let requestBody: any;

    const result = await sendTransactionalEmail({
      to: 'merchant@example.com',
      subject: 'Bienvenue chez MaTable.ci',
      html: '<p>Bonjour</p>',
      text: 'Bonjour',
      replyTo: 'support@matable.ci',
    }, async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    assert.equal(result.sent, true);
    assert.equal(result.id, 'email_123');
    assert.equal(requestedUrl, 'https://api.resend.com/emails');
    assert.equal(requestedHeaders?.get('authorization'), 'Bearer resend-key');
    assert.deepEqual(requestBody.to, ['merchant@example.com']);
    assert.equal(requestBody.reply_to, 'support@matable.ci');
    assert.equal(requestBody.from, 'MaTable.ci <welcome@matable.ci>');
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('subscription receipt email contains confirmed payment details and escapes merchant input', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';
  delete process.env.NODE_ENV;

  try {
    let requestBody: any;
    const result = await sendMerchantSubscriptionReceiptEmail({
      shopName: '<script>Ma boutique</script>',
      ownerEmail: 'merchant@example.com',
      paymentId: 'payment-123',
      providerReference: 'KDV-123',
      tierLabel: 'Pro',
      term: 'annual',
      amount: 80000,
      currency: 'XOF',
      paidAt: '2026-10-10T12:00:00.000Z',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_receipt_123' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'merchant@example.com');
    assert.match(requestBody.subject, /payment-123/);
    assert.match(requestBody.text, /80\s?000 XOF/);
    assert.match(requestBody.text, /KDV-123/);
    assert.match(requestBody.html, /&lt;script&gt;Ma boutique&lt;\/script&gt;/);
    assert.doesNotMatch(requestBody.html, /<script>/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('transactional emails share the MaTable.ci branded layout', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';

  try {
    let requestBody: any;
    const result = await sendMerchantSubscriptionReceiptEmail({
      shopName: 'Chez Awa',
      ownerEmail: 'merchant@example.com',
      paymentId: 'payment-777',
      providerReference: 'KDV-777',
      tierLabel: 'Pro',
      term: 'monthly',
      amount: 12000,
      currency: 'XOF',
      paidAt: '2026-10-10T12:00:00.000Z',
      appUrl: 'https://matable.ci',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_brand_123' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.match(requestBody.html, /^<!doctype html>/i);
    assert.match(requestBody.html, /https:\/\/matable\.ci\/brand-kit\/icon-192\.png/);
    assert.match(requestBody.html, /#087F62/);
    assert.match(requestBody.html, /Vos commerces, ici\./);
    assert.match(requestBody.html, /Montant réglé/);
    assert.match(requestBody.html, /12\s?000/);
    assert.match(requestBody.html, /https:\/\/matable\.ci/);
    assert.doesNotMatch(requestBody.html, /<script/i);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('welcome email escapes the merchant shop name in its HTML body', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';

  try {
    let requestBody: any;
    const result = await sendMerchantWelcomeEmail({
      shopName: '<img src=x onerror=alert(1)> & Fils',
      ownerEmail: 'merchant@example.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_welcome_123' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'merchant@example.com');
    assert.match(requestBody.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Fils/);
    assert.doesNotMatch(requestBody.html, /<img[^>]*src=x/i);
    assert.equal((requestBody.html.match(/<img/gi) || []).length, 1);
    assert.match(requestBody.text, /<img src=x onerror=alert\(1\)> & Fils/);
    assert.match(requestBody.text, /\/app\b/);
    assert.doesNotMatch(requestBody.text, /\/connexion\b/);
    assert.match(requestBody.html, /href="[^"]*\/app"/);
    assert.doesNotMatch(requestBody.html, /\/connexion\b/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('customer welcome email escapes the name and links to the shop directory', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';
  let requestBody: any;
  try {
    const result = await sendCustomerWelcomeEmail({
      customerName: '<script>Client</script>',
      customerEmail: 'customer@example.com',
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_customer_welcome' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'customer@example.com');
    assert.match(requestBody.html, /&lt;script&gt;Client&lt;\/script&gt;/);
    assert.doesNotMatch(requestBody.html, /<script>/);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com\/boutiques/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('password reset email includes the one-time token link and escapes customer input', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';
  let requestBody: any;
  try {
    const result = await sendCustomerPasswordResetEmail({
      customerName: '<img src=x onerror=alert(1)>',
      customerEmail: 'customer@example.com',
      token: 'secure-token',
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_password_reset' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.match(requestBody.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(requestBody.html, /<img[^>]*src=x/i);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com\/reinitialiser-mot-de-passe\?token=secure-token/);
    assert.match(requestBody.text, /30 minutes/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('merchant PIN reset email links to the secure one-time flow', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';
  let requestBody: any;
  try {
    const result = await sendMerchantPinResetEmail({
      shopName: '<script>Boutique</script>',
      ownerEmail: 'merchant@example.com',
      token: 'secure-merchant-token',
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_merchant_pin_reset' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'merchant@example.com');
    assert.match(requestBody.html, /&lt;script&gt;Boutique&lt;\/script&gt;/);
    assert.doesNotMatch(requestBody.html, /<script>/);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com\/reinitialiser-pin-commercant\?token=secure-merchant-token/);
    assert.match(requestBody.text, /30 minutes/);
    assert.match(requestBody.text, /confirme l’accès à cette adresse e-mail/i);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('subscription reminder email includes the expiry and account link', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable.ci <welcome@matable.ci>';
  let requestBody: any;
  try {
    const result = await sendMerchantSubscriptionReminderEmail({
      shopName: '<b>Chez Awa</b>',
      ownerEmail: 'merchant@example.com',
      expiresAt: '2026-10-10T12:00:00.000Z',
      daysBefore: 3,
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_subscription_reminder' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'merchant@example.com');
    assert.match(requestBody.subject, /dans 3 jours/);
    assert.match(requestBody.html, /&lt;b&gt;Chez Awa&lt;\/b&gt;/);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com\/app/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});
