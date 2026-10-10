import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { CATEGORY_DEFAULTS } from '../src/utils/categoryDefaults';
import { toDiscoveryCitySlug } from '../src/utils/discoverySeo';

const TEST_PORT = 43124;
const TEST_DB_PATH = path.join(tmpdir(), `matable-public-audit-${Date.now()}.db`);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ReturnType<typeof spawn> | null = null;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error('Server did not become ready in time.');
}

before(async () => {
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: 'super-admin-demo-key',
      NODE_ENV: 'test',
      PORT: String(TEST_PORT),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: BASE_URL,
      KADEVPAY_PUBLIC_KEY: 'kdvp_test_public_key',
      KADEVPAY_WEBHOOK_SECRET: 'public-audit-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on('data', (chunk) => process.stderr.write(chunk));
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const serverExit = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await serverExit;
  }
  await Promise.all(['', '-wal', '-shm'].map((suffix) => rm(`${TEST_DB_PATH}${suffix}`, { force: true })));
});

function uniquePhone() {
  const suffix = String(Date.now() + Math.floor(Math.random() * 100000)).slice(-8);
  return `+22507${suffix}`.slice(0, 15);
}

function uniqueEmail() {
  return `merchant-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function submitAndApproveShop(shopId: number, merchantCookie: string, tier: 'standard' | 'premium' | 'pro' = 'standard') {
  const trialStart = await fetch(`${BASE_URL}/api/shops/${shopId}/start-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier }),
  });
  assert.equal(trialStart.status, 200, await trialStart.text());
  const database = new Database(TEST_DB_PATH);
  database.prepare("UPDATE shops SET merchant_verification_status = 'verified' WHERE id = ?").run(shopId);
  database.close();
  const publication = await fetch(`${BASE_URL}/api/shops/${shopId}/publication-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ publication_status: 'active' }),
  });
  assert.equal(publication.status, 200, await publication.text());
}

async function loginAndApproveShop(shop: { id: number; owner_access_token: string }, tier: 'standard' | 'premium' | 'pro' = 'standard'): Promise<string> {
  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: shop.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  await submitAndApproveShop(shop.id, cookie, tier);
  return cookie;
}

async function payForSubscription(shopId: number, merchantCookie: string, tier: 'premium' | 'pro') {
  const expiryDb = new Database(TEST_DB_PATH);
  try {
    const expiredAt = new Date(Date.now() - 3 * 86400000).toISOString();
    expiryDb.prepare('UPDATE shops SET trial_end = ?, subscription_expires_at = ? WHERE id = ?')
      .run(expiredAt, expiredAt, shopId);
  } finally {
    expiryDb.close();
  }
  const amount = tier === 'premium' ? 5000 : 8000;
  const intentResponse = await fetch(`${BASE_URL}/api/shops/${shopId}/subscription-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ tier }),
  });
  const intent = await intentResponse.json();
  assert.equal(intentResponse.status, 201, JSON.stringify(intent));
  const payload = JSON.stringify({
    event: 'payment.success',
    data: {
      status: 'paid',
      reference: `KDV-${Date.now()}`,
      amount,
      currency: 'XOF',
      metadata: { subscription_payment_id: intent.payment_id },
    },
  });
  const signature = createHmac('sha512', 'public-audit-test-secret').update(payload).digest('hex');
  const payment = await fetch(`${BASE_URL}/api/webhooks/kadevpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kadevpay-signature': signature },
    body: payload,
  });
  assert.equal(payment.status, 200, await payment.text());
}

test('public directory shows active shops from the local onboarding flow', async () => {
  const publicShops = await fetch(`${BASE_URL}/api/shops`);
  assert.equal(publicShops.status, 200);
  const payload = await publicShops.json();
  assert.ok(Array.isArray(payload));
  assert.ok(payload.length > 0);
  assert.ok(payload.every((shop: any) => shop.is_active === true));

  const newPhone = uniquePhone();
  const ownerEmail = uniqueEmail();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique privée de test',
      whatsapp_number: newPhone,
      email: ownerEmail,
      pin_code: '456789',
      accepted_terms_privacy: true,
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(created.status, 200);
  const createdShop = await created.json();
  assert.match(String(createdShop.message), /Boutique créée/i);
  assert.equal(createdShop.shop.owner_email, undefined);
  const testDb = new Database(TEST_DB_PATH);
  try {
    const savedShop = testDb.prepare('SELECT owner_email FROM shops WHERE id = ?').get(createdShop.shop.id) as { owner_email: string };
    assert.equal(savedShop.owner_email, ownerEmail);
  } finally {
    testDb.close();
  }

  const directoryAfterCreate = await fetch(`${BASE_URL}/api/shops`);
  const directoryPayload = await directoryAfterCreate.json();
  const found = directoryPayload.find((shop: any) => shop.slug === createdShop.shop.slug);
  assert.equal(found, undefined, 'Pending shops must not appear in the public directory');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdShop.shop.slug}`);
  assert.equal(publicBySlug.status, 404);
  const sitemap = await fetch(`${BASE_URL}/sitemap.xml`);
  assert.equal((await sitemap.text()).includes(createdShop.shop.slug), false, 'Pending shops must not appear in the public sitemap');
});

test('V1 public catalog reads preserve the legacy directory and storefront responses', async () => {
  const [legacyDirectory, catalogDirectory] = await Promise.all([
    fetch(`${BASE_URL}/api/shops`),
    fetch(`${BASE_URL}/api/v1/catalog/storefronts`),
  ]);
  assert.equal(catalogDirectory.status, legacyDirectory.status);
  assert.match(catalogDirectory.headers.get('cache-control') || '', /public, max-age=30/);
  assert.match(legacyDirectory.headers.get('cache-control') || '', /public, max-age=30/);
  const legacyDirectoryPayload = await legacyDirectory.json();
  const catalogDirectoryPayload = await catalogDirectory.json();
  assert.deepEqual(catalogDirectoryPayload, legacyDirectoryPayload);

  const shopSlug = legacyDirectoryPayload[0]?.slug;
  assert.ok(shopSlug, 'The test database should include a publicly visible shop');
  const [legacyStorefront, catalogStorefront] = await Promise.all([
    fetch(`${BASE_URL}/api/shops/${encodeURIComponent(shopSlug)}`),
    fetch(`${BASE_URL}/api/v1/catalog/storefronts/${encodeURIComponent(shopSlug)}`),
  ]);
  assert.equal(catalogStorefront.status, legacyStorefront.status);
  assert.deepEqual(await catalogStorefront.json(), await legacyStorefront.json());
});

test('global security headers are present and non-public API responses are not cached', async () => {
  const response = await fetch(`${BASE_URL}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(self), microphone=(), geolocation=()');
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('robots and sitemap routes are served by the SEO router', async () => {
  const robots = await fetch(`${BASE_URL}/robots.txt`);
  assert.equal(robots.status, 200);
  const robotsText = await robots.text();
  assert.match(robotsText, /Sitemap: .*\/sitemap\.xml/);
  assert.doesNotMatch(robotsText, /Disallow: \/(app|admin)/, 'crawlers need to read noindex directives on private pages');

  const sitemap = await fetch(`${BASE_URL}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type') || '', /application\/xml/);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /<urlset/);
  assert.match(sitemapXml, /<loc>http:\/\/127\.0\.0\.1:43124\/faq<\/loc>/);
  assert.match(sitemapXml, /<loc>http:\/\/127\.0\.0\.1:43124\/boutiques<\/loc>/);
  assert.match(sitemapXml, /<loc>http:\/\/127\.0\.0\.1:43124\/comment-ca-marche<\/loc>/);
  assert.match(sitemapXml, /\/boutiques\/categorie\/fashion/);
  assert.match(sitemapXml, /\/boutiques\/ville\/abidjan/);
});

test('shop directory page exposes indexable SEO metadata in the initial HTML response', async () => {
  const response = await fetch(`${BASE_URL}/boutiques`, {
    headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Boutiques locales en Côte d’Ivoire \| MaTable\.ci<\/title>/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:43124\/boutiques" \/>/);
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large" \/>/);
  assert.match(html, /"@type":"CollectionPage"/);
  assert.match(html, /<noscript><main><h1>Découvrez les boutiques locales<\/h1>/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
});

test('how-it-works guide exposes indexable metadata and crawlable tutorial steps', async () => {
  const response = await fetch(`${BASE_URL}/comment-ca-marche`, {
    headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Comment ça marche \? \| MaTable\.ci<\/title>/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:43124\/comment-ca-marche" \/>/);
  assert.match(html, /"@type":"HowTo"/);
  assert.match(html, /"@type":"HowToStep"/);
  assert.match(html, /<noscript><main><h1>Comment ça marche sur MaTable\.ci \?<\/h1>/);
  assert.match(html, /Trouvez une boutique ou un produit/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
});

test('FAQ and private routes expose indexability metadata in the initial HTML response', async () => {
  const faq = await fetch(`${BASE_URL}/faq`, { headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' } });
  assert.equal(faq.status, 200);
  const faqHtml = await faq.text();
  assert.match(faqHtml, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:43124\/faq" \/>/);
  assert.match(faqHtml, /"@type":"FAQPage"/);
  assert.match(faqHtml, /Comment passer une commande/);

  const registration = await fetch(`${BASE_URL}/inscription`, { headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' } });
  assert.equal(registration.status, 200);
  assert.match(await registration.text(), /<meta name="robots" content="noindex, nofollow" \/>/);

  const merchantAccess = await fetch(`${BASE_URL}/app?access=one-time-token`, { headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' } });
  assert.equal(merchantAccess.status, 200);
  const merchantAccessHtml = await merchantAccess.text();
  assert.match(merchantAccessHtml, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.doesNotMatch(merchantAccessHtml, /<link rel="canonical"/);

  const missing = await fetch(`${BASE_URL}/page-seo-inexistante`, { headers: { 'User-Agent': 'Googlebot', Accept: 'text/html' } });
  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.match(missingHtml, /<title>Page introuvable \| MaTable\.ci<\/title>/);
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow" \/>/);
});

test('category landing pages expose server-rendered SEO metadata to social crawlers', async () => {
  const response = await fetch(`${BASE_URL}/boutiques/categorie/fashion`, {
    headers: { 'User-Agent': 'WhatsApp/2.0', Accept: 'text/html' },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Boutiques de mode en Côte d’Ivoire \| MaTable\.ci<\/title>/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:43124\/boutiques\/categorie\/fashion" \/>/);
  assert.match(html, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"CollectionPage"/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
});

test('public product feed filters by category and city and ranks consented interactions in aggregate', async () => {
  const directoryResponse = await fetch(`${BASE_URL}/api/v1/catalog/storefronts`);
  assert.equal(directoryResponse.status, 200);
  const directory = await directoryResponse.json() as Array<{
    id: number;
    category: string;
    city?: string;
    products_preview?: Array<{ id: number }>;
  }>;
  const shop = directory.find((candidate) => candidate.products_preview?.length && candidate.city);
  assert.ok(shop?.products_preview?.[0], 'A public shop with a preview product is required.');
  const product = shop.products_preview[0];
  const event = () => fetch(`${BASE_URL}/api/analytics/product-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: shop.id,
      product_id: product.id,
      event_type: 'product_click',
      session_id: `public-feed-${Date.now()}-${Math.random()}`,
    }),
  });
  assert.equal((await event()).status, 204);
  assert.equal((await event()).status, 204);

  const query = new URLSearchParams({ sort: 'popular', category: shop.category, city: toDiscoveryCitySlug(shop.city!) });
  const response = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/feed?${query}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /public, max-age=30/);
  const feed = await response.json() as {
    ranking_fallback: boolean;
    products: Array<{ id: number; popularity: { clicks: number }; shop: { category: string; city?: string } }>;
  };
  assert.equal(feed.ranking_fallback, false);
  assert.ok(feed.products.length > 0);
  assert.ok(feed.products.every((item) => item.shop.category === shop.category));
  assert.ok(feed.products.every((item) => toDiscoveryCitySlug(item.shop.city || '') === toDiscoveryCitySlug(shop.city!)));
  assert.ok(feed.products.find((item) => item.id === product.id)?.popularity.clicks >= 2);

  const invalidCategory = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/feed?category=not-a-category`);
  assert.equal(invalidCategory.status, 400);
});

test('public product feed paginates large catalogs without returning the whole catalog', async () => {
  const directory = await fetch(`${BASE_URL}/api/v1/catalog/storefronts`).then((response) => response.json()) as Array<{
    id: number;
    products_preview?: Array<{ id: number }>;
  }>;
  const shop = directory.find((candidate) => candidate.products_preview?.length);
  assert.ok(shop, 'A public shop with an existing product is required.');

  const database = new Database(TEST_DB_PATH);
  const insertProduct = database.prepare(
    `INSERT INTO products (shop_id, title, description, price, stock, is_available, is_visible, created_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
  );
  const insertManyProducts = database.transaction(() => {
    for (let index = 0; index < 60; index += 1) {
      insertProduct.run(shop.id, `Produit pagination ${index}`, 'Test pagination', 1000, 10, new Date(Date.now() + index).toISOString());
    }
  });
  insertManyProducts();
  database.close();

  const response = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/feed?sort=new&limit=24`);
  assert.equal(response.status, 200);
  const feed = await response.json() as { has_more: boolean; products: Array<{ title: string }> };
  assert.equal(feed.products.length, 24);
  assert.equal(feed.has_more, true);
  assert.match(feed.products[0].title, /^Produit pagination/);
});

test('merchant access-link pages are not cached and do not leak their URL as referrer', async () => {
  const response = await fetch(`${BASE_URL}/app?access=one-time-secret`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('shop and product API defaults are category-aware and product placeholders are not persisted', async () => {
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Atelier beauté API',
      whatsapp_number: uniquePhone(),
      email: uniqueEmail(),
      pin_code: '274915',
      accepted_terms_privacy: true,
      category: 'beauty',
      theme_config: {
        custom_banner_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200',
      },
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();
  assert.equal(createdPayload.shop.welcome_message, CATEGORY_DEFAULTS.beauty.welcomeMessage);
  assert.equal(createdPayload.shop.theme_config.custom_banner_url, '');
  assert.equal(createdPayload.shop.theme_config.primary_color, CATEGORY_DEFAULTS.beauty.primaryColor);

  const login = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  await submitAndApproveShop(createdPayload.shop.id, cookie);

  const reusedLogin = await fetch(`${BASE_URL}/api/auth/merchant-access-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: createdPayload.owner_access_token }),
  });
  assert.equal(reusedLogin.status, 401);

  const productResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      title: 'Soin hydratant',
      price: 5000,
      stock: 3,
      attributes: { care_type: 'Hydratant', volume: '250 ml', wrong_field: 'À ignorer' },
    }),
  });
  assert.equal(productResponse.status, 200);
  const productPayload = await productResponse.json();
  assert.equal(productPayload.product.image_url, '');
  assert.deepEqual(productPayload.product.attributes, { care_type: 'Hydratant', volume: '250 ml' });

  const restrictedProductResponse = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      title: 'Puff rechargeable',
      price: 6000,
      stock: 4,
    }),
  });
  assert.equal(restrictedProductResponse.status, 200);
  const restrictedProduct = (await restrictedProductResponse.json()).product;

  const storefrontResponse = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/${createdPayload.shop.slug}`);
  assert.equal(storefrontResponse.status, 200);
  const storefront = await storefrontResponse.json();
  assert.equal(storefront.has_age_restricted_products, true);
  assert.equal(storefront.products.some((product: { id: number }) => product.id === restrictedProduct.id), false);

  const ageConfirmedStorefrontResponse = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/${createdPayload.shop.slug}?age_confirmed=1`);
  assert.equal(ageConfirmedStorefrontResponse.status, 200);
  assert.match(ageConfirmedStorefrontResponse.headers.get('cache-control') || '', /private, no-store/);
  const ageConfirmedStorefront = await ageConfirmedStorefrontResponse.json();
  assert.equal(ageConfirmedStorefront.products.some((product: { id: number }) => product.id === restrictedProduct.id), true);

  const publicDirectory = await fetch(`${BASE_URL}/api/v1/catalog/storefronts`);
  const directoryShops = await publicDirectory.json();
  const directoryShop = directoryShops.find((shop: { slug: string }) => shop.slug === createdPayload.shop.slug);
  assert.equal(directoryShop.products_preview.some((product: { id: number }) => product.id === restrictedProduct.id), false);

  const publicFeed = await fetch(`${BASE_URL}/api/v1/catalog/storefronts/feed?sort=new&limit=48`);
  const publicFeedPayload = await publicFeed.json();
  assert.equal(publicFeedPayload.products.some((product: { id: number }) => product.id === restrictedProduct.id), false);

  const restrictedOrder = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop_id: createdPayload.shop.id,
      customer_name: 'Client test',
      customer_phone: uniquePhone(),
      delivery_location: 'Cocody',
      payment_method_preference: 'to_confirm',
      items: [{ product_id: restrictedProduct.id, quantity: 1 }],
    }),
  });
  assert.equal(restrictedOrder.status, 403);

  const persistedDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const persistedProduct = persistedDb.prepare('SELECT image_url, attributes FROM products WHERE id = ?').get(productPayload.product.id) as { image_url: string; attributes: string };
    assert.equal(persistedProduct.image_url, '');
    assert.deepEqual(JSON.parse(persistedProduct.attributes), { care_type: 'Hydratant', volume: '250 ml' });
  } finally {
    persistedDb.close();
  }

  const legacyImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600' }),
  });
  assert.equal(legacyImageUpdate.status, 200);
  assert.equal((await legacyImageUpdate.json()).product.image_url, '');

  const realImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: 'https://example.com/soin-hydratant.jpg' }),
  });
  assert.equal(realImageUpdate.status, 200);
  assert.equal((await realImageUpdate.json()).product.image_url, 'https://example.com/soin-hydratant.jpg');

  const clearImageUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/products/${productPayload.product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ image_url: '' }),
  });
  assert.equal(clearImageUpdate.status, 200);
  assert.equal((await clearImageUpdate.json()).product.image_url, '');

  const publicShop = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicShop.status, 200);
  const publicShopPayload = await publicShop.json();
  assert.deepEqual(publicShopPayload.products[0].attributes, { care_type: 'Hydratant', volume: '250 ml' });

  const finalDb = new Database(TEST_DB_PATH, { readonly: true });
  try {
    const persistedProduct = finalDb.prepare('SELECT image_url FROM products WHERE id = ?').get(productPayload.product.id) as { image_url: string };
    assert.equal(persistedProduct.image_url, '');
  } finally {
    finalDb.close();
  }

});

test('rejects unauthenticated payment activation and merchant mutations', async () => {
  const confirmation = await fetch(`${BASE_URL}/api/shops/1/payment-confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment_method: 'mobile_money', amount: 1 }),
  });
  assert.equal(confirmation.status, 404);

  const productMutation = await fetch(`${BASE_URL}/api/shops/1/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'attaque', price: 1, stock: 1 }),
  });
  assert.equal(productMutation.status, 401);

  const protectedMutations: Array<{ path: string; method: string; body?: unknown }> = [
    { path: '/api/shops/1/toggle-status', method: 'PATCH', body: { is_open: true } },
    { path: '/api/shops/1/publication-status', method: 'PATCH', body: { publication_status: 'active' } },
    { path: '/api/shops/1/theme', method: 'PUT', body: { theme_config: { primary_color: '#176b55' } } },
    { path: '/api/shops/1', method: 'PUT', body: { name: 'Modification non autorisée' } },
    { path: '/api/shops/1/orders/1/status', method: 'PATCH', body: { status: 'confirmed' } },
    { path: '/api/shops/1/products/1', method: 'PUT', body: { title: 'Modification non autorisée' } },
    { path: '/api/shops/1/products/1/stock', method: 'PATCH', body: { delta: 1 } },
    { path: '/api/shops/1/products/1/toggle-visibility', method: 'PATCH' },
    { path: '/api/shops/1/products/1', method: 'DELETE' },
    { path: '/api/shops/1/access-link', method: 'POST' },
  ];
  for (const mutation of protectedMutations) {
    const response = await fetch(`${BASE_URL}${mutation.path}`, {
      method: mutation.method,
      ...(mutation.body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mutation.body),
      }),
    });
    assert.equal(response.status, 401, `${mutation.method} ${mutation.path} must require an authenticated merchant`);
  }

  const removedToggleMethod = await fetch(`${BASE_URL}/api/shops/1/toggle-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_open: true }),
  });
  assert.equal(removedToggleMethod.status, 404);

  const protectedReads = [
    '/api/shops/1/products',
    '/api/shops/1/orders',
    '/api/shops/1/flash-bilan',
  ];
  for (const route of protectedReads) {
    assert.equal((await fetch(`${BASE_URL}${route}`)).status, 401, `${route} must require an authenticated merchant`);
  }

  for (const route of ['/api/admin/shops', '/api/admin/orders', '/api/admin/analytics', '/api/admin/health', '/api/admin/identity-verifications']) {
    assert.equal((await fetch(`${BASE_URL}${route}`)).status, 401, `${route} must require an authenticated admin`);
  }
});

test('registration flow is coherent without external payment or WhatsApp API', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Paiement Test',
      whatsapp_number: newPhone,
      email: uniqueEmail(),
      pin_code: '987654',
      accepted_terms_privacy: true,
      category: 'food',
      city: 'San Pedro',
      subscription_tier: 'premium',
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();
  assert.match(String(createdPayload.message), /reçu WhatsApp/i);

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, pin: '987654' }),
  });
  assert.equal(merchantLogin.status, 200);
  const database = new Database(TEST_DB_PATH);
  database.prepare("UPDATE shops SET is_active = 0, publication_status = 'suspended' WHERE id = ?").run(createdPayload.shop.id);
  database.close();
  const inactiveOwnerLogin = await fetch(`${BASE_URL}/api/auth/merchant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, pin: '987654' }),
  });
  assert.equal(inactiveOwnerLogin.status, 200, await inactiveOwnerLogin.text());
  const inactiveOwnerCookie = inactiveOwnerLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(inactiveOwnerCookie);
  const identityStatus = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/identity-verification`, {
    headers: { Cookie: inactiveOwnerCookie },
  });
  assert.equal(identityStatus.status, 200, await identityStatus.text());
});

test('standard registration keeps delivery zones but does not grant premium social links', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Checklist Social',
      whatsapp_number: newPhone,
      email: uniqueEmail(),
      pin_code: '112233',
      accepted_terms_privacy: true,
      category: 'fashion',
      city: 'Yopougon',
      subscription_tier: 'standard',
      theme_config: {
        social_links: {
          instagram: 'https://instagram.com/boutiquechecklist',
          facebook: 'https://facebook.com/boutiquechecklist',
        },
        delivery_zones: [
          { label: 'Cocody', mode: 'livraison', fee: 1500, description: 'Livraison rapide' },
          { label: 'Yopougon', mode: 'sur_place', fee: 0 },
        ],
      },
    }),
  });

  assert.equal(created.status, 200, 'Shop creation should succeed');
  const createdPayload = await created.json();
  assert.equal(createdPayload.shop.theme_config?.social_links?.instagram, '');
  assert.deepEqual(createdPayload.shop.theme_config?.delivery_zones?.[0]?.label, 'Cocody');
  const merchantCookie = await loginAndApproveShop({ id: createdPayload.shop.id, owner_access_token: createdPayload.owner_access_token });

  const deniedUpdate = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ theme_config: { social_links: { instagram: 'https://instagram.com/standard-shop' } } }),
  });
  assert.equal(deniedUpdate.status, 403);
  const deniedBranding = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/theme`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ theme_config: { primary_color: '#123456' } }),
  });
  assert.equal(deniedBranding.status, 403);
  const deniedEventMode = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: merchantCookie },
    body: JSON.stringify({ theme_config: { event_mode_enabled: true, event_banner_text: 'Promotion test' } }),
  });
  assert.equal(deniedEventMode.status, 403);
  const deniedAnalytics = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/analytics`, { headers: { Cookie: merchantCookie } });
  assert.equal(deniedAnalytics.status, 403);

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.theme_config?.social_links?.instagram, '');
  assert.equal(publicData.shop.theme_config?.delivery_zones?.[0]?.mode, 'livraison');
});

test('merchant can update storefront social links and service zones', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Métadonnées Merchant',
      whatsapp_number: newPhone,
      email: uniqueEmail(),
      pin_code: '445566',
      accepted_terms_privacy: true,
      category: 'beauty',
      city: 'Yopougon',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();

  const merchantLogin = await fetch(`${BASE_URL}/api/auth/merchant-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: newPhone, pin: '445566' }),
  });
  assert.equal(merchantLogin.status, 200);
  const merchantCookies = merchantLogin.headers.get('set-cookie');
  const merchantCookieHeader = merchantCookies ? merchantCookies.split(';')[0] : undefined;
  assert.ok(merchantCookieHeader);
  await submitAndApproveShop(createdPayload.shop.id, merchantCookieHeader, 'premium');
  const premiumAnalytics = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/analytics`, { headers: { Cookie: merchantCookieHeader } });
  assert.equal(premiumAnalytics.status, 403);
  await payForSubscription(createdPayload.shop.id, merchantCookieHeader, 'premium');

  const updateRes = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(merchantCookieHeader ? { Cookie: merchantCookieHeader } : {}),
    },
    body: JSON.stringify({
      theme_config: {
      brand_direction: 'moderne',
        social_links: {
          instagram: 'https://instagram.com/merchant-meta',
          facebook: 'https://facebook.com/merchant-meta',
          website: 'https://merchant-meta.ci',
        },
        delivery_zones: [
          { label: 'Cocody', mode: 'livraison', fee: 1200, description: 'Livraison rapide' },
          { label: 'Sur place', mode: 'sur_place', fee: 0 },
        ],
      },
    }),
  });

  assert.equal(updateRes.status, 200, 'merchant metadata update should succeed');
  const updated = await updateRes.json();
  assert.equal(updated.shop.theme_config?.social_links?.instagram, 'https://instagram.com/merchant-meta');
  assert.equal(updated.shop.theme_config?.brand_direction, 'moderne');
  assert.equal(updated.shop.theme_config?.delivery_zones?.[0]?.label, 'Cocody');

  const themeSave = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.id}/theme`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(merchantCookieHeader ? { Cookie: merchantCookieHeader } : {}),
    },
    body: JSON.stringify({
      theme_config: {
        brand_direction: 'authentique',
        primary_color: '#176B55',
      },
    }),
  });
  assert.equal(themeSave.status, 200, 'theme save should succeed');
  const savedTheme = await themeSave.json();
  assert.equal(savedTheme.shop.theme_config?.brand_direction, 'authentique');
  assert.equal(savedTheme.shop.theme_config?.primary_color, '#176B55');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.theme_config?.social_links?.instagram, 'https://instagram.com/merchant-meta');
  assert.equal(publicData.shop.theme_config?.brand_direction, 'authentique');
  assert.equal(publicData.shop.theme_config?.primary_color, '#176B55');
  assert.equal(publicData.shop.theme_config?.delivery_zones?.[0]?.mode, 'livraison');
});

test('onboarding preserves explicit opening-hours and keeps the storefront open inside the configured schedule', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Horaires Publics',
      whatsapp_number: newPhone,
      email: uniqueEmail(),
      pin_code: '778899',
      accepted_terms_privacy: true,
      category: 'food',
      city: 'Abidjan',
      subscription_tier: 'standard',
      opening_hours: {
        enabled: true,
        open_time: '00:00',
        close_time: '23:59',
        days: [0, 1, 2, 3, 4, 5, 6],
        manual_override: false,
      },
    }),
  });

  assert.equal(created.status, 200, 'Shop creation with opening-hours should succeed');
  const createdPayload = await created.json();
  assert.equal(createdPayload.shop.opening_hours.enabled, true);
  assert.equal(createdPayload.shop.opening_hours.open_time, '00:00');
  await loginAndApproveShop({ id: createdPayload.shop.id, owner_access_token: createdPayload.owner_access_token }, 'premium');

  const publicBySlug = await fetch(`${BASE_URL}/api/shops/${createdPayload.shop.slug}`);
  assert.equal(publicBySlug.status, 200);
  const publicData = await publicBySlug.json();
  assert.equal(publicData.shop.opening_hours.enabled, true);
  assert.equal(publicData.shop.is_open, true);

});

test('public directory prioritizes open shops before closed ones in discovery order', async () => {
  const closedPhone = uniquePhone();
  const closedCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Fermée Prioritaire',
      whatsapp_number: closedPhone,
      email: uniqueEmail(),
      pin_code: '332211',
      accepted_terms_privacy: true,
      category: 'beauty',
      city: 'Abidjan',
      subscription_tier: 'standard',
    }),
  });
  assert.equal(closedCreate.status, 200);
  const closedPayload = await closedCreate.json();

  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  const openHour = Math.max(0, currentHour - 1);
  const closeHour = currentHour + 2;
  const pad = (value: number) => String(value).padStart(2, '0');
  const openFrom = `${pad(openHour)}:00`;
  const openUntil = `${pad(Math.min(23, closeHour))}:00`;

  const effectiveOpenHours = closeHour >= 24 ? {
    enabled: true,
    open_time: openFrom,
    close_time: '23:59',
    days: [currentDay],
    manual_override: false,
  } : {
    enabled: true,
    open_time: openFrom,
    close_time: openUntil,
    days: [currentDay],
    manual_override: false,
  };

  const openPhone = uniquePhone();
  const openCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Ouverte Prioritaire',
      whatsapp_number: openPhone,
      email: uniqueEmail(),
      pin_code: '112244',
      accepted_terms_privacy: true,
      category: 'food',
      city: 'Yopougon',
      subscription_tier: 'standard',
      opening_hours: effectiveOpenHours,
    }),
  });
  assert.equal(openCreate.status, 200);
  const openPayload = await openCreate.json();
  const closedMerchantCookie = await loginAndApproveShop({ id: closedPayload.shop.id, owner_access_token: closedPayload.owner_access_token });
  await loginAndApproveShop({ id: openPayload.shop.id, owner_access_token: openPayload.owner_access_token });
  const closeShop = await fetch(`${BASE_URL}/api/shops/${closedPayload.shop.id}/toggle-status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: closedMerchantCookie },
    body: JSON.stringify({ is_open: false }),
  });
  assert.equal(closeShop.status, 200, await closeShop.text());

  const directory = await fetch(`${BASE_URL}/api/shops`);
  assert.equal(directory.status, 200);
  const directoryPayload = await directory.json();
  const openIndex = directoryPayload.findIndex((shop: any) => shop.slug === openPayload.shop.slug);
  const closedIndex = directoryPayload.findIndex((shop: any) => shop.slug === closedPayload.shop.slug);
  assert.ok(openIndex >= 0, 'Open shop should appear in the directory');
  assert.ok(closedIndex >= 0, 'Closed shop should appear in the directory');
  assert.ok(openIndex < closedIndex, 'Open shops should be listed before closed shops in discovery order');
});

test('shop pages expose canonical SEO metadata for social sharing and indexing', async () => {
  const newPhone = uniquePhone();
  const created = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique SEO Test',
      whatsapp_number: newPhone,
      email: uniqueEmail(),
      pin_code: '667788',
      accepted_terms_privacy: true,
      category: 'fashion',
      city: 'Abidjan',
      subscription_tier: 'standard',
      theme_config: {
        custom_banner_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=1200&auto=format&fit=crop&q=80',
      },
    }),
  });
  assert.equal(created.status, 200);
  const createdPayload = await created.json();
  await loginAndApproveShop({ id: createdPayload.shop.id, owner_access_token: createdPayload.owner_access_token });

  const publicPage = await fetch(`${BASE_URL}/${encodeURIComponent(createdPayload.shop.slug)}`);
  assert.equal(publicPage.status, 200);
  const html = await publicPage.text();
  assert.match(html, /<title>.*Boutique SEO Test.*MaTable\.ci.*<\/title>/i);
  assert.match(html, /<meta name="description"/i);
  assert.match(html, /<link rel="canonical" href=".*\/boutique-seo-test"/i);
  assert.match(html, /og:title|og:image|twitter:card/i);
});

test('free onboarding keeps the shop active without subscription controls', async () => {
  const shopCreate = await fetch(`${BASE_URL}/api/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Boutique Rappel Test',
      whatsapp_number: uniquePhone(),
      email: uniqueEmail(),
      pin_code: '223344',
      accepted_terms_privacy: true,
      category: 'food',
      city: 'Bouaké',
      subscription_tier: 'standard',
    }),
  });
  const shopCreateText = await shopCreate.text();
  assert.equal(shopCreate.status, 200, `Shop creation failed: ${shopCreateText}`);
  const reminderShop = JSON.parse(shopCreateText);
  assert.equal(reminderShop.shop.is_active, true);

  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const cookies = adminLogin.headers.get('set-cookie');
  const cookieHeader = cookies ? cookies.split(';')[0] : undefined;

  const adminShops = await fetch(`${BASE_URL}/api/admin/shops`, {
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  assert.equal(adminShops.status, 200);
  const adminShop = (await adminShops.json()).find((shop: any) => shop.id === reminderShop.shop.id);
  assert.equal(adminShop.is_active, true);
});

test('admin featuring validates duration and publishes only the public flag', async () => {
  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);

  const publicBefore = await fetch(`${BASE_URL}/api/shops`);
  const shopsBefore = await publicBefore.json();
  assert.ok(shopsBefore.length > 0);
  const featuredShop = shopsBefore[0];
  assert.equal(Object.hasOwn(featuredShop, 'visibility_score'), false);

  const unauthenticated = await fetch(`${BASE_URL}/api/admin/shops/${featuredShop.id}/featured`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: 7 }),
  });
  assert.equal(unauthenticated.status, 401);

  const invalidDuration = await fetch(`${BASE_URL}/api/admin/shops/${featuredShop.id}/featured`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 91 }),
  });
  assert.equal(invalidDuration.status, 400);

  const featureResponse = await fetch(`${BASE_URL}/api/admin/shops/${featuredShop.id}/featured`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 7 }),
  });
  assert.equal(featureResponse.status, 200);
  const featureData = await featureResponse.json();
  assert.ok(Date.parse(featureData.featured_until) > Date.now());

  const publicAfter = await fetch(`${BASE_URL}/api/shops`);
  const featuredPublicShop = (await publicAfter.json()).find((shop: any) => shop.id === featuredShop.id);
  assert.equal(featuredPublicShop.is_featured, true);
  assert.equal(Object.hasOwn(featuredPublicShop, 'visibility_score'), false);

  const clearResponse = await fetch(`${BASE_URL}/api/admin/shops/${featuredShop.id}/featured`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ days: 0 }),
  });
  assert.equal(clearResponse.status, 200);
  assert.equal((await clearResponse.json()).featured_until, null);
});

test('admin analytics excludes cancelled and expired orders from revenue and daily totals', async () => {
  const adminLogin = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'super-admin-demo-key' }),
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie);

  const publicShops = await fetch(`${BASE_URL}/api/shops`).then((response) => response.json());
  const shopId = publicShops[0].id as number;
  const baseline = await fetch(`${BASE_URL}/api/admin/analytics?days=7`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const baselineShop = baseline.by_shop.find((shop: any) => shop.shop_id === shopId);
  const baselineDailyOrders = baseline.order_daily.reduce((sum: number, day: any) => sum + day.orders, 0);
  const baselineDailySales = baseline.order_daily.reduce((sum: number, day: any) => sum + day.sales, 0);

  const now = new Date().toISOString();
  const testDb = new Database(TEST_DB_PATH);
  try {
    const insertOrder = testDb.prepare(`
      INSERT INTO orders (id, shop_id, customer_name, customer_phone, delivery_location, payment_method_preference, total_amount, created_at, status, items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const idBase = Date.now() * 10;
    insertOrder.run(idBase, shopId, 'Test valide', '+2250700000001', 'Abidjan', 'cash', 100, now, 'pending', '[]');
    insertOrder.run(idBase + 1, shopId, 'Test annulé', '+2250700000002', 'Abidjan', 'cash', 200, now, 'cancelled', '[]');
    insertOrder.run(idBase + 2, shopId, 'Test expiré', '+2250700000003', 'Abidjan', 'cash', 300, now, 'expired', '[]');
  } finally {
    testDb.close();
  }

  const analytics = await fetch(`${BASE_URL}/api/admin/analytics?days=7`, { headers: { Cookie: adminCookie } }).then((response) => response.json());
  const shopAnalytics = analytics.by_shop.find((shop: any) => shop.shop_id === shopId);
  const dailyOrders = analytics.order_daily.reduce((sum: number, day: any) => sum + day.orders, 0);
  const dailySales = analytics.order_daily.reduce((sum: number, day: any) => sum + day.sales, 0);
  assert.equal(shopAnalytics.orders - (baselineShop?.orders || 0), 1);
  assert.equal(shopAnalytics.sales - (baselineShop?.sales || 0), 100);
  assert.equal(dailyOrders - baselineDailyOrders, 1);
  assert.equal(dailySales - baselineDailySales, 100);
});
