import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function getForwardedHeaders(headers, remoteAddress) {
  const connectionHeaders = String(headers.connection || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const excluded = new Set([...hopByHopHeaders, ...connectionHeaders, 'host']);
  const forwarded = Object.fromEntries(
    Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())),
  );

  if (!forwarded['x-forwarded-for'] && remoteAddress) {
    forwarded['x-forwarded-for'] = remoteAddress;
  }

  const suppliedRequestId = headers['x-request-id'];
  const requestId = typeof suppliedRequestId === 'string' && suppliedRequestId.length <= 128
    ? suppliedRequestId
    : randomUUID();
  forwarded['x-request-id'] = requestId;

  return { headers: forwarded, requestId };
}

function getResponseHeaders(headers) {
  const connectionHeaders = String(headers.connection || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const excluded = new Set([...hopByHopHeaders, ...connectionHeaders]);

  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())),
  );
}

function parseTarget(target) {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LEGACY_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment.');
  }
  return url;
}

export function createGatewayServer({ legacyBaseUrl, upstreamTimeoutMs = 120_000 }) {
  const target = parseTarget(legacyBaseUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/health' || request.url === '/healthz')) {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ service: 'api-gateway', status: 'ok' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      const readinessRequest = transport.request(target, { method: 'GET' }, (upstreamResponse) => {
        upstreamResponse.resume();
        const ready = upstreamResponse.statusCode >= 200 && upstreamResponse.statusCode < 400;
        response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          service: 'api-gateway',
          status: ready ? 'ready' : 'not_ready',
          legacyStatus: upstreamResponse.statusCode,
        }));
      });
      readinessRequest.setTimeout(Math.min(upstreamTimeoutMs, 5_000), () => readinessRequest.destroy());
      readinessRequest.on('error', () => {
        if (response.headersSent) return;
        response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ service: 'api-gateway', status: 'not_ready' }));
      });
      readinessRequest.end();
      return;
    }

    const { headers, requestId } = getForwardedHeaders(request.headers, request.socket.remoteAddress);
    response.setHeader('x-request-id', requestId);

    let upstreamUrl;
    try {
      upstreamUrl = new URL(request.url || '/', target);
      if (upstreamUrl.origin !== target.origin) {
        response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ success: false, error: { code: 'INVALID_PATH', message: 'Chemin de requête invalide.' } }));
        return;
      }
    } catch {
      response.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ success: false, error: { code: 'INVALID_PATH', message: 'Chemin de requête invalide.' } }));
      return;
    }

    const upstreamRequest = transport.request(upstreamUrl, {
      method: request.method,
      headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, getResponseHeaders(upstreamResponse.headers));
      upstreamResponse.pipe(response);
    });

    upstreamRequest.setTimeout(upstreamTimeoutMs, () => {
      const timeoutError = new Error('Legacy service request timed out.');
      timeoutError.code = 'ETIMEDOUT';
      upstreamRequest.destroy(timeoutError);
    });

    upstreamRequest.on('error', (error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const status = error.code === 'ETIMEDOUT' ? 504 : 502;
      const code = error.code === 'ETIMEDOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        success: false,
        error: {
          code,
          message: error.code === 'ETIMEDOUT' ? 'Le service met trop de temps à répondre.' : 'Service indisponible.',
        },
      }));
    });

    request.on('aborted', () => upstreamRequest.destroy());
    response.on('close', () => {
      if (!response.writableEnded) upstreamRequest.destroy();
    });
    request.pipe(upstreamRequest);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4000);
  const timeout = Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000);
  const legacyBaseUrl = process.env.LEGACY_BASE_URL || 'http://127.0.0.1:3000';

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!Number.isInteger(timeout) || timeout < 1) {
    throw new Error('UPSTREAM_TIMEOUT_MS must be a positive integer.');
  }

  const server = createGatewayServer({ legacyBaseUrl, upstreamTimeoutMs: timeout });
  server.listen(port, '0.0.0.0', () => {
    process.stdout.write(`${JSON.stringify({ level: 'info', message: 'gateway_started', port, legacyBaseUrl })}\n`);
  });
}
