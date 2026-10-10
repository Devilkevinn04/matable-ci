import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildPgDumpArgs, makeChildEnvironment, parsePostgresUrl } from './postgres-ops.mjs';

function runTool(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    const code = result.error?.code ?? result.status ?? 'unknown';
    throw new Error(`${command} failed (exit code ${code}).`);
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

function parseOutputPath(args) {
  if (args.length > 2 || (args.length > 0 && args[0] !== '--output')) {
    throw new Error('Usage: npm run db:backup [--output <file>]');
  }
  if (args.length === 2 && (!args[1] || args[1].startsWith('--'))) {
    throw new Error('A backup output file is required after --output.');
  }
  const defaultName = `matable-postgres-${new Date().toISOString().replaceAll(':', '-')}.dump`;
  return path.resolve(args[1] ?? path.join('backups', defaultName));
}

export async function createPostgresBackup({ connectionString, outputPath, run = runTool }) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const { pgEnv } = parsePostgresUrl(connectionString);
  const absolutePath = path.resolve(outputPath);
  const checksumPath = `${absolutePath}.sha256`;
  const directory = path.dirname(absolutePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  for (const filePath of [absolutePath, checksumPath]) {
    try {
      await fs.access(filePath, constants.F_OK);
      throw new Error(`Refusing to overwrite existing backup output: ${path.basename(filePath)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const partialPath = path.join(directory, `.${path.basename(absolutePath)}.${randomUUID()}.partial`);
  let createdPartial = false;
  let linkedArchive = false;
  let createdChecksum = false;
  try {
    const handle = await fs.open(partialPath, 'wx', 0o600);
    createdPartial = true;
    await handle.close();
    run('pg_dump', buildPgDumpArgs(partialPath), makeChildEnvironment(pgEnv));
    const stat = await fs.stat(partialPath);
    if (!stat.isFile() || stat.size === 0) throw new Error('pg_dump produced an empty backup.');
    run('pg_restore', ['--list', partialPath], makeChildEnvironment(pgEnv));

    const digest = await sha256(partialPath);
    await fs.link(partialPath, absolutePath);
    linkedArchive = true;
    const checksumHandle = await fs.open(checksumPath, 'wx', 0o600);
    createdChecksum = true;
    try {
      await checksumHandle.writeFile(`${digest}  ${path.basename(absolutePath)}\n`, 'utf8');
    } finally {
      await checksumHandle.close();
    }
    await fs.unlink(partialPath);
    return { outputPath: absolutePath, checksumPath, digest };
  } catch (error) {
    if (createdPartial) await fs.unlink(partialPath).catch(() => {});
    if (linkedArchive) {
      await fs.unlink(absolutePath).catch(() => {});
      if (createdChecksum) await fs.unlink(checksumPath).catch(() => {});
    }
    throw error;
  }
}

async function main() {
  try {
    const outputPath = parseOutputPath(process.argv.slice(2));
    const result = await createPostgresBackup({
      connectionString: process.env.DATABASE_URL,
      outputPath,
    });
    console.log(`PostgreSQL backup created: ${path.relative(process.cwd(), result.outputPath)}`);
    console.log(`SHA-256: ${result.digest}`);
    console.log('Store the dump and checksum in independently managed durable storage.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'PostgreSQL backup failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
