import { createHmac, timingSafeEqual } from 'node:crypto';
export { getRenewedSubscriptionExpiry } from '../../src/utils/subscriptionExpiry.ts';

const DEFAULT_GENIUSPAY_API_URL = 'https://geniuspay.ci/api/v1/merchant/payments';

interface GeniusPayCheckoutRequest {
  amount: number;
  description: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    country: 'CI';
  };
  success_url: string;
  error_url: string;
  metadata: {
    subscription_payment_id: string;
    payment_type: 'subscription' | 'promotion';
  };
}

interface GeniusPayApiResponse {
  success?: boolean;
  message?: string;
  error?: { code?: string; message?: string };
  data?: {
    reference?: string;
    checkout_url?: string;
    payment_url?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    metadata?: { subscription_payment_id?: string; payment_type?: string };
    transaction?: {
      reference?: string;
      amount?: number | string;
      currency?: string;
      status?: string;
      metadata?: { subscription_payment_id?: string; payment_type?: string };
    };
  };
}

export interface GeniusPayPayment {
  reference: string;
  amount: number;
  currency: string;
  status: string;
  metadata: { subscription_payment_id?: string; payment_type?: string };
}

export class GeniusPayApiError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = 'GeniusPayApiError';
  }
}

function getGeniusPayApiUrl(): string {
  const configuredUrl = String(process.env.GENIUSPAY_API_URL || DEFAULT_GENIUSPAY_API_URL).trim();
  try {
    const url = new URL(configuredUrl);
    const hostname = url.hostname.toLowerCase();
    const localTestHost = process.env.NODE_ENV === 'test'
      && ['127.0.0.1', 'localhost', '::1'].includes(hostname);
    if ((!localTestHost && url.protocol !== 'https:')
      || (!localTestHost && hostname !== 'geniuspay.ci' && !hostname.endsWith('.geniuspay.ci'))
      || url.username
      || url.password
      || url.search
      || url.hash) {
      throw new Error('Invalid API URL');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new GeniusPayApiError('L’URL de l’API GeniusPay est invalide.', false);
  }
}

export function isValidGeniusPaySignature(
  rawBody: Buffer,
  signature: string,
  timestamp: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(signature)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function createGeniusPayCheckout(
  request: GeniusPayCheckoutRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ reference: string; checkoutUrl: string }> {
  const apiKey = String(process.env.GENIUSPAY_API_KEY || '').trim();
  const apiSecret = String(process.env.GENIUSPAY_API_SECRET || '').trim();
  if (!apiKey || !apiSecret) throw new GeniusPayApiError('Le paiement GeniusPay n’est pas encore configuré.');

  let response: Response;
  try {
    response = await fetchImplementation(getGeniusPayApiUrl(), {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
        'Idempotency-Key': request.metadata.subscription_payment_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: 'XOF',
        description: request.description,
        customer: request.customer,
        success_url: request.success_url,
        error_url: request.error_url,
        metadata: request.metadata,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GeniusPayApiError('GeniusPay est temporairement inaccessible. Aucune confirmation de paiement n’a été reçue.');
  }

  let payload: GeniusPayApiResponse;
  try {
    payload = await response.json() as GeniusPayApiResponse;
  } catch {
    throw new GeniusPayApiError('GeniusPay a renvoyé une réponse invalide.');
  }

  const checkoutUrl = payload.data?.checkout_url || payload.data?.payment_url;
  if (!response.ok || payload.success !== true || !payload.data?.reference || !checkoutUrl) {
    const providerMessage = payload.error?.message || payload.message;
    const message = typeof providerMessage === 'string' && providerMessage.trim()
      ? providerMessage.trim().slice(0, 300)
      : 'Impossible de préparer le paiement GeniusPay.';
    throw new GeniusPayApiError(message);
  }
  try {
    const parsedCheckoutUrl = new URL(checkoutUrl);
    const hostname = parsedCheckoutUrl.hostname.toLowerCase();
    if (parsedCheckoutUrl.protocol !== 'https:'
      || (hostname !== 'geniuspay.ci' && !hostname.endsWith('.geniuspay.ci'))
      || parsedCheckoutUrl.username
      || parsedCheckoutUrl.password) {
      throw new Error('Invalid checkout URL');
    }
  } catch {
    throw new GeniusPayApiError('GeniusPay a renvoyé une adresse de paiement invalide.');
  }
  return { reference: payload.data.reference, checkoutUrl };
}

export async function getGeniusPayPayment(
  reference: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<GeniusPayPayment | null> {
  const apiKey = String(process.env.GENIUSPAY_API_KEY || '').trim();
  const apiSecret = String(process.env.GENIUSPAY_API_SECRET || '').trim();
  if (!apiKey || !apiSecret) throw new GeniusPayApiError('Le paiement GeniusPay n’est pas encore configuré.', false);
  if (!reference.trim()) throw new GeniusPayApiError('Référence GeniusPay invalide.', false);

  let response: Response;
  try {
    response = await fetchImplementation(`${getGeniusPayApiUrl()}/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'X-API-Secret': apiSecret, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GeniusPayApiError('GeniusPay est temporairement inaccessible. Réessayez la vérification.');
  }

  let payload: GeniusPayApiResponse;
  try {
    payload = await response.json() as GeniusPayApiResponse;
  } catch {
    throw new GeniusPayApiError('GeniusPay a renvoyé une réponse de vérification invalide.');
  }
  if (response.status === 404) return null;
  const paymentData = payload.data?.transaction || payload.data;
  if (!response.ok || payload.success !== true || !paymentData?.reference) {
    throw new GeniusPayApiError('Impossible de vérifier le paiement auprès de GeniusPay.');
  }

  const amount = Number(paymentData.amount);
  if (!Number.isSafeInteger(amount) || typeof paymentData.currency !== 'string' || typeof paymentData.status !== 'string') {
    throw new GeniusPayApiError('GeniusPay a renvoyé des données de paiement incomplètes.');
  }
  return {
    reference: paymentData.reference,
    amount,
    currency: paymentData.currency,
    status: paymentData.status,
    metadata: paymentData.metadata || {},
  };
}
