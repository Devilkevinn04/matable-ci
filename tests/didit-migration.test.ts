import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const dbPath = path.join(tmpdir(), `matable-didit-migration-${Date.now()}.db`);

function loadDatabaseModule(instance: string) {
  return import(new URL(`../db.ts?${instance}`, import.meta.url).href);
}

test('legacy merchant verification is reset once and sensitive records are removed', async () => {
  const previousDbPath = process.env.MATABLE_DB_PATH;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.MATABLE_DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';

  try {
    const initial = await loadDatabaseModule('didit-migration-initial');
    initial.db.prepare(`INSERT INTO shops
      (id, name, slug, whatsapp_number, pin_code_hash, is_active, publication_status,
       merchant_verification_status, created_at, category, subscription_tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, 'fashion', 'standard')`)
      .run(1, 'Boutique active', 'boutique-active', '+2250700000001', 'hash', 1, 'active', new Date().toISOString());
    initial.db.prepare(`INSERT INTO shops
      (id, name, slug, whatsapp_number, pin_code_hash, is_active, publication_status,
       merchant_verification_status, created_at, category, subscription_tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', ?, 'fashion', 'standard')`)
      .run(2, 'Boutique inactive', 'boutique-inactive', '+2250700000002', 'hash', 0, 'suspended', new Date().toISOString());
    initial.db.exec(`CREATE TABLE merchant_identity_verifications (shop_id INTEGER PRIMARY KEY, document_ciphertext TEXT);
      INSERT INTO merchant_identity_verifications VALUES (1, 'legacy-sensitive-data');
      DELETE FROM didit_schema_migrations WHERE name = 'replace_legacy_kyc_with_didit'`);
    initial.db.close();

    const migrated = await loadDatabaseModule('didit-migration-first-run');
    const shops = migrated.db.prepare('SELECT id, merchant_verification_status, publication_status FROM shops ORDER BY id').all() as {
      id: number;
      merchant_verification_status: string;
      publication_status: string;
    }[];
    assert.deepEqual(shops, [
      { id: 1, merchant_verification_status: 'pending', publication_status: 'draft' },
      { id: 2, merchant_verification_status: 'pending', publication_status: 'suspended' },
    ]);
    assert.equal(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'merchant_identity_verifications'").get(), undefined);
    migrated.db.prepare("UPDATE shops SET merchant_verification_status = 'verified', publication_status = 'active' WHERE id = 1").run();
    migrated.db.close();

    const restarted = await loadDatabaseModule('didit-migration-second-run');
    const activeShop = restarted.db.prepare('SELECT merchant_verification_status, publication_status FROM shops WHERE id = 1').get();
    assert.deepEqual(activeShop, { merchant_verification_status: 'verified', publication_status: 'active' });
    restarted.db.close();
  } finally {
    if (previousDbPath === undefined) delete process.env.MATABLE_DB_PATH;
    else process.env.MATABLE_DB_PATH = previousDbPath;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${dbPath}${suffix}`, { force: true })));
  }
});
