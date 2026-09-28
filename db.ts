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
    payment_status TEXT NOT NULL DEFAULT 'approved', payment_deadline_at TEXT,
    merchant_verification_status TEXT NOT NULL DEFAULT 'not_required',
    selected_subscription_tier TEXT, subscription_expires_at TEXT,
    last_notification_sent_at TEXT, created_at TEXT NOT NULL, category TEXT NOT NULL,
    city TEXT, subscription_tier TEXT NOT NULL, theme_config TEXT, opening_hours TEXT,
    owner_access_token_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT,
    is_available INTEGER NOT NULL DEFAULT 1, sizes TEXT, colors TEXT, lookbook_image TEXT,
    prep_time INTEGER, modifier_groups TEXT, attributes TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, delivery_location TEXT NOT NULL, delivery_note TEXT,
    delivery_slot TEXT, payment_method_preference TEXT, total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL, items TEXT, customer_user_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS order_whatsapp_tracking (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, clicked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, event_type TEXT NOT NULL,
    session_id TEXT NOT NULL, path TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, reference TEXT NOT NULL,
    shop_id INTEGER NOT NULL, tier TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
    transaction_date TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, reference)
  );
  CREATE TABLE IF NOT EXISTS merchant_sessions (
    token TEXT PRIMARY KEY, shop_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS id_allocators (name TEXT PRIMARY KEY, last_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS merchant_verifications (
    shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, provider_session_id TEXT NOT NULL UNIQUE, callback_token_hash TEXT, status TEXT NOT NULL,
    submitted_at TEXT NOT NULL, decided_at TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS merchant_verification_webhook_events (
    event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
  CREATE INDEX IF NOT EXISTS idx_products_shop_available ON products(shop_id, is_available);
  CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at ON orders(shop_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_shop_created_at ON analytics_events(shop_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_payment_transactions_shop_id ON payment_transactions(shop_id);
  CREATE INDEX IF NOT EXISTS idx_merchant_sessions_shop_id ON merchant_sessions(shop_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
`;

if (sqliteDb) {
  sqliteDb.exec(sqliteSchema);
  migrateSqlite(sqliteDb);
}

function migrateSqlite(connection: Database.Database) {
  const columns = (table: string) => connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const addColumn = (table: string, name: string, definition: string) => {
    if (!columns(table).some((column) => column.name === name)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };

  addColumn('shops', 'opening_hours', 'TEXT');
  addColumn('shops', 'owner_access_token_hash', 'TEXT');
  addColumn('shops', 'payment_status', "TEXT DEFAULT 'approved'");
  addColumn('shops', 'payment_deadline_at', 'TEXT');
  addColumn('shops', 'merchant_verification_status', "TEXT NOT NULL DEFAULT 'not_required'");
  addColumn('shops', 'selected_subscription_tier', 'TEXT');
  addColumn('orders', 'status', "TEXT DEFAULT 'pending'");
  addColumn('orders', 'customer_user_id', 'INTEGER');
  connection.exec('CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status)');
  addColumn('products', 'category', 'TEXT');
  addColumn('products', 'attributes', 'TEXT');
  addColumn('users', 'phone', 'TEXT');
  addColumn('users', 'password_hash', 'TEXT');
  addColumn('users', 'is_active', 'INTEGER DEFAULT 1');
  addColumn('user_sessions', 'fingerprint', 'TEXT');
}

const postgresMigrations = [
  `CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    whatsapp_number TEXT NOT NULL, pin_code_hash TEXT NOT NULL, theme_color TEXT,
    welcome_message TEXT, is_open INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1,
    payment_status TEXT NOT NULL DEFAULT 'approved', payment_deadline_at TEXT,
    merchant_verification_status TEXT NOT NULL DEFAULT 'not_required',
    selected_subscription_tier TEXT, subscription_expires_at TEXT,
    last_notification_sent_at TEXT, created_at TEXT NOT NULL, category TEXT NOT NULL,
    city TEXT, subscription_tier TEXT NOT NULL, theme_config JSONB, opening_hours JSONB,
    owner_access_token_hash TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
    price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT,
    is_available INTEGER NOT NULL DEFAULT 1, category TEXT, sizes JSONB, colors JSONB,
    lookbook_image TEXT, prep_time INTEGER, modifier_groups JSONB, attributes JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY, shop_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL, delivery_location TEXT NOT NULL, delivery_note TEXT,
    delivery_slot TEXT, payment_method_preference TEXT, total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', items JSONB,
    customer_user_id BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS order_whatsapp_tracking (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, clicked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY, shop_id INTEGER, event_type TEXT NOT NULL,
    session_id TEXT NOT NULL, path TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_transactions (
    id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, reference TEXT NOT NULL,
    shop_id INTEGER NOT NULL, tier TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0,
    transaction_date TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, reference)
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_sessions (
    token TEXT PRIMARY KEY, shop_id INTEGER NOT NULL, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT \'pending\'',
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS colors JSONB',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS lookbook_image TEXT',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS prep_time INTEGER',
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS modifier_groups JSONB',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT \'approved\'',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS payment_deadline_at TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS selected_subscription_tier TEXT',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS opening_hours JSONB',
  'ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_access_token_hash TEXT',
  'CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id)',
  'CREATE INDEX IF NOT EXISTS idx_products_shop_available ON products(shop_id, is_available)',
  'CREATE INDEX IF NOT EXISTS idx_orders_shop_created_at ON orders(shop_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_analytics_events_shop_created_at ON analytics_events(shop_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_payment_transactions_shop_id ON payment_transactions(shop_id)',
  'CREATE INDEX IF NOT EXISTS idx_merchant_sessions_shop_id ON merchant_sessions(shop_id)',
  `CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY, user_id BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_user_id BIGINT',
  "ALTER TABLE shops ADD COLUMN IF NOT EXISTS merchant_verification_status TEXT NOT NULL DEFAULT 'not_required'",
  'ALTER TABLE products ADD COLUMN IF NOT EXISTS attributes JSONB',
  'CREATE TABLE IF NOT EXISTS id_allocators (name TEXT PRIMARY KEY, last_id BIGINT NOT NULL)',
  `CREATE TABLE IF NOT EXISTS merchant_verifications (
    shop_id INTEGER PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, provider_session_id TEXT NOT NULL UNIQUE, callback_token_hash TEXT, status TEXT NOT NULL,
    submitted_at TEXT NOT NULL, decided_at TEXT, updated_at TEXT NOT NULL
  )`,
  'ALTER TABLE merchant_verifications ALTER COLUMN callback_token_hash DROP NOT NULL',
  'CREATE TABLE IF NOT EXISTS merchant_verification_webhook_events (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_merchant_verifications_status ON merchant_verifications(status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)',
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