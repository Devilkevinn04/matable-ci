import type { ShopRecord } from '../types.ts';

export interface WhatsAppSubscriptionReminderConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  graphApiVersion: string;
  language: string;
}

export function getWhatsAppSubscriptionReminderConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppSubscriptionReminderConfig | null {
  const accessToken = String(env.WHATSAPP_CLOUD_API_TOKEN || '').trim();
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const templateName = String(env.WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE || '').trim();
  const graphApiVersion = String(env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  if (!accessToken || !phoneNumberId || !templateName || !graphApiVersion) return null;
  return {
    accessToken,
    phoneNumberId,
    templateName,
    graphApiVersion,
    language: String(env.WHATSAPP_TEMPLATE_LANGUAGE || 'fr').trim(),
  };
}

export async function sendWhatsAppSubscriptionReminder(
  shop: Pick<ShopRecord, 'name' | 'whatsapp_number'>,
  expiresAt: string,
  config: WhatsAppSubscriptionReminderConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; error?: string }> {
  const recipient = shop.whatsapp_number.replace(/\D/g, '');
  if (!recipient) return { sent: false, error: 'invalid_recipient' };

  const expirationDate = new Intl.DateTimeFormat('fr-CI', {
    dateStyle: 'long',
    timeZone: 'Africa/Abidjan',
  }).format(new Date(expiresAt));

  try {
    const response = await fetchImplementation(
      `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.language },
            components: [{
              type: 'body',
              parameters: [
                { type: 'text', text: shop.name },
                { type: 'text', text: expirationDate },
              ],
            }],
          },
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    return response.ok ? { sent: true } : { sent: false, error: `http_${response.status}` };
  } catch {
    return { sent: false, error: 'network_error' };
  }
}