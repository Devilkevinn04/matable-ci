import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const commonEnvironment = {
  NODE_ENV: 'production',
  APP_URL: 'https://matable-ci.com',
  DATABASE_URL: 'postgresql://readiness-test.invalid/matable',
  ADMIN_ACCESS_KEY: 'test-admin-key-that-is-at-least-32-chars',
  VERIFICATION_ADMIN_ACCESS_KEY: 'test-verification-key-at-least-32-chars',
  AGE_VERIFICATION_SECRET: 'test-age-verification-secret-at-least-32-chars',
  DIDIT_API_KEY: '',
  DIDIT_WORKFLOW_ID: '',
  DIDIT_WEBHOOK_SECRET: '',
  GENIUSPAY_API_KEY: '',
  GENIUSPAY_API_SECRET: '',
  GENIUSPAY_WEBHOOK_SECRET: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  VAPID_SUBJECT: '',
  ADVERTISING_BETA_ENABLED: 'false',
  R2_PRIVATE_BUCKET: '',
  R2_PRIVATE_ACCESS_KEY_ID: '',
  R2_PRIVATE_SECRET_ACCESS_KEY: '',
  R2_PRIVATE_ENDPOINT: '',
  R2_ENDPOINT: '',
  R2_BUCKET: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  R2_PUBLIC_BASE_URL: '',
  CLOUDFLARE_R2_BUCKET: '',
  CLOUDFLARE_R2_ENDPOINT: '',
  AWS_S3_BUCKET: '',
  AWS_S3_ENDPOINT: '',
  AWS_ENDPOINT_URL_S3: '',
  S3_BUCKET: '',
};

function runReadinessCheck(overrides: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    ['scripts/check-production-readiness.mjs', '--skip-database'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...commonEnvironment, ...overrides },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test('production readiness rejects missing private verification storage', () => {
  const result = runReadinessCheck({});
  assert.match(result.output, /Stockage privé des justificatifs : aucune variable configurée/);
  assert.match(result.output, /Stockage privé des justificatifs : endpoint R2 absent/);
  assert.notEqual(result.status, 0);
});

test('production readiness requires a strong age-verification signing secret', () => {
  const missingSecret = runReadinessCheck({ AGE_VERIFICATION_SECRET: '' });
  assert.match(missingSecret.output, /AGE_VERIFICATION_SECRET est obligatoire/);
  assert.notEqual(missingSecret.status, 0);

  const weakSecret = runReadinessCheck({ AGE_VERIFICATION_SECRET: 'short' });
  assert.match(weakSecret.output, /AGE_VERIFICATION_SECRET doit contenir au moins 32 caractères/);
  assert.notEqual(weakSecret.status, 0);
});

test('production readiness rejects reusing the public media bucket for identity documents', () => {
  const result = runReadinessCheck({
    R2_PRIVATE_BUCKET: 'matable-public',
    R2_PRIVATE_ACCESS_KEY_ID: 'private-test-key',
    R2_PRIVATE_SECRET_ACCESS_KEY: 'private-test-secret',
    R2_PRIVATE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_BUCKET: 'matable-public',
    R2_ACCESS_KEY_ID: 'public-test-key',
    R2_SECRET_ACCESS_KEY: 'public-test-secret',
    R2_PUBLIC_BASE_URL: 'https://media.matable-ci.test',
  });
  assert.match(result.output, /Le bucket privé des justificatifs doit être distinct/);
  assert.notEqual(result.status, 0);
});

test('production readiness permits manual verification when Didit is unavailable', () => {
  const result = runReadinessCheck({
    DIDIT_API_KEY: 'configured-but-not-operational',
    R2_PRIVATE_BUCKET: 'matable-private',
    R2_PRIVATE_ACCESS_KEY_ID: 'private-test-key',
    R2_PRIVATE_SECRET_ACCESS_KEY: 'private-test-secret',
    R2_PRIVATE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_BUCKET: 'matable-public',
    R2_ACCESS_KEY_ID: 'public-test-key',
    R2_SECRET_ACCESS_KEY: 'public-test-secret',
    R2_PUBLIC_BASE_URL: 'https://media.matable-ci.test',
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /configuration partielle/);
});
