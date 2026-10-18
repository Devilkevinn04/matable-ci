import { createHmac, timingSafeEqual } from 'node:crypto';
export { getRenewedSubscriptionExpiry } from '../../src/utils/subscriptionExpiry.ts';

export function isValidKadevPaySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}
