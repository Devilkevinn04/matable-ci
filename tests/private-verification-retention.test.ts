import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeExpiredVerificationDocuments } from '../server/services/privateVerificationRetention.ts';

test('verification retention removes both final and staged objects for expired documents', async () => {
  const removed: string[] = [];
  const statements: string[] = [];
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const purged = await purgeExpiredVerificationDocuments(
    async <T>() => [{
      id: 'expired-doc',
      shop_id: 7,
      object_key: 'merchant-verification/7/final',
      upload_key: 'merchant-verification-staging/7/upload',
      upload_expires_at: expiredAt,
      status: 'available',
      expires_at: expiredAt,
    }] as T[],
    async (sql, params) => {
      statements.push(`${sql} ${JSON.stringify(params)}`);
      return { changes: 1 };
    },
    async (key) => { removed.push(key); },
  );

  assert.equal(purged, 1);
  assert.deepEqual(removed, [
    'merchant-verification/7/final',
    'merchant-verification-staging/7/upload',
  ]);
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM merchant_verification_documents')));
  assert.ok(statements.some((sql) => sql.includes('merchant_verification_document_purged')));
});

test('verification retention retries staging cleanup after a completed upload URL expires', async () => {
  const removed: string[] = [];
  const statements: string[] = [];
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const purged = await purgeExpiredVerificationDocuments(
    async <T>() => [{
      id: 'active-doc',
      shop_id: 7,
      object_key: 'merchant-verification/7/final',
      upload_key: 'merchant-verification-staging/7/upload',
      upload_expires_at: expiredAt,
      status: 'available',
      expires_at: null,
    }] as T[],
    async (sql, params) => {
      statements.push(`${sql} ${JSON.stringify(params)}`);
      return { changes: 1 };
    },
    async (key) => { removed.push(key); },
  );

  assert.equal(purged, 0);
  assert.deepEqual(removed, ['merchant-verification-staging/7/upload']);
  assert.ok(statements.some((sql) => sql.includes('SET upload_key = NULL, upload_expires_at = NULL')));
  assert.ok(!statements.some((sql) => sql.includes('DELETE FROM merchant_verification_documents')));
});
