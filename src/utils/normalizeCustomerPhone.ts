export function normalizeCustomerPhone(value: string): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';

  const normalizedDigits = digits.startsWith('225') ? digits.slice(3) : digits;
  const localNumber = normalizedDigits.startsWith('0') ? normalizedDigits : `0${normalizedDigits}`;

  if (!/^0\d{9}$/.test(localNumber)) {
    return '';
  }

  return `+225${localNumber}`;
}
