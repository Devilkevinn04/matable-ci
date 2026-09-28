import { createHmac, timingSafeEqual } from 'node:crypto';

const DIDIT_API_URL = 'https://verification.didit.me';
const DIDIT_HOSTED_FLOW_HOST = 'verify.didit.me';

function diditApiUrl(path: string) {
  const testBaseUrl = process.env.NODE_ENV === 'test' ? String(process.env.DIDIT_API_BASE_URL || '').replace(/\/$/, '') : '';
  return `${testBaseUrl || DIDIT_API_URL}${path}`;
}

export interface DiditConfiguration {
  apiKey: string;
  workflowId: string;
  webhookSecret: string;
}

export interface DiditSession {
  sessionId: string;
  url: string;
}

export interface DiditDecision {
  session_id: string;
  status: string;
}

export function isMerchantKycEnabled() {
  return process.env.MERCHANT_KYC_MODE === 'didit';
}

export function getDiditConfiguration(): DiditConfiguration | null {
  const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
  const workflowId = String(process.env.DIDIT_WORKFLOW_ID || '').trim();
  const webhookSecret = String(process.env.DIDIT_WEBHOOK_SECRET || '').trim();
  if (!apiKey || !workflowId || !webhookSecret) return null;
  return { apiKey, workflowId, webhookSecret };
}

export function canonicalizeDiditPayload(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, nested]) => [key, sort(nested)]));
    }
    return item;
  };
  return JSON.stringify(sort(value));
}

export function verifyDiditWebhookSignature(
  payload: unknown,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(nowSeconds - issuedAt) > 300) return false;

  const expected = createHmac('sha256', secret).update(canonicalizeDiditPayload(payload), 'utf8').digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function createDiditVerificationSession(input: {
  shopId: number;
  callbackUrl: string;
  email?: string;
  configuration?: DiditConfiguration;
}): Promise<DiditSession> {
  const configuration = input.configuration || getDiditConfiguration();
  if (!configuration) throw new Error('Didit n’est pas configuré.');

  const callback = new URL(input.callbackUrl);
  if (callback.protocol !== 'https:' && callback.hostname !== 'localhost' && callback.hostname !== '127.0.0.1') {
    throw new Error('L’URL de retour KYC doit utiliser HTTPS.');
  }

  const response = await fetch(diditApiUrl('/v3/session/'), {
    method: 'POST',
    headers: {
      'x-api-key': configuration.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: configuration.workflowId,
      vendor_data: `shop:${input.shopId}`,
      callback: callback.toString(),
      callback_method: 'both',
      language: 'fr',
      ...(input.email ? { contact_details: { email: input.email, send_notification_emails: false } } : {}),
      expected_details: {
        id_country: 'CIV',
        expected_document_types: ['ID', 'P'],
      },
      metadata: { entity_type: 'merchant', shop_id: input.shopId },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`Didit a refusé la création de session (${response.status}).`);
  const payload = await response.json() as { session_id?: unknown; url?: unknown };
  const sessionId = String(payload.session_id || '').trim();
  const sessionUrl = String(payload.url || '').trim();
  let hostedUrl: URL;
  try {
    hostedUrl = new URL(sessionUrl);
  } catch {
    throw new Error('Didit a renvoyé une URL de vérification invalide.');
  }
  if (!sessionId || sessionId.length > 160 || hostedUrl.protocol !== 'https:' || hostedUrl.hostname !== DIDIT_HOSTED_FLOW_HOST) {
    throw new Error('Didit a renvoyé une session de vérification invalide.');
  }
  return { sessionId, url: hostedUrl.toString() };
}

export async function fetchDiditDecision(sessionId: string, configuration?: DiditConfiguration): Promise<DiditDecision> {
  const activeConfiguration = configuration || getDiditConfiguration();
  if (!activeConfiguration) throw new Error('Didit n’est pas configuré.');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(sessionId)) throw new Error('Identifiant de session Didit invalide.');

  const response = await fetch(diditApiUrl(`/v3/session/${encodeURIComponent(sessionId)}/decision/`), {
    headers: { 'x-api-key': activeConfiguration.apiKey },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Didit n’a pas pu confirmer la décision (${response.status}).`);
  const payload = await response.json() as { session_id?: unknown; status?: unknown };
  if (String(payload.session_id || '') !== sessionId || typeof payload.status !== 'string') {
    throw new Error('Réponse de décision Didit invalide.');
  }
  return { session_id: sessionId, status: payload.status };
}