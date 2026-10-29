import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const args = new Set(process.argv.slice(2));
const skipDatabase = args.has('--skip-database');
const asJson = args.has('--json');

const passed = [];
const warnings = [];
const errors = [];

const value = (key) => String(process.env[key] ?? '').trim();
const isSet = (key) => value(key).length > 0;

function pass(message) {
  passed.push(message);
}

function warn(message) {
  warnings.push(message);
}

function fail(message) {
  errors.push(message);
}

function checkRequired(key) {
  if (isSet(key)) pass(`${key} est défini.`);
  else fail(`${key} est obligatoire.`);
  return value(key);
}

function checkSecret(key, { minimum = 32 } = {}) {
  const secret = value(key);
  if (!secret) {
    fail(`${key} est obligatoire.`);
    return '';
  }
  if (secret.length < minimum) {
    fail(`${key} doit contenir au moins ${minimum} caractères.`);
  } else if (/change_me|demo|example|legacy/i.test(secret)) {
    fail(`${key} contient une valeur de démonstration interdite en production.`);
  } else {
    pass(`${key} est défini et suffisamment long.`);
  }
  return secret;
}

function checkOptionalGroup(label, keys, { required = false } = {}) {
  const missing = keys.filter((key) => !isSet(key));
  if (missing.length === 0) {
    pass(`${label} : configuration complète.`);
    return true;
  }
  if (missing.length === keys.length) {
    if (required) fail(`${label} : aucune variable configurée (${keys.join(', ')}).`);
    else warn(`${label} désactivé : ${keys.join(', ')} absent(s).`);
    return false;
  }
  fail(`${label} : configuration partielle, variables manquantes → ${missing.join(', ')}.`);
  return false;
}

// --- Environnement ---------------------------------------------------------

if (value('NODE_ENV') === 'production') pass('NODE_ENV=production.');
else fail('NODE_ENV doit valoir "production".');

const appUrl = checkRequired('APP_URL');
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'https:') fail('APP_URL doit utiliser HTTPS.');
    else if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(parsed.hostname)) fail('APP_URL ne doit pas pointer vers localhost.');
    else if (/example\.(com|org)|change_me|demo/i.test(appUrl)) fail('APP_URL contient un domaine d’exemple.');
    else pass('APP_URL est une URL HTTPS publique.');
  } catch {
    fail('APP_URL n’est pas une URL valide.');
  }
}

const port = Number(value('PORT') || 3000);
if (Number.isInteger(port) && port > 0 && port <= 65535) pass(`PORT=${port}.`);
else fail('PORT doit être un entier entre 1 et 65535.');

const databaseUrl = checkRequired('DATABASE_URL');
if (databaseUrl && !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  fail('DATABASE_URL doit utiliser le protocole PostgreSQL.');
} else if (databaseUrl) {
  pass('DATABASE_URL utilise le protocole PostgreSQL.');
}

const adminKey = checkSecret('ADMIN_ACCESS_KEY');
const verificationKey = checkSecret('VERIFICATION_ADMIN_ACCESS_KEY');
if (adminKey && verificationKey && adminKey === verificationKey) {
  fail('ADMIN_ACCESS_KEY et VERIFICATION_ADMIN_ACCESS_KEY doivent être différentes.');
}

const advertisingBetaEnabled = value('ADVERTISING_BETA_ENABLED') === 'true';
if (advertisingBetaEnabled) {
  checkSecret('AD_EVENT_SIGNING_SECRET');
  warn('ADVERTISING_BETA_ENABLED=true : vérifier que la bêta publicitaire est validée.');
} else {
  pass('ADVERTISING_BETA_ENABLED est désactivé.');
}

const proxyHops = Number(value('TRUST_PROXY_HOPS') || 0);
if (Number.isInteger(proxyHops) && proxyHops >= 0) pass(`TRUST_PROXY_HOPS=${proxyHops}.`);
else fail('TRUST_PROXY_HOPS doit être un entier positif ou nul.');

if (value('DEMO_MODE').toLowerCase() === 'true') {
  fail('DEMO_MODE doit être false en production.');
}

const deliveryEnabled = value('DELIVERY_OPERATIONS_ENABLED') === 'true';
if (deliveryEnabled) warn('DELIVERY_OPERATIONS_ENABLED=true : les migrations livraison doivent être appliquées.');

// --- Intégrations facultatives --------------------------------------------

checkOptionalGroup('Vérification Didit', ['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET']);
if (isSet('DIDIT_DRIVER_WORKFLOW_ID') && !isSet('DIDIT_WORKFLOW_ID')) {
  warn('DIDIT_DRIVER_WORKFLOW_ID est défini sans DIDIT_WORKFLOW_ID de secours.');
}

checkOptionalGroup('Paiements GeniusPay', ['GENIUSPAY_API_KEY', 'GENIUSPAY_API_SECRET', 'GENIUSPAY_WEBHOOK_SECRET']);

const resendFrom = value('RESEND_FROM_EMAIL') || value('EMAIL_FROM');
if (isSet('RESEND_API_KEY') && !resendFrom) {
  fail('RESEND_API_KEY est défini sans RESEND_FROM_EMAIL ni EMAIL_FROM.');
} else if (isSet('RESEND_API_KEY') && resendFrom) {
  pass('E-mails transactionnels Resend configurés.');
} else {
  warn('E-mails transactionnels désactivés : RESEND_API_KEY absent.');
}

checkOptionalGroup('Notifications Push', ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']);
checkOptionalGroup('Rappels WhatsApp', [
  'WHATSAPP_CLOUD_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE',
  'WHATSAPP_GRAPH_API_VERSION',
]);
checkOptionalGroup('Connexion Google', ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']);
checkOptionalGroup('Connexion Apple', ['APPLE_SERVICE_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']);

if (!isSet('VITE_WHATSAPP_ADMIN_PHONE')) {
  warn('VITE_WHATSAPP_ADMIN_PHONE est vide : le lien d’assistance WhatsApp public sera masqué.');
}

// --- Base de données -------------------------------------------------------

const requiredTables = [
  'shops',
  'products',
  'orders',
  'merchant_sessions',
  'admin_sessions',
  'users',
  'user_sessions',
  'platform_settings',
  'analytics_events',
  'advertising_campaigns',
  'advertising_campaign_events',
  'delivery_drivers',
  'delivery_orders',
  'delivery_zones',
  'delivery_course_events',
  'delivery_driver_identity_sessions',
];

const requiredColumns = {
  orders: ['attribution_campaign', 'delivery_fee'],
  analytics_events: ['campaign', 'audience', 'entity_type', 'entity_id', 'device', 'locale', 'metadata'],
  delivery_drivers: ['identity_status'],
  platform_settings: ['subscription_plan_prices', 'subscription_plan_features'],
  admin_sessions: ['role'],
};

let migrationFiles = [];
try {
  migrationFiles = (await fs.readdir(path.resolve('migrations')))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => file.replace(/\.sql$/, ''));
} catch {
  warn('Dossier migrations/ introuvable : état des migrations non vérifié.');
}

if (skipDatabase) {
  warn('Vérification de la base ignorée (--skip-database).');
} else if (!databaseUrl) {
  fail('Vérification de la base impossible sans DATABASE_URL.');
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    const identity = await client.query('SELECT current_database() AS database, version() AS version');
    const databaseName = identity.rows[0]?.database ?? 'inconnue';
    const serverVersion = String(identity.rows[0]?.version ?? '').split(' ').slice(0, 2).join(' ');
    pass(`Connexion PostgreSQL réussie (${databaseName}, ${serverVersion}).`);

    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const tables = new Set(tablesResult.rows.map((row) => row.table_name));
    const missingTables = requiredTables.filter((table) => !tables.has(table));
    if (missingTables.length > 0) fail(`Tables manquantes : ${missingTables.join(', ')}.`);
    else pass(`${requiredTables.length} tables applicatives attendues présentes.`);

    const columnsResult = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const columns = new Map();
    for (const row of columnsResult.rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name).add(row.column_name);
    }
    for (const [table, expected] of Object.entries(requiredColumns)) {
      const missing = expected.filter((column) => !columns.get(table)?.has(column));
      if (missing.length > 0) fail(`Colonnes manquantes sur ${table} : ${missing.join(', ')}.`);
      else pass(`Colonnes récentes présentes sur ${table}.`);
    }

    const hasMigrationTable = tables.has('schema_migrations');
    if (!hasMigrationTable) {
      warn('Table schema_migrations absente : schéma créé au démarrage, versions non horodatées.');
    } else if (migrationFiles.length > 0) {
      const applied = await client.query('SELECT version FROM schema_migrations');
      const appliedVersions = new Set(applied.rows.map((row) => row.version));
      const missingMigrations = migrationFiles.filter((version) => !appliedVersions.has(version));
      if (missingMigrations.length === 0) {
        pass(`Les ${migrationFiles.length} migrations versionnées sont enregistrées.`);
      } else {
        warn(`schema_migrations incomplet : ${missingMigrations.length}/${migrationFiles.length} manquante(s). Exécuter "npm run migrate:neon".`);
      }
    }

    const counts = await client.query(`
      SELECT 'shops' AS name, COUNT(*)::int AS count FROM shops
      UNION ALL SELECT 'products', COUNT(*)::int FROM products
      UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
    `);
    const summary = counts.rows.map((row) => `${row.name}=${row.count}`).join(', ');
    pass(`Données accessibles : ${summary}.`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    fail(`Connexion ou inspection PostgreSQL impossible${code ? ` (${code})` : ''}.`);
  } finally {
    client?.release();
    await pool.end();
  }
}

// --- Rapport ---------------------------------------------------------------

const report = {
  status: errors.length === 0 ? 'ready' : 'blocked',
  errors,
  warnings,
  passed,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const message of passed) console.log(`PASS  ${message}`);
  for (const message of warnings) console.warn(`WARN  ${message}`);
  for (const message of errors) console.error(`FAIL  ${message}`);
  console.log(`\nRésultat : ${passed.length} contrôle(s) réussi(s), ${warnings.length} avertissement(s), ${errors.length} erreur(s).`);
}

if (errors.length > 0) process.exitCode = 1;
