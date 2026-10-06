export function normalizeCustomerPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('225')) return `+${digits}`;
  if (digits.startsWith('0')) return `+225${digits}`;
  return `+225${digits}`;
}
