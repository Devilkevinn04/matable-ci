import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getResendEmailConfig,
  sendAmbassadorAccessEmail,
  sendAmbassadorApplicationEmail,
  sendAmbassadorProgramEmail,
  sendCustomerPasswordResetEmail,
  sendCustomerOrderReceiptEmail,
  sendCustomerWelcomeEmail,
  sendMerchantPinResetEmail,
  sendMerchantSubscriptionReceiptEmail,
  sendMerchantSubscriptionReminderEmail,
  sendMerchantWelcomeEmail,
  sendTransactionalEmail,
} from '../server/services/email.ts';

test('Resend config requires both API key and sender address', () => {
  assert.equal(getResendEmailConfig({}), null);
  assert.deepEqual(getResendEmailConfig({ RESEND_API_KEY: 'key', RESEND_FROM_EMAIL: 'MaTable <welcome@matable-ci.com>' }), {
    apiKey: 'key',
    from: 'MaTable <welcome@matable-ci.com>',
  });
});

test('transactional email posts the payload to the Resend API', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

  try {
    let requestedUrl = '';
    let requestedHeaders: Headers | undefined;
    let requestBody: any;

    const result = await sendTransactionalEmail({
      to: 'merchant@example.com',
      subject: 'Bienvenue chez MaTable',
      html: '<p>Bonjour</p>',
      text: 'Bonjour',
      replyTo: 'support@matable-ci.com',
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
    assert.equal(requestBody.reply_to, 'support@matable-ci.com');
    assert.equal(requestBody.from, 'MaTable <welcome@matable-ci.com>');
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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
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

test('transactional emails share the MaTable branded layout', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

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
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_brand_123' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.match(requestBody.html, /^<!doctype html>/i);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com\/brand-kit\/icon-192\.png/);
    assert.match(requestBody.html, /#087F62/);
    assert.match(requestBody.html, /Vos commerces, ici\./);
    assert.match(requestBody.html, /Montant réglé/);
    assert.match(requestBody.html, /12\s?000/);
    assert.match(requestBody.html, /https:\/\/matable-ci\.com/);
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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
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
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
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

test('customer order receipt includes server totals and explains the pending response window', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';
  let requestBody: any;
  try {
    const result = await sendCustomerOrderReceiptEmail({
      customerName: '<script>Client</script>',
      customerEmail: 'customer@example.com',
      orderId: 42,
      shopName: '<b>Chez Awa</b>',
      shopWhatsAppNumber: '+2250708091011',
      createdAt: '2026-10-10T12:00:00.000Z',
      items: [{
        product_title: '<img src=x onerror=alert(1)>',
        quantity: 2,
        unit_price: 1250,
        selected_size: 'Grand',
        selected_modifiers: ['Piment doux'],
      }],
      deliveryLocation: '<i>Cocody</i>',
      deliverySlot: 'Ce soir',
      paymentMethod: 'cash',
      totalAmount: 2500,
      deliveryFee: 2000,
      appUrl: 'https://matable-ci.com',
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_order_receipt_42' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'customer@example.com');
    assert.match(requestBody.subject, /commande #42/);
    assert.match(requestBody.html, /&lt;script&gt;Client&lt;\/script&gt;/);
    assert.match(requestBody.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(requestBody.html, /&lt;i&gt;Cocody&lt;\/i&gt;/);
    assert.match(requestBody.html, /https:\/\/wa\.me\/2250708091011/);
    assert.match(requestBody.html, /2\s?500 FCFA/);
    assert.match(requestBody.html, /2\s?000 FCFA/);
    assert.match(requestBody.text, /Total à régler : 4\s?500 FCFA/);
    assert.match(requestBody.text, /ne confirme pas un paiement/i);
    assert.match(requestBody.text, /sans réponse sous 2 heures/i);
    assert.doesNotMatch(requestBody.html, /<script>|<img src=x|<i>Cocody/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('ambassador access email contains a single-use link and escapes the recipient name', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

  try {
    let requestBody: any;
    const result = await sendAmbassadorAccessEmail({
      name: '<img src=x onerror=alert(1)> Awa',
      email: 'ambassador@example.com',
      inviteUrl: 'https://matable-ci.com/ambassadeur/activer?token=secure-token',
      recovery: true,
    }, async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_ambassador_123' }), { status: 200 });
    });

    assert.equal(result.sent, true);
    assert.equal(requestBody.to[0], 'ambassador@example.com');
    assert.match(requestBody.subject, /récupération/i);
    assert.match(requestBody.text, /secure-token/);
    assert.match(requestBody.text, /expire dans 7 jours/);
    assert.match(requestBody.html, /&lt;img src=x onerror=alert\(1\)&gt; Awa/);
    assert.doesNotMatch(requestBody.html, /<img[^>]*src=x/i);
    assert.match(requestBody.html, /Réinitialiser mon accès/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('ambassador application emails confirm receipt and report decisions with escaped names', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

  try {
    const sentPayloads: any[] = [];
    const send = async (input: { status: 'received' | 'rejected' }) => sendAmbassadorApplicationEmail({
      name: '<script>Awa</script>',
      email: 'applicant@example.com',
      status: input.status,
      appUrl: 'https://matable-ci.com',
    }, async (_url, init) => {
      sentPayloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: `email_${input.status}` }), { status: 200 });
    });

    assert.equal((await send({ status: 'received' })).sent, true);
    assert.equal((await send({ status: 'rejected' })).sent, true);
    assert.equal(sentPayloads.length, 2);
    assert.match(sentPayloads[0].subject, /reçu/i);
    assert.match(sentPayloads[0].text, /Aucun compte ni code/);
    assert.match(sentPayloads[0].html, /&lt;script&gt;Awa&lt;\/script&gt;/);
    assert.match(sentPayloads[1].subject, /mise à jour/i);
    assert.match(sentPayloads[1].text, /ne pouvons pas donner suite/i);
    assert.doesNotMatch(sentPayloads[1].html, /<script>/);
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});

test('ambassador program emails cover commission and withdrawal updates with escaped details', async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-key';
  process.env.RESEND_FROM_EMAIL = 'MaTable <welcome@matable-ci.com>';

  try {
    const sentPayloads: any[] = [];
    const send = async (input: {
      event: 'commission_approved' | 'commission_rejected' | 'commission_paid' | 'commission_cancelled'
        | 'commission_refund_review' | 'withdrawal_requested' | 'withdrawal_approved' | 'withdrawal_rejected'
        | 'withdrawal_cancelled' | 'withdrawal_paid';
      reason?: string;
      reference?: string;
    }) => sendAmbassadorProgramEmail({
      name: '<script>Kevin</script>',
      email: 'ambassador@example.com',
      amount: 1600,
      shopName: '<Boutique & amie>',
      appUrl: 'https://matable-ci.com',
      ...input,
    }, async (_url, init) => {
      sentPayloads.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: `email_${input.event}` }), { status: 200 });
    });

    assert.equal((await send({ event: 'commission_approved' })).sent, true);
    assert.equal((await send({ event: 'commission_rejected', reason: '<motif>' })).sent, true);
    assert.equal((await send({ event: 'commission_paid', reference: '<ref>' })).sent, true);
    assert.equal((await send({ event: 'commission_cancelled' })).sent, true);
    assert.equal((await send({ event: 'commission_refund_review' })).sent, true);
    assert.equal((await send({ event: 'withdrawal_requested' })).sent, true);
    assert.equal((await send({ event: 'withdrawal_approved' })).sent, true);
    assert.equal((await send({ event: 'withdrawal_rejected', reason: '<motif>' })).sent, true);
    assert.equal((await send({ event: 'withdrawal_cancelled', reason: '<motif>' })).sent, true);
    assert.equal((await send({ event: 'withdrawal_paid', reference: '<ref>' })).sent, true);
    assert.equal(sentPayloads.length, 10);
    assert.match(sentPayloads[0].subject, /commission.*validée/i);
    assert.match(sentPayloads[0].text, /1\s?600 FCFA/);
    assert.doesNotMatch(sentPayloads[1].html, /&lt;motif&gt;/);
    assert.match(sentPayloads[2].html, /&lt;ref&gt;/);
    assert.match(sentPayloads[3].text, /remboursement/i);
    assert.match(sentPayloads[4].text, /examine la situation/i);
    assert.match(sentPayloads[5].subject, /demande de retrait.*reçue/i);
    assert.match(sentPayloads[6].text, /ne confirme pas encore le paiement/i);
    assert.match(sentPayloads[7].text, /de nouveau disponible/i);
    assert.match(sentPayloads[7].html, /&lt;motif&gt;/);
    assert.match(sentPayloads[8].html, /&lt;motif&gt;/);
    assert.match(sentPayloads[9].html, /Référence : &lt;ref&gt;/);
    for (const [index, payload] of sentPayloads.entries()) {
      assert.equal(payload.to[0], 'ambassador@example.com');
      assert.match(payload.html, /&lt;script&gt;Kevin&lt;\/script&gt;/);
      if (index < 5) assert.match(payload.html, /&lt;Boutique &amp; amie&gt;/);
      assert.doesNotMatch(payload.html, /<script>|<Boutique/);
      assert.match(payload.html, /https:\/\/matable-ci\.com\/ambassadeur/);
    }
  } finally {
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousApiKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL; else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});
