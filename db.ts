import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export const databaseMode = 'sqlite';

const dataDir = path.join(process.cwd(), 'data');
const configuredDbPath = process.env.MATABLE_DB_PATH ? path.resolve(process.env.MATABLE_DB_PATH) : path.join(dataDir, 'matable.db');
const dbPath = configuredDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    whatsapp_number TEXT NOT NULL,
    pin_code_hash TEXT NOT NULL,
    theme_color TEXT,
    welcome_message TEXT,
    is_open INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    payment_status TEXT NOT NULL DEFAULT 'approved',
    payment_deadline_at TEXT,
    selected_subscription_tier TEXT,
    subscription_expires_at TEXT,
    last_notification_sent_at TEXT,
    created_at TEXT NOT NULL,
    category TEXT NOT NULL,
    city TEXT,
    subscription_tier TEXT NOT NULL,
    theme_config TEXT,
    opening_hours TEXT,
    owner_access_token_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    is_available INTEGER NOT NULL DEFAULT 1,
    sizes TEXT,
    colors TEXT,
    lookbook_image TEXT,
    prep_time INTEGER,
    modifier_groups TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    shop_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_location TEXT NOT NULL,
    delivery_note TEXT,
    delivery_slot TEXT,
    payment_method_preference TEXT,
    total_amount INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    items TEXT
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER,
    event_type TEXT NOT NULL,
    session_id TEXT NOT NULL,
    path TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    reference TEXT NOT NULL,
    shop_id INTEGER NOT NULL,
    tier TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    transaction_date TEXT NOT NULL,
    processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, reference)
  );
`);

const shopColumns = db.prepare('PRAGMA table_info(shops)').all() as { name: string }[];
if (!shopColumns.some((column) => column.name === 'opening_hours')) {
  db.exec('ALTER TABLE shops ADD COLUMN opening_hours TEXT');
}
if (!shopColumns.some((column) => column.name === 'owner_access_token_hash')) {
  db.exec('ALTER TABLE shops ADD COLUMN owner_access_token_hash TEXT');
}
if (!shopColumns.some((column) => column.name === 'payment_status')) {
  db.exec("ALTER TABLE shops ADD COLUMN payment_status TEXT DEFAULT 'approved'");
}
if (!shopColumns.some((column) => column.name === 'payment_deadline_at')) {
  db.exec('ALTER TABLE shops ADD COLUMN payment_deadline_at TEXT');
}
if (!shopColumns.some((column) => column.name === 'selected_subscription_tier')) {
  db.exec('ALTER TABLE shops ADD COLUMN selected_subscription_tier TEXT');
}

const orderColumns = db.prepare('PRAGMA table_info(orders)').all() as { name: string }[];
if (!orderColumns.some((column) => column.name === 'status')) {
  db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending'");
}

const productColumns = db.prepare('PRAGMA table_info(products)').all() as { name: string }[];
if (!productColumns.some((column) => column.name === 'category')) {
  db.exec('ALTER TABLE products ADD COLUMN category TEXT');
}

export function initializeDatabase() {
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
