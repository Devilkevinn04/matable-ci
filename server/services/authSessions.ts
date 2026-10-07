import express, { Request, Response } from 'express';
import { createHash, randomUUID, timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { dbGet, dbRun } from '../../db.ts';
import type { ShopRecord } from '../types.ts';
import { toCustomerProfile } from './customerProfile.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import {
  deleteAdminSessionRecord,
  deleteCustomerSessionRecord,
  deleteMerchantSessionRecord,
  getAdminSessionRecord,
  getCustomerSessionRecord,
  getMerchantSessionRecord,
  saveAdminSessionRecord,
  saveCustomerSessionRecord,
  saveMerchantSessionRecord,
} from '../repositories/sessions.ts';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

type MerchantSession = { shopId: number; expiresAt: number; fingerprint: string };
type AdminSession = { expiresAt: number; fingerprint: string };
type CustomerSession = { userId: number; expiresAt: number; fingerprint: string };

export function buildSessionFingerprint(req: Request): string {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const acceptLanguage = String(req.headers['accept-language'] || '').trim();
  const normalized = `${userAgent}|${acceptLanguage}`;
  return createHash('sha256').update(normalized).digest('hex');
}

export function isRequestFingerprintMatch(session: { fingerprint?: string } | null | undefined, req: Request): boolean {
  if (!session?.fingerprint) return false;
  const current = buildSessionFingerprint(req);
  const leftBuffer = Buffer.from(current);
  const rightBuffer = Buffer.from(session.fingerprint);
  return leftBuffer.length === rightBuffer.length && cryptoTimingSafeEqual(leftBuffer, rightBuffer);
}

export function createAuthSessionHelpers({
  shops,
  refreshSubscriptionState,
}: {
  shops: ShopRecord[];
  refreshSubscriptionState: (shop: ShopRecord) => Promise<unknown>;
}) {
  const merchantSessions = new Map<string, MerchantSession>();
  const adminSessions = new Map<string, AdminSession>();
  const customerSessions = new Map<string, CustomerSession>();
  const dummyCustomerPasswordHash = bcrypt.hashSync(randomUUID(), 10);

  function getCookie(req: Request, name: string): string | null {
    const cookies = String(req.headers.cookie || '').split(';');
    const entry = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
    if (!entry) return null;
    try {
      return decodeURIComponent(entry.trim().slice(name.length + 1));
    } catch {
      return null;
    }
  }

  function setSessionCookie(res: Response, token: string, fingerprint: string) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSeconds = Math.max(1, Math.floor(SESSION_DURATION_MS / 1000));
    const sessionCookie = `matable_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
    const fingerprintCookie = `matable_session_fp=${encodeURIComponent(fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
    res.setHeader('Set-Cookie', [sessionCookie, fingerprintCookie]);
  }

  function setCustomerSessionCookie(res: Response, token: string, fingerprint: string) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSeconds = Math.max(1, Math.floor(SESSION_DURATION_MS / 1000));
    const sessionCookie = `matable_customer_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
    const fingerprintCookie = `matable_customer_session_fp=${encodeURIComponent(fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
    res.setHeader('Set-Cookie', [sessionCookie, fingerprintCookie]);
  }

  function clearCustomerSessionCookie(res: Response) {
    const expiredBase = '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    res.setHeader('Set-Cookie', [`matable_customer_session=;${expiredBase}`, `matable_customer_session_fp=;${expiredBase}`]);
  }

  async function createMerchantSession(res: Response, shopId: number, req: Request) {
    const sessionToken = randomUUID();
    const session = { shopId, expiresAt: Date.now() + SESSION_DURATION_MS, fingerprint: buildSessionFingerprint(req) };
    merchantSessions.set(sessionToken, session);
    await saveMerchantSessionRecord(sessionToken, session);
    setSessionCookie(res, sessionToken, session.fingerprint);
  }

  function clearSessionCookie(res: Response) {
    const expiredBase = '; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    res.setHeader('Set-Cookie', [`matable_session=;${expiredBase}`, `matable_session_fp=;${expiredBase}`]);
  }

  function setAdminSessionCookie(res: Response, token: string) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const maxAgeSeconds = Math.max(1, Math.floor(ADMIN_SESSION_DURATION_MS / 1000));
    res.setHeader('Set-Cookie', `matable_admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`);
  }

  async function getAdminSession(req: Request): Promise<string | null> {
    const token = getCookie(req, 'matable_admin_session');
    let session = token ? adminSessions.get(token) : undefined;

    if (!session && token) {
      session = (await getAdminSessionRecord(token)) ?? undefined;
      if (session) adminSessions.set(token, session);
    }

    if (!token || !session || session.expiresAt <= Date.now()) {
      if (token) {
        adminSessions.delete(token);
        await deleteAdminSessionRecord(token);
      }
      return null;
    }

    if (!isRequestFingerprintMatch(session, req)) {
      adminSessions.delete(token);
      await deleteAdminSessionRecord(token);
      return null;
    }

    const renewedSession = { ...session, expiresAt: Date.now() + ADMIN_SESSION_DURATION_MS };
    adminSessions.set(token, renewedSession);
    await saveAdminSessionRecord(token, renewedSession);
    return token;
  }

  async function getSessionStateForResponse(req: Request, res?: Response) {
    const adminToken = getCookie(req, 'matable_admin_session');
    if (adminToken) {
      const adminSessionToken = await getAdminSession(req);
      if (adminSessionToken) {
        if (res) setAdminSessionCookie(res, adminSessionToken);
        return { authenticated: true, userType: 'admin', shopId: null };
      }
    }

    const merchantToken = getCookie(req, 'matable_session');
    const customerToken = getCookie(req, 'matable_customer_session');
    if (customerToken && !merchantToken) {
      let customerSession = customerSessions.get(customerToken) ?? (await getCustomerSessionRecord(customerToken)) ?? undefined;
      if (!customerSession) {
        return { authenticated: false, userType: null, shopId: null, user: null };
      }
      if (customerSession.expiresAt <= Date.now()) {
        customerSessions.delete(customerToken);
        await deleteCustomerSessionRecord(customerToken);
        return { authenticated: false, userType: null, shopId: null, user: null };
      }
      if (!isRequestFingerprintMatch(customerSession, req)) {
        customerSessions.delete(customerToken);
        await deleteCustomerSessionRecord(customerToken);
        if (res) clearCustomerSessionCookie(res);
        return { authenticated: false, userType: null, shopId: null, user: null };
      }
      const user = await dbGet<{ id: number; name: string; first_name: string | null; last_name: string | null; phone: string; email: string; is_active: number }>('SELECT id, name, first_name, last_name, phone, email, is_active FROM users WHERE id = ?', [customerSession.userId]);
      if (!user || !user.is_active) {
        customerSessions.delete(customerToken);
        await deleteCustomerSessionRecord(customerToken);
        if (res) clearCustomerSessionCookie(res);
        return { authenticated: false, userType: null, shopId: null, user: null };
      }
      const renewedSession = { ...customerSession, expiresAt: Date.now() + SESSION_DURATION_MS };
      customerSessions.set(customerToken, renewedSession);
      await saveCustomerSessionRecord(customerToken, renewedSession);
      if (res) setCustomerSessionCookie(res, customerToken, renewedSession.fingerprint);
      return { authenticated: true, userType: 'customer', shopId: null, user: toCustomerProfile(user) };
    }

    if (merchantToken) {
      let merchantSession = merchantSessions.get(merchantToken) ?? (await getMerchantSessionRecord(merchantToken)) ?? undefined;
      if (!merchantSession) {
        return { authenticated: false, userType: null, shopId: null };
      }
      if (merchantSession.expiresAt <= Date.now()) {
        merchantSessions.delete(merchantToken);
        await deleteMerchantSessionRecord(merchantToken);
        return { authenticated: false, userType: null, shopId: null };
      }
      if (!isRequestFingerprintMatch(merchantSession, req)) {
        merchantSessions.delete(merchantToken);
        await deleteMerchantSessionRecord(merchantToken);
        return { authenticated: false, userType: null, shopId: null };
      }

      const renewedSession = { ...merchantSession, expiresAt: Date.now() + SESSION_DURATION_MS };
      merchantSessions.set(merchantToken, renewedSession);
      await saveMerchantSessionRecord(merchantToken, renewedSession);
      if (res) setSessionCookie(res, merchantToken, renewedSession.fingerprint);
      const shop = shops.find((candidate) => candidate.id === renewedSession.shopId);
      if (shop) await refreshSubscriptionState(shop);
      return { authenticated: true, userType: 'merchant', shopId: renewedSession.shopId };
    }

    return { authenticated: false, userType: null, shopId: null };
  }

  async function requireCustomerAccess(req: Request, res: Response, next: express.NextFunction) {
    const token = getCookie(req, 'matable_customer_session');
    let session = token ? customerSessions.get(token) : undefined;

    if (!session && token) {
      session = (await getCustomerSessionRecord(token)) ?? undefined;
      if (session) customerSessions.set(token, session);
    }

    if (!token || !session || session.expiresAt <= Date.now()) {
      if (token) {
        customerSessions.delete(token);
        await deleteCustomerSessionRecord(token);
      }
      return res.status(401).json({ error: 'Authentification client requise.' });
    }

    if (!isRequestFingerprintMatch(session, req)) {
      if (token) {
        customerSessions.delete(token);
        await deleteCustomerSessionRecord(token);
      }
      return res.status(401).json({ error: 'Session client rejetée pour sécurité.' });
    }

    const user = await dbGet<{ is_active: number }>('SELECT is_active FROM users WHERE id = ?', [session.userId]);
    if (!user || !user.is_active) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
      clearCustomerSessionCookie(res);
      return res.status(401).json({ error: 'Authentification client requise.' });
    }

    const renewedSession = { ...session, expiresAt: Date.now() + SESSION_DURATION_MS };
    customerSessions.set(token, renewedSession);
    await saveCustomerSessionRecord(token, renewedSession);
    res.setHeader('Set-Cookie', [
      `matable_customer_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor(SESSION_DURATION_MS / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      `matable_customer_session_fp=${encodeURIComponent(renewedSession.fingerprint)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(1, Math.floor(SESSION_DURATION_MS / 1000))}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    ]);
    req.user = { id: session.userId } as any;
    next();
  }

  async function getCustomerSessionState(req: Request, res?: Response) {
    const token = getCookie(req, 'matable_customer_session');
    if (!token) return { authenticated: false, userType: null, user: null };
    let session = customerSessions.get(token) ?? (await getCustomerSessionRecord(token)) ?? undefined;

    if (!session) return { authenticated: false, userType: null, user: null };
    if (session.expiresAt <= Date.now()) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
      return { authenticated: false, userType: null, user: null };
    }
    if (!isRequestFingerprintMatch(session, req)) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
      if (res) clearCustomerSessionCookie(res);
      return { authenticated: false, userType: null, user: null };
    }

    const user = await dbGet<{ id: number; name: string; first_name: string | null; last_name: string | null; phone: string; email: string; created_at: string; is_active: number }>('SELECT id, name, first_name, last_name, phone, email, created_at, is_active FROM users WHERE id = ?', [session.userId]);
    if (!user || !user.is_active) {
      customerSessions.delete(token);
      await deleteCustomerSessionRecord(token);
      if (res) clearCustomerSessionCookie(res);
      return { authenticated: false, userType: null, user: null };
    }

    const renewedSession = { ...session, expiresAt: Date.now() + SESSION_DURATION_MS };
    customerSessions.set(token, renewedSession);
    await saveCustomerSessionRecord(token, renewedSession);
    if (res) setCustomerSessionCookie(res, token, renewedSession.fingerprint);

    return { authenticated: true, userType: 'customer', user: toCustomerProfile(user) };
  }

  async function requireAdminAccess(req: Request, res: Response, next: express.NextFunction) {
    if (!await getAdminSession(req)) {
      return res.status(401).json({ error: 'Authentification super-admin requise.' });
    }
    next();
  }

  async function requireMerchantIdentity(req: Request, res: Response): Promise<ShopRecord | null> {
    const adminSessionToken = await getAdminSession(req);
    if (adminSessionToken) {
      const adminShop = await getShopFromDatabase(Number(req.params.id));
      if (!adminShop) {
        res.status(404).json({ error: 'Boutique introuvable.' });
        return null;
      }
      req.adminShopAccess = true;
      return adminShop;
    }

    const token = getCookie(req, 'matable_session');
    let session = token ? merchantSessions.get(token) : undefined;

    if (!session && token) {
      session = (await getMerchantSessionRecord(token)) ?? undefined;
      if (session) {
        merchantSessions.set(token, session);
      }
    }

    if (!session || session.expiresAt <= Date.now() || session.shopId !== Number(req.params.id)) {
      if (token) {
        merchantSessions.delete(token);
        await deleteMerchantSessionRecord(token);
      }
      res.status(401).json({ error: 'Session marchand invalide ou expirée.' });
      return null;
    }

    if (!isRequestFingerprintMatch(session, req)) {
      if (token) {
        merchantSessions.delete(token);
        await deleteMerchantSessionRecord(token);
      }
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session rejetée pour sécurité : appareil ou navigateur non reconnu.' });
      return null;
    }

    const shop = await getShopFromDatabase(session.shopId);
    if (!shop) {
      res.status(404).json({ error: 'Boutique introuvable.' });
      return null;
    }
    return shop;
  }

  async function requireMerchantOwner(req: Request, res: Response, next: express.NextFunction) {
    if (!await requireMerchantIdentity(req, res)) return;
    next();
  }

  async function requireMerchantAccess(req: Request, res: Response, next: express.NextFunction) {
    const shop = await requireMerchantIdentity(req, res);
    if (!shop) return;

    if (!shop.is_active && !req.adminShopAccess) {
      return res.status(403).json({ error: 'Boutique inactive : contactez l’administration pour la réactivation.' });
    }

    next();
  }

  async function requireMerchantOwnShop(req: Request, res: Response, next: express.NextFunction) {
    const shop = await requireMerchantIdentity(req, res);
    if (!shop) return;
    if (!shop.is_active && !req.adminShopAccess) return res.status(403).json({ error: 'Boutique inactive : contactez l’administration pour la réactivation.' });
    if (Number(req.params.id) !== shop.id) return res.status(403).json({ error: 'Accès refusé à cette boutique.' });
    next();
  }

  async function requireMerchantIdentityOwnShop(req: Request, res: Response, next: express.NextFunction) {
    const shop = await requireMerchantIdentity(req, res);
    if (!shop) return;
    if (Number(req.params.id) !== shop.id) return res.status(403).json({ error: 'Accès refusé à cette boutique.' });
    next();
  }

  async function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of merchantSessions) {
      if (session.expiresAt <= now) {
        merchantSessions.delete(token);
        await deleteMerchantSessionRecord(token);
      }
    }
    await dbRun('DELETE FROM merchant_sessions WHERE expires_at <= ?', [now]);
    for (const [token, session] of adminSessions) {
      if (session.expiresAt <= now) {
        adminSessions.delete(token);
        await deleteAdminSessionRecord(token);
      }
    }
    await dbRun('DELETE FROM admin_sessions WHERE expires_at <= ?', [now]);
  }

  return {
    merchantSessions,
    customerSessions,
    adminSessions,
    sessionDurationMs: SESSION_DURATION_MS,
    adminSessionDurationMs: ADMIN_SESSION_DURATION_MS,
    dummyCustomerPasswordHash,
    getCookie,
    setSessionCookie,
    setCustomerSessionCookie,
    clearCustomerSessionCookie,
    createMerchantSession,
    clearSessionCookie,
    setAdminSessionCookie,
    getAdminSession,
    getSessionStateForResponse,
    requireCustomerAccess,
    getCustomerSessionState,
    requireAdminAccess,
    requireMerchantIdentity,
    requireMerchantOwner,
    requireMerchantAccess,
    requireMerchantOwnShop,
    requireMerchantIdentityOwnShop,
    cleanupExpiredSessions,
  };
}
