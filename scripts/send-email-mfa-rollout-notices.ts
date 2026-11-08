import { setTimeout as delay } from 'node:timers/promises';
import { closeDatabase, dbAll, initializeDatabase } from '../db.ts';
import { sendEmailMfaRolloutNoticeOnce } from '../server/services/emailMfa.ts';

interface EmailNoticeRecipient {
  id: number | string;
  email: string;
}

async function main() {
  const rolloutStartedAt = Date.parse(String(process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT || '').trim());
  if (!Number.isFinite(rolloutStartedAt)) {
    throw new Error('AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT doit être une date valide.');
  }
  await initializeDatabase();
  const existingAccountsCutoff = new Date(rolloutStartedAt).toISOString();
  const [customers, merchants] = await Promise.all([
    dbAll<EmailNoticeRecipient>(
      `SELECT id, email FROM users
       WHERE created_at < ? AND email IS NOT NULL AND TRIM(email) <> ''
       ORDER BY id`,
      [existingAccountsCutoff],
    ),
    dbAll<EmailNoticeRecipient>(
      `SELECT id, owner_email AS email FROM shops
       WHERE created_at < ? AND owner_email IS NOT NULL AND TRIM(owner_email) <> ''
       ORDER BY id`,
      [existingAccountsCutoff],
    ),
  ]);
  const recipients = [
    ...customers.map((recipient) => ({ ...recipient, subject: 'customer' as const })),
    ...merchants.map((recipient) => ({ ...recipient, subject: 'merchant' as const })),
  ];
  let sent = 0;
  let alreadySent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const outcome = await sendEmailMfaRolloutNoticeOnce({
      subject: recipient.subject,
      subjectId: String(recipient.id),
      email: recipient.email,
      appUrl: process.env.APP_URL,
    });
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'already_sent') alreadySent += 1;
    else failed += 1;
    await delay(500);
  }

  console.log(`Avis MFA e-mail : ${sent} envoyé(s), ${alreadySent} déjà traité(s), ${failed} échec(s).`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Échec de l’envoi des avis MFA e-mail.', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
