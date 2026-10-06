import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run the PostgreSQL integration tests.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/postgres-db.test.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', REQUIRE_POSTGRES_TESTS: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error('Unable to start PostgreSQL integration tests:', result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
