import fs from 'node:fs/promises';
import path from 'node:path';
import { dbAll, dbGet, databaseMode } from '../db.ts';

/**
 * Rapport de traçabilité MaTable.
 *
 * Usage :
 *   npm run analytics:report -- --days=30
 *   npm run analytics:report -- --days=30 --format=csv --out=analytics.csv
 *
 * Les événements ne contiennent aucune donnée personnelle : le rapport agrège
 * uniquement des sessions anonymes, des audiences et des entités internes.
 */

interface ReportOptions {
  days: number;
  format: 'json' | 'csv';
  out: string | null;
}

export interface AnalyticsReport {
  generated_at: string;
  database: string;
  days: number;
  since: string;
  summary: {
    page_views: number;
    visitors: number;
    sessions: number;
    orders: number;
    sales: number;
    qr_scans: number;
    qr_visitors: number;
  };
  audiences: Array<{ audience: string; events: number; sessions: number }>;
  pages: Array<{ path: string; views: number; visitors: number }>;
  logins: Array<{ audience: string; logins: number; sessions: number }>;
  signups: Array<{ audience: string; signups: number; sessions: number }>;
  devices: Array<{ device: string; sessions: number; events: number }>;
  funnel: Array<{ step: string; count: number; conversion_from_previous: number; conversion_from_visit: number }>;
  qr_scans: {
    total: number;
    visitors: number;
    by_shop: Array<{ shop_id: number; shop_name: string | null; scans: number; visitors: number }>;
  };
  product_clicks: Array<{
    product_id: number;
    shop_id: number | null;
    title: string | null;
    views: number;
    clicks: number;
  }>;
  co_viewed_products: Array<{
    product_a: number;
    product_b: number;
    title_a: string | null;
    title_b: string | null;
    sessions: number;
  }>;
}

function parseArgs(argv: string[]): ReportOptions {
  const options: ReportOptions = { days: 30, format: 'json', out: null };
  for (const argument of argv) {
    const [rawKey, rawValue] = argument.replace(/^--/, '').split('=');
    const value = rawValue ?? '';
    if (rawKey === 'days') {
      const days = Number(value);
      if (Number.isInteger(days)) options.days = Math.min(Math.max(days, 1), 365);
    } else if (rawKey === 'format') {
      if (value === 'csv' || value === 'json') options.format = value;
    } else if (rawKey === 'out') {
      options.out = value || null;
    }
  }
  return options;
}

function share(part: number, total: number): number {
  return total ? Number(((part / total) * 100).toFixed(1)) : 0;
}

export async function buildAnalyticsReport(days: number): Promise<AnalyticsReport> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [traffic, sites, audiences, pages, logins, signups, devices, funnel, qrByShop, productClicks, coViewed, commerce] = await Promise.all([
    dbGet<{ page_views: number; visitors: number; sessions: number }>(`
      SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS visitors,
        COUNT(DISTINCT session_id) AS sessions
      FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
    `, [since]),
    dbGet<{ qr_scans: number; qr_visitors: number }>(`
      SELECT COUNT(*) AS qr_scans, COUNT(DISTINCT session_id) AS qr_visitors
      FROM analytics_events
      WHERE event_type = 'page_view' AND campaign = 'qr' AND created_at >= ?
    `, [since]),
    dbAll<{ audience: string; events: number; sessions: number }>(`
      SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS events,
        COUNT(DISTINCT session_id) AS sessions
      FROM analytics_events WHERE created_at >= ?
      GROUP BY COALESCE(audience, 'unknown') ORDER BY events DESC
    `, [since]),
    dbAll<{ path: string; views: number; visitors: number }>(`
      SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors
      FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      GROUP BY path ORDER BY views DESC, path ASC LIMIT 50
    `, [since]),
    dbAll<{ audience: string; logins: number; sessions: number }>(`
      SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS logins,
        COUNT(DISTINCT session_id) AS sessions
      FROM analytics_events WHERE event_type = 'login' AND created_at >= ?
      GROUP BY COALESCE(audience, 'unknown') ORDER BY logins DESC
    `, [since]),
    dbAll<{ audience: string; signups: number; sessions: number }>(`
      SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS signups,
        COUNT(DISTINCT session_id) AS sessions
      FROM analytics_events WHERE event_type = 'signup' AND created_at >= ?
      GROUP BY COALESCE(audience, 'unknown') ORDER BY signups DESC
    `, [since]),
    dbAll<{ device: string; sessions: number; events: number }>(`
      SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT session_id) AS sessions,
        COUNT(*) AS events
      FROM analytics_events WHERE created_at >= ?
      GROUP BY COALESCE(device, 'unknown') ORDER BY sessions DESC
    `, [since]),
    dbGet<{ visits: number; product_views: number; cart_adds: number; checkouts: number; orders: number }>(`
      SELECT
        COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS visits,
        COUNT(DISTINCT CASE WHEN event_type = 'product_view' THEN session_id END) AS product_views,
        COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN session_id END) AS cart_adds,
        COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN session_id END) AS checkouts,
        COUNT(DISTINCT CASE WHEN event_type = 'order_created' THEN session_id END) AS orders
      FROM analytics_events WHERE created_at >= ?
    `, [since]),
    dbAll<{ shop_id: number; shop_name: string | null; scans: number; visitors: number }>(`
      SELECT events.shop_id, shops.name AS shop_name, COUNT(*) AS scans,
        COUNT(DISTINCT events.session_id) AS visitors
      FROM analytics_events events
      LEFT JOIN shops ON shops.id = events.shop_id
      WHERE events.event_type = 'page_view' AND events.campaign = 'qr'
        AND events.shop_id IS NOT NULL AND events.created_at >= ?
      GROUP BY events.shop_id, shops.name ORDER BY scans DESC
    `, [since]),
    dbAll<{ product_id: number; shop_id: number | null; title: string | null; views: number; clicks: number }>(`
      SELECT events.entity_id AS product_id, events.shop_id, products.title,
        SUM(CASE WHEN events.event_type = 'product_view' THEN 1 ELSE 0 END) AS views,
        SUM(CASE WHEN events.event_type = 'product_click' THEN 1 ELSE 0 END) AS clicks
      FROM analytics_events events
      LEFT JOIN products ON products.id = events.entity_id
      WHERE events.event_type IN ('product_view', 'product_click')
        AND events.entity_id IS NOT NULL AND events.created_at >= ?
      GROUP BY events.entity_id, events.shop_id, products.title
      ORDER BY clicks DESC, views DESC LIMIT 50
    `, [since]),
    dbAll<{ product_a: number; product_b: number; title_a: string | null; title_b: string | null; sessions: number }>(`
      SELECT first.entity_id AS product_a, second.entity_id AS product_b,
        product_a.title AS title_a, product_b.title AS title_b,
        COUNT(DISTINCT first.session_id) AS sessions
      FROM analytics_events first
      JOIN analytics_events second
        ON second.session_id = first.session_id AND second.event_type = 'product_view'
        AND second.entity_id IS NOT NULL AND second.entity_id > first.entity_id
      LEFT JOIN products product_a ON product_a.id = first.entity_id
      LEFT JOIN products product_b ON product_b.id = second.entity_id
      WHERE first.event_type = 'product_view' AND first.entity_id IS NOT NULL
        AND first.created_at >= ? AND second.created_at >= ?
      GROUP BY first.entity_id, second.entity_id, product_a.title, product_b.title
      ORDER BY sessions DESC LIMIT 25
    `, [since, since]),
    dbGet<{ orders: number; sales: number }>(`
      SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
      FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'expired')
    `, [since]),
  ]);

  const steps = [
    { step: 'visite', count: Number(funnel?.visits || 0) },
    { step: 'produit_vu', count: Number(funnel?.product_views || 0) },
    { step: 'panier', count: Number(funnel?.cart_adds || 0) },
    { step: 'commande_commencee', count: Number(funnel?.checkouts || 0) },
    { step: 'commande_creee', count: Number(funnel?.orders || 0) },
  ];

  return {
    generated_at: new Date().toISOString(),
    database: databaseMode,
    days,
    since,
    summary: {
      page_views: Number(traffic?.page_views || 0),
      visitors: Number(traffic?.visitors || 0),
      sessions: Number(traffic?.sessions || 0),
      orders: Number(commerce?.orders || 0),
      sales: Number(commerce?.sales || 0),
      qr_scans: Number(sites?.qr_scans || 0),
      qr_visitors: Number(sites?.qr_visitors || 0),
    },
    audiences: audiences.map((row) => ({
      audience: row.audience || 'unknown',
      events: Number(row.events || 0),
      sessions: Number(row.sessions || 0),
    })),
    pages: pages.map((row) => ({
      path: row.path || '/',
      views: Number(row.views || 0),
      visitors: Number(row.visitors || 0),
    })),
    logins: logins.map((row) => ({
      audience: row.audience || 'unknown',
      logins: Number(row.logins || 0),
      sessions: Number(row.sessions || 0),
    })),
    signups: signups.map((row) => ({
      audience: row.audience || 'unknown',
      signups: Number(row.signups || 0),
      sessions: Number(row.sessions || 0),
    })),
    devices: devices.map((row) => ({
      device: row.device || 'unknown',
      sessions: Number(row.sessions || 0),
      events: Number(row.events || 0),
    })),
    funnel: steps.map((step, index) => ({
      ...step,
      conversion_from_previous: index === 0 ? 100 : share(step.count, steps[index - 1].count),
      conversion_from_visit: share(step.count, steps[0].count),
    })),
    qr_scans: {
      total: Number(sites?.qr_scans || 0),
      visitors: Number(sites?.qr_visitors || 0),
      by_shop: qrByShop.map((row) => ({
        shop_id: Number(row.shop_id),
        shop_name: row.shop_name || null,
        scans: Number(row.scans || 0),
        visitors: Number(row.visitors || 0),
      })),
    },
    product_clicks: productClicks.map((row) => ({
      product_id: Number(row.product_id),
      shop_id: row.shop_id == null ? null : Number(row.shop_id),
      title: row.title || null,
      views: Number(row.views || 0),
      clicks: Number(row.clicks || 0),
    })),
    co_viewed_products: coViewed.map((row) => ({
      product_a: Number(row.product_a),
      product_b: Number(row.product_b),
      title_a: row.title_a || null,
      title_b: row.title_b || null,
      sessions: Number(row.sessions || 0),
    })),
  };
}

function toCsv(report: AnalyticsReport): string {
  const rows: string[][] = [['section', 'dimension', 'label', 'value', 'secondary', 'extra']];
  rows.push(['summary', 'page_views', 'vues', String(report.summary.page_views), String(report.summary.visitors), '']);
  rows.push(['summary', 'orders', 'commandes', String(report.summary.orders), String(report.summary.sales), '']);
  rows.push(['summary', 'qr', 'scans', String(report.summary.qr_scans), String(report.summary.qr_visitors), '']);
  for (const row of report.audiences) rows.push(['audience', row.audience, row.audience, String(row.events), String(row.sessions), '']);
  for (const row of report.pages) rows.push(['page', row.path, row.path, String(row.views), String(row.visitors), '']);
  for (const row of report.logins) rows.push(['login', row.audience, row.audience, String(row.logins), String(row.sessions), '']);
  for (const row of report.signups) rows.push(['signup', row.audience, row.audience, String(row.signups), String(row.sessions), '']);
  for (const row of report.devices) rows.push(['device', row.device, row.device, String(row.sessions), String(row.events), '']);
  for (const row of report.funnel) rows.push(['funnel', row.step, row.step, String(row.count), String(row.conversion_from_previous), String(row.conversion_from_visit)]);
  for (const row of report.qr_scans.by_shop) rows.push(['qr_scan', String(row.shop_id), row.shop_name || '', String(row.scans), String(row.visitors), '']);
  for (const row of report.product_clicks) rows.push(['product_click', String(row.product_id), row.title || '', String(row.clicks), String(row.views), row.shop_id == null ? '' : String(row.shop_id)]);
  for (const row of report.co_viewed_products) rows.push(['co_view', `${row.product_a}+${row.product_b}`, `${row.title_a || ''} + ${row.title_b || ''}`, String(row.sessions), '', '']);
  return rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(',')).join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildAnalyticsReport(options.days);
  const payload = options.format === 'csv' ? toCsv(report) : `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outputPath = path.resolve(options.out);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, payload, 'utf8');
    console.log(`Rapport analytics écrit : ${outputPath}`);
    return;
  }
  process.stdout.write(payload);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
