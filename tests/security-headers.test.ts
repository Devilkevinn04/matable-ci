import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { applySecurityHeaders } from '../server/middleware/securityHeaders.ts';

test('allows Google Fonts through the production content security policy', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

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

    assert.match(policy ?? '', /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(policy ?? '', /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
