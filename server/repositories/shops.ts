import { dbAll, dbGet, dbRun } from '../../db.ts';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  parseSubscriptionProFeatures,
} from '../../src/utils/subscriptionFeatures.ts';
import type { ShopRecord, SubscriptionStatus } from '../types.ts';

export function mapShopRow(row: Record<string, unknown>): ShopRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    whatsapp_number: String(row.whatsapp_number),
    pin_code_hash: String(row.pin_code_hash),
    theme_color: String(row.theme_color || ''),
    welcome_message: row.welcome_message == null ? null : String(row.welcome_message),
    is_open: Boolean(row.is_open),
    is_active: Boolean(row.is_active),
    publication_status: String(row.publication_status || (row.is_active ? 'active' : 'suspended')) as ShopRecord['publication_status'],
    featured_until: row.featured_until == null ? null : String(row.featured_until),
    subscription_status: row.subscription_status ? String(row.subscription_status) as SubscriptionStatus : undefined,
    trial_start: row.trial_start == null ? null : String(row.trial_start),
    trial_end: row.trial_end == null ? null : String(row.trial_end),
    subscription_expires_at: row.subscription_expires_at == null ? null : String(row.subscription_expires_at),
    last_notification_sent_at: row.last_notification_sent_at == null ? null : String(row.last_notification_sent_at),
    whatsapp_subscription_reminders_enabled: Boolean(row.whatsapp_subscription_reminders_enabled),
    whatsapp_subscription_reminders_consent_at: row.whatsapp_subscription_reminders_consent_at == null ? null : String(row.whatsapp_subscription_reminders_consent_at),
    created_at: String(row.created_at),
    category: String(row.category) as ShopRecord['category'],
    city: row.city == null ? undefined : String(row.city),
    owner_name: row.owner_name == null ? null : String(row.owner_name),
    owner_phone: row.owner_phone == null ? null : String(row.owner_phone),
    owner_email: row.owner_email == null ? null : String(row.owner_email),
    selected_subscription_tier: row.selected_subscription_tier == null ? undefined : String(row.selected_subscription_tier) as ShopRecord['selected_subscription_tier'],
    pending_subscription_tier: row.pending_subscription_tier == null ? null : String(row.pending_subscription_tier) as ShopRecord['pending_subscription_tier'],
    pending_subscription_effective_at: row.pending_subscription_effective_at == null ? null : String(row.pending_subscription_effective_at),
    subscription_cancel_at: row.subscription_cancel_at == null ? null : String(row.subscription_cancel_at),
    subscription_admin_suspended_at: row.subscription_admin_suspended_at == null ? null : String(row.subscription_admin_suspended_at),
    subscription_admin_suspended_status: row.subscription_admin_suspended_status == null
      ? null
      : String(row.subscription_admin_suspended_status) as ShopRecord['subscription_admin_suspended_status'],
    subscription_plan_features: row.subscription_plan_features == null
      ? DEFAULT_SUBSCRIPTION_PRO_FEATURES
      : parseSubscriptionProFeatures(row.subscription_plan_features),
    subscription_features_snapshot: row.subscription_features_snapshot == null
      ? null
      : parseSubscriptionProFeatures(row.subscription_features_snapshot),
    subscription_features_effective_at: row.subscription_features_effective_at == null
      ? null
      : String(row.subscription_features_effective_at),
    merchant_verification_status: String(row.merchant_verification_status || 'not_required') as ShopRecord['merchant_verification_status'],
    theme_config: row.theme_config ? (typeof row.theme_config === 'string' ? JSON.parse(row.theme_config) : row.theme_config) : {},
    opening_hours: row.opening_hours ? (typeof row.opening_hours === 'string' ? JSON.parse(row.opening_hours) : row.opening_hours) : undefined,
    owner_access_token_hash: row.owner_access_token_hash ? String(row.owner_access_token_hash) : null,
  };
}

export async function loadShopsFromDatabase(): Promise<ShopRecord[]> {
  const rows = await dbAll<Record<string, unknown>>(`SELECT shops.*, platform_settings.subscription_plan_features
    FROM shops LEFT JOIN platform_settings ON platform_settings.id = 1 ORDER BY shops.id`);
  return rows.map(mapShopRow);
}

export async function getShopFromDatabase(shopId: number): Promise<ShopRecord | undefined> {
  const row = await dbGet<Record<string, unknown>>(`SELECT shops.*, platform_settings.subscription_plan_features
    FROM shops LEFT JOIN platform_settings ON platform_settings.id = 1 WHERE shops.id = ?`, [shopId]);
  return row ? mapShopRow(row) : undefined;
}

export async function persistShop(shop: ShopRecord): Promise<void> {
  await persistShopWith(shop, dbRun);
}

export async function persistShopInTransaction(
  shop: ShopRecord,
  transaction: { run: (sql: string, params?: unknown[]) => Promise<{ changes: number }> },
): Promise<void> {
  await persistShopWith(shop, transaction.run);
}

async function persistShopWith(
  shop: ShopRecord,
  run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>,
): Promise<void> {
  await run(`
    INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, theme_color, welcome_message, is_open, is_active, publication_status, featured_until, merchant_verification_status, payment_status, payment_deadline_at, selected_subscription_tier, subscription_expires_at, pending_subscription_tier, pending_subscription_effective_at, subscription_cancel_at, subscription_admin_suspended_at, subscription_admin_suspended_status, subscription_features_snapshot, subscription_features_effective_at, subscription_status, trial_start, trial_end, last_notification_sent_at, whatsapp_subscription_reminders_enabled, whatsapp_subscription_reminders_consent_at, created_at, category, city, subscription_tier, theme_config, opening_hours, owner_access_token_hash, owner_name, owner_phone, owner_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, whatsapp_number=excluded.whatsapp_number,
      pin_code_hash=excluded.pin_code_hash, theme_color=excluded.theme_color, welcome_message=excluded.welcome_message,
      is_open=excluded.is_open, is_active=excluded.is_active, publication_status=excluded.publication_status, featured_until=excluded.featured_until, payment_status=excluded.payment_status,
      merchant_verification_status=excluded.merchant_verification_status,
      payment_deadline_at=excluded.payment_deadline_at, selected_subscription_tier=excluded.selected_subscription_tier,
      pending_subscription_tier=excluded.pending_subscription_tier,
      pending_subscription_effective_at=excluded.pending_subscription_effective_at,
      subscription_cancel_at=excluded.subscription_cancel_at,
      subscription_admin_suspended_at=excluded.subscription_admin_suspended_at,
      subscription_admin_suspended_status=excluded.subscription_admin_suspended_status,
      subscription_features_snapshot=excluded.subscription_features_snapshot,
      subscription_features_effective_at=excluded.subscription_features_effective_at,
      subscription_expires_at=excluded.subscription_expires_at, last_notification_sent_at=excluded.last_notification_sent_at,
      whatsapp_subscription_reminders_enabled=excluded.whatsapp_subscription_reminders_enabled,
      whatsapp_subscription_reminders_consent_at=excluded.whatsapp_subscription_reminders_consent_at,
      subscription_status=excluded.subscription_status, trial_start=excluded.trial_start, trial_end=excluded.trial_end,
      category=excluded.category, city=excluded.city, subscription_tier=excluded.subscription_tier,
      theme_config=excluded.theme_config, opening_hours=excluded.opening_hours, owner_access_token_hash=excluded.owner_access_token_hash,
      owner_name=excluded.owner_name, owner_phone=excluded.owner_phone, owner_email=excluded.owner_email
  `, [
    shop.id, shop.name, shop.slug, shop.whatsapp_number, shop.pin_code_hash, shop.theme_color, shop.welcome_message,
    shop.is_open ? 1 : 0, shop.is_active ? 1 : 0, shop.publication_status || (shop.is_active ? 'active' : 'suspended'), shop.featured_until ?? null,
    shop.merchant_verification_status || 'not_required', 'approved', null,
    shop.selected_subscription_tier || 'standard', shop.subscription_expires_at ?? null,
    shop.pending_subscription_tier ?? null, shop.pending_subscription_effective_at ?? null,
    shop.subscription_cancel_at ?? null, shop.subscription_admin_suspended_at ?? null,
    shop.subscription_admin_suspended_status ?? null,
    shop.subscription_features_snapshot ? JSON.stringify(shop.subscription_features_snapshot) : null,
    shop.subscription_features_effective_at ?? null,
    shop.subscription_status || 'active', shop.trial_start ?? null, shop.trial_end ?? null, shop.last_notification_sent_at,
    shop.whatsapp_subscription_reminders_enabled ? 1 : 0, shop.whatsapp_subscription_reminders_consent_at ?? null,
    shop.created_at, shop.category, shop.city ?? null, shop.selected_subscription_tier || 'standard', JSON.stringify(shop.theme_config),
    shop.opening_hours ? JSON.stringify(shop.opening_hours) : null, shop.owner_access_token_hash ?? null,
    shop.owner_name ?? null, shop.owner_phone ?? null, shop.owner_email ?? null,
  ]);
}