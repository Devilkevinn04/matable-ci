import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const migrationOnlyTables = new Set([
  'schema_migrations',
  'merchant_verifications',
  'merchant_verification_webhook_events',
  'merchant_identity_verifications',
]);
const migrationOnlyIndexes = new Set([
  'idx_merchant_verifications_status',
  'idx_merchant_identity_verifications_status',
]);

function splitTableColumns(definition: string) {
  const columns: string[] = [];
  let token = '';
  let depth = 0;
  let quote: string | undefined;

  for (let index = 0; index <= definition.length; index += 1) {
    const character = definition[index] ?? ',';
    if (quote) {
      token += character;
      if (character === quote) {
        if (definition[index + 1] === quote) {
          token += definition[index + 1];
          index += 1;
        } else {
          quote = undefined;
        }
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      token += character;
    } else if (character === '(') {
      depth += 1;
      token += character;
    } else if (character === ')') {
      depth -= 1;
      token += character;
    } else if (character === ',' && depth === 0) {
      const name = token.trim().match(/^([a-z_][\w]*)\b/i)?.[1];
      if (name && !/^(primary|unique|check|foreign|constraint)$/i.test(name)) columns.push(name);
      token = '';
    } else {
      token += character;
    }
  }

  return columns;
}

function collectPostgresSchema(statements: string[]) {
  const tables = new Map<string, Set<string>>();
  const indexes = new Set<string>();

  for (const statement of statements) {
    for (const match of statement.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_][\w]*)\s*\(/gi)) {
      const start = match.index! + match[0].length;
      let depth = 1;
      let quote: string | undefined;
      let end = start;

      for (; end < statement.length && depth > 0; end += 1) {
        const character = statement[end];
        if (quote) {
          if (character === quote) {
            if (statement[end + 1] === quote) end += 1;
            else quote = undefined;
          }
        } else if (character === "'" || character === '"') {
          quote = character;
        } else if (character === '(') {
          depth += 1;
        } else if (character === ')') {
          depth -= 1;
        }
      }

      const table = match[1];
      const columns = splitTableColumns(statement.slice(start, end - 1));
      const existing = tables.get(table) ?? new Set<string>();
      columns.forEach((column) => existing.add(column));
      tables.set(table, existing);
    }

    for (const match of statement.matchAll(/ALTER TABLE\s+([a-z_][\w]*)\s+ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z_][\w]*)/gi)) {
      const columns = tables.get(match[1]) ?? new Set<string>();
      columns.add(match[2]);
      tables.set(match[1], columns);
    }

    for (const match of statement.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z_][\w]*)/gi)) {
      indexes.add(match[1]);
    }
  }

  migrationOnlyTables.forEach((table) => tables.delete(table));
  migrationOnlyIndexes.forEach((index) => indexes.delete(index));
  return { tables, indexes };
}

test('SQLite and PostgreSQL bootstraps expose the same current tables, columns, and indexes', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabasePath = process.env.MATABLE_DB_PATH;
  const testDatabaseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-schema-parity-'));
  process.env.NODE_ENV = 'test';
  process.env.MATABLE_DB_PATH = path.join(testDatabaseDirectory, 'schema.db');

  let database: typeof import('../db.ts') | undefined;
  try {
    database = await import('../db.ts');
    const adminSessionsCreate = database.postgresMigrations.findIndex((statement) =>
      /CREATE TABLE IF NOT EXISTS admin_sessions\b/i.test(statement));
    const adminSessionsRoleMigration = database.postgresMigrations.findIndex((statement) =>
      /ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS role\b/i.test(statement));
    assert.ok(adminSessionsCreate >= 0);
    assert.ok(adminSessionsRoleMigration > adminSessionsCreate);

    const migrationFiles = (await fs.readdir(path.resolve('migrations')))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const statements = [
      ...database.postgresMigrations,
      ...(await Promise.all(migrationFiles.map((file) => fs.readFile(path.resolve('migrations', file), 'utf8')))),
    ];
    const postgres = collectPostgresSchema(statements);
    const sqliteTables = database.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[];
    const sqliteSchema = new Map(sqliteTables.map(({ name }) => [
      name,
      new Set((database!.db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((column) => column.name)),
    ]));
    const sqliteIndexes = new Set((database.db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
    ).all() as { name: string }[]).map(({ name }) => name));

    const allTableNames = new Set([...sqliteSchema.keys(), ...postgres.tables.keys()]);
    const columnDifferences = [...allTableNames].sort().flatMap((table) => {
      const sqliteColumns = sqliteSchema.get(table) ?? new Set<string>();
      const postgresColumns = postgres.tables.get(table) ?? new Set<string>();
      const onlySqlite = [...sqliteColumns].filter((column) => !postgresColumns.has(column)).sort();
      const onlyPostgres = [...postgresColumns].filter((column) => !sqliteColumns.has(column)).sort();
      return onlySqlite.length || onlyPostgres.length
        ? [{ table, onlySqlite, onlyPostgres }]
        : [];
    });
    const indexDifferences = {
      onlySqlite: [...sqliteIndexes].filter((index) => !postgres.indexes.has(index)).sort(),
      onlyPostgres: [...postgres.indexes].filter((index) => !sqliteIndexes.has(index)).sort(),
    };

    assert.deepEqual(columnDifferences, []);
    assert.deepEqual(indexDifferences, { onlySqlite: [], onlyPostgres: [] });
  } finally {
    await database?.closeDatabase();
    await fs.rm(testDatabaseDirectory, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabasePath === undefined) delete process.env.MATABLE_DB_PATH;
    else process.env.MATABLE_DB_PATH = previousDatabasePath;
  }
});
