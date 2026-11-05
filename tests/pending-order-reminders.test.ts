import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import webPush from 'web-push';

test('pending order reminders are sent once inside the response window and never retried late', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabasePath = process.env.MATABLE_DB_PATH;
  const previousPublicKey = process.env.VAPID_PUBLIC_KEY;
  const previousPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const previousSubject = process.env.VAPID_SUBJECT;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-order-reminders-'));
  process.env.NODE_ENV = 'test';
  process.env.MATABLE_DB_PATH = path.join(directory, 'reminders.db');
  process.env.VAPID_PUBLIC_KEY = 'A'.repeat(87);
  process.env.VAPID_PRIVATE_KEY = 'B'.repeat(43);
  process.env.VAPID_SUBJECT = 'mailto:assistance@matable-ci.com';

  let database: typeof import('../db.ts') | undefined;
  const originalSendNotification = webPush.sendNotification;
  try {
    database = await import('../db.ts');
    await database.initializeDatabase();
    const { expireStalePendingOrders, remindPendingOrdersWithoutResponse } = await import('../server/services/orderLifecycle.ts');
    const { retryPendingMerchantPushes } = await import('../server/services/pushNotifications.ts');
    const sentPayloads: Array<{ title: string; body: string }> = [];
    webPush.sendNotification = async (_subscription, payload) => {
      if (typeof payload !== 'string') throw new TypeError('Expected a serialized Push payload.');
      sentPayloads.push(JSON.parse(payload) as { title: string; body: string });
      return { statusCode: 201, body: '', headers: {} };
    };

    await database.dbRun(
      `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier)
       VALUES (1, 'Boutique avec Push', 'push-active', '+2250700000001', 'hash', ?, 'other', 'standard')`,
      [new Date().toISOString()],
    );
    await database.dbRun(
      `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier)
       VALUES (2, 'Boutique sans Push', 'push-inactive', '+2250700000002', 'hash', ?, 'other', 'standard')`,
      [new Date().toISOString()],
    );
    await database.dbRun(
      `INSERT INTO merchant_push_subscriptions (shop_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (1, 'https://fcm.googleapis.com/fcm/send/reminder-test', 'public-key', 'auth-secret', ?, ?)`,
      [new Date().toISOString(), new Date().toISOString()],
    );

    const nowMs = Date.now();
    const insertOrder = async (shopId: number, ageMs: number, status = 'pending') => {
      const timestamp = new Date(nowMs - ageMs).toISOString();
      const result = await database!.dbRun(
        `INSERT INTO orders
          (shop_id, customer_name, customer_phone, delivery_location, total_amount, created_at, items, status, pending_since)
         VALUES (?, 'Client test', '+2250700000000', 'Abidjan', 5000, ?, '[]', ?, ?)`,
        [shopId, timestamp, status, status === 'pending' ? timestamp : null],
      );
      return { id: Number(result.lastInsertRowid), pendingSince: timestamp };
    };

    const tooEarly = await insertOrder(1, 20 * 60 * 1000);
    const dueAtThirtyMinutes = await insertOrder(1, 30 * 60 * 1000);
    const dueBeforeExpiry = await insertOrder(1, 119 * 60 * 1000);
    const dueAtExpiry = await insertOrder(1, 2 * 60 * 60 * 1000);
    const alreadyHandled = await insertOrder(1, 45 * 60 * 1000, 'accepted');
    const noPushSubscription = await insertOrder(2, 60 * 60 * 1000);

    assert.equal(await remindPendingOrdersWithoutResponse(nowMs), 2);
    assert.deepEqual(sentPayloads.map(({ title }) => title), ['Commande en attente', 'Commande en attente']);
    const sentReminders = await database.dbAll<{ event_key: string }>(
      'SELECT event_key FROM merchant_push_deliveries WHERE sent_at IS NOT NULL AND event_key LIKE ? ORDER BY event_key',
      ['pending-order-reminder:%'],
    );
    assert.deepEqual(sentReminders.map(({ event_key }) => event_key), [
      `pending-order-reminder:${dueAtThirtyMinutes.id}:${dueAtThirtyMinutes.pendingSince}`,
      `pending-order-reminder:${dueBeforeExpiry.id}:${dueBeforeExpiry.pendingSince}`,
    ].sort());
    assert.equal(await remindPendingOrdersWithoutResponse(nowMs), 0);
    assert.equal(sentPayloads.length, 2);

    const reminderEvent = `pending-order-reminder:${dueAtThirtyMinutes.id}:${dueAtThirtyMinutes.pendingSince}`;
    await database.dbRun(
      `UPDATE merchant_push_deliveries SET sent_at = NULL, attempted_at = ?, attempts = 1
       WHERE shop_id = 1 AND event_key = ?`,
      [new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), reminderEvent],
    );
    assert.equal(await retryPendingMerchantPushes(), 0);
    assert.equal(sentPayloads.length, 2);

    const expiredEventKey = `pending-order-reminder:${dueAtExpiry.id}:${dueAtExpiry.pendingSince}`;
    await database.dbRun(
      `INSERT INTO merchant_push_deliveries
        (shop_id, event_key, payload_json, attempted_at, attempts)
       VALUES (1, ?, '{}', ?, 1)`,
      [expiredEventKey, new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()],
    );
    const expiredOrders = await expireStalePendingOrders(nowMs);
    assert.ok(expiredOrders.some((order) => order.orderId === dueAtExpiry.id));
    const closedExpiredReminder = await database.dbGet<{ sent_at: string | null }>(
      'SELECT sent_at FROM merchant_push_deliveries WHERE shop_id = 1 AND event_key = ?',
      [expiredEventKey],
    );
    assert.ok(closedExpiredReminder?.sent_at);
    const expiredOrder = await database.dbGet<{ status: string }>('SELECT status FROM orders WHERE id = ?', [dueAtExpiry.id]);
    assert.equal(expiredOrder?.status, 'expired');
    assert.ok(tooEarly.id);
    assert.ok(dueBeforeExpiry.id);
    assert.ok(alreadyHandled.id);
    assert.ok(noPushSubscription.id);

    const noVapidEligible = await insertOrder(1, 60 * 60 * 1000);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    assert.equal(await remindPendingOrdersWithoutResponse(nowMs), 0);
    assert.equal(sentPayloads.length, 2);
    const noVapidDelivery = await database.dbGet<{ event_key: string }>(
      'SELECT event_key FROM merchant_push_deliveries WHERE shop_id = 1 AND event_key = ?',
      [`pending-order-reminder:${noVapidEligible.id}:${noVapidEligible.pendingSince}`],
    );
    assert.equal(noVapidDelivery, undefined);
  } finally {
    webPush.sendNotification = originalSendNotification;
    await database?.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousDatabasePath === undefined) delete process.env.MATABLE_DB_PATH;
    else process.env.MATABLE_DB_PATH = previousDatabasePath;
    if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
    if (previousPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = previousPrivateKey;
    if (previousSubject === undefined) delete process.env.VAPID_SUBJECT;
    else process.env.VAPID_SUBJECT = previousSubject;
  }
});
