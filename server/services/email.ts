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

const BRAND = {
  green: '#087F62',
  deep: '#103E32',
  accent: '#F97316',
  cream: '#FAF8F2',
  line: '#E8E2D7',
  muted: '#587067',
  body: '#243029',
  faint: '#8A948E',
} as const;

const EMAIL_FONT = 'Arial, Helvetica, sans-serif';

function resolveAppUrl(explicit?: string): string {
  return (explicit || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function renderEmailDetailRows(rows: Array<[string, string]>): string {
  return rows
    .map(([label, valueHtml], index) => {
      const separator = index === 0 ? '0' : `1px solid #EFEAE0`;
      return `<tr>
        <td style="padding:11px 0;border-top:${separator};font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};vertical-align:top;">${escapeHtml(label)}</td>
        <td align="right" style="padding:11px 0 11px 14px;border-top:${separator};font-family:${EMAIL_FONT};font-size:13px;font-weight:700;line-height:1.5;color:#1B2620;vertical-align:top;">${valueHtml}</td>
      </tr>`;
    })
    .join('');
}

/**
 * Coque commune des emails transactionnels : bandeau vert, carte blanche,
 * pied de page de marque. Mise en page en tables pour la compatibilité clients mail.
 */
function renderBrandedEmail(params: {
  title: string;
  preheader: string;
  contentHtml: string;
  appUrl: string;
}): string {
  const logoUrl = `${params.appUrl}/brand-kit/icon-192.png`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(params.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${BRAND.cream};">
  <tr>
    <td align="center" style="padding:28px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid ${BRAND.line};border-radius:20px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND.green};padding:20px 26px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="${escapeHtml(logoUrl)}" width="34" height="34" alt="MaTable.ci" style="display:block;width:34px;height:34px;border:0;border-radius:9px;" />
                </td>
                <td style="vertical-align:middle;padding-left:12px;font-family:${EMAIL_FONT};">
                  <div style="font-size:17px;font-weight:800;line-height:1.1;letter-spacing:-0.2px;color:#FFFFFF;">MaTable<span style="color:${BRAND.accent};">.ci</span></div>
                  <div style="margin-top:3px;font-size:9px;font-weight:700;line-height:1.2;letter-spacing:1.6px;text-transform:uppercase;color:#B9DCCF;">Vos commerces, ici.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">${params.contentHtml}</td>
        </tr>
        <tr>
          <td style="padding:16px 26px 22px;border-top:1px solid #EFEAE0;font-family:${EMAIL_FONT};">
            <p style="margin:0;font-size:11px;line-height:1.6;color:${BRAND.faint};">Cet email vous a été envoyé automatiquement par MaTable.ci. Merci de ne pas y répondre directement.</p>
            <p style="margin:6px 0 0;font-size:11px;line-height:1.6;"><a href="${escapeHtml(params.appUrl)}" style="color:${BRAND.green};font-weight:700;text-decoration:none;">matable.ci</a><span style="color:#C6CDC8;"> · </span><span style="color:${BRAND.faint};">Vos commerces, ici.</span></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function renderEmailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;">
    <tr>
      <td align="center" style="background:${BRAND.green};border-radius:12px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${EMAIL_FONT};font-size:14px;font-weight:700;line-height:1;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

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
  const appUrl = resolveAppUrl(params.appUrl);
  const subject = `Votre boutique MaTable.ci a bien été créée`;
  const text = `Bonjour,\n\nVotre boutique ${params.shopName} a bien été créée sur MaTable.ci.\n\nVous pouvez vous connecter ici : ${appUrl}/app\n\nMerci de faire grandir votre vitrine avec MaTable.ci.`;
  const html = renderBrandedEmail({
    title: 'Bienvenue sur MaTable.ci',
    preheader: `Votre boutique ${params.shopName} est prête sur MaTable.ci.`,
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Bienvenue sur MaTable.ci</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour,</p>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Votre boutique <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> a bien été créée sur MaTable.ci.</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Gérez votre catalogue, vos commandes et votre vitrine depuis votre espace de gestion.</p>
      ${renderEmailButton('Accéder à mon espace', `${appUrl}/app`)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : <a href="${appUrl}/app" style="color:${BRAND.green};">${appUrl}/app</a></p>
      <p style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Merci de faire grandir votre vitrine avec MaTable.ci.</p>
    `,
  });

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
    appUrl?: string;
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
  const html = renderBrandedEmail({
    title: `Reçu de paiement MaTable.ci — ${receiptNumber}`,
    preheader: `Paiement confirmé : ${amount} ${params.currency} pour ${params.shopName}.`,
    appUrl: resolveAppUrl(params.appUrl),
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Reçu de paiement</h1>
      <p style="margin:0 0 18px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour, le paiement de la boutique <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> a été confirmé.</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F4F8F5;border:1px solid #DBE9E1;border-radius:16px;">
        <tr>
          <td style="padding:18px 20px;font-family:${EMAIL_FONT};">
            <p style="margin:0;font-size:10px;font-weight:800;line-height:1.4;letter-spacing:1.2px;text-transform:uppercase;color:#0F6B54;">Montant réglé</p>
            <p style="margin:8px 0 0;font-size:30px;font-weight:800;line-height:1.1;color:${BRAND.deep};">${escapeHtml(amount)} <span style="font-size:15px;font-weight:700;color:${BRAND.muted};">${escapeHtml(params.currency)}</span></p>
            <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">Formule ${escapeHtml(params.tierLabel)} · engagement ${termLabel}</p>
          </td>
        </tr>
      </table>

      <p style="margin:22px 0 4px;font-family:${EMAIL_FONT};font-size:10px;font-weight:800;line-height:1.4;letter-spacing:1.4px;text-transform:uppercase;color:${BRAND.faint};">Détails du paiement</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        ${renderEmailDetailRows([
          ['Formule', `${escapeHtml(params.tierLabel)} · ${termLabel}`],
          ['Date', `${escapeHtml(paidDate)} <span style="font-weight:400;color:${BRAND.muted};">(heure de Côte d’Ivoire)</span>`],
          ['Référence de paiement', escapeHtml(params.providerReference)],
          ['Numéro de reçu', `<span style="font-family:'Courier New',Courier,monospace;font-size:12px;">${escapeHtml(receiptNumber)}</span>`],
        ])}
      </table>

      <p style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Conservez ce reçu : il atteste du règlement de votre abonnement MaTable.ci.</p>
    `,
  });

  return sendTransactionalEmail({ to: params.ownerEmail, subject, html, text }, fetchImplementation);
}
