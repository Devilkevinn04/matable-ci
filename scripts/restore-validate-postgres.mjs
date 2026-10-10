import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildPgRestoreArgs,
  buildPsqlArgs,
  makeChildEnvironment,
  parseDatabaseInspection,
  parsePostgresUrl,
  sameDatabase,
} from './postgres-ops.mjs';

const inspectionQuery = `
SELECT current_database(),
       COALESCE(inet_server_addr()::text, ''),
       COALESCE(inet_server_port()::text, ''),
       ((SELECT count(*)
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname NOT LIKE 'pg_toast%'
            AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
        + (SELECT count(*)
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname NOT LIKE 'pg_toast%')
        + (SELECT count(*)
             FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname NOT LIKE 'pg_toast%'
              AND t.typtype IN ('c', 'd', 'e', 'r'))
        + (SELECT count(*)
             FROM pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public')
              AND nspname NOT LIKE 'pg_%'))
`;
const publicObjectCountQuery = `
SELECT
  (SELECT count(*)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f'))
  + (SELECT count(*)
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public')
  + (SELECT count(*)
       FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typtype IN ('c', 'd', 'e', 'r'))
`;
const coreTableCountQuery = `
SELECT 'analytics_events', count(*) FROM analytics_events
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'shops', count(*) FROM shops
UNION ALL SELECT 'shop_boosts', count(*) FROM shop_boosts
UNION ALL SELECT 'subscription_payment_intents', count(*) FROM subscription_payment_intents
ORDER BY 1
`;
const coreTableNames = [
  'analytics_events',
  'orders',
  'products',
  'shops',
  'shop_boosts',
  'subscription_payment_intents',
];

function runTool(command, args, env) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) {
    const code = result.error?.code ?? result.status ?? 'unknown';
    let details = result.stderr?.trim() ?? '';
    if (env.PGPASSWORD) details = details.split(env.PGPASSWORD).join('[redacted]');
    details = details.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[redacted]@').slice(-1200);
    throw new Error(`${command} failed (exit code ${code})${details ? `: ${details}` : '.'}`);
  }
  return result.stdout;
}

function parseTableCounts(output) {
  const counts = new Map();
  for (const line of output.trim().split('\n')) {
    const [table, count] = line.trim().split('|');
    if (!coreTableNames.includes(table) || !/^\d+$/.test(count ?? '')) {
      throw new Error('Could not validate restored PostgreSQL table counts.');
    }
    counts.set(table, Number(count));
  }
  if (counts.size !== coreTableNames.length) {
    throw new Error('PostgreSQL table-count validation returned an incomplete result.');
  }
  return counts;
}

function parseObjectCount(output) {
  const value = output.trim();
  if (!/^\d+$/.test(value)) throw new Error('Could not validate the target public schema state.');
  return Number(value);
}

function parseArguments(args, targetUrlFromEnvironment) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--confirm-disposable') {
      if (options.confirmDisposable) throw new Error('Duplicate --confirm-disposable flag.');
      options.confirmDisposable = true;
    } else if (argument === '--dump' || argument === '--target-url') {
      if (options[argument] || !args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(`A value is required after ${argument}.`);
      }
      options[argument] = args[index + 1];
      index += 1;
    } else if (argument === '--preflight-only') {
      if (options.preflightOnly) throw new Error('Duplicate --preflight-only flag.');
      options.preflightOnly = true;
    } else {
      throw new Error('Usage: npm run db:restore:validate -- --dump <file> --target-url <disposable-url> --confirm-disposable [--preflight-only]');
    }
  }
  if (!options['--dump'] || !(options['--target-url'] || targetUrlFromEnvironment) || !options.confirmDisposable) {
    throw new Error('A dump, explicit disposable target URL, and --confirm-disposable are all required.');
  }
  return {
    dumpPath: path.resolve(options['--dump']),
    targetUrl: options['--target-url'] ?? targetUrlFromEnvironment,
    preflightOnly: Boolean(options.preflightOnly),
  };
}

async function verifyChecksum(dumpPath) {
  const checksumFile = `${dumpPath}.sha256`;
  const checksumContents = await fs.readFile(checksumFile, 'utf8');
  const match = checksumContents.match(/^([a-f0-9]{64})  (.+)\n?$/i);
  if (!match || match[2] !== path.basename(dumpPath)) {
    throw new Error('The backup checksum file is missing or invalid.');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(dumpPath)) hash.update(chunk);
  if (hash.digest('hex') !== match[1].toLowerCase()) {
    throw new Error('The backup checksum does not match the dump.');
  }
}

export async function validatePostgresRestore({
  sourceUrl,
  targetUrl,
  dumpPath,
  confirmedDisposable,
  preflightOnly = false,
  run = runTool,
}) {
  if (!confirmedDisposable) throw new Error('Restore validation requires explicit disposable-target confirmation.');
  if (!sourceUrl) throw new Error('DATABASE_URL is required to protect the production source.');
  if (!targetUrl) throw new Error('An explicit disposable target PostgreSQL URL is required.');

  const source = parsePostgresUrl(sourceUrl);
  const target = parsePostgresUrl(targetUrl);
  if (sameDatabase(source.identity, target.identity)) {
    throw new Error('Refusing restore validation because source and target identify the same database.');
  }

  const archiveStat = await fs.stat(dumpPath);
  if (!archiveStat.isFile() || archiveStat.size === 0) {
    throw new Error('The backup archive must be a non-empty file.');
  }
  await verifyChecksum(dumpPath);

  const sourceState = parseDatabaseInspection(
    run('psql', buildPsqlArgs(inspectionQuery), makeChildEnvironment(source.pgEnv)),
  );
  const targetEnvironment = makeChildEnvironment(target.pgEnv);
  const targetState = parseDatabaseInspection(run('psql', buildPsqlArgs(inspectionQuery), targetEnvironment));
  if (
    sourceState.database === targetState.database
    && sourceState.port === targetState.port
    && sourceState.address
    && sourceState.address === targetState.address
  ) {
    throw new Error('Refusing restore validation because source and target resolve to the same database.');
  }
  const targetPublicObjectCount = parseObjectCount(
    run('psql', buildPsqlArgs(publicObjectCountQuery), targetEnvironment),
  );
  if (targetPublicObjectCount !== 0) {
    throw new Error(`Refusing restore: target public schema is not empty (${targetPublicObjectCount} existing objects).`);
  }
  run('pg_restore', ['--no-password', '--list', dumpPath], targetEnvironment);
  const sourceTableCounts = parseTableCounts(
    run('psql', buildPsqlArgs(coreTableCountQuery), makeChildEnvironment(source.pgEnv)),
  );
  if (preflightOnly) {
    return {
      database: targetState.database,
      objectCount: targetState.objectCount,
      tableCounts: Object.fromEntries(sourceTableCounts),
      preflightOnly: true,
    };
  }

  run('pg_restore', buildPgRestoreArgs(dumpPath, 'public', target.pgEnv.PGDATABASE), targetEnvironment);
  const restored = parseDatabaseInspection(run('psql', buildPsqlArgs(inspectionQuery), targetEnvironment));
  if (restored.objectCount === 0) throw new Error('Restore completed but no database objects were found.');
  const restoredTableCounts = parseTableCounts(
    run('psql', buildPsqlArgs(coreTableCountQuery), targetEnvironment),
  );
  for (const table of coreTableNames) {
    if (sourceTableCounts.get(table) !== restoredTableCounts.get(table)) {
      throw new Error(`Restore validation failed: row count mismatch in ${table}.`);
    }
  }
  return {
    database: restored.database,
    objectCount: restored.objectCount,
    tableCounts: Object.fromEntries(restoredTableCounts),
  };
}

async function main() {
  try {
    const options = parseArguments(
      process.argv.slice(2),
      process.env.RESTORE_TARGET_DATABASE_URL || process.env.TARGET_DATABASE_URL,
    );
    const result = await validatePostgresRestore({
      sourceUrl: process.env.DATABASE_URL || process.env.SOURCE_DATABASE_URL,
      targetUrl: options.targetUrl,
      dumpPath: options.dumpPath,
      confirmedDisposable: true,
      preflightOnly: options.preflightOnly,
    });
    if (result.preflightOnly) {
      console.log(`Preflight succeeded for "${result.database}" (${result.objectCount} existing objects).`);
      console.log(`Source table counts: ${Object.entries(result.tableCounts).map(([table, count]) => `${table}=${count}`).join(', ')}.`);
    } else {
      console.log(`Restore validation succeeded in disposable database "${result.database}" (${result.objectCount} objects).`);
      console.log(`Core table row counts match the source: ${Object.entries(result.tableCounts).map(([table, count]) => `${table}=${count}`).join(', ')}.`);
      console.log('The target has been populated; drop and recreate it before another validation run.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'PostgreSQL restore validation failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
