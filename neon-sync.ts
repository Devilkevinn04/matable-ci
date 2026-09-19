import { neon } from '@neondatabase/serverless';
import { db } from './db.ts';

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const sql = process.env.NODE_ENV === 'production' && databaseUrl ? neon(databaseUrl) : null;
let syncInFlight: Promise<void> | null = null;

const tableDefinitions = [
  `CREATE TABLE IF NOT EXISTS shops (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, whatsapp_number TEXT NOT NULL, pin_code_hash TEXT NOT NULL, theme_color TEXT, welcome_message TEXT, is_open INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, payment_status TEXT NOT NULL DEFAULT 'approved', payment_deadline_at TEXT, selected_subscription_tier TEXT, subscription_expires_at TEXT, last_notification_sent_at TEXT, created_at TEXT NOT NULL, category TEXT NOT NULL, city TEXT, subscription_tier TEXT NOT NULL, theme_config TEXT, opening_hours TEXT, owner_access_token_hash TEXT)`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT, is_available INTEGER NOT NULL DEFAULT 1, category TEXT, sizes TEXT, colors TEXT, lookbook_image TEXT, prep_time INTEGER, modifier_groups TEXT)`,
  `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, delivery_location TEXT NOT NULL, delivery_note TEXT, delivery_slot TEXT, payment_method_preference TEXT, total_amount INTEGER NOT NULL, created_at TEXT NOT NULL, status TEXT DEFAULT 'pending', items TEXT)`,
  `CREATE TABLE IF NOT EXISTS analytics_events (id BIGSERIAL PRIMARY KEY, shop_id INTEGER, event_type TEXT NOT NULL, session_id TEXT NOT NULL, path TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS payment_transactions (id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, reference TEXT NOT NULL, shop_id INTEGER NOT NULL, tier TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, transaction_date TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider, reference))`,
  `CREATE TABLE IF NOT EXISTS merchant_sessions (token TEXT PRIMARY KEY, shop_id INTEGER NOT NULL, expires_at BIGINT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, expires_at BIGINT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
];

const tableNames = ['shops', 'products', 'orders', 'analytics_events', 'payment_transactions', 'merchant_sessions', 'admin_sessions'] as const;

async function ensureNeonSchema() {
  if (!sql) return;
  for (const definition of tableDefinitions) {
    await sql.query(definition, []);
  }
}

function localRows(tableName: string) {
  return db.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];
}

async function replaceNeonTable(tableName: (typeof tableNames)[number]) {
  if (!sql) return;
  const rows = localRows(tableName);
  await sql.query(`DELETE FROM ${tableName}`, []);
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  for (const row of rows) {
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    await sql.query(
      `INSERT INTO ${tableName} (${quotedColumns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      columns.map((column) => row[column] ?? null),
    );
  }
}

export async function syncNeonFromLocal() {
  if (!sql) return;
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      await ensureNeonSchema();
      for (const tableName of tableNames) {
        await replaceNeonTable(tableName);
      }
    } catch (error) {
      console.error('Neon sync failed:', error);
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export async function hydrateLocalFromNeon(): Promise<boolean> {
  if (!sql) return false;

  try {
    await ensureNeonSchema();
    const remoteShops = await sql.query('SELECT * FROM shops ORDER BY id', []) as Record<string, unknown>[];
    if (remoteShops.length === 0) return false;

    for (const tableName of [...tableNames].reverse()) {
      db.prepare(`DELETE FROM ${tableName}`).run();
    }

    for (const tableName of tableNames) {
      const rows = await sql.query(`SELECT * FROM ${tableName}`, []) as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
      const insert = db.prepare(`INSERT INTO ${tableName} (${quotedColumns}) VALUES (${columns.map(() => '?').join(', ')})`);
      const transaction = db.transaction(() => {
        for (const row of rows) {
          insert.run(...columns.map((column) => row[column] ?? null));
        }
      });
      transaction();
    }

    console.log(`Hydrated local database from Neon (${remoteShops.length} shop(s)).`);
    return true;
  } catch (error) {
    console.error('Neon hydration failed; continuing with local database:', error);
    return false;
  }
}

export function installNeonSyncMiddleware(app: { use: (handler: any) => void }) {
  if (!sql) return;
  app.use((req: any, res: any, next: any) => {
    res.on('finish', () => {
      if (req.path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        void syncNeonFromLocal();
      }
    });
    next();
  });
}

export const neonEnabled = Boolean(sql);
