import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { applySecurityHeaders } from '../server/middleware/securityHeaders.ts';

test('allows Google Fonts through the production content security policy', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const storageEnvironment = [
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_BASE_URL',
    'R2_PRIVATE_ENDPOINT',
    'R2_PRIVATE_BUCKET',
    'R2_PRIVATE_ACCESS_KEY_ID',
    'R2_PRIVATE_SECRET_ACCESS_KEY',
  ];
  const previousStorageEnvironment = new Map(storageEnvironment.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = 'production';
  process.env.R2_ENDPOINT = 'https://public-storage.example.test/account';
  process.env.R2_BUCKET = 'public-media';
  process.env.R2_ACCESS_KEY_ID = 'public-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'public-secret-key';
  process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example.test';
  process.env.R2_PRIVATE_ENDPOINT = 'https://private-storage.example.test/account';
  process.env.R2_PRIVATE_BUCKET = 'private-documents';
  process.env.R2_PRIVATE_ACCESS_KEY_ID = 'private-access-key';
  process.env.R2_PRIVATE_SECRET_ACCESS_KEY = 'private-secret-key';

  const app = express();
  applySecurityHeaders(app);
  app.get('/health', (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const policy = response.headers.get('content-security-policy');
    const directives = new Map((policy ?? '').split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }));
    const scriptSources = directives.get('script-src');

    assert.equal(directives.get('object-src')?.join(' '), "'none'");
    assert.ok(scriptSources);
    assert.ok(scriptSources.includes("'self'"));
    assert.ok(!scriptSources.some((source) => ["'unsafe-inline'", 'data:', 'https:', 'https://*'].includes(source)));
    assert.match(policy ?? '', /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(policy ?? '', /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    assert.deepEqual(directives.get('connect-src'), [
      "'self'",
      'https://public-storage.example.test',
      'https://private-storage.example.test',
    ]);
    assert.doesNotMatch(policy ?? '', /kadev\.ci|paystack\.co/);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    for (const [key, value] of previousStorageEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('excludes non-HTTPS storage endpoints from the production content security policy', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEndpoint = process.env.R2_ENDPOINT;
  const previousPrivateEndpoint = process.env.R2_PRIVATE_ENDPOINT;
  process.env.NODE_ENV = 'production';
  process.env.R2_ENDPOINT = 'http://storage.example.test';
  process.env.R2_PRIVATE_ENDPOINT = 'https://user:password@private-storage.example.test';

  const app = express();
  applySecurityHeaders(app);
  app.get('/health', (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const policy = response.headers.get('content-security-policy');
    const connectDirective = policy?.split(';').find((directive) => directive.trim().startsWith('connect-src'));
    assert.equal(connectDirective?.trim(), "connect-src 'self'");
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousEndpoint === undefined) delete process.env.R2_ENDPOINT;
    else process.env.R2_ENDPOINT = previousEndpoint;
    if (previousPrivateEndpoint === undefined) delete process.env.R2_PRIVATE_ENDPOINT;
    else process.env.R2_PRIVATE_ENDPOINT = previousPrivateEndpoint;
  }
});
