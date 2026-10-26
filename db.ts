import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;
const usePostgres = process.env.NODE_ENV === 'production';
export const databaseMode = usePostgres ? 'postgresql' : 'sqlite';

const postgresPool = usePostgres
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX || 10) })
  : null;
let sqliteTransactionQueue: Promise<void> = Promise.resolve();

const dataDir = path.join(process.cwd(), 'data');
const configuredDbPath = process.env.MATABLE_DB_PATH
  ? path.resolve(process.env.MATABLE_DB_PATH)
  : path.join(dataDir, 'matable.db');
const sqliteDb = usePostgres ? null : (() => {
  if (configuredDbPath !== ':memory:') fs.mkdirSync(path.dirname(configuredDbPath), { recursive: true });
  const connection = new Database(configuredDbPath);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  return connection;
})();

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    whatsapp_number TEXT NOT NULL, pin_code_hash TEXT NOT NULL, theme_color TEXT,
    welcome_message TEXT, is_open INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1,
    publication_status TEXT NOT NULL DEFAULT 'draft', featured_until TEXT,
    payment_status TEXT NOT NULL DEFAULT 'approved', payment_deadline_at TEXT,
    merchant_verification_status TEXT NOT NULL DEFAULT 'not_required',
    selected_subscription_tier TEXT, subscription_expires_at TEXT,
    pending_subscription_tier TEXT, pending_subscription_effective_at TEXT,
    subscription_cancel_at TEXT, subscription_admin_suspended_at TEXT,
    subscription_admin_suspended_status TEXT,
    subscription_admin_override_status TEXT,
    subscription_admin_override_tier TEXT,
    subscription_admin_override_until TEXT,
    subscription_features_snapshot TEXT, subscription_features_effective_at TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'active', trial_start TEXT, trial_end TEXT,
    last_notification_sent_at TEXT, whatsapp_subscription_reminders_enabled INTEGER NOT NULL DEFAULT 0,
    whatsapp_subscription_reminders_consent_at TEXT, created_at TEXT NOT NULL, category TEXT NOT NULL,
    city TEXT, owner_name TEXT, owner_phone TEXT, owner_email TEXT, subscription_tier TEXT NOT NULL, theme_config TEXT, opening_hours TEXT,
    owner_access_token_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS merchant_account_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    terms_document TEXT NOT NULL,
    privacy_document TEXT NOT NULL,
    accepted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT,
    sale_price INTEGER, sale_starts_at TEXT, sale_ends_at TEXT,
    is_available INTEGER NOT NULL DEFAULT 1, is_visible INTEGER NOT NULL DEFAULT 1, sizes TEXT, colors TEXT, lookbook_image TEXT, created_at TEXT,
    gallery_images TEXT, prep_time INTEGER, modifier_groups TEXT, attributes TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, delivery_location TEXT NOT NULL, delivery_note TEXT,
    delivery_slot TEXT, payment_method_preference TEXT, total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL, items TEXT, customer_user_id INTEGER, attribution_campaign TEXT
  );
  CREATE TABLE IF NOT EXISTS order_whatsapp_tracking (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, clicked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS subscription_payment_intents (
    id TEXT PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL DEFAULT 'subscription', tier TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'XOF',
    client_request_id TEXT, status TEXT NOT NULL DEFAULT 'pending', provider_reference TEXT UNIQUE, provider_checkout_url TEXT,
    provider_checked_at TEXT, provider_check_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, paid_at TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, event_type TEXT NOT NULL,
    session_id TEXT NOT NULL, path TEXT, source TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS advertising_beta_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), starts_at TEXT, ends_at TEXT,
    delivery_enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  );
  INSERT OR IGNORE INTO advertising_beta_settings (id, delivery_enabled, updated_at)
    VALUES (1, 0, CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS advertising_campaigns (
    id TEXT PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('product', 'banner')),
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    headline TEXT NOT NULL, body TEXT NOT NULL, duration_days INTEGER NOT NULL CHECK (duration_days = 7),
    charter_accepted_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review'
      CHECK (status IN ('pending_review', 'rejected', 'scheduled', 'active', 'suspended', 'completed', 'cancelled')),
    starts_at TEXT, ends_at TEXT, review_note TEXT, reviewed_by TEXT, reviewed_at TEXT,
    submitted_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (shop_id, kind)
  );
  CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_delivery ON advertising_campaigns(status, starts_at, ends_at, kind);
  CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_shop ON advertising_campaigns(shop_id, submitted_at DESC);
  CREATE TABLE IF NOT EXISTS advertising_campaign_events (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'shop_visit', 'contact_click')),
    visitor_hash TEXT NOT NULL, event_date TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (campaign_id, event_type, visitor_hash, event_date)
  );
  CREATE INDEX IF NOT EXISTS idx_advertising_campaign_events_campaign ON advertising_campaign_events(campaign_id, created_at);
  CREATE TABLE IF NOT EXISTS advertising_partner_requests (
    id TEXT PRIMARY KEY, contact_name TEXT NOT NULL, company_name TEXT NOT NULL,
    email TEXT NOT NULL, phone TEXT,
    requested_format TEXT NOT NULL CHECK (requested_format IN ('banner', 'product', 'partnership', 'other')),
    objective TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'declined')),
    admin_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_advertising_partner_requests_status ON advertising_partner_requests(status, created_at DESC);
  CREATE TABLE IF NOT EXISTS advertising_permanent_partners (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, descriptor TEXT NOT NULL, headline TEXT NOT NULL,
    logo_url TEXT, destination_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_advertising_permanent_partners_public
    ON advertising_permanent_partners(is_active, sort_order, created_at);
  CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), maintenance_enabled INTEGER NOT NULL DEFAULT 0,
    maintenance_message TEXT NOT NULL DEFAULT 'Le service revient bientôt. Merci de votre patience.',
    subscription_plan_prices TEXT NOT NULL DEFAULT '{"standard":3000,"premium":5000,"pro":8000}',
    subscription_plan_features TEXT NOT NULL DEFAULT '{"productLimit":null,"productPhotoLimit":6,"analyticsDayLimit":90,"boostDiscountPercent":15}',
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'system'
  );
  INSERT OR IGNORE INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
    VALUES (1, 0, 'Le service revient bientôt. Merci de votre patience.', CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS merchant_sessions (
    token TEXT PRIMARY KEY, shop_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, fingerprint TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS request_rate_limits (
    key_hash TEXT PRIMARY KEY, request_count INTEGER NOT NULL, reset_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_request_rate_limits_reset ON request_rate_limits(reset_at);
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
    shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS customer_account_consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_document TEXT NOT NULL,
    privacy_document TEXT NOT NULL,
    accepted_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_oauth_identities (
    provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (provider, provider_user_id)
  );
  CREATE TABLE IF NOT EXISTS customer_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
    target_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, target_type, target_id)
  );
  CREATE TABLE IF NOT EXISTS customer_product_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS customer_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL, shop_id INTEGER NOT NULL, target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
    target_id INTEGER NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
    created_at TEXT NOT NULL, reviewed_at TEXT, UNIQUE (order_id, user_id, target_type, target_id)
  );
  CREATE TABLE IF NOT EXISTS customer_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')), target_id INTEGER NOT NULL,
    reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
    created_at TEXT NOT NULL, reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_customer_favorites_user_created ON customer_favorites(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customer_product_likes_product ON customer_product_likes(product_id);
  CREATE INDEX IF NOT EXISTS idx_customer_oauth_user_id ON customer_oauth_identities(user_id);
  CREATE INDEX IF NOT EXISTS idx_customer_reviews_public ON customer_reviews(target_type, target_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_customer_reports_moderation ON customer_reports(status, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_reports_one_open_per_target
    ON customer_reports(user_id, target_type, target_id) WHERE status IN ('pending', 'in_review');
  CREATE TABLE IF NOT EXISTS didit_verification_sessions (
    session_id TEXT PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    workflow_id TEXT NOT NULL, status TEXT NOT NULL, consent_at TEXT NOT NULL, consent_version TEXT NOT NULL, last_webhook_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_didit_sessions_shop_created ON didit_verification_sessions(shop_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS didit_webhook_events (
    event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS geniuspay_webhook_events (
    event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payment_intent_id TEXT,
    provider_reference TEXT, payload_sha256 TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'received', result_code TEXT,
    received_at TEXT NOT NULL, processed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_geniuspay_webhook_events_intent_received
    ON geniuspay_webhook_events(payment_intent_id, received_at DESC);
  CREATE TABLE IF NOT EXISTS didit_schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS id_allocators (name TEXT PRIMARY KEY, last_id INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
  CREATE INDEX IF NOT EXISTS idx_products_shop_available ON products(shop_id, is_available);
  CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at ON orders(shop_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_shop_created_at ON analytics_events(shop_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_merchant_sessions_shop_id ON merchant_sessions(shop_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_shop_created ON admin_audit_logs(shop_id, created_at DESC);
`;

if (sqliteDb) {
  sqliteDb.exec(sqliteSchema);
  migrateSqlite(sqliteDb);
  migrateLegacyKyc(sqliteDb);
}

function migrateSqlite(connection: Database.Database) {
  const columns = (table: string) => connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const addColumn = (table: string, name: string, definition: string) => {
    if (!columns(table).some((column) => column.name === name)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  const hadPublicationStatus = columns('shops').some((column) => column.name === 'publication_status');
  addColumn('shops', 'publication_status', "TEXT NOT NULL DEFAULT 'draft'");
  addColumn('shops', 'featured_until', 'TEXT');
  addColumn('shops', 'opening_hours', 'TEXT');
  addColumn('shops', 'owner_email', 'TEXT');
  addColumn('advertising_campaigns', 'charter_accepted_at', 'TEXT');
  addColumn('shops', 'owner_name', 'TEXT');
  addColumn('shops', 'owner_phone', 'TEXT');
  addColumn('shops', 'owner_access_token_hash', 'TEXT');
  addColumn('shops', 'payment_status', "TEXT DEFAULT 'approved'");
  addColumn('shops', 'payment_deadline_at', 'TEXT');
  addColumn('shops', 'merchant_verification_status', "TEXT NOT NULL DEFAULT 'not_required'");
  addColumn('shops', 'selected_subscription_tier', 'TEXT');
  addColumn('shops', 'subscription_status', "TEXT NOT NULL DEFAULT 'active'");
  addColumn('shops', 'trial_start', 'TEXT');
  addColumn('shops', 'trial_end', 'TEXT');
  addColumn('shops', 'subscription_expires_at', 'TEXT');
  addColumn('shops', 'pending_subscription_tier', 'TEXT');
  addColumn('shops', 'pending_subscription_effective_at', 'TEXT');
  addColumn('shops', 'subscription_cancel_at', 'TEXT');
  addColumn('shops', 'subscription_admin_suspended_at', 'TEXT');
  addColumn('shops', 'subscription_admin_suspended_status', 'TEXT');
  addColumn('shops', 'subscription_admin_override_status', 'TEXT');
  addColumn('shops', 'subscription_admin_override_tier', 'TEXT');
  addColumn('shops', 'subscription_admin_override_until', 'TEXT');
  addColumn('shops', 'whatsapp_subscription_reminders_enabled', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('shops', 'whatsapp_subscription_reminders_consent_at', 'TEXT');
  connection.exec(`CREATE TABLE IF NOT EXISTS merchant_push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  connection.exec('CREATE INDEX IF NOT EXISTS idx_merchant_push_subscriptions_shop ON merchant_push_subscriptions(shop_id)');
  connection.exec(`CREATE TABLE IF NOT EXISTS merchant_push_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    sent_at TEXT,
    last_error TEXT,
    attempted_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (shop_id, event_key)
  )`);
  addColumn('merchant_push_deliveries', 'payload_json', "TEXT NOT NULL DEFAULT '{}'");
  addColumn('merchant_push_deliveries', 'attempted_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('merchant_push_deliveries', 'sent_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('merchant_push_deliveries', 'failed_count', 'INTEGER NOT NULL DEFAULT 0');
  connection.exec(`CREATE TABLE IF NOT EXISTS platform_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '/app',
    created_at TEXT NOT NULL,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0
  )`);
  addColumn('subscription_payment_intents', 'payment_type', "TEXT NOT NULL DEFAULT 'subscription'");
  addColumn('subscription_payment_intents', 'subscription_term', "TEXT NOT NULL DEFAULT 'monthly'");
  addColumn('subscription_payment_intents', 'client_request_id', 'TEXT');
  addColumn('subscription_payment_intents', 'provider_checkout_url', 'TEXT');
  addColumn('subscription_payment_intents', 'provider_checked_at', 'TEXT');
  addColumn('subscription_payment_intents', 'provider_check_attempts', 'INTEGER NOT NULL DEFAULT 0');
  connection.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payment_intents_client_request_id ON subscription_payment_intents(shop_id, client_request_id) WHERE client_request_id IS NOT NULL AND client_request_id <> ''");
  connection.exec(`CREATE TABLE IF NOT EXISTS shop_boosts (
    id TEXT PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_intent_id TEXT NOT NULL UNIQUE REFERENCES subscription_payment_intents(id) ON DELETE CASCADE,
    city TEXT NOT NULL,
    category TEXT NOT NULL,
    placement TEXT NOT NULL DEFAULT 'directory',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    reservation_expires_at TEXT,
    created_at TEXT NOT NULL
  )`);
  addColumn('shop_boosts', 'placement', "TEXT NOT NULL DEFAULT 'directory'");
  connection.exec('CREATE INDEX IF NOT EXISTS idx_shop_boosts_capacity ON shop_boosts(city, category, status, starts_at, ends_at)');
  connection.exec('CREATE INDEX IF NOT EXISTS idx_shop_boosts_placement_capacity ON shop_boosts(placement, city, category, status, starts_at, ends_at)');
  connection.exec(`CREATE TABLE IF NOT EXISTS subscription_reminder_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    days_before INTEGER NOT NULL,
    attempted_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    sent_at TEXT,
    UNIQUE (shop_id, expires_at, days_before)
  )`);
  addColumn('subscription_reminder_deliveries', 'attempts', 'INTEGER NOT NULL DEFAULT 1');
  if (!hadPublicationStatus) {
    connection.exec(`UPDATE shops SET publication_status = CASE
      WHEN is_active = 0 THEN 'suspended'
      WHEN merchant_verification_status IN ('pending', 'submitted', 'under_review', 'rejected') THEN 'draft'
      WHEN subscription_status NOT IN ('trialing', 'active') THEN 'draft'
      ELSE 'active'
    END`);
  }
  addColumn('orders', 'status', "TEXT DEFAULT 'pending'");
  addColumn('orders', 'customer_user_id', 'INTEGER');
  addColumn('analytics_events', 'source', 'TEXT');
  addColumn('analytics_events', 'campaign', 'TEXT');
  addColumn('orders', 'attribution_campaign', 'TEXT');
  connection.exec('CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status)');
  connection.exec('CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_shop_created ON subscription_payment_intents(shop_id, created_at DESC)');
  connection.exec(`CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_reconcile
    ON subscription_payment_intents(status, provider_checked_at, created_at)
    WHERE provider_reference IS NOT NULL AND status IN ('pending', 'expired')`);
  addColumn('products', 'category', 'TEXT');
  addColumn('products', 'created_at', 'TEXT');
  addColumn('products', 'is_visible', 'INTEGER NOT NULL DEFAULT 1');
  connection.exec('UPDATE products SET is_visible = is_available WHERE is_visible = 1 AND is_available = 0 AND stock > 0');
  addColumn('products', 'attributes', 'TEXT');
  addColumn('products', 'gallery_images', 'TEXT');
  addColumn('products', 'sale_price', 'INTEGER');
  addColumn('products', 'sale_starts_at', 'TEXT');
  addColumn('products', 'sale_ends_at', 'TEXT');
  addColumn('users', 'phone', 'TEXT');
  addColumn('users', 'first_name', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'last_name', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'password_hash', 'TEXT');
  addColumn('users', 'is_active', 'INTEGER DEFAULT 1');
  addColumn('user_sessions', 'fingerprint', 'TEXT');
  addColumn('admin_sessions', 'role', "TEXT NOT NULL DEFAULT 'super_admin'");
  addColumn('platform_settings', 'subscription_plan_prices', `TEXT NOT NULL DEFAULT '{"standard":3000,"premium":5000,"pro":8000}'`);
  addColumn('platform_settings', 'subscription_plan_features', `TEXT NOT NULL DEFAULT '{"productLimit":null,"productPhotoLimit":6,"analyticsDayLimit":90,"boostDiscountPercent":15}'`);
  addColumn('shops', 'subscription_features_snapshot', 'TEXT');
  addColumn('shops', 'subscription_features_effective_at', 'TEXT');
  addColumn('didit_verification_sessions', 'consent_at', "TEXT NOT NULL DEFAULT ''");
  addColumn('didit_verification_sessions', 'consent_version', "TEXT NOT NULL DEFAULT ''");
  addColumn('didit_verification_sessions', 'last_webhook_at', 'TEXT');
  connection.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_email_unique ON shops (LOWER(owner_email)) WHERE owner_email IS NOT NULL AND owner_email <> ''");
}

function migrateLegacyKyc(connection: Database.Database) {
  connection.exec('CREATE TABLE IF NOT EXISTS didit_schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrationName = 'replace_legacy_kyc_with_didit';
  const applied = connection.prepare('SELECT name FROM didit_schema_migrations WHERE name = ?').get(migrationName);
  if (applied) return;
  connection.transaction(() => {
    connection.exec(`UPDATE shops SET merchant_verification_status = 'pending',
      publication_status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'draft' END`);
    connection.exec('DROP TABLE IF EXISTS merchant_identity_verifications');
    connection.prepare('INSERT INTO didit_schema_migrations (name, applied_at) VALUES (?, ?)').run(migrationName, new Date().toISOString());
  })();
}

export const postgresMigrations = [
  `CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    whatsapp_number TEXT NOT NULL, pin_code_hash TEXT NOT NULL, theme_color TEXT,
    welcome_message TEXT, is_open INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1,
    publication_status TEXT NOT NULL DEFAULT 'draft', featured_until TEXT,
    payment_status TEXT NOT NULL DEFAULT 'approved', payment_deadline_at TEXT,
    merchant_verification_status TEXT NOT NULL DEFAULT 'not_required',
    selected_subscription_tier TEXT, subscription_expires_at TEXT,
    pending_subscription_tier TEXT, pending_subscription_effective_at TEXT,
    subscription_cancel_at TEXT, subscription_admin_suspended_at TEXT,
    subscription_admin_suspended_status TEXT,
    subscription_admin_override_status TEXT,
    subscription_admin_override_tier TEXT,
    subscription_admin_override_until TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'active', trial_start TEXT, trial_end TEXT,
    last_notification_sent_at TEXT, whatsapp_subscription_reminders_enabled INTEGER NOT NULL DEFAULT 0,
    whatsapp_subscription_reminders_consent_at TEXT, created_at TEXT NOT NULL, category TEXT NOT NULL,
    city TEXT, owner_name TEXT, owner_phone TEXT, owner_email TEXT, subscription_tier TEXT NOT NULL, theme_config JSONB, opening_hours JSONB,
    owner_access_token_hash TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_account_consents (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    terms_document TEXT NOT NULL,
    privacy_document TEXT NOT NULL,
    accepted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT,
    sale_price INTEGER, sale_starts_at TEXT, sale_ends_at TEXT,
    is_available INTEGER NOT NULL DEFAULT 1, is_visible INTEGER NOT NULL DEFAULT 1, category TEXT, sizes JSONB, colors JSONB, created_at TEXT,
    lookbook_image TEXT, gallery_images JSONB, prep_time INTEGER, modifier_groups JSONB, attributes JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, delivery_location TEXT NOT NULL, delivery_note TEXT,
    delivery_slot TEXT, payment_method_preference TEXT, total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', items JSONB,
    customer_user_id BIGINT, attribution_campaign TEXT
  )`,
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_campaign TEXT',
  `CREATE TABLE IF NOT EXISTS order_whatsapp_tracking (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, clicked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS subscription_payment_intents (
    id TEXT PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_type TEXT NOT NULL DEFAULT 'subscription', tier TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'XOF',
    client_request_id TEXT, status TEXT NOT NULL DEFAULT 'pending', provider_reference TEXT UNIQUE, provider_checkout_url TEXT,
    provider_checked_at TEXT, provider_check_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, paid_at TEXT
  )`,
  'ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS client_request_id TEXT',
  'ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS provider_checkout_url TEXT',
  'ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS provider_checked_at TEXT',
  'ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS provider_check_attempts INTEGER NOT NULL DEFAULT 0',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_payment_intents_client_request_id ON subscription_payment_intents(shop_id, client_request_id) WHERE client_request_id IS NOT NULL AND client_request_id <> ''",
  "ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'subscription'",
  "ALTER TABLE subscription_payment_intents ADD COLUMN IF NOT EXISTS subscription_term TEXT NOT NULL DEFAULT 'monthly'",
  `CREATE TABLE IF NOT EXISTS shop_boosts (
    id TEXT PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    payment_intent_id TEXT NOT NULL UNIQUE REFERENCES subscription_payment_intents(id) ON DELETE CASCADE,
    city TEXT NOT NULL,
    category TEXT NOT NULL,
    placement TEXT NOT NULL DEFAULT 'directory',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    reservation_expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  "ALTER TABLE shop_boosts ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'directory'",
  'CREATE INDEX IF NOT EXISTS idx_shop_boosts_capacity ON shop_boosts(city, category, status, starts_at, ends_at)',
  'CREATE INDEX IF NOT EXISTS idx_shop_boosts_placement_capacity ON shop_boosts(placement, city, category, status, starts_at, ends_at)',
  `CREATE TABLE IF NOT EXISTS subscription_reminder_deliveries (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    days_before INTEGER NOT NULL,
    attempted_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    sent_at TEXT,
    UNIQUE (shop_id, expires_at, days_before)
  )`,
  'ALTER TABLE subscription_reminder_deliveries ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1',
  `CREATE TABLE IF NOT EXISTS merchant_push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_merchant_push_subscriptions_shop ON merchant_push_subscriptions(shop_id)',
  `CREATE TABLE IF NOT EXISTS merchant_push_deliveries (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    attempted_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    sent_at TEXT,
    last_error TEXT,
    attempted_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (shop_id, event_key)
  )`,
  "ALTER TABLE merchant_push_deliveries ADD COLUMN IF NOT EXISTS payload_json TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE merchant_push_deliveries ADD COLUMN IF NOT EXISTS attempted_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE merchant_push_deliveries ADD COLUMN IF NOT EXISTS sent_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE merchant_push_deliveries ADD COLUMN IF NOT EXISTS failed_count INTEGER NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS platform_announcements (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '/app',
    created_at TEXT NOT NULL,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY, shop_id INTEGER, event_type TEXT NOT NULL,
    session_id TEXT NOT NULL, path TEXT, source TEXT, campaign TEXT, created_at TEXT NOT NULL
  )`,
  'ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS source TEXT',
  'ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS campaign TEXT',
  `CREATE TABLE IF NOT EXISTS advertising_beta_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), starts_at TEXT, ends_at TEXT,
    delivery_enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  `INSERT INTO advertising_beta_settings (id, delivery_enabled, updated_at)
    VALUES (1, 0, CURRENT_TIMESTAMP::TEXT) ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS advertising_campaigns (
    id TEXT PRIMARY KEY, shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('product', 'banner')),
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    headline TEXT NOT NULL, body TEXT NOT NULL, duration_days INTEGER NOT NULL CHECK (duration_days = 7),
    charter_accepted_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review'
      CHECK (status IN ('pending_review', 'rejected', 'scheduled', 'active', 'suspended', 'completed', 'cancelled')),
    starts_at TEXT, ends_at TEXT, review_note TEXT, reviewed_by TEXT, reviewed_at TEXT,
    submitted_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (shop_id, kind)
  )`,
  'ALTER TABLE advertising_campaigns ADD COLUMN IF NOT EXISTS charter_accepted_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_delivery ON advertising_campaigns(status, starts_at, ends_at, kind)',
  'CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_shop ON advertising_campaigns(shop_id, submitted_at DESC)',
  `CREATE TABLE IF NOT EXISTS advertising_campaign_events (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES advertising_campaigns(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'shop_visit', 'contact_click')),
    visitor_hash TEXT NOT NULL, event_date TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (campaign_id, event_type, visitor_hash, event_date)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_advertising_campaign_events_campaign ON advertising_campaign_events(campaign_id, created_at)',
  `CREATE TABLE IF NOT EXISTS advertising_partner_requests (
    id TEXT PRIMARY KEY, contact_name TEXT NOT NULL, company_name TEXT NOT NULL,
    email TEXT NOT NULL, phone TEXT,
    requested_format TEXT NOT NULL CHECK (requested_format IN ('banner', 'product', 'partnership', 'other')),
    objective TEXT NOT NULL, message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'declined')),
    admin_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_advertising_partner_requests_status ON advertising_partner_requests(status, created_at DESC)',
  `CREATE TABLE IF NOT EXISTS advertising_permanent_partners (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, descriptor TEXT NOT NULL, headline TEXT NOT NULL,
    logo_url TEXT, destination_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_advertising_permanent_partners_public ON advertising_permanent_partners(is_active, sort_order, created_at)',
  `CREATE TABLE IF NOT EXISTS platform_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), maintenance_enabled INTEGER NOT NULL DEFAULT 0,
    maintenance_message TEXT NOT NULL DEFAULT 'Le service revient bientôt. Merci de votre patience.',
    subscription_plan_prices TEXT NOT NULL DEFAULT '{"standard":3000,"premium":5000,"pro":8000}',
    subscription_plan_features TEXT NOT NULL DEFAULT '{"productLimit":null,"productPhotoLimit":6,"analyticsDayLimit":90,"boostDiscountPercent":15}',
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  `ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS subscription_plan_prices TEXT NOT NULL DEFAULT '{"standard":3000,"premium":5000,"pro":8000}'`,
  `ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS subscription_plan_features TEXT NOT NULL DEFAULT '{"productLimit":null,"productPhotoLimit":6,"analyticsDayLimit":90,"boostDiscountPercent":15}'`,
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_features_snapshot TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_features_effective_at TEXT',
  `INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
    VALUES (1, 0, 'Le service revient bientôt. Merci de votre patience.', CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS merchant_sessions (
    token TEXT PRIMARY KEY, shop_id INTEGER NOT NULL, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'super_admin', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT \'super_admin\'',
  `CREATE TABLE IF NOT EXISTS request_rate_limits (
    key_hash TEXT PRIMARY KEY, request_count INTEGER NOT NULL, reset_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_request_rate_limits_reset ON request_rate_limits(reset_at)',
  `CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
    shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_shop_created ON admin_audit_logs(shop_id, created_at DESC)',
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT \'pending\'',
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS colors JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS lookbook_image TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_images JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS prep_time INTEGER',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS modifier_groups JSONB',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT \'approved\'',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_deadline_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS selected_subscription_tier TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT \'active\'',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_start TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS trial_end TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_expires_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS pending_subscription_tier TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS pending_subscription_effective_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_cancel_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_admin_suspended_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_admin_suspended_status TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_admin_override_status TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_admin_override_tier TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS subscription_admin_override_until TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS whatsapp_subscription_reminders_enabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS whatsapp_subscription_reminders_consent_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_shop_created ON subscription_payment_intents(shop_id, created_at DESC)',
  `CREATE INDEX IF NOT EXISTS idx_subscription_payment_intents_reconcile
    ON subscription_payment_intents(status, provider_checked_at, created_at)
    WHERE provider_reference IS NOT NULL AND status IN ('pending', 'expired')`,
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_hours JSONB',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_access_token_hash TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_name TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_phone TEXT',
  'CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_shop_available ON products(shop_id, is_available)',
  'CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at ON orders(shop_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_analytics_events_shop_created_at ON analytics_events(shop_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_merchant_sessions_shop_id ON merchant_sessions(shop_id)',
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS customer_account_consents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_document TEXT NOT NULL,
    privacy_document TEXT NOT NULL,
    accepted_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY, user_id BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customer_oauth_identities (
    provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (provider, provider_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS customer_favorites (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
    target_id BIGINT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, target_type, target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS customer_product_likes (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS customer_reviews (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id BIGINT NOT NULL, shop_id BIGINT NOT NULL, target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')),
    target_id BIGINT NOT NULL, rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
    created_at TEXT NOT NULL, reviewed_at TEXT, UNIQUE (order_id, user_id, target_type, target_id)
  )`,
  `CREATE TABLE IF NOT EXISTS customer_reports (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('shop', 'product')), target_id BIGINT NOT NULL,
    reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
    created_at TEXT NOT NULL, reviewed_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_customer_favorites_user_created ON customer_favorites(user_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_customer_product_likes_product ON customer_product_likes(product_id)',
  'CREATE INDEX IF NOT EXISTS idx_customer_reviews_public ON customer_reviews(target_type, target_id, status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_customer_reports_moderation ON customer_reports(status, created_at DESC)',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_reports_one_open_per_target ON customer_reports(user_id, target_type, target_id) WHERE status IN ('pending', 'in_review')",
  'CREATE INDEX IF NOT EXISTS idx_customer_oauth_user_id ON customer_oauth_identities(user_id)',
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT',
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE shops ADD COLUMN IF NOT EXISTS merchant_verification_status TEXT NOT NULL DEFAULT 'not_required'",
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS publication_status TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS featured_until TEXT',
  `UPDATE shops SET publication_status = CASE
    WHEN is_active = 0 THEN 'suspended'
    WHEN merchant_verification_status IN ('pending', 'submitted', 'under_review', 'rejected') THEN 'draft'
    WHEN subscription_status NOT IN ('trialing', 'active') THEN 'draft'
    ELSE 'active'
  END WHERE publication_status IS NULL`,
  "ALTER TABLE shops ALTER COLUMN publication_status SET DEFAULT 'draft'",
  'ALTER TABLE shops ALTER COLUMN publication_status SET NOT NULL',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price INTEGER',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_starts_at TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TEXT',
  'CREATE TABLE IF NOT EXISTS id_allocators (name TEXT PRIMARY KEY, last_id BIGINT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status)',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS is_visible INTEGER NOT NULL DEFAULT 1',
  'UPDATE products SET is_visible = is_available WHERE is_visible = 1 AND is_available = 0 AND stock > 0',
  'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_owner_email_unique ON shops (LOWER(owner_email)) WHERE owner_email IS NOT NULL AND owner_email <> ''",
  `CREATE TABLE IF NOT EXISTS didit_verification_sessions (
    session_id TEXT PRIMARY KEY, shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    workflow_id TEXT NOT NULL, status TEXT NOT NULL, consent_at TEXT NOT NULL, consent_version TEXT NOT NULL, last_webhook_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  "ALTER TABLE didit_verification_sessions ADD COLUMN IF NOT EXISTS consent_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE didit_verification_sessions ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE didit_verification_sessions ADD COLUMN IF NOT EXISTS last_webhook_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_didit_sessions_shop_created ON didit_verification_sessions(shop_id, created_at DESC)',
  'CREATE TABLE IF NOT EXISTS didit_webhook_events (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS geniuspay_webhook_events (
    event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payment_intent_id TEXT,
    provider_reference TEXT, payload_sha256 TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'received', result_code TEXT,
    received_at TEXT NOT NULL, processed_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_geniuspay_webhook_events_intent_received ON geniuspay_webhook_events(payment_intent_id, received_at DESC)',
  'CREATE TABLE IF NOT EXISTS didit_schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
];

export const db = sqliteDb ?? new Proxy({} as Database.Database, {
  get() {
    throw new Error('Synchronous SQLite access is disabled in PostgreSQL mode. Use the PostgreSQL repository API.');
  },
});

export async function initializeDatabase() {
  if (postgresPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL est requise pour le stockage PostgreSQL en production.');
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');
      for (const migration of postgresMigrations) await client.query(migration);
      const migrationName = 'replace_legacy_kyc_with_didit';
      const migration = await client.query('SELECT name FROM didit_schema_migrations WHERE name = $1', [migrationName]);
      if (migration.rowCount === 0) {
        await client.query(`UPDATE shops SET merchant_verification_status = 'pending',
          publication_status = CASE WHEN is_active = 0 THEN 'suspended' ELSE 'draft' END`);
        await client.query('DROP TABLE IF EXISTS merchant_identity_verifications');
        await client.query('INSERT INTO didit_schema_migrations (name, applied_at) VALUES ($1, $2)', [migrationName, new Date().toISOString()]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return postgresPool;
  }
  return sqliteDb!;
}

export function getPostgresPool() {
  if (!postgresPool) throw new Error('PostgreSQL pool requested outside production mode.');
  return postgresPool;
}

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`).replace(/\bINSERT OR IGNORE INTO\b/i, 'INSERT INTO');
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (postgresPool) {
    const result = await postgresPool.query(postgresSql(sql), params);
    return result.rows[0] as T | undefined;
  }
  return sqliteDb!.prepare(sql).get(...params) as T | undefined;
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (postgresPool) {
    const result = await postgresPool.query(postgresSql(sql), params);
    return result.rows as T[];
  }
  return sqliteDb!.prepare(sql).all(...params) as T[];
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
  if (postgresPool) {
    const result = await postgresPool.query(postgresSql(sql), params);
    const insertedId = result.rows[0]?.id;
    return { changes: result.rowCount || 0, lastInsertRowid: insertedId == null ? undefined : Number(insertedId) };
  }
  const result = sqliteDb!.prepare(sql).run(...params);
  return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
}

export async function dbTransaction<T>(operation: (query: {
  get: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Row | undefined>;
  all: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Row[]>;
  run: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
}) => Promise<T>): Promise<T> {
  if (postgresPool) {
    const client = await postgresPool.connect();
    const query = {
      get: async <Row = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const result = await client.query(postgresSql(sql), params);
        return result.rows[0] as Row | undefined;
      },
      all: async <Row = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        const result = await client.query(postgresSql(sql), params);
        return result.rows as Row[];
      },
      run: async (sql: string, params: unknown[] = []) => {
        const result = await client.query(postgresSql(sql), params);
        const insertedId = result.rows[0]?.id;
        return { changes: result.rowCount || 0, lastInsertRowid: insertedId == null ? undefined : Number(insertedId) };
      },
    };
    try {
      await client.query('BEGIN');
      const result = await operation(query);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  let releaseQueue: () => void = () => undefined;
  const previousTransaction = sqliteTransactionQueue;
  sqliteTransactionQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
  await previousTransaction;
  try {
    sqliteDb!.exec('BEGIN IMMEDIATE');
    const query = {
      get: async <Row = Record<string, unknown>>(sql: string, params: unknown[] = []) => sqliteDb!.prepare(sql).get(...params) as Row | undefined,
      all: async <Row = Record<string, unknown>>(sql: string, params: unknown[] = []) => sqliteDb!.prepare(sql).all(...params) as Row[],
      run: async (sql: string, params: unknown[] = []) => {
        const result = sqliteDb!.prepare(sql).run(...params);
        return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
      },
    };
    const result = await operation(query);
    sqliteDb!.exec('COMMIT');
    return result;
  } catch (error) {
    sqliteDb!.exec('ROLLBACK');
    throw error;
  } finally {
    releaseQueue();
  }
}

export function closeDatabase() {
  if (postgresPool) return postgresPool.end();
  sqliteDb?.close();
}