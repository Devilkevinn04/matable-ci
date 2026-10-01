import { createHash, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { ShopRecord } from '../types.ts';
import { toCustomerProfile } from '../services/customerProfile.ts';

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
