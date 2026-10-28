import { databaseMode, dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { getGeniusPayPayment, GeniusPayApiError } from './geniusPay.ts';

const SUBSCRIPTION_DURATION_MS = 24 * 60 * 60 * 1000;
const PAYMENT_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DELIVERY_SUBSCRIPTION_AMOUNT = 1000;

export type DeliveryPaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export interface DeliveryPaymentIntent {
  id: string;
  driver_id: number | string;
  amount: number;
  currency: string;
  status: DeliveryPaymentStatus;
  provider_reference: string | null;
  provider_checkout_url: string | null;
  created_at: string;
  paid_at: string | null;
}

export function isDeliveryProviderPaymentConfigured(): boolean {
  return Boolean(
    String(process.env.GENIUSPAY_API_KEY || '').trim()
    && String(process.env.GENIUSPAY_API_SECRET || '').trim()
    && String(process.env.GENIUSPAY_WEBHOOK_SECRET || '').trim()
    && String(process.env.APP_URL || '').trim(),
  );
}

export async function expireStaleDeliveryPaymentIntents(driverId?: number): Promise<void> {
  const cutoff = new Date(Date.now() - PAYMENT_INTENT_LIFETIME_MS).toISOString();
  const driverFilter = driverId === undefined ? '' : ' AND driver_id = ?';
  await dbRun(`UPDATE delivery_driver_payment_intents SET status = 'expired'
    WHERE status = 'pending' AND created_at <= ?${driverFilter}`,
  driverId === undefined ? [cutoff] : [cutoff, driverId]);
}

export type DeliveryPaymentApplyResult =
  | 'paid' | 'duplicate' | 'not_found' | 'mismatch' | 'reference_mismatch'
  | 'reference_pending' | 'reference_conflict' | 'driver_inactive';

export async function applyDeliveryPaymentSuccess(input: {
  paymentId: string;
  providerReference: string;
  amount: number;
}): Promise<{ result: DeliveryPaymentApplyResult; expiresAt?: string }> {
  return dbTransaction(async (transaction) => {
    const payment = await transaction.get<DeliveryPaymentIntent>(
      `SELECT * FROM delivery_driver_payment_intents WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [input.paymentId],
    );
    if (!payment) return { result: 'not_found' as const };
    if (!payment.provider_reference) return { result: 'reference_pending' as const };
    if (payment.provider_reference !== input.providerReference) return { result: 'reference_mismatch' as const };
    if (Number(payment.amount) !== input.amount) return { result: 'mismatch' as const };
    if (payment.status === 'paid') return { result: 'duplicate' as const };
    if (!['pending', 'expired'].includes(payment.status)) return { result: 'mismatch' as const };
    const referenceOwner = await transaction.get<{ id: string }>(
      'SELECT id FROM delivery_driver_payment_intents WHERE provider_reference = ? AND id <> ?',
      [input.providerReference, payment.id],
    );
    if (referenceOwner) return { result: 'reference_conflict' as const };

    const driver = await transaction.get<{
      status: string;
      access_expires_at: string | null;
    }>(
      `SELECT status, access_expires_at FROM delivery_drivers WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [payment.driver_id],
    );
    const paidAt = new Date().toISOString();
    const updated = await transaction.run(`UPDATE delivery_driver_payment_intents
      SET status = 'paid', provider_reference = ?, paid_at = ?
      WHERE id = ? AND status IN ('pending', 'expired')`,
    [input.providerReference, paidAt, payment.id]);
    if (updated.changes !== 1) return { result: 'duplicate' as const };

    if (!driver || driver.status !== 'active') {
      await transaction.run(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
        VALUES ('system', 'delivery_payment_driver_not_active', NULL, ?, ?)`, [
        JSON.stringify({
          payment_id: payment.id,
          driver_id: Number(payment.driver_id),
          provider_reference: input.providerReference,
          amount: input.amount,
          action_required: 'Le paiement est confirmé mais le compte livreur n’est pas actif. Aucun forfait n’a été activé.',
        }),
        paidAt,
      ]);
      return { result: 'driver_inactive' as const };
    }

    const currentExpiry = driver.access_expires_at ? Date.parse(driver.access_expires_at) : 0;
    const startsAt = Math.max(Date.now(), Number.isFinite(currentExpiry) ? currentExpiry : 0);
    const expiresAt = new Date(startsAt + SUBSCRIPTION_DURATION_MS).toISOString();
    await transaction.run(`INSERT INTO delivery_driver_subscriptions
      (driver_id, amount, payment_mode, payment_intent_id, status, created_at, expires_at)
      VALUES (?, ?, 'provider', ?, 'active', ?, ?)`,
    [payment.driver_id, DELIVERY_SUBSCRIPTION_AMOUNT, payment.id, paidAt, expiresAt]);
    await transaction.run('UPDATE delivery_drivers SET access_expires_at = ?, updated_at = ? WHERE id = ?',
      [expiresAt, paidAt, payment.driver_id]);
    await transaction.run(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
      VALUES ('system', 'delivery_payment_confirmed', NULL, ?, ?)`, [
      JSON.stringify({
        payment_id: payment.id,
        driver_id: Number(payment.driver_id),
        provider_reference: input.providerReference,
        amount: input.amount,
        expires_at: expiresAt,
      }),
      paidAt,
    ]);
    return { result: 'paid' as const, expiresAt };
  });
}

export async function applyDeliveryPaymentStatus(input: {
  paymentId: string;
  providerReference: string;
  amount: number;
  status: 'failed' | 'cancelled' | 'expired' | 'refunded';
  refundedAmount?: number;
}): Promise<'updated' | 'duplicate' | 'not_found' | 'mismatch' | 'reference_mismatch' | 'reference_pending' | 'review'> {
  return dbTransaction(async (transaction) => {
    const payment = await transaction.get<DeliveryPaymentIntent>(
      `SELECT * FROM delivery_driver_payment_intents WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
      [input.paymentId],
    );
    if (!payment) return 'not_found' as const;
    if (!payment.provider_reference) return 'reference_pending' as const;
    if (payment.provider_reference !== input.providerReference) return 'reference_mismatch' as const;
    if (Number(payment.amount) !== input.amount) return 'mismatch' as const;
    if (payment.status === input.status) return 'duplicate' as const;
    const now = new Date().toISOString();

    if (input.status === 'refunded') {
      if (payment.status !== 'paid') return 'mismatch' as const;
      const refundedAmount = input.refundedAmount ?? input.amount;
      await transaction.run(`UPDATE delivery_driver_payment_intents SET status = 'refunded' WHERE id = ? AND status = 'paid'`,
        [payment.id]);
      await transaction.run(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
        VALUES ('system', 'delivery_payment_refund_review', NULL, ?, ?)`, [
        JSON.stringify({
          payment_id: payment.id,
          driver_id: Number(payment.driver_id),
          provider_reference: input.providerReference,
          amount: input.amount,
          refunded_amount: refundedAmount,
          action_required: 'Remboursement fournisseur constaté. Le forfait de 24 h n’est pas révoqué automatiquement; contrôle manuel requis.',
        }),
        now,
      ]);
      return refundedAmount < Number(payment.amount) ? 'review' as const : 'updated' as const;
    }

    if (!['pending', 'expired'].includes(payment.status)) return 'mismatch' as const;
    const updated = await transaction.run(`UPDATE delivery_driver_payment_intents SET status = ?
      WHERE id = ? AND status IN ('pending', 'expired')`, [input.status, payment.id]);
    return updated.changes === 1 ? 'updated' as const : 'duplicate' as const;
  });
}

async function reconcileDeliveryPayment(payment: DeliveryPaymentIntent, minimumIntervalMs?: number): Promise<void> {
  if (!['pending', 'expired'].includes(payment.status) || !payment.provider_reference) return;
  const verificationIntervalMs = minimumIntervalMs ?? (payment.status === 'expired' ? 60 * 60 * 1000 : 5 * 60 * 1000);
  const checkedAt = new Date().toISOString();
  const checkBefore = new Date(Date.now() - verificationIntervalMs).toISOString();
  const claim = await dbRun(`UPDATE delivery_driver_payment_intents
    SET provider_checked_at = ?, provider_check_attempts = provider_check_attempts + 1
    WHERE id = ? AND status IN ('pending', 'expired')
      AND (provider_checked_at IS NULL OR provider_checked_at <= ?)`, [checkedAt, payment.id, checkBefore]);
  if (claim.changes !== 1) return;

  let providerPayment;
  try {
    providerPayment = await getGeniusPayPayment(payment.provider_reference);
  } catch (error) {
    if (error instanceof GeniusPayApiError) {
      const retryAt = new Date(Date.now() - verificationIntervalMs + 30_000).toISOString();
      await dbRun(`UPDATE delivery_driver_payment_intents SET provider_checked_at = ?
        WHERE id = ? AND status IN ('pending', 'expired')`, [retryAt, payment.id]);
    }
    throw error;
  }
  if (!providerPayment) return;
  if (providerPayment.reference !== payment.provider_reference
    || Number(providerPayment.amount) !== Number(payment.amount)
    || providerPayment.currency !== payment.currency
    || providerPayment.metadata.delivery_payment_id !== payment.id
    || providerPayment.metadata.payment_type !== 'delivery') {
    await dbRun(`INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at)
      VALUES ('system', 'delivery_payment_reconciliation_mismatch', NULL, ?, ?)`, [
      JSON.stringify({
        payment_id: payment.id,
        provider_reference: payment.provider_reference,
        expected_amount: payment.amount,
        actual_amount: providerPayment.amount,
        actual_currency: providerPayment.currency,
        provider_status: providerPayment.status,
      }),
      new Date().toISOString(),
    ]);
    return;
  }

  if (providerPayment.status === 'completed') {
    const applied = await applyDeliveryPaymentSuccess({
      paymentId: payment.id,
      providerReference: providerPayment.reference,
      amount: providerPayment.amount,
    });
    if (!['paid', 'duplicate', 'driver_inactive'].includes(applied.result)) {
      console.error(`Delivery payment ${payment.id} was not applied during reconciliation: ${applied.result}.`);
    }
    return;
  }

  const terminalStatus: Record<string, 'failed' | 'cancelled' | 'expired'> = {
    failed: 'failed',
    cancelled: 'cancelled',
    expired: 'expired',
  };
  const mappedStatus = terminalStatus[providerPayment.status];
  if (!mappedStatus) return;
  await applyDeliveryPaymentStatus({
    paymentId: payment.id,
    providerReference: providerPayment.reference,
    amount: providerPayment.amount,
    status: mappedStatus,
  });
}

export async function reconcilePendingDeliveryPayments(): Promise<void> {
  if (!isDeliveryProviderPaymentConfigured()) return;
  await expireStaleDeliveryPaymentIntents();
  const pendingCheckBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const expiredCheckBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const payments = await dbAll<DeliveryPaymentIntent>(`SELECT * FROM delivery_driver_payment_intents
    WHERE provider_reference IS NOT NULL AND (
      (status = 'pending' AND (provider_checked_at IS NULL OR provider_checked_at <= ?))
      OR (status = 'expired' AND (provider_checked_at IS NULL OR provider_checked_at <= ?))
    )
    ORDER BY provider_checked_at ASC NULLS FIRST, created_at ASC LIMIT 25`,
  [pendingCheckBefore, expiredCheckBefore]);
  for (const payment of payments) {
    try {
      await reconcileDeliveryPayment(payment);
    } catch (error) {
      console.warn(`Unable to reconcile delivery payment ${payment.id}.`, error);
    }
  }
}

export async function findReusableDeliveryPaymentIntent(driverId: number): Promise<DeliveryPaymentIntent | undefined> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  return dbGet<DeliveryPaymentIntent>(`SELECT * FROM delivery_driver_payment_intents
    WHERE driver_id = ? AND status = 'pending' AND created_at > ?
    ORDER BY created_at DESC LIMIT 1`, [driverId, cutoff]);
}

export async function getDeliveryPaymentIntent(paymentId: string, driverId: number): Promise<DeliveryPaymentIntent | undefined> {
  return dbGet<DeliveryPaymentIntent>(
    'SELECT * FROM delivery_driver_payment_intents WHERE id = ? AND driver_id = ?',
    [paymentId, driverId],
  );
}

export async function reconcileDeliveryPaymentById(paymentId: string, driverId: number, minimumIntervalMs = 30_000): Promise<void> {
  const payment = await getDeliveryPaymentIntent(paymentId, driverId);
  if (!payment || !isDeliveryProviderPaymentConfigured()) return;
  await reconcileDeliveryPayment(payment, minimumIntervalMs);
}

export { DELIVERY_SUBSCRIPTION_AMOUNT, SUBSCRIPTION_DURATION_MS };
