import test from 'node:test';
import assert from 'node:assert/strict';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
if (!hasDatabaseUrl && process.env.REQUIRE_POSTGRES_TESTS === '1') {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

test('PostgreSQL migrations and database adapter support parameterized transactional queries', {
  skip: !hasDatabaseUrl,
}, async () => {
  process.env.NODE_ENV = 'production';
  const { closeDatabase, dbGet, dbTransaction, initializeDatabase } = await import('../db.ts');

  try {
    await initializeDatabase();
    const settings = await dbGet<{ id: number }>('SELECT id FROM platform_settings WHERE id = ?', [1]);
    assert.equal(Number(settings?.id), 1);

    const insertedId = await dbTransaction(async (query) => {
      await query.run('CREATE TEMP TABLE matable_pg_adapter_test (id BIGSERIAL PRIMARY KEY, value TEXT NOT NULL)');
      const insert = await query.run(
        'INSERT INTO matable_pg_adapter_test (value) VALUES (?) RETURNING id',
        ['parameter binding works'],
      );
      const row = await query.get<{ value: string }>(
        'SELECT value FROM matable_pg_adapter_test WHERE id = ?',
        [insert.lastInsertRowid],
      );
      assert.equal(row?.value, 'parameter binding works');
      await query.run('DROP TABLE matable_pg_adapter_test');
      return insert.lastInsertRowid;
    });

    assert.ok(Number.isInteger(insertedId) && Number(insertedId) > 0);
  } finally {
    await closeDatabase();
  }
});
