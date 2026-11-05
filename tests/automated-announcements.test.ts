import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import webPush from 'web-push';

test('automated announcements fire once per shop from shop state', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    dbPath: process.env.MATABLE_DB_PATH,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-auto-announcements-'));
  process.env.NODE_ENV = 'test';
  process.env.MATABLE_DB_PATH = path.join(directory, 'announcements.db');
  process.env.VAPID_PUBLIC_KEY = 'A'.repeat(87);
  process.env.VAPID_PRIVATE_KEY = 'B'.repeat(43);
  process.env.VAPID_SUBJECT = 'mailto:assistance@matable-ci.com';

  let database: typeof import('../db.ts') | undefined;
  const originalSendNotification = webPush.sendNotification;
  try {
    database = await import('../db.ts');
    await database.initializeDatabase();
    const { runAutomatedMerchantAnnouncements, getAutomatedAnnouncementStats } = await import('../server/services/automatedAnnouncements.ts');
    const titles: string[] = [];
    webPush.sendNotification = async (_subscription, payload) => {
      if (typeof payload !== 'string') throw new TypeError('Expected a serialized Push payload.');
      titles.push((JSON.parse(payload) as { title: string }).title);
      return { statusCode: 201, body: '', headers: {} };
    };

    // Lundi 12:00 UTC : le résumé hebdomadaire est dû.
    const now = new Date('2026-11-09T12:00:00.000Z');
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
    const insertShop = (id: number, createdDays: number, publication: string, verification: string) => database!.dbRun(
      `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier, publication_status, merchant_verification_status)
       VALUES (?, ?, ?, '+2250700000000', 'hash', ?, 'other', 'standard', ?, ?)`,
      [id, `Boutique ${id}`, `boutique-${id}`, daysAgo(createdDays), publication, verification],
    );
    const subscribe = (shopId: number) => database!.dbRun(
      `INSERT INTO merchant_push_subscriptions (shop_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, 'public-key', 'auth-secret', ?, ?)`,
      [shopId, `https://fcm.googleapis.com/fcm/send/auto-${shopId}`, daysAgo(0), daysAgo(0)],
    );

    // 1 : neuve, sans produit, identité en attente. 2 : active avec trafic. 3 : active et inactive. 4 : sans abonnement Push.
    await insertShop(1, 3, 'draft', 'pending');
    await insertShop(2, 30, 'active', 'verified');
    await insertShop(3, 30, 'active', 'verified');
    await insertShop(4, 30, 'draft', 'pending');
    for (const shopId of [1, 2, 3]) await subscribe(shopId);
    await database.dbRun(
      `INSERT INTO products (shop_id, title, price, created_at) VALUES (2, 'Produit', 1000, ?), (3, 'Produit', 1000, ?)`,
      [daysAgo(20), daysAgo(20)],
    );
    await database.dbRun(
      `INSERT INTO analytics_events (shop_id, event_type, session_id, created_at) VALUES (2, 'page_view', 'visitor-1', ?)`,
      [daysAgo(5)],
    );

    await runAutomatedMerchantAnnouncements(now);
    assert.equal(titles.filter((title) => title === 'Alertes activées ✅').length, 3);
    assert.equal(titles.filter((title) => title === 'Complétez votre vérification d’identité').length, 1);
    assert.equal(titles.filter((title) => title === 'Ajoutez votre premier produit').length, 1);
    assert.equal(titles.filter((title) => title === 'Votre semaine sur MaTable').length, 1);
    assert.equal(titles.filter((title) => title === 'Votre boutique est calme').length, 1);

    const sentCount = titles.length;
    await runAutomatedMerchantAnnouncements(new Date(now.getTime() + 15 * 60 * 1000));
    assert.equal(titles.length, sentCount);

    const stats = await getAutomatedAnnouncementStats();
    assert.equal(stats.find((rule) => rule.id === 'welcome')?.shops_reached_30d, 3);
    assert.equal(stats.length, 6);

    // Heures calmes : rien ne part la nuit, même un lundi.
    const night = new Date('2026-11-16T22:30:00.000Z');
    assert.deepEqual(await runAutomatedMerchantAnnouncements(night), { checked: 0, queued: 0 });
    assert.equal(titles.length, sentCount);

    // Un commerçant qui désactive les catégories ne reçoit que le message de bienvenue.
    await insertShop(5, 30, 'active', 'pending');
    await subscribe(5);
    await database.dbRun('INSERT INTO merchant_push_preferences (shop_id, weekly_summary, reminders, updated_at) VALUES (5, 0, 0, ?)', [daysAgo(0)]);
    await database.dbRun(
      `INSERT INTO analytics_events (shop_id, event_type, session_id, created_at) VALUES (5, 'page_view', 'visitor-5', ?)`,
      [new Date('2026-11-12T10:00:00.000Z').toISOString()],
    );
    await runAutomatedMerchantAnnouncements(new Date('2026-11-16T12:00:00.000Z'));
    const optedOutKeys = await database.dbAll<{ event_key: string }>('SELECT event_key FROM merchant_push_deliveries WHERE shop_id = 5');
    assert.deepEqual(optedOutKeys.map(({ event_key }) => event_key), ['auto-welcome']);

    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    assert.deepEqual(await runAutomatedMerchantAnnouncements(new Date(now.getTime() + 8 * 86400000)), { checked: 0, queued: 0 });
  } finally {
    webPush.sendNotification = originalSendNotification;
    await database?.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('NODE_ENV', previous.nodeEnv);
    restore('MATABLE_DB_PATH', previous.dbPath);
    restore('VAPID_PUBLIC_KEY', previous.publicKey);
    restore('VAPID_PRIVATE_KEY', previous.privateKey);
    restore('VAPID_SUBJECT', previous.subject);
  }
});
