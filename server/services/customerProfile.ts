export interface CustomerProfileRow {
  id: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone: string;
  email: string;
  created_at?: string;
}

export function toCustomerProfile(user: CustomerProfileRow) {
  const legacyParts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = String(user.first_name || '').trim() || legacyParts[0] || '';
  const lastName = String(user.last_name || '').trim() || legacyParts.slice(1).join(' ');
  return {
    id: user.id,
    name: user.name || `${firstName} ${lastName}`.trim(),
    first_name: firstName,
    last_name: lastName,
    phone: user.phone,
    email: user.email,
    ...(user.created_at ? { created_at: user.created_at } : {}),
  };
}
