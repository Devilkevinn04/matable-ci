import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type RequestHandler } from 'express';
import { dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { isShopCategory } from '../../src/utils/categoryDefaults.ts';
import { getCategoryDefaults, normalizeCustomBannerImage } from '../../src/utils/categoryDefaults.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import { isShopPubliclyVisible } from '../services/businessRules.ts';

const BETA_DURATION_DAYS = 30;
const CAMPAIGN_DURATIONS_DAYS = [7] as const;
const CAMPAIGN_IMPRESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const eventTypes = ['impression', 'click', 'shop_visit', 'contact_click'] as const;
const campaignKinds = ['product', 'banner'] as const;

type CampaignKind = (typeof campaignKinds)[number];
type CampaignEventType = (typeof eventTypes)[number];

function isAdvertisingDeliveryEnabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.ADVERTISING_BETA_ENABLED === 'true';
}

interface BetaSettings {
  starts_at: string | null;
  ends_at: string | null;
  delivery_enabled: number | boolean;
  updated_at: string;
  updated_by: string;
}

interface CampaignRow {
  id: string;
  shop_id: number;
  kind: CampaignKind;
  product_id: number | null;
  headline: string;
  body: string;
  duration_days: number;
  charter_accepted_at: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  review_note: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

interface PermanentPartnerRow {
  id: string;
  name: string;
  descriptor: string;
  headline: string;
  logo_url: string | null;
  destination_url: string | null;
  sort_order: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

interface AdvertisingRouterOptions {
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  requireMerchantOwnShop: RequestHandler;
  requireSuperAdminAccess: RequestHandler;
}

function getEventSigningSecret(): string {
  const configured = String(process.env.AD_EVENT_SIGNING_SECRET || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AD_EVENT_SIGNING_SECRET is required for advertising event signing.');
  }
  return 'local-only-ad-event-signing-secret';
}

function signCampaignToken(campaignId: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ campaignId, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', getEventSigningSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyCampaignToken(token: unknown, campaignId: string): boolean {
  if (typeof token !== 'string' || token.length > 512) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = createHmac('sha256', getEventSigningSecret()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      campaignId?: unknown;
      expiresAt?: unknown;
    };
    return decoded.campaignId === campaignId
      && typeof decoded.expiresAt === 'number'
      && Number.isSafeInteger(decoded.expiresAt)
      && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximumLength);
}

function cleanPartnerUrl(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  const url = value.trim();
  if (url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? url : undefined;
  } catch {
    return undefined;
  }
}

function isBetaOpen(beta: BetaSettings | undefined, now = Date.now()): beta is BetaSettings {
  return Boolean(isAdvertisingDeliveryEnabled()
    && beta
    && Number(beta.delivery_enabled) === 1
    && beta.starts_at
    && beta.ends_at
    && Date.parse(beta.starts_at) <= now
    && Date.parse(beta.ends_at) > now);
}

function serializeBeta(beta: BetaSettings | undefined) {
  const now = Date.now();
  const started = Boolean(beta?.starts_at);
  const enabled = isBetaOpen(beta, now);
  return {
    started,
    delivery_available: isAdvertisingDeliveryEnabled(),
    delivery_enabled: enabled,
    starts_at: beta?.starts_at ?? null,
    ends_at: beta?.ends_at ?? null,
    days_remaining: beta?.ends_at && Date.parse(beta.ends_at) > now
      ? Math.ceil((Date.parse(beta.ends_at) - now) / 86400000)
      : 0,
  };
}

async function getBetaSettings(): Promise<BetaSettings | undefined> {
  return dbGet<BetaSettings>('SELECT starts_at, ends_at, delivery_enabled, updated_at, updated_by FROM advertising_beta_settings WHERE id = 1');
}

async function writeAdminAudit(actor: string, action: string, shopId: number | null, details: Record<string, unknown>) {
  await dbRun(
    'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
    [actor, action, shopId, JSON.stringify(details), new Date().toISOString()],
  );
}

async function expireCampaigns() {
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE advertising_campaigns SET status = 'completed', updated_at = ?
      WHERE status IN ('scheduled', 'active') AND ends_at IS NOT NULL AND ends_at <= ?`,
    [now, now],
  );
  await dbRun(
    `UPDATE advertising_campaigns SET status = 'active', updated_at = ?
      WHERE status = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ?
        AND ends_at IS NOT NULL AND ends_at > ?`,
    [now, now, now],
  );
}

function getRequestActor(req: Request): string {
  return req.adminRole === 'verification_admin' ? 'verification_admin' : 'super_admin';
}

export function createAdvertisingRouters({
  rateLimitPublicRequest,
  requireMerchantOwnShop,
  requireSuperAdminAccess,
}: AdvertisingRouterOptions) {
  const publicRouter = Router();
  const merchantRouter = Router();
  const adminRouter = Router();
  const publicCampaignCache = new Map<string, { expiresAt: number; payload: { campaigns: unknown[] } }>();
  const clearPublicCampaignCache = () => publicCampaignCache.clear();
  adminRouter.use(requireSuperAdminAccess);

  publicRouter.get('/advertising/beta', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ beta: serializeBeta(await getBetaSettings()) });
  });

  publicRouter.get('/advertising/partners', rateLimitPublicRequest(120), async (_req, res) => {
    const partners = await dbAll<PermanentPartnerRow>(
      `SELECT id, name, descriptor, headline, logo_url, destination_url
        FROM advertising_permanent_partners WHERE is_active = 1
        ORDER BY sort_order ASC, created_at ASC LIMIT 20`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ partners });
  });

  publicRouter.get('/advertising/campaigns', rateLimitPublicRequest(120), async (req, res) => {
    const kind = req.query.kind;
    if (kind !== undefined && !campaignKinds.includes(String(kind) as CampaignKind)) {
      return res.status(400).json({ error: 'Format publicitaire invalide.' });
    }
    const beta = await getBetaSettings();
    if (!isBetaOpen(beta)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ campaigns: [] });
    }

    const cacheKey = kind ? String(kind) : '*';
    const cached = publicCampaignCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'private, max-age=0');
      return res.json(cached.payload);
    }

    const now = new Date().toISOString();
    const impressionCutoff = new Date(Date.now() - CAMPAIGN_IMPRESSION_WINDOW_MS).toISOString();
    const kindsToLoad = kind ? [String(kind) as CampaignKind] : campaignKinds;
    const campaignsByKind = await Promise.all(kindsToLoad.map((campaignKind) => dbAll<CampaignRow>(
      `SELECT c.* FROM advertising_campaigns c
        LEFT JOIN (
          SELECT campaign_id, COUNT(*) AS impression_count
          FROM advertising_campaign_events
          WHERE event_type = 'impression' AND created_at >= ?
          GROUP BY campaign_id
        ) event_metrics ON event_metrics.campaign_id = c.id
        WHERE c.status IN ('scheduled', 'active')
          AND c.starts_at <= ? AND c.ends_at > ? AND c.kind = ?
        ORDER BY COALESCE(event_metrics.impression_count, 0) ASC, c.starts_at ASC, c.created_at ASC LIMIT 10`,
      [impressionCutoff, now, now, campaignKind],
    )));
    const campaigns = campaignsByKind.flat();
    const publicCampaigns = [];
    for (const campaign of campaigns) {
      const shop = await getShopFromDatabase(campaign.shop_id);
      if (!shop || !isShopPubliclyVisible(shop) || shop.merchant_verification_status !== 'verified') continue;
      let product: { id: number; title: string; price: number; sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null; image_url: string; stock: number } | undefined;
      if (campaign.kind === 'product' && campaign.product_id !== null) {
        product = await dbGet(
          `SELECT id, title, price, sale_price, sale_starts_at, sale_ends_at, image_url, stock FROM products
            WHERE id = ? AND shop_id = ? AND is_available = 1 AND stock > 0`,
          [campaign.product_id, shop.id],
        );
        if (!product) continue;
      }
      const category = isShopCategory(shop.category) ? shop.category : 'other';
      const bannerUrl = normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, category)
        || getCategoryDefaults(category).bannerPlaceholderImageUrl;
      publicCampaigns.push({
        id: campaign.id,
        kind: campaign.kind,
        headline: campaign.headline,
        body: campaign.body,
        event_token: signCampaignToken(campaign.id, Date.now() + CAMPAIGN_TOKEN_LIFETIME_MS),
        shop: {
          name: shop.name,
          slug: shop.slug,
          category,
          city: shop.city,
          image_url: campaign.kind === 'banner' ? bannerUrl : product?.image_url || '',
        },
        ...(product ? { product } : {}),
      });
    }
    const payload = { campaigns: publicCampaigns };
    publicCampaignCache.set(cacheKey, { expiresAt: Date.now() + 60_000, payload });
    res.setHeader('Cache-Control', 'private, max-age=0');
    return res.json(payload);
  });

  publicRouter.post('/advertising/events', rateLimitPublicRequest(120), async (req, res) => {
    const campaignId = cleanText(req.body?.campaign_id, 64);
    const eventType = req.body?.event_type;
    const visitorId = cleanText(req.body?.visitor_id, 80);
    if (!campaignId || !eventTypes.includes(eventType as CampaignEventType)
      || !/^[a-zA-Z0-9_-]{16,80}$/.test(visitorId)
      || req.body?.measurement_consent !== true
      || !verifyCampaignToken(req.body?.event_token, campaignId)) {
      return res.status(400).json({ error: 'Événement publicitaire invalide.' });
    }
    const beta = await getBetaSettings();
    if (!isBetaOpen(beta)) return res.status(409).json({ error: 'La bêta publicitaire est fermée.' });
    const now = new Date();
    const campaign = await dbGet<CampaignRow>(
      `SELECT * FROM advertising_campaigns
        WHERE id = ? AND status IN ('scheduled', 'active') AND starts_at <= ? AND ends_at > ?`,
      [campaignId, now.toISOString(), now.toISOString()],
    );
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable ou terminée.' });
    const shop = await getShopFromDatabase(campaign.shop_id);
    if (!shop || !isShopPubliclyVisible(shop) || shop.merchant_verification_status !== 'verified') {
      return res.status(404).json({ error: 'Campagne introuvable ou terminée.' });
    }
    const visitorHash = createHmac('sha256', getEventSigningSecret()).update(visitorId).digest('hex');
    await dbRun(
      `INSERT INTO advertising_campaign_events (id, campaign_id, event_type, visitor_hash, event_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [randomUUID(), campaignId, eventType, visitorHash, now.toISOString().slice(0, 10), now.toISOString()],
    );
    return res.status(204).end();
  });

  publicRouter.post('/advertising/partner-requests', rateLimitPublicRequest(10), async (req, res) => {
    const contactName = cleanText(req.body?.contact_name, 100);
    const companyName = cleanText(req.body?.company_name, 120);
    const email = cleanText(req.body?.email, 254).toLowerCase();
    const phone = cleanText(req.body?.phone, 32);
    const requestedFormat = req.body?.requested_format;
    const objective = cleanText(req.body?.objective, 120);
    const message = cleanText(req.body?.message, 1000);
    const supportedFormats = ['banner', 'product', 'partnership', 'other'];
    if (!contactName || !companyName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !supportedFormats.includes(requestedFormat) || !objective || message.length < 10
      || req.body?.privacy_consent !== true) {
      return res.status(400).json({ error: 'Complétez les coordonnées, la demande et le consentement au traitement des données.' });
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    await dbRun(
      `INSERT INTO advertising_partner_requests
        (id, contact_name, company_name, email, phone, requested_format, objective, message, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, contactName, companyName, email, phone || null, requestedFormat, objective, message, now, now],
    );
    return res.status(201).json({ id, status: 'pending', message: 'Votre demande a été transmise; elle sera étudiée avant toute proposition commerciale.' });
  });

  merchantRouter.get('/:id/advertising-campaigns', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const [beta, campaigns, campaignEvents] = await Promise.all([
      getBetaSettings(),
      dbAll<CampaignRow>(
        `SELECT * FROM advertising_campaigns WHERE shop_id = ? ORDER BY created_at DESC`,
        [shopId],
      ),
      dbAll<{ campaign_id: string; event_type: CampaignEventType; count: number }>(
        `SELECT campaign_id, event_type, COUNT(*) AS count
          FROM advertising_campaign_events
          WHERE campaign_id IN (SELECT id FROM advertising_campaigns WHERE shop_id = ?)
          GROUP BY campaign_id, event_type`,
        [shopId],
      ),
    ]);
    const availableProducts = await dbGet<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM products WHERE shop_id = ? AND is_available = 1 AND stock > 0',
      [shopId],
    );
    const coreReasons: string[] = [];
    if (!shop.is_active) coreReasons.push('La boutique doit être active.');
    if (!isShopPubliclyVisible(shop)) coreReasons.push('La vitrine doit être publiable avec un abonnement en règle.');
    if (shop.merchant_verification_status !== 'verified') coreReasons.push('La vérification du commerçant doit être validée.');
    if (!shop.city?.trim()) coreReasons.push('Renseignez la commune de la boutique.');
    if (!shop.whatsapp_number?.trim()) coreReasons.push('Renseignez le numéro WhatsApp public de la boutique.');
    if (!isBetaOpen(beta)) coreReasons.push('La diffusion publicitaire bêta est fermée.');
    const formatReasons: Record<CampaignKind, string[]> = {
      product: [...coreReasons],
      banner: [...coreReasons],
    };
    if (Number(availableProducts?.count || 0) < 1) {
      formatReasons.product.push('Ajoutez au moins un produit disponible et en stock.');
    }
    const category = isShopCategory(shop.category) ? shop.category : 'other';
    if (!normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, category)) {
      formatReasons.banner.push('Ajoutez une image de bannière dans Apparence de la vitrine.');
    }
    for (const campaign of campaigns) {
      if (campaign.status !== 'rejected') {
        formatReasons[campaign.kind].push(`Une campagne ${campaign.kind === 'product' ? 'produit' : 'bannière'} est déjà soumise ou en cours.`);
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    const metricsByCampaign = new Map<string, Record<string, number>>();
    for (const event of campaignEvents) {
      const metrics = metricsByCampaign.get(event.campaign_id) || {};
      metrics[event.event_type] = Number(event.count || 0);
      metricsByCampaign.set(event.campaign_id, metrics);
    }
    return res.json({
      beta: serializeBeta(beta),
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        metrics: metricsByCampaign.get(String(campaign.id)) || {},
      })),
      eligibility: formatReasons,
    });
  });

  merchantRouter.post('/:id/advertising-campaigns', rateLimitPublicRequest(20), requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!shop.is_active || !isShopPubliclyVisible(shop) || shop.merchant_verification_status !== 'verified') {
      return res.status(409).json({ error: 'La boutique doit être active, publiable et vérifiée pour participer à la bêta.' });
    }
    if (!shop.city?.trim() || !shop.whatsapp_number?.trim()) {
      return res.status(409).json({ error: 'Complétez les informations publiques de la boutique avant de soumettre une campagne.' });
    }
    const beta = await getBetaSettings();
    if (!isBetaOpen(beta)) return res.status(409).json({ error: 'La bêta publicitaire n’est pas ouverte.' });

    const kind = req.body?.kind;
    const durationDays = Number(req.body?.duration_days);
    const headline = cleanText(req.body?.headline, 90);
    const body = cleanText(req.body?.body, 220);
    const productId = req.body?.product_id === undefined || req.body?.product_id === null || req.body?.product_id === ''
      ? null
      : Number(req.body.product_id);
    if (!campaignKinds.includes(kind as CampaignKind)
      || !CAMPAIGN_DURATIONS_DAYS.includes(durationDays as (typeof CAMPAIGN_DURATIONS_DAYS)[number])
      || !headline || !body || req.body?.charter_accepted !== true) {
      return res.status(400).json({ error: 'Vérifiez le format, la durée, le contenu et l’acceptation de la charte.' });
    }
    if (kind === 'product' && (!Number.isSafeInteger(productId) || productId === null)) {
      return res.status(400).json({ error: 'Choisissez un produit du catalogue.' });
    }
    if (kind === 'banner' && productId !== null) {
      return res.status(400).json({ error: 'Une bannière ne peut pas cibler un produit.' });
    }
    const category = isShopCategory(shop.category) ? shop.category : 'other';
    if (kind === 'banner' && !normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, category)) {
      return res.status(409).json({ error: 'Ajoutez une image de bannière à la vitrine avant de soumettre ce format.' });
    }

    const now = new Date().toISOString();
    const result = await dbTransaction(async (transaction) => {
      const existing = await transaction.get<CampaignRow>(
        'SELECT * FROM advertising_campaigns WHERE shop_id = ? AND kind = ?',
        [shopId, kind],
      );
      if (existing && existing.status !== 'rejected') return { conflict: true as const };
      if (kind === 'product') {
        const product = await transaction.get<{ id: number }>(
          `SELECT id FROM products WHERE id = ? AND shop_id = ? AND is_available = 1 AND stock > 0`,
          [productId, shopId],
        );
        if (!product) return { invalidProduct: true as const };
      }
      const campaignsThisBeta = await transaction.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM advertising_campaigns
          WHERE shop_id = ? AND kind = ? AND submitted_at >= ? AND submitted_at <= ? AND id <> ?`,
        [shopId, kind, beta.starts_at, beta.ends_at, existing?.id || ''],
      );
      if (Number(campaignsThisBeta?.count || 0) > 0) return { conflict: true as const };
      const id = existing?.id || randomUUID();
      if (existing) {
        await transaction.run(
          `UPDATE advertising_campaigns
            SET product_id = ?, headline = ?, body = ?, duration_days = ?, status = 'pending_review',
                starts_at = NULL, ends_at = NULL, review_note = NULL, reviewed_by = NULL, reviewed_at = NULL,
                charter_accepted_at = ?, submitted_at = ?, updated_at = ?
            WHERE id = ? AND shop_id = ? AND status = 'rejected'`,
          [productId, headline, body, durationDays, now, now, now, id, shopId],
        );
      } else {
        await transaction.run(
          `INSERT INTO advertising_campaigns
            (id, shop_id, kind, product_id, headline, body, duration_days, charter_accepted_at, status, submitted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?)`,
          [id, shopId, kind, productId, headline, body, durationDays, now, now, now, now],
        );
      }
      return { id, status: 'pending_review' as const };
    });
    if ('conflict' in result) return res.status(409).json({ error: 'Une campagne de ce format a déjà été soumise pendant la bêta.' });
    if ('invalidProduct' in result) return res.status(409).json({ error: 'Le produit doit appartenir à la boutique et être disponible en stock.' });
    return res.status(201).json(result);
  });

  merchantRouter.patch('/:id/advertising-campaigns/:campaignId/cancel', requireMerchantOwnShop, async (req, res) => {
    const shopId = Number(req.params.id);
    const now = new Date().toISOString();
    const updated = await dbRun(
      `UPDATE advertising_campaigns SET status = 'cancelled', updated_at = ?
        WHERE id = ? AND shop_id = ? AND status IN ('pending_review', 'rejected', 'scheduled', 'active')`,
      [now, String(req.params.campaignId), shopId],
    );
    if (updated.changes !== 1) return res.status(404).json({ error: 'Campagne introuvable ou déjà terminée.' });
    clearPublicCampaignCache();
    return res.json({ status: 'cancelled' });
  });

  adminRouter.get('/beta', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ beta: serializeBeta(await getBetaSettings()) });
  });

  adminRouter.post('/beta', async (req, res) => {
    const action = req.body?.action;
    const beta = await getBetaSettings();
    const now = new Date();
    let updated;
    if (action === 'open') {
      if (beta?.starts_at) return res.status(409).json({ error: 'La période de bêta a déjà été configurée et ne peut pas être prolongée.' });
      const endsAt = new Date(now.getTime() + BETA_DURATION_DAYS * 86400000).toISOString();
      updated = await dbRun(
        `UPDATE advertising_beta_settings
          SET starts_at = ?, ends_at = ?, delivery_enabled = 1, updated_at = ?, updated_by = ?
          WHERE id = 1 AND starts_at IS NULL`,
        [now.toISOString(), endsAt, now.toISOString(), getRequestActor(req)],
      );
    } else if (action === 'pause' || action === 'resume') {
      if (!beta?.starts_at || !beta.ends_at || Date.parse(beta.ends_at) <= now.getTime()) {
        return res.status(409).json({ error: 'La période de bêta est absente ou terminée.' });
      }
      updated = await dbRun(
        `UPDATE advertising_beta_settings SET delivery_enabled = ?, updated_at = ?, updated_by = ? WHERE id = 1`,
        [action === 'resume' ? 1 : 0, now.toISOString(), getRequestActor(req)],
      );
    } else {
      return res.status(400).json({ error: 'Action de bêta invalide.' });
    }
    if (updated.changes !== 1) return res.status(409).json({ error: 'La configuration de bêta a changé; rechargez la page.' });
    const nextBeta = await getBetaSettings();
    await writeAdminAudit(getRequestActor(req), `advertising_beta_${action}`, null, { ...serializeBeta(nextBeta) });
    clearPublicCampaignCache();
    return res.json({ beta: serializeBeta(nextBeta) });
  });

  adminRouter.get('/campaigns', async (_req, res) => {
    await expireCampaigns();
    const [campaigns, events] = await Promise.all([
      dbAll<Record<string, unknown>>(
        `SELECT c.*, s.name AS shop_name, s.slug AS shop_slug, s.city AS shop_city, s.merchant_verification_status
          FROM advertising_campaigns c JOIN shops s ON s.id = c.shop_id
          ORDER BY CASE c.status WHEN 'pending_review' THEN 0 ELSE 1 END, c.created_at DESC`,
      ),
      dbAll<{ campaign_id: string; event_type: CampaignEventType; count: number }>(
        `SELECT campaign_id, event_type, COUNT(*) AS count FROM advertising_campaign_events GROUP BY campaign_id, event_type`,
      ),
    ]);
    const metrics = new Map<string, Record<string, number>>();
    for (const event of events) {
      const row = metrics.get(event.campaign_id) || {};
      row[event.event_type] = Number(event.count);
      metrics.set(event.campaign_id, row);
    }
    return res.json({
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        metrics: metrics.get(String(campaign.id)) || {},
      })),
    });
  });

  adminRouter.post('/campaigns/:campaignId/review', async (req, res) => {
    const id = String(req.params.campaignId);
    const action = req.body?.action;
    const note = cleanText(req.body?.note, 500);
    const campaign = await dbGet<CampaignRow>('SELECT * FROM advertising_campaigns WHERE id = ?', [id]);
    if (!campaign) return res.status(404).json({ error: 'Campagne introuvable.' });
    const now = new Date();
    const nowIso = now.toISOString();
    const beta = await getBetaSettings();
    let nextStatus: string;
    let startsAt = campaign.starts_at;
    let endsAt = campaign.ends_at;
    if (action === 'approve') {
      if (!isBetaOpen(beta)) return res.status(409).json({ error: 'La bêta publicitaire est fermée.' });
      const shop = await getShopFromDatabase(campaign.shop_id);
      if (!shop || !shop.is_active || !isShopPubliclyVisible(shop) || shop.merchant_verification_status !== 'verified') {
        return res.status(409).json({ error: 'La boutique n’est plus éligible à la bêta.' });
      }
      if (campaign.kind === 'product') {
        const product = campaign.product_id === null ? undefined : await dbGet<{ id: number }>(
          `SELECT id FROM products WHERE id = ? AND shop_id = ? AND is_available = 1 AND stock > 0`,
          [campaign.product_id, campaign.shop_id],
        );
        if (!product) return res.status(409).json({ error: 'Le produit doit toujours appartenir à la boutique et être disponible en stock.' });
      }
      if (campaign.status !== 'pending_review') {
        return res.status(409).json({ error: 'Seule une campagne en attente peut être approuvée.' });
      }
      const requestedStart = req.body?.starts_at === undefined ? now : new Date(String(req.body.starts_at));
      if (!Number.isFinite(requestedStart.getTime()) || requestedStart.getTime() < now.getTime() - 60000
        || requestedStart.getTime() < Date.parse(beta.starts_at)
        || requestedStart.getTime() + campaign.duration_days * 86400000 > Date.parse(beta.ends_at)) {
        return res.status(400).json({ error: 'La période de diffusion doit être comprise dans la bêta et ne pas dépasser sa date de fin.' });
      }
      startsAt = requestedStart.toISOString();
      endsAt = new Date(requestedStart.getTime() + campaign.duration_days * 86400000).toISOString();
      nextStatus = requestedStart.getTime() > now.getTime() ? 'scheduled' : 'active';
    } else if (action === 'reject') {
      if (campaign.status !== 'pending_review' || note.length < 3) {
        return res.status(400).json({ error: 'Un motif est requis pour refuser une campagne en attente.' });
      }
      nextStatus = 'rejected';
      startsAt = null;
      endsAt = null;
    } else if (action === 'suspend') {
      if (!['active', 'scheduled'].includes(campaign.status) || note.length < 3) {
        return res.status(400).json({ error: 'Un motif est requis pour suspendre une campagne active ou programmée.' });
      }
      nextStatus = 'suspended';
    } else if (action === 'resume') {
      if (campaign.status !== 'suspended' || !campaign.starts_at || !campaign.ends_at || Date.parse(campaign.ends_at) <= now.getTime()) {
        return res.status(409).json({ error: 'Cette campagne ne peut plus être reprise.' });
      }
      if (!isBetaOpen(beta)) return res.status(409).json({ error: 'La bêta publicitaire est fermée.' });
      const shop = await getShopFromDatabase(campaign.shop_id);
      if (!shop || !shop.is_active || !isShopPubliclyVisible(shop) || shop.merchant_verification_status !== 'verified') {
        return res.status(409).json({ error: 'La boutique n’est plus éligible à la bêta.' });
      }
      if (campaign.kind === 'product') {
        const product = campaign.product_id === null ? undefined : await dbGet<{ id: number }>(
          `SELECT id FROM products WHERE id = ? AND shop_id = ? AND is_available = 1 AND stock > 0`,
          [campaign.product_id, campaign.shop_id],
        );
        if (!product) return res.status(409).json({ error: 'Le produit n’est plus disponible en stock.' });
      }
      nextStatus = Date.parse(campaign.starts_at) > now.getTime() ? 'scheduled' : 'active';
    } else if (action === 'cancel') {
      if (['completed', 'cancelled'].includes(campaign.status)) return res.status(409).json({ error: 'La campagne est déjà terminée.' });
      nextStatus = 'cancelled';
    } else {
      return res.status(400).json({ error: 'Action de modération invalide.' });
    }
    const expectedStatuses = action === 'approve' || action === 'reject'
      ? ['pending_review']
      : action === 'suspend'
        ? ['active', 'scheduled']
        : action === 'resume'
          ? ['suspended']
          : ['pending_review', 'rejected', 'scheduled', 'active', 'suspended'];
    const statusPlaceholders = expectedStatuses.map(() => '?').join(', ');
    const updated = await dbRun(
      `UPDATE advertising_campaigns
        SET status = ?, starts_at = ?, ends_at = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status IN (${statusPlaceholders})`,
      [nextStatus, startsAt, endsAt, note || null, getRequestActor(req), nowIso, nowIso, id, ...expectedStatuses],
    );
    if (updated.changes !== 1) return res.status(409).json({ error: 'La campagne a changé; rechargez la page.' });
    clearPublicCampaignCache();
    await writeAdminAudit(getRequestActor(req), `advertising_campaign_${action}`, campaign.shop_id, {
      campaign_id: id,
      kind: campaign.kind,
      status: nextStatus,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: note || null,
    });
    return res.json({ id, status: nextStatus, starts_at: startsAt, ends_at: endsAt });
  });

  adminRouter.get('/partner-requests', async (_req, res) => {
    const requests = await dbAll(
      `SELECT id, contact_name, company_name, email, phone, requested_format, objective, message,
          status, admin_note, created_at, updated_at
        FROM advertising_partner_requests ORDER BY created_at DESC LIMIT 200`,
    );
    return res.json({ requests });
  });

  adminRouter.get('/partners', async (_req, res) => {
    const partners = await dbAll<PermanentPartnerRow>(
      `SELECT id, name, descriptor, headline, logo_url, destination_url, sort_order,
          is_active, created_at, updated_at, updated_by
        FROM advertising_permanent_partners ORDER BY sort_order ASC, created_at ASC`,
    );
    return res.json({ partners });
  });

  adminRouter.post('/partners', async (req, res) => {
    const name = cleanText(req.body?.name, 100);
    const descriptor = cleanText(req.body?.descriptor, 120);
    const headline = cleanText(req.body?.headline, 180);
    const logoUrl = cleanPartnerUrl(req.body?.logo_url);
    const destinationUrl = cleanPartnerUrl(req.body?.destination_url);
    const sortOrder = req.body?.sort_order === undefined ? 0 : Number(req.body.sort_order);
    if (!name || !descriptor || !headline
      || logoUrl === undefined || destinationUrl === undefined
      || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
      return res.status(400).json({ error: 'Vérifiez le nom, le descriptif, le message, les liens HTTPS et l’ordre du partenaire.' });
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const actor = getRequestActor(req);
    await dbRun(
      `INSERT INTO advertising_permanent_partners
        (id, name, descriptor, headline, logo_url, destination_url, sort_order, is_active, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [id, name, descriptor, headline, logoUrl, destinationUrl, sortOrder, now, now, actor],
    );
    await writeAdminAudit(actor, 'advertising_permanent_partner_created', null, { partner_id: id, name, is_active: false });
    return res.status(201).json({ id, is_active: false });
  });

  adminRouter.patch('/partners/:partnerId', async (req, res) => {
    const id = String(req.params.partnerId);
    const existing = await dbGet<PermanentPartnerRow>(
      'SELECT * FROM advertising_permanent_partners WHERE id = ?',
      [id],
    );
    if (!existing) return res.status(404).json({ error: 'Partenaire permanent introuvable.' });

    const fields: Array<[string, string | number | null]> = [];
    for (const [key, column, maximumLength] of [
      ['name', 'name', 100],
      ['descriptor', 'descriptor', 120],
      ['headline', 'headline', 180],
    ] as const) {
      if (req.body?.[key] === undefined) continue;
      const value = cleanText(req.body[key], maximumLength);
      if (!value) return res.status(400).json({ error: 'Le nom, le descriptif et le message du partenaire sont obligatoires.' });
      fields.push([column, value]);
    }
    for (const [key, column] of [['logo_url', 'logo_url'], ['destination_url', 'destination_url']] as const) {
      if (req.body?.[key] === undefined) continue;
      const value = cleanPartnerUrl(req.body[key]);
      if (value === undefined) return res.status(400).json({ error: 'Les liens du partenaire doivent être HTTPS ou internes au site.' });
      fields.push([column, value]);
    }
    if (req.body?.sort_order !== undefined) {
      const sortOrder = Number(req.body.sort_order);
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        return res.status(400).json({ error: 'L’ordre doit être un entier positif.' });
      }
      fields.push(['sort_order', sortOrder]);
    }
    if (req.body?.is_active !== undefined) {
      if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'Le statut du partenaire est invalide.' });
      fields.push(['is_active', Number(req.body.is_active)]);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'Aucune modification valide à enregistrer.' });
    const actor = getRequestActor(req);
    const now = new Date().toISOString();
    const assignments = fields.map(([column]) => `${column} = ?`);
    assignments.push('updated_at = ?', 'updated_by = ?');
    const values = fields.map(([, value]) => value);
    const result = await dbRun(
      `UPDATE advertising_permanent_partners SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, now, actor, id],
    );
    if (result.changes !== 1) return res.status(404).json({ error: 'Partenaire permanent introuvable.' });
    await writeAdminAudit(actor, 'advertising_permanent_partner_updated', null, {
      partner_id: id,
      changes: Object.fromEntries(fields),
    });
    return res.json({ id, updated: true });
  });

  adminRouter.delete('/partners/:partnerId', async (req, res) => {
    const id = String(req.params.partnerId);
    const result = await dbRun('DELETE FROM advertising_permanent_partners WHERE id = ?', [id]);
    if (result.changes !== 1) return res.status(404).json({ error: 'Partenaire permanent introuvable.' });
    await writeAdminAudit(getRequestActor(req), 'advertising_permanent_partner_deleted', null, { partner_id: id });
    return res.status(204).end();
  });

  adminRouter.patch('/partner-requests/:requestId', async (req, res) => {
    const id = String(req.params.requestId);
    const status = req.body?.status;
    const note = cleanText(req.body?.note, 500);
    if (!['contacted', 'declined'].includes(status) || (status === 'declined' && note.length < 3)) {
      return res.status(400).json({ error: 'Choisissez un statut valide et indiquez un motif en cas de refus.' });
    }
    const now = new Date().toISOString();
    const updated = await dbRun(
      `UPDATE advertising_partner_requests SET status = ?, admin_note = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
      [status, note || null, now, id],
    );
    if (updated.changes !== 1) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
    await writeAdminAudit(getRequestActor(req), 'advertising_partner_request_updated', null, {
      request_id: id,
      status,
      reason: note || null,
    });
    return res.json({ id, status });
  });

  return {
    publicRouter,
    merchantRouter,
    adminRouter,
    reconcileExpiredCampaigns: expireCampaigns,
  };
}
