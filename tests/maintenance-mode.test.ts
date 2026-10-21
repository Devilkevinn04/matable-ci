import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenanceModeMiddleware, isMaintenanceExemptRequest } from '../server/middleware/maintenanceMode.ts';

test('keeps super-admin, health checks, webhooks and admin assets available during maintenance', () => {
  for (const path of [
    '/admin',
    '/admin/shops',
    '/api/admin/maintenance',
    '/api/auth/admin-login',
    '/api/auth/admin-logout',
    '/api/auth/session',
    '/api/health',
    '/api/webhooks/geniuspay',
    '/assets/admin.js',
  ]) {
    assert.equal(isMaintenanceExemptRequest({ path, method: 'GET' }), true, path);
  }
});

test('blocks public pages and customer or merchant APIs during maintenance', () => {
  for (const path of ['/', '/aya-chic', '/api/shops/1', '/api/auth/customer-login', '/api/analytics/page-view']) {
    assert.equal(isMaintenanceExemptRequest({ path, method: 'GET' }), false, path);
  }
});

test('returns a private 503 maintenance page and escapes its configured message', async () => {
  let responseStatus = 0;
  let responseBody = '';
  let responseHeaders: Record<string, string> = {};
  const response = {
    set(headers: Record<string, string>) { responseHeaders = headers; return this; },
    status(status: number) { responseStatus = status; return this; },
    type() { return this; },
    send(body: string) { responseBody = body; return this; },
  } as any;
  const middleware = createMaintenanceModeMiddleware(async () => ({ enabled: true, message: '<script>alert(1)</script>' }), '<p>__MAINTENANCE_MESSAGE__</p>');

  await middleware({ path: '/', method: 'GET' } as any, response, () => undefined);

  assert.equal(responseStatus, 503);
  assert.match(responseBody, /&lt;script&gt;/);
  assert.equal(responseHeaders['Cache-Control'], 'no-store');
  assert.equal(responseHeaders['Retry-After'], '300');
});