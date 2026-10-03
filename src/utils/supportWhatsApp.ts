import { cleanPhoneForWhatsApp, isValidWhatsAppPhone } from './format';

const publicEnv = (import.meta as ImportMeta & { env?: { VITE_WHATSAPP_ADMIN_PHONE?: string } }).env;
const configuredPhone = publicEnv?.VITE_WHATSAPP_ADMIN_PHONE?.trim() || '';
const normalizedPhone = isValidWhatsAppPhone(configuredPhone) ? cleanPhoneForWhatsApp(configuredPhone) : '';

export const supportWhatsAppDisplayNumber = normalizedPhone
  ? `+225 ${normalizedPhone.slice(3, 5)} ${normalizedPhone.slice(5, 7)} ${normalizedPhone.slice(7, 9)} ${normalizedPhone.slice(9, 11)} ${normalizedPhone.slice(11, 13)}`
  : '';

export function getSupportWhatsAppUrl(message: string): string | null {
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}