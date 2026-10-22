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
    const pricingColumn = await dbGet<{ data_type: string; is_nullable: string; column_default: string }>(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_settings'
        AND column_name = 'subscription_plan_prices'
    `);
    assert.equal(pricingColumn?.data_type, 'text');
    assert.equal(pricingColumn?.is_nullable, 'NO');
    assert.match(pricingColumn?.column_default ?? '', /standard.*3000.*premium.*5000.*pro.*8000/);
    const featureConfigColumn = await dbGet<{ data_type: string; is_nullable: string; column_default: string }>(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_settings'
        AND column_name = 'subscription_plan_features'
    `);
    assert.equal(featureConfigColumn?.data_type, 'text');
    assert.equal(featureConfigColumn?.is_nullable, 'NO');
    assert.match(featureConfigColumn?.column_default ?? '', /productPhotoLimit.*6.*analyticsDayLimit.*90/);

    const adminRoleColumn = await dbGet<{ data_type: string; is_nullable: string; column_default: string }>(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'admin_sessions' AND column_name = 'role'
    `);
    assert.equal(adminRoleColumn?.data_type, 'text');
    assert.equal(adminRoleColumn?.is_nullable, 'NO');
    assert.match(adminRoleColumn?.column_default ?? '', /super_admin/);

    const settingsConstraint = await dbGet<{ constraint_definition: string }>(`
      SELECT pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'platform_settings'::regclass AND contype = 'c'
    `);
    assert.match(settingsConstraint?.constraint_definition ?? '', /id = 1/);

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
