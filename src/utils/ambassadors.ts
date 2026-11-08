export const AMBASSADOR_REFERRAL_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

export interface AmbassadorReferral {
  code: string;
  capturedAt: number;
}

export function normalizeAmbassadorCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4,24}$/.test(code) ? code : null;
}

export function validAmbassadorReferral(value: unknown, now = Date.now()): AmbassadorReferral | null {
  if (!value || typeof value !== 'object') return null;
  const referral = value as Partial<AmbassadorReferral>;
  const code = normalizeAmbassadorCode(referral.code);
  if (!code || typeof referral.capturedAt !== 'number' || !Number.isFinite(referral.capturedAt)
    || referral.capturedAt > now || now - referral.capturedAt >= AMBASSADOR_REFERRAL_DURATION_MS) return null;
  return { code, capturedAt: referral.capturedAt };
}

export function calculateAmbassadorCommission(amount: number, term: 'monthly' | 'annual'): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError('Montant de paiement invalide.');
  return Math.round(amount / (term === 'annual' ? 10 : 1) * 0.2);
}

export function isCommissionPayableForMonth(
  commission: { status: string | null; payment_status: string | null; approved_at: string | null },
  month: string,
): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || commission.status !== 'approved'
    || commission.payment_status !== 'paid' || !commission.approved_at) return false;
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = Date.UTC(year, monthNumber, 1);
  const approvedAt = Date.parse(commission.approved_at);
  return Number.isFinite(approvedAt) && approvedAt < nextMonth;
}

const REFERRAL_STORAGE_KEY = 'matable_ambassador_referral';
let pendingCapture: Promise<string | null> | null = null;

export function getStoredAmbassadorCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(REFERRAL_STORAGE_KEY) || 'null') as {
      token?: unknown;
      code?: unknown;
      expiresAt?: unknown;
    } | null;
    const expiresAt = typeof stored?.expiresAt === 'string' ? Date.parse(stored.expiresAt) : NaN;
    if (typeof stored?.token !== 'string' || !/^[a-f0-9]{64}$/.test(stored.token)
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return normalizeAmbassadorCode(stored.code);
  } catch {
    return null;
  }
}

export function clearAmbassadorReferral(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
  } catch {
    return;
  }
}

export async function getAmbassadorToken(codeValue?: unknown): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(REFERRAL_STORAGE_KEY) || 'null') as { token?: unknown; expiresAt?: unknown } | null;
    if (stored && typeof stored.token === 'string' && /^[a-f0-9]{64}$/.test(stored.token)
      && typeof stored.expiresAt === 'string' && Date.parse(stored.expiresAt) > Date.now()) return stored.token;
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch { return null; }
  if (pendingCapture) return pendingCapture;
  const code = normalizeAmbassadorCode(codeValue ?? new URLSearchParams(window.location.search).get('ref'));
  if (!code) return null;
  pendingCapture = (async () => {
    try {
      const response = await fetch('/api/ambassador-clicks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      if (!response.ok) return null;
      const result = await response.json() as { token: string; expires_at: string };
      const expiresAt = typeof result.expires_at === 'string' ? Date.parse(result.expires_at) : NaN;
      if (typeof result.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.token)
        || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({
        token: result.token, code, expiresAt: result.expires_at,
      }));
      window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
      return result.token;
    } catch { return null; }
  })();
  try { return await pendingCapture; } finally { pendingCapture = null; }
}