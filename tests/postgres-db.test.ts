import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
if (!hasDatabaseUrl && process.env.REQUIRE_POSTGRES_TESTS === '1') {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

test('PostgreSQL migrations and database adapter support parameterized transactional queries', {
  skip: !hasDatabaseUrl,
}, async () => {
  process.env.NODE_ENV = 'production';
  const { closeDatabase, dbAll, dbGet, dbRun, dbTransaction, initializeDatabase } = await import('../db.ts');

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

    const analyticsColumns = await dbAll<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events'
        AND column_name IN ('audience', 'entity_type', 'entity_id', 'device', 'locale', 'metadata')
      ORDER BY column_name
    `);
    assert.deepEqual(
      analyticsColumns.map((column) => column.column_name),
      ['audience', 'device', 'entity_id', 'entity_type', 'locale', 'metadata'],
    );

    const analyticsBackfills = await dbAll<{ name: string }>(`
      SELECT name
      FROM didit_schema_migrations
      WHERE name IN ('ambassador_link_click_events_v1', 'analytics_intelligence_v1', 'analytics_intelligence_v2')
      ORDER BY name
    `);
    assert.deepEqual(
      analyticsBackfills.map((row) => row.name),
      ['ambassador_link_click_events_v1', 'analytics_intelligence_v1', 'analytics_intelligence_v2'],
    );

    const ambassadorId = randomUUID();
    const tokenHash = `test-${randomUUID()}`;
    const clickAt = new Date().toISOString();
    try {
      await dbRun(
        'INSERT INTO ambassadors (id, name, code, created_at) VALUES (?, ?, ?, ?)',
        [ambassadorId, 'Migration test', `T${randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase()}`, clickAt],
      );
      await dbRun(
        'INSERT INTO ambassador_clicks (token_hash, ambassador_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [tokenHash, ambassadorId, clickAt, new Date(Date.now() + 60_000).toISOString()],
      );
      await dbRun('DELETE FROM didit_schema_migrations WHERE name = ?', ['ambassador_link_click_events_v1']);
      await initializeDatabase();
      const backfilledEvent = await dbGet<{ ambassador_id: string; created_at: string }>(
        'SELECT ambassador_id, created_at FROM ambassador_link_click_events WHERE event_id = ?',
        [tokenHash],
      );
      assert.deepEqual(backfilledEvent, { ambassador_id: ambassadorId, created_at: clickAt });
      const clickEventsMigration = await fs.readFile(
        path.resolve('migrations/054_ambassador_link_click_events.sql'),
        'utf8',
      );
      const migrationStatements = clickEventsMigration.split(';').map((statement) => statement.trim()).filter(Boolean);
      for (const statement of migrationStatements) await dbRun(statement);
      for (const statement of migrationStatements) await dbRun(statement);
      const event = await dbGet<{ ambassador_id: string; created_at: string }>(
        'SELECT ambassador_id, created_at FROM ambassador_link_click_events WHERE event_id = ?',
        [tokenHash],
      );
      assert.deepEqual(event, { ambassador_id: ambassadorId, created_at: clickAt });
      const eventColumns = await dbAll<{ column_name: string }>(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ambassador_link_click_events'
        ORDER BY ordinal_position
      `);
      assert.deepEqual(eventColumns.map(({ column_name }) => column_name), ['event_id', 'ambassador_id', 'created_at']);
    } finally {
      await dbRun('DELETE FROM ambassador_clicks WHERE token_hash = ?', [tokenHash]);
      await dbRun('DELETE FROM ambassadors WHERE id = ?', [ambassadorId]);
    }

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
