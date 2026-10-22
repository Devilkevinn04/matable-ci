import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildPgDumpArgs,
  buildPgRestoreArgs,
  parseDatabaseInspection,
  parsePostgresUrl,
  sameDatabase,
} from '../scripts/postgres-ops.mjs';
import { createPostgresBackup } from '../scripts/backup-postgres.mjs';
import { validatePostgresRestore } from '../scripts/restore-validate-postgres.mjs';

test('PostgreSQL operation helpers keep credentials out of command arguments', () => {
  const parsed = parsePostgresUrl('postgresql://user%40name:p%40ss@db.example:5544/shop?sslmode=require');
  assert.deepEqual(parsed.identity, { host: 'db.example', port: '5544', database: 'shop' });
  assert.equal(parsed.pgEnv.PGUSER, 'user@name');
  assert.equal(parsed.pgEnv.PGPASSWORD, 'p@ss');
  assert.equal(parsed.pgEnv.PGSSLMODE, 'require');
  assert.deepEqual(buildPgDumpArgs('/private/path.dump'), [
    '--no-password',
    '--format=custom',
    '--file=/private/path.dump',
  ]);
  assert.deepEqual(buildPgRestoreArgs('/private/path.dump'), [
    '--no-password',
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    '/private/path.dump',
  ]);
  assert.deepEqual(buildPgRestoreArgs('/private/path.dump', 'public'), [
    '--no-password',
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '/private/path.dump',
  ]);
  assert.deepEqual(buildPgRestoreArgs('/private/path.dump', 'public', 'postgres'), [
    '--no-password',
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--dbname=postgres',
    '/private/path.dump',
  ]);
  assert.equal(JSON.stringify(buildPgDumpArgs('/private/path.dump')).includes('p@ss'), false);
});

test('PostgreSQL URL and inspection validation rejects unsafe inputs', () => {
  assert.throws(() => parsePostgresUrl('https://db.example/shop'), /PostgreSQL protocol/);
  assert.throws(() => parsePostgresUrl('postgres://db.example'), /host and database/);
  assert.throws(() => parsePostgresUrl('postgres://db.example/shop?unexpected=1'), /Unsupported/);
  assert.equal(
    sameDatabase(
      parsePostgresUrl('postgres://user:secret@db.example/shop').identity,
      parsePostgresUrl('postgresql://other:other-secret@DB.EXAMPLE:5432/shop').identity,
    ),
    true,
  );
  assert.throws(() => parseDatabaseInspection('not-valid'), /Could not validate/);
});

test('every versioned SQL migration is registered with the PostgreSQL migration runner', async () => {
  const migrationDirectory = path.resolve('migrations');
  const migrationFiles = (await fs.readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.slice(0, -'.sql'.length))
    .sort();
  const migrationRunner = await fs.readFile(path.resolve('scripts/migrate-neon.ts'), 'utf8');
  const registeredMigrations = [...migrationRunner.matchAll(/^\s*'(\d{3}_[^']+)',?$/gm)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(registeredMigrations, migrationFiles);
});

test('backup output is validated, checksummed, and never overwrites existing files', async (t) => {
  const directory = path.resolve('tests', `.postgres-ops-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'backup.dump');
  const sourceUrl = 'postgres://source:credential@source.example/production?sslmode=require';
  const calls: string[][] = [];
  const run = (command: string, args: string[], env: NodeJS.ProcessEnv) => {
    calls.push([command, ...args]);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(args.join(' ').includes('credential'), false);
    if (command === 'pg_dump') {
      const fileArg = args.find((arg) => arg.startsWith('--file='));
      assert.ok(fileArg);
      writeFileSync(fileArg!.slice('--file='.length), 'custom archive contents');
    }
  };

  const backup = await createPostgresBackup({ connectionString: sourceUrl, outputPath, run });
  const bytes = await fs.readFile(outputPath);
  assert.equal(backup.digest, createHash('sha256').update(bytes).digest('hex'));
  assert.match(await fs.readFile(backup.checksumPath, 'utf8'), new RegExp(`^${backup.digest}  backup\\.dump\\n$`));
  assert.deepEqual(calls.map((call) => call[0]), ['pg_dump', 'pg_restore']);

  await assert.rejects(
    createPostgresBackup({ connectionString: sourceUrl, outputPath, run }),
    /Refusing to overwrite/,
  );
  assert.equal((await fs.readFile(outputPath)).toString(), 'custom archive contents');
});

test('restore validation blocks same-source and non-empty public schemas before restore', async (t) => {
  const directory = path.resolve('tests', `.postgres-ops-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dumpPath = path.join(directory, 'backup.dump');
  await fs.writeFile(dumpPath, 'archive contents');
  const sourceUrl = 'postgres://source:secret@source.example/production';
  const targetUrl = 'postgres://target:secret@target.example/disposable';
  const checksum = createHash('sha256').update('archive contents').digest('hex');
  await fs.writeFile(`${dumpPath}.sha256`, `${checksum}  backup.dump\n`);
  let restoreCalls = 0;
  let psqlCall = 0;
  const run = (command: string, args: string[]) => {
    if (command === 'pg_restore') restoreCalls += 1;
    if (command !== 'psql') return '';
    psqlCall += 1;
    return psqlCall === 1
      ? 'production|10.0.0.1|5432|4\n'
      : psqlCall === 2
        ? 'disposable|10.0.0.2|5432|211\n'
        : psqlCall === 3 ? '2\n' : '';
  };

  await assert.rejects(
    validatePostgresRestore({
      sourceUrl,
      targetUrl: 'postgres://different-user:other@SOURCE.EXAMPLE:5432/production',
      dumpPath,
      confirmedDisposable: true,
      run,
    }),
    /same database/,
  );
  await assert.rejects(
    validatePostgresRestore({ sourceUrl, targetUrl, dumpPath, confirmedDisposable: true, run }),
    /target public schema is not empty/,
  );
  assert.equal(restoreCalls, 0);
});

test('restore validation checks the checksum and restores only into an empty disposable target', async (t) => {
  const directory = path.resolve('tests', `.postgres-ops-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dumpPath = path.join(directory, 'backup.dump');
  await fs.writeFile(dumpPath, 'archive contents');
  const checksum = createHash('sha256').update('archive contents').digest('hex');
  await fs.writeFile(`${dumpPath}.sha256`, `${checksum}  backup.dump\n`);
  const seenCommands: string[] = [];
  let psqlCall = 0;
  const result = await validatePostgresRestore({
    sourceUrl: 'postgres://source:secret@source.example/production',
    targetUrl: 'postgres://target:secret@target.example/disposable',
    dumpPath,
    confirmedDisposable: true,
    run: (command, _args, env) => {
      seenCommands.push(command);
      assert.equal(env.DATABASE_URL, undefined);
      if (command === 'pg_restore') return '';
      psqlCall += 1;
      return psqlCall === 1
        ? 'production|10.0.0.1|5432|4\n'
        : psqlCall === 2
          ? 'disposable|10.0.0.2|5432|211\n'
          : psqlCall === 3
            ? '0\n'
            : psqlCall === 4
              ? 'analytics_events|12\norders|4\nproducts|9\nshops|2\nshop_boosts|0\nsubscription_payment_intents|1\n'
              : psqlCall === 5
                ? 'disposable|10.0.0.2|5432|4\n'
                : 'analytics_events|12\norders|4\nproducts|9\nshops|2\nshop_boosts|0\nsubscription_payment_intents|1\n';
    },
  });
  assert.deepEqual(result, {
    database: 'disposable',
    objectCount: 4,
    tableCounts: {
      analytics_events: 12,
      orders: 4,
      products: 9,
      shops: 2,
      shop_boosts: 0,
      subscription_payment_intents: 1,
    },
  });
  assert.deepEqual(seenCommands, ['psql', 'psql', 'psql', 'pg_restore', 'psql', 'pg_restore', 'psql', 'psql']);

  await fs.writeFile(dumpPath, 'tampered');
  await assert.rejects(
    validatePostgresRestore({
      sourceUrl: 'postgres://source:secret@source.example/production',
      targetUrl: 'postgres://target:secret@target.example/disposable',
      dumpPath,
      confirmedDisposable: true,
      run: () => {
        throw new Error('Must not invoke database tools before checksum verification.');
      },
    }),
    /checksum does not match/,
  );
});

test('restore preflight validates source and target without restoring', async (t) => {
  const directory = path.resolve('tests', `.postgres-ops-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dumpPath = path.join(directory, 'backup.dump');
  await fs.writeFile(dumpPath, 'archive contents');
  const checksum = createHash('sha256').update('archive contents').digest('hex');
  await fs.writeFile(`${dumpPath}.sha256`, `${checksum}  backup.dump\n`);
  const commands: Array<{ command: string; args: string[] }> = [];
  let psqlCall = 0;
  const result = await validatePostgresRestore({
    sourceUrl: 'postgres://user:pass@source.example/production',
    targetUrl: 'postgres://user:pass@target.example/disposable',
    dumpPath,
    confirmedDisposable: true,
    preflightOnly: true,
    run: (command, args) => {
      commands.push({ command, args });
      if (command === 'pg_restore') return '';
      psqlCall += 1;
      if (psqlCall === 1) return 'production|10.0.0.1|5432|4\n';
      if (psqlCall === 2) return 'disposable|10.0.0.2|5432|211\n';
      if (psqlCall === 3) return '0\n';
      return 'analytics_events|12\norders|4\nproducts|9\nshops|2\nshop_boosts|0\nsubscription_payment_intents|1\n';
    },
  });

  assert.deepEqual(result, {
    database: 'disposable',
    objectCount: 211,
    tableCounts: {
      analytics_events: 12,
      orders: 4,
      products: 9,
      shops: 2,
      shop_boosts: 0,
      subscription_payment_intents: 1,
    },
    preflightOnly: true,
  });
  assert.equal(commands.filter(({ command }) => command === 'pg_restore').length, 1);
  assert.ok(commands.find(({ command }) => command === 'pg_restore')?.args.includes('--list'));
});
