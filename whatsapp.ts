function normalizeWhatsAppRecipient(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^00/, '');
  if (/^225\d{10}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `225${digits}`;
  if (/^\d{8}$/.test(digits)) return `225${digits}`;
  return digits;
}

export function buildWhatsAppClickToChatUrl(to: string, body: string): string {
  const normalized = normalizeWhatsAppRecipient(to);
  const cleanBody = String(body || '').trim();
  return `https://wa.me/${normalized}?text=${encodeURIComponent(cleanBody)}`;
}
