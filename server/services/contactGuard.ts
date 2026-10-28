import type { Request } from 'express';

interface ContactTransaction {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
}

export type OrderContactActorType = 'customer' | 'merchant';
type ContactRevealActorType = OrderContactActorType | 'driver';

export const TERMINAL_ORDER_CONTACT_STATUSES = new Set(['delivered', 'cancelled', 'expired', 'refunded']);

export function isOrderContactAvailable(status: string): boolean {
  return !TERMINAL_ORDER_CONTACT_STATUSES.has(status.trim().toLowerCase());
}

export function maskContactPhone(phone: string): string {
  if (!phone.trim()) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';
  const prefix = digits.startsWith('225') ? '+225 ' : digits.startsWith('0') ? '0' : '';
  const visiblePrefixLength = prefix === '+225 ' ? 3 : prefix ? 1 : 0;
  const hiddenDigits = Math.max(3, digits.length - visiblePrefixLength - 4);
  return `${prefix}${'•'.repeat(hiddenDigits)} ${digits.slice(-4)}`;
}

export function hashContactIp(req: Request, hashAccessToken: (token: string) => string): string {
  return hashAccessToken(String(req.ip || req.socket.remoteAddress || 'unknown'));
}

export async function checkContactRevealRateLimit(
  transaction: ContactTransaction,
  input: {
    actorType: ContactRevealActorType;
    actorId: number;
    ipHash: string;
    nowMs: number;
    hashAccessToken: (token: string) => string;
  },
): Promise<boolean> {
  const limits = [
    { key: input.hashAccessToken(`contact-reveal-account:${input.actorType}:${input.actorId}`), limit: 5 },
    { key: input.hashAccessToken(`contact-reveal-ip:${input.ipHash}`), limit: 10 },
  ];
  let limited = false;
  for (const rate of limits) {
    const counter = await transaction.get<{ request_count: number | string }>(`
      INSERT INTO request_rate_limits (key_hash, request_count, reset_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key_hash) DO UPDATE SET
        request_count = CASE WHEN request_rate_limits.reset_at <= ? THEN 1 ELSE request_rate_limits.request_count + 1 END,
        reset_at = CASE WHEN request_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE request_rate_limits.reset_at END
      RETURNING request_count
    `, [rate.key, input.nowMs + 10 * 60 * 1000, input.nowMs, input.nowMs]);
    if (!counter) throw new Error('Unable to update order contact reveal limits.');
    if (Number(counter.request_count) > rate.limit) limited = true;
  }
  return !limited;
}

export async function auditOrderContactReveal(
  transaction: ContactTransaction,
  input: {
    orderId: number;
    actorType: OrderContactActorType;
    actorId: number;
    contactRole: OrderContactActorType;
    ipHash: string;
    revealedAt: string;
  },
): Promise<void> {
  await transaction.get(`
    INSERT INTO order_contact_audits
      (order_id, actor_type, actor_id, contact_role, ip_hash, revealed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [input.orderId, input.actorType, input.actorId, input.contactRole, input.ipHash, input.revealedAt]);
}
