import { createHmac, timingSafeEqual } from 'node:crypto';

export function isValidKadevPaySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function getRenewedSubscriptionExpiry(currentExpiry: string | null | undefined, now = new Date(), durationDays = 30): string {
  const currentExpiryTime = currentExpiry ? Date.parse(currentExpiry) : NaN;
  const startsAt = Number.isFinite(currentExpiryTime) && currentExpiryTime > now.getTime()
    ? currentExpiryTime
    : now.getTime();
  return new Date(startsAt + durationDays * 86400000).toISOString();
}