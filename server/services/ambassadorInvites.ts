import { createHash, randomBytes } from 'node:crypto';
import { dbTransaction, databaseMode } from '../../db.ts';
import { sendAmbassadorAccessEmail } from './email.ts';

const INVITE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const hashAmbassadorToken = (token: string) => createHash('sha256').update(token).digest('hex');

type InviteResult =
  | { status: 'not_found' | 'inactive' | 'missing_email'; inviteUrl?: never; expiresAt?: never; emailSent?: never; emailError?: never }
  | { status: 'created'; inviteUrl: string; expiresAt: string; emailSent: boolean; emailError?: string };

export async function createAmbassadorInvite(input: {
  ambassadorId: string;
  appUrl: string;
  recovery: boolean;
  retainInviteOnEmailFailure: boolean;
}): Promise<InviteResult> {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_DURATION_MS).toISOString();
  const inviteUrl = new URL('/ambassadeur/activer', input.appUrl);
  inviteUrl.searchParams.set('token', token);

  const result = await dbTransaction(async (transaction) => {
    const ambassador = await transaction.get<{ id: string; name: string; email: string | null; active: number }>(
      `SELECT id, name, email, active FROM ambassadors WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [input.ambassadorId],
    );
    if (!ambassador) return { status: 'not_found' as const };
    if (!ambassador.active) return { status: 'inactive' as const };
    if (!ambassador.email) return { status: 'missing_email' as const };

    if (!input.recovery) {
      await transaction.run(
        'UPDATE ambassador_invites SET used_at = ? WHERE ambassador_id = ? AND used_at IS NULL',
        [createdAt, ambassador.id],
      );
    }
    await transaction.run(
      'INSERT INTO ambassador_invites (token_hash, ambassador_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [hashAmbassadorToken(token), ambassador.id, expiresAt, createdAt],
    );
    await transaction.run(
      'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
      [
        input.recovery ? 'ambassador' : 'super_admin',
        input.recovery ? 'ambassador_access_recovery_requested' : 'ambassador_invite_created',
        null,
        JSON.stringify({ ambassador_id: ambassador.id, expires_at: expiresAt }),
        createdAt,
      ],
    );
    return { status: 'created' as const, ambassador };
  });

  if (result.status !== 'created') return result;

  const delivery = await sendAmbassadorAccessEmail({
    name: result.ambassador.name,
    email: result.ambassador.email,
    inviteUrl: inviteUrl.toString(),
    recovery: input.recovery,
    appUrl: input.appUrl,
  });
  if (!delivery.sent) {
    await dbTransaction(async (transaction) => {
      if (!input.retainInviteOnEmailFailure) {
        await transaction.run(
          'UPDATE ambassador_invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
          [new Date().toISOString(), hashAmbassadorToken(token)],
        );
      }
      await transaction.run(
        'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          input.recovery ? 'ambassador' : 'super_admin',
          'ambassador_access_email_failed',
          null,
          JSON.stringify({ ambassador_id: result.ambassador.id, error: delivery.error || 'unknown_error' }),
          new Date().toISOString(),
        ],
      );
    });
    if (delivery.error !== 'email_disabled_in_test') {
      console.error(`Unable to send ambassador access email for account ${result.ambassador.id}: ${delivery.error || 'unknown_error'}.`);
    }
    return {
      status: 'created',
      inviteUrl: inviteUrl.toString(),
      expiresAt,
      emailSent: false,
      emailError: delivery.error || 'email_delivery_failed',
    };
  }

  if (input.recovery) {
    await dbTransaction(async (transaction) => {
      await transaction.run(
        'UPDATE ambassador_invites SET used_at = ? WHERE ambassador_id = ? AND token_hash <> ? AND used_at IS NULL',
        [new Date().toISOString(), result.ambassador.id, hashAmbassadorToken(token)],
      );
    });
  }

  return { status: 'created', inviteUrl: inviteUrl.toString(), expiresAt, emailSent: true };
}
