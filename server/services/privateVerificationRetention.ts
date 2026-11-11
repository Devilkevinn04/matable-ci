import { deleteVerificationDocumentObject } from './privateVerificationStorage.ts';

type DbAll = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
type DbRun = (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
type DeleteObject = (key: string) => Promise<void>;

export async function purgeExpiredVerificationDocuments(
  dbAll: DbAll,
  dbRun: DbRun,
  deleteObject: DeleteObject = deleteVerificationDocumentObject,
): Promise<number> {
  const now = new Date();
  const expiresBefore = now.toISOString();
  const abandonedBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const expired = await dbAll<{
    id: string; shop_id: number; object_key: string; upload_key: string | null; upload_expires_at: string | null;
    status: string; expires_at: string | null;
  }>(
    `SELECT id, shop_id, object_key, upload_key, upload_expires_at, status, expires_at
     FROM merchant_verification_documents
     WHERE (expires_at IS NOT NULL AND expires_at <= ?)
        OR (status = 'pending_upload' AND (
          (upload_expires_at IS NOT NULL AND upload_expires_at <= ?)
          OR (upload_expires_at IS NULL AND created_at <= ?)
        ))
        OR (upload_key IS NOT NULL AND upload_expires_at IS NOT NULL AND upload_expires_at <= ?)
     ORDER BY created_at ASC LIMIT 100`,
    [expiresBefore, expiresBefore, abandonedBefore, expiresBefore],
  );
  let deleted = 0;
  for (const document of expired) {
    const retentionExpired = !!document.expires_at && document.expires_at <= expiresBefore;
    const uploadAbandoned = document.status === 'pending_upload';
    if (retentionExpired || uploadAbandoned) {
      await deleteObject(document.object_key);
      if (document.upload_key) await deleteObject(document.upload_key);
      const result = await dbRun(
        'DELETE FROM merchant_verification_documents WHERE id = ? AND object_key = ?',
        [document.id, document.object_key],
      );
      if (result.changes > 0) {
        await dbRun(
          `INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          ['system', 'merchant_verification_document_purged', document.shop_id,
            JSON.stringify({ document_id: document.id, reason: retentionExpired ? 'retention_expired' : 'upload_abandoned' }),
            new Date().toISOString()],
        );
        deleted += 1;
      }
    } else if (document.upload_key) {
      await deleteObject(document.upload_key);
      await dbRun(
        `UPDATE merchant_verification_documents
         SET upload_key = NULL, upload_expires_at = NULL
         WHERE id = ? AND upload_key = ?`,
        [document.id, document.upload_key],
      );
    }
  }
  return deleted;
}
