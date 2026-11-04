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
                  <img src="${escapeHtml(logoUrl)}" width="34" height="34" alt="MaTable" style="display:block;width:34px;height:34px;border:0;border-radius:9px;" />
                </td>
                <td style="vertical-align:middle;padding-left:12px;font-family:${EMAIL_FONT};">
                  <div style="font-size:17px;font-weight:800;line-height:1.1;letter-spacing:-0.2px;color:#FFFFFF;">MaTable<span style="color:${BRAND.accent};">-ci.com</span></div>
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
            <p style="margin:0;font-size:11px;line-height:1.6;color:${BRAND.faint};">Cet email vous a été envoyé automatiquement par MaTable. Merci de ne pas y répondre directement.</p>
            <p style="margin:6px 0 0;font-size:11px;line-height:1.6;"><a href="${escapeHtml(params.appUrl)}" style="color:${BRAND.green};font-weight:700;text-decoration:none;">matable-ci.com</a><span style="color:#C6CDC8;"> · </span><span style="color:${BRAND.faint};">Vos commerces, ici.</span></p>
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
  const subject = `Votre boutique MaTable a bien été créée`;
  const text = `Bonjour,\n\nVotre boutique ${params.shopName} a bien été créée sur MaTable.\n\nVous pouvez vous connecter ici : ${appUrl}/app\n\nMerci de faire grandir votre vitrine avec MaTable.`;
  const html = renderBrandedEmail({
    title: 'Bienvenue sur MaTable',
    preheader: `Votre boutique ${params.shopName} est prête sur MaTable.`,
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Bienvenue sur MaTable</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour,</p>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Votre boutique <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> a bien été créée sur MaTable.</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Gérez votre catalogue, vos commandes et votre vitrine depuis votre espace de gestion.</p>
      ${renderEmailButton('Accéder à mon espace', `${appUrl}/app`)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur : <a href="${appUrl}/app" style="color:${BRAND.green};">${appUrl}/app</a></p>
      <p style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Merci de faire grandir votre vitrine avec MaTable.</p>
    `,
  });

  return sendTransactionalEmail({
    to: params.ownerEmail,
    subject,
    html,
    text,
  }, fetchImplementation);
}

export async function sendCustomerWelcomeEmail(
  params: {
    customerName: string;
    customerEmail: string;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = resolveAppUrl(params.appUrl);
  const subject = 'Bienvenue sur MaTable';
  const text = `Bonjour ${params.customerName},\n\nVotre compte client MaTable est prêt. Retrouvez les boutiques et suivez vos favoris ici : ${appUrl}/boutiques\n\nÀ bientôt sur MaTable.`;
  const html = renderBrandedEmail({
    title: subject,
    preheader: 'Votre compte client MaTable est prêt.',
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Bienvenue sur MaTable</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour ${escapeHtml(params.customerName)},</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Votre compte client est prêt. Découvrez les boutiques locales et retrouvez vos favoris à tout moment.</p>
      ${renderEmailButton('Découvrir les boutiques', `${appUrl}/boutiques`)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Vous recevez cet email à ${escapeHtml(params.customerEmail)} à la suite de la création de votre compte.</p>
    `,
  });
  return sendTransactionalEmail({ to: params.customerEmail, subject, html, text }, fetchImplementation);
}

export async function sendCustomerPasswordResetEmail(
  params: {
    customerName: string;
    customerEmail: string;
    token: string;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = resolveAppUrl(params.appUrl);
  const resetUrl = `${appUrl}/reinitialiser-mot-de-passe?token=${encodeURIComponent(params.token)}`;
  const subject = 'Réinitialisation de votre mot de passe MaTable';
  const text = `Bonjour ${params.customerName},\n\nUne demande de réinitialisation du mot de passe de votre compte MaTable a été reçue. Ce lien expire dans 30 minutes et ne peut être utilisé qu’une seule fois :\n${resetUrl}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet email.`;
  const html = renderBrandedEmail({
    title: subject,
    preheader: 'Un lien sécurisé vous permet de choisir un nouveau mot de passe.',
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Réinitialiser votre mot de passe</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour ${escapeHtml(params.customerName)},</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Une demande de réinitialisation du mot de passe de votre compte MaTable a été reçue. Le lien ci-dessous expire dans 30 minutes et ne peut être utilisé qu’une seule fois.</p>
      ${renderEmailButton('Choisir un nouveau mot de passe', resetUrl)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Si vous n’êtes pas à l’origine de cette demande, ignorez cet email. Aucun changement ne sera effectué sans utilisation du lien.</p>
    `,
  });
  return sendTransactionalEmail({ to: params.customerEmail, subject, html, text }, fetchImplementation);
}

export async function sendMerchantPinResetEmail(
  params: {
    shopName: string;
    ownerEmail: string;
    token: string;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = resolveAppUrl(params.appUrl);
  const resetUrl = `${appUrl}/reinitialiser-pin-commercant?token=${encodeURIComponent(params.token)}`;
  const subject = 'Réinitialisation du PIN de votre boutique MaTable';
  const text = `Bonjour,\n\nUne demande de réinitialisation du PIN de la boutique ${params.shopName} a été reçue. Le lien ci-dessous expire dans 30 minutes et ne peut être utilisé qu’une seule fois :\n${resetUrl}\n\nL’utilisation de ce lien confirme l’accès à cette adresse e-mail. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.`;
  const html = renderBrandedEmail({
    title: subject,
    preheader: 'Confirmez votre adresse e-mail pour choisir un nouveau PIN commerçant.',
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Réinitialiser le PIN de votre boutique</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Une demande de réinitialisation du PIN de la boutique <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> a été reçue.</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Ce lien confirme l’accès à cette adresse e-mail, expire dans 30 minutes et ne peut être utilisé qu’une seule fois.</p>
      ${renderEmailButton('Choisir un nouveau PIN', resetUrl)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Si vous n’êtes pas à l’origine de cette demande, ignorez cet email. Aucun changement ne sera effectué sans utilisation du lien.</p>
    `,
  });
  return sendTransactionalEmail({ to: params.ownerEmail, subject, html, text }, fetchImplementation);
}

export async function sendMerchantSubscriptionReminderEmail(
  params: {
    shopName: string;
    ownerEmail: string;
    expiresAt: string;
    daysBefore: number;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = resolveAppUrl(params.appUrl);
  const expiryDate = RECEIPT_DATE_FORMATTER.format(new Date(params.expiresAt));
  const dueText = params.daysBefore === 1 ? 'demain' : `dans ${params.daysBefore} jours`;
  const subject = `Échéance de votre abonnement MaTable ${dueText}`;
  const text = `Bonjour,\n\nL’abonnement de la boutique ${params.shopName} arrive à échéance ${dueText} (${expiryDate}). Renouvelez votre formule depuis votre espace commerçant : ${appUrl}/app\n\nVous pouvez désactiver ces rappels dans les paramètres de votre abonnement.`;
  const html = renderBrandedEmail({
    title: subject,
    preheader: `L’abonnement de ${params.shopName} arrive à échéance ${dueText}.`,
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Rappel d’échéance</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">L’abonnement de la boutique <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> arrive à échéance ${escapeHtml(dueText)}.</p>
      <p style="margin:0;font-family:${EMAIL_FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">Date d’échéance : <strong>${escapeHtml(expiryDate)}</strong></p>
      ${renderEmailButton('Gérer mon abonnement', `${appUrl}/app`)}
      <p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Vous pouvez désactiver ces rappels dans les paramètres de votre abonnement.</p>
    `,
  });
  return sendTransactionalEmail({ to: params.ownerEmail, subject, html, text }, fetchImplementation);
}

export async function sendCustomerOrderReceiptEmail(
  params: {
    customerName: string;
    customerEmail: string;
    orderId: number;
    shopName: string;
    shopWhatsAppNumber?: string | null;
    createdAt: string;
    items: {
      product_title?: string;
      quantity: number;
      unit_price: number;
      selected_size?: string;
      selected_color?: string;
      selected_modifiers?: string[];
    }[];
    deliveryLocation: string;
    deliverySlot?: string;
    paymentMethod: 'wave' | 'mobile_money' | 'cash' | 'to_confirm';
    totalAmount: number;
    deliveryFee: number;
    appUrl?: string;
  },
  fetchImplementation: typeof fetch = fetch,
): Promise<{ sent: boolean; id?: string; error?: string }> {
  const appUrl = resolveAppUrl(params.appUrl);
  const orderNumber = `#${params.orderId}`;
  const createdDate = RECEIPT_DATE_FORMATTER.format(new Date(params.createdAt));
  const amount = RECEIPT_AMOUNT_FORMATTER.format(params.totalAmount + params.deliveryFee);
  const itemRows = params.items.map((item) => {
    const options = [
      item.selected_size,
      item.selected_color,
      ...(item.selected_modifiers || []),
    ].filter(Boolean).join(' · ');
    const description = `${item.product_title || 'Article'} × ${item.quantity}`;
    return `<tr>
      <td style="padding:11px 0;border-top:1px solid #EFEAE0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${BRAND.body};vertical-align:top;">
        ${escapeHtml(description)}${options ? `<br /><span style="font-size:11px;color:${BRAND.muted};">${escapeHtml(options)}</span>` : ''}
      </td>
      <td align="right" style="padding:11px 0 11px 14px;border-top:1px solid #EFEAE0;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;line-height:1.5;color:#1B2620;vertical-align:top;">${escapeHtml(RECEIPT_AMOUNT_FORMATTER.format(item.unit_price * item.quantity))} FCFA</td>
    </tr>`;
  }).join('');
  const paymentLabels = {
    wave: 'Wave',
    mobile_money: 'Mobile Money',
    cash: 'Espèces',
    to_confirm: 'À convenir avec la boutique',
  } as const;
  const phoneDigits = String(params.shopWhatsAppNumber || '').replace(/\D/g, '');
  const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
  const subject = `Récapitulatif de votre commande ${orderNumber}`;
  const textItems = params.items.map((item) => {
    const options = [
      item.selected_size,
      item.selected_color,
      ...(item.selected_modifiers || []),
    ].filter(Boolean).join(' · ');
    return `- ${item.product_title || 'Article'} × ${item.quantity}${options ? ` (${options})` : ''} : ${RECEIPT_AMOUNT_FORMATTER.format(item.unit_price * item.quantity)} FCFA`;
  });
  const text = [
    `Bonjour ${params.customerName},`,
    '',
    `Votre demande de commande ${orderNumber} chez ${params.shopName} a bien été enregistrée.`,
    `Date : ${createdDate} (heure de Côte d’Ivoire)`,
    '',
    'Articles :',
    ...textItems,
    ...(params.deliveryFee > 0 ? [`Frais de livraison MaTable : ${RECEIPT_AMOUNT_FORMATTER.format(params.deliveryFee)} FCFA`] : []),
    `Total à régler : ${amount} FCFA`,
    `Retrait / livraison : ${params.deliveryLocation}`,
    ...(params.deliverySlot ? [`Créneau souhaité : ${params.deliverySlot}`] : []),
    `Mode de règlement souhaité : ${paymentLabels[params.paymentMethod]}`,
    '',
    'Votre demande attend la réponse de la boutique. Sans réponse sous 2 heures, elle expirera et les articles réservés seront remis en stock. Ce récapitulatif ne confirme pas un paiement.',
    ...(whatsappUrl ? [`Contactez la boutique sur WhatsApp : ${whatsappUrl}`] : []),
  ].join('\n');
  const html = renderBrandedEmail({
    title: subject,
    preheader: `Récapitulatif de votre commande ${orderNumber} chez ${params.shopName}.`,
    appUrl,
    contentHtml: `
      <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:21px;font-weight:800;line-height:1.25;color:${BRAND.deep};">Votre commande est enregistrée</h1>
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT};font-size:14px;line-height:1.65;color:${BRAND.body};">Bonjour ${escapeHtml(params.customerName)}, votre demande de commande chez <strong style="color:${BRAND.deep};">${escapeHtml(params.shopName)}</strong> a bien été enregistrée.</p>
      <p style="margin:0 0 18px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};">Commande ${escapeHtml(orderNumber)} · ${escapeHtml(createdDate)} (heure de Côte d’Ivoire)</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr>
          <th align="left" style="padding:0 0 8px;font-family:${EMAIL_FONT};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.faint};">Articles</th>
          <th align="right" style="padding:0 0 8px;font-family:${EMAIL_FONT};font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.faint};">Montant</th>
        </tr>
        ${itemRows}
        <tr>
          <td style="padding:11px 0;border-top:1px solid #EFEAE0;font-family:${EMAIL_FONT};font-size:12px;color:${BRAND.muted};">Articles</td>
          <td align="right" style="padding:11px 0;border-top:1px solid #EFEAE0;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;color:${BRAND.body};">${escapeHtml(RECEIPT_AMOUNT_FORMATTER.format(params.totalAmount))} FCFA</td>
        </tr>
        ${params.deliveryFee > 0 ? `<tr>
          <td style="padding:8px 0;font-family:${EMAIL_FONT};font-size:12px;color:${BRAND.muted};">Frais de livraison MaTable</td>
          <td align="right" style="padding:8px 0;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;color:${BRAND.body};">${escapeHtml(RECEIPT_AMOUNT_FORMATTER.format(params.deliveryFee))} FCFA</td>
        </tr>` : ''}
        <tr>
          <td style="padding:12px 0;border-top:1px solid ${BRAND.line};font-family:${EMAIL_FONT};font-size:13px;font-weight:800;color:${BRAND.deep};">Total à régler</td>
          <td align="right" style="padding:12px 0;border-top:1px solid ${BRAND.line};font-family:${EMAIL_FONT};font-size:14px;font-weight:800;color:${BRAND.deep};">${escapeHtml(amount)} FCFA</td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">Retrait ou livraison : <strong>${escapeHtml(params.deliveryLocation)}</strong>${params.deliverySlot ? `<br />Créneau souhaité : <strong>${escapeHtml(params.deliverySlot)}</strong>` : ''}<br />Mode de règlement souhaité : <strong>${escapeHtml(paymentLabels[params.paymentMethod])}</strong></p>
      <p style="margin:16px 0 0;padding:12px;border:1px solid #F3D7A5;border-radius:12px;background:#FFF8E9;font-family:${EMAIL_FONT};font-size:12px;line-height:1.6;color:#74551B;">Votre demande attend la réponse de la boutique. Sans réponse sous 2 heures, elle expirera et les articles réservés seront remis en stock. Ce récapitulatif ne confirme pas un paiement.</p>
      ${whatsappUrl ? renderEmailButton('Contacter la boutique sur WhatsApp', whatsappUrl) : ''}
    `,
  });
  return sendTransactionalEmail({ to: params.customerEmail, subject, html, text }, fetchImplementation);
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
  const subject = `Reçu de paiement MaTable — ${receiptNumber}`;
  const text = [
    'Bonjour,',
    '',
    `Votre paiement MaTable pour la boutique ${params.shopName} a été confirmé.`,
    `Formule : ${params.tierLabel} (${termLabel})`,
    `Montant : ${amount} ${params.currency}`,
    `Date : ${paidDate} (heure de Côte d’Ivoire)`,
    `Référence de paiement : ${params.providerReference}`,
    `Numéro de reçu : ${receiptNumber}`,
  ].join('\n');
  const html = renderBrandedEmail({
    title: `Reçu de paiement MaTable — ${receiptNumber}`,
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

      <p style="margin:18px 0 0;font-family:${EMAIL_FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};">Conservez ce reçu : il atteste du règlement de votre abonnement MaTable.</p>
    `,
  });

  return sendTransactionalEmail({ to: params.ownerEmail, subject, html, text }, fetchImplementation);
}
