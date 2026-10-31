import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const migrationVersions = [
  '001_client_sessions_and_product_attributes',
  '002_shared_id_allocator',
  '003_merchant_identity_verification',
  '004_merchant_verification_status_and_retention',
  '005_order_whatsapp_tracking',
  '006_product_gallery_images',
  '007_merchant_owner_email',
  '008_customer_first_last_name',
  '009_merchant_identity_prototype',
  '010_shop_publication_status',
  '011_merchant_identity_decision_method',
  '012_merchant_identity_document_back',
  '013_customer_oauth_identities',
  '014_shop_featured_until',
  '015_kadevpay_subscription_payments',
  '016_subscription_payment_type',
  '017_admin_subscription_actions',
  '018_platform_maintenance_and_analytics_sources',
  '019_subscription_terms_and_shop_boosts',
  '020_product_creation_timestamps',
  '021_customer_favorites_and_likes',
  '022_customer_reviews_and_reports',
  '023_didit_merchant_verification',
  '024_analytics_campaign_attribution',
  '025_boost_placements_and_reminders',
  '026_merchant_push_notifications',
  '027_geniuspay_webhook_events',
  '028_subscription_plan_prices',
  '029_scheduled_subscription_tier',
  '030_subscription_lifecycle_controls',
  '031_subscription_plan_features',
  '032_subscription_admin_overrides',
  '033_advertising_beta',
  '034_product_sales',
  '035_delivery_zone_tariffs',
  '036_delivery_mvp',
  '037_order_contact_audits',
  '038_delivery_tickets_proofs_payments',
  '039_delivery_notifications',
  '040_delivery_order_fees',
  '041_analytics_intelligence',
  '042_delivery_driver_didit_verification',
  '043_didit_session_resume',
  '044_shop_acquisitions',
];
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not configured.');
  process.exit(1);
}

if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
  console.error('DATABASE_URL must use the PostgreSQL protocol.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
let client: pg.PoolClient | undefined;

try {
  client = await pool.connect();
  await client.query('BEGIN');

  const existingTables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
  `);
  const tableNames = new Set(existingTables.rows.map((row: { table_name: string }) => row.table_name));
  const requiredTables = ['shops', 'products', 'orders', 'merchant_sessions', 'admin_sessions', 'analytics_events'];
  const missingTables = requiredTables.filter((table) => !tableNames.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Expected application tables are missing: ${missingTables.join(', ')}`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const statuses: { migration: string; status: string }[] = [];
  for (const migrationVersion of migrationVersions) {
    const alreadyApplied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migrationVersion]);
    if (alreadyApplied.rowCount === 0) {
      const migrationPath = path.join(process.cwd(), 'migrations', `${migrationVersion}.sql`);
      const migrationSql = await fs.readFile(migrationPath, 'utf8');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migrationVersion]);
      statuses.push({ migration: migrationVersion, status: 'applied' });
    } else {
      statuses.push({ migration: migrationVersion, status: 'already_applied' });
    }
  }

  await client.query('COMMIT');
  console.log(JSON.stringify(statuses));
} catch (error) {
  if (client) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original migration error.
    }
  }
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'MIGRATION_FAILED';
  console.error(JSON.stringify({ migrations: migrationVersions, status: 'failed', errorCode: code }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}