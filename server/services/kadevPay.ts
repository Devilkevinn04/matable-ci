import { createHmac, timingSafeEqual } from 'node:crypto';

export function isValidKadevPaySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function getRenewedSubscriptionExpiry(
  currentExpiry: string | null | undefined,
  now = new Date(),
  term: 'monthly' | 'annual' = 'monthly',
): string {
  const currentExpiryTime = currentExpiry ? Date.parse(currentExpiry) : NaN;
  const startsAt = Number.isFinite(currentExpiryTime) && currentExpiryTime > now.getTime()
    ? currentExpiryTime
    : now.getTime();
  const expiry = new Date(startsAt);
  const dayOfMonth = expiry.getUTCDate();
  expiry.setUTCDate(1);
  expiry.setUTCMonth(expiry.getUTCMonth() + (term === 'annual' ? 12 : 1));
  const lastDayOfMonth = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0)).getUTCDate();
  expiry.setUTCDate(Math.min(dayOfMonth, lastDayOfMonth));
  return expiry.toISOString();
}