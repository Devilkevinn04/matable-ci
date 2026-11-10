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

export function buildAmbassadorReferralUrl(codeValue: unknown, origin: string): string {
  const code = normalizeAmbassadorCode(codeValue);
  if (!code) throw new Error('Code ambassadeur invalide.');
  const url = new URL('/app/creer-boutique', origin);
  url.searchParams.set('ref', code);
  return url.toString();
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

export interface AmbassadorMonthlyStats {
  month: string;
  label: string;
  registrations: number;
  published: number;
  paying: number;
  paidAmount: number;
}

export function getAmbassadorMonthlyStats(
  referrals: Array<{ created_at: string; publication_status?: string | null; payment_status?: string | null }>,
  payouts: Array<{ paid_at: string; amount: number }>,
  now = new Date(),
): AmbassadorMonthlyStats[] {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
    const month = date.toISOString().slice(0, 7);
    return {
      month,
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(date),
      registrations: 0,
      published: 0,
      paying: 0,
      paidAmount: 0,
    };
  });
  const byMonth = new Map(months.map((entry) => [entry.month, entry]));

  for (const referral of referrals) {
    const timestamp = Date.parse(referral.created_at);
    if (!Number.isFinite(timestamp)) continue;
    const month = byMonth.get(new Date(timestamp).toISOString().slice(0, 7));
    if (month) {
      month.registrations += 1;
      if (referral.publication_status === 'active') month.published += 1;
      if (referral.payment_status === 'paid') month.paying += 1;
    }
  }
  for (const payout of payouts) {
    const timestamp = Date.parse(payout.paid_at);
    const amount = Number(payout.amount);
    if (!Number.isFinite(timestamp) || !Number.isSafeInteger(amount) || amount <= 0) continue;
    const month = byMonth.get(new Date(timestamp).toISOString().slice(0, 7));
    if (month) month.paidAmount += amount;
  }
  return months;
}

const REFERRAL_STORAGE_KEY = 'matable_ambassador_referral';
let pendingCapture: Promise<string | null> | null = null;
let inMemoryReferralCode: AmbassadorReferral | null = null;
let inMemoryReferralToken: { code: string; token: string; expiresAt: number } | null = null;

function getInMemoryReferralCode(): string | null {
  const referral = validAmbassadorReferral(inMemoryReferralCode);
  if (!referral) {
    inMemoryReferralCode = null;
    inMemoryReferralToken = null;
    return null;
  }
  return referral.code;
}

function getStoredReferral(): { code: string; token: string; expiresAt: number } | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(REFERRAL_STORAGE_KEY) || 'null') as {
      token?: unknown;
      code?: unknown;
      expiresAt?: unknown;
    } | null;
    const code = normalizeAmbassadorCode(stored?.code);
    const expiresAt = typeof stored?.expiresAt === 'string' ? Date.parse(stored.expiresAt) : NaN;
    if (typeof stored?.token !== 'string' || !/^[a-f0-9]{64}$/.test(stored.token)
      || !code || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const referral = { code, token: stored.token, expiresAt };
    inMemoryReferralCode = { code, capturedAt: expiresAt - AMBASSADOR_REFERRAL_DURATION_MS };
    inMemoryReferralToken = referral;
    return referral;
  } catch {
    return null;
  }
}

export function getStoredAmbassadorCode(): string | null {
  if (typeof window === 'undefined') return null;
  return getStoredReferral()?.code ?? getInMemoryReferralCode();
}

export function clearAmbassadorReferral(): void {
  if (typeof window === 'undefined') return;
  inMemoryReferralCode = null;
  inMemoryReferralToken = null;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // Referral attribution still works for the current page when storage is unavailable.
  }
  window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
}

export async function getAmbassadorToken(codeValue?: unknown): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const storedReferral = getStoredReferral();
  if (storedReferral) return storedReferral.token;
  const memoryToken = inMemoryReferralToken && inMemoryReferralToken.expiresAt > Date.now()
    ? inMemoryReferralToken.token
    : null;
  if (memoryToken) return memoryToken;
  if (pendingCapture) return pendingCapture;
  const code = getInMemoryReferralCode()
    ?? normalizeAmbassadorCode(codeValue ?? new URLSearchParams(window.location.search).get('ref'));
  if (!code) return null;
  inMemoryReferralCode = { code, capturedAt: Date.now() };
  pendingCapture = (async () => {
    try {
      const response = await fetch('/api/ambassador-clicks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        if (response.status === 404 && inMemoryReferralCode?.code === code) {
          inMemoryReferralCode = null;
          window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
        }
        return null;
      }
      const result = await response.json() as { token: string; expires_at: string };
      const expiresAt = typeof result.expires_at === 'string' ? Date.parse(result.expires_at) : NaN;
      if (typeof result.token !== 'string' || !/^[a-f0-9]{64}$/.test(result.token)
        || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
      inMemoryReferralCode = { code, capturedAt: Date.now() };
      inMemoryReferralToken = { token: result.token, code, expiresAt };
      try {
        window.localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({
          token: result.token, code, expiresAt: result.expires_at,
        }));
      } catch {
        // Keep the token in memory for this page; registration can still submit the code.
      }
      window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
      return result.token;
    } catch {
      window.dispatchEvent(new Event('matable-ambassador-referral-updated'));
      return null;
    }
  })();
  try { return await pendingCapture; } finally { pendingCapture = null; }
}

export async function trackAmbassadorLinkVisit(codeValue?: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  const code = normalizeAmbassadorCode(codeValue ?? new URLSearchParams(window.location.search).get('ref'));
  if (!code) return;
  try {
    const response = await fetch('/api/ambassador-link-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      keepalive: true,
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`Ambassador link visit was not recorded (${response.status}).`);
    }
  } catch (error) {
    console.warn('Ambassador link visit could not be recorded.', error);
  }
}