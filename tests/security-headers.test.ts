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
    const directives = new Map((policy ?? '').split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }));
    const scriptSources = directives.get('script-src');

    assert.equal(directives.get('object-src')?.join(' '), "'none'");
    assert.ok(scriptSources);
    assert.ok(scriptSources.includes("'self'"));
    assert.ok(scriptSources.includes('https://pay.kadev.ci'));
    assert.ok(!scriptSources.some((source) => ["'unsafe-inline'", 'data:', 'https:', 'https://*'].includes(source)));
    assert.match(policy ?? '', /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(policy ?? '', /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    assert.match(policy ?? '', /connect-src[^;]*https:\/\/pay\.kadev\.ci/);
    assert.match(policy ?? '', /frame-src[^;]*https:\/\/pay\.kadev\.ci/);
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
