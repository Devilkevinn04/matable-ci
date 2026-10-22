import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { createAdminRouter } from '../server/routes/admin.ts';

const TEST_PORT = 43123;
const TEST_DB_PATH = path.join(tmpdir(), `matable-test-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const DIDIT_WEBHOOK_SECRET = 'full-flow-didit-webhook-test-secret';
let serverProcess: ReturnType<typeof spawn> | null = null;
let cookieJar = '';

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry until server is ready
    }
    await delay(250);
  }
  throw new Error('Server did not become ready in time.');
}

test('admin router denies requests when role guards are not configured', async () => {
  const app = express();
  app.use('/api/admin', createAdminRouter({
    shops: [],
    products: [],
    orders: [],
    databaseMode: 'sqlite',
    dbAll: async <T,>() => [] as T[],
    dbGet: async <T,>() => undefined as T | undefined,
    dbRun: async () => ({ changes: 0 }),
    dbTransaction: (() => Promise.reject(new Error('Unexpected transaction.'))) as Parameters<typeof createAdminRouter>[0]['dbTransaction'],
    refreshRuntimeDataFromDatabase: async () => undefined,
    persistShop: async () => undefined,
    toSafeShop: (shop) => shop,
    rotateMerchantAccessTokenForShop: async () => '',
    clearMerchantSessionsForShop: () => undefined,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    for (const route of ['/shops', '/payments', '/content-moderation', '/subscription-plan-features']) {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/admin${route}`);
      assert.equal(response.status, 503, `${route} should fail closed`);
      assert.deepEqual(await response.json(), { error: 'Protection administrative non configurée.' });
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('super-admin subscription prices are validated, persisted, audited, and used publicly', async () => {
  const previousCookieJar = cookieJar;
  cookieJar = '';
  const login = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
  });
  assert.equal(login.response.status, 200);
  const superAdminCookies = cookieJar;
  const originalResponse = await apiFetch('/api/admin/subscription-plans');
  assert.equal(originalResponse.response.status, 200, JSON.stringify(originalResponse.payload));
  const originalPrices = originalResponse.payload.prices;
  const updatedPrices = { standard: 3500, premium: 5500, pro: 8500 };
  try {
    cookieJar = '';
    const anonymousRead = await apiFetch('/api/admin/subscription-plans');
    assert.equal(anonymousRead.response.status, 401);
    cookieJar = superAdminCookies;

    const invalidPrices = await apiFetch('/api/admin/subscription-plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prices: { standard: 0, premium: 5000, pro: 8000 },
        expected_prices: originalPrices,
      }),
    });
    assert.equal(invalidPrices.response.status, 400);

    const update = await apiFetch('/api/admin/subscription-plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: updatedPrices, expected_prices: originalPrices }),
    });
    assert.equal(update.response.status, 200, JSON.stringify(update.payload));
    assert.deepEqual(update.payload.previous_prices, originalPrices);
    assert.deepEqual(update.payload.prices, updatedPrices);

    const staleUpdate = await apiFetch('/api/admin/subscription-plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: originalPrices, expected_prices: originalPrices }),
    });
    assert.equal(staleUpdate.response.status, 409);

    const publicPrices = await apiFetch('/api/subscription-plans');
    assert.equal(publicPrices.response.status, 200);
    assert.deepEqual(publicPrices.payload.prices, updatedPrices);
    const publicPlansPage = await fetch(`${BASE_URL}/commercants`, {
      headers: { Accept: 'text/html' },
    });
    assert.equal(publicPlansPage.status, 200);
    const publicPlansHtml = await publicPlansPage.text();
    for (const price of Object.values(updatedPrices)) {
      assert.ok(publicPlansHtml.includes(`"price":${price}`));
    }

    const auditDb = new Database(TEST_DB_PATH, { readonly: true });
    try {
      const audit = auditDb.prepare(`SELECT actor, action, details FROM admin_audit_logs
        WHERE action = 'subscription_plan_prices_updated' ORDER BY id DESC LIMIT 1`)
        .get() as { actor: string; action: string; details: string };
      assert.equal(audit.actor, 'super_admin');
      assert.equal(audit.action, 'subscription_plan_prices_updated');
      assert.deepEqual(JSON.parse(audit.details), {
        previous_standard_price: originalPrices.standard,
        previous_premium_price: originalPrices.premium,
        previous_pro_price: originalPrices.pro,
        standard_price: updatedPrices.standard,
        premium_price: updatedPrices.premium,
        pro_price: updatedPrices.pro,
      });
    } finally {
      auditDb.close();
    }

    cookieJar = '';
    const verificationLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'verification-admin-demo-key', role: 'verification_admin' }),
    });
    assert.equal(verificationLogin.response.status, 200);
    const verificationMutation = await apiFetch('/api/admin/subscription-plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: { standard: 1, premium: 1, pro: 1 } }),
    });
    assert.equal(verificationMutation.response.status, 403);
  } finally {
    cookieJar = superAdminCookies;
    await apiFetch('/api/admin/subscription-plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices: originalPrices, expected_prices: updatedPrices }),
    });
    await apiFetch('/api/auth/admin-logout', { method: 'POST' });
    cookieJar = previousCookieJar;
  }
});

test('super-admin Pro feature changes are validated and deferred to current subscribers renewal', async () => {
  const previousCookieJar = cookieJar;
  cookieJar = '';
  const testDb = new Database(TEST_DB_PATH);
  const expiry = `${new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
  const insertedShop = testDb.prepare(`INSERT INTO shops (
    name, slug, whatsapp_number, pin_code_hash, created_at, category,
    selected_subscription_tier, subscription_tier, subscription_status,
    subscription_expires_at, publication_status
  ) VALUES (?, ?, ?, ?, ?, ?, 'pro', 'pro', 'active', ?, 'active')`)
    .run('Boutique Avantages Pro', `avantages-pro-${randomUUID()}`, uniquePhone(),
      'test-pin-hash', new Date().toISOString(), 'food', expiry);
  const shopId = Number(insertedShop.lastInsertRowid);
  testDb.close();

  try {
    const adminLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookies = cookieJar;
    const original = await apiFetch('/api/admin/subscription-plan-features');
    assert.equal(original.response.status, 200);
    const originalFeatures = original.payload.pro_features;
    const updatedFeatures = {
      productLimit: 120,
      productPhotoLimit: 8,
      analyticsDayLimit: 180,
      boostDiscountPercent: 20,
    };

    cookieJar = '';
    const anonymousRead = await apiFetch('/api/admin/subscription-plan-features');
    assert.equal(anonymousRead.response.status, 401);
    cookieJar = adminCookies;
    const invalid = await apiFetch('/api/admin/subscription-plan-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro_features: { ...updatedFeatures, productPhotoLimit: 21 },
        expected_pro_features: originalFeatures,
      }),
    });
    assert.equal(invalid.response.status, 400);

    const update = await apiFetch('/api/admin/subscription-plan-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_features: updatedFeatures, expected_pro_features: originalFeatures }),
    });
    assert.equal(update.response.status, 200, JSON.stringify(update.payload));
    assert.deepEqual(update.payload.pro_features, updatedFeatures);

    const nextFeatures = { ...updatedFeatures, productPhotoLimit: 9 };
    const secondUpdate = await apiFetch('/api/admin/subscription-plan-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_features: nextFeatures, expected_pro_features: updatedFeatures }),
    });
    assert.equal(secondUpdate.response.status, 200, JSON.stringify(secondUpdate.payload));

    const staleUpdate = await apiFetch('/api/admin/subscription-plan-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_features: originalFeatures, expected_pro_features: originalFeatures }),
    });
    assert.equal(staleUpdate.response.status, 409);

    const persistedDb = new Database(TEST_DB_PATH, { readonly: true });
    try {
      const snapshot = persistedDb.prepare(`SELECT subscription_features_snapshot,
        subscription_features_effective_at FROM shops WHERE id = ?`)
        .get(shopId) as { subscription_features_snapshot: string; subscription_features_effective_at: string };
      assert.deepEqual(JSON.parse(snapshot.subscription_features_snapshot), originalFeatures);
      assert.equal(snapshot.subscription_features_effective_at, expiry);
      const audit = persistedDb.prepare(`SELECT action FROM admin_audit_logs
        WHERE action = 'subscription_plan_features_updated' ORDER BY id DESC LIMIT 1`).get() as { action: string };
      assert.equal(audit.action, 'subscription_plan_features_updated');
    } finally {
      persistedDb.close();
    }
    const publicPlans = await apiFetch('/api/subscription-plans');
    assert.deepEqual(publicPlans.payload.pro_features, nextFeatures);

    cookieJar = '';
    const verificationLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'verification-admin-demo-key', role: 'verification_admin' }),
    });
    assert.equal(verificationLogin.response.status, 200);
    const verificationMutation = await apiFetch('/api/admin/subscription-plan-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pro_features: originalFeatures, expected_pro_features: updatedFeatures }),
    });
    assert.equal(verificationMutation.response.status, 403);
  } finally {
    cookieJar = '';
    await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
    });
    const current = await apiFetch('/api/admin/subscription-plan-features');
    if (current.response.ok) {
      await apiFetch('/api/admin/subscription-plan-features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pro_features: current.payload.pro_features,
          expected_pro_features: current.payload.pro_features,
        }),
      });
    }
    await apiFetch('/api/auth/admin-logout', { method: 'POST' });
    const cleanupDb = new Database(TEST_DB_PATH);
    cleanupDb.prepare('DELETE FROM shops WHERE id = ?').run(shopId);
    cleanupDb.close();
    cookieJar = previousCookieJar;
  }
});

test('super-admin schedules subscription tier changes through expiry and can cancel them', async () => {
  const previousCookieJar = cookieJar;
  cookieJar = '';
  const testDb = new Database(TEST_DB_PATH);
  const insertedShop = testDb.prepare(`INSERT INTO shops (
    name, slug, whatsapp_number, pin_code_hash, created_at, category,
    selected_subscription_tier, subscription_tier, subscription_status,
    publication_status
  ) VALUES (?, ?, ?, ?, ?, ?, 'premium', 'premium', 'active', 'active')`)
    .run('Boutique Changement Formule', `changement-formule-${randomUUID()}`, uniquePhone(),
      'test-pin-hash', new Date().toISOString(), 'food');
  const shopId = Number(insertedShop.lastInsertRowid);
  const currentExpiry = `${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
  testDb.prepare(`UPDATE shops
    SET selected_subscription_tier = 'premium', subscription_status = 'active',
      trial_start = NULL, trial_end = NULL, subscription_expires_at = ?
    WHERE id = ?`).run(currentExpiry, shopId);
  testDb.close();

  try {
    const adminLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
    });
    assert.equal(adminLogin.response.status, 200);
    const adminCookies = cookieJar;
    const route = `/api/admin/subscriptions/${shopId}/schedule-plan`;
    const basePayload = {
      expected_tier: 'premium',
      expected_pending_tier: null,
      expected_subscription_expires_at: currentExpiry,
    };

    const missingReason = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, next_tier: 'pro', reason: 'short' }),
    });
    assert.equal(missingReason.response.status, 400);

    cookieJar = '';
    const verificationLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'verification-admin-demo-key', role: 'verification_admin' }),
    });
    assert.equal(verificationLogin.response.status, 200);
    const forbiddenMutation = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, next_tier: 'pro', reason: 'Changement demandé par le marchand' }),
    });
    assert.equal(forbiddenMutation.response.status, 403);
    cookieJar = adminCookies;

    const scheduled = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, next_tier: 'pro', reason: 'Changement demandé par le marchand' }),
    });
    assert.equal(scheduled.response.status, 200, JSON.stringify(scheduled.payload));
    assert.equal(scheduled.payload.pending_subscription_tier, 'pro');
    assert.equal(scheduled.payload.pending_subscription_effective_at, currentExpiry);

    const staleSchedule = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, next_tier: 'standard', reason: 'Changement de formule demandé' }),
    });
    assert.equal(staleSchedule.response.status, 409);

    const correctedExpiry = `${new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
    const expiryCorrection = await apiFetch(`/api/admin/subscriptions/${shopId}/set-expiry`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expiry_date: correctedExpiry.slice(0, 10),
        expected_subscription_expires_at: currentExpiry,
        reason: 'Correction de la date de renouvellement',
      }),
    });
    assert.equal(expiryCorrection.response.status, 200, JSON.stringify(expiryCorrection.payload));
    const persistedDb = new Database(TEST_DB_PATH, { readonly: true });
    const savedSchedule = persistedDb.prepare(`SELECT subscription_expires_at,
      pending_subscription_tier, pending_subscription_effective_at
      FROM shops WHERE id = ?`).get(shopId) as {
        subscription_expires_at: string;
        pending_subscription_tier: string | null;
        pending_subscription_effective_at: string | null;
      };
    persistedDb.close();
    assert.equal(savedSchedule.subscription_expires_at, correctedExpiry);
    assert.equal(savedSchedule.pending_subscription_tier, 'pro');
    assert.equal(savedSchedule.pending_subscription_effective_at, correctedExpiry);

    const expiredScheduleDb = new Database(TEST_DB_PATH);
    expiredScheduleDb.prepare('UPDATE shops SET pending_subscription_effective_at = ? WHERE id = ?')
      .run(new Date(Date.now() - 86400000).toISOString(), shopId);
    expiredScheduleDb.close();
    const subscriptionList = await apiFetch('/api/admin/subscriptions');
    assert.equal(subscriptionList.response.status, 200);
    const listedShop = subscriptionList.payload.shops.find((item: { id: number }) => item.id === shopId);
    assert.equal(listedShop.plan, 'pro');
    assert.equal(listedShop.pending_subscription_tier, null);

    const nextChange = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_tier: 'pro',
        expected_pending_tier: null,
        expected_subscription_expires_at: correctedExpiry,
        next_tier: 'standard',
        reason: 'Nouvelle formule demandée par le marchand',
      }),
    });
    assert.equal(nextChange.response.status, 200, JSON.stringify(nextChange.payload));

    const cancelled = await apiFetch(route, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_tier: 'pro',
        expected_pending_tier: 'standard',
        expected_subscription_expires_at: correctedExpiry,
        next_tier: null,
        reason: 'Annulation demandée par le marchand',
      }),
    });
    assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.payload));
    assert.equal(cancelled.payload.pending_subscription_tier, null);
    assert.equal(cancelled.payload.pending_subscription_effective_at, null);

    const auditDb = new Database(TEST_DB_PATH, { readonly: true });
    const audit = auditDb.prepare(`SELECT action, details FROM admin_audit_logs
      WHERE shop_id = ? AND action IN ('subscription_plan_change_scheduled', 'subscription_plan_change_cancelled')
      ORDER BY id`).all(shopId) as Array<{ action: string; details: string }>;
    auditDb.close();
    assert.deepEqual(audit.map(({ action }) => action), [
      'subscription_plan_change_scheduled',
      'subscription_plan_change_scheduled',
      'subscription_plan_change_cancelled',
    ]);
    assert.equal(JSON.parse(audit[0].details).effective_at, currentExpiry);
    assert.equal(JSON.parse(audit[2].details).reason, 'Annulation demandée par le marchand');
  } finally {
    cookieJar = previousCookieJar;
  }
});

test('super-admin schedules subscription cancellation and manages reversible access suspension', async () => {
  const previousCookieJar = cookieJar;
  cookieJar = '';
  const testDb = new Database(TEST_DB_PATH);
  const insertedShop = testDb.prepare(`INSERT INTO shops (
    name, slug, whatsapp_number, pin_code_hash, created_at, category,
    selected_subscription_tier, subscription_tier, subscription_status,
    publication_status, is_active
  ) VALUES (?, ?, ?, ?, ?, ?, 'premium', 'premium', 'active', 'active', 1)`)
    .run('Boutique Cycle de Vie', `cycle-vie-${randomUUID()}`, uniquePhone(),
      'test-pin-hash', new Date().toISOString(), 'food');
  const shopId = Number(insertedShop.lastInsertRowid);
  const currentExpiry = `${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
  testDb.prepare('UPDATE shops SET subscription_expires_at = ? WHERE id = ?').run(currentExpiry, shopId);
  testDb.close();

  try {
    const adminLogin = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
    });
    assert.equal(adminLogin.response.status, 200);
    const basePath = `/api/admin/subscriptions/${shopId}/lifecycle`;
    const basePayload = {
      expected_status: 'active',
      expected_subscription_expires_at: currentExpiry,
      expected_cancellation_at: null,
    };

    const cancellation = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...basePayload,
        action: 'cancel_at_period_end',
        reason: 'Résiliation demandée par le marchand',
      }),
    });
    assert.equal(cancellation.response.status, 200, JSON.stringify(cancellation.payload));
    assert.equal(cancellation.payload.subscription_cancel_at, currentExpiry);

    const canceledCheckoutState = await apiFetch('/api/admin/subscriptions');
    assert.equal(canceledCheckoutState.response.status, 200);
    const cancellationRow = canceledCheckoutState.payload.shops.find((item: { id: number }) => item.id === shopId);
    assert.equal(cancellationRow.status, 'active');
    assert.equal(cancellationRow.subscription_cancel_at, currentExpiry);

    const correctedExpiry = `${new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
    const corrected = await apiFetch(`/api/admin/subscriptions/${shopId}/set-expiry`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expiry_date: correctedExpiry.slice(0, 10),
        expected_subscription_expires_at: currentExpiry,
        reason: 'Prolongation confirmée avec justificatif',
      }),
    });
    assert.equal(corrected.response.status, 200, JSON.stringify(corrected.payload));
    const correctedRow = await apiFetch('/api/admin/subscriptions');
    const updatedShop = correctedRow.payload.shops.find((item: { id: number }) => item.id === shopId);
    assert.equal(updatedShop.subscription_cancel_at, correctedExpiry);

    const undo = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'active',
        expected_subscription_expires_at: correctedExpiry,
        expected_cancellation_at: correctedExpiry,
        action: 'undo_cancellation',
        reason: 'Le marchand souhaite conserver son abonnement',
      }),
    });
    assert.equal(undo.response.status, 200, JSON.stringify(undo.payload));
    assert.equal(undo.payload.subscription_cancel_at, null);

    const testDbForPayment = new Database(TEST_DB_PATH);
    testDbForPayment.prepare(`INSERT INTO subscription_payment_intents (
      id, shop_id, payment_type, tier, subscription_term, amount, currency, status, created_at
    ) VALUES (?, ?, 'subscription', 'premium', 'monthly', 5000, 'XOF', 'pending', ?)`)
      .run(randomUUID(), shopId, new Date().toISOString());
    testDbForPayment.close();
    const paymentConflict = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'active',
        expected_subscription_expires_at: correctedExpiry,
        expected_cancellation_at: null,
        action: 'suspend',
        reason: 'Suspension administrative vérifiée',
      }),
    });
    assert.equal(paymentConflict.response.status, 409);

    const cleanupIntentDb = new Database(TEST_DB_PATH);
    cleanupIntentDb.prepare('DELETE FROM subscription_payment_intents WHERE shop_id = ? AND status = ?')
      .run(shopId, 'pending');
    cleanupIntentDb.close();
    const suspension = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'active',
        expected_subscription_expires_at: correctedExpiry,
        expected_cancellation_at: null,
        action: 'suspend',
        reason: 'Suspension administrative vérifiée',
      }),
    });
    assert.equal(suspension.response.status, 200, JSON.stringify(suspension.payload));
    assert.equal(suspension.payload.subscription_status, 'suspended');
    const suspendedDb = new Database(TEST_DB_PATH, { readonly: true });
    const suspendedShop = suspendedDb.prepare(`SELECT is_active, subscription_admin_suspended_at,
      subscription_admin_suspended_status, subscription_expires_at FROM shops WHERE id = ?`)
      .get(shopId) as {
        is_active: number;
        subscription_admin_suspended_at: string | null;
        subscription_admin_suspended_status: string | null;
        subscription_expires_at: string;
      };
    suspendedDb.close();
    assert.equal(suspendedShop.is_active, 1);
    assert.ok(suspendedShop.subscription_admin_suspended_at);
    assert.equal(suspendedShop.subscription_admin_suspended_status, 'active');

    const reactivated = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'suspended',
        expected_subscription_expires_at: correctedExpiry,
        expected_cancellation_at: null,
        action: 'reactivate',
        reason: 'Réactivation validée par le support',
      }),
    });
    assert.equal(reactivated.response.status, 200, JSON.stringify(reactivated.payload));
    assert.equal(reactivated.payload.subscription_status, 'active');
    assert.equal(reactivated.payload.subscription_admin_suspended_at, null);

    const secondSuspension = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'active',
        expected_subscription_expires_at: correctedExpiry,
        expected_cancellation_at: null,
        action: 'suspend',
        reason: 'Suspension avant contrôle de fin',
      }),
    });
    assert.equal(secondSuspension.response.status, 200);
    const expireForTestDb = new Database(TEST_DB_PATH);
    const pastExpiry = `${new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)}T23:59:59.999Z`;
    expireForTestDb.prepare('UPDATE shops SET subscription_expires_at = ? WHERE id = ?').run(pastExpiry, shopId);
    expireForTestDb.close();
    const expiredReactivation = await apiFetch(basePath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expected_status: 'suspended',
        expected_subscription_expires_at: pastExpiry,
        expected_cancellation_at: null,
        action: 'reactivate',
        reason: 'Demande de réactivation après expiration',
      }),
    });
    assert.equal(expiredReactivation.response.status, 409);
    assert.match(expiredReactivation.payload.error, /nouveau paiement/);

    const auditDb = new Database(TEST_DB_PATH, { readonly: true });
    const actions = auditDb.prepare(`SELECT action FROM admin_audit_logs WHERE shop_id = ?
      AND action LIKE 'subscription_%' ORDER BY id`).all(shopId) as Array<{ action: string }>;
    auditDb.close();
    assert.deepEqual(actions.map(({ action }) => action), [
      'subscription_cancellation_scheduled',
      'subscription_expiry_corrected',
      'subscription_cancellation_revoked',
      'subscription_access_suspended',
      'subscription_access_reactivated',
      'subscription_access_suspended',
    ]);
    const history = await apiFetch('/api/admin/audit-logs?search=subscription_cancellation_scheduled&limit=10');
    assert.equal(history.response.status, 200);
    const cancellationHistory = history.payload.audit_logs.find((entry: { shop_id: number; action: string }) =>
      entry.shop_id === shopId && entry.action === 'subscription_cancellation_scheduled');
    assert.equal(cancellationHistory.details.cancellation_at, currentExpiry);
    assert.equal(cancellationHistory.details.reason, 'Résiliation demandée par le marchand');
  } finally {
    cookieJar = previousCookieJar;
  }
});

function updateCookieJar(headers: Headers) {
  const rawSetCookie = headers.get('set-cookie');
  const setCookieValues = rawSetCookie
    ? rawSetCookie.split(/,(?=[^;,]+=[^;]+(?:;|$))/g)
    : headers.getSetCookie?.() ?? [];

  if (setCookieValues.length === 0) return;

  const nextCookies = new Map<string, string>();
  for (const entry of cookieJar.split('; ').map((piece) => piece.trim()).filter(Boolean)) {
    const [name, ...rest] = entry.split('=');
    if (name && rest.length) nextCookies.set(name, rest.join('='));
  }

  for (const cookie of setCookieValues) {
    const [nameValue] = cookie.split(';');
    if (!nameValue) continue;
    const idx = nameValue.indexOf('=');
    if (idx <= 0) continue;
    const name = nameValue.slice(0, idx).trim();
    const value = nameValue.slice(idx + 1).trim();
    if (
      name === 'matable_session' ||
      name === 'matable_admin_session' ||
      name === 'matable_session_fp' ||
      name === 'matable_customer_session' ||
      name === 'matable_customer_session_fp'
    ) {
      nextCookies.set(name, value);
    }
  }

  cookieJar = Array.from(nextCookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (cookieJar) {
    headers.set('Cookie', cookieJar);
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
  });
  updateCookieJar(response.headers);

  const text = await response.text();
  let payload: any = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return { response, payload };
}

function uniquePhone() {
  const random = String(Date.now() + Math.floor(Math.random() * 100000)).slice(-8);
  return `+22507${random}`.slice(0, 15);
}

function uniqueEmail() {
  return `merchant-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function registerCustomer(firstName = 'Client', lastName = 'Test') {
  const registered = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      phone: uniquePhone(),
      email: `client-${Date.now()}-${Math.random().toString(36).slice(2)}@example.ci`,
      password: 'MotDePasse!123',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(registered.response.status, 200, JSON.stringify(registered.payload));
  return registered.payload.user;
}

before(async () => {
  cookieJar = '';
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'super-admin-demo-key',
      VERIFICATION_ADMIN_ACCESS_KEY: 'verification-admin-demo-key',
      DIDIT_WEBHOOK_SECRET,
      GOOGLE_OAUTH_CLIENT_ID: '',
      GOOGLE_OAUTH_CLIENT_SECRET: '',
      APPLE_SERVICE_ID: '',
      APPLE_TEAM_ID: '',
      APPLE_KEY_ID: '',
      APPLE_PRIVATE_KEY: '',
      VAPID_PUBLIC_KEY: 'A'.repeat(87),
      VAPID_PRIVATE_KEY: 'B'.repeat(43),
      VAPID_SUBJECT: 'mailto:assistance@matable.ci',
      NODE_ENV: 'test',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: BASE_URL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));

  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const serverExit = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await serverExit;
  }
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

test('home page and direct merchant plan preview load successfully', async () => {
  const home = await apiFetch('/');
  assert.equal(home.response.status, 200);
  assert.match(home.response.headers.get('content-type') || '', /text\/html/);

  const plansPreview = await apiFetch('/__preview/merchant-plans');
  assert.equal(plansPreview.response.status, 200);
  assert.match(plansPreview.response.headers.get('content-type') || '', /text\/html/);
});

test('verification admin is limited to identity follow-up and content moderation', async () => {
  const verificationLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'verification-admin-demo-key', role: 'verification_admin' }),
  });
  assert.equal(verificationLogin.response.status, 200, JSON.stringify(verificationLogin.payload));
  assert.equal(verificationLogin.payload.role, 'verification_admin');

  const session = await apiFetch('/api/auth/session');
  assert.equal(session.payload.role, 'verification_admin');

  const identityQueue = await apiFetch('/api/admin/identity-verifications');
  assert.equal(identityQueue.response.status, 200, JSON.stringify(identityQueue.payload));
  const forbiddenAuditLog = await apiFetch('/api/admin/audit-logs');
  assert.equal(forbiddenAuditLog.response.status, 403, JSON.stringify(forbiddenAuditLog.payload));

  const verificationReminder = await apiFetch('/api/admin/shops/999999/notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'identity_verification' }),
  });
  assert.equal(verificationReminder.response.status, 404, JSON.stringify(verificationReminder.payload));

  for (const path of ['/api/admin/shops', '/api/admin/orders', '/api/admin/customers', '/api/admin/analytics?days=7', '/api/admin/health']) {
    const forbidden = await apiFetch(path);
    assert.equal(forbidden.response.status, 403, `${path}: ${JSON.stringify(forbidden.payload)}`);
  }
  const forbiddenOrderUpdate = await apiFetch('/api/shops/1/orders/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(forbiddenOrderUpdate.response.status, 403, JSON.stringify(forbiddenOrderUpdate.payload));

  const generalNotification = await apiFetch('/api/admin/shops/1/notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'welcome' }),
  });
  assert.equal(generalNotification.response.status, 403, JSON.stringify(generalNotification.payload));

  const shopToggle = await apiFetch('/api/admin/shops/1/toggle-active', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Test de droits vérification' }),
  });
  assert.equal(shopToggle.response.status, 403, JSON.stringify(shopToggle.payload));

  const forbiddenSubscriptionReminder = await apiFetch('/api/admin/shops/1/notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'trial_expiring' }),
  });
  assert.equal(forbiddenSubscriptionReminder.response.status, 403, JSON.stringify(forbiddenSubscriptionReminder.payload));

  const moderationQueue = await apiFetch('/api/admin/content-moderation');
  assert.equal(moderationQueue.response.status, 200, JSON.stringify(moderationQueue.payload));

  const verificationShopList = await apiFetch('/api/admin/shops/verification-readonly');
  assert.equal(verificationShopList.response.status, 200, JSON.stringify(verificationShopList.payload));
  assert.ok(Array.isArray(verificationShopList.payload));
  if (verificationShopList.payload.length > 0) {
    assert.equal(typeof verificationShopList.payload[0].merchant_verification_status, 'string');
    assert.equal('whatsapp_number' in verificationShopList.payload[0], false);
    assert.equal('owner_email' in verificationShopList.payload[0], false);
  }

  for (const path of ['/api/admin/payments', '/api/admin/subscriptions', '/api/admin/maintenance', '/api/admin/push/status']) {
    const forbidden = await apiFetch(path);
    assert.equal(forbidden.response.status, 403, `${path}: ${JSON.stringify(forbidden.payload)}`);
  }
  for (const [path, method, body] of [
    ['/api/admin/shops/999999', 'DELETE', undefined],
    ['/api/admin/shops/999999/access-link', 'POST', undefined],
    ['/api/admin/maintenance', 'PATCH', { enabled: true, message: 'Not allowed' }],
  ] as const) {
    const forbidden = await apiFetch(path, {
      method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    assert.equal(forbidden.response.status, 403, `${method} ${path}: ${JSON.stringify(forbidden.payload)}`);
  }

  const protectedPush = await apiFetch('/api/admin/push/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Forbidden', body: 'This should be blocked for verification admin', url: '/app' }),
  });
  assert.equal(protectedPush.response.status, 403, JSON.stringify(protectedPush.payload));

  const logout = await apiFetch('/api/auth/admin-logout', { method: 'POST' });
  assert.equal(logout.response.status, 200, JSON.stringify(logout.payload));
});

test('customer registration and login are supported with email, phone, and password', async () => {
  const unique = Date.now();
  const email = `client${unique}@example.com`;
  const phone = `+225070${String(unique).slice(-8)}`;
  const missingConsent = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Sans',
      last_name: 'Consentement',
      phone,
      email,
      password: 'MotDePasse!123',
    }),
  });
  assert.equal(missingConsent.response.status, 400);

  const register = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Client',
      last_name: 'Test',
      phone,
      email,
      password: 'MotDePasse!123',
      accepted_terms_privacy: true,
    }),
  });

  assert.equal(register.response.status, 200, `Unexpected register response: ${JSON.stringify(register.payload)}`);
  assert.equal(register.payload.success, true);
  assert.equal(register.payload.user.email, email);
  assert.equal(register.payload.user.first_name, 'Client');
  assert.equal(register.payload.user.last_name, 'Test');
  const customerExport = await apiFetch('/api/auth/customer-data-export');
  assert.equal(customerExport.response.status, 200);
  assert.equal(customerExport.payload.account_consents.length, 1);
  assert.deepEqual(
    [customerExport.payload.account_consents[0].terms_document, customerExport.payload.account_consents[0].privacy_document],
    ['/cgu', '/confidentialite'],
  );
  assert.ok(Number.isFinite(Date.parse(customerExport.payload.account_consents[0].accepted_at)));

  const session = await apiFetch('/api/auth/customer-session');
  assert.equal(session.response.status, 200, `Unexpected session response: ${JSON.stringify(session.payload)}`);
  assert.equal(session.payload.authenticated, true);
  assert.equal(session.payload.userType, 'customer');

  const genericSession = await apiFetch('/api/auth/session');
  assert.equal(genericSession.response.status, 200, `Unexpected generic session response: ${JSON.stringify(genericSession.payload)}`);
  assert.equal(genericSession.payload.authenticated, true);
  assert.equal(genericSession.payload.userType, 'customer');

  const login = await apiFetch('/api/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'MotDePasse!123',
    }),
  });

  assert.equal(login.response.status, 200, `Unexpected login response: ${JSON.stringify(login.payload)}`);
  assert.equal(login.payload.success, true);
  assert.equal(login.payload.user.email, email);

  const activeSessions = await apiFetch('/api/auth/customer-sessions');
  assert.equal(activeSessions.response.status, 200, JSON.stringify(activeSessions.payload));
  assert.ok(activeSessions.payload.sessions.some((activeSession: any) => activeSession.is_current));
  assert.ok(activeSessions.payload.sessions.length >= 2);
  const customerDataExport = await apiFetch('/api/auth/customer-data-export');
  assert.equal(customerDataExport.response.status, 200);
  assert.equal(customerDataExport.payload.profile.email, email);
  const revokedSessions = await apiFetch('/api/auth/customer-sessions/revoke-others', { method: 'POST' });
  assert.equal(revokedSessions.response.status, 200);
  const remainingSessions = await apiFetch('/api/auth/customer-sessions');
  assert.equal(remainingSessions.payload.sessions.length, 1);
  assert.equal(remainingSessions.payload.sessions[0].is_current, true);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedLogin = await apiFetch('/api/auth/customer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'MotDePasseIncorrect!' }),
    });
    assert.equal(failedLogin.response.status, 401);
    assert.equal(failedLogin.payload.error, 'Identifiants invalides.');
  }

  const lockedLogin = await apiFetch('/api/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'MotDePasse!123' }),
  });
  assert.equal(lockedLogin.response.status, 429);
  assert.ok(Number(lockedLogin.response.headers.get('retry-after')) > 0);

  const testDb = new Database(TEST_DB_PATH);
  try {
    const persistedName = testDb.prepare('SELECT first_name, last_name FROM users WHERE email = ?').get(email) as { first_name: string; last_name: string };
    assert.equal(persistedName.first_name, 'Client');
    assert.equal(persistedName.last_name, 'Test');
    testDb.prepare('UPDATE users SET is_active = 0 WHERE email = ?').run(email);
  } finally {
    testDb.close();
  }
  const disabledCustomerOrders = await apiFetch('/api/auth/customer-orders');
  assert.equal(disabledCustomerOrders.response.status, 401);

  const logout = await apiFetch('/api/auth/customer-logout', { method: 'POST' });
  assert.equal(logout.response.status, 200, `Unexpected logout response: ${JSON.stringify(logout.payload)}`);
  assert.equal(logout.payload.success, true);
});

test('super-admin customer suspension is audited, revokes sessions permanently, and denies verification admins', async () => {
  const customer = await registerCustomer('Compte', 'Administration');
  const customerSessionCookies = cookieJar;
  cookieJar = '';

  const unauthorized = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Test de suspension' }),
  });
  assert.equal(unauthorized.response.status, 401);
  const unauthorizedDetail = await apiFetch(`/api/admin/customers/${customer.id}`);
  assert.equal(unauthorizedDetail.response.status, 401);

  const superAdminLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key', role: 'super_admin' }),
  });
  assert.equal(superAdminLogin.response.status, 200);
  const superAdminCookies = cookieJar;
  const activeCustomers = await apiFetch(`/api/admin/customers?search=${encodeURIComponent(customer.email)}&status=active`);
  assert.equal(activeCustomers.response.status, 200);
  assert.equal(activeCustomers.payload.total, 1);
  assert.equal(activeCustomers.payload.customers[0].id, customer.id);

  const detailDb = new Database(TEST_DB_PATH);
  detailDb.prepare(`INSERT INTO orders (
    shop_id, customer_name, customer_phone, delivery_location, total_amount,
    created_at, status, items, customer_user_id
  ) VALUES (1, ?, ?, 'Abidjan', 12500, ?, 'delivered', ?, ?)`)
    .run('Compte Administration', '+2250700000000', new Date().toISOString(),
      JSON.stringify([{ product_id: 1, quantity: 2, unit_price: 6250 }]), customer.id);
  detailDb.close();
  const customerDetail = await apiFetch(`/api/admin/customers/${customer.id}`);
  assert.equal(customerDetail.response.status, 200, JSON.stringify(customerDetail.payload));
  assert.equal(customerDetail.payload.customer.id, customer.id);
  assert.equal(customerDetail.payload.customer.email, customer.email);
  assert.equal(customerDetail.payload.total_orders, 1);
  assert.equal(customerDetail.payload.orders.length, 1);
  assert.equal(customerDetail.payload.orders[0].total_amount, 12500);
  assert.equal(customerDetail.payload.orders[0].items_count, 2);
  assert.equal('password_hash' in customerDetail.payload.customer, false);
  assert.equal('delivery_location' in customerDetail.payload.orders[0], false);
  assert.equal('items' in customerDetail.payload.orders[0], false);
  const invalidCustomerDetail = await apiFetch('/api/admin/customers/invalid');
  assert.equal(invalidCustomerDetail.response.status, 400);
  const missingCustomerDetail = await apiFetch('/api/admin/customers/2147483647');
  assert.equal(missingCustomerDetail.response.status, 404);

  const invalidCustomerStatus = await apiFetch('/api/admin/customers?status=deleted');
  assert.equal(invalidCustomerStatus.response.status, 400);

  const missingReason = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: '  ' }),
  });
  assert.equal(missingReason.response.status, 400);

  const suspended = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Signalement vérifié par assistance' }),
  });
  assert.equal(suspended.response.status, 200, JSON.stringify(suspended.payload));
  assert.equal(suspended.payload.is_active, false);

  const suspendedCustomers = await apiFetch(`/api/admin/customers?search=${encodeURIComponent(customer.email)}&status=suspended`);
  assert.equal(suspendedCustomers.response.status, 200);
  assert.equal(suspendedCustomers.payload.total, 1);
  assert.equal(suspendedCustomers.payload.customers[0].is_active, false);
  const activeCustomersAfterSuspension = await apiFetch(`/api/admin/customers?search=${encodeURIComponent(customer.email)}&status=active`);
  assert.equal(activeCustomersAfterSuspension.payload.total, 0);

  const testDb = new Database(TEST_DB_PATH);
  try {
    const account = testDb.prepare('SELECT is_active FROM users WHERE id = ?').get(customer.id) as { is_active: number };
    const sessions = testDb.prepare('SELECT COUNT(*) AS count FROM user_sessions WHERE user_id = ?').get(customer.id) as { count: number };
    const audit = testDb.prepare(`SELECT actor, action, details FROM admin_audit_logs
      WHERE action = 'customer_suspended' AND details LIKE ? ORDER BY id DESC LIMIT 1`)
      .get(`%"user_id":${customer.id}%`) as { actor: string; action: string; details: string };
    assert.equal(account.is_active, 0);
    assert.equal(sessions.count, 0);
    assert.equal(audit.actor, 'super_admin');
    assert.equal(audit.action, 'customer_suspended');
    assert.equal(JSON.parse(audit.details).reason, 'Signalement vérifié par assistance');
  } finally {
    testDb.close();
  }

  cookieJar = customerSessionCookies;
  const revokedCustomerSession = await apiFetch('/api/auth/customer-orders');
  assert.equal(revokedCustomerSession.response.status, 401);
  cookieJar = superAdminCookies;

  const staleStatus = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Ancien statut client' }),
  });
  assert.equal(staleStatus.response.status, 409);

  const reactivated = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: false, reason: 'Examen terminé' }),
  });
  assert.equal(reactivated.response.status, 200);
  assert.equal(reactivated.payload.is_active, true);

  const reactivationLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'verification-admin-demo-key', role: 'verification_admin' }),
  });
  assert.equal(reactivationLogin.response.status, 200);
  const forbidden = await apiFetch(`/api/admin/customers/${customer.id}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Non autorisé' }),
  });
  assert.equal(forbidden.response.status, 403);
  const forbiddenDetail = await apiFetch(`/api/admin/customers/${customer.id}`);
  assert.equal(forbiddenDetail.response.status, 403);

  cookieJar = customerSessionCookies;
  const remainsRevoked = await apiFetch('/api/auth/customer-orders');
  assert.equal(remainsRevoked.response.status, 401);
  cookieJar = '';
  await apiFetch('/api/auth/admin-logout', { method: 'POST' });
});

test('customer can update their profile and password while revoking other sessions', async () => {
  const unique = Date.now();
  const email = `profile${unique}@example.com`;
  const initialPassword = 'MotDePasse!123';
  const nextPassword = 'NouveauMotDePasse!456';
  const unauthenticatedProfile = await apiFetch('/api/auth/customer-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Awa', last_name: 'Client', phone: uniquePhone() }),
  });
  assert.equal(unauthenticatedProfile.response.status, 401);
  const unauthenticatedPassword = await apiFetch('/api/auth/customer-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: initialPassword, new_password: nextPassword }),
  });
  assert.equal(unauthenticatedPassword.response.status, 401);

  const register = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Awa', last_name: 'Client', phone: uniquePhone(), email, password: initialPassword, accepted_terms_privacy: true }),
  });
  assert.equal(register.response.status, 200, JSON.stringify(register.payload));
  const earlierSessionCookies = cookieJar;

  const login = await apiFetch('/api/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: initialPassword }),
  });
  assert.equal(login.response.status, 200, JSON.stringify(login.payload));
  const currentSessionCookies = cookieJar;

  const profile = await apiFetch('/api/auth/customer-profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Awa-Mariam', last_name: 'Client', phone: '+2250701234567' }),
  });
  assert.equal(profile.response.status, 200, JSON.stringify(profile.payload));
  assert.equal(profile.payload.user.name, 'Awa-Mariam Client');
  assert.equal(profile.payload.user.phone, '+2250701234567');

  const invalidPasswordChange = await apiFetch('/api/auth/customer-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: 'incorrect', new_password: nextPassword }),
  });
  assert.equal(invalidPasswordChange.response.status, 401);

  const passwordChange = await apiFetch('/api/auth/customer-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: initialPassword, new_password: nextPassword }),
  });
  assert.equal(passwordChange.response.status, 200, JSON.stringify(passwordChange.payload));
  assert.equal(passwordChange.payload.success, true);

  cookieJar = earlierSessionCookies;
  const revokedSession = await apiFetch('/api/auth/customer-session');
  assert.equal(revokedSession.payload.authenticated, false);
  cookieJar = currentSessionCookies;

  const logout = await apiFetch('/api/auth/customer-logout', { method: 'POST' });
  assert.equal(logout.response.status, 200);
  const newPasswordLogin = await apiFetch('/api/auth/customer-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: nextPassword }),
  });
  assert.equal(newPasswordLogin.response.status, 200, JSON.stringify(newPasswordLogin.payload));
  const finalLogout = await apiFetch('/api/auth/customer-logout', { method: 'POST' });
  assert.equal(finalLogout.response.status, 200);
});

test('customer favorites and product likes are private, persistent, and toggleable', async () => {
  cookieJar = '';
  const anonymousState = await apiFetch('/api/customer-engagement/state');
  assert.equal(anonymousState.response.status, 401);

  const email = `engagement${Date.now()}@example.com`;
  const registration = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: 'Aminata',
      last_name: 'Démo',
      phone: uniquePhone(),
      email,
      password: 'MotDePasse!123',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(registration.response.status, 200, JSON.stringify(registration.payload));

  const directory = await apiFetch('/api/v1/catalog/storefronts');
  assert.equal(directory.response.status, 200);
  const shopListing = directory.payload.find((shop: any) => shop.products_count > 0);
  assert.ok(shopListing, 'A public demo shop with products should be available');
  assert.ok(Number.isFinite(Date.parse(shopListing.created_at)), 'Public storefronts should expose their creation date');
  const storefront = await apiFetch(`/api/v1/catalog/storefronts/${encodeURIComponent(shopListing.slug)}`);
  assert.equal(storefront.response.status, 200, JSON.stringify(storefront.payload));
  const product = storefront.payload.products[0];
  assert.ok(product);

  const shopFavorite = await apiFetch('/api/customer-engagement/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: 'shop', target_id: shopListing.id }),
  });
  assert.equal(shopFavorite.response.status, 200, JSON.stringify(shopFavorite.payload));
  assert.equal(shopFavorite.payload.is_favorite, true);

  const productFavorite = await apiFetch('/api/customer-engagement/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: 'product', target_id: product.id }),
  });
  assert.equal(productFavorite.response.status, 200, JSON.stringify(productFavorite.payload));
  assert.equal(productFavorite.payload.is_favorite, true);

  const like = await apiFetch(`/api/customer-engagement/products/${product.id}/like`, { method: 'POST' });
  assert.equal(like.response.status, 200, JSON.stringify(like.payload));
  assert.equal(like.payload.is_liked, true);
  assert.ok(like.payload.like_count >= 1);

  const engagementState = await apiFetch('/api/customer-engagement/state');
  assert.deepEqual(engagementState.payload.favorite_shop_ids, [shopListing.id]);
  assert.deepEqual(engagementState.payload.favorite_product_ids, [product.id]);
  assert.deepEqual(engagementState.payload.liked_product_ids, [product.id]);
  assert.equal(engagementState.payload.shops[0].slug, shopListing.slug);
  assert.equal(engagementState.payload.products[0].title, product.title);

  const publicFeed = await apiFetch('/api/v1/catalog/storefronts/feed?sort=new&limit=48');
  const publicProduct = publicFeed.payload.products.find((item: any) => item.id === product.id);
  assert.ok(publicProduct);
  assert.ok(publicProduct.like_count >= 1);

  const unliked = await apiFetch(`/api/customer-engagement/products/${product.id}/like`, { method: 'POST' });
  assert.equal(unliked.payload.is_liked, false);
  const removedProductFavorite = await apiFetch('/api/customer-engagement/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: 'product', target_id: product.id }),
  });
  assert.equal(removedProductFavorite.payload.is_favorite, false);

  const logout = await apiFetch('/api/auth/customer-logout', { method: 'POST' });
  assert.equal(logout.response.status, 200);
});

test('social login remains unavailable until provider credentials are configured', async () => {
  const providers = await apiFetch('/api/auth/customer-oauth/providers');
  assert.equal(providers.response.status, 200);
  assert.deepEqual(providers.payload, { google: false, apple: false });

  const pending = await apiFetch('/api/auth/customer-oauth/pending');
  assert.deepEqual(pending.payload, { pending: false });

  const unavailableGoogle = await apiFetch('/api/auth/customer-oauth/google/start');
  assert.equal(unavailableGoogle.response.status, 503);

  const unknownProvider = await apiFetch('/api/auth/customer-oauth/unknown/start');
  assert.equal(unknownProvider.response.status, 404);

  const invalidCompletion = await apiFetch('/api/auth/customer-oauth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Client', last_name: 'Test', phone: '+2250700000000' }),
  });
  assert.equal(invalidCompletion.response.status, 401);
});

test('guest and customer checkout track the WhatsApp handoff', async () => {
  const merchantPhone = uniquePhone();
  const registration = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique Parcours Client', whatsapp_number: merchantPhone, email: uniqueEmail(), pin_code: '638294', category: 'food', accepted_terms_privacy: true }),
  });
  assert.equal(registration.response.status, 200, JSON.stringify(registration.payload));
  const shopId = registration.payload.shop.id;
  assert.equal(registration.payload.shop.publication_status, 'draft');
  const ownerShopState = await apiFetch(`/api/shops/${shopId}`);
  assert.equal(ownerShopState.response.status, 200, JSON.stringify(ownerShopState.payload));
  assert.equal(ownerShopState.payload.shop.merchant_verification_status, 'pending');
  assert.equal(ownerShopState.payload.shop.publication_status, 'draft');
  const pendingPublication = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(pendingPublication.response.status, 409, JSON.stringify(pendingPublication.payload));
  assert.equal(pendingPublication.payload.blocked_by, 'verification');

  const trialStart = await apiFetch(`/api/shops/${shopId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'standard' }),
  });
  assert.equal(trialStart.response.status, 200, JSON.stringify(trialStart.payload));
  assert.equal(trialStart.payload.shop.subscription.status, 'trialing');

  const opened = await apiFetch(`/api/shops/${shopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: true }),
  });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.payload));

  const createdProduct = await apiFetch(`/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Plat du jour test client', price: 2500, stock: 6, is_available: true }),
  });
  assert.equal(createdProduct.response.status, 200, JSON.stringify(createdProduct.payload));
  const productId = createdProduct.payload.product.id;

  const unauthenticatedOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client invité',
      customer_phone: uniquePhone(),
      delivery_location: 'Cocody Angré',
      payment_method_preference: 'to_confirm',
      total_amount: 1,
      status: 'confirmed',
      items: [{ product_id: productId, quantity: 2 }],
    }),
  });
  assert.equal(unauthenticatedOrder.response.status, 403, JSON.stringify(unauthenticatedOrder.payload));
  const stockAfterGuestRejection = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(stockAfterGuestRejection.payload[0].stock, 6);

  const customerEmail = `checkout${Date.now()}@example.ci`;
  const customerPhone = uniquePhone();
  const customerRegistration = await apiFetch('/api/auth/customer-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Client', last_name: 'Compte', phone: customerPhone, email: customerEmail, password: 'MotDePasse!123', accepted_terms_privacy: true }),
  });
  assert.equal(customerRegistration.response.status, 200, JSON.stringify(customerRegistration.payload));
  assert.equal(customerRegistration.payload.user.first_name, 'Client');
  assert.equal(customerRegistration.payload.user.last_name, 'Compte');

  const pendingOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client vérification',
      customer_phone: uniquePhone(),
      delivery_location: 'Cocody Angré',
      items: [{ product_id: productId, quantity: 1 }],
    }),
  });
  assert.equal(pendingOrder.response.status, 403, JSON.stringify(pendingOrder.payload));

  const legacyKycSubmission = await apiFetch(`/api/shops/${shopId}/identity-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_image: 'client-controlled-data' }),
  });
  assert.equal(legacyKycSubmission.response.status, 404);

  const adminLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.payload));
  const pushWithoutRecipients = await apiFetch('/api/admin/push/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Annonce de test', body: 'Aucun destinataire', url: '/app' }),
  });
  assert.equal(pushWithoutRecipients.response.status, 409, JSON.stringify(pushWithoutRecipients.payload));
  assert.match(pushWithoutRecipients.payload.error, /Aucun appareil marchand/);
  const verificationQueue = await apiFetch('/api/admin/identity-verifications');
  assert.equal(verificationQueue.response.status, 200, JSON.stringify(verificationQueue.payload));
  const verificationRecord = verificationQueue.payload.verifications.find((record: any) => record.shop_id === shopId);
  assert.equal(verificationRecord.session_id, null);
  const adminShopStates = await apiFetch('/api/admin/shops');
  assert.equal(adminShopStates.response.status, 200, JSON.stringify(adminShopStates.payload));

  const rejectedManualApproval = await apiFetch(`/api/admin/identity-verifications/${shopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'verified' }),
  });
  assert.equal(rejectedManualApproval.response.status, 404);
  const testDb = new Database(TEST_DB_PATH);
  testDb.prepare("UPDATE shops SET merchant_verification_status = 'verified' WHERE id = ?").run(shopId);
  testDb.close();
  const adminLogout = await apiFetch('/api/auth/admin-logout', { method: 'POST' });
  assert.equal(adminLogout.response.status, 200, JSON.stringify(adminLogout.payload));

  const approvedButDraftDirectory = await apiFetch('/api/shops');
  assert.equal(approvedButDraftDirectory.payload.some((shop: any) => shop.id === shopId), false);

  const ownerPublication = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(ownerPublication.response.status, 200, JSON.stringify(ownerPublication.payload));
  assert.equal(ownerPublication.payload.publication_status, 'active');
  const publishedDirectory = await apiFetch('/api/shops');
  assert.equal(publishedDirectory.payload.some((shop: any) => shop.id === shopId), true);

  const customerSessionCookies = cookieJar;
  cookieJar = '';
  const guestOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client invité',
      customer_phone: uniquePhone(),
      delivery_location: 'Cocody Angré',
      total_amount: 1,
      attribution_campaign: 'launch_tiktok_1',
      items: [{ product_id: productId, quantity: 1 }],
    }),
  });
  assert.equal(guestOrder.response.status, 200, JSON.stringify(guestOrder.payload));
  assert.equal(guestOrder.payload.order.customer_user_id, undefined);
  assert.equal(guestOrder.payload.order.attribution_campaign, 'launch_tiktok_1');
  assert.equal(guestOrder.payload.order.total_amount, 2500);
  assert.equal(guestOrder.payload.order.payment_method_preference, 'to_confirm');
  const guestWhatsappClick = await apiFetch(`/api/orders/${guestOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: guestOrder.payload.whatsapp_tracking_token }),
  });
  assert.equal(guestWhatsappClick.response.status, 200);
  cookieJar = customerSessionCookies;

  const accountOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Nom du formulaire',
      customer_phone: uniquePhone(),
      delivery_location: 'Marcory Résidentiel',
      payment_method_preference: 'mobile_money',
      items: [{ product_id: productId, quantity: 3 }],
    }),
  });
  assert.equal(accountOrder.response.status, 200, JSON.stringify(accountOrder.payload));
  assert.equal(accountOrder.payload.order.customer_user_id, customerRegistration.payload.user.id);
  assert.equal(accountOrder.payload.order.status, 'confirmed');
  assert.equal(accountOrder.payload.order.payment_method_preference, 'mobile_money');

  const invalidTrackingClick = await apiFetch(`/api/orders/${accountOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid-tracking-token-value' }),
  });
  assert.equal(invalidTrackingClick.response.status, 404);
  const trackingClick = await apiFetch(`/api/orders/${accountOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: accountOrder.payload.whatsapp_tracking_token }),
  });
  assert.equal(trackingClick.response.status, 200, JSON.stringify(trackingClick.payload));
  const repeatedTrackingClick = await apiFetch(`/api/orders/${accountOrder.payload.order.id}/whatsapp-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: accountOrder.payload.whatsapp_tracking_token }),
  });
  assert.equal(repeatedTrackingClick.payload.clicked_at, trackingClick.payload.clicked_at);

  const customerHistory = await apiFetch('/api/auth/customer-orders');
  assert.equal(customerHistory.response.status, 200, JSON.stringify(customerHistory.payload));
  assert.deepEqual(customerHistory.payload.orders.map((order: any) => order.id), [accountOrder.payload.order.id]);
  assert.equal(customerHistory.payload.orders[0].shop_name, 'Boutique Parcours Client');

  const merchantOrders = await apiFetch(`/api/shops/${shopId}/orders`);
  assert.equal(merchantOrders.response.status, 200, JSON.stringify(merchantOrders.payload));
  const trackedOrder = merchantOrders.payload.find((order: any) => order.id === accountOrder.payload.order.id);
  assert.equal(trackedOrder.whatsapp_tracking_available, true);
  assert.equal(trackedOrder.whatsapp_clicked_at, trackingClick.payload.clicked_at);
  assert.equal(trackedOrder.payment_method_preference, 'mobile_money');
  assert.equal(JSON.stringify(merchantOrders.payload).includes(accountOrder.payload.whatsapp_tracking_token), false);
  assert.equal(merchantOrders.payload.find((order: any) => order.id === accountOrder.payload.order.id).customer_user_id, customerRegistration.payload.user.id);

  const stockAfterOrderCreation = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(stockAfterOrderCreation.payload[0].stock, 2);

  const cancelled = await apiFetch(`/api/shops/${shopId}/orders/${accountOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelled.response.status, 200, JSON.stringify(cancelled.payload));
  const stockAfterCancellation = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(stockAfterCancellation.payload[0].stock, 5);

  const reviewOrderResponse = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client vérifié',
      customer_phone: customerPhone,
      delivery_location: 'Cocody Angré',
      items: [{ product_id: productId, quantity: 1 }],
    }),
  });
  assert.equal(reviewOrderResponse.response.status, 200, JSON.stringify(reviewOrderResponse.payload));
  const reviewOrderId = reviewOrderResponse.payload.order.id;
  const deliveredReviewOrder = await apiFetch(`/api/shops/${shopId}/orders/${reviewOrderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delivered' }),
  });
  assert.equal(deliveredReviewOrder.response.status, 200, JSON.stringify(deliveredReviewOrder.payload));
  const guestReviewAttempt = await apiFetch('/api/customer-engagement/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: guestOrder.payload.order.id, target_type: 'shop', target_id: shopId, rating: 5 }),
  });
  assert.equal(guestReviewAttempt.response.status, 403);
  const shopReview = await apiFetch('/api/customer-engagement/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: reviewOrderId, target_type: 'shop', target_id: shopId, rating: 5, comment: 'Très bonne expérience.' }),
  });
  assert.equal(shopReview.response.status, 201, JSON.stringify(shopReview.payload));
  const productReview = await apiFetch('/api/customer-engagement/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: reviewOrderId, target_type: 'product', target_id: productId, rating: 4, comment: 'Produit conforme.' }),
  });
  assert.equal(productReview.response.status, 201, JSON.stringify(productReview.payload));
  const duplicateReview = await apiFetch('/api/customer-engagement/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: reviewOrderId, target_type: 'shop', target_id: shopId, rating: 5 }),
  });
  assert.equal(duplicateReview.response.status, 409);
  const unmoderatedReviews = await apiFetch(`/api/customer-engagement/reviews?target_type=shop&target_id=${shopId}`);
  assert.equal(unmoderatedReviews.payload.review_count, 0);

  const report = await apiFetch('/api/customer-engagement/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: 'product', target_id: productId, reason: 'inaccurate', details: 'La description doit être vérifiée.' }),
  });
  assert.equal(report.response.status, 201, JSON.stringify(report.payload));
  const duplicateReport = await apiFetch('/api/customer-engagement/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_type: 'product', target_id: productId, reason: 'other' }),
  });
  assert.equal(duplicateReport.response.status, 409);

  const moderationLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(moderationLogin.response.status, 200);
  const moderationQueue = await apiFetch('/api/admin/content-moderation');
  assert.equal(moderationQueue.response.status, 200, JSON.stringify(moderationQueue.payload));
  assert.equal(moderationQueue.payload.reviews.length, 2);
  assert.equal(moderationQueue.payload.reports.length, 1);
  const publishedReview = await apiFetch(`/api/admin/content-moderation/reviews/${shopReview.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  });
  assert.equal(publishedReview.response.status, 200);
  const hiddenReview = await apiFetch(`/api/admin/content-moderation/reviews/${productReview.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'hidden' }),
  });
  assert.equal(hiddenReview.response.status, 200);
  const publicReviews = await apiFetch(`/api/customer-engagement/reviews?target_type=shop&target_id=${shopId}`);
  assert.equal(publicReviews.payload.review_count, 1);
  assert.equal(publicReviews.payload.average_rating, 5);
  const handledReport = await apiFetch(`/api/admin/content-moderation/reports/${report.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' }),
  });
  assert.equal(handledReport.response.status, 200);
  const moderationLogout = await apiFetch('/api/auth/admin-logout', { method: 'POST' });
  assert.equal(moderationLogout.response.status, 200);

  const invalidTransition = await apiFetch(`/api/shops/${shopId}/orders/${accountOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'refunded' }),
  });
  assert.equal(invalidTransition.response.status, 400);

  const rejectedAccountDeletion = await apiFetch('/api/auth/customer-account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'SUPPRIMER', current_password: 'mauvais-mot-de-passe' }),
  });
  assert.equal(rejectedAccountDeletion.response.status, 401);
  const deleteAccount = await apiFetch('/api/auth/customer-account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'SUPPRIMER', current_password: 'MotDePasse!123' }),
  });
  assert.equal(deleteAccount.response.status, 200, JSON.stringify(deleteAccount.payload));
  const ordersAfterAccountDeletion = await apiFetch(`/api/shops/${shopId}/orders`);
  const anonymizedOrder = ordersAfterAccountDeletion.payload.find((order: any) => order.id === accountOrder.payload.order.id);
  assert.equal(anonymizedOrder.customer_user_id, undefined);
  assert.equal(anonymizedOrder.customer_name, 'Compte supprimé');
  assert.equal(anonymizedOrder.customer_phone, '');
  assert.ok(ordersAfterAccountDeletion.payload.some((order: any) => order.id === guestOrder.payload.order.id));
  const deletedCustomerSession = await apiFetch('/api/auth/customer-session');
  assert.equal(deletedCustomerSession.payload.authenticated, false);
});

test('Didit alone controls merchant verification; signed webhooks are fresh and idempotent', async () => {
  const registration = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Boutique vérification Didit', whatsapp_number: uniquePhone(), email: uniqueEmail(), pin_code: '684219', category: 'fashion', accepted_terms_privacy: true }),
  });
  assert.equal(registration.response.status, 200, JSON.stringify(registration.payload));
  const shopId = registration.payload.shop.id;
  const trialStart = await apiFetch(`/api/shops/${shopId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'standard' }),
  });
  assert.equal(trialStart.response.status, 200, JSON.stringify(trialStart.payload));
  const legacySubmission = await apiFetch(`/api/shops/${shopId}/identity-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_image: 'untrusted' }),
  });
  assert.equal(legacySubmission.response.status, 404);
  const missingConsent = await apiFetch(`/api/shops/${shopId}/identity-verification/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missingConsent.response.status, 400);
  const unconfiguredSession = await apiFetch(`/api/shops/${shopId}/identity-verification/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }),
  });
  assert.equal(unconfiguredSession.response.status, 503);

  const hiddenBeforePublication = await fetch(`${BASE_URL}/api/shops/${registration.payload.shop.slug}`);
  assert.equal(hiddenBeforePublication.status, 404);
  const publicationBeforeReview = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(publicationBeforeReview.response.status, 409);

  const adminLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.response.status, 200, JSON.stringify(adminLogin.payload));
  const manualApproval = await apiFetch(`/api/admin/identity-verifications/${shopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'verified' }),
  });
  assert.equal(manualApproval.response.status, 404);

  const sessionId = randomUUID();
  const previousSessionId = randomUUID();
  const oldTimestamp = new Date(Date.now() - 60_000).toISOString();
  const testDb = new Database(TEST_DB_PATH);
  testDb.prepare(`INSERT INTO didit_verification_sessions
    (session_id, shop_id, workflow_id, status, consent_at, consent_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(previousSessionId, shopId, randomUUID(), 'In Progress', oldTimestamp, 'didit-v1', new Date(Date.now() - 120_000).toISOString(), oldTimestamp);
  testDb.prepare(`INSERT INTO didit_verification_sessions
    (session_id, shop_id, workflow_id, status, consent_at, consent_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, shopId, randomUUID(), 'In Progress', oldTimestamp, 'didit-v1', oldTimestamp, oldTimestamp);
  testDb.close();

  const eventId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const event = { event_id: eventId, session_id: sessionId, status: 'Approved', webhook_type: 'status.updated', timestamp };
  const payload = JSON.stringify(event);
  const signature = createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(canonicalJson(event)).digest('hex');
  const webhookUrl = `${BASE_URL}/api/webhooks/didit`;
  const invalidSignature = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp), 'X-Signature-V2': '00' },
    body: payload,
  });
  assert.equal(invalidSignature.status, 401);
  const expiredWebhook = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp - 3600), 'X-Signature-V2': signature },
    body: payload,
  });
  assert.equal(expiredWebhook.status, 401);
  const expiredBodyEvent = { ...event, event_id: randomUUID(), timestamp: timestamp - 3600 };
  const expiredBodyPayload = JSON.stringify(expiredBodyEvent);
  const expiredBodySignature = createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(canonicalJson(expiredBodyEvent)).digest('hex');
  const expiredSignedBody = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp), 'X-Signature-V2': expiredBodySignature },
    body: expiredBodyPayload,
  });
  assert.equal(expiredSignedBody.status, 401);
  const approvedWebhook = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp), 'X-Signature-V2': signature },
    body: payload,
  });
  assert.equal(approvedWebhook.status, 204);

  const duplicateWithDifferentDecision = { ...event, status: 'Declined' };
  const duplicatePayload = JSON.stringify(duplicateWithDifferentDecision);
  const duplicateSignature = createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(canonicalJson(duplicateWithDifferentDecision)).digest('hex');
  const duplicateWebhook = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp), 'X-Signature-V2': duplicateSignature },
    body: duplicatePayload,
  });
  assert.equal(duplicateWebhook.status, 204);
  const staleSessionEvent = { event_id: randomUUID(), session_id: previousSessionId, status: 'Declined', webhook_type: 'status.updated', timestamp };
  const staleSessionPayload = JSON.stringify(staleSessionEvent);
  const staleSessionSignature = createHmac('sha256', DIDIT_WEBHOOK_SECRET).update(canonicalJson(staleSessionEvent)).digest('hex');
  const ignoredPreviousSession = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': String(timestamp), 'X-Signature-V2': staleSessionSignature },
    body: staleSessionPayload,
  });
  assert.equal(ignoredPreviousSession.status, 204);
  const verificationQueue = await apiFetch('/api/admin/identity-verifications');
  const verifiedRecord = verificationQueue.payload.verifications.find((record: any) => record.shop_id === shopId);
  assert.equal(verifiedRecord.status, 'verified');
  assert.equal(verifiedRecord.provider_status, 'Approved');
  assert.equal(verifiedRecord.session_id, sessionId);
  const diditAudit = await apiFetch('/api/admin/audit-logs?actor=didit_webhook&search=identity_status_updated');
  assert.equal(diditAudit.response.status, 200, JSON.stringify(diditAudit.payload));
  const identityAuditEntry = diditAudit.payload.audit_logs.find((entry: any) => entry.shop_id === shopId);
  assert.ok(identityAuditEntry);
  assert.equal(identityAuditEntry.actor, 'didit_webhook');
  assert.equal(identityAuditEntry.details.previous_status, 'pending');
  assert.equal(identityAuditEntry.details.status, 'verified');
  assert.equal(identityAuditEntry.details.event_id, eventId);

  const adminLogout = await apiFetch('/api/auth/admin-logout', { method: 'POST' });
  assert.equal(adminLogout.response.status, 200, JSON.stringify(adminLogout.payload));

  const publication = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(publication.response.status, 200, JSON.stringify(publication.payload));
  let trialProductId: number | null = null;
  for (let index = 0; index < 2; index += 1) {
    const product = await apiFetch(`/api/shops/${shopId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Article d’essai ${index + 1}`, price: 1500, stock: 2 }),
    });
    assert.equal(product.response.status, 200, JSON.stringify(product.payload));
    if (index === 0) trialProductId = product.payload.product.id;
  }
  const thirdTrialProduct = await apiFetch(`/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Troisième article d’essai', price: 1500, stock: 2 }),
  });
  assert.equal(thirdTrialProduct.response.status, 409, JSON.stringify(thirdTrialProduct.payload));
  const testDbAfterTrial = new Database(TEST_DB_PATH);
  testDbAfterTrial.prepare("UPDATE shops SET subscription_status = 'expired', subscription_expires_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 4 * 86400000).toISOString(), shopId);
  testDbAfterTrial.close();
  const directoryAfterVerification = await fetch(`${BASE_URL}/api/v1/catalog/storefronts`);
  const visibleAfterVerification = (await directoryAfterVerification.json()).find((shop: any) => shop.id === shopId);
  assert.equal(visibleAfterVerification, undefined, 'A shop must be hidden after its subscription grace period without deleting its data.');
  const orderAfterExpiry = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      customer_name: 'Client Test',
      customer_phone: '+2250700000000',
      delivery_location: 'Abidjan',
      items: [{ product_id: trialProductId, quantity: 1 }],
    }),
  });
  assert.equal(orderAfterExpiry.response.status, 403, JSON.stringify(orderAfterExpiry.payload));
  assert.match(String(orderAfterExpiry.payload.error), /abonnement actif/i);
  const visibleAfterPublication = await fetch(`${BASE_URL}/api/shops/${registration.payload.shop.slug}`);
  assert.equal(visibleAfterPublication.status, 404);
});

test('concurrent single-item orders cannot oversell the last unit', async () => {
  const createProduct = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250708091011', pin: '402138' }),
  });
  assert.equal(createProduct.response.status, 200, `Unexpected login response: ${JSON.stringify(createProduct.payload)}`);

  const productCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Produit stock unique concurrent',
      description: 'Produit utilisé pour la validation de concurrence',
      price: 1500,
      stock: 1,
      image_url: 'https://example.com/concurrent.jpg',
      is_available: true,
      category: 'fashion',
      sizes: ['M'],
      colors: [{ name: 'Blanc', hex: '#ffffff' }],
    }),
  });
  const createdProduct = productCreate.payload.product;
  assert.ok(createdProduct.id);

  await registerCustomer('Concurrent', 'Client');

  const orderAttempts = await Promise.all([
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client A',
        customer_phone: '+2250500000001',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 1',
        delivery_slot: 'Midi',
        payment_method_preference: 'wave',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client B',
        customer_phone: '+2250500000002',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 2',
        delivery_slot: 'Midi',
        payment_method_preference: 'mobile_money',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
    apiFetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: 1,
        customer_name: 'Client C',
        customer_phone: '+2250500000003',
        delivery_location: 'Abidjan',
        delivery_note: 'Commande concurrente 3',
        delivery_slot: 'Midi',
        payment_method_preference: 'wave',
        items: [{ product_id: createdProduct.id, quantity: 1 }],
      }),
    }),
  ]);

  const successfulOrders = orderAttempts.filter((attempt) => attempt.response.status === 200).length;
  assert.equal(successfulOrders, 1, `Expected one of three auto-accepted orders to reserve the last unit, got ${successfulOrders}`);
  assert.equal(orderAttempts.find((attempt) => attempt.response.status === 200)?.payload.order.status, 'confirmed');

  const productAfter = await apiFetch(`/api/shops/1/products`);
  assert.equal(productAfter.response.status, 200);
  const updatedProduct = productAfter.payload.find((item: any) => item.id === createdProduct.id);
  assert.ok(updatedProduct);
  assert.equal(updatedProduct.stock, 0);

  const duplicateProductCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Produit lignes dupliquées',
      description: 'Validation du regroupement de stock',
      price: 1000,
      stock: 5,
      image_url: 'https://example.com/duplicate-lines.jpg',
      is_available: true,
      category: 'fashion',
    }),
  });
  assert.equal(duplicateProductCreate.response.status, 200);
  const duplicateProduct = duplicateProductCreate.payload.product;
  const duplicateOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client doublon',
      customer_phone: '+2250500000003',
      delivery_location: 'Abidjan',
      payment_method_preference: 'wave',
      items: [
        { product_id: duplicateProduct.id, quantity: 2 },
        { product_id: duplicateProduct.id, quantity: 2 },
      ],
    }),
  });
  assert.equal(duplicateOrder.response.status, 200, JSON.stringify(duplicateOrder.payload));
  assert.equal(duplicateOrder.payload.order.status, 'confirmed');
  const duplicateProductAfter = await apiFetch(`/api/shops/1/products`);
  const duplicateProductState = duplicateProductAfter.payload.find((item: any) => item.id === duplicateProduct.id);
  assert.equal(duplicateProductState.stock, 1);
});

test('existing merchant full flow: login, product management, order lifecycle, billing snapshot, and store status toggle', async () => {
  const login = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+2250708091011', pin: '402138' }),
  });
  assert.equal(login.response.status, 200, `Unexpected login response: ${JSON.stringify(login.payload)}`);
  assert.equal(login.payload.success, true);
  assert.equal(login.payload.shop.id, 1);

  const productCreate = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test produit flux marchand',
      description: 'Produit de test pour validation du cycle complet',
      price: 2500,
      stock: 5,
      image_url: 'https://example.com/test.jpg',
      is_available: true,
      category: 'fashion',
      sizes: ['S', 'M', 'L'],
      colors: [{ name: 'Noir', hex: '#111827' }],
    }),
  });
  assert.equal(productCreate.response.status, 200, `Product creation failed: ${JSON.stringify(productCreate.payload)}`);
  const createdProduct = productCreate.payload.product;
  assert.ok(createdProduct.id);

  const productList = await apiFetch('/api/shops/1/products');
  assert.equal(productList.response.status, 200);
  assert.ok(productList.payload.some((product: any) => product.id === createdProduct.id));

  const productEdit = await apiFetch(`/api/shops/1/products/${createdProduct.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit marchand modifié', price: 2600, stock: 5 }),
  });
  assert.equal(productEdit.response.status, 200, JSON.stringify(productEdit.payload));
  assert.equal(productEdit.payload.product.title, 'Produit marchand modifié');

  const hideProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(hideProduct.response.status, 200, JSON.stringify(hideProduct.payload));
  assert.equal(hideProduct.payload.is_available, false);
  const showProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(showProduct.response.status, 200, JSON.stringify(showProduct.payload));
  assert.equal(showProduct.payload.is_available, true);

  const temporaryProduct = await apiFetch('/api/shops/1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Article test suppression', price: 900, stock: 1 }),
  });
  assert.equal(temporaryProduct.response.status, 200, JSON.stringify(temporaryProduct.payload));
  const temporaryProductId = temporaryProduct.payload.product.id;
  const stockDown = await apiFetch(`/api/shops/1/products/${temporaryProductId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta: -5 }),
  });
  assert.equal(stockDown.response.status, 200, JSON.stringify(stockDown.payload));
  assert.equal(stockDown.payload.stock, 0);
  assert.equal(stockDown.payload.product.is_available, false);
  const stockUp = await apiFetch(`/api/shops/1/products/${temporaryProductId}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta: 2 }),
  });
  assert.equal(stockUp.response.status, 200, JSON.stringify(stockUp.payload));
  assert.equal(stockUp.payload.stock, 2);
  assert.equal(stockUp.payload.product.is_available, false);
  const showRestockedProduct = await apiFetch(`/api/shops/1/products/${temporaryProductId}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(showRestockedProduct.payload.is_available, true);
  const deleteProduct = await apiFetch(`/api/shops/1/products/${temporaryProductId}`, { method: 'DELETE' });
  assert.equal(deleteProduct.response.status, 200, JSON.stringify(deleteProduct.payload));
  assert.equal((await apiFetch('/api/shops/1/products')).payload.some((product: any) => product.id === temporaryProductId), false);

  await registerCustomer('Commande', 'Client');
  const concurrentDatabaseWriter = new Database(TEST_DB_PATH);
  concurrentDatabaseWriter.prepare('UPDATE products SET title = ?, price = ? WHERE id = ?')
    .run('Produit actualisé sur une autre instance', 2700, createdProduct.id);
  concurrentDatabaseWriter.close();
  const order = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client Test',
      customer_phone: '+2250500000001',
      delivery_location: 'Abidjan Plateau',
      delivery_note: 'Livraison urgente',
      delivery_slot: 'Midi',
      payment_method_preference: 'wave',
      items: [{ product_id: createdProduct.id, quantity: 2 }],
    }),
  });
  assert.equal(order.response.status, 200, `Order creation failed: ${JSON.stringify(order.payload)}`);
  assert.equal(order.payload.success, true);
  const orderId = order.payload.order.id;

  assert.equal(order.payload.order.status, 'confirmed');
  assert.equal(order.payload.order.total_amount, 5400);
  assert.equal(order.payload.order.items[0].product_title, 'Produit actualisé sur une autre instance');
  assert.equal(order.payload.order.whatsapp_tracking_available, true);
  const stockAfterOrderCreation = await apiFetch('/api/shops/1/products');
  const productAfterOrderCreation = stockAfterOrderCreation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterOrderCreation.stock, 3);

  const orderCheck = await apiFetch(`/api/shops/1/orders`);
  assert.equal(orderCheck.response.status, 200);
  assert.ok(orderCheck.payload.some((item: any) => item.id === orderId));
  const rejectDeletingReservedProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}`, { method: 'DELETE' });
  assert.equal(rejectDeletingReservedProduct.response.status, 409);
  const hideReservedProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(hideReservedProduct.payload.is_available, false);

  const statusUpdate = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(statusUpdate.response.status, 200);
  assert.equal(statusUpdate.payload.order.status, 'confirmed');

  const stockAfterRepeatedConfirmation = await apiFetch('/api/shops/1/products');
  const productAfterRepeatedConfirmation = stockAfterRepeatedConfirmation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterRepeatedConfirmation.stock, 3);

  const cancellationRequests = await Promise.all([1, 2].map(() => apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  })));
  const cancelledUpdate = cancellationRequests[0];
  assert.ok(cancellationRequests.every(({ response }) => response.status === 200));
  assert.equal(cancelledUpdate.response.status, 200);
  assert.equal(cancelledUpdate.payload.order.status, 'cancelled');
  const stockAfterCancellation = await apiFetch('/api/shops/1/products');
  const productAfterCancellation = stockAfterCancellation.payload.find((item: any) => item.id === createdProduct.id);
  assert.equal(productAfterCancellation.stock, 5);
  assert.equal(productAfterCancellation.is_available, false);
  const showRestockedReservedProduct = await apiFetch(`/api/shops/1/products/${createdProduct.id}/toggle-visibility`, { method: 'PATCH' });
  assert.equal(showRestockedReservedProduct.payload.is_available, true);

  const reactivatedPending = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  });
  assert.equal(reactivatedPending.response.status, 200, JSON.stringify(reactivatedPending.payload));
  assert.equal(reactivatedPending.payload.order.status, 'pending');
  const stockAfterReactivation = await apiFetch('/api/shops/1/products');
  assert.equal(stockAfterReactivation.payload.find((item: any) => item.id === createdProduct.id).stock, 5);

  const cancelledAgain = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' }),
  });
  assert.equal(cancelledAgain.response.status, 200, JSON.stringify(cancelledAgain.payload));
  const stockAfterRepeatedCancellation = await apiFetch('/api/shops/1/products');
  assert.equal(stockAfterRepeatedCancellation.payload.find((item: any) => item.id === createdProduct.id).stock, 5);

  const competingOrder = await apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: 1,
      customer_name: 'Client stock concurrent',
      customer_phone: '+2250500000004',
      delivery_location: 'Abidjan Plateau',
      payment_method_preference: 'wave',
      items: [{ product_id: createdProduct.id, quantity: 5 }],
    }),
  });
  assert.equal(competingOrder.response.status, 200, JSON.stringify(competingOrder.payload));
  assert.equal(competingOrder.payload.order.status, 'confirmed');

  const unsafeReactivation = await apiFetch(`/api/shops/1/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'confirmed' }),
  });
  assert.equal(unsafeReactivation.response.status, 409);
  assert.match(String(unsafeReactivation.payload.error), /Stock insuffisant/i);

  const adminLoginForOrderRepair = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLoginForOrderRepair.response.status, 200);
  const adminReopenOrder = await apiFetch(`/api/shops/1/orders/${competingOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending' }),
  });
  assert.equal(adminReopenOrder.response.status, 400);
  assert.match(String(adminReopenOrder.payload.error), /motif admin/i);
  const auditedAdminReopenOrder = await apiFetch(`/api/shops/1/orders/${competingOrder.payload.order.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'pending', reason: 'Correction du statut après contrôle' }),
  });
  assert.equal(auditedAdminReopenOrder.response.status, 200, JSON.stringify(auditedAdminReopenOrder.payload));
  const orderStatusAudit = await apiFetch('/api/admin/subscriptions');
  const orderAuditEntry = orderStatusAudit.payload.audit_logs.find((entry: { action: string; shop_id: number; details: string }) =>
    entry.action === 'admin_order_status_updated' && entry.shop_id === 1 && entry.details.includes('Correction du statut après contrôle'));
  assert.ok(orderAuditEntry, 'admin order status change must be recorded with its reason');
  const stockAfterAdminReopen = await apiFetch('/api/shops/1/products');
  assert.equal(stockAfterAdminReopen.payload.find((item: any) => item.id === createdProduct.id).stock, 5);
  const adminLogoutAfterRepair = await apiFetch('/api/auth/admin-logout', { method: 'POST' });
  assert.equal(adminLogoutAfterRepair.response.status, 200);

  const bilan = await apiFetch('/api/shops/1/flash-bilan');
  assert.equal(bilan.response.status, 200);
  assert.ok(String(bilan.payload.whatsapp_message).includes('FLASH BILAN'));

  const toggleStore = await apiFetch('/api/shops/1/toggle-status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: false }),
  });
  assert.equal(toggleStore.response.status, 200);
  assert.equal(toggleStore.payload.is_open, false);

  const publicShop = await apiFetch('/api/shops/aya-chic');
  assert.equal(publicShop.response.status, 200);
  assert.ok(publicShop.payload.shop);
});

test('new merchant registration flow is local and immediately usable', async () => {
  const phone = uniquePhone();
  const merchantEmail = uniqueEmail();
  const registration = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Test Premium',
      whatsapp_number: phone,
      email: merchantEmail,
      pin_code: '654321',
      category: 'fashion',
      city: 'Abidjan',
      welcome_message: 'Bienvenue chez Boutique Test Premium',
      accepted_terms_privacy: true,
    }),
  });

  assert.equal(registration.response.status, 200, `Shop creation failed: ${JSON.stringify(registration.payload)}`);
  assert.match(String(registration.payload.message), /Boutique créée/i);
  assert.equal(registration.payload.shop.is_active, true);
  assert.equal(registration.payload.shop.is_open, true);
  assert.equal(registration.payload.shop.subscription.status, 'trialing');
  assert.equal(registration.payload.shop.subscription.plan, 'standard');
  const shopConsentDb = new Database(TEST_DB_PATH);
  try {
    const consent = shopConsentDb.prepare('SELECT terms_document, privacy_document, accepted_at FROM merchant_account_consents WHERE shop_id = ?').get(registration.payload.shop.id) as { terms_document: string; privacy_document: string; accepted_at: string } | undefined;
    assert.deepEqual(consent && [consent.terms_document, consent.privacy_document], ['/cgu', '/confidentialite']);
    assert.ok(consent?.accepted_at);
    assert.ok(Number.isFinite(Date.parse(consent!.accepted_at)));
  } finally {
    shopConsentDb.close();
  }
  const merchantDataExport = await apiFetch('/api/auth/merchant-data-export');
  assert.equal(merchantDataExport.response.status, 200, JSON.stringify(merchantDataExport.payload));
  assert.equal(merchantDataExport.payload.shop.id, registration.payload.shop.id);
  assert.equal(merchantDataExport.payload.account_consents.length, 1);
  assert.equal('pin_code_hash' in merchantDataExport.payload.shop, false);
  assert.equal('owner_access_token_hash' in merchantDataExport.payload.shop, false);
  assert.equal(typeof registration.payload.shop.subscription.trialStart, 'string');
  assert.equal(typeof registration.payload.shop.subscription.trialEnd, 'string');
  assert.equal(registration.payload.shop.subscription.trialDaysRemaining, 7);
  assert.ok(registration.payload.owner_access_token);

  const newShopId = registration.payload.shop.id;
  const ownerProfile = await apiFetch(`/api/shops/${newShopId}/owner-profile`);
  assert.equal(ownerProfile.response.status, 200, JSON.stringify(ownerProfile.payload));
  assert.equal(ownerProfile.payload.name, '');
  assert.equal(ownerProfile.payload.phone, '');
  assert.equal(ownerProfile.payload.email, merchantEmail);

  const invalidOwnerProfile = await apiFetch(`/api/shops/${newShopId}/owner-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adresse-invalide' }),
  });
  assert.equal(invalidOwnerProfile.response.status, 400, JSON.stringify(invalidOwnerProfile.payload));

  const invalidOwnerPhone = await apiFetch(`/api/shops/${newShopId}/owner-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Responsable test', phone: '00000000', email: merchantEmail }),
  });
  assert.equal(invalidOwnerPhone.response.status, 400, JSON.stringify(invalidOwnerPhone.payload));

  const invalidPinProfile = await apiFetch(`/api/shops/${newShopId}/owner-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: merchantEmail, pin_code: '123' }),
  });
  assert.equal(invalidPinProfile.response.status, 400, JSON.stringify(invalidPinProfile.payload));

  const billingEmail = `facturation-${Date.now()}@example.com`;
  const updatedOwnerProfile = await apiFetch(`/api/shops/${newShopId}/owner-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Responsable test',
      phone: '+225 07 00 00 00 00',
      email: billingEmail.toUpperCase(),
      pin_code: '830462',
    }),
  });
  assert.equal(updatedOwnerProfile.response.status, 200, JSON.stringify(updatedOwnerProfile.payload));
  assert.equal(updatedOwnerProfile.payload.name, 'Responsable test');
  assert.equal(updatedOwnerProfile.payload.phone, '+2250700000000');
  assert.equal(updatedOwnerProfile.payload.email, billingEmail);
  assert.equal(updatedOwnerProfile.payload.pin_updated, true);
  const verifiedOwnerProfile = await apiFetch(`/api/shops/${newShopId}/owner-profile`);
  assert.equal(verifiedOwnerProfile.payload.name, 'Responsable test');
  assert.equal(verifiedOwnerProfile.payload.phone, '+2250700000000');
  assert.equal(verifiedOwnerProfile.payload.email, billingEmail);
  const updatedMerchantDataExport = await apiFetch('/api/auth/merchant-data-export');
  assert.equal(updatedMerchantDataExport.response.status, 200, JSON.stringify(updatedMerchantDataExport.payload));
  assert.equal(updatedMerchantDataExport.payload.shop.owner_name, 'Responsable test');
  assert.equal(updatedMerchantDataExport.payload.shop.owner_phone, '+2250700000000');

  const profileDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const savedProfile = profileDb.prepare('SELECT owner_name, owner_phone, owner_email, pin_code_hash FROM shops WHERE id = ?').get(newShopId) as { owner_name: string; owner_phone: string; owner_email: string; pin_code_hash: string };
    assert.equal(savedProfile.owner_name, 'Responsable test');
    assert.equal(savedProfile.owner_phone, '+2250700000000');
    assert.equal(savedProfile.owner_email, billingEmail);
    assert.ok(savedProfile.pin_code_hash);
  } finally {
    profileDb.close();
  }

  const trialStart = await apiFetch(`/api/shops/${newShopId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'premium' }),
  });
  assert.equal(trialStart.response.status, 200, JSON.stringify(trialStart.payload));
  assert.equal(trialStart.payload.shop.subscription.plan, 'standard');
  assert.equal(typeof trialStart.payload.shop.subscription.trialStart, 'string');
  assert.equal(typeof trialStart.payload.shop.subscription.trialEnd, 'string');
  assert.equal(trialStart.payload.shop.subscription.trialDaysRemaining, 7);
  const persistedDatabase = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const savedPlan = persistedDatabase.prepare('SELECT selected_subscription_tier, subscription_status, trial_start, trial_end, subscription_expires_at, owner_name, owner_phone FROM shops WHERE id = ?').get(newShopId) as { selected_subscription_tier: string; subscription_status: string; trial_start: string; trial_end: string; subscription_expires_at: string; owner_name: string; owner_phone: string };
    assert.equal(savedPlan.selected_subscription_tier, 'standard');
    assert.equal(savedPlan.subscription_status, 'trialing');
    assert.ok(savedPlan.trial_start);
    assert.equal(savedPlan.trial_end, savedPlan.subscription_expires_at);
    assert.equal(savedPlan.owner_name, 'Responsable test');
    assert.equal(savedPlan.owner_phone, '+2250700000000');
  } finally {
    persistedDatabase.close();
  }

  const merchantLogin = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin: '830462' }),
  });
  assert.equal(merchantLogin.response.status, 200, JSON.stringify(merchantLogin.payload));
  assert.equal(merchantLogin.payload.shop.is_active, true);
  assert.equal(merchantLogin.payload.shop.is_open, true);

  const ownerClosesShop = await apiFetch(`/api/shops/${newShopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: false }),
  });
  assert.equal(ownerClosesShop.response.status, 200, JSON.stringify(ownerClosesShop.payload));
  assert.equal(ownerClosesShop.payload.is_open, false);

  const merchantSessionState = await apiFetch('/api/auth/session');
  assert.equal(merchantSessionState.response.status, 200, JSON.stringify(merchantSessionState.payload));
  assert.equal(merchantSessionState.payload.authenticated, true);
  assert.equal(merchantSessionState.payload.userType, 'merchant');
  assert.equal(merchantSessionState.payload.shopId, newShopId);

  const privateAccessLogin = await apiFetch('/api/auth/merchant-access-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: registration.payload.owner_access_token }),
  });
  assert.equal(privateAccessLogin.response.status, 200, JSON.stringify(privateAccessLogin.payload));
  assert.equal(privateAccessLogin.payload.shop.owner_email, undefined);
  assert.equal(privateAccessLogin.payload.shop.owner_access_token_hash, undefined);

  const reusedPrivateAccessLogin = await apiFetch('/api/auth/merchant-access-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: registration.payload.owner_access_token }),
  });
  assert.equal(reusedPrivateAccessLogin.response.status, 401);

  const ownerLinks = await apiFetch(`/api/shops/${newShopId}/access-link`, { method: 'POST' });
  assert.equal(ownerLinks.response.status, 200, JSON.stringify(ownerLinks.payload));
  assert.ok(String(ownerLinks.payload.access_url).includes('/app?access='));
});

test('super-admin full watchdog workflow: wrong key rejection, access link generation, subscription extension, and cron execution', async () => {
  const phone = uniquePhone();
  const created = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Admin Test',
      whatsapp_number: phone,
      email: uniqueEmail(),
      pin_code: '111111',
      category: 'food',
      city: 'Yamoussoukro',
      subscription_tier: 'standard',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(created.response.status, 200);
  const shopId = created.payload.shop.id;

  const insecureConfirmation = await apiFetch(`/api/shops/${shopId}/payment-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'standard', amount: 3000, payment_reference: 'ADMIN-FLOW-1', payment_method: 'mobile_money' }),
  });
  assert.equal(insecureConfirmation.response.status, 404);
  cookieJar = '';
  const unauthenticatedShopProducts = await apiFetch(`/api/shops/${shopId}/products`);
  assert.equal(unauthenticatedShopProducts.response.status, 401);
  const unauthenticatedAdminShopSession = await apiFetch(`/api/auth/session?admin_shop_id=${shopId}`);
  assert.equal(unauthenticatedAdminShopSession.payload.authenticated, false);

  const merchantLoginForRevocation = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin: '111111' }),
  });
  assert.equal(merchantLoginForRevocation.response.status, 200, JSON.stringify(merchantLoginForRevocation.payload));
  const merchantCookies = cookieJar;
  cookieJar = '';

  const adminHealthBeforeLogin = await apiFetch('/api/admin/health');
  assert.equal(adminHealthBeforeLogin.response.status, 401);

  const adminWrongKey = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'wrong-key' }),
  });
  assert.equal(adminWrongKey.response.status, 401);

  const adminLogin = await apiFetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.response.status, 200);
  const superAdminCookies = cookieJar;

  const adminSessionState = await apiFetch('/api/auth/session');
  assert.equal(adminSessionState.response.status, 200, JSON.stringify(adminSessionState.payload));
  assert.equal(adminSessionState.payload.authenticated, true);
  assert.equal(adminSessionState.payload.userType, 'admin');

  const adminSessionStateAfterRefresh = await apiFetch('/api/auth/session');
  assert.equal(adminSessionStateAfterRefresh.response.status, 200, JSON.stringify(adminSessionStateAfterRefresh.payload));
  assert.equal(adminSessionStateAfterRefresh.payload.authenticated, true);

  const scopedAdminSession = await apiFetch(`/api/auth/session?admin_shop_id=${shopId}`);
  assert.equal(scopedAdminSession.response.status, 200);
  assert.equal(scopedAdminSession.payload.userType, 'merchant');
  assert.equal(scopedAdminSession.payload.shopId, shopId);
  assert.equal(scopedAdminSession.payload.adminShopAccess, true);

  const adminHealth = await apiFetch('/api/admin/health');
  assert.equal(adminHealth.response.status, 200, JSON.stringify(adminHealth.payload));
  assert.equal(adminHealth.payload.status, 'ok');
  assert.equal(typeof adminHealth.payload.counts.shops, 'number');

  const adminShops = await apiFetch('/api/admin/shops');
  assert.equal(adminShops.response.status, 200, JSON.stringify(adminShops.payload));
  assert.ok(adminShops.payload.some((shop: any) => shop.id === shopId));

  const adminOrders = await apiFetch('/api/admin/orders?limit=10');
  assert.equal(adminOrders.response.status, 200, JSON.stringify(adminOrders.payload));
  assert.ok(Array.isArray(adminOrders.payload.orders));
  assert.equal(typeof adminOrders.payload.total, 'number');
  const searchedAdminOrders = await apiFetch(`/api/admin/orders?limit=10&search=${encodeURIComponent(created.payload.shop.name)}`);
  assert.equal(searchedAdminOrders.response.status, 200, JSON.stringify(searchedAdminOrders.payload));
  assert.ok(searchedAdminOrders.payload.orders.every((order: any) => order.shop_name === created.payload.shop.name));
  const invalidAdminOrderFilter = await apiFetch('/api/admin/orders?status=unknown');
  assert.equal(invalidAdminOrderFilter.response.status, 400);

  const adminCustomers = await apiFetch('/api/admin/customers?limit=10');
  assert.equal(adminCustomers.response.status, 200, JSON.stringify(adminCustomers.payload));
  assert.ok(Array.isArray(adminCustomers.payload.customers));
  assert.ok(adminCustomers.payload.customers.every((customer: any) => !('password_hash' in customer)));
  assert.equal(typeof adminCustomers.payload.total, 'number');

  const adminAnalytics = await apiFetch('/api/admin/analytics?days=7');
  assert.equal(adminAnalytics.response.status, 200, JSON.stringify(adminAnalytics.payload));
  assert.equal(adminAnalytics.payload.days, 7);

  const accessLink = await apiFetch(`/api/admin/shops/${shopId}/access-link`, { method: 'POST' });
  assert.equal(accessLink.response.status, 200);
  assert.ok(String(accessLink.payload.access_url).includes('/app?access='));

  const ownerNotification = await apiFetch(`/api/admin/shops/${shopId}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'welcome' }),
  });
  assert.equal(ownerNotification.response.status, 200, JSON.stringify(ownerNotification.payload));
  assert.equal(ownerNotification.payload.delivery_mode, 'whatsapp_click_to_chat');
  assert.ok(String(ownerNotification.payload.whatsapp_url).startsWith('https://wa.me/'));

  const identityVerificationRequest = await apiFetch(`/api/admin/shops/${shopId}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: 'identity_verification' }),
  });
  assert.equal(identityVerificationRequest.response.status, 200, JSON.stringify(identityVerificationRequest.payload));
  assert.ok(String(identityVerificationRequest.payload.whatsapp_url).startsWith('https://wa.me/'));
  assert.match(String(identityVerificationRequest.payload.message), /\/app/);
  assert.match(String(identityVerificationRequest.payload.message), /Didit/);
  assert.match(String(identityVerificationRequest.payload.message), new RegExp(created.payload.shop.name));
  assert.equal(JSON.stringify(identityVerificationRequest.payload).includes('ownerAccessToken'), false);
  assert.equal(identityVerificationRequest.payload.message.includes('{boutique}'), false);

  const customIdentityCampaignMessage = await apiFetch(`/api/admin/shops/${shopId}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: 'identity_verification',
      message: 'Bonjour {boutique}, connectez-vous ici : {dashboard}.',
    }),
  });
  assert.equal(customIdentityCampaignMessage.response.status, 200, JSON.stringify(customIdentityCampaignMessage.payload));
  assert.equal(customIdentityCampaignMessage.payload.message, `Bonjour ${created.payload.shop.name}, connectez-vous ici : ${new URL(BASE_URL).origin}/app.`);

  const listAfterReject = await apiFetch('/api/admin/shops');
  assert.equal(listAfterReject.response.status, 200);
  const rejectedShop = listAfterReject.payload.find((item: any) => item.id === shopId);
  assert.ok(rejectedShop);
  assert.equal(rejectedShop.is_active, true);
  const publicationStatusBeforeToggle = rejectedShop.publication_status;

  cookieJar = merchantCookies;
  const createdShopMerchantSession = await apiFetch(`/api/shops/${shopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: false }),
  });
  assert.equal(createdShopMerchantSession.response.status, 200, JSON.stringify(createdShopMerchantSession.payload));
  cookieJar = superAdminCookies;

  const disableShop = await apiFetch(`/api/admin/shops/${shopId}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: true, reason: 'Contrôle administratif de test.' }),
  });
  assert.equal(disableShop.response.status, 200, JSON.stringify(disableShop.payload));
  assert.equal(disableShop.payload.is_active, false);
  assert.ok(disableShop.payload.revoked_sessions >= 1);
  assert.equal(disableShop.payload.shop.publication_status, publicationStatusBeforeToggle);
  const revokedMerchantSessionsDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const activeMerchantSessions = revokedMerchantSessionsDb.prepare(
      'SELECT COUNT(*) AS count FROM merchant_sessions WHERE shop_id = ?',
    ).get(shopId) as { count: number };
    assert.equal(activeMerchantSessions.count, 0);
  } finally {
    revokedMerchantSessionsDb.close();
  }
  cookieJar = merchantCookies;
  const suspendedMerchantSession = await apiFetch(`/api/shops/${shopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: true }),
  });
  assert.equal(suspendedMerchantSession.response.status, 401);
  const suspendedMerchantSessionState = await apiFetch('/api/auth/session');
  assert.equal(suspendedMerchantSessionState.payload.authenticated, false);
  cookieJar = superAdminCookies;
  const inactiveShopForAdmin = await apiFetch(`/api/shops/${shopId}`);
  assert.equal(inactiveShopForAdmin.response.status, 200, JSON.stringify(inactiveShopForAdmin.payload));
  assert.equal(inactiveShopForAdmin.payload.shop.admin_mode, true);
  const adminProduct = await apiFetch(`/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Article administré', price: 1200, stock: 2 }),
  });
  assert.equal(adminProduct.response.status, 200, JSON.stringify(adminProduct.payload));
  const deleteAdminProduct = await apiFetch(`/api/shops/${shopId}/products/${adminProduct.payload.product.id}`, { method: 'DELETE' });
  assert.equal(deleteAdminProduct.response.status, 200, JSON.stringify(deleteAdminProduct.payload));
  const adminShopUpdate = await apiFetch(`/api/shops/${shopId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ welcome_message: 'Mis à jour par le super-admin.' }),
  });
  assert.equal(adminShopUpdate.response.status, 200, JSON.stringify(adminShopUpdate.payload));
  assert.equal(adminShopUpdate.payload.shop.welcome_message, 'Mis à jour par le super-admin.');
  const adminThemeUpdate = await apiFetch(`/api/shops/${shopId}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme_config: { primary_color: '#123456', social_links: { instagram: 'https://instagram.com/matable' } } }),
  });
  assert.equal(adminThemeUpdate.response.status, 200, JSON.stringify(adminThemeUpdate.payload));
  const adminProAnalytics = await apiFetch(`/api/shops/${shopId}/analytics?days=7`);
  assert.equal(adminProAnalytics.response.status, 200, JSON.stringify(adminProAnalytics.payload));
  const adminPublication = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(adminPublication.response.status, 200, JSON.stringify(adminPublication.payload));
  const adminPublicationReset = await apiFetch(`/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publication_status: 'draft' }),
  });
  assert.equal(adminPublicationReset.response.status, 200, JSON.stringify(adminPublicationReset.payload));
  const adminAudit = await apiFetch('/api/admin/subscriptions');
  assert.ok(adminAudit.payload.audit_logs.some((entry: { action: string; shop_id: number }) =>
    entry.action === 'admin_shop_operation' && entry.shop_id === shopId));
  const auditDb = new Database(TEST_DB_PATH);
  auditDb.prepare(
    'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run('verification_admin', 'test_audit_scrubbing', null, JSON.stringify({ reason: 'Motif visible', secret: 'Ne pas exposer' }), new Date().toISOString());
  auditDb.close();
  const filteredAudit = await apiFetch('/api/admin/audit-logs?search=test_audit_scrubbing&actor=verification_admin');
  assert.equal(filteredAudit.response.status, 200, JSON.stringify(filteredAudit.payload));
  assert.equal(filteredAudit.payload.audit_logs.length, 1);
  assert.equal(filteredAudit.payload.audit_logs[0].actor, 'verification_admin');
  assert.equal(filteredAudit.payload.audit_logs[0].details.reason, 'Motif visible');
  assert.equal(Object.hasOwn(filteredAudit.payload.audit_logs[0].details, 'secret'), false);
  const fullAuditLog = await apiFetch('/api/admin/audit-logs?search=shop&limit=1');
  assert.equal(fullAuditLog.response.status, 200, JSON.stringify(fullAuditLog.payload));
  assert.equal(fullAuditLog.payload.audit_logs.length, 1);
  assert.ok(fullAuditLog.payload.total > 1);
  assert.equal(fullAuditLog.payload.audit_logs[0].actor, 'super_admin');
  assert.equal(Object.hasOwn(fullAuditLog.payload.audit_logs[0].details, 'reason'), false);
  const enableShop = await apiFetch(`/api/admin/shops/${shopId}/toggle-active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_is_active: false, reason: 'Fin du contrôle administratif de test.' }),
  });
  assert.equal(enableShop.response.status, 200, JSON.stringify(enableShop.payload));
  assert.equal(enableShop.payload.is_active, true);
  assert.equal(enableShop.payload.shop.publication_status, publicationStatusBeforeToggle);
  cookieJar = merchantCookies;
  const merchantSessionAfterReactivation = await apiFetch('/api/auth/session');
  assert.equal(merchantSessionAfterReactivation.payload.authenticated, false);
  const merchantAfterReactivation = await apiFetch(`/api/shops/${shopId}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: true }),
  });
  assert.equal(merchantAfterReactivation.response.status, 401);
  cookieJar = superAdminCookies;

  const maintenanceBefore = await apiFetch('/api/admin/maintenance');
  assert.equal(maintenanceBefore.response.status, 200);
  assert.equal(maintenanceBefore.payload.enabled, false);
  const enableMaintenance = await apiFetch('/api/admin/maintenance', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, message: 'Intervention technique en cours.' }),
  });
  assert.equal(enableMaintenance.response.status, 200, JSON.stringify(enableMaintenance.payload));
  try {
    const blockedAnalytics = await apiFetch('/api/analytics/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: shopId, session_id: `maintenance-${Date.now()}`, path: `/${created.payload.shop.slug}` }),
    });
    assert.equal(blockedAnalytics.response.status, 503);
    assert.equal(blockedAnalytics.payload.message, 'Intervention technique en cours.');
    const adminStillAvailable = await apiFetch('/api/admin/health');
    assert.equal(adminStillAvailable.response.status, 200);
  } finally {
    const disableMaintenance = await apiFetch('/api/admin/maintenance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, message: 'Intervention technique en cours.' }),
    });
    assert.equal(disableMaintenance.response.status, 200, JSON.stringify(disableMaintenance.payload));
  }

  const publicApiRestored = await apiFetch('/api/analytics/page-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shopId,
      session_id: `maintenance-restored-${Date.now()}`,
      path: `/${created.payload.shop.slug}`,
      campaign: 'launch_tiktok_1',
    }),
  });
  assert.equal(publicApiRestored.response.status, 204);
  const campaignAnalytics = await apiFetch('/api/admin/analytics?days=7');
  assert.equal(campaignAnalytics.response.status, 200);
  const launchCampaign = campaignAnalytics.payload.campaigns.find((campaign: { campaign: string }) => campaign.campaign === 'launch_tiktok_1');
  assert.ok(launchCampaign);
  assert.ok(launchCampaign.orders >= 1);
  assert.ok(launchCampaign.whatsapp_clicks >= 1);

  const changedFingerprint = await apiFetch('/api/auth/session', {
    headers: { 'Accept-Language': 'en-US' },
  });
  assert.equal(changedFingerprint.response.status, 200);
  assert.equal(changedFingerprint.payload.authenticated, false);
});

test('security hardening: duplicate shop prevention', async () => {
  const phone = uniquePhone();
  const email = uniqueEmail();
  const first = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Récupération',
      whatsapp_number: phone,
      email,
      pin_code: '777777',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(first.response.status, 200);

  const missingConsent = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sans consentement', whatsapp_number: uniquePhone(), email: uniqueEmail(), pin_code: '456789', category: 'fashion' }),
  });
  assert.equal(missingConsent.response.status, 400);
  assert.match(missingConsent.payload.error, /accepter/i);

  const duplicate = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Deuxième boutique même numéro',
      whatsapp_number: phone,
      email: uniqueEmail(),
      pin_code: '402138',
      category: 'fashion',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(duplicate.response.status, 409);

  const duplicateEmail = await apiFetch('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'E-mail déjà utilisé', whatsapp_number: uniquePhone(), email: email.toUpperCase(), pin_code: '402138', category: 'fashion', accepted_terms_privacy: true }),
  });
  assert.equal(duplicateEmail.response.status, 409);

});

test('merchant A cannot access merchant B products, orders, or settings', async () => {
  const merchantAPhone = uniquePhone();
  const merchantBPhone = uniquePhone();
  const createShop = async (name: string, phone: string) => {
    const response = await apiFetch('/api/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, whatsapp_number: phone, email: uniqueEmail(), pin_code: '638294', category: 'fashion', city: 'Abidjan', accepted_terms_privacy: true }),
    });
    assert.equal(response.response.status, 200, JSON.stringify(response.payload));
    return response.payload.shop.id as number;
  };

  const merchantAShopId = await createShop('Boutique Marchand A', merchantAPhone);
  const merchantBShopId = await createShop('Boutique Marchand B', merchantBPhone);

  const loginB = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: merchantBPhone, pin: '638294' }),
  });
  assert.equal(loginB.response.status, 200);
  const product = await apiFetch(`/api/shops/${merchantBShopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Produit privé B', price: 2500, stock: 4 }),
  });
  assert.equal(product.response.status, 200, JSON.stringify(product.payload));
  const productId = product.payload.product.id;

  const loginA = await apiFetch('/api/auth/merchant-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: merchantAPhone, pin: '638294' }),
  });
  assert.equal(loginA.response.status, 200);
  const merchantACookie = (loginA.response.headers.getSetCookie?.() || [])
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => /^(matable_session|matable_session_fp)=/.test(cookie))
    .join('; ');
  assert.match(merchantACookie, /matable_session=/);
  assert.match(merchantACookie, /matable_session_fp=/);

  const attempts = await Promise.all([
    apiFetch(`/api/shops/${merchantBShopId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Intrusion', price: 1, stock: 1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Produit détourné', price: 1, stock: 1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: -1 }),
    }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}/toggle-visibility`, { method: 'PATCH' }),
    apiFetch(`/api/shops/${merchantBShopId}/products/${productId}`, { method: 'DELETE' }),
    apiFetch(`/api/shops/${merchantBShopId}/orders`),
    apiFetch(`/api/shops/${merchantBShopId}/flash-bilan`),
  ]);

  for (const attempt of attempts) assert.equal(attempt.response.status, 401, JSON.stringify(attempt.payload));
  const publishOtherShop = await fetch(`${BASE_URL}/api/shops/${merchantBShopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: merchantACookie },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(publishOtherShop.status, 401, await publishOtherShop.text());
  assert.notEqual(merchantAShopId, merchantBShopId);
});

test('database and order snapshots preserve structural integrity', () => {
  const database = new Database(TEST_DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = database.pragma('quick_check') as Record<string, unknown>[];
    assert.deepEqual(quickCheck.map((row) => Object.values(row)[0]), ['ok']);
    assert.deepEqual(database.pragma('foreign_key_check'), []);
    const orphanProducts = database.prepare('SELECT COUNT(*) AS count FROM products p LEFT JOIN shops s ON s.id = p.shop_id WHERE s.id IS NULL').get() as { count: number };
    const orphanOrders = database.prepare('SELECT COUNT(*) AS count FROM orders o LEFT JOIN shops s ON s.id = o.shop_id WHERE s.id IS NULL').get() as { count: number };
    assert.equal(orphanProducts.count, 0);
    assert.equal(orphanOrders.count, 0);

    const orderRows = database.prepare('SELECT total_amount, items FROM orders').all() as { total_amount: number; items: string | null }[];
    assert.ok(orderRows.length > 0);
    for (const order of orderRows) {
      const items = order.items ? JSON.parse(order.items) as { quantity: number; unit_price: number }[] : [];
      assert.ok(items.every((item) => Number.isSafeInteger(item.quantity) && item.quantity > 0
        && Number.isSafeInteger(item.unit_price) && item.unit_price >= 0));
      assert.equal(items.reduce((total, item) => total + item.quantity * item.unit_price, 0), order.total_amount);
    }
  } finally {
    database.close();
  }
});
