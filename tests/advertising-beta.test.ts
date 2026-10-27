import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';

const TEST_DB_PATH = path.join(tmpdir(), `matable-advertising-${Date.now()}.db`);
const ADMIN_KEY = 'advertising-beta-test-super-admin-key';
const VERIFICATION_KEY = 'advertising-beta-test-verification-key';
const EVENT_SECRET = 'advertising-beta-test-event-signing-secret-32';
let baseUrl = '';
let serverProcess: ChildProcess | null = null;

async function reservePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Retry while the subprocess initializes its database.
    }
    await delay(250);
  }
  throw new Error('Advertising test server did not become ready in time.');
}

async function api<T = Record<string, unknown>>(pathName: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const payload = response.status === 204 ? undefined : await response.json() as T;
  return { response, payload };
}

async function adminCookie(role: 'super_admin' | 'verification_admin', key: string): Promise<string> {
  const { response } = await api('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, role }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

interface ShopCreatePayload {
  shop: { id: number };
  owner_access_token: string;
}

async function createVerifiedShop(label: string) {
  const created = await api<ShopCreatePayload>('/api/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Boutique publicité ${label}`,
      whatsapp_number: `+22507${String(Date.now()).slice(-6)}${label === 'A' ? '11' : '22'}`,
      email: `advertising-${label}-${Date.now()}@example.com`,
      pin_code: '224466',
      category: 'beauty',
      city: 'Abidjan',
      accepted_terms_privacy: true,
    }),
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.payload));
  const shopId = created.payload.shop.id;
  const login = await api('/api/auth/merchant-access-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: created.payload.owner_access_token }),
  });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  const database = new Database(TEST_DB_PATH);
  database.prepare(
    `UPDATE shops SET is_active = 1, publication_status = 'active', merchant_verification_status = 'verified',
      subscription_status = 'active', subscription_expires_at = ?, selected_subscription_tier = 'standard',
      city = ?, whatsapp_number = ? WHERE id = ?`,
  ).run(new Date(Date.now() + 30 * 86400000).toISOString(), 'Abidjan', `+22507${String(Date.now()).slice(-8)}`, shopId);
  database.close();

  const product = await api<{ product: { id: number } }>(`/api/shops/${shopId}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ title: `Produit sponsorisé ${label}`, description: 'Produit utilisé pour tester la campagne sponsorisée.', price: 2500, stock: 8 }),
  });
  assert.equal(product.response.status, 200, JSON.stringify(product.payload));
  return { shopId, cookie, productId: product.payload.product.id };
}

before(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_ACCESS_KEY: ADMIN_KEY,
      VERIFICATION_ADMIN_ACCESS_KEY: VERIFICATION_KEY,
      AD_EVENT_SIGNING_SECRET: EVENT_SECRET,
      NODE_ENV: 'test',
      PORT: String(port),
      MATABLE_DB_PATH: TEST_DB_PATH,
      APP_URL: baseUrl,
    },
    stdio: 'ignore',
  });
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

test('advertising beta enforces roles, merchant ownership, moderation, consented metrics and partner workflow', async () => {
  const admin = await adminCookie('super_admin', ADMIN_KEY);
  const verificationAdmin = await adminCookie('verification_admin', VERIFICATION_KEY);
  const firstShop = await createVerifiedShop('A');
  const otherShop = await createVerifiedShop('B');

  const promotionStart = new Date(Date.now() + 86400000).toISOString();
  const promotionEnd = new Date(Date.now() + 3 * 86400000).toISOString();
  const scheduledPromotion = await api(`/api/shops/${firstShop.shopId}/products/${firstShop.productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: firstShop.cookie },
    body: JSON.stringify({
      sale_price: 2000,
      sale_starts_at: promotionStart,
      sale_ends_at: promotionEnd,
    }),
  });
  assert.equal(scheduledPromotion.response.status, 200, JSON.stringify(scheduledPromotion.payload));
  const forbiddenPromotionOverview = await api('/api/admin/product-sales', { headers: { Cookie: verificationAdmin } });
  assert.equal(forbiddenPromotionOverview.response.status, 403);
  const promotionOverview = await api<{
    promotions: Array<{ product_id: number; sale_status: string }>;
    summary: { scheduled: number };
    total: number;
  }>('/api/admin/product-sales?status=scheduled', { headers: { Cookie: admin } });
  assert.equal(promotionOverview.response.status, 200, JSON.stringify(promotionOverview.payload));
  assert.equal(promotionOverview.payload.total, 1);
  assert.equal(promotionOverview.payload.summary.scheduled, 1);
  assert.equal(promotionOverview.payload.promotions[0].product_id, firstShop.productId);
  assert.equal(promotionOverview.payload.promotions[0].sale_status, 'scheduled');
  const invalidPromotionFilter = await api('/api/admin/product-sales?status=all%3BDELETE', { headers: { Cookie: admin } });
  assert.equal(invalidPromotionFilter.response.status, 400);

  const initialPartners = await api<{ partners: unknown[] }>('/api/advertising/partners');
  assert.equal(initialPartners.response.status, 200);
  assert.deepEqual(initialPartners.payload.partners, []);
  const unauthorizedPartnerManagement = await api('/api/admin/advertising/partners', { headers: { Cookie: verificationAdmin } });
  assert.equal(unauthorizedPartnerManagement.response.status, 403);
  const unsafePartnerLink = await api('/api/admin/advertising/partners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({
      name: 'Marque test',
      descriptor: 'Partenaire de test',
      headline: 'Message de test',
      destination_url: 'javascript:alert(1)',
    }),
  });
  assert.equal(unsafePartnerLink.response.status, 400);
  const createdPartner = await api<{ id: string; is_active: boolean }>('/api/admin/advertising/partners', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({
      name: 'Partenaire local',
      descriptor: 'Commerce ivoirien',
      headline: 'Un partenaire permanent de test',
      logo_url: 'https://example.com/logo.png',
      destination_url: 'https://example.com',
    }),
  });
  assert.equal(createdPartner.response.status, 201, JSON.stringify(createdPartner.payload));
  assert.equal(createdPartner.payload.is_active, false);
  const stillHidden = await api<{ partners: unknown[] }>('/api/advertising/partners');
  assert.deepEqual(stillHidden.payload.partners, []);
  const activatedPartner = await api(`/api/admin/advertising/partners/${createdPartner.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ is_active: true }),
  });
  assert.equal(activatedPartner.response.status, 200, JSON.stringify(activatedPartner.payload));
  const visiblePartner = await api<{ partners: Array<{ id: string; name: string; destination_url: string }> }>('/api/advertising/partners');
  assert.equal(visiblePartner.payload.partners.length, 1);
  assert.equal(visiblePartner.payload.partners[0].id, createdPartner.payload.id);
  assert.equal(visiblePartner.payload.partners[0].name, 'Partenaire local');
  assert.equal(visiblePartner.payload.partners[0].destination_url, 'https://example.com');
  const updatedPartner = await api(`/api/admin/advertising/partners/${createdPartner.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ headline: 'Un nouveau message', sort_order: 5 }),
  });
  assert.equal(updatedPartner.response.status, 200, JSON.stringify(updatedPartner.payload));
  const updatedPublicPartner = await api<{ partners: Array<{ headline: string }> }>('/api/advertising/partners');
  assert.equal(updatedPublicPartner.payload.partners[0].headline, 'Un nouveau message');
  const pausedPartner = await api(`/api/admin/advertising/partners/${createdPartner.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ is_active: false }),
  });
  assert.equal(pausedPartner.response.status, 200, JSON.stringify(pausedPartner.payload));
  const hiddenAfterPause = await api<{ partners: unknown[] }>('/api/advertising/partners');
  assert.deepEqual(hiddenAfterPause.payload.partners, []);
  const deletedPartner = await api(`/api/admin/advertising/partners/${createdPartner.payload.id}`, {
    method: 'DELETE',
    headers: { Cookie: admin },
  });
  assert.equal(deletedPartner.response.status, 204);

  const initialPublic = await api<{ beta: { delivery_enabled: boolean } }>('/api/advertising/beta');
  assert.equal(initialPublic.response.status, 200);
  assert.equal(initialPublic.payload.beta.delivery_enabled, false);
  const unauthorizedModeration = await api('/api/admin/advertising/beta', { headers: { Cookie: verificationAdmin } });
  assert.equal(unauthorizedModeration.response.status, 403);
  const merchantEligibility = await api<{
    eligibility: { product: string[]; banner: string[] };
  }>(`/api/shops/${firstShop.shopId}/advertising-campaigns`, { headers: { Cookie: firstShop.cookie } });
  assert.equal(merchantEligibility.response.status, 200);
  assert.ok(merchantEligibility.payload.eligibility.product.some((reason) => reason.includes('bêta est fermée')));
  assert.ok(merchantEligibility.payload.eligibility.banner.some((reason) => reason.includes('image de bannière')));

  const opened = await api('/api/admin/advertising/beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'open' }),
  });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.payload));

  const campaignSubmission = await api<{ id: string; status: string }>(`/api/shops/${firstShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: firstShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: firstShop.productId,
      headline: 'Produit local à découvrir',
      body: 'Une campagne de test pour la bêta publicitaire.',
      duration_days: 7,
      charter_accepted: true,
    }),
  });
  assert.equal(campaignSubmission.response.status, 201, JSON.stringify(campaignSubmission.payload));
  assert.equal(campaignSubmission.payload.status, 'pending_review');

  const duplicateSubmission = await api(`/api/shops/${firstShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: firstShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: firstShop.productId,
      headline: 'Deuxième campagne',
      body: 'Cette campagne en double doit être bloquée.',
      duration_days: 7,
      charter_accepted: true,
    }),
  });
  assert.equal(duplicateSubmission.response.status, 409);
  const foreignProductSubmission = await api(`/api/shops/${otherShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: firstShop.productId,
      headline: 'Produit d’une autre boutique',
      body: 'Le produit ne doit pas être accepté.',
      duration_days: 7,
      charter_accepted: true,
    }),
  });
  assert.equal(foreignProductSubmission.response.status, 409);
  const nonBetaDurationSubmission = await api(`/api/shops/${otherShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: otherShop.productId,
      headline: 'Durée non autorisée',
      body: 'La bêta impose une durée fixe de sept jours.',
      duration_days: 3,
      charter_accepted: true,
    }),
  });
  assert.equal(nonBetaDurationSubmission.response.status, 400);
  const noCharterAcceptance = await api(`/api/shops/${otherShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: otherShop.productId,
      headline: 'Charte non confirmée',
      body: 'La soumission doit confirmer la charte.',
      duration_days: 7,
    }),
  });
  assert.equal(noCharterAcceptance.response.status, 400);

  const campaigns = await api<{ campaigns: Array<{ id: string; status: string }> }>('/api/admin/advertising/campaigns', { headers: { Cookie: admin } });
  assert.equal(campaigns.response.status, 200);
  assert.equal(campaigns.payload.campaigns.find((campaign) => campaign.id === campaignSubmission.payload.id)?.status, 'pending_review');

  const approved = await api(`/api/admin/advertising/campaigns/${campaignSubmission.payload.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.payload));

  const secondCampaign = await api<{ id: string; status: string }>(`/api/shops/${otherShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherShop.cookie },
    body: JSON.stringify({
      kind: 'product',
      product_id: otherShop.productId,
      headline: 'Une autre boutique à découvrir',
      body: 'Une seconde campagne pour vérifier la rotation équitable.',
      duration_days: 7,
      charter_accepted: true,
    }),
  });
  assert.equal(secondCampaign.response.status, 201, JSON.stringify(secondCampaign.payload));
  const secondApproval = await api(`/api/admin/advertising/campaigns/${secondCampaign.payload.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'approve' }),
  });
  assert.equal(secondApproval.response.status, 200, JSON.stringify(secondApproval.payload));

  const crossShopRead = await api(`/api/shops/${firstShop.shopId}/advertising-campaigns`, { headers: { Cookie: otherShop.cookie } });
  assert.notEqual(crossShopRead.response.status, 200);
  const crossShopSubmit = await api(`/api/shops/${firstShop.shopId}/advertising-campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: otherShop.cookie },
    body: JSON.stringify({ kind: 'product', product_id: firstShop.productId, headline: 'Intrusion', body: 'Tentative inter-boutiques.', duration_days: 7 }),
  });
  assert.notEqual(crossShopSubmit.response.status, 201);

  const impressionDatabase = new Database(TEST_DB_PATH);
  const oldImpressionDate = new Date(Date.now() - 8 * 86400000);
  impressionDatabase.prepare(
    `INSERT INTO advertising_campaign_events
      (id, campaign_id, event_type, visitor_hash, event_date, created_at)
      VALUES (?, ?, 'impression', ?, ?, ?)`,
  ).run(
    'prior-campaign-impression',
    campaignSubmission.payload.id,
    'prior-campaign-visitor-hash',
    oldImpressionDate.toISOString().slice(0, 10),
    oldImpressionDate.toISOString(),
  );
  impressionDatabase.close();

  const publicCampaigns = await api<{ campaigns: Array<{ id: string; event_token: string }> }>('/api/advertising/campaigns');
  assert.equal(publicCampaigns.response.status, 200);
  assert.equal(publicCampaigns.response.headers.get('cache-control'), 'private, max-age=0');
  assert.equal(publicCampaigns.payload.campaigns.length, 2);
  assert.equal(publicCampaigns.payload.campaigns[0].id, campaignSubmission.payload.id);
  const publicCampaign = publicCampaigns.payload.campaigns[0];
  const event = {
    campaign_id: publicCampaign.id,
    event_type: 'impression',
    visitor_id: 'advertising-test-visitor-0001',
    event_token: publicCampaign.event_token,
    measurement_consent: true,
  };
  const eventWithoutConsent = await api('/api/advertising/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, measurement_consent: false }),
  });
  assert.equal(eventWithoutConsent.response.status, 400);
  const firstEvent = await api(`/api/advertising/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  assert.equal(firstEvent.response.status, 204);
  const duplicateEvent = await api(`/api/advertising/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  assert.equal(duplicateEvent.response.status, 204);
  const invalidEvent = await api(`/api/advertising/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, event_token: 'invalid-token' }),
  });
  assert.equal(invalidEvent.response.status, 400);

  const updatedCampaigns = await api<{ campaigns: Array<{ id: string; metrics: Record<string, number> }> }>('/api/admin/advertising/campaigns', { headers: { Cookie: admin } });
  assert.equal(updatedCampaigns.payload.campaigns.find((campaign) => campaign.id === publicCampaign.id)?.metrics.impression, 2);

  const suspended = await api(`/api/admin/advertising/campaigns/${publicCampaign.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'suspend', note: 'Contrôle de la campagne.' }),
  });
  assert.equal(suspended.response.status, 200);
  const suspendedCampaigns = await api<{ campaigns: Array<{ id: string }> }>('/api/advertising/campaigns');
  assert.deepEqual(suspendedCampaigns.payload.campaigns.map((campaign) => campaign.id), [secondCampaign.payload.id]);
  const resumed = await api(`/api/admin/advertising/campaigns/${publicCampaign.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'resume' }),
  });
  assert.equal(resumed.response.status, 200);
  const cancelOtherCampaign = await api(`/api/admin/advertising/campaigns/${secondCampaign.payload.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'cancel' }),
  });
  assert.equal(cancelOtherCampaign.response.status, 200);
  const refreshedCampaigns = await api<{ campaigns: Array<{ id: string }> }>('/api/advertising/campaigns');
  assert.deepEqual(refreshedCampaigns.payload.campaigns.map((campaign) => campaign.id), [publicCampaign.id]);

  const partnerRequestWithoutConsent = await api('/api/advertising/partner-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_name: 'Contact test',
      company_name: 'Partenaire test',
      email: 'contact@example.com',
      requested_format: 'partnership',
      objective: 'Présenter une offre partenaire.',
      message: 'Demande de partenariat à étudier manuellement.',
    }),
  });
  assert.equal(partnerRequestWithoutConsent.response.status, 400);
  const partnerRequest = await api<{ id: string; status: string }>('/api/advertising/partner-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_name: 'Contact test',
      company_name: 'Partenaire test',
      email: 'contact@example.com',
      requested_format: 'partnership',
      objective: 'Présenter une offre partenaire.',
      message: 'Demande de partenariat à étudier manuellement.',
      privacy_consent: true,
    }),
  });
  assert.equal(partnerRequest.response.status, 201, JSON.stringify(partnerRequest.payload));
  const partnerStatus = await api(`/api/admin/advertising/partner-requests/${partnerRequest.payload.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ status: 'contacted' }),
  });
  assert.equal(partnerStatus.response.status, 200);

  const paused = await api('/api/admin/advertising/beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'pause' }),
  });
  assert.equal(paused.response.status, 200);
  const pausedCampaigns = await api<{ campaigns: unknown[] }>('/api/advertising/campaigns');
  assert.deepEqual(pausedCampaigns.payload.campaigns, []);
  const resumedBeta = await api('/api/admin/advertising/beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'resume' }),
  });
  assert.equal(resumedBeta.response.status, 200);

  const database = new Database(TEST_DB_PATH);
  database.prepare("UPDATE advertising_campaigns SET ends_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 1000).toISOString(), publicCampaign.id);
  database.close();
  const expiredCampaignList = await api<{ campaigns: Array<{ id: string; status: string }> }>('/api/admin/advertising/campaigns', { headers: { Cookie: admin } });
  assert.equal(expiredCampaignList.payload.campaigns.find((campaign) => campaign.id === publicCampaign.id)?.status, 'completed');
  const expiredPublicCampaigns = await api<{ campaigns: unknown[] }>('/api/advertising/campaigns');
  assert.deepEqual(expiredPublicCampaigns.payload.campaigns, []);
  const reopenedBeta = await api('/api/admin/advertising/beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'open' }),
  });
  assert.equal(reopenedBeta.response.status, 409);

  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const endsAt = new Date(Date.now() + 86_400_000).toISOString();
  const submittedAt = new Date().toISOString();
  const capacityDatabase = new Database(TEST_DB_PATH);
  capacityDatabase.prepare(
    `UPDATE advertising_beta_settings
      SET starts_at = ?, ends_at = ?, delivery_enabled = 1
      WHERE id = 1`,
  ).run(startsAt, endsAt);
  capacityDatabase.prepare(
    `UPDATE advertising_campaigns
      SET status = 'active', starts_at = ?, ends_at = ?, updated_at = ?
      WHERE id IN (?, ?)`,
  ).run(startsAt, endsAt, submittedAt, campaignSubmission.payload.id, secondCampaign.payload.id);
  const additionalShops = [];
  for (let index = 0; index < 9; index += 1) {
    const shopResult = capacityDatabase.prepare(
      `INSERT INTO shops
        (name, slug, whatsapp_number, pin_code_hash, is_active, publication_status,
         merchant_verification_status, selected_subscription_tier, subscription_expires_at,
         subscription_status, created_at, category, city, subscription_tier)
        VALUES (?, ?, ?, 'test-pin-hash', 1, 'active', 'verified', 'standard', ?, 'active', ?, 'beauty', 'Abidjan', 'standard')`,
    ).run(
      `Boutique capacité ${index + 1}`,
      `boutique-capacite-${index + 1}`,
      `+22507${90000000 + index}`,
      endsAt,
      submittedAt,
    );
    const shopId = Number(shopResult.lastInsertRowid);
    const productResult = capacityDatabase.prepare(
      `INSERT INTO products (shop_id, title, price, stock, image_url)
        VALUES (?, ?, 2500, 8, 'https://example.com/product.jpg')`,
    ).run(shopId, `Produit capacité ${index + 1}`);
    additionalShops.push({ shopId, productId: Number(productResult.lastInsertRowid) });
  }
  const allShops = [firstShop, otherShop, ...additionalShops];
  const insertCampaign = capacityDatabase.prepare(
    `INSERT INTO advertising_campaigns
      (id, shop_id, kind, product_id, headline, body, duration_days, charter_accepted_at,
       status, starts_at, ends_at, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 7, ?, 'active', ?, ?, ?, ?, ?)`,
  );
  for (const shop of allShops) {
    if (shop !== firstShop && shop !== otherShop) {
      insertCampaign.run(
        `capacity-product-${shop.shopId}`,
        shop.shopId,
        'product',
        shop.productId,
        'Produit local à découvrir',
        'Campagne de test de capacité.',
        submittedAt,
        startsAt,
        endsAt,
        submittedAt,
        submittedAt,
        submittedAt,
      );
    }
    insertCampaign.run(
      `capacity-banner-${shop.shopId}`,
      shop.shopId,
      'banner',
      null,
      'Une boutique locale à découvrir',
      'Bannière de test de capacité.',
      submittedAt,
      startsAt,
      endsAt,
      submittedAt,
      submittedAt,
      submittedAt,
    );
  }
  capacityDatabase.close();

  const capacityBeta = await api<{ beta: { delivery_enabled: boolean; starts_at: string; ends_at: string } }>('/api/advertising/beta');
  assert.equal(capacityBeta.payload.beta.delivery_enabled, true, JSON.stringify(capacityBeta.payload.beta));
  const productCampaignsAtCapacity = await api<{ campaigns: unknown[] }>('/api/advertising/campaigns?kind=product');
  const bannerCampaignsAtCapacity = await api<{ campaigns: unknown[] }>('/api/advertising/campaigns?kind=banner');
  assert.equal(productCampaignsAtCapacity.response.status, 200);
  assert.equal(bannerCampaignsAtCapacity.response.status, 200);
  assert.equal(productCampaignsAtCapacity.payload.campaigns.length, 10);
  assert.equal(bannerCampaignsAtCapacity.payload.campaigns.length, 10);

  const clearCampaignCache = await api(`/api/admin/advertising/campaigns/${campaignSubmission.payload.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'suspend', note: 'Réinitialisation du cache dans le test.' }),
  });
  assert.equal(clearCampaignCache.response.status, 200, JSON.stringify(clearCampaignCache.payload));
  const combinedCampaignsAtCapacity = await api<{ campaigns: Array<{ kind: string }> }>('/api/advertising/campaigns');
  assert.equal(combinedCampaignsAtCapacity.payload.campaigns.filter((campaign) => campaign.kind === 'product').length, 10);
  assert.equal(combinedCampaignsAtCapacity.payload.campaigns.filter((campaign) => campaign.kind === 'banner').length, 10);
  assert.equal(combinedCampaignsAtCapacity.payload.campaigns.length, 20);
  const restoreCampaign = await api(`/api/admin/advertising/campaigns/${campaignSubmission.payload.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin },
    body: JSON.stringify({ action: 'resume' }),
  });
  assert.equal(restoreCampaign.response.status, 200, JSON.stringify(restoreCampaign.payload));
});
