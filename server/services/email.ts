import { escapeHtml } from './businessRules.ts';

export interface ResendEmailConfig {
  apiKey: string;
  from: string;
}

export interface SendTransactionalEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  from?: string;
}

const RECEIPT_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Africa/Abidjan',
});
const RECEIPT_AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR');

export function getResendEmailConfig(env: NodeJS.ProcessEnv = process.env): ResendEmailConfig | null {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.RESEND_FROM_EMAIL || env.EMAIL_FROM || '').trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendTransactionalEmail(
  options: SendTransactionalEmailOptions,
  fetchImplementation: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (env.NODE_ENV === 'test' && fetchImplementation === fetch) {
    return { sent: false, error: 'email_disabled_in_test' };
  }
  const config = getResendEmailConfig(env);
  if (!config) return { sent: false, error: 'resend_not_configured' };

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  if (recipients.length === 0 || recipients.some((recipient) => !String(recipient || '').trim())) {
    return { sent: false, error: 'invalid_recipient' };
  }

  try {
    const response = await fetchImplementation('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || config.from,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return { sent: false, error: typeof payload?.message === 'string' ? payload.message : `http_${response.status}` };
    }

    const payload = await response.json().catch(() => ({}));
    return { sent: true, id: typeof payload?.id === 'string' ? payload.id : undefined };
  } catch {
    return { sent: false, error: 'network_error' };
  }
}

export async function sendMerchantWelcomeEmail(
  params: {
    shopName: string;
    ownerEmail: string;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = (params.appUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const subject = `Votre boutique MaTable.ci a bien été créée`;
  const text = `Bonjour,\n\nVotre boutique ${params.shopName} a bien été créée sur MaTable.ci.\n\nVous pouvez vous connecter ici : ${appUrl}/connexion\n\nMerci de faire grandir votre vitrine avec MaTable.ci.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px; color: #0f4d3d;">Bienvenue sur MaTable.ci</h2>
      <p>Bonjour,</p>
      <p>Votre boutique <strong>${escapeHtml(params.shopName)}</strong> a bien été créée sur MaTable.ci.</p>
      <p>Vous pouvez accéder à votre espace de gestion depuis le lien suivant :</p>
      <p><a href="${appUrl}/connexion" style="color: #0f4d3d;">Se connecter à mon compte</a></p>
      <p>Merci de faire grandir votre vitrine avec MaTable.ci.</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: params.ownerEmail,
    subject,
    html,
    text,
  }, fetchImplementation);
}

export async function sendMerchantSubscriptionReceiptEmail(
  params: {
    shopName: string;
    ownerEmail: string;
    paymentId: string;
    providerReference: string;
    tierLabel: string;
    term: 'monthly' | 'annual';
    amount: number;
    currency: string;
    paidAt: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const receiptNumber = params.paymentId;
  const paidDate = RECEIPT_DATE_FORMATTER.format(new Date(params.paidAt));
  const amount = RECEIPT_AMOUNT_FORMATTER.format(params.amount);
  const termLabel = params.term === 'annual' ? 'annuel' : 'mensuel';
  const subject = `Reçu de paiement MaTable.ci — ${receiptNumber}`;
  const text = [
    'Bonjour,',
    '',
    `Votre paiement MaTable.ci pour la boutique ${params.shopName} a été confirmé.`,
    `Formule : ${params.tierLabel} (${termLabel})`,
    `Montant : ${amount} ${params.currency}`,
    `Date : ${paidDate} (heure de Côte d’Ivoire)`,
    `Référence de paiement : ${params.providerReference}`,
    `Numéro de reçu : ${receiptNumber}`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin-bottom: 12px; color: #0f4d3d;">Reçu de paiement MaTable.ci</h2>
      <p>Bonjour,</p>
      <p>Votre paiement pour la boutique <strong>${escapeHtml(params.shopName)}</strong> a été confirmé.</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><th align="left">Formule</th><td>${escapeHtml(params.tierLabel)} (${termLabel})</td></tr>
        <tr><th align="left">Montant</th><td>${escapeHtml(amount)} ${escapeHtml(params.currency)}</td></tr>
        <tr><th align="left">Date</th><td>${escapeHtml(paidDate)} (heure de Côte d’Ivoire)</td></tr>
        <tr><th align="left">Référence de paiement</th><td>${escapeHtml(params.providerReference)}</td></tr>
        <tr><th align="left">Numéro de reçu</th><td>${escapeHtml(receiptNumber)}</td></tr>
      </table>
    </div>
  `;

  return sendTransactionalEmail({ to: params.ownerEmail, subject, html, text }, fetchImplementation);
}
