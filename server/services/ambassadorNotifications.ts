import {
  sendAmbassadorProgramEmail,
  type AmbassadorProgramEmailEvent,
} from './email.ts';

export async function notifyAmbassadorProgramEvent(input: {
  ambassadorId: string;
  name: string;
  email: string | null;
  event: AmbassadorProgramEmailEvent;
  amount: number;
  shopName?: string;
  reference?: string | null;
  reason?: string | null;
}): Promise<void> {
  if (!input.email) return;
  try {
    const delivery = await sendAmbassadorProgramEmail({
      name: input.name,
      email: input.email,
      event: input.event,
      amount: input.amount,
      shopName: input.shopName,
      reference: input.reference,
      reason: input.reason,
      appUrl: String(process.env.APP_URL || 'https://matable-ci.com').trim(),
    });
    if (!delivery.sent && delivery.error !== 'email_disabled_in_test') {
      console.warn(`Unable to send ambassador ${input.event} email for account ${input.ambassadorId}: ${delivery.error || 'unknown_error'}.`);
    }
  } catch (error) {
    console.warn(`Unable to send ambassador ${input.event} email for account ${input.ambassadorId}.`, error);
  }
}
