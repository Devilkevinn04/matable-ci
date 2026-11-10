import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  console.error('DATABASE_URL must use the PostgreSQL protocol.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
let client: pg.PoolClient | undefined;
let migrationVersions: string[] = [];

try {
  const migrationFiles = (await fs.readdir(path.join(process.cwd(), 'migrations')))
    .filter((file) => /^\d{3}_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();
  migrationVersions = migrationFiles.map((file) => file.slice(0, -4));
  if (migrationVersions.length === 0) throw new Error('No numbered SQL migrations were found.');

  client = await pool.connect();
  await client.query('BEGIN');

  const existingTables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
  `);
  const tableNames = new Set(existingTables.rows.map((row: { table_name: string }) => row.table_name));
  const requiredTables = ['shops', 'products', 'orders', 'merchant_sessions', 'admin_sessions', 'analytics_events'];
  const missingTables = requiredTables.filter((table) => !tableNames.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Expected application tables are missing: ${missingTables.join(', ')}`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const statuses: { migration: string; status: string }[] = [];
  for (const [index, migrationVersion] of migrationVersions.entries()) {
    const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migrationVersion]);
    if (alreadyApplied.rowCount === 0) {
      const migrationSql = await fs.readFile(path.join(process.cwd(), 'migrations', migrationFiles[index]), 'utf8');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migrationVersion]);
      statuses.push({ migration: migrationVersion, status: 'applied' });
    } else {
      statuses.push({ migration: migrationVersion, status: 'already_applied' });
    }
  }

  await client.query('COMMIT');
  console.log(JSON.stringify(statuses));
} catch (error) {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original migration error.
    }
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'MIGRATION_FAILED';
  console.error(JSON.stringify({ migrations: migrationVersions, status: 'failed', errorCode: code }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}