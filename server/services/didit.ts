import { createHmac, timingSafeEqual } from 'node:crypto';

export const DIDIT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DiditSessionResponse {
  session_id: string;
  status: string;
  url: string;
}

export interface DiditWebhookEvent {
  event_id: string;
  session_id: string;
  status: string;
  webhook_type: string;
  timestamp: number;
}

export type DiditWebhookValidation =
  | { ok: true; event: DiditWebhookEvent; timestamp: number }
  | { ok: false; status: number; error: string };

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${sortedJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signatureMatches(signature: string | undefined, payload: Buffer, secret: string, canonicalPayload?: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(canonicalPayload ?? payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function resolveDriverWorkflowId(driverWorkflowId?: string, merchantWorkflowId?: string): string | null {
  const driver = String(driverWorkflowId ?? '').trim();
  const merchant = String(merchantWorkflowId ?? '').trim();
  const candidate = driver || merchant;
  return DIDIT_UUID_PATTERN.test(candidate) ? candidate : null;
}

export function mapDiditStatus(status: string): 'verified' | 'rejected' | 'under_review' | 'submitted' | 'pending' {
  if (status === 'Approved') return 'verified';
  if (status === 'Declined') return 'rejected';
  if (status === 'In Review') return 'under_review';
  if (['Expired', 'Kyc Expired', 'Abandoned'].includes(status)) return 'pending';
  return 'submitted';
}

export function isDiditSession(value: unknown): value is DiditSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DiditSessionResponse>;
  if (typeof session.session_id !== 'string' || !DIDIT_UUID_PATTERN.test(session.session_id)) return false;
  if (typeof session.status !== 'string' || typeof session.url !== 'string') return false;
  try {
    const url = new URL(session.url);
    return url.protocol === 'https:' && url.hostname === 'verify.didit.me';
  } catch {
    return false;
  }
}

export function validateDiditWebhook(
  rawBody: unknown,
  timestampHeader: string | undefined,
  signatureV2: string | undefined,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
): DiditWebhookValidation {
  if (!secret) return { ok: false, status: 503, error: 'Le webhook Didit n’est pas configuré.' };
  if (!Buffer.isBuffer(rawBody)) return { ok: false, status: 400, error: 'Corps webhook invalide.' };

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) {
    return { ok: false, status: 401, error: 'Horodatage webhook invalide ou expiré.' };
  }

  let event: DiditWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as DiditWebhookEvent;
  } catch {
    return { ok: false, status: 400, error: 'Corps webhook JSON invalide.' };
  }
  if (!Number.isFinite(event.timestamp) || Math.abs(now / 1000 - event.timestamp) > 300) {
    return { ok: false, status: 401, error: 'Horodatage signé du webhook invalide ou expiré.' };
  }

  const canonicalPayload = sortedJson(event);
  if (!signatureMatches(signatureV2, rawBody, secret, canonicalPayload)
    && !signatureMatches(signature, rawBody, secret)) {
    return { ok: false, status: 401, error: 'Signature webhook Didit invalide.' };
  }

  return { ok: true, event, timestamp };
}