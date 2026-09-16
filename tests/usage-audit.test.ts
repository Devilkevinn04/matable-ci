import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppClickToChatUrl, sendWhatsAppCloudText } from '../whatsapp';

test('builds a valid WhatsApp click-to-chat fallback for customer and merchant journeys', () => {
  const customerLink = buildWhatsAppClickToChatUrl('+2250708091011', 'Bonjour, je souhaite commander.');
  const merchantLink = buildWhatsAppClickToChatUrl('0504030201', 'Mon accès boutique a bien été renouvelé.');

  assert.ok(customerLink.startsWith('https://wa.me/2250708091011?text='));
  assert.ok(merchantLink.startsWith('https://wa.me/2250504030201?text='));
  assert.match(customerLink, /Bonjour%2C%20je%20souhaite%20commander\./i);
  assert.match(merchantLink, /Mon%20acc%C3%A8s%20boutique%20a%20bien%20%C3%A9t%C3%A9%20renouvel%C3%A9\./i);
});

test('keeps WhatsApp activation resilient when Cloud is not configured', async () => {
  const result = await sendWhatsAppCloudText('+2250708091011', 'Commande validée, merci.');

  assert.equal(result.sent, false);
  assert.ok(result.fallbackUrl);
  assert.match(result.fallbackUrl || '', /^https:\/\/wa\.me\//);
  assert.ok((result.reason || '').length > 0);
});

test('falls back gracefully when WhatsApp Cloud fetch times out', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new TypeError('fetch failed');
  };

  try {
    process.env.WHATSAPP_CLOUD_ENABLED = 'true';
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_CLOUD_ACCESS_TOKEN = 'token-123';

    const result = await sendWhatsAppCloudText('+2250708091011', 'Commande validée, merci.');

    assert.equal(result.sent, false);
    assert.ok(result.fallbackUrl);
    assert.match(result.fallbackUrl || '', /^https:\/\/wa\.me\//);
    assert.match(result.reason || '', /lien de secours|connexion à WhatsApp Cloud|fallback/i);
  } finally {
    global.fetch = originalFetch;
    delete process.env.WHATSAPP_CLOUD_ENABLED;
    delete process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
  }
});
