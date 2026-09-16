const DEFAULT_API_VERSION = 'v21.0';
const WHATSAPP_CLOUD_LOCKED = true;

interface WhatsAppCloudConfig {
  enabled: boolean;
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface WhatsAppSendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
  fallbackUrl?: string;
}

export interface WhatsAppTemplateParameter {
  type: 'text';
  text: string;
}

function normalizeWhatsAppRecipient(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^00/, '');
  if (/^225\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `225${digits}`;
  if (/^\d{8}$/.test(digits)) return `225${digits}`;
  return digits;
}

export function buildWhatsAppClickToChatUrl(to: string, body: string): string {
  const normalized = normalizeWhatsAppRecipient(to);
  const cleanBody = String(body || '').trim();
  return `https://wa.me/${normalized}?text=${encodeURIComponent(cleanBody)}`;
}

function getConfig(): WhatsAppCloudConfig {
  return {
    enabled: !WHATSAPP_CLOUD_LOCKED && process.env.WHATSAPP_CLOUD_ENABLED === 'true',
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION || DEFAULT_API_VERSION,
    phoneNumberId: process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || '',
  };
}

export async function sendWhatsAppCloudText(to: string, body: string): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const fallbackUrl = buildWhatsAppClickToChatUrl(to, body);

  if (!config.enabled) {
    return { sent: false, reason: 'WhatsApp Cloud API désactivée. Le lien de secours a été généré.', fallbackUrl };
  }
  if (!config.phoneNumberId || !config.accessToken) {
    return { sent: false, reason: 'Identifiants WhatsApp Cloud API manquants. Le lien de secours a été généré.', fallbackUrl };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeWhatsAppRecipient(to),
        type: 'text',
        text: { preview_url: false, body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('WhatsApp Cloud API error:', response.status, errorBody);
      return { sent: false, reason: `Erreur Cloud API (${response.status}). Le lien de secours a été généré.`, fallbackUrl };
    }

    const data = await response.json() as { messages?: { id?: string }[] };
    return { sent: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('WhatsApp Cloud API request failed; falling back to click-to-chat.', error);
    return { sent: false, reason: 'Échec de connexion à WhatsApp Cloud. Le lien de secours a été généré.', fallbackUrl };
  }
}

export async function sendWhatsAppCloudTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: WhatsAppTemplateParameter[],
): Promise<WhatsAppSendResult> {
  const config = getConfig();
  const fallbackUrl = buildWhatsAppClickToChatUrl(to, 'Votre message WhatsApp MaTable.ci est disponible.');

  if (!config.enabled) {
    return { sent: false, reason: 'WhatsApp Cloud API désactivée. Le lien de secours a été généré.', fallbackUrl };
  }
  if (!config.phoneNumberId || !config.accessToken) {
    return { sent: false, reason: 'Identifiants WhatsApp Cloud API manquants. Le lien de secours a été généré.', fallbackUrl };
  }
  if (!templateName || !languageCode) {
    return { sent: false, reason: 'Modèle WhatsApp Cloud non configuré. Le lien de secours a été généré.', fallbackUrl };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeWhatsAppRecipient(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [{ type: 'body', parameters: bodyParameters }],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('WhatsApp Cloud template error:', response.status, errorBody);
      return { sent: false, reason: `Erreur Cloud API (${response.status}). Le lien de secours a été généré.`, fallbackUrl };
    }

    const data = await response.json() as { messages?: { id?: string }[] };
    return { sent: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('WhatsApp Cloud template request failed; falling back to click-to-chat.', error);
    return { sent: false, reason: 'Échec de connexion à WhatsApp Cloud. Le lien de secours a été généré.', fallbackUrl };
  }
}

export function isWhatsAppCloudConfigured(): boolean {
  const config = getConfig();
  return config.enabled && Boolean(config.phoneNumberId && config.accessToken);
}
