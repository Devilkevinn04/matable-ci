export interface MerchantLoginPayload<TShop> {
  [key: string]: unknown;
  success?: unknown;
  mfa_required?: unknown;
  challenge_id?: unknown;
  email_setup_required?: unknown;
  error?: unknown;
  shop?: TShop | null;
}

export type MerchantLoginOutcome<TShop> =
  | { type: 'mfa'; challengeId: string }
  | { type: 'email_setup'; message: string }
  | { type: 'error'; message: string }
  | { type: 'session'; shop: TShop };

const errorMessage = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback;

export function readMerchantLoginOutcome<TShop>(
  ok: boolean,
  payload: MerchantLoginPayload<TShop>,
  fallbackError = 'Identifiants invalides',
): MerchantLoginOutcome<TShop> {
  // A 202 MFA challenge is a successful HTTP response but not an opened session.
  if (payload.mfa_required === true && typeof payload.challenge_id === 'string' && payload.challenge_id.trim()) {
    return { type: 'mfa', challengeId: payload.challenge_id };
  }
  if (!ok) {
    if (payload.email_setup_required === true) {
      return {
        type: 'email_setup',
        message: errorMessage(payload.error, 'Vérifiez votre adresse e-mail pour continuer.'),
      };
    }
    return { type: 'error', message: errorMessage(payload.error, fallbackError) };
  }
  if (!payload.shop || typeof payload.shop !== 'object') {
    return { type: 'error', message: 'La session commerçant n’a pas pu être ouverte. Réessayez.' };
  }
  return { type: 'session', shop: payload.shop };
}
