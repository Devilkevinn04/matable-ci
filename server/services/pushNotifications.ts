import webpush, { type PushSubscription } from 'web-push';
import { dbAll, dbGet, dbRun } from '../../db.ts';

const allowedPushServiceHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
]);

export type MerchantPushCategory = 'orders' | 'stock' | 'subscription' | 'identity' | 'announcement' | 'delivery';

export interface MerchantPushNotification {
  eventKey: string;
  category: MerchantPushCategory;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface VapidConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfiguration(env: NodeJS.ProcessEnv = process.env): VapidConfiguration | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject
    || !/^[A-Za-z0-9_-]{86,88}$/.test(publicKey)
    || !/^[A-Za-z0-9_-]{42,44}$/.test(privateKey)) return null;
  try {
    const subjectUrl = new URL(subject);
    const validSubject = subjectUrl.protocol === 'mailto:'
      ? subjectUrl.pathname.includes('@') && !/\s/.test(subjectUrl.pathname)
      : subjectUrl.protocol === 'https:' && Boolean(subjectUrl.hostname) && !subjectUrl.username && !subjectUrl.password;
    return validSubject ? { publicKey, privateKey, subject } : null;
  } catch {
    return null;
  }
}

export function normalizePushUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')
    || /[\u0000-\u001f\\]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://matable.ci');
    if (url.origin !== 'https://matable.ci') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function isAllowedPushEndpoint(value: URL): boolean {
  const hostname = value.hostname.toLowerCase();
  return value.protocol === 'https:'
    && !value.username
    && !value.password
    && !value.hash
    && (!value.port || value.port === '443')
    && (allowedPushServiceHosts.has(hostname) || hostname.endsWith('.notify.windows.com'));
}

export function normalizePushText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

async function forEachLimited<T>(items: T[], concurrency: number, operation: (item: T) => Promise<void>) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) await operation(item);
    }
  }));
}

export interface PushTargetSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface BrowserPushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function parseBrowserPushSubscription(body: unknown): BrowserPushSubscriptionInput | null {
  const subscription = (body as { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } } | null)
    ?.subscription;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
  const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';
  if (!endpoint || endpoint.length > 2048 || !p256dh || p256dh.length > 256 || !auth || auth.length > 256) return null;
  try {
    if (!isAllowedPushEndpoint(new URL(endpoint))) return null;
  } catch {
    return null;
  }
  return { endpoint, p256dh, auth };
}

export interface PushTargetNotification {
  title: string;
  body: string;
  url: string;
  tag: string;
  category: MerchantPushCategory;
}

export async function sendPushToSubscriptions(
  subscriptions: PushTargetSubscription[],
  notification: PushTargetNotification,
  removeSubscription: (id: number) => Promise<unknown>,
) {
  const vapid = getVapidConfiguration();
  if (!vapid) return { configured: false, attempted: 0, sent: 0, failed: 0 };
  const url = normalizePushUrl(notification.url);
  const title = normalizePushText(notification.title, 100);
  const body = normalizePushText(notification.body, 240);
  if (!subscriptions.length || !url || !title || !body) {
    return { configured: true, attempted: 0, sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let sent = 0;
  let failed = 0;
  await forEachLimited(subscriptions, 8, async (subscription) => {
    const payload: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    try {
      await webpush.sendNotification(payload, JSON.stringify({
        title,
        body,
        url,
        tag: notification.tag.slice(0, 120),
        category: notification.category,
      }), { TTL: 60 * 60 * 24, urgency: 'normal' });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = getStatusCode(error);
      if (statusCode === 404 || statusCode === 410) await removeSubscription(subscription.id);
      console.error(`Push delivery failed (${statusCode ? `http_${statusCode}` : 'provider_error'}).`);
    }
  });
  return { configured: true, attempted: subscriptions.length, sent, failed };
}

export async function sendMerchantPush(shopId: number, notification: MerchantPushNotification) {
  const vapid = getVapidConfiguration();
  if (!vapid) return { configured: false, attempted: 0, sent: 0, failed: 0 };

  const url = normalizePushUrl(notification.url);
  const title = normalizePushText(notification.title, 100);
  const body = normalizePushText(notification.body, 240);
  if (!Number.isSafeInteger(shopId) || shopId <= 0 || !notification.eventKey || notification.eventKey.length > 240
    || !url || !title || !body) {
    throw new Error('Paramètres de notification Push invalides.');
  }

  const subscriptions = await dbAll<{ id: number; endpoint: string; p256dh: string; auth: string }>(
    'SELECT id, endpoint, p256dh, auth FROM merchant_push_subscriptions WHERE shop_id = ?',
    [shopId],
  );
  if (!subscriptions.length) {
    await dbRun(`UPDATE merchant_push_deliveries SET sent_at = ?, last_error = 'no_active_subscriptions'
      WHERE shop_id = ? AND event_key = ? AND sent_at IS NULL`,
    [new Date().toISOString(), shopId, notification.eventKey]);
    return { configured: true, attempted: 0, sent: 0, failed: 0 };
  }

  const attemptedAt = new Date().toISOString();
  const retryBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const claim = await dbRun(`INSERT INTO merchant_push_deliveries
    (shop_id, event_key, payload_json, attempted_at, attempts)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (shop_id, event_key) DO UPDATE
      SET payload_json = excluded.payload_json,
          attempted_at = excluded.attempted_at,
          attempts = merchant_push_deliveries.attempts + 1,
          last_error = NULL
      WHERE merchant_push_deliveries.sent_at IS NULL
        AND merchant_push_deliveries.attempted_at <= ?
        AND merchant_push_deliveries.attempts < 5`,
  [shopId, notification.eventKey, JSON.stringify({ ...notification, title, body, url }), attemptedAt, retryBefore]);
  if (claim.changes !== 1) return { configured: true, attempted: 0, sent: 0, failed: 0, duplicate: true };

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  await forEachLimited(subscriptions, 8, async (subscription) => {
    const payload: PushSubscription = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };
    try {
      await webpush.sendNotification(payload, JSON.stringify({
        title,
        body,
        url,
        tag: notification.tag.slice(0, 120),
        category: notification.category,
      }), { TTL: 60 * 60 * 24, urgency: 'normal' });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = getStatusCode(error);
      const reason = statusCode ? `http_${statusCode}` : 'provider_error';
      errors.push(reason);
      if (statusCode === 404 || statusCode === 410) {
        await dbRun('DELETE FROM merchant_push_subscriptions WHERE id = ?', [subscription.id]);
      }
      console.error(`Push failed for shop ${shopId} (${reason}).`);
    }
  });

  await dbRun(`UPDATE merchant_push_deliveries SET sent_at = ?, last_error = ?
    , attempted_count = ?, sent_count = ?, failed_count = ?
    WHERE shop_id = ? AND event_key = ?`,
  [sent > 0 && failed === 0 ? new Date().toISOString() : null, errors.length ? [...new Set(errors)].join(',').slice(0, 240) : null,
    subscriptions.length, sent, failed, shopId, notification.eventKey]);
  return { configured: true, attempted: subscriptions.length, sent, failed };
}

export async function retryPendingMerchantPushes() {
  if (!getVapidConfiguration()) return 0;
  const retryBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const deliveries = await dbAll<{ shop_id: number; event_key: string; payload_json: string }>(
    `SELECT shop_id, event_key, payload_json FROM merchant_push_deliveries
     WHERE sent_at IS NULL AND attempted_at <= ? AND attempts < 5
     ORDER BY attempted_at ASC LIMIT 100`,
    [retryBefore],
  );
  await forEachLimited(deliveries, 4, async (delivery) => {
    try {
      const notification = JSON.parse(delivery.payload_json) as MerchantPushNotification;
      if (notification.eventKey !== delivery.event_key) throw new Error('Clé d’événement Push persistée invalide.');
      await sendMerchantPush(Number(delivery.shop_id), notification);
    } catch (error) {
      console.error(`Unable to retry push delivery for shop ${delivery.shop_id} (${delivery.event_key}).`, error);
    }
  });
  return deliveries.length;
}

export function dispatchStockTransitionPush(
  shopId: number,
  product: { id: number; title: string },
  previousStock: number,
  stock: number,
  eventKey: string,
) {
  if (!(previousStock > 0 && stock === 0) && !(previousStock > 3 && stock <= 3)) return;
  const outOfStock = stock === 0;
  void sendMerchantPush(shopId, {
    eventKey,
    category: 'stock',
    title: outOfStock ? 'Produit en rupture de stock' : 'Stock bientôt épuisé',
    body: outOfStock ? `${product.title} est maintenant épuisé.` : `Il ne reste que ${stock} unité(s) de ${product.title}.`,
    url: '/app',
    tag: `stock-${product.id}`,
  }).catch((error: unknown) => console.error(`Unable to queue stock notification for shop ${shopId}.`, error));
}

export async function sendPlatformAnnouncementPush(announcement: {
  id: number;
  title: string;
  body: string;
  url: string;
}) {
  const shopRows = await dbAll<{ shop_id: number }>('SELECT DISTINCT shop_id FROM merchant_push_subscriptions ORDER BY shop_id');
  let sent = 0;
  let failed = 0;
  let attempted = 0;
  await forEachLimited(shopRows, 8, async ({ shop_id }) => {
    try {
      const result = await sendMerchantPush(Number(shop_id), {
        eventKey: `announcement-${announcement.id}`,
        category: 'announcement',
        title: announcement.title,
        body: announcement.body,
        url: announcement.url,
        tag: `announcement-${announcement.id}`,
      });
      attempted += result.attempted;
      sent += result.sent;
      failed += result.failed;
    } catch (error) {
      failed += 1;
      console.error(`Unable to send platform announcement ${announcement.id} to shop ${shop_id}.`, error);
    }
  });
  return { recipientShops: shopRows.length, attempted, sent, failed };
}

export async function getPushSubscriptionCount() {
  const result = await dbGet<{ count: number | string }>('SELECT COUNT(*) AS count FROM merchant_push_subscriptions');
  return Number(result?.count || 0);
}
