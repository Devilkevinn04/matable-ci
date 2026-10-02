import { createHash, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { ShopRecord } from '../types.ts';
import { toCustomerProfile, type CustomerProfileRow } from '../services/customerProfile.ts';

interface LoginAttempt {
  count: number;
  resetAt: number;
}

interface MerchantSession {
  shopId: number;
  expiresAt: number;
  fingerprint: string;
}

interface CustomerSession {
  userId: number;
  expiresAt: number;
  fingerprint: string;
}

type CustomerOAuthProvider = 'google' | 'apple';

interface CustomerOAuthTransaction {
  provider: CustomerOAuthProvider;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
}

interface PendingCustomerOAuthProfile {
  provider: CustomerOAuthProvider;
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  returnTo: string;
  expiresAt: number;
}

const GOOGLE_OIDC_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_OIDC_KEYS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

interface AdminSession {
  expiresAt: number;
  fingerprint: string;
}

interface SessionState {
  authenticated: boolean;
  userType: string | null;
  shopId: number | null;
  [key: string]: unknown;
}

interface CustomerState {
  authenticated: boolean;
  userType: string | null;
  user: { id: number; name: string; first_name: string; last_name: string; phone: string; email: string; created_at?: string } | null;
}

interface AuthRouterOptions {
  shops: ShopRecord[];
  sessionDurationMs: number;
  adminSessionDurationMs: number;
  dummyCustomerPasswordHash: string;
  merchantSessions: Map<string, MerchantSession>;
  customerSessions: Map<string, CustomerSession>;
  adminSessions: Map<string, AdminSession>;
  loginAttempts: Map<string, LoginAttempt>;
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  isLoginRateLimited: (key: string) => boolean;
  getCustomerLoginLockSeconds: (key: string) => number;
  recordCustomerLoginFailure: (key: string) => number;
  getRateLimitClientAddress: (req: Pick<Request, 'ip' | 'socket'>) => string;
  verifyPin: (inputPin: string, storedHash: string) => boolean;
  toSafeShop: (shop: ShopRecord) => object;
  createMerchantSession: (res: Response, shopId: number, req: Request) => Promise<void>;
  getCookie: (req: Request, name: string) => string | null;
  clearSessionCookie: (res: Response) => void;
  clearCustomerSessionCookie: (res: Response) => void;
  getSessionStateForResponse: (req: Request, res?: Response) => Promise<SessionState>;
  refreshSubscriptionState: (shop: ShopRecord) => Promise<unknown>;
  deleteMerchantSessionRecord: (token: string) => Promise<void>;
  deleteCustomerSessionRecord: (token: string) => Promise<void>;
  hashAccessToken: (token: string) => string;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
  getCustomerSessionState: (req: Request, res?: Response) => Promise<CustomerState>;
  getAdminSession: (req: Request) => Promise<string | null>;
  deleteAdminSessionRecord: (token: string) => Promise<void>;
  saveAdminSessionRecord: (token: string, session: AdminSession) => Promise<void>;
  saveCustomerSessionRecord: (token: string, session: CustomerSession) => Promise<void>;
  setAdminSessionCookie: (res: Response, token: string) => void;
  setCustomerSessionCookie: (res: Response, token: string, fingerprint: string) => void;
  buildSessionFingerprint: (req: Request) => string;
}

const timingSafeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && cryptoTimingSafeEqual(leftBuffer, rightBuffer);
};

export function createAuthRouter(options: AuthRouterOptions) {
  const router = Router();
  const {
    shops,
    sessionDurationMs,
    adminSessionDurationMs,
    dummyCustomerPasswordHash,
    merchantSessions,
    customerSessions,
    adminSessions,
    loginAttempts,
    rateLimitPublicRequest,
    isLoginRateLimited,
    getCustomerLoginLockSeconds,
    recordCustomerLoginFailure,
    getRateLimitClientAddress,
    verifyPin,
    toSafeShop,
    createMerchantSession,
    getCookie,
    clearSessionCookie,
    clearCustomerSessionCookie,
    getSessionStateForResponse,
    refreshSubscriptionState,
    deleteMerchantSessionRecord,
    deleteCustomerSessionRecord,
    hashAccessToken,
    dbGet,
    dbRun,
    sanitizeTextField,
    getCustomerSessionState,
    getAdminSession,
    deleteAdminSessionRecord,
    saveAdminSessionRecord,
    saveCustomerSessionRecord,
    setAdminSessionCookie,
    setCustomerSessionCookie,
    buildSessionFingerprint,
  } = options;

  const oauthTransactions = new Map<string, CustomerOAuthTransaction>();
  const pendingOAuthProfiles = new Map<string, PendingCustomerOAuthProfile>();
  const pendingOAuthCookie = 'matable_oauth_pending';

  const oauthProviderEnabled = (provider: CustomerOAuthProvider) => provider === 'google'
    ? Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    : Boolean(process.env.APPLE_SERVICE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);

  const getOAuthOrigin = (req: Request) => {
    const baseUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host') || ''}`).trim();
    const parsed = new URL(baseUrl);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('APP_URL HTTPS requis pour OAuth.');
    return parsed.origin;
  };

  const safeOAuthReturnTo = (value: unknown) => {
    const candidate = typeof value === 'string' ? value : '';
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return '/compte';
    try {
      const parsed = new URL(candidate, 'https://return.matable.invalid');
      return parsed.origin === 'https://return.matable.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/compte';
    } catch {
      return '/compte';
    }
  };

  const createCustomerSession = async (req: Request, res: Response, user: CustomerProfileRow) => {
    const token = randomUUID();
    const session = { userId: user.id, expiresAt: Date.now() + sessionDurationMs, fingerprint: buildSessionFingerprint(req) };
    customerSessions.set(token, session);
    await saveCustomerSessionRecord(token, session);
    setCustomerSessionCookie(res, token, session.fingerprint);
    return toCustomerProfile(user);
  };

  const linkCustomerOAuthIdentity = async (provider: CustomerOAuthProvider, providerUserId: string, userId: number, email: string) => {
    await dbRun(`INSERT INTO customer_oauth_identities (provider, provider_user_id, user_id, email, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider, provider_user_id) DO NOTHING`,
    [provider, providerUserId, userId, email, new Date().toISOString()]);
    const identity = await dbGet<{ user_id: number }>('SELECT user_id FROM customer_oauth_identities WHERE provider = ? AND provider_user_id = ?', [provider, providerUserId]);
    return Number(identity?.user_id) === userId;
  };

  router.post('/merchant-login', async (req, res) => {
    const { phone, pin } = req.body;
    if (!phone || !pin) return res.status(400).json({ error: 'Numéro de téléphone et code PIN requis.' });

    const attemptKey = `${req.ip}:${String(phone).replace(/\D/g, '')}`;
    if (isLoginRateLimited(attemptKey)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });

    const cleanInputPhone = phone.replace(/[^0-9]/g, '');
    const shop = shops.find((candidate) => {
      const cleanShopPhone = candidate.whatsapp_number.replace(/[^0-9]/g, '');
      return cleanShopPhone.includes(cleanInputPhone)
        || cleanInputPhone.includes(cleanShopPhone)
        || cleanShopPhone.slice(-8) === cleanInputPhone.slice(-8);
    });

    if (!shop) return res.status(404).json({ error: 'Aucune boutique associée à ce numéro de téléphone.' });
    if (!verifyPin(pin, shop.pin_code_hash)) return res.status(401).json({ error: 'Code PIN incorrect à 6 chiffres.' });
    if (!shop.is_active) {
      return res.status(403).json({ error: 'Votre boutique est inactive. Contactez l’administration MaTable.ci pour la réactivation.' });
    }

    await createMerchantSession(res, shop.id, req);
    loginAttempts.delete(attemptKey);
    res.json({
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        whatsapp_number: shop.whatsapp_number,
        theme_color: shop.theme_color,
        welcome_message: shop.welcome_message,
        is_open: shop.is_open,
        is_active: shop.is_active,
        category: shop.category,
        theme_config: shop.theme_config,
      },
    });
  });

  router.post('/logout', async (req, res) => {
    const token = getCookie(req, 'matable_session');
    if (token) {
      merchantSessions.delete(token);
      await deleteMerchantSessionRecord(token);
    }
    clearSessionCookie(res);
    res.json({ success: true });
  });

  router.get('/session', async (req, res) => {
    const state = await getSessionStateForResponse(req, res);
    if (state.userType === 'merchant' && state.shopId) {
      const shop = shops.find((candidate) => candidate.id === state.shopId);
      const subscription = shop ? await refreshSubscriptionState(shop) : undefined;
      return res.json({ ...state, subscription });
    }
    res.json(state);
  });

  router.post('/merchant-access-login', rateLimitPublicRequest(10), async (req, res) => {
    const token = String(req.body?.access_token || '').trim();
    if (!token || token.length > 200) return res.status(401).json({ error: 'Lien d’accès invalide.' });
    const tokenHash = hashAccessToken(token);
    const shop = shops.find((candidate) => candidate.owner_access_token_hash === tokenHash);
    if (!shop) return res.status(401).json({ error: 'Lien d’accès invalide.' });
    if (!shop.is_active) return res.status(403).json({ error: 'Boutique inactive : contactez l’administrateur pour la réactivation.' });

    const consumed = await dbRun(
      'UPDATE shops SET owner_access_token_hash = NULL WHERE id = ? AND owner_access_token_hash = ?',
      [shop.id, tokenHash],
    );
    if (consumed.changes !== 1) return res.status(401).json({ error: 'Lien d’accès invalide.' });
    shop.owner_access_token_hash = null;
    await createMerchantSession(res, shop.id, req);
    res.json({ success: true, shop: toSafeShop(shop) });
  });

  router.post('/admin-login', async (req, res) => {
    const configuredKey = String(process.env.ADMIN_ACCESS_KEY || '').trim();
    if (!configuredKey) return res.status(503).json({ error: 'ADMIN_ACCESS_KEY doit être configurée côté serveur.' });

    const adminAttemptKey = `${req.ip}:admin`;
    if (isLoginRateLimited(adminAttemptKey)) return res.status(429).json({ error: 'Trop de tentatives de connexion admin. Réessayez plus tard.' });
    if (!timingSafeEqual(String(req.body?.key || ''), configuredKey)) return res.status(401).json({ error: 'Clé super-admin incorrecte.' });

    loginAttempts.delete(adminAttemptKey);
    const token = randomUUID();
    const adminSession = { expiresAt: Date.now() + adminSessionDurationMs, fingerprint: buildSessionFingerprint(req) };
    adminSessions.set(token, adminSession);
    await saveAdminSessionRecord(token, adminSession);
    setAdminSessionCookie(res, token);
    res.json({ success: true });
  });

  router.post('/admin-logout', async (req, res) => {
    const token = await getAdminSession(req);
    if (token) {
      adminSessions.delete(token);
      await deleteAdminSessionRecord(token);
    }
    res.setHeader('Set-Cookie', 'matable_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    res.json({ success: true });
  });

  router.get('/customer-oauth/providers', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ google: oauthProviderEnabled('google'), apple: oauthProviderEnabled('apple') });
  });

  router.get('/customer-oauth/pending', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = getCookie(req, pendingOAuthCookie) || '';
    const pending = pendingOAuthProfiles.get(token);
    if (!pending || pending.expiresAt <= Date.now()) {
      if (pending) pendingOAuthProfiles.delete(token);
      return res.json({ pending: false });
    }
    return res.json({ pending: true, email: pending.email, first_name: pending.firstName, last_name: pending.lastName });
  });

  router.get('/customer-oauth/:provider/start', rateLimitPublicRequest(20), async (req, res) => {
    const provider = String(req.params.provider) as CustomerOAuthProvider;
    if (!['google', 'apple'].includes(provider)) return res.status(404).json({ error: 'Fournisseur de connexion inconnu.' });
    if (!oauthProviderEnabled(provider)) return res.status(503).json({ error: 'Cette connexion n’est pas configurée.' });

    for (const [key, transaction] of oauthTransactions) {
      if (transaction.expiresAt <= Date.now()) oauthTransactions.delete(key);
    }
    for (const [key, profile] of pendingOAuthProfiles) {
      if (profile.expiresAt <= Date.now()) pendingOAuthProfiles.delete(key);
    }
    if (oauthTransactions.size >= 1000) oauthTransactions.delete(oauthTransactions.keys().next().value || '');

    const state = randomUUID();
    const nonce = randomUUID();
    const codeVerifier = randomUUID() + randomUUID();
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const transaction: CustomerOAuthTransaction = {
      provider,
      nonce,
      codeVerifier,
      returnTo: safeOAuthReturnTo(req.query.return_to),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    oauthTransactions.set(`${provider}:${state}`, transaction);

    const callbackUrl = new URL(`/api/auth/customer-oauth/${provider}/callback`, getOAuthOrigin(req)).toString();
    const authorizationUrl = new URL(provider === 'google'
      ? 'https://accounts.google.com/o/oauth2/v2/auth'
      : 'https://appleid.apple.com/auth/authorize');
    authorizationUrl.searchParams.set('client_id', provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID! : process.env.APPLE_SERVICE_ID!);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', provider === 'google' ? 'openid email profile' : 'openid email name');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    if (provider === 'apple') authorizationUrl.searchParams.set('response_mode', 'form_post');
    else authorizationUrl.searchParams.set('prompt', 'select_account');
    res.redirect(302, authorizationUrl.toString());
  });

  const customerOAuthCallback: RequestHandler = async (req, res) => {
    const provider = String(req.params.provider) as CustomerOAuthProvider;
    const state = String(req.body?.state || req.query.state || '');
    const transactionKey = `${provider}:${state}`;
    const transaction = oauthTransactions.get(transactionKey);
    oauthTransactions.delete(transactionKey);
    const oauthError = new URL('/connexion', getOAuthOrigin(req));
    oauthError.searchParams.set('oauth', 'error');

    if (!['google', 'apple'].includes(provider) || !transaction || transaction.expiresAt <= Date.now()) {
      return res.redirect(303, oauthError.toString());
    }
    if (req.body?.error || req.query.error) return res.redirect(303, oauthError.toString());

    try {
      const clientId = provider === 'google' ? process.env.GOOGLE_OAUTH_CLIENT_ID! : process.env.APPLE_SERVICE_ID!;
      const clientSecret = provider === 'google'
        ? process.env.GOOGLE_OAUTH_CLIENT_SECRET!
        : await new SignJWT({})
          .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID! })
          .setIssuer(process.env.APPLE_TEAM_ID!)
          .setSubject(clientId)
          .setAudience('https://appleid.apple.com')
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(await importPKCS8(String(process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), 'ES256'));
      const tokenResponse = await fetch(provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(req.body?.code || req.query.code || ''),
          redirect_uri: new URL(`/api/auth/customer-oauth/${provider}/callback`, getOAuthOrigin(req)).toString(),
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: transaction.codeVerifier,
        }),
      });
      if (!tokenResponse.ok) return res.redirect(303, oauthError.toString());
      const tokenData = await tokenResponse.json() as { id_token?: string };
      if (!tokenData.id_token) return res.redirect(303, oauthError.toString());

      const verified = await jwtVerify(tokenData.id_token, provider === 'google' ? GOOGLE_OIDC_KEYS : APPLE_OIDC_KEYS, {
        issuer: provider === 'google' ? ['https://accounts.google.com', 'accounts.google.com'] : 'https://appleid.apple.com',
        audience: clientId,
      });
      const claims = verified.payload;
      const providerUserId = typeof claims.sub === 'string' ? claims.sub : '';
      if (!providerUserId || claims.nonce !== transaction.nonce) return res.redirect(303, oauthError.toString());

      const linkedIdentity = await dbGet<{ user_id: number }>(
        'SELECT user_id FROM customer_oauth_identities WHERE provider = ? AND provider_user_id = ?',
        [provider, providerUserId],
      );
      let user: CustomerProfileRow | undefined;
      if (linkedIdentity) {
        user = await dbGet<CustomerProfileRow & { is_active: number }>(
          'SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE id = ?',
          [linkedIdentity.user_id],
        );
        if (!user || !('is_active' in user) || !user.is_active) return res.redirect(303, oauthError.toString());
      } else {
        const email = String(claims.email || '').trim().toLowerCase();
        const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
        if (!email || !emailVerified) return res.redirect(303, oauthError.toString());

        const existingUser = await dbGet<CustomerProfileRow & { is_active: number }>(
          'SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE email = ?',
          [email],
        );
        if (existingUser) {
          if (!existingUser.is_active || !(await linkCustomerOAuthIdentity(provider, providerUserId, existingUser.id, email))) {
            return res.redirect(303, oauthError.toString());
          }
          user = existingUser;
        } else {
          let providerName: { firstName?: string; lastName?: string } = {};
          if (provider === 'apple' && typeof req.body?.user === 'string') {
            try {
              const appleProfile = JSON.parse(req.body.user);
              providerName = { firstName: appleProfile?.name?.firstName, lastName: appleProfile?.name?.lastName };
            } catch {
              providerName = {};
            }
          }
          const firstName = sanitizeTextField(String(claims.given_name || providerName.firstName || ''), 60).trim();
          const lastName = sanitizeTextField(String(claims.family_name || providerName.lastName || ''), 60).trim();
          const pendingId = randomUUID();
          pendingOAuthProfiles.set(pendingId, {
            provider,
            providerUserId,
            email,
            firstName,
            lastName,
            returnTo: transaction.returnTo,
            expiresAt: Date.now() + 10 * 60 * 1000,
          });
          const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
          res.setHeader('Set-Cookie', `${pendingOAuthCookie}=${encodeURIComponent(pendingId)}; Path=/api/auth/customer-oauth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
          const completionUrl = new URL('/connexion', getOAuthOrigin(req));
          completionUrl.searchParams.set('oauth', 'complete');
          completionUrl.searchParams.set('return_to', transaction.returnTo);
          return res.redirect(303, completionUrl.toString());
        }
      }

      const profile = await createCustomerSession(req, res, user);
      return res.redirect(303, transaction.returnTo || '/compte');
    } catch {
      return res.redirect(303, oauthError.toString());
    }
  };

  router.get('/customer-oauth/:provider/callback', rateLimitPublicRequest(30), customerOAuthCallback);
  router.post('/customer-oauth/:provider/callback', rateLimitPublicRequest(30), customerOAuthCallback);

  router.post('/customer-oauth/complete', rateLimitPublicRequest(20), async (req, res) => {
    const pendingId = getCookie(req, pendingOAuthCookie) || '';
    const pending = pendingOAuthProfiles.get(pendingId);
    if (!pending || pending.expiresAt <= Date.now()) {
      if (pending) pendingOAuthProfiles.delete(pendingId);
      return res.status(401).json({ error: 'Cette inscription a expiré. Recommencez avec votre fournisseur.' });
    }
    const firstName = sanitizeTextField(String(req.body?.first_name || pending.firstName), 60).trim();
    const lastName = sanitizeTextField(String(req.body?.last_name || pending.lastName), 60).trim();
    const phone = String(req.body?.phone || '').trim();
    if (!firstName || !lastName) return res.status(400).json({ error: 'Le prénom et le nom sont requis.' });
    if (!/^\+?225\d{8,12}$/.test(phone)) return res.status(400).json({ error: 'Le téléphone est requis au format ivoirien.' });

    let user = await dbGet<CustomerProfileRow & { is_active: number }>(
      'SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE email = ?',
      [pending.email],
    );
    if (user && !user.is_active) return res.status(403).json({ error: 'Ce compte est désactivé. Contactez l’assistance.' });
    if (!user) {
      const phoneOwner = await dbGet<{ id: number }>('SELECT id FROM users WHERE phone = ?', [phone]);
      if (phoneOwner) return res.status(409).json({ error: 'Ce téléphone est déjà associé à un autre compte.' });
      const name = `${firstName} ${lastName}`;
      const inserted = await dbGet<{ id: number }>(
        'INSERT INTO users (name, first_name, last_name, phone, email, password_hash, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING id',
        [name, firstName, lastName, phone, pending.email, bcrypt.hashSync(randomUUID(), 10), new Date().toISOString()],
      );
      if (!inserted) return res.status(500).json({ error: 'Impossible de créer le compte.' });
      user = await dbGet<CustomerProfileRow & { is_active: number }>(
        'SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE id = ?',
        [inserted.id],
      );
    }
    if (!user || !(await linkCustomerOAuthIdentity(pending.provider, pending.providerUserId, user.id, pending.email))) {
      return res.status(409).json({ error: 'Cette identité sociale est déjà liée à un autre compte.' });
    }

    pendingOAuthProfiles.delete(pendingId);
    const profile = await createCustomerSession(req, res, user);
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.append('Set-Cookie', `${pendingOAuthCookie}=; Path=/api/auth/customer-oauth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    res.status(201).json({ success: true, user: profile, return_to: safeOAuthReturnTo(pending.returnTo) });
  });

  router.post('/customer-register', rateLimitPublicRequest(20), async (req, res) => {
    const { first_name, last_name, phone, email, password } = req.body || {};
    const safeFirstName = sanitizeTextField(String(first_name || ''), 60).trim();
    const safeLastName = sanitizeTextField(String(last_name || ''), 60).trim();
    const safeName = `${safeFirstName} ${safeLastName}`.trim();
    const safePhone = String(phone || '').trim();
    const safeEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');

    if (!safeFirstName || !safeLastName) return res.status(400).json({ error: 'Le prénom et le nom sont requis.' });
    if (!/^\+?225\d{8,12}$/.test(safePhone)) return res.status(400).json({ error: 'Le téléphone est requis au format ivoirien.' });
    if (!safeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) return res.status(400).json({ error: 'Un email valide est requis.' });
    if (!safePassword || safePassword.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });

    const existing = await dbGet<{ id: number }>('SELECT id FROM users WHERE email = ? OR phone = ?', [safeEmail, safePhone]);
    if (existing) return res.status(409).json({ error: 'Un compte existe déjà avec cet email ou ce téléphone.' });

    const passwordHash = bcrypt.hashSync(safePassword, 10);
    const inserted = await dbGet<{ id: number }>('INSERT INTO users (name, first_name, last_name, phone, email, password_hash, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1) RETURNING id', [safeName, safeFirstName, safeLastName, safePhone, safeEmail, passwordHash, new Date().toISOString()]);
    const user = inserted ? await dbGet<{ id: number; name: string; first_name: string; last_name: string; phone: string; email: string; created_at: string }>('SELECT id, name, first_name, last_name, phone, email, created_at FROM users WHERE id = ?', [inserted.id]) : undefined;
    if (!user) return res.status(500).json({ error: 'Impossible de créer le compte.' });

    const token = randomUUID();
    const session = { userId: user.id, expiresAt: Date.now() + sessionDurationMs, fingerprint: buildSessionFingerprint(req) };
    customerSessions.set(token, session);
    await saveCustomerSessionRecord(token, session);
    setCustomerSessionCookie(res, token, session.fingerprint);
    res.json({ success: true, user: toCustomerProfile(user) });
  });

  router.post('/customer-login', rateLimitPublicRequest(20), async (req, res) => {
    const { email, password } = req.body || {};
    const safeEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');
    if (!safeEmail || !safePassword) return res.status(400).json({ error: 'Email et mot de passe requis.' });

    const attemptKey = `customer:${getRateLimitClientAddress(req)}:${safeEmail}`;
    const lockSeconds = getCustomerLoginLockSeconds(attemptKey);
    if (lockSeconds > 0) {
      res.setHeader('Retry-After', String(lockSeconds));
      return res.status(429).json({ error: 'Identifiants invalides. Réessayez plus tard.' });
    }

    const user = await dbGet<{ id: number; name: string; first_name: string | null; last_name: string | null; phone: string; email: string; password_hash: string; created_at: string; is_active: number }>('SELECT * FROM users WHERE email = ?', [safeEmail]);
    const passwordMatches = bcrypt.compareSync(safePassword, user?.password_hash || dummyCustomerPasswordHash);
    if (!user || !passwordMatches || !user.is_active) {
      const failureCount = recordCustomerLoginFailure(attemptKey);
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 100 * 2 ** (failureCount - 1))));
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    loginAttempts.delete(attemptKey);
    const token = randomUUID();
    const session = { userId: user.id, expiresAt: Date.now() + sessionDurationMs, fingerprint: buildSessionFingerprint(req) };
    customerSessions.set(token, session);
    await saveCustomerSessionRecord(token, session);
    setCustomerSessionCookie(res, token, session.fingerprint);
    res.json({ success: true, user: toCustomerProfile(user) });
  });

  router.get('/customer-session', async (req, res) => {
    const state = await getCustomerSessionState(req, res);
    res.json({ ...state, authenticated: !!state.authenticated });
  });

  router.post('/customer-logout', async (req, res) => {
    const token = getCookie(req, 'matable_customer_session');
    if (token) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
    }
    clearCustomerSessionCookie(res);
    res.json({ success: true });
  });

  return router;
}
