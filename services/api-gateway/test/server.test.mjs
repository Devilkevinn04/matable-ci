import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createGatewayServer } from '../src/server.mjs';

async function start(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.close();
  await once(server, 'close');
}

test('proxies API paths, query strings, headers, and JSON bodies unchanged', async () => {
  const legacy = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(201, {
        'content-type': 'application/json',
        'set-cookie': ['session=opaque; HttpOnly', 'csrf=opaque'],
        connection: 'keep-alive',
      });
      response.end(JSON.stringify({
        method: request.method,
        url: request.url,
        requestId: request.headers['x-request-id'],
        authorization: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      }));
    });
  });
  const legacyUrl = await start(legacy);
  const gateway = createGatewayServer({ legacyBaseUrl: legacyUrl });
  const gatewayUrl = await start(gateway);

  try {
    const result = await fetch(`${gatewayUrl}/api/shops/7?view=public`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sample-token',
        'x-request-id': 'request-123',
      },
      body: JSON.stringify({ enabled: true }),
    });
    const body = await result.json();

    assert.equal(result.status, 201);
    assert.equal(body.method, 'POST');
    assert.equal(body.url, '/api/shops/7?view=public');
    assert.equal(body.requestId, 'request-123');
    assert.equal(body.authorization, 'Bearer sample-token');
    assert.equal(body.body, '{"enabled":true}');
    assert.equal(result.headers.get('x-request-id'), 'request-123');
    assert.deepEqual(result.headers.getSetCookie(), ['session=opaque; HttpOnly', 'csrf=opaque']);
    assert.notEqual(result.headers.get('connection'), 'close');
  } finally {
    await Promise.all([close(gateway), close(legacy)]);
  }
});

test('keeps the gateway health check local', async () => {
  let legacyRequests = 0;
  const legacy = http.createServer((_request, response) => {
    legacyRequests += 1;
    response.writeHead(200).end('legacy');
  });
  const gateway = createGatewayServer({ legacyBaseUrl: await start(legacy) });
  const gatewayUrl = await start(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: 'api-gateway', status: 'ok' });
    assert.equal(legacyRequests, 0);
  } finally {
    await Promise.all([close(gateway), close(legacy)]);
  }
});

test('reports readiness only when the legacy application responds successfully', async () => {
  const legacy = http.createServer((_request, response) => response.writeHead(200).end('ok'));
  const gateway = createGatewayServer({ legacyBaseUrl: await start(legacy) });
  const gatewayUrl = await start(gateway);

  try {
    const response = await fetch(`${gatewayUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: 'api-gateway',
      status: 'ready',
      legacyStatus: 200,
    });
  } finally {
    await Promise.all([close(gateway), close(legacy)]);
  }
});

test('returns a clear 502 response when the legacy service is unavailable', async () => {
  const upstream = http.createServer();
  const upstreamUrl = await start(upstream);
  await close(upstream);
  const gateway = createGatewayServer({ legacyBaseUrl: upstreamUrl });
  const gatewayUrl = await start(gateway);

  try {
    const readiness = await fetch(`${gatewayUrl}/ready`);
    assert.equal(readiness.status, 503);
    assert.equal((await readiness.json()).status, 'not_ready');

    const response = await fetch(`${gatewayUrl}/api/shops`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Service indisponible.' },
    });
  } finally {
    await close(gateway);
  }
});

test('rejects upstream targets with a path or credentials', () => {
  assert.throws(() => createGatewayServer({ legacyBaseUrl: 'http://user:pass@example.test' }));
  assert.throws(() => createGatewayServer({ legacyBaseUrl: 'http://example.test/internal' }));
});
