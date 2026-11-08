import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { databaseMode, dbRun, dbTransaction } from '../../db.ts';
import { sendAuthCodeEmail, sendEmailMfaRolloutNotice } from './email.ts';

export type EmailMfaSubject =
  | 'admin'
  | 'ambassador'
  | 'customer'
  | 'customer_email_setup'
  | 'merchant'
  | 'merchant_email_setup';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const ROLLOUT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function getEmailMfaDeadline(): string | null {
  const rolloutStartedAt = Date.parse(String(process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT || '').trim());
  if (!Number.isFinite(rolloutStartedAt)) return null;
  return new Date(rolloutStartedAt + ROLLOUT_GRACE_MS).toISOString();
}

export async function sendEmailMfaRolloutNoticeOnce(input: {
  subject: 'customer' | 'merchant';
  subjectId: string;
  email: string;
  appUrl?: string;
}): Promise<'sent' | 'already_sent' | 'failed'> {
  const createdAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const reservation = await dbRun(
    `INSERT INTO auth_email_rollout_notices (subject_type, subject_id, created_at, sent_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT(subject_type, subject_id) DO UPDATE
       SET created_at = excluded.created_at
       WHERE auth_email_rollout_notices.sent_at IS NULL
         AND auth_email_rollout_notices.created_at < ?`,
    [input.subject, input.subjectId, createdAt, staleBefore],
  );
  if (reservation.changes !== 1) return 'already_sent';

  const delivery = await sendEmailMfaRolloutNotice({
    email: input.email,
    accountType: input.subject,
    appUrl: input.appUrl,
    deadlineAt: getEmailMfaDeadline(),
  });
  if (!delivery.sent) {
    await dbRun(
      'DELETE FROM auth_email_rollout_notices WHERE subject_type = ? AND subject_id = ? AND created_at = ? AND sent_at IS NULL',
      [input.subject, input.subjectId, createdAt],
    );
    if (delivery.error !== 'email_disabled_in_test') {
      console.error(`Unable to send email MFA rollout notice to ${input.subject} account ${input.subjectId}: ${delivery.error || 'unknown_error'}.`);
    }
    return 'failed';
  }
  await dbRun(
    'UPDATE auth_email_rollout_notices SET sent_at = ? WHERE subject_type = ? AND subject_id = ? AND created_at = ? AND sent_at IS NULL',
    [new Date().toISOString(), input.subject, input.subjectId, createdAt],
  );
  return 'sent';
}

function isValidSender(value: string): boolean {
  const sender = value.trim();
  const displayNameMatch = /^(.*?)\s*<([^<>]+)>$/.exec(sender);
  if (!displayNameMatch) return EMAIL_ADDRESS_PATTERN.test(sender);

  const [, displayName, email] = displayNameMatch;
  return Boolean(displayName.trim()) && EMAIL_ADDRESS_PATTERN.test(email);
}

function hashCode(challengeId: string, code: string): string {
  const pepper = String(process.env.AUTH_EMAIL_MFA_PEPPER || '');
  if (!pepper && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_EMAIL_MFA_PEPPER doit être configurée côté serveur.');
  }
  return createHmac('sha256', pepper || 'matable-email-mfa-development-pepper')
    .update(`${challengeId}:${code}`)
    .digest('hex');
}

export function isEmailMfaRequired(
  createdAt?: string | null,
  now = Date.now(),
  gracePeriodMs = ROLLOUT_GRACE_MS,
): boolean {
  const rolloutValue = String(process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT || '').trim();
  const rolloutStartedAt = Date.parse(rolloutValue);
  if (!Number.isFinite(rolloutStartedAt)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT doit être une date valide en production.');
    }
    return false;
  }
  const accountCreatedAt = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(accountCreatedAt) && accountCreatedAt >= rolloutStartedAt
    || now >= rolloutStartedAt + gracePeriodMs;
}

export function assertEmailMfaConfiguration(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const rolloutStartedAt = Date.parse(String(process.env.AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT || '').trim());
  if (!Number.isFinite(rolloutStartedAt)) {
    throw new Error('AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT doit être une date ISO valide en production.');
  }

  for (const key of ['AUTH_EMAIL_MFA_PEPPER', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'ADMIN_MFA_EMAIL', 'VERIFICATION_ADMIN_MFA_EMAIL']) {
    if (!String(process.env[key] || '').trim()) {
      throw new Error(`${key} doit être configurée côté hébergeur pour activer la MFA e-mail.`);
    }
  }
  if (String(process.env.AUTH_EMAIL_MFA_PEPPER).trim().length < 32) {
    throw new Error('AUTH_EMAIL_MFA_PEPPER doit contenir au moins 32 caractères.');
  }
  for (const key of ['RESEND_FROM_EMAIL', 'ADMIN_MFA_EMAIL', 'VERIFICATION_ADMIN_MFA_EMAIL']) {
    const value = String(process.env[key]).trim();
    const valid = key === 'RESEND_FROM_EMAIL'
      ? isValidSender(value)
      : EMAIL_ADDRESS_PATTERN.test(value);
    if (!valid) {
      throw new Error(`${key} doit contenir une adresse e-mail valide.`);
    }
  }
}

export async function startEmailMfaChallenge(input: {
  subject: EmailMfaSubject;
  subjectId: string;
  email: string;
  appUrl?: string;
}): Promise<{ challengeId: string; expiresAt: number } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: 'invalid_email' };

  const challengeId = randomBytes(16).toString('hex');
  const code = randomInt(0, 100_000_000).toString().padStart(8, '0');
  const now = Date.now();
  const expiresAt = now + CODE_TTL_MS;
  await dbTransaction(async (transaction) => {
    await transaction.run('DELETE FROM auth_email_challenges WHERE expires_at <= ? OR (subject_type = ? AND subject_id = ?)',
      [now, input.subject, input.subjectId]);
    await transaction.run(
      `INSERT INTO auth_email_challenges (challenge_id, subject_type, subject_id, email, code_hash, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [challengeId, input.subject, input.subjectId, email, hashCode(challengeId, code), expiresAt, new Date(now).toISOString()],
    );
  });

  const delivery = await sendAuthCodeEmail({ email, code, appUrl: input.appUrl });
  if (!delivery.sent) {
    await dbTransaction(async (transaction) => {
      await transaction.run('DELETE FROM auth_email_challenges WHERE challenge_id = ?', [challengeId]);
    });
    return { error: delivery.error || 'email_delivery_failed' };
  }
  return { challengeId, expiresAt };
}

export async function verifyEmailMfaChallenge(input: {
  challengeId: string;
  code: string;
  subject: EmailMfaSubject;
}): Promise<{ subjectId: string; email: string } | 'invalid' | 'expired' | 'locked'> {
  const challengeId = input.challengeId.trim();
  const code = input.code.trim();
  if (!/^[a-f0-9]{32}$/.test(challengeId) || !/^\d{8}$/.test(code)) return 'invalid';

  return dbTransaction(async (transaction) => {
    const challenge = await transaction.get<{
      subject_id: string;
      subject_type: string;
      email: string;
      code_hash: string;
      attempts: number;
      expires_at: number;
    }>(
      `SELECT subject_id, subject_type, email, code_hash, attempts, expires_at
       FROM auth_email_challenges WHERE challenge_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [challengeId],
    );
    if (!challenge || challenge.subject_type !== input.subject) return 'invalid';
    if (Number(challenge.expires_at) <= Date.now()) {
      await transaction.run('DELETE FROM auth_email_challenges WHERE challenge_id = ?', [challengeId]);
      return 'expired';
    }
    if (Number(challenge.attempts) >= MAX_CODE_ATTEMPTS) {
      await transaction.run('DELETE FROM auth_email_challenges WHERE challenge_id = ?', [challengeId]);
      return 'locked';
    }

    const expectedHash = Buffer.from(challenge.code_hash);
    const providedHash = Buffer.from(hashCode(challengeId, code));
    const matches = expectedHash.length === providedHash.length && timingSafeEqual(expectedHash, providedHash);
    if (!matches) {
      const attempts = Number(challenge.attempts) + 1;
      await transaction.run(
        attempts >= MAX_CODE_ATTEMPTS
          ? 'DELETE FROM auth_email_challenges WHERE challenge_id = ?'
          : 'UPDATE auth_email_challenges SET attempts = ? WHERE challenge_id = ?',
        attempts >= MAX_CODE_ATTEMPTS ? [challengeId] : [attempts, challengeId],
      );
      return attempts >= MAX_CODE_ATTEMPTS ? 'locked' : 'invalid';
    }

    const consumed = await transaction.run('DELETE FROM auth_email_challenges WHERE challenge_id = ?', [challengeId]);
    return consumed.changes === 1
      ? { subjectId: String(challenge.subject_id), email: String(challenge.email) }
      : 'invalid';
  });
}
