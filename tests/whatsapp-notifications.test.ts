import test from 'node:test';
import assert from 'node:assert/strict';
import { getWhatsAppSubscriptionReminderConfig, sendWhatsAppSubscriptionReminder } from '../server/services/whatsappNotifications.ts';

test('WhatsApp subscription reminders require all server credentials', () => {
  assert.equal(getWhatsAppSubscriptionReminderConfig({}), null);
  assert.deepEqual(getWhatsAppSubscriptionReminderConfig({
    WHATSAPP_CLOUD_API_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE: 'subscription_expiry',
    WHATSAPP_GRAPH_API_VERSION: 'v23.0',
    WHATSAPP_TEMPLATE_LANGUAGE: 'fr',
  }), {
    accessToken: 'token',
    phoneNumberId: 'phone-id',
    templateName: 'subscription_expiry',
    graphApiVersion: 'v23.0',
    language: 'fr',
  });
});

test('subscription reminder sends the approved template with shop and expiry placeholders', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const result = await sendWhatsAppSubscriptionReminder({
    name: 'Aya Chic',
    whatsapp_number: '+225 07 08 09 10 11',
  }, '2026-10-03T12:00:00.000Z', {
    accessToken: 'private-token',
    phoneNumberId: 'phone-id',
    templateName: 'subscription_expiry',
    graphApiVersion: 'v23.0',
    language: 'fr',
  }, async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response('{}', { status: 200 });
  });

  assert.deepEqual(result, { sent: true });
  assert.equal(requestedUrl, 'https://graph.facebook.com/v23.0/phone-id/messages');
  assert.equal(new Headers(requestedInit?.headers).get('authorization'), 'Bearer private-token');
  const requestBody = JSON.parse(String(requestedInit?.body));
  assert.equal(requestBody.to, '2250708091011');
  assert.equal(requestBody.template.name, 'subscription_expiry');
  assert.deepEqual(requestBody.template.components[0].parameters.map((parameter: { text: string }) => parameter.text), ['Aya Chic', '3 octobre 2026']);
});

test('failed WhatsApp reminder requests do not report a send', async () => {
  const result = await sendWhatsAppSubscriptionReminder({ name: 'Aya Chic', whatsapp_number: '+2250708091011' }, '2026-10-03T12:00:00.000Z', {
    accessToken: 'private-token',
    phoneNumberId: 'phone-id',
    templateName: 'subscription_expiry',
    graphApiVersion: 'v23.0',
    language: 'fr',
  }, async () => new Response('{}', { status: 500 }));
  assert.deepEqual(result, { sent: false, error: 'http_500' });
});