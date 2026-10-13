import { createHash } from 'node:crypto';
import { dbAll, dbGet, dbRun } from '../../db.ts';

const hashSessionToken = (token: string) => createHash('sha256').update(`matable-session:${token}`).digest('hex');

export async function saveMerchantSessionRecord(token: string, session: { shopId: number; expiresAt: number; fingerprint: string }) {
  await dbRun(`
    INSERT INTO merchant_sessions (token, shop_id, expires_at, fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      shop_id = excluded.shop_id,
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      created_at = excluded.created_at
  `, [hashSessionToken(token), session.shopId, session.expiresAt, session.fingerprint, new Date().toISOString()]);
}

export async function getMerchantSessionRecord(token: string): Promise<{ shopId: number; expiresAt: number; fingerprint: string } | null> {
  const row = await dbGet<{ shop_id: number; expires_at: number; fingerprint: string }>('SELECT shop_id, expires_at, fingerprint FROM merchant_sessions WHERE token = ?', [hashSessionToken(token)]);
  if (!row) return null;
  return { shopId: Number(row.shop_id), expiresAt: Number(row.expires_at), fingerprint: row.fingerprint };
}

export async function deleteMerchantSessionRecord(token: string) {
  await dbRun('DELETE FROM merchant_sessions WHERE token = ?', [hashSessionToken(token)]);
}

export async function saveAdminSessionRecord(token: string, session: { expiresAt: number; fingerprint: string; role?: string }) {
  const role = session.role ?? 'super_admin';
  await dbRun(`
    INSERT INTO admin_sessions (token, expires_at, fingerprint, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      role = excluded.role,
      created_at = excluded.created_at
  `, [hashSessionToken(token), session.expiresAt, session.fingerprint, role, new Date().toISOString()]);
}

export async function getAdminSessionRecord(token: string): Promise<{ expiresAt: number; fingerprint: string; role?: string } | null> {
  const row = await dbGet<{ expires_at: number; fingerprint: string; role?: string }>('SELECT expires_at, fingerprint, role FROM admin_sessions WHERE token = ?', [hashSessionToken(token)]);
  if (!row) return null;
  return { expiresAt: Number(row.expires_at), fingerprint: row.fingerprint, role: row.role ?? 'super_admin' };
}

export async function deleteAdminSessionRecord(token: string) {
  await dbRun('DELETE FROM admin_sessions WHERE token = ?', [hashSessionToken(token)]);
}

export async function saveCustomerSessionRecord(token: string, session: { userId: number; expiresAt: number; fingerprint: string }) {
  await dbRun(`
    INSERT INTO user_sessions (token, user_id, expires_at, fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      expires_at = excluded.expires_at,
      fingerprint = excluded.fingerprint,
      created_at = excluded.created_at
  `, [hashSessionToken(token), session.userId, session.expiresAt, session.fingerprint, new Date().toISOString()]);
}

export async function getCustomerSessionRecord(token: string): Promise<{ userId: number; expiresAt: number; fingerprint: string } | null> {
  const row = await dbGet<{ user_id: number; expires_at: number; fingerprint: string }>('SELECT user_id, expires_at, fingerprint FROM user_sessions WHERE token = ?', [hashSessionToken(token)]);
  if (!row) return null;
  return { userId: Number(row.user_id), expiresAt: Number(row.expires_at), fingerprint: row.fingerprint };
}

export async function deleteCustomerSessionRecord(token: string) {
  await dbRun('DELETE FROM user_sessions WHERE token = ?', [hashSessionToken(token)]);
}

export async function listCustomerSessionRecords(userId: number, currentToken: string) {
  const currentTokenHash = hashSessionToken(currentToken);
  const records = await dbAll<{ token: string; created_at: string; expires_at: number }>(
    'SELECT token, created_at, expires_at FROM user_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC',
    [userId, Date.now()],
  );
  return records.map((record) => ({
    id: record.token,
    created_at: record.created_at,
    expires_at: Number(record.expires_at),
    is_current: record.token === currentTokenHash,
  }));
}

export async function revokeOtherCustomerSessionRecords(userId: number, currentToken: string) {
  return dbRun('DELETE FROM user_sessions WHERE user_id = ? AND token <> ?', [userId, hashSessionToken(currentToken)]);
}

export async function migrateExistingSessionTokens() {
  const tables = ['merchant_sessions', 'admin_sessions', 'user_sessions'] as const;
  for (const table of tables) {
    const records = await dbAll<{ token: string }>(`SELECT token FROM ${table}`);
    for (const record of records) {
      if (/^[a-f0-9]{64}$/.test(record.token)) continue;
      await dbRun(`UPDATE ${table} SET token = ? WHERE token = ?`, [hashSessionToken(record.token), record.token]);
    }
  }
}
