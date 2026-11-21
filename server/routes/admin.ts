import { Router } from 'express';
import { createAdminContext, type AdminRouterOptions } from './admin/context.ts';
import { registerReportsRoutes } from './admin/reports.ts';
import { registerModerationRoutes } from './admin/moderation.ts';
import { registerPlatformSettingsRoutes } from './admin/platformSettings.ts';
import { registerAnalyticsRoutes } from './admin/analytics.ts';
import { registerSubscriptionsRoutes } from './admin/subscriptions.ts';
import { registerShopsRoutes } from './admin/shops.ts';
import { registerOperationsRoutes } from './admin/operations.ts';
import { registerCustomersRoutes } from './admin/customers.ts';

export type { AdminRouterOptions } from './admin/context.ts';

export function createAdminRouter(options: AdminRouterOptions) {
  const router = Router();
  const ctx = createAdminContext(options);
  const { requireAdmin, requireSuperAdmin, requireVerification, isVerificationAdmin } = ctx;

  // Contrôle d’accès par rôle, appliqué avant toutes les routes.
  router.use((req, res, next) => {
    const path = String(req.path || '');
    if (path.startsWith('/identity-verifications')) return next();
    if (path.startsWith('/content-moderation')) {
      return requireVerification(req, res, next);
    }
    if (isVerificationAdmin(req)) {
      const allowedModeration = (req.method === 'GET' && path === '/content-moderation')
        || (req.method === 'PATCH' && /^\/content-moderation\/(reviews|reports)\/\d+$/.test(path));
      const allowedReadOnlyShopList = req.method === 'GET' && path === '/shops/verification-readonly';
      const allowedIdentityReminder = req.method === 'POST'
        && /^\/shops\/\d+\/notification$/.test(path)
        && req.body?.template === 'identity_verification';
      if (!allowedModeration && !allowedReadOnlyShopList && !allowedIdentityReminder) {
        return res.status(403).json({ error: 'Cette opération est réservée au super-admin ou à un rôle autorisé.' });
      }
    }
    if (path === '/payments' || path.startsWith('/subscriptions')
      || path === '/subscription-plans'
      || path === '/subscription-plan-features'
      || (req.method === 'DELETE' && /^\/shops\/\d+$/.test(path))
      || (req.method === 'POST' && /^\/shops\/\d+\/access-link$/.test(path))
      || (req.method === 'PATCH' && path === '/maintenance')
      || (req.method === 'GET' && path === '/push/status')) {
      return requireSuperAdmin(req, res, next);
    }
    if (req.method === 'POST'
      && /^\/shops\/\d+\/notification$/.test(path)
      && ['identity_verification', 'welcome', 'catalog', 'orders', 'support'].includes(String(req.body?.template || ''))) {
      return requireAdmin(req, res, next);
    }
    if (req.method === 'POST'
      && /^\/shops\/\d+\/notification$/.test(path)
      && req.body?.template === 'trial_expiring') {
      return requireSuperAdmin(req, res, next);
    }
    return requireAdmin(req, res, next);
  });

  registerReportsRoutes(router, ctx);
  registerModerationRoutes(router, ctx);
  registerPlatformSettingsRoutes(router, ctx);
  registerAnalyticsRoutes(router, ctx);
  registerSubscriptionsRoutes(router, ctx);
  registerShopsRoutes(router, ctx);
  registerOperationsRoutes(router, ctx);
  registerCustomersRoutes(router, ctx);

  return router;
}
