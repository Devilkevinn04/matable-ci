import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireSameOriginJsonRequest } from '../server/middleware/authRequestSecurity.ts';

test('authentication mutations accept same-origin JSON only', async () => {
  const previousAppUrl = process.env.APP_URL;
  const app = express();
  app.use(express.json());
  app.post('/auth', requireSameOriginJsonRequest, (_request, response) => response.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  process.env.APP_URL = origin;

  try {
    const formRequest = await fetch(`${origin}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'key=value',
    });
    assert.equal(formRequest.status, 415);

    const crossOriginRequest = await fetch(`${origin}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify({ key: 'value' }),
    });
    assert.equal(crossOriginRequest.status, 403);

    const sameOriginRequest = await fetch(`${origin}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ key: 'value' }),
    });
    assert.equal(sameOriginRequest.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});
