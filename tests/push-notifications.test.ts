import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getVapidConfiguration,
  isAllowedPushEndpoint,
  normalizePushText,
  normalizePushUrl,
} from '../server/services/pushNotifications.ts';

const publicKey = 'A'.repeat(87);
const privateKey = 'B'.repeat(43);

test('VAPID configuration stays disabled until every server value is present', () => {
  assert.equal(getVapidConfiguration({}), null);
  assert.equal(getVapidConfiguration({
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
  }), null);
  assert.deepEqual(getVapidConfiguration({
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: 'mailto:assistance@matable.ci',
  }), {
    publicKey,
    privateKey,
    subject: 'mailto:assistance@matable.ci',
  });
  assert.equal(getVapidConfiguration({
    VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: 'http://matable.ci',
  }), null);
});

test('push subscriptions accept only HTTPS endpoints from browser push services', () => {
  assert.equal(isAllowedPushEndpoint(new URL('https://fcm.googleapis.com/fcm/send/token')), true);
  assert.equal(isAllowedPushEndpoint(new URL('https://updates.push.services.mozilla.com/wpush/v2/token')), true);
  assert.equal(isAllowedPushEndpoint(new URL('https://notify.windows.com/channel')), false);
  assert.equal(isAllowedPushEndpoint(new URL('https://attacker.example/')), false);
  assert.equal(isAllowedPushEndpoint(new URL('http://fcm.googleapis.com/fcm/send/token')), false);
  assert.equal(isAllowedPushEndpoint(new URL('https://fcm.googleapis.com:444/fcm/send/token')), false);
  assert.equal(isAllowedPushEndpoint(new URL('https://user:password@fcm.googleapis.com/fcm/send/token')), false);
});

test('push links accept only internal absolute paths', () => {
  assert.equal(normalizePushUrl('/merchant?tab=orders'), '/merchant?tab=orders');
  assert.equal(normalizePushUrl('/'), '/');
  assert.equal(normalizePushUrl('https://attacker.example/'), null);
  assert.equal(normalizePushUrl('//attacker.example/'), null);
  assert.equal(normalizePushUrl('/\\\\attacker.example'), null);
  assert.equal(normalizePushUrl('javascript:alert(1)'), null);
  assert.equal(normalizePushUrl('/' + 'a'.repeat(501)), null);
});

test('push text removes markup and enforces its display length', () => {
  assert.equal(normalizePushText('  Nouvelle <b>commande</b>  ', 100), 'Nouvelle commande');
  assert.equal(normalizePushText('<script>alerte</script>', 5), 'alert');
  assert.equal(normalizePushText(42, 100), '');
});
