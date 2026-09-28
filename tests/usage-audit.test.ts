import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppClickToChatUrl } from '../whatsapp';

test('builds a valid WhatsApp click-to-chat fallback for customer and merchant journeys', () => {
  const customerLink = buildWhatsAppClickToChatUrl('+2250708091011', 'Bonjour, je souhaite commander.');
  const merchantLink = buildWhatsAppClickToChatUrl('0504030201', 'Mon accès boutique a bien été renouvelé.');

  assert.ok(customerLink.startsWith('https://wa.me/2250708091011?text='));
  assert.ok(merchantLink.startsWith('https://wa.me/2250504030201?text='));
  assert.match(customerLink, /Bonjour%2C%20je%20souhaite%20commander\./i);
  assert.match(merchantLink, /Mon%20acc%C3%A8s%20boutique%20a%20bien%20%C3%A9t%C3%A9%20renouvel%C3%A9\./i);
});
