import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Store,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Phone,
  Send,
  DollarSign,
  CreditCard,
  Search,
  Check,
  BarChart3,
  ClipboardList,
  Download,
  Package,
  TrendingUp,
  Eye,
  EyeOff,
  Users,
  Activity,
  ShoppingBag,
  LogOut,
  Flag,
  UserRound,
  Trash2,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { AdminIdentityVerificationPanel } from './AdminIdentityVerificationPanel';
import { AdminShopList } from './AdminShopList';
import { AdminPushAnnouncements } from './AdminPushAnnouncements';
import {
  audienceSourceLabels,
  formatAudienceChange,
  ownerNotificationTemplates,
  subscriptionStatusLabels,
} from './adminDashboardTypes';
import type {
  AdminAnalytics,
  AdminAuditLog,
  AdminCustomer,
  AdminContentModeration,
  AdminFinance,
  AdminHealth,
  AdminMaintenance,
  AdminOrder,
  AdminShopItem,
  AdminSubscriptionShop,
  AdminSubscriptions,
} from './adminDashboardTypes';

const adminOrderTransitions: Record<AdminOrder['status'], AdminOrder['status'][]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'delivered', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: ['pending', 'confirmed'],
  expired: [],
};

type AdminRole = 'super_admin' | 'verification_admin';
type AdminView = 'overview' | 'shops' | 'orders' | 'customers' | 'identity' | 'verification-shops' | 'audience' | 'finance' | 'subscriptions' | 'operations' | 'push' | 'moderation' | 'audit';

interface VerificationShopSummary {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  city: string | null;
  publication_status: string;
  merchant_verification_status: string;
  created_at: string;
}

const adminAuditActionLabels: Record<string, string> = {
  admin_order_status_updated: 'Statut de commande modifié',
  customer_report_processed: 'Signalement traité',
  customer_review_moderated: 'Avis modéré',
  identity_verification_request_prepared: 'Rappel de vérification préparé',
  identity_status_updated: 'Statut Didit mis à jour',
  maintenance_updated: 'Mode maintenance modifié',
  platform_push_announcement_sent: 'Annonce Push envoyée',
  shop_permanently_deleted: 'Boutique supprimée',
  shop_reactivated: 'Boutique réactivée',
  shop_suspended: 'Boutique suspendue',
  subscription_expiry_corrected: 'Échéance d’abonnement corrigée',
  subscription_reminder_failed: 'Échec du rappel d’abonnement',
  subscription_reminder_sent: 'Rappel d’abonnement envoyé',
  trial_expiry_reconciled: 'Échéance d’essai synchronisée',
  admin_shop_operation: 'Opération sur la boutique',
  trial_extended: 'Essai prolongé',
  trial_reminder_prepared: 'Rappel d’essai préparé',
};

const adminAuditDetailLabels: Record<string, string> = {
  announcement_id: 'Annonce',
  attempted: 'Tentatives',
  days: 'Jours ajoutés',
  delivery_mode: 'Mode',
  enabled: 'Activé',
  failed: 'Échecs',
  previous_enabled: 'État précédent',
  previous_subscription_expires_at: 'Échéance précédente',
  previous_trial_end: 'Fin d’essai précédente',
  previous_status: 'Statut précédent',
  reason: 'Motif',
  recipients: 'Boutiques concernées',
  review_id: 'Avis',
  sent: 'Envoyés',
  shop_id: 'Boutique',
  shop_name: 'Nom de boutique',
  shop_slug: 'Identifiant boutique',
  status: 'Statut',
  event_id: 'Événement Didit',
  subscription_expires_at: 'Nouvelle échéance',
  trial_end: 'Nouvelle fin d’essai',
  deleted_products: 'Produits supprimés',
  deleted_orders: 'Commandes supprimées',
  deleted_reviews: 'Avis supprimés',
  deleted_reports: 'Signalements supprimés',
};

export const AdminDashboard: React.FC = () => {
  const getAdminAuditReason = (details: string) => {
    try {
      const parsed: unknown = JSON.parse(details);
      if (parsed && typeof parsed === 'object' && 'reason' in parsed && typeof parsed.reason === 'string') {
        return parsed.reason;
      }
    } catch {
      return null;
    }
    return null;
  };
  const getReminderLeadDays = (details: string) => {
    try {
      const parsed: unknown = JSON.parse(details);
      if (parsed && typeof parsed === 'object' && 'days_before' in parsed && typeof parsed.days_before === 'number') {
        return parsed.days_before;
      }
    } catch {
      return null;
    }
    return null;
  };
  const getReminderFailure = (details: string) => {
    try {
      const parsed: unknown = JSON.parse(details);
      if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
        return parsed.error;
      }
    } catch {
      return null;
    }
    return null;
  };
  const [adminView, setAdminView] = useState<AdminView>('overview');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [shops, setShops] = useState<AdminShopItem[]>([]);
  const [verificationShops, setVerificationShops] = useState<VerificationShopSummary[]>([]);
  const [verificationShopSearch, setVerificationShopSearch] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('super_admin');
  const [loginRole, setLoginRole] = useState<AdminRole>('super_admin');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [publicationFilter, setPublicationFilter] = useState<'all' | 'draft' | 'active' | 'suspended'>('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'pending' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'not_required'>('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'not_started' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'orders' | 'name'>('sales');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [deleteShopTarget, setDeleteShopTarget] = useState<Pick<AdminShopItem, 'id' | 'name' | 'slug'> | null>(null);
  const [deleteShopConfirmation, setDeleteShopConfirmation] = useState('');
  const [deleteShopReason, setDeleteShopReason] = useState('');
  const [deleteShopAcknowledged, setDeleteShopAcknowledged] = useState(false);
  const [deleteShopLoading, setDeleteShopLoading] = useState(false);
  const [deleteShopError, setDeleteShopError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [audienceShopSearch, setAudienceShopSearch] = useState('');
  const [audienceShopSort, setAudienceShopSort] = useState<'views' | 'sessions' | 'orders' | 'sales' | 'conversion' | 'name'>('views');
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [financeDays, setFinanceDays] = useState(90);
  const [financePaymentsPage, setFinancePaymentsPage] = useState(0);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptions | null>(null);
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [trialExtensionDays, setTrialExtensionDays] = useState(7);
  const [subscriptionActionShopId, setSubscriptionActionShopId] = useState<number | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<number, { date: string; reason: string }>>({});
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(0);
  const [orderActionLoadingId, setOrderActionLoadingId] = useState<number | null>(null);
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<AdminMaintenance | null>(null);
  const [maintenanceEnabledDraft, setMaintenanceEnabledDraft] = useState(false);
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState('Le service revient bientôt. Merci de votre patience.');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState('');
  const [notificationShopId, setNotificationShopId] = useState('');
  const [notificationTemplate, setNotificationTemplate] = useState<typeof ownerNotificationTemplates[number]['id']>('welcome');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [verificationRequestShopId, setVerificationRequestShopId] = useState<number | null>(null);
  const [identityCampaignShopIds, setIdentityCampaignShopIds] = useState<number[]>([]);
  const [identityCampaignIndex, setIdentityCampaignIndex] = useState(0);
  const [identityCampaignLoading, setIdentityCampaignLoading] = useState(false);
  const [identityCampaignMessage, setIdentityCampaignMessage] = useState(
    'Bonjour {boutique}, votre boutique MaTable.ci est actuellement en veille et n’apparaît pas sur le site, car votre identité n’a pas encore été vérifiée. Pour la faire réapparaître, connectez-vous à votre tableau de bord marchand : {dashboard}, puis ouvrez « Vérification d’identité » et suivez les étapes de Didit. Après la vérification, la remise en ligne pourra être finalisée si les autres critères de publication sont remplis. Répondez à ce message si vous avez besoin d’aide.',
  );
  const [selectedVerificationShopId, setSelectedVerificationShopId] = useState<number | null>(null);
  const [featuredActionShopId, setFeaturedActionShopId] = useState<number | null>(null);
  const [contentModeration, setContentModeration] = useState<AdminContentModeration>({ reviews: [], reports: [] });
  const [contentModerationError, setContentModerationError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditLogTotal, setAuditLogTotal] = useState(0);
  const [auditLogPage, setAuditLogPage] = useState(0);
  const [auditLogSearch, setAuditLogSearch] = useState('');
  const [auditLogActor, setAuditLogActor] = useState<'all' | AdminRole | 'didit_webhook'>('all');
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [auditLogError, setAuditLogError] = useState('');
  const [auditLogRefresh, setAuditLogRefresh] = useState(0);

  const fetchAdminShops = async () => {
    try {
      setLoading(true);
      const sessionRes = await fetch('/api/auth/session', { method: 'GET' });
      if (!sessionRes.ok) {
        setIsAuthenticated(false);
        setShops([]);
        return;
      }

      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated || sessionData.userType !== 'admin') {
        setIsAuthenticated(false);
        setShops([]);
        return;
      }
      const role: AdminRole = sessionData.role === 'verification_admin' ? 'verification_admin' : 'super_admin';
      setAdminRole(role);
      if (role === 'verification_admin') {
        setSortBy('orders');
        setAudienceShopSort('views');
        setNotificationTemplate('welcome');
        if (adminView === 'overview') setAdminView('identity');
        setShops([]);
        const verificationShopsRes = await fetch('/api/admin/shops/verification-readonly');
        if (!verificationShopsRes.ok) throw new Error('Impossible de charger la liste des boutiques en lecture seule.');
        setVerificationShops(await verificationShopsRes.json());
        setIsAuthenticated(true);
        await fetchContentModeration();
        return;
      }
      setAdminView('overview');

      const res = await fetch('/api/admin/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsAuthenticated(true);
        await fetchAnalytics(analyticsDays);
        if (role === 'super_admin') {
          await fetchFinance(financeDays);
          await fetchSubscriptions();
        }
        await fetchOperations(role);
        await fetchAdminCustomers();
        await fetchAdminOrders();
        await fetchContentModeration();
      } else if (res.status === 401) {
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async (role = adminRole) => {
    try {
      setOperationsLoading(true);
      setOperationsError('');
      const healthRes = await fetch('/api/admin/health');
      if (!healthRes.ok) throw new Error('Impossible de charger l’état du service.');
      const health = await healthRes.json();
      setAdminHealth(health);
      if (role === 'super_admin') {
        const maintenanceRes = await fetch('/api/admin/maintenance');
        if (!maintenanceRes.ok) throw new Error('Impossible de charger le mode maintenance.');
        const maintenance = await maintenanceRes.json();
        setMaintenanceMode(maintenance);
        setMaintenanceEnabledDraft(maintenance.enabled);
        setMaintenanceMessageDraft(maintenance.message);
      } else {
        setMaintenanceMode(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Les outils opérationnels sont momentanément indisponibles.';
      setOperationsError(message);
      showNotice(message);
    } finally {
      setOperationsLoading(false);
    }
  };

  const fetchContentModeration = async () => {
    try {
      const response = await fetch('/api/admin/content-moderation');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger la modération.');
      setContentModeration({ reviews: data.reviews || [], reports: data.reports || [] });
      setContentModerationError('');
    } catch (error) {
      setContentModerationError(error instanceof Error ? error.message : 'Impossible de charger la modération.');
    }
  };

  const fetchAdminCustomers = async () => {
    try {
      setCustomerLoading(true);
      const params = new URLSearchParams({ limit: '100', offset: String(customerPage * 100), search: customerSearch });
      const response = await fetch(`/api/admin/customers?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les clients.');
      setAdminCustomers(data.customers || []);
      setCustomerTotal(Number(data.total || 0));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de charger les clients.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const fetchAdminOrders = async () => {
    try {
      const params = new URLSearchParams({
        limit: '100',
        offset: String(orderPage * 100),
        search: orderSearch.trim(),
        status: orderStatusFilter,
      });
      const response = await fetch(`/api/admin/orders?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les commandes.');
      setAdminOrders(data.orders || []);
      setOrderTotal(Number(data.total || 0));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de charger les commandes.');
    }
  };

  const updateOrderStatus = async (order: AdminOrder, status: AdminOrder['status']) => {
    if (!adminOrderTransitions[order.status].includes(status)) {
      showNotice(`Transition non autorisée : ${order.status} → ${status}.`);
      return;
    }
    const reason = window.prompt(`Motif obligatoire pour la commande #${order.id} (${order.status} → ${status}) :`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      showNotice('Saisissez un motif d’au moins 3 caractères.');
      return;
    }
    if (!window.confirm(`Confirmer le changement de statut de la commande #${order.id} ? Le stock sera ajusté selon le workflow et le motif journalisé.`)) return;
    try {
      setOrderActionLoadingId(order.id);
      const response = await fetch(`/api/shops/${order.shop_id}/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier cette commande.');
      showNotice(`Commande #${order.id} mise à jour.`);
      await fetchOperations();
      await fetchAdminOrders();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de modifier cette commande.');
    } finally {
      setOrderActionLoadingId(null);
    }
  };

  const moderateContent = async (kind: 'reviews' | 'reports', id: number, status: string) => {
    try {
      const response = await fetch(`/api/admin/content-moderation/${kind}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer cette décision.');
      showNotice(kind === 'reviews'
        ? status === 'approved' ? 'Avis publié.' : 'Avis masqué.'
        : status === 'resolved' ? 'Signalement traité.' : status === 'dismissed' ? 'Signalement classé sans suite.' : 'Signalement pris en charge.');
      await fetchContentModeration();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible d’enregistrer cette décision.');
    }
  };

  const fetchAnalytics = async (days: number) => {
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`);
      if (!res.ok) throw new Error('Impossible de charger les données d’audience.');
      setAnalytics(await res.json());
    } catch (error) {
      console.error(error);
      showNotice('Les données d’audience sont momentanément indisponibles.');
    }
  };

  const fetchFinance = async (
    days: number,
    page = financePaymentsPage,
    search = paymentSearch,
    status = paymentStatusFilter,
    type = paymentTypeFilter,
  ) => {
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: '50',
        offset: String(page * 50),
        search,
        status,
        type,
      });
      const response = await fetch(`/api/admin/payments?${params}`);
      if (!response.ok) throw new Error('Impossible de charger le journal financier.');
      setFinance(await response.json());
    } catch {
      showNotice('Le journal financier est momentanément indisponible.');
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/admin/subscriptions');
      if (!res.ok) throw new Error('Impossible de charger les abonnements.');
      setSubscriptions(await res.json());
    } catch {
      showNotice('La vue abonnements est momentanément indisponible.');
    }
  };

  const saveMaintenanceMode = async () => {
    if (!maintenanceMode) return;
    const stateChanged = maintenanceEnabledDraft !== maintenanceMode.enabled;
    if (stateChanged && !window.confirm(maintenanceEnabledDraft
      ? 'Activer la maintenance va rendre le site marchand et ses API indisponibles. L’administration restera accessible. Continuer ?'
      : 'Rétablir l’accès au site marchand ?')) return;

    setMaintenanceSaving(true);
    try {
      const response = await fetch('/api/admin/maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: maintenanceEnabledDraft, message: maintenanceMessageDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le mode maintenance.');
      setMaintenanceMode(data);
      setMaintenanceEnabledDraft(data.enabled);
      setMaintenanceMessageDraft(data.message);
      showNotice(data.enabled ? 'Mode maintenance activé.' : 'Site marchand de nouveau accessible.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de modifier le mode maintenance.');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  useEffect(() => {
    fetchAdminShops();
  }, []);

  useEffect(() => {
    if (isAuthenticated && adminView === 'moderation') void fetchContentModeration();
  }, [isAuthenticated, adminView]);

  useEffect(() => {
    if (!isAuthenticated || adminRole !== 'super_admin' || adminView !== 'finance') return;
    const timer = window.setTimeout(() => {
      void fetchFinance(financeDays, financePaymentsPage, paymentSearch, paymentStatusFilter, paymentTypeFilter);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, adminRole, adminView, financeDays, financePaymentsPage, paymentSearch, paymentStatusFilter, paymentTypeFilter]);

  useEffect(() => {
    if (!isAuthenticated || adminRole !== 'super_admin' || adminView !== 'audit') return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAuditLogLoading(true);
      setAuditLogError('');
      const params = new URLSearchParams({
        limit: '50',
        offset: String(auditLogPage * 50),
        search: auditLogSearch,
        ...(auditLogActor !== 'all' ? { actor: auditLogActor } : {}),
      });
      try {
        const response = await fetch(`/api/admin/audit-logs?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json() as { audit_logs?: AdminAuditLog[]; total?: number; error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le journal d’audit.');
        setAuditLogs(data.audit_logs || []);
        setAuditLogTotal(Number(data.total || 0));
      } catch (error) {
        if (controller.signal.aborted) return;
        setAuditLogError(error instanceof Error ? error.message : 'Impossible de charger le journal d’audit.');
      } finally {
        if (!controller.signal.aborted) setAuditLogLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isAuthenticated, adminRole, adminView, auditLogPage, auditLogSearch, auditLogActor, auditLogRefresh]);

  useEffect(() => {
    if (isAuthenticated && adminView === 'customers') void fetchAdminCustomers();
  }, [isAuthenticated, adminView, customerSearch, customerPage]);

  useEffect(() => {
    if (!isAuthenticated || adminView !== 'orders') return;
    const timer = window.setTimeout(() => { void fetchAdminOrders(); }, 250);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, adminView, orderSearch, orderStatusFilter, orderPage]);

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKey, role: loginRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Connexion super-admin impossible.');
      return;
    }
    setAdminKey('');
    await fetchAdminShops();
  };

  const handleAdminLogout = async () => {
    await fetch('/api/auth/admin-logout', { method: 'POST' });
    setIsAuthenticated(false);
    setAdminKey('');
    setAdminHealth(null);
    setAdminOrders([]);
    setAnalytics(null);
    setFinance(null);
  };

  const handleExtendTrial = async (shop: AdminSubscriptionShop) => {
    if (!shop.trial_end) {
      showNotice('La date de fin d’essai est manquante ; actualisez les abonnements avant de continuer.');
      return;
    }
    const currentTrialEnd = Date.parse(shop.trial_end);
    if (!Number.isFinite(currentTrialEnd)) {
      showNotice('La date de fin d’essai est invalide ; corrigez-la avant de continuer.');
      return;
    }
    if (trialExtensionDays > shop.trial_extension_days_remaining) {
      showNotice(`Il ne reste que ${shop.trial_extension_days_remaining} jour(s) de prolongation autorisés pour ${shop.name}.`);
      return;
    }
    const nextTrialEnd = new Date(Math.max(currentTrialEnd, Date.now()) + trialExtensionDays * 86400000);
    const formattedNextEnd = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(nextTrialEnd);
    if (!window.confirm(`Prolonger l’essai de ${shop.name} de ${trialExtensionDays} jours (${shop.trial_extension_days_used + trialExtensionDays}/30 au total) ? Nouvelle échéance : ${formattedNextEnd}.`)) return;
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/extend-trial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: trialExtensionDays, expected_trial_end: shop.trial_end }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de prolonger l’essai.');
      showNotice(`Essai prolongé jusqu’au ${formattedNextEnd} pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de prolonger l’essai.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleReconcileTrialExpiry = async (shop: AdminSubscriptionShop) => {
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/reconcile-trial-expiry`, {
        method: 'PATCH',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de synchroniser les échéances.');
      showNotice(`Échéance d’essai synchronisée pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de synchroniser les échéances.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleSetSubscriptionExpiry = async (shop: AdminSubscriptionShop) => {
    const draft = expiryDrafts[shop.id];
    if (!draft?.date || draft.reason.trim().length < 10) {
      showNotice('Choisissez une date et indiquez un motif explicite d’au moins 10 caractères.');
      return;
    }
    if (!window.confirm(`Enregistrer le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${draft.date}T12:00:00`))} comme date de fin d’accès de ${shop.name} ? Vérifiez au préalable le paiement et la période couverte. Cette action ne crée pas d’encaissement et sera journalisée.`)) return;
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/set-expiry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiry_date: draft.date,
          expected_subscription_expires_at: shop.subscription_expires_at,
          reason: draft.reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de corriger l’échéance.');
      setExpiryDrafts((previous) => ({ ...previous, [shop.id]: { date: '', reason: '' } }));
      showNotice(`Échéance corrigée pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de corriger l’échéance.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handlePrepareTrialReminder = async (shop: AdminSubscriptionShop) => {
    if (!shop.whatsapp_reminders_opt_in) {
      showNotice('Le commerçant doit d’abord autoriser les rappels WhatsApp.');
      return;
    }
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showNotice('Autorisez les fenêtres pop-up pour ouvrir WhatsApp.');
      return;
    }
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'trial_expiring' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer la relance WhatsApp.');
      popup.location.href = data.whatsapp_url;
      showNotice(`Message de relance prêt pour ${shop.name}. Il restera à le valider dans WhatsApp.`);
      await fetchSubscriptions();
    } catch (error) {
      popup.close();
      showNotice(error instanceof Error ? error.message : 'Impossible de préparer la relance WhatsApp.');
    }
  };

  const maxDailyViews = Math.max(1, ...(analytics?.daily.map(day => day.page_views) || [0]));
  const chartPoints = analytics?.daily.length
    ? analytics.daily.map((day, index) => {
        const x = 18 + (index * (384 / Math.max(analytics.daily.length - 1, 1)));
        const y = 140 - (day.page_views / maxDailyViews) * 96;
        return `${x},${y}`;
      }).join(' ')
    : '';

  if (!isAuthenticated) {
    return (
      <div className="admin-login min-h-screen flex items-center justify-center p-6">
        <motion.form
          onSubmit={handleAdminLogin}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-[2rem] border-[3px] border-[#211712] bg-[#fffaf2] p-6 shadow-[10px_10px_0_rgba(33,23,18,0.96)] backdrop-blur-xl"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="brand-mark">M</div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">MaTable.ci</div>
              <h1 className="text-xl font-black text-slate-900">
                {loginRole === 'verification_admin' ? 'Accès vérification' : 'Accès super-admin'}
              </h1>
            </div>
          </div>
          <div className="mb-4 rounded-2xl bg-gradient-to-r from-[#eef5ff] to-[#f7e7c7] p-4 border-[2px] border-[#211712]">
            <div className="flex items-center gap-2 text-[#1b3a63] font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              {loginRole === 'verification_admin' ? 'Espace de vérification' : 'Espace de contrôle central'}
            </div>
            <p className="mt-2 text-sm text-[#4a3a30]">
              {loginRole === 'verification_admin'
                ? 'Entrez la clé de vérification configurée côté serveur. Cet accès est limité aux vérifications et à la modération.'
                : 'Entrez la clé configurée côté serveur pour piloter les boutiques et les alertes.'}
            </p>
          </div>
          <label className="mb-3 block text-xs font-bold text-slate-700" htmlFor="admin-role">Type d’accès</label>
          <select
            id="admin-role"
            value={loginRole}
            onChange={(event) => {
              setLoginRole(event.target.value as AdminRole);
              setAdminKey('');
              setAuthError(null);
            }}
            className="mb-4 w-full rounded-2xl border-[2px] border-[#211712] bg-[#fffaf2] px-3 py-3 text-sm font-medium text-[#211712] outline-none focus:border-[#1b3a63] focus:bg-white"
          >
            <option value="super_admin">Super-admin</option>
            <option value="verification_admin">Admin de vérification</option>
          </select>
          <div className="relative">
            <input
              type={showAdminKey ? 'text' : 'password'}
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder={loginRole === 'verification_admin' ? 'Clé admin de vérification' : 'Clé super-admin'}
              required
              className="w-full rounded-2xl border-[2px] border-[#211712] bg-[#fffaf2] px-3 py-3 pr-12 text-sm font-medium text-[#211712] outline-none transition focus:border-[#1b3a63] focus:bg-white"
            />
            <button type="button" onClick={() => setShowAdminKey((visible) => !visible)} aria-label={showAdminKey ? 'Masquer la clé' : 'Afficher la clé'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {authError && <p className="mt-3 text-sm text-[#b93712]">{authError}</p>}
          <button type="submit" className="mt-5 w-full rounded-2xl bg-[#1b3a63] px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_rgba(33,23,18,0.95)] border-2 border-[#211712] transition hover:translate-y-[-1px]">
            Se connecter
          </button>
        </motion.form>
      </div>
    );
  }

  // Manual ON/OFF toggle
  const handleToggleActive = async (shopId: number) => {
    const shop = shops.find((item) => item.id === shopId);
    if (!shop) return;
    const reason = window.prompt(shop.is_active
      ? `Motif obligatoire pour désactiver la boutique ${shop.name} :`
      : `Motif obligatoire pour réactiver la boutique ${shop.name} :`);
    if (reason === null) return;
    if (reason.trim().length < 3) {
      showNotice('Saisissez un motif d’au moins 3 caractères.');
      return;
    }
    if (!window.confirm(`${shop.is_active ? 'Désactiver' : 'Réactiver'} la boutique ${shop.name} ? Le motif sera conservé dans le journal admin.`)) return;
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/toggle-active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_is_active: shop.is_active, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShops(prev =>
          prev.map(s => (s.id === shopId ? { ...s, ...data.shop } : s))
        );
        if (adminRole === 'super_admin') await fetchSubscriptions();
        showNotice(shop.is_active ? 'Boutique désactivée avec motif enregistré.' : 'Boutique réactivée avec motif enregistré.');
      } else {
        showNotice(data.error || 'Impossible de mettre à jour le statut.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
    }
  };

  const handleDeleteShop = async () => {
    if (!deleteShopTarget || deleteShopConfirmation.trim() !== deleteShopTarget.slug || deleteShopReason.trim().length < 3 || !deleteShopAcknowledged) return;
    setDeleteShopLoading(true);
    setDeleteShopError(null);
    try {
      const response = await fetch(`/api/admin/shops/${deleteShopTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation_slug: deleteShopConfirmation.trim(), reason: deleteShopReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de supprimer cette boutique.');
      setShops((current) => current.filter((shop) => shop.id !== deleteShopTarget.id));
      setDeleteShopTarget(null);
      setDeleteShopConfirmation('');
      setDeleteShopReason('');
      setDeleteShopAcknowledged(false);
      setDeleteShopError(null);
      await Promise.all([fetchAnalytics(analyticsDays), fetchSubscriptions(), fetchAdminOrders()]);
      showNotice('Boutique supprimée définitivement. L’action est inscrite au journal admin.');
    } catch (error) {
      setDeleteShopError(error instanceof Error ? error.message : 'Impossible de supprimer cette boutique.');
    } finally {
      setDeleteShopLoading(false);
    }
  };

  const handleSetFeatured = async (shopId: number, days: number) => {
    setFeaturedActionShopId(shopId);
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotice(data.error || 'Impossible de modifier la mise à la une.');
        return;
      }
      setShops(previous => previous.map(shop => shop.id === shopId
        ? { ...shop, featured_until: data.featured_until }
        : shop));
      showNotice(days === 0 ? 'Mise à la une retirée.' : `Boutique mise à la une pour ${days} jours.`);
    } catch {
      showNotice('Impossible de contacter le serveur.');
    } finally {
      setFeaturedActionShopId(null);
    }
  };

  const handleOpenMerchantSpace = async (shopId: number) => {
    // Open synchronously so browsers do not block the new tab.
    const newTab = window.open('about:blank', '_blank');
    if (!newTab) {
      showNotice('Impossible d\'ouvrir un nouvel onglet. Vérifiez les paramètres de votre navigateur.');
      return;
    }
    newTab.document.write('<html><head><title>Chargement…</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><p style="color:#64748b;font-size:14px">⏳ Chargement de l\'espace commerçant…</p></body></html>');
    newTab.document.close();
    newTab.location.href = `/app?admin_shop_id=${shopId}`;
    showNotice('Espace boutique ouvert en mode super-admin.');
  };

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const filteredShops = shops.filter(s =>
    (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.whatsapp_number.includes(searchQuery) ||
      s.slug.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (statusFilter === 'all' ||
      (statusFilter === 'active' && s.is_active) ||
      (statusFilter === 'inactive' && !s.is_active)) &&
    (publicationFilter === 'all' || (s.publication_status || 'draft') === publicationFilter) &&
    (verificationFilter === 'all' || (s.merchant_verification_status || 'not_required') === verificationFilter) &&
    (subscriptionFilter === 'all' || (s.subscription?.status || s.subscription_status || 'not_started') === subscriptionFilter)
  ).sort((a, b) => {
    if (sortBy === 'sales') return b.total_sales - a.total_sales;
    if (sortBy === 'orders') return b.orders_count - a.orders_count;
    return a.name.localeCompare(b.name);
  });
  const filteredAdminOrders = adminOrders;
  const filteredFinancePayments = (finance?.payments || []).filter((payment) => {
    const query = paymentSearch.trim().toLowerCase();
    const matchesQuery = !query || [payment.shop_name, payment.provider_reference || '', payment.id]
      .some((value) => value.toLowerCase().includes(query));
    const matchesStatus = paymentStatusFilter === 'all'
      || payment.status === paymentStatusFilter
      || paymentStatusFilter === 'failed' && payment.status === 'error';
    return matchesQuery
      && matchesStatus
      && (paymentTypeFilter === 'all' || payment.payment_type === paymentTypeFilter);
  });
  const filteredSubscriptions = (subscriptions?.shops || []).filter((shop) => {
    const query = subscriptionSearch.trim().toLowerCase();
    const matchesQuery = !query || [shop.name, shop.whatsapp_number, shop.owner_email || '', shop.slug]
      .some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (subscriptionStatusFilter === 'all' || shop.status === subscriptionStatusFilter);
  });
  const expiringTrials = (subscriptions?.shops || []).filter((shop) => shop.status === 'trialing'
    && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7);
  const inconsistentTrialExpiries = (subscriptions?.shops || []).filter((shop) => shop.trial_expiry_mismatch);
  const trialExtensionOptions = [...new Set([
    7,
    14,
    30,
    ...(subscriptions?.shops || [])
      .map((shop) => shop.trial_extension_days_remaining)
      .filter((days) => days > 0 && days < 30),
  ])].sort((left, right) => left - right);

  const activeShopsCount = shops.filter(s => s.is_active).length;
  const overviewDaily = analytics?.daily || [];
  const overviewChartMaxSales = Math.max(1, ...overviewDaily.map((day) => day.sales));
  const overviewChartX = (index: number) => 24 + index * (672 / Math.max(overviewDaily.length - 1, 1));
  const overviewSalesY = (sales: number) => 182 - (sales / overviewChartMaxSales) * 150;
  const overviewSalesPoints = overviewDaily
    .map((day, index) => `${overviewChartX(index)},${overviewSalesY(day.sales)}`)
    .join(' ');
  const overviewSalesArea = overviewDaily.length
    ? `M ${overviewChartX(0)},182 L ${overviewDaily.map((day, index) => `${overviewChartX(index)},${overviewSalesY(day.sales)}`).join(' L ')} L ${overviewChartX(overviewDaily.length - 1)},182 Z`
    : '';
  const overviewTickDays = overviewDaily.filter((_, index) => index % Math.max(1, Math.ceil(overviewDaily.length / 6)) === 0 || index === overviewDaily.length - 1);
  const overviewTopShops = [...(analytics?.by_shop || [])].sort((left, right) => right.sales - left.sales).slice(0, 5);
  const filteredAudienceShops = (analytics?.by_shop || [])
    .filter((shop) => shop.shop_name.toLocaleLowerCase('fr').includes(audienceShopSearch.trim().toLocaleLowerCase('fr')))
    .sort((left, right) => {
      if (audienceShopSort === 'name') return left.shop_name.localeCompare(right.shop_name, 'fr');
      const field = audienceShopSort === 'views' ? 'page_views'
        : audienceShopSort === 'sessions' ? 'unique_visitors'
          : audienceShopSort === 'orders' ? 'orders'
            : audienceShopSort === 'sales' ? 'sales' : 'conversion_rate';
      return right[field] - left[field];
    });

  const exportShopsCsv = () => {
    const headers = adminRole === 'super_admin'
      ? ['Boutique', 'Slug', 'Statut', 'Valeur commandes FCFA', 'Commandes', 'Panier moyen', 'Produits']
      : ['Boutique', 'Slug', 'Statut', 'Commandes', 'Produits'];
    const rows = filteredShops.map(shop => adminRole === 'super_admin'
      ? [shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.total_sales, shop.orders_count, shop.average_order_value, shop.products_count]
      : [shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.orders_count, shop.products_count]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matable-admin-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportOperationsCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const prepareOwnerNotification = async () => {
    if (!notificationShopId) {
      showNotice('Sélectionnez une boutique avant de préparer le message.');
      return;
    }
    try {
      setNotificationLoading(true);
      const res = await fetch(`/api/admin/shops/${notificationShopId}/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: notificationTemplate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de préparer la notification.');
      const popup = window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer');
      if (!popup) showNotice('WhatsApp est prêt : autorisez les fenêtres pop-up pour ouvrir le message.');
      else showNotice('Message WhatsApp prêt pour le propriétaire.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de préparer la notification.');
    } finally {
      setNotificationLoading(false);
    }
  };

  const requestOwnerIdentityVerification = async (shopId: number) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showNotice('Autorisez les fenêtres pop-up pour préparer le message WhatsApp.');
      return;
    }
    popup.opener = null;
    setVerificationRequestShopId(shopId);
    try {
      const response = await fetch(`/api/admin/shops/${shopId}/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'identity_verification' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer la demande WhatsApp.');
      if (typeof data.whatsapp_url !== 'string' || !data.whatsapp_url.startsWith('https://wa.me/')) {
        throw new Error('Le lien WhatsApp reçu est invalide.');
      }
      popup.location.href = data.whatsapp_url;
      showNotice('Message WhatsApp prêt. Vérifiez-le et envoyez-le au propriétaire.');
    } catch (error) {
      popup.close();
      showNotice(error instanceof Error ? error.message : 'Impossible de préparer la demande WhatsApp.');
    } finally {
      setVerificationRequestShopId(null);
    }
  };

  const identityVerificationCandidates = shops.filter((shop) =>
    ['pending', 'submitted', 'under_review', 'rejected'].includes(shop.merchant_verification_status || '')
    && shop.publication_status !== 'active');
  const identityCampaignRecipients = identityCampaignShopIds
    .map((shopId) => shops.find((shop) => shop.id === shopId))
    .filter((shop): shop is AdminShopItem => Boolean(shop));
  const identityCampaignRecipient = identityCampaignRecipients[identityCampaignIndex];
  const startIdentityCampaign = () => {
    const recipients = identityVerificationCandidates
      .filter((shop) => /^\d{8,15}$/.test(String(shop.whatsapp_number || '').replace(/\D/g, '')))
      .map((shop) => shop.id);
    setIdentityCampaignShopIds(recipients);
    setIdentityCampaignIndex(0);
    if (recipients.length === 0) showNotice('Aucun propriétaire en attente avec un numéro WhatsApp valide.');
  };
  const prepareNextIdentityCampaignMessage = async () => {
    if (!identityCampaignRecipient) return;
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showNotice('Autorisez les fenêtres pop-up pour ouvrir WhatsApp.');
      return;
    }
    popup.opener = null;
    setIdentityCampaignLoading(true);
    try {
      const response = await fetch(`/api/admin/shops/${identityCampaignRecipient.id}/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'identity_verification', message: identityCampaignMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer ce message WhatsApp.');
      if (typeof data.whatsapp_url !== 'string' || !data.whatsapp_url.startsWith('https://wa.me/')) {
        throw new Error('Le lien WhatsApp reçu est invalide.');
      }
      popup.location.href = data.whatsapp_url;
      setIdentityCampaignIndex((index) => index + 1);
      showNotice(`Message prêt pour ${identityCampaignRecipient.name}. Vérifiez-le et envoyez-le dans WhatsApp avant de continuer.`);
    } catch (error) {
      popup.close();
      showNotice(error instanceof Error ? error.message : 'Impossible de préparer le message WhatsApp.');
    } finally {
      setIdentityCampaignLoading(false);
    }
  };

  const pendingVerificationShops = shops.filter((shop) => ['pending', 'submitted', 'under_review'].includes(shop.merchant_verification_status || ''));
  const pendingVerificationCount = adminRole === 'verification_admin'
    ? verificationShops.filter((shop) => ['pending', 'submitted', 'under_review'].includes(shop.merchant_verification_status)).length
    : pendingVerificationShops.length;
  const adminNavigationGroups: { label: string; items: { id: AdminView; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = adminRole === 'super_admin'
    ? [
      {
        label: 'Pilotage',
        items: [
          { id: 'overview', label: 'Accueil', icon: Activity },
          { id: 'shops', label: `Boutiques (${shops.length})`, icon: Store },
          { id: 'orders', label: 'Commandes', icon: ShoppingBag },
          { id: 'customers', label: `Clients (${customerTotal})`, icon: UserRound },
        ],
      },
      {
        label: 'Confiance',
        items: [
          { id: 'moderation', label: 'Avis & signalements', icon: Flag },
          { id: 'identity', label: `Identité (${pendingVerificationCount})`, icon: ShieldCheck },
        ],
      },
      {
        label: 'Mesure',
        items: [{ id: 'audience', label: 'Audience', icon: BarChart3 }],
      },
      {
        label: 'Plateforme',
        items: [
          { id: 'finance', label: 'Finances', icon: CreditCard },
          { id: 'subscriptions', label: 'Abonnements', icon: RefreshCw },
          { id: 'operations', label: 'Opérations', icon: Activity },
          { id: 'push', label: 'Annonces Push', icon: Send },
          { id: 'audit', label: 'Journal d’audit', icon: ClipboardList },
        ],
      },
    ]
    : [
      {
        label: 'Vérification',
        items: [
          { id: 'verification-shops', label: 'Boutiques (lecture)', icon: Store },
          { id: 'identity', label: `Identité (${pendingVerificationCount})`, icon: ShieldCheck },
          { id: 'moderation', label: 'Avis & signalements', icon: Flag },
        ],
      },
    ];
  const focusVerificationShop = (shopId: number) => {
    setSelectedVerificationShopId(shopId);
    setAdminView('identity');
    window.setTimeout(() => document.getElementById(`identity-verification-shop-${shopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  return (
    <div className="admin-dashboard min-h-screen pb-20">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white/90 text-slate-900 backdrop-blur-sm lg:ml-64">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.08),transparent_20%),radial-gradient(circle_at_top_right,_rgba(15,118,110,0.06),transparent_30%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="brand-mark brand-mark-header">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 break-words text-lg font-black tracking-tight text-[#211712] sm:text-xl">{adminRole === 'super_admin' ? 'Super-Admin MaTable.ci' : 'Administration MaTable.ci'}</h1>
                  <span className="dashboard-chip dashboard-chip-soft">{adminRole === 'super_admin' ? 'Tour de contrôle' : 'Espace vérification'}</span>
                </div>
                <p className="text-[11px] text-[#4a3a30] mt-0.5 leading-4 max-w-xl">
                  {adminRole === 'super_admin'
                    ? 'Pilotage global de la plateforme'
                    : 'File de vérification Didit et modération de contenu'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fetchAdminShops()}
                disabled={loading}
                aria-label="Actualiser les boutiques"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-[#211712] shadow-[4px_4px_0_rgba(33,23,18,0.96)] border-[2px] border-[#211712] transition hover:translate-y-[-1px] disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Actualiser</span>
              </button>
              <button type="button" onClick={() => void handleAdminLogout()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-[#211712] bg-white px-3 py-2 text-xs font-black text-[#211712] transition hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Déconnexion
              </button>
            </div>
          </div>

        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6 lg:ml-64 lg:w-auto lg:max-w-none">
        {actionNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{actionNotice}</span>
          </motion.div>
        )}

        {adminRole === 'super_admin' && adminView === 'overview' && pendingVerificationShops.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p><strong>{pendingVerificationShops.length} dossier(s) d’identité nécessitent un suivi.</strong> Les statuts et décisions sont transmis par Didit.</p>
            </div>
            <button type="button" onClick={() => setAdminView('identity')} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">
              Consulter les statuts
            </button>
          </motion.div>
        )}

        <div className="grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-1 lg:items-start">
        <nav aria-label={adminRole === 'super_admin' ? 'Navigation super-admin' : 'Navigation administration'} className="admin-sidebar hidden min-w-0 flex-col gap-1 overflow-y-auto p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:overflow-x-hidden lg:rounded-none lg:border-0 lg:px-4 lg:py-6">
          <div className="mb-3 hidden px-3 pt-2 lg:block">
            <p className="text-2xl font-black tracking-tight text-white">MaTable.ci</p>
            <p className="mt-1 text-sm text-white/70">{adminRole === 'super_admin' ? 'Super-Admin · Tour de contrôle' : 'Espace vérification'}</p>
          </div>
          {adminNavigationGroups.map((group) => (
            <section key={group.label} className="mb-2">
              <h2 className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{group.label}</h2>
              <div className="space-y-1">
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-current={adminView === id ? 'page' : undefined} onClick={() => setAdminView(id)} className={`flex min-h-10 w-full min-w-0 items-center justify-start gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${adminView === id ? 'bg-[#176b55] text-white' : 'text-white/90 hover:bg-[#176b55] hover:text-white'}`}>
                    <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="mt-auto hidden rounded-2xl bg-[#176b55] px-4 py-3 text-sm font-bold text-white lg:block">
            {adminRole === 'super_admin' ? 'Super-Admin' : 'Admin de vérification'}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
        {adminView === 'overview' && (
          <section aria-labelledby="admin-overview-title" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#176b55]">Centre de pilotage</p><h2 id="admin-overview-title" className="mt-1 text-2xl font-black text-[#211712]">Vue d’ensemble</h2><p className="mt-1 text-xs text-slate-500">{analytics ? `Données du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${analytics.daily[0]?.date || new Date().toISOString().slice(0, 10)}T12:00:00`))} au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${analytics.daily.at(-1)?.date || new Date().toISOString().slice(0, 10)}T12:00:00`))} · actualisation automatique toutes les 30 secondes` : 'Chargement des données de la période…'}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="admin-overview-days">Période des indicateurs</label>
                <select id="admin-overview-days" value={analyticsDays} onChange={(event) => { const days = Number(event.target.value); setAnalyticsDays(days); void fetchAnalytics(days); }} className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 sm:flex-none">
                  <option value={7}>7 derniers jours</option>
                  <option value={30}>30 derniers jours</option>
                  <option value={90}>90 derniers jours</option>
                </select>
                <button type="button" onClick={() => void fetchAnalytics(analyticsDays)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Actualiser les chiffres</button>
              </div>
            </div>
            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${adminRole === 'super_admin' ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
              {[
                { label: 'Boutiques actives', value: `${activeShopsCount}/${shops.length}`, comparison: `${shops.length ? Math.round((activeShopsCount / shops.length) * 100) : 0}% du réseau`, tone: 'border-emerald-100 bg-emerald-50' },
                ...(adminRole === 'super_admin' ? [{ label: 'Montant des commandes', value: analytics ? `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} F` : '—', comparison: analytics ? `${formatAudienceChange(analytics.totals.sales, analytics.previous.sales)} vs période précédente` : 'Chargement…', tone: 'border-sky-100 bg-sky-50' }] : []),
                { label: 'Commandes', value: analytics ? new Intl.NumberFormat('fr-FR').format(analytics.totals.orders) : '—', comparison: analytics ? `${formatAudienceChange(analytics.totals.orders, analytics.previous.orders)} vs période précédente` : 'Chargement…', tone: 'border-slate-200 bg-slate-50' },
                { label: 'Visites consenties', value: analytics ? new Intl.NumberFormat('fr-FR').format(analytics.totals.page_views) : '—', comparison: analytics ? `${formatAudienceChange(analytics.totals.page_views, analytics.previous.page_views)} vs période précédente` : 'Chargement…', tone: 'border-violet-100 bg-violet-50' },
                { label: 'Sessions uniques', value: analytics ? new Intl.NumberFormat('fr-FR').format(analytics.totals.unique_visitors) : '—', comparison: analytics ? `${formatAudienceChange(analytics.totals.unique_visitors, analytics.previous.unique_visitors)} vs période précédente` : 'Chargement…', tone: 'border-indigo-100 bg-indigo-50' },
              ].map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  className={`min-w-0 rounded-2xl border p-3 shadow-sm ${item.tone}`}
                >
                  <span className="block min-h-8 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] text-slate-600">{item.label}</span>
                  <span className="mt-2 block break-words text-lg font-black text-slate-900 sm:text-xl">{item.value}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-slate-500">{item.comparison}</span>
                </motion.div>
              ))}
            </div>
            {adminRole === 'super_admin' && (
              <section aria-label="Taux de conversion des visites en commandes" className="chart-panel px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Visites vers commandes</p>
                <strong className="mt-1 block text-2xl font-black text-[#0f4d3d]">{analytics ? `${analytics.totals.conversion_rate.toLocaleString('fr-FR')}%` : '—'}</strong>
                <p className="mt-1 text-xs text-slate-500">{analytics ? `${formatAudienceChange(analytics.totals.conversion_rate, analytics.previous.conversion_rate, true)} par rapport à la période précédente` : 'Chargement des données…'}</p>
              </section>
            )}
            {adminRole === 'super_admin' && <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-600">Les montants agrègent les commandes hors annulation et expiration : ce n’est pas un relevé des paiements réellement encaissés. Les visites ne comptent que les sessions ayant accepté les statistiques.</p>}
            {analytics && adminRole === 'super_admin' && (
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                <section aria-labelledby="admin-sales-chart-title" className="min-w-0 chart-panel p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 id="admin-sales-chart-title" className="text-sm font-black text-slate-900">Valeur des commandes par jour</h3><p className="mt-1 text-xs text-slate-500">{analytics.days} jours · commandes non annulées ni expirées</p></div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />Montant des commandes · FCFA</span>
                  </div>
                  {overviewDaily.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Aucune journée dans cette période.</p> : (
                    <>
                      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                        <div className="flex h-48 flex-col justify-between pt-6 pb-9 text-right text-[9px] tabular-nums text-slate-400">
                          {[1, 0.75, 0.5, 0.25, 0].map((ratio) => <span key={ratio} title={`${new Intl.NumberFormat('fr-FR').format(overviewChartMaxSales * ratio)} F`}>{new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(overviewChartMaxSales * ratio)} F</span>)}
                        </div>
                        <div className="relative h-48 min-w-0 rounded-xl border border-slate-200 bg-white px-1 py-1">
                          <svg role="img" aria-label={`Valeur des commandes en FCFA par jour sur ${analytics.days} jours`} viewBox="0 0 720 210" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                            {[32, 69.5, 107, 144.5, 182].map((y) => <line key={y} x1="24" x2="696" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />)}
                            {overviewSalesArea && <path d={overviewSalesArea} fill="url(#admin-sales-fill)" />}
                            <defs><linearGradient id="admin-sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#047857" stopOpacity="0.22" /><stop offset="100%" stopColor="#047857" stopOpacity="0.015" /></linearGradient></defs>
                            <polyline points={overviewSalesPoints} fill="none" stroke="#047857" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                            {overviewDaily.map((day, index) => <circle key={`sales-${day.date}`} cx={overviewChartX(index)} cy={overviewSalesY(day.sales)} r="2.2" fill="#047857"><title>{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR')} · {new Intl.NumberFormat('fr-FR').format(day.sales)} FCFA · {day.orders} commande{day.orders === 1 ? '' : 's'}</title></circle>)}
                          </svg>
                          <div className="absolute inset-x-2 bottom-1 flex justify-between text-[9px] tabular-nums text-slate-400">{overviewTickDays.map((day) => <span key={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>)}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[10px] text-slate-500">Montant total</span><strong className="mt-1 block text-sm tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} F</strong></div>
                        <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-[10px] text-slate-500">Commandes comptées</span><strong className="mt-1 block text-sm tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(analytics.totals.orders)}</strong></div>
                        <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 sm:col-span-1"><span className="block text-[10px] text-slate-500">Moyenne par commande</span><strong className="mt-1 block text-sm tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(analytics.totals.orders ? Math.round(analytics.totals.sales / analytics.totals.orders) : 0)} F</strong></div>
                      </div>
                      <details className="mt-3 rounded-xl border border-slate-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-slate-700">Voir les valeurs exactes par jour ({overviewDaily.length} jours)</summary>
                        <div className="max-h-64 overflow-auto border-t border-slate-200">
                          <table className="w-full min-w-[520px] text-left text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Commandes</th><th className="px-3 py-2 text-right">Valeur (FCFA)</th></tr></thead>
                            <tbody>{overviewDaily.map((day) => <tr key={day.date} className="border-t border-slate-100"><th scope="row" className="px-3 py-2 font-medium text-slate-700">{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</th><td className="px-3 py-2 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.orders)}</td><td className="px-3 py-2 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.sales)}</td></tr>)}</tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  )}
                </section>
                <section aria-labelledby="admin-top-shops-title" className="min-w-0 chart-panel p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 id="admin-top-shops-title" className="text-sm font-black text-slate-900">Boutiques par montant commandé</h3><p className="mt-1 text-xs text-slate-500">Classement sur la même période</p></div><button type="button" onClick={() => setAdminView('shops')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes</button></div>
                  {overviewTopShops.length === 0 || overviewTopShops.every((shop) => shop.sales === 0) ? <p className="py-6 text-sm text-slate-500">Aucun montant de commande sur cette période.</p> : <div className="mt-2 divide-y divide-slate-100">{overviewTopShops.filter((shop) => shop.sales > 0).map((shop, index) => <div key={shop.shop_id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-[10px] font-black text-emerald-800">{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{shop.shop_name}</p><p className="mt-1 text-[10px] text-slate-500">{shop.orders} commande{shop.orders === 1 ? '' : 's'} · {shop.unique_visitors} session{shop.unique_visitors === 1 ? '' : 's'} unique{shop.unique_visitors === 1 ? '' : 's'}</p></div></div><strong className="shrink-0 text-xs tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(shop.sales)} F</strong></div><div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.min(100, shop.sales / Math.max(1, overviewTopShops[0]?.sales || 1) * 100)}%` }} /></div></div>)}</div>}
                </section>
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-labelledby="admin-follow-up-title" className="min-w-0 chart-panel p-4 md:p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><h3 id="admin-follow-up-title" className="text-sm font-black text-slate-900">Dossiers à suivre</h3><p className="mt-1 text-xs text-slate-500">Vérifications nécessitant une revue.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{pendingVerificationShops.length}</span></div>
                {pendingVerificationShops.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucun dossier en attente.</p> : <div className="divide-y divide-slate-200">{pendingVerificationShops.slice(0, 5).map((shop) => <div key={shop.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{shop.name}</p><p className="mt-1 text-xs text-slate-500">{shop.merchant_verification_status === 'under_review' ? 'Revue en cours' : 'À examiner'} · {shop.whatsapp_number}</p></div><button type="button" onClick={() => focusVerificationShop(shop.id)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Ouvrir</button></div>)}</div>}
                {pendingVerificationShops.length > 5 && <button type="button" onClick={() => setAdminView('identity')} className="mt-2 text-xs font-bold text-sky-800 underline underline-offset-2">Voir les {pendingVerificationShops.length} dossiers</button>}
              </section>
              <section aria-labelledby="admin-recent-orders-title" className="min-w-0 chart-panel p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><h3 id="admin-recent-orders-title" className="text-sm font-black text-slate-900">Commandes récentes</h3><p className="mt-1 text-xs text-slate-500">Dernières demandes enregistrées.</p></div><button type="button" onClick={() => setAdminView('orders')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes les commandes</button></div>
                {adminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande enregistrée.</p> : <div className="divide-y divide-slate-200">{adminOrders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</p><p className="mt-1 truncate text-xs text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleDateString('fr-FR')}</p></div><div className="shrink-0 text-right">{adminRole === 'super_admin' && <strong className="block text-sm text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} F</strong>}<span className="text-[10px] font-semibold text-slate-500">{order.status}</span></div></div>)}</div>}
              </section>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3"><Activity className="h-5 w-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-bold text-slate-900">État du service</p><p className="text-xs text-slate-500">{adminHealth ? `${adminHealth.database === 'postgresql' ? 'PostgreSQL (Neon)' : 'SQLite'} · ${adminHealth.status === 'ok' ? 'Opérationnel' : adminHealth.status}` : 'Vérification en cours'}</p></div></div>
              <button type="button" onClick={() => setAdminView('operations')} className="min-h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Détails opérations</button>
            </div>
          </section>
        )}

        {adminView === 'orders' && (
          <section aria-labelledby="admin-orders-title" className="chart-panel p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 id="admin-orders-title" className="text-sm font-black text-slate-900">Gestion des commandes</h2><p className="mt-1 text-xs text-slate-500">{orderTotal} commande(s) correspondante(s), affichage par pages de 100.</p></div>
              <button type="button" onClick={() => exportOperationsCsv(`matable-commandes-${new Date().toISOString().slice(0, 10)}.csv`, adminRole === 'super_admin' ? ['ID', 'Boutique', 'Client', 'Téléphone', 'Montant', 'Statut', 'Date'] : ['ID', 'Boutique', 'Client', 'Téléphone', 'Statut', 'Date'], filteredAdminOrders.map(order => adminRole === 'super_admin' ? [order.id, order.shop_name, order.customer_name, order.customer_phone, order.total_amount, order.status, order.created_at] : [order.id, order.shop_name, order.customer_name, order.customer_phone, order.status, order.created_at]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Exporter CSV</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(0); }} placeholder="Rechercher boutique, client, téléphone ou numéro" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-700" /></label>
              <select value={orderStatusFilter} onChange={(event) => { setOrderStatusFilter(event.target.value); setOrderPage(0); }} aria-label="Filtrer les commandes par statut" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <option value="all">Tous les statuts</option>
                {['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {filteredAdminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande correspondante.</p> : filteredAdminOrders.map((order) => (
                <article key={order.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</h3><p className="mt-1 truncate text-xs text-slate-600">{order.customer_name} · {order.items_count} article(s)</p><p className="mt-1 text-xs text-slate-500">{order.customer_phone} · {new Date(order.created_at).toLocaleString('fr-FR')}</p></div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{order.status}</span>{adminRole === 'super_admin' && <strong className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} FCFA</strong>}
                    {adminOrderTransitions[order.status].length > 0 && (
                      <label className="sr-only" htmlFor={`order-status-${order.id}`}>Modifier le statut de la commande {order.id}</label>
                    )}
                    {adminOrderTransitions[order.status].length > 0 && (
                      <select id={`order-status-${order.id}`} defaultValue="" disabled={orderActionLoadingId === order.id} onChange={(event) => { const status = event.target.value as AdminOrder['status']; if (status) void updateOrderStatus(order, status); event.currentTarget.value = ''; }} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">
                        <option value="" disabled>Changer le statut…</option>
                        {adminOrderTransitions[order.status].map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" disabled={orderPage === 0} onClick={() => setOrderPage((page) => page - 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Précédent</button>
              <span className="text-xs text-slate-500">Page {orderPage + 1} / {Math.max(1, Math.ceil(orderTotal / 100))}</span>
              <button type="button" disabled={(orderPage + 1) * 100 >= orderTotal} onClick={() => setOrderPage((page) => page + 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Suivant</button>
            </div>
          </section>
        )}

        {adminView === 'customers' && (
          <section aria-labelledby="admin-customers-title" className="chart-panel p-4 md:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 id="admin-customers-title" className="text-sm font-black text-slate-900">Répertoire clients</h2><p className="mt-1 text-xs text-slate-500">{customerTotal} compte(s) · les commandes invités peuvent ne pas être liées à un compte.</p></div>
              <label className="relative block w-full sm:max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(0); }} placeholder="Rechercher nom, téléphone ou e-mail" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-700" /></label>
            </div>
            {customerLoading ? <p className="py-6 text-center text-sm text-slate-500">Chargement des clients…</p> : (
              <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
                {adminCustomers.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucun compte client correspondant.</p> : adminCustomers.map((customer) => (
                  <article key={customer.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.name || `Client #${customer.id}`}</h3><p className="mt-1 truncate text-xs text-slate-600">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p><p className="mt-1 text-xs text-slate-500">Inscrit le {new Date(customer.created_at).toLocaleDateString('fr-FR')} · {customer.is_active ? 'Compte actif' : 'Compte désactivé'}</p></div>
                    <div className="shrink-0 text-left sm:text-right"><strong className="block text-sm text-slate-900">{customer.orders_count} commande(s) liée(s)</strong>{adminRole === 'super_admin' && <span className="text-xs text-slate-500">Montant des commandes non annulées (non encaissé) : {new Intl.NumberFormat('fr-FR').format(customer.order_value)} FCFA</span>}</div>
                  </article>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" disabled={customerPage === 0} onClick={() => setCustomerPage((page) => page - 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Précédent</button>
              <span className="text-xs text-slate-500">Page {customerPage + 1} / {Math.max(1, Math.ceil(customerTotal / 100))}</span>
              <button type="button" disabled={(customerPage + 1) * 100 >= customerTotal} onClick={() => setCustomerPage((page) => page + 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Suivant</button>
            </div>
          </section>
        )}

        {adminView === 'audience' && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="chart-panel p-4 md:p-5"
        >
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
              <Activity className="w-5 h-5 text-rose-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Audience et acquisition</h2>
                <p className="text-[11px] text-slate-500 leading-4">Mesures agrégées pour comprendre d’où vient le trafic et quelles boutiques sont consultées.</p>
              </div>
            </div>
            <select
              value={analyticsDays}
              onChange={event => { const days = Number(event.target.value); setAnalyticsDays(days); fetchAnalytics(days); }}
              aria-label="Période d’audience"
              className="min-w-0 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none sm:w-auto"
            >
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
            </select>
            <button type="button" onClick={() => exportOperationsCsv(`matable-audience-${new Date().toISOString().slice(0, 10)}.csv`, ['Boutique', 'Pages vues consenties', 'Sessions distinctes', 'Commandes valides', 'Valeur des commandes FCFA', 'Commandes / sessions (%)'], filteredAudienceShops.map(shop => [shop.shop_name, shop.page_views, shop.unique_visitors, shop.orders, shop.sales, shop.conversion_rate]))} disabled={!filteredAudienceShops.length} className="inline-flex min-h-10 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 sm:w-auto sm:px-3">
              <Download className="h-4 w-4" />Exporter les boutiques filtrées
            </button>
          </div>

          {analytics ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {[
                  { label: 'Pages vues mesurées', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.page_views), detail: 'Même page, session et boutique : une fois par jour au plus', current: analytics.totals.page_views, previous: analytics.previous.page_views, icon: Eye, tone: 'text-slate-700' },
                  { label: 'Sessions distinctes', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.unique_visitors), detail: 'Navigations temporaires, pas des personnes identifiées', current: analytics.totals.unique_visitors, previous: analytics.previous.unique_visitors, icon: Users, tone: 'text-sky-700' },
                  { label: 'Commandes non annulées', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.orders), detail: 'Commandes annulées et expirées exclues', current: analytics.totals.orders, previous: analytics.previous.orders, icon: ShoppingBag, tone: 'text-emerald-700' },
                  { label: 'Montant des commandes', value: `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} FCFA`, detail: 'Montant demandé, pas un encaissement confirmé', current: analytics.totals.sales, previous: analytics.previous.sales, icon: DollarSign, tone: 'text-amber-700' },
                  { label: 'Commandes / sessions', value: `${analytics.totals.conversion_rate.toLocaleString('fr-FR')}%`, detail: 'Commandes ÷ sessions distinctes; pas une attribution de vente', current: analytics.totals.conversion_rate, previous: analytics.previous.conversion_rate, percentagePoints: true, icon: TrendingUp, tone: 'text-rose-700' },
                ].map(({ label, value, detail, current, previous, percentagePoints, icon: Icon, tone }) => (
                  <div key={label} className="metric-card p-3">
                    <Icon className={`w-4 h-4 ${tone} mb-3`} />
                    <span className="block min-h-8 text-xs font-semibold leading-4 text-slate-600">{label}</span>
                    <strong className="mt-1 block break-words text-lg tabular-nums text-slate-900">{value}</strong>
                    <span className="mt-1 block min-h-8 text-[10px] leading-4 text-slate-500">{detail}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-slate-500">{formatAudienceChange(current, previous, percentagePoints)} vs {analytics.days} jours précédents</span>
                  </div>
                ))}
              </div>

              <aside className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
                <strong>Comment lire ces chiffres ?</strong> Seules les pages vues enregistrées après consentement aux statistiques sont comptées. Les sessions utilisent un identifiant temporaire du navigateur : elles ne représentent pas des personnes uniques. Le ratio « commandes / sessions » rapproche deux totaux sur la période, mais ne prouve pas qu’une visite a généré une commande. Aucune liste de visiteurs identifiables n’est collectée ici.
              </aside>

              <div className="mt-5 grid lg:grid-cols-[1.2fr_1fr] gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-800">Pages vues consenties par jour</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">{analyticsDays} jours</span>
                  </div>
                  <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                    <div className="flex h-44 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-slate-500">
                      {[maxDailyViews, Math.round(maxDailyViews / 2), 0].map((value, index) => <span key={`${value}-${index}`}>{new Intl.NumberFormat('fr-FR').format(value)}</span>)}
                    </div>
                    <div className="chart-grid relative h-44 min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
                      <svg role="img" aria-label={`Pages vues consenties par jour, échelle de 0 à ${maxDailyViews}`} viewBox="0 0 420 160" className="h-full w-full">
                        <path d="M18 35H402 M18 82H402 M18 140H402" stroke="#e2e8e5" strokeWidth="1" />
                        <polyline fill="none" stroke="#176b55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartPoints} />
                        {analytics.daily.map((day, index) => {
                          const x = 18 + (index * (384 / Math.max(analytics.daily.length - 1, 1)));
                          const y = 140 - (day.page_views / maxDailyViews) * 96;
                          return <circle key={day.date} cx={x} cy={y} r="2.5" fill="#d58b42"><title>{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR')} · {day.page_views} page(s) vue(s)</title></circle>;
                        })}
                      </svg>
                      <div className="absolute inset-x-3 bottom-2 flex justify-between text-[9px] tabular-nums text-slate-500">
                        {analytics.daily.filter((_, index) => index % Math.max(1, Math.ceil(analytics.daily.length / 6)) === 0 || index === analytics.daily.length - 1).map((day) => (
                          <span key={day.date}>{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <h3 className="text-xs font-black text-slate-800">Origine des visites</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Origine du référent associé à chaque page vue; une navigation interne peut être comptée séparément. Aucune URL complète n’est conservée.</p>
                  <div className="mt-3 space-y-3">
                    {analytics.sources.length === 0 ? <p className="py-3 text-xs text-slate-500">Aucune visite consentie sur cette période.</p> : analytics.sources.map((source) => (
                      <div key={source.source}>
                        <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-700"><span>{audienceSourceLabels[source.source]}</span><span className="tabular-nums">{new Intl.NumberFormat('fr-FR').format(source.visits)} pages · {analytics.totals.page_views ? Math.round(source.visits / analytics.totals.page_views * 100) : 0}%</span></div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.min(100, (source.visits / Math.max(1, analytics.totals.page_views)) * 100)}%` }} /></div>
                        <div className="mt-1 text-[11px] text-slate-500">{new Intl.NumberFormat('fr-FR').format(source.visitors)} sessions distinctes · catégories de provenance, pas de personnes identifiées</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <details className="mt-5 rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">Détail quotidien des indicateurs ({analytics.daily.length} jours)</summary>
                <div className="max-h-80 overflow-auto border-t border-slate-200">
                  <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-600"><tr><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5 text-right">Pages vues consenties</th><th className="px-3 py-2.5 text-right">Sessions distinctes</th><th className="px-3 py-2.5 text-right">Commandes valides</th>{adminRole === 'super_admin' && <th className="px-3 py-2.5 text-right">Valeur des commandes (FCFA)</th>}</tr></thead>
                    <tbody>{analytics.daily.map((day) => <tr key={day.date} className="border-t border-slate-100"><th scope="row" className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700">{new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })}</th><td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.page_views)}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.unique_visitors)}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.orders)}</td>{adminRole === 'super_admin' && <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{new Intl.NumberFormat('fr-FR').format(day.sales)}</td>}</tr>)}</tbody>
                  </table>
                </div>
              </details>

              <section aria-labelledby="campaign-performance-title" className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 id="campaign-performance-title" className="text-xs font-black text-slate-800">Campagnes de partage</h3>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Les campagnes sont reconnues via ?src=nom ou ?utm_source=nom sur une visite consentie. Les commandes et clics WhatsApp sont associés à la campagne conservée au moment du parcours; cette association ne prouve pas qu’une campagne a causé une commande.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportOperationsCsv(`matable-campagnes-${new Date().toISOString().slice(0, 10)}.csv`, adminRole === 'super_admin' ? ['Campagne', 'Visites consenties', 'Sessions uniques', 'Commandes', 'Ventes FCFA', 'Clics WhatsApp'] : ['Campagne', 'Visites consenties', 'Sessions uniques', 'Commandes', 'Clics WhatsApp'], analytics.campaigns.map(({ campaign, visits, visitors, orders, sales, whatsapp_clicks }) => adminRole === 'super_admin' ? [campaign, visits, visitors, orders, sales, whatsapp_clicks] : [campaign, visits, visitors, orders, whatsapp_clicks]))}
                    disabled={!analytics.campaigns.length}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />Exporter
                  </button>
                </div>
                {analytics.campaigns.length === 0 ? <p className="py-3 text-xs text-slate-500">Aucune visite de campagne mesurée sur cette période.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                      <thead><tr className="border-y border-slate-200 text-[10px] uppercase text-slate-500"><th className="py-2 pr-3">Campagne</th><th className="px-3 py-2 text-right">Visites</th><th className="px-3 py-2 text-right">Sessions</th><th className="px-3 py-2 text-right">Commandes</th>{adminRole === 'super_admin' && <th className="px-3 py-2 text-right">Ventes</th>}<th className="py-2 pl-3 text-right">Clics WhatsApp</th></tr></thead>
                      <tbody>{analytics.campaigns.map(({ campaign, visits, visitors, orders, sales, whatsapp_clicks }) => (
                        <tr key={campaign} className="border-b border-slate-100"><th scope="row" className="py-2 pr-3 font-bold text-slate-800">{campaign}</th><td className="px-3 py-2 text-right text-slate-700">{visits}</td><td className="px-3 py-2 text-right text-slate-700">{visitors}</td><td className="px-3 py-2 text-right text-slate-700">{orders}</td>{adminRole === 'super_admin' && <td className="px-3 py-2 text-right text-slate-700">{new Intl.NumberFormat('fr-FR').format(sales)} F</td>}<td className="py-2 pl-3 text-right text-slate-700">{whatsapp_clicks}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>

              <div className="mt-5">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 className="text-sm font-black text-slate-800">Audience par boutique</h3><p className="mt-1 text-xs text-slate-600">{filteredAudienceShops.length} boutique(s) affichée(s) sur {analytics.by_shop.length}. « Commandes / sessions » est un ratio agrégé, pas un parcours attribué.</p></div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(200px,1fr)_200px]">
                    <label className="sr-only" htmlFor="audience-shop-search">Rechercher une boutique</label>
                    <input id="audience-shop-search" type="search" value={audienceShopSearch} onChange={(event) => setAudienceShopSearch(event.target.value)} placeholder="Filtrer par nom de boutique" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-700" />
                    <label className="sr-only" htmlFor="audience-shop-sort">Trier les boutiques</label>
                    <select id="audience-shop-sort" value={audienceShopSort} onChange={(event) => setAudienceShopSort(event.target.value as typeof audienceShopSort)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                      <option value="views">Trier : pages vues</option><option value="sessions">Trier : sessions</option><option value="orders">Trier : commandes</option>{adminRole === 'super_admin' && <option value="sales">Trier : valeur commandée</option>}<option value="conversion">Trier : commandes / sessions</option><option value="name">Trier : nom</option>
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead className="bg-slate-50"><tr className="border-b border-slate-200 text-[10px] uppercase text-slate-600"><th className="px-3 py-3">Boutique</th><th className="px-3 py-3 text-right">Pages vues</th><th className="px-3 py-3 text-right">Sessions</th><th className="px-3 py-3 text-right">Commandes valides</th>{adminRole === 'super_admin' && <th className="px-3 py-3 text-right">Valeur commandée (FCFA)</th>}<th className="px-3 py-3 text-right">Commandes / sessions</th></tr></thead>
                    <tbody>{filteredAudienceShops.length === 0 ? <tr><td colSpan={adminRole === 'super_admin' ? 6 : 5} className="px-3 py-8 text-center text-sm text-slate-500">Aucune boutique ne correspond à cette recherche.</td></tr> : filteredAudienceShops.map((shop) => <tr key={shop.shop_id} className="border-b border-slate-100 text-slate-700 last:border-0"><th scope="row" className="px-3 py-3 font-bold">{shop.shop_name}</th><td className="px-3 py-3 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(shop.page_views)}</td><td className="px-3 py-3 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(shop.unique_visitors)}</td><td className="px-3 py-3 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(shop.orders)}</td>{adminRole === 'super_admin' && <td className="px-3 py-3 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(shop.sales)}</td>}<td className="px-3 py-3 text-right font-bold tabular-nums">{shop.conversion_rate.toLocaleString('fr-FR')}%</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Chargement des données d’audience…</p>
          )}
        </motion.section>
        )}

        {adminView === 'finance' && adminRole === 'super_admin' && (
          <section aria-labelledby="admin-finance-title" className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase text-emerald-800">Recettes MaTable.ci</p><h2 id="admin-finance-title" className="mt-1 text-xl font-black text-slate-900">Argent</h2><p className="mt-1 text-xs text-slate-500">MRR estimé des abonnements au statut actif : paiement annuel réparti sur 12 mois, tarif catalogue utilisé si aucun paiement n’est enregistré. Les encaissements ne comptent que les confirmations KadevPay.</p></div>
              <select aria-label="Période du journal financier" value={financeDays} onChange={(event) => { setFinanceDays(Number(event.target.value)); setFinancePaymentsPage(0); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <option value={30}>30 derniers jours</option>
                <option value={90}>90 derniers jours</option>
                <option value={180}>180 derniers jours</option>
                <option value={365}>365 derniers jours</option>
              </select>
            </div>
            {!finance ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Chargement des données financières…</p> : <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-900">MRR estimé</p><p className="mt-1 text-2xl font-black text-emerald-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.mrr)} FCFA / mois</p><p className="mt-1 text-xs text-emerald-800">{finance.summary.active_subscriptions} abonnement(s) payants · {finance.summary.mrr_estimated_subscriptions} estimation(s) au tarif catalogue</p></article>
                <article className="rounded-lg border border-sky-100 bg-sky-50 p-4"><p className="text-xs font-semibold text-sky-900">Encaissements période</p><p className="mt-1 text-2xl font-black text-sky-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.collected_amount)} FCFA</p><p className="mt-1 text-xs text-sky-800">{finance.summary.confirmed_count} paiement(s) confirmé(s)</p></article>
                <article className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-900">Revenus promotions</p><p className="mt-1 text-2xl font-black text-amber-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.promotions.amount)} FCFA</p><p className="mt-1 text-xs text-amber-800">{finance.summary.promotions.count} paiement(s)</p></article>
                <article className="rounded-lg border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-900">Paiements à vérifier</p><p className="mt-1 text-2xl font-black text-rose-950">{finance.summary.failed_count + finance.summary.expired_count + finance.summary.refunded_count + finance.summary.past_due_subscriptions}</p><p className="mt-1 text-xs text-rose-800">{finance.summary.failed_count} échec(s) · {finance.summary.expired_count} expiré(s) · {finance.summary.refunded_count} remboursement(s) · {finance.summary.past_due_subscriptions} abonnement(s) en retard</p></article>
              </div>

              <section className="border-y border-slate-200 py-4" aria-label="MRR par formule">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black text-slate-900">MRR estimé par formule</h3><p className="mt-1 text-xs text-slate-500">Paiements annuels divisés par 12 ; à défaut, prix mensuel catalogue.</p></div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {finance.summary.mrr_by_tier.map((tier) => <div key={tier.tier} className="min-w-24"><p className="text-xs font-semibold capitalize text-slate-500">{tier.tier} · {tier.count}</p><p className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(tier.amount)} F</p></div>)}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-slate-500">Essais actifs</p><strong className="text-slate-900">{finance.summary.active_trials}</strong></div>
                  <div><p className="text-xs text-slate-500">Fin sous 7 jours</p><strong className="text-slate-900">{finance.summary.trials_expiring_7d}</strong></div>
                  <div><p className="text-xs text-slate-500">Essais terminés</p><strong className="text-slate-900">{finance.summary.completed_trials}</strong></div>
                  <div><p className="text-xs text-slate-500">Conversion des essais terminés</p><strong className="text-slate-900">{finance.summary.converted_trials}/{finance.summary.completed_trials} boutiques · {finance.summary.trial_conversion_rate}%</strong></div>
                </div>
              </section>

              <section aria-labelledby="admin-payments-list-title" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 id="admin-payments-list-title" className="text-sm font-black text-slate-900">Journal des paiements</h3><p className="mt-1 text-xs text-slate-500">{finance.payment_count.toLocaleString('fr-FR')} transaction(s) correspondant aux filtres sur {finance.days} jours.</p></div>
                  <button type="button" disabled={filteredFinancePayments.length === 0} onClick={() => exportOperationsCsv(`matable-paiements-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Boutique', 'Type', 'Formule', 'Durée', 'Montant', 'Devise', 'Statut', 'Référence'], filteredFinancePayments.map((payment) => [payment.paid_at || payment.created_at, payment.shop_name, payment.payment_type === 'promotion' ? 'Promotion' : 'Abonnement', payment.tier, payment.subscription_term, payment.amount, payment.currency, payment.status, payment.provider_reference || payment.id]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" />Exporter la page filtrée</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px_180px]">
                  <input type="search" value={paymentSearch} onChange={(event) => { setPaymentSearch(event.target.value); setFinancePaymentsPage(0); }} placeholder="Rechercher boutique ou référence" aria-label="Rechercher un paiement" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700" />
                  <select aria-label="Filtrer par type de paiement" value={paymentTypeFilter} onChange={(event) => { setPaymentTypeFilter(event.target.value); setFinancePaymentsPage(0); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"><option value="all">Tous les types</option><option value="subscription">Abonnements</option><option value="promotion">Promotions</option></select>
                  <select aria-label="Filtrer par statut de paiement" value={paymentStatusFilter} onChange={(event) => { setPaymentStatusFilter(event.target.value); setFinancePaymentsPage(0); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"><option value="all">Tous les statuts</option><option value="paid">Confirmés</option><option value="pending">En attente</option><option value="failed">Échecs</option><option value="expired">Expirés</option><option value="cancelled">Annulés</option><option value="refunded">Remboursés</option></select>
                </div>
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {filteredFinancePayments.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Aucun paiement correspondant à ces filtres.</p> : filteredFinancePayments.map((payment) => {
                    const isPaid = payment.status === 'paid';
                    const isPending = payment.status === 'pending';
                    const statusLabel = isPaid ? 'Confirmé' : isPending ? 'En attente' : payment.status === 'expired' ? 'Expiré' : payment.status === 'refunded' ? 'Remboursé' : payment.status === 'cancelled' ? 'Annulé' : 'Échec';
                    return <article key={payment.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{payment.shop_name} · {payment.payment_type === 'promotion' ? 'Promotion' : `Abonnement ${payment.tier} ${payment.subscription_term === 'annual' ? 'annuel' : 'mensuel'}`}</h4><p className="mt-1 truncate text-xs text-slate-500">{payment.provider_reference || payment.id}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.paid_at || payment.created_at))}</p></div>
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isPaid ? 'bg-emerald-100 text-emerald-900' : isPending ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>{statusLabel}</span><strong className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(payment.amount)} {payment.currency}</strong></div>
                    </article>;
                  })}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">Page {financePaymentsPage + 1} · {Math.min(finance.payment_limit, Math.max(0, finance.payment_count - finance.payment_offset))} ligne(s) affichée(s)</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFinancePaymentsPage((page) => Math.max(0, page - 1))} disabled={financePaymentsPage === 0} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Précédent</button>
                    <button type="button" onClick={() => setFinancePaymentsPage((page) => page + 1)} disabled={(financePaymentsPage + 1) * finance.payment_limit >= finance.payment_count} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Suivant</button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">Les promotions restent à zéro tant que leur tarif et leur parcours de paiement ne sont pas activés. Les remboursements ne sont comptés que si leur statut est remonté au journal.</p>
              </section>
            </>}
          </section>
        )}

        {adminView === 'subscriptions' && adminRole === 'super_admin' && (
          <section aria-labelledby="admin-subscriptions-title" className="space-y-5">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-800">Revenus récurrents</p>
                <h2 id="admin-subscriptions-title" className="mt-1 text-xl font-black text-slate-900">Abonnements</h2>
                <p className="mt-1 text-xs text-slate-500">{subscriptions?.summary.whatsapp_reminders_enabled ? `Rappels automatiques configurés à J−14, J−7, J−3 et J−1 · consentement enregistré pour ${subscriptions.summary.whatsapp_reminder_opt_ins} boutique(s). Les relances ouvertes ici restent à valider dans WhatsApp.` : 'API WhatsApp non configurée : aucun rappel automatique ne part. Une relance manuelle ouvre WhatsApp et nécessite le consentement du commerçant.'}</p>
              </div>
              <button type="button" onClick={() => void fetchSubscriptions()} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Actualiser</button>
            </header>

            {!subscriptions ? <p role="status" className="border-y border-slate-200 py-6 text-sm text-slate-500">Chargement des abonnements…</p> : <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="border-l-2 border-emerald-600 pl-3"><p className="text-xs text-slate-500">MRR estimé</p><strong className="text-lg font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(subscriptions.summary.mrr)} F / mois</strong><p className="mt-1 text-[11px] text-slate-500">{subscriptions.summary.mrr_estimated_subscriptions} au tarif catalogue faute de paiement enregistré</p></div>
                <div className="border-l-2 border-sky-600 pl-3"><p className="text-xs text-slate-500">Abonnements payants</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_subscriptions}</strong></div>
                <div className="border-l-2 border-amber-500 pl-3"><p className="text-xs text-slate-500">Essais actifs · fin sous 7 j</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_trials} · {subscriptions.summary.trials_expiring_7d}</strong></div>
                <div className="border-l-2 border-rose-600 pl-3"><p className="text-xs text-slate-500">Conversion des essais terminés</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.converted_trials}/{subscriptions.summary.completed_trials} boutiques · {subscriptions.summary.trial_conversion_rate}%</strong><p className="mt-1 text-[11px] text-slate-500">Paiement confirmé après le début de l’essai, parmi les essais échus.</p></div>
              </div>
              <section aria-labelledby="weekly-activity-title" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <h3 id="weekly-activity-title" className="text-sm font-black text-slate-900">Activité des 7 derniers jours</h3>
                  <p className="mt-1 text-xs text-slate-500">Sur 7 jours : visiteurs distincts mesurés, boutiques créées et clics WhatsApp suivis. Les visiteurs dépendent du consentement statistique.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Visiteurs</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.unique_visitors}</strong></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Boutiques créées</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.shops_created}</strong></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Clics WhatsApp</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.whatsapp_clicks}</strong></div>
                </div>
              </section>

              {inconsistentTrialExpiries.length > 0 && <section aria-labelledby="trial-expiry-integrity-title" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <h3 id="trial-expiry-integrity-title" className="text-sm font-black text-amber-950">Échéances d’essai à corriger</h3>
                    <p className="mt-1 text-xs text-amber-900">La date d’expiration technique diffère de la fin d’essai. Synchronisez-la pour que l’accès et la période de grâce suivent la bonne échéance.</p>
                    <div className="mt-3 divide-y divide-amber-200">
                      {inconsistentTrialExpiries.map((shop) => (
                        <article key={shop.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-amber-950">{shop.name}</h4>
                            <p className="mt-1 text-xs text-amber-900">Fin d’essai : {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'non définie'} · Expiration enregistrée : {shop.subscription_expires_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.subscription_expires_at)) : 'non définie'}</p>
                          </div>
                          <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleReconcileTrialExpiry(shop)} className="min-h-9 shrink-0 rounded-lg border border-amber-700 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50">Synchroniser l’échéance</button>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </section>}

              {subscriptions.shops.some((shop) => shop.status === 'active' && !shop.subscription_expires_at) && <section aria-labelledby="missing-subscription-expiry-title" className="rounded-xl border border-rose-300 bg-rose-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                  <div className="min-w-0 flex-1">
                    <h3 id="missing-subscription-expiry-title" className="text-sm font-black text-rose-950">Abonnements actifs sans échéance</h3>
                    <p className="mt-1 text-xs text-rose-900">Vérifiez une preuve de paiement ou l’historique avant de corriger ces comptes. Aucune date ne peut être déduite automatiquement.</p>
                    <div className="mt-3 divide-y divide-rose-200">
                      {subscriptions.shops.filter((shop) => shop.status === 'active' && !shop.subscription_expires_at).map((shop) => (
                        <article key={shop.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-rose-950">{shop.name}</h4>
                            <p className="mt-1 text-xs text-rose-900">Compte #{shop.id} · formule {shop.plan} · échéance non définie</p>
                          </div>
                          <span className="text-xs font-bold text-rose-800">Vérification manuelle requise</span>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </section>}

              <section aria-labelledby="trials-expiring-title" className="border-y border-amber-200 py-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 id="trials-expiring-title" className="text-sm font-black text-slate-900">Essais à relancer</h3><p className="mt-1 text-xs text-slate-500">Essais qui finissent dans les 7 jours. Une relance ouvre WhatsApp sans envoyer le message. Chaque essai peut être prolongé de 30 jours maximum au total.</p></div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Prolonger de
                    <select aria-label="Durée de prolongation d’essai" value={trialExtensionDays} onChange={(event) => setTrialExtensionDays(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
                      {trialExtensionOptions.map((days) => <option key={days} value={days}>{days} jours</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 divide-y divide-amber-100">
                  {expiringTrials.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun essai n’expire sous 7 jours.</p> : expiringTrials.map((shop) => (
                    <article key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{shop.name}</h4><p className="mt-1 text-xs text-slate-500">{shop.plan} · {shop.trial_days_remaining} jour(s) restant(s) · fin le {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'date inconnue'} · prolongation : {shop.trial_extension_days_used}/30 jours{shop.trial_extension_over_limit ? ' — dépassement historique à vérifier' : `, ${shop.trial_extension_days_remaining} jour(s) autorisé(s) restant(s)`}</p></div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.whatsapp_reminders_opt_in ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Relancer WhatsApp</button> : <span className="self-center text-xs text-slate-500">Consentement WhatsApp requis</span>}
                        <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_over_limit || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Clock className="h-3.5 w-3.5" />{shop.trial_extension_over_limit ? 'Dépassement à vérifier' : shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : trialExtensionDays > shop.trial_extension_days_remaining ? `Maximum ${shop.trial_extension_days_remaining} j` : `Prolonger de ${trialExtensionDays} j`}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section aria-labelledby="subscription-list-title" className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 id="subscription-list-title" className="text-sm font-black text-slate-900">Toutes les boutiques</h3><p className="mt-1 text-xs text-slate-500">État de l’abonnement et accès de la boutique sont affichés séparément.</p></div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px]">
                    <input type="search" value={subscriptionSearch} onChange={(event) => setSubscriptionSearch(event.target.value)} placeholder="Rechercher une boutique…" aria-label="Rechercher un abonnement" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700" />
                    <select aria-label="Filtrer les abonnements par statut" value={subscriptionStatusFilter} onChange={(event) => setSubscriptionStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                      <option value="all">Tous les statuts</option><option value="trialing">Essai actif</option><option value="active">Payé</option><option value="expired">Expiré</option><option value="past_due">En période de grâce</option><option value="suspended">Accès abonnement suspendu</option><option value="not_started">Non démarré</option>
                    </select>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {filteredSubscriptions.length === 0 ? <p className="py-6 text-sm text-slate-500">Aucun abonnement ne correspond à ces critères.</p> : filteredSubscriptions.map((shop) => {
                    const canExtendTrial = shop.can_extend_trial;
                    const statusTone = shop.status === 'active' ? 'bg-emerald-100 text-emerald-900'
                      : shop.status === 'trialing' ? 'bg-sky-100 text-sky-900'
                        : shop.status === 'past_due' || shop.status === 'expired' ? 'bg-amber-100 text-amber-950'
                          : 'bg-slate-100 text-slate-700';
                    return <article key={shop.id} className="flex flex-col gap-3 py-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{shop.name}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">{shop.plan}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone}`}>{subscriptionStatusLabels[shop.status] || shop.status}</span>{!shop.is_active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">Boutique désactivée</span>}</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{shop.whatsapp_number}</span><span>{shop.products_count} article(s)</span><span>{shop.orders_count} commande(s)</span><span>{shop.publication_status === 'active' ? 'Publication active' : shop.publication_status === 'suspended' ? 'Publication suspendue' : 'Brouillon non publié'}</span><span>{shop.whatsapp_reminders_opt_in ? 'Consentement aux rappels WhatsApp donné' : 'Pas de consentement WhatsApp'}</span><span>Inscrite le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.created_at))}</span></div>
                        <p className="mt-1 text-xs text-slate-500">{shop.status === 'trialing' ? 'Fin d’essai' : shop.status === 'active' ? 'Prochain renouvellement' : 'Échéance de l’abonnement'} : {shop.next_renewal_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.next_renewal_at)) : 'Non définie'}{shop.trial_start ? ` · Prolongation cumulée : ${shop.trial_extension_days_used}/30 jours${shop.trial_extension_over_limit ? ' — dépassement historique à vérifier' : `, ${shop.trial_extension_days_remaining} jour(s) autorisé(s) restant(s)`}` : ''} · Dernière commande : {shop.last_order_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.last_order_at)) : 'aucune'}</p>
                        {shop.status === 'active' && <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(150px,190px)_minmax(180px,1fr)_auto]">
                          <label className="text-[10px] font-bold text-slate-600">Nouvelle date de fin d’accès
                            <input
                              type="date"
                              aria-label={`Nouvelle échéance de ${shop.name}`}
                              value={expiryDrafts[shop.id]?.date ?? shop.subscription_expires_at?.slice(0, 10) ?? ''}
                              onChange={(event) => setExpiryDrafts((previous) => ({
                                ...previous,
                                [shop.id]: { date: event.target.value, reason: previous[shop.id]?.reason ?? '' },
                              }))}
                              className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                            />
                          </label>
                          <label className="text-[10px] font-bold text-slate-600">Motif et référence du paiement vérifié
                            <input
                              type="text"
                              maxLength={500}
                              aria-label={`Motif de correction de la date d’accès pour ${shop.name}`}
                              placeholder="Ex. reçu vérifié du 20/10, période payée jusqu’au…"
                              value={expiryDrafts[shop.id]?.reason ?? ''}
                              onChange={(event) => setExpiryDrafts((previous) => ({
                                ...previous,
                                [shop.id]: { date: previous[shop.id]?.date ?? shop.subscription_expires_at?.slice(0, 10) ?? '', reason: event.target.value },
                              }))}
                              className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={subscriptionActionShopId === shop.id || !expiryDrafts[shop.id]?.date || (expiryDrafts[shop.id]?.reason.trim().length ?? 0) < 10}
                            onClick={() => void handleSetSubscriptionExpiry(shop)}
                            className="self-end min-h-9 rounded-md bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            Enregistrer la date
                          </button>
                        </div>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.status === 'trialing' && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7 && shop.whatsapp_reminders_opt_in && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="min-h-9 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">Ouvrir WhatsApp</button>}
                        {canExtendTrial && <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_over_limit || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{shop.trial_extension_over_limit ? 'Dépassement à vérifier' : shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : trialExtensionDays > shop.trial_extension_days_remaining ? `Maximum ${shop.trial_extension_days_remaining} j` : `Prolonger de ${trialExtensionDays} j`}</button>}
                        <button type="button" onClick={() => void handleToggleActive(shop.id)} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold ${shop.is_active ? 'border-rose-200 text-rose-800 hover:bg-rose-50' : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>{shop.is_active ? 'Désactiver boutique' : 'Réactiver boutique'}</button>
                      </div>
                    </article>;
                  })}
                </div>
              </section>

              <section aria-labelledby="subscription-audit-title" className="border-t border-slate-200 pt-4">
                <h3 id="subscription-audit-title" className="text-sm font-black text-slate-900">Actions administratives récentes</h3>
                {subscriptions.audit_logs.length === 0 ? <p className="mt-2 text-xs text-slate-500">Les actions d’administration apparaîtront ici.</p> : <div className="mt-2 divide-y divide-slate-200">
                {subscriptions.audit_logs.slice(0, 8).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><div><span className="font-semibold text-slate-800">{entry.action === 'subscription_reminder_sent' ? `Rappel WhatsApp envoyé J−${getReminderLeadDays(entry.details) ?? '?'}` : entry.action === 'subscription_reminder_failed' ? `Échec du rappel WhatsApp J−${getReminderLeadDays(entry.details) ?? '?'}` : adminAuditActionLabels[entry.action] || 'Action administrative'} · {entry.shop_name || 'Boutique supprimée'}</span>{getAdminAuditReason(entry.details) && <p className="mt-1 text-slate-500">Motif : {getAdminAuditReason(entry.details)}</p>}{entry.action === 'subscription_reminder_failed' && getReminderFailure(entry.details) && <p className="mt-1 text-rose-700">Erreur fournisseur : {getReminderFailure(entry.details)}</p>}</div><time className="text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.created_at))}</time></div>)}
                </div>}
              </section>
            </>}
          </section>
        )}

        {adminView === 'operations' && (
        <section className="chart-panel p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Centre opérationnel</h2>
                <p className="text-[11px] text-slate-500">État du service, stockage et outils de contact propriétaire.</p>
              </div>
            </div>
            <button type="button" onClick={() => void fetchOperations()} disabled={operationsLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${operationsLoading ? 'animate-spin' : ''}`} /> Actualiser
            </button>
          </div>

          {operationsError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{operationsError}</p>}
          {adminHealth ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <div className={`rounded-2xl border p-3 ${adminHealth.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <span className={`text-[10px] font-bold ${adminHealth.status === 'ok' ? 'text-emerald-700' : 'text-rose-800'}`}>Service</span>
                <strong className={`mt-1 block text-sm ${adminHealth.status === 'ok' ? 'text-emerald-900' : 'text-rose-900'}`}>{adminHealth.status === 'ok' ? 'Opérationnel' : `À vérifier · ${adminHealth.status}`}</strong>
              </div>
              <div className={`rounded-2xl border p-3 ${adminHealth.database === 'postgresql' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <span className={`text-[10px] font-bold ${adminHealth.database === 'postgresql' ? 'text-emerald-700' : 'text-amber-800'}`}>Base de données</span>
                <strong className={`mt-1 block text-sm ${adminHealth.database === 'postgresql' ? 'text-emerald-950' : 'text-amber-950'}`}>{adminHealth.database === 'sqlite' ? 'SQLite (local)' : adminHealth.database === 'postgresql' ? 'PostgreSQL' : adminHealth.database}</strong>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-bold text-sky-700">Boutiques</span><strong className="mt-1 block text-sm text-sky-900">{adminHealth.counts.shops}</strong></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-bold text-sky-700">Produits</span><strong className="mt-1 block text-sm text-sky-900">{adminHealth.counts.products}</strong></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-bold text-sky-700">Commandes</span><strong className="mt-1 block text-sm text-sky-900">{adminHealth.counts.orders}</strong></div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600" role="status">
              {operationsLoading ? 'Chargement de l’état du service…' : 'État du service indisponible. Utilisez « Actualiser » pour réessayer.'}
            </p>
          )}

          {adminRole === 'super_admin' && <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${maintenanceMode?.enabled ? 'text-amber-700' : 'text-slate-500'}`} />
                  <h3 className="text-sm font-black text-slate-900">Mode maintenance</h3>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${maintenanceMode?.enabled ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                    {maintenanceMode?.enabled ? 'Activé' : 'Désactivé'}
                  </span>
                  {maintenanceMode && (maintenanceEnabledDraft !== maintenanceMode.enabled || maintenanceMessageDraft !== maintenanceMode.message) && <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-900">Modifications non enregistrées</span>}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">Le site marchand et ses API seront suspendus. L’administration, les contrôles de santé et les webhooks de paiement resteront accessibles.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <span className="text-xs font-semibold text-slate-700">Activer le mode</span>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Activer le mode maintenance"
                    aria-checked={maintenanceEnabledDraft}
                    onClick={() => setMaintenanceEnabledDraft((enabled) => !enabled)}
                    disabled={maintenanceSaving || !maintenanceMode}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${maintenanceEnabledDraft ? 'bg-amber-700' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${maintenanceEnabledDraft ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <button type="button" onClick={saveMaintenanceMode} disabled={maintenanceSaving || !maintenanceMode || (maintenanceEnabledDraft === maintenanceMode.enabled && maintenanceMessageDraft === maintenanceMode.message)} className={`inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${maintenanceEnabledDraft ? 'bg-amber-800 hover:bg-amber-900' : 'bg-emerald-800 hover:bg-emerald-900'}`}>
                  {maintenanceSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {maintenanceSaving ? 'Enregistrement…' : maintenanceEnabledDraft !== maintenanceMode?.enabled ? maintenanceEnabledDraft ? 'Activer la maintenance' : 'Désactiver la maintenance' : 'Enregistrer le message'}
                </button>
              </div>
            </div>
            <label className="mt-3 block text-xs font-bold text-slate-700" htmlFor="admin-maintenance-message">Message affiché aux visiteurs</label>
            <textarea id="admin-maintenance-message" value={maintenanceMessageDraft} maxLength={240} onChange={(event) => setMaintenanceMessageDraft(event.target.value)} rows={2} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-700" />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Ce message sera aussi renvoyé aux API publiques.</span><span>{maintenanceMessageDraft.length}/240</span></div>
          </div>}

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-xs font-black text-emerald-950">Notifier un propriétaire</h3>
                <p className="text-[11px] text-emerald-800">Choisissez un message prédéfini. WhatsApp s’ouvre avec le texte personnalisé prêt à envoyer.</p>
              </div>
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <select value={notificationShopId} onChange={(event) => setNotificationShopId(event.target.value)} className="min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <option value="">Choisir une boutique</option>
                {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
              </select>
              <select value={notificationTemplate} onChange={(event) => setNotificationTemplate(event.target.value as typeof notificationTemplate)} className="min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                {ownerNotificationTemplates.filter((template) => adminRole === 'super_admin' || template.id !== 'trial_expiring').map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
              <button type="button" onClick={prepareOwnerNotification} disabled={notificationLoading || !notificationShopId} className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> {notificationLoading ? 'Préparation...' : 'Ouvrir WhatsApp'}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-black text-amber-950">Campagne : boutiques en veille pour vérification d’identité</h3>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-amber-900">
                  {identityVerificationCandidates.length} boutique(s) non vérifiée(s) et non publiée(s). Les messages WhatsApp seront préparés un par un : vous devrez vérifier et envoyer chacun d’eux manuellement.
                </p>
                {identityVerificationCandidates.length > 0 && identityVerificationCandidates.length > identityCampaignShopIds.length && (
                  <p className="mt-1 text-[11px] text-amber-800">
                    {identityVerificationCandidates.filter((shop) => !/^\d{8,15}$/.test(String(shop.whatsapp_number || '').replace(/\D/g, ''))).length} sans numéro WhatsApp valide et ignorée(s).
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={startIdentityCampaign}
                disabled={identityVerificationCandidates.length === 0 || identityCampaignLoading}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" /> Préparer la campagne
              </button>
            </div>
            <label htmlFor="admin-identity-campaign-message" className="mt-3 block text-xs font-bold text-amber-950">Message commun ({'{boutique}'} et {'{dashboard}'} seront remplacés automatiquement)</label>
            <textarea
              id="admin-identity-campaign-message"
              value={identityCampaignMessage}
              maxLength={2000}
              rows={4}
              onChange={(event) => setIdentityCampaignMessage(event.target.value)}
              className="mt-1 min-h-24 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-600"
            />
            {identityCampaignShopIds.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 pt-3">
                <p className="text-xs font-semibold text-amber-950" aria-live="polite">
                  {identityCampaignRecipient
                    ? `Destinataire ${identityCampaignIndex + 1}/${identityCampaignRecipients.length} : ${identityCampaignRecipient.name}. ${identityCampaignIndex} message(s) préparé(s), envoi non confirmé.`
                    : `${identityCampaignRecipients.length} message(s) préparé(s). La campagne est terminée ; l’envoi reste à confirmer dans WhatsApp.`}
                </p>
                {identityCampaignRecipient ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIdentityCampaignIndex((index) => index + 1)}
                      disabled={identityCampaignLoading}
                      className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Passer ce destinataire
                    </button>
                    <button
                      type="button"
                      onClick={() => void prepareNextIdentityCampaignMessage()}
                      disabled={identityCampaignLoading}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" /> {identityCampaignLoading ? 'Préparation…' : 'Ouvrir le prochain WhatsApp'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setIdentityCampaignShopIds([]); setIdentityCampaignIndex(0); }}
                    className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950"
                  >
                    Fermer la campagne
                  </button>
                )}
              </div>
            )}
          </div>

        </section>
        )}

        {adminView === 'moderation' && (
          <section aria-labelledby="admin-moderation-title" className="space-y-5">
            <div><h2 id="admin-moderation-title" className="text-xl font-black text-slate-900">Avis & signalements</h2><p className="mt-1 text-sm text-slate-600">Les avis restent invisibles au public jusqu’à leur validation.</p></div>
            {contentModerationError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{contentModerationError}</p>}
            <section className="chart-panel p-4 md:p-5">
              <h3 className="text-sm font-black text-slate-900">Avis à modérer ({contentModeration.reviews.length})</h3>
              <div className="mt-3 divide-y divide-slate-200">
                {contentModeration.reviews.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun avis en attente.</p> : contentModeration.reviews.map((review) => (
                  <article key={review.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-slate-900">{review.target_type === 'shop' ? review.shop_name : review.product_title || review.shop_name} · {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p><p className="mt-1 text-xs text-slate-500">{review.customer_name || 'Client'} · {new Date(review.created_at).toLocaleString('fr-FR')}</p></div>
                      <div className="flex gap-2"><button type="button" onClick={() => void moderateContent('reviews', review.id, 'approved')} className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Publier</button><button type="button" onClick={() => void moderateContent('reviews', review.id, 'hidden')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">Masquer</button></div>
                    </div>
                    {review.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.comment}</p>}
                  </article>
                ))}
              </div>
            </section>
            <section className="chart-panel p-4 md:p-5">
              <h3 className="text-sm font-black text-slate-900">Signalements ouverts ({contentModeration.reports.length})</h3>
              <div className="mt-3 divide-y divide-slate-200">
                {contentModeration.reports.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun signalement ouvert.</p> : contentModeration.reports.map((report) => (
                  <article key={report.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-slate-900">{report.target_type === 'shop' ? report.shop_name : report.product_title || report.shop_name} · {report.reason}</p><p className="mt-1 text-xs text-slate-500">{report.customer_name || 'Client'} · {new Date(report.created_at).toLocaleString('fr-FR')} · {report.status === 'in_review' ? 'En cours' : 'Nouveau'}</p></div>
                      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void moderateContent('reports', report.id, 'in_review')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">Prendre en charge</button><button type="button" onClick={() => void moderateContent('reports', report.id, 'resolved')} className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white">Traité</button><button type="button" onClick={() => void moderateContent('reports', report.id, 'dismissed')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">Sans suite</button></div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.details || 'Aucun détail supplémentaire.'}</p>
                  </article>
                ))}
              </div>
            </section>
          </section>
        )}

        {adminView === 'identity' && (
        <AdminIdentityVerificationPanel
          selectedShopId={selectedVerificationShopId}
          requestingShopId={verificationRequestShopId}
          onRequestVerification={(shopId) => void requestOwnerIdentityVerification(shopId)}
        />
        )}

        {adminView === 'verification-shops' && adminRole === 'verification_admin' && (
          <section aria-labelledby="verification-shops-title" className="chart-panel space-y-4 p-4 md:p-5">
            <header>
              <h2 id="verification-shops-title" className="text-lg font-black text-slate-900">Boutiques · consultation seule</h2>
              <p className="mt-1 text-sm text-slate-600">Consultez les informations nécessaires au suivi d’identité. Les coordonnées privées et les paramètres commerciaux ne sont pas affichés.</p>
            </header>
            <label className="relative block">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input type="search" value={verificationShopSearch} onChange={(event) => setVerificationShopSearch(event.target.value)} placeholder="Rechercher par boutique ou commune" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-700" />
            </label>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {verificationShops.filter((shop) => `${shop.name} ${shop.city || ''}`.toLocaleLowerCase('fr').includes(verificationShopSearch.trim().toLocaleLowerCase('fr'))).map((shop) => (
                <article key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-900">{shop.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{[shop.city, shop.category].filter(Boolean).join(' · ') || 'Localisation non renseignée'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">Identité : {shop.merchant_verification_status.replaceAll('_', ' ')}</p>
                  </div>
                  <button type="button" onClick={() => focusVerificationShop(shop.id)} className="min-h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Examiner le dossier</button>
                </article>
              ))}
              {verificationShops.filter((shop) => `${shop.name} ${shop.city || ''}`.toLocaleLowerCase('fr').includes(verificationShopSearch.trim().toLocaleLowerCase('fr'))).length === 0 && (
                <p className="py-6 text-center text-sm text-slate-500">{verificationShops.length === 0 ? 'Aucune boutique à afficher.' : 'Aucune boutique ne correspond à cette recherche.'}</p>
              )}
            </div>
          </section>
        )}

        {adminView === 'push' && adminRole === 'super_admin' && <AdminPushAnnouncements />}

        {adminView === 'audit' && adminRole === 'super_admin' && (
          <section aria-labelledby="admin-audit-title" className="chart-panel p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="admin-audit-title" className="text-lg font-black text-slate-900">Journal d’audit</h2>
                <p className="mt-1 text-xs text-slate-500">Actions administratives enregistrées, avec leur auteur, leur cible et leur date.</p>
              </div>
              <button type="button" onClick={() => setAuditLogRefresh((value) => value + 1)} disabled={auditLogLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${auditLogLoading ? 'animate-spin' : ''}`} /> Actualiser
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="block">
                <span className="sr-only">Rechercher dans le journal</span>
                <input value={auditLogSearch} onChange={(event) => { setAuditLogSearch(event.target.value); setAuditLogPage(0); }} placeholder="Rechercher par boutique ou action" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <span>Administrateur</span>
                <select value={auditLogActor} onChange={(event) => { setAuditLogActor(event.target.value as 'all' | AdminRole | 'didit_webhook'); setAuditLogPage(0); }} className="min-h-10 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
                  <option value="all">Tous les rôles</option>
                  <option value="super_admin">Super-admin</option>
                  <option value="verification_admin">Vérification</option>
                  <option value="didit_webhook">Webhook Didit</option>
                </select>
              </label>
            </div>
            {auditLogError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{auditLogError}</p>}
            {auditLogLoading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Chargement du journal…</p>
              : auditLogs.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 px-3 py-5 text-sm text-slate-600">Aucune action ne correspond à ces critères.</p>
                : <div className="mt-4 divide-y divide-slate-200">
                  {auditLogs.map((entry) => (
                    <article key={entry.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">{adminAuditActionLabels[entry.action] || entry.action.replaceAll('_', ' ')}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.actor === 'verification_admin' ? 'bg-violet-100 text-violet-800' : entry.actor === 'didit_webhook' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>{entry.actor === 'verification_admin' ? 'Admin vérification' : entry.actor === 'didit_webhook' ? 'Webhook Didit' : entry.actor === 'super_admin' ? 'Super-admin' : entry.actor}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{entry.shop_name || (entry.shop_id ? `Boutique #${entry.shop_id}` : 'Plateforme')}{entry.shop_id && entry.shop_name ? ` · Boutique #${entry.shop_id}` : ''}</p>
                        </div>
                        <time className="shrink-0 text-xs text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}</time>
                      </div>
                      {Object.entries(entry.details).length > 0 && (
                        <dl className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(entry.details).map(([key, value]) => (
                            <div key={key} className="max-w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
                              <dt className="inline font-semibold text-slate-500">{adminAuditDetailLabels[key] || key}: </dt>
                              <dd className="inline break-words text-slate-800">{typeof value === 'boolean' ? value ? 'Oui' : 'Non' : String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </article>
                  ))}
                </div>}
            <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">{auditLogTotal.toLocaleString('fr-FR')} action(s) · page {auditLogPage + 1}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAuditLogPage((page) => Math.max(0, page - 1))} disabled={auditLogPage === 0 || auditLogLoading} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Précédent</button>
                <button type="button" onClick={() => setAuditLogPage((page) => page + 1)} disabled={(auditLogPage + 1) * 50 >= auditLogTotal || auditLogLoading} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Suivant</button>
              </div>
            </div>
          </section>
        )}

        {adminView === 'shops' && (
          <AdminShopList
            shops={filteredShops}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            publicationFilter={publicationFilter}
            onPublicationFilterChange={setPublicationFilter}
            verificationFilter={verificationFilter}
            onVerificationFilterChange={setVerificationFilter}
            subscriptionFilter={subscriptionFilter}
            onSubscriptionFilterChange={setSubscriptionFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onExport={exportShopsCsv}
            onFocusVerification={focusVerificationShop}
            onOpenMerchantSpace={handleOpenMerchantSpace}
            featuredActionShopId={featuredActionShopId}
            onSetFeatured={(shopId, days) => void handleSetFeatured(shopId, days)}
            onToggleActive={(shopId) => void handleToggleActive(shopId)}
            onRequestDelete={(shop) => {
              setDeleteShopTarget(shop);
              setDeleteShopConfirmation('');
              setDeleteShopReason('');
              setDeleteShopAcknowledged(false);
              setDeleteShopError(null);
            }}
            canSeeFinancials={adminRole === 'super_admin'}
            canManageMerchantSpace={adminRole === 'super_admin'}
            canDeleteShops={adminRole === 'super_admin'}
          />
        )}
        </div>
        </div>
      </main>
      <nav
        aria-label={adminRole === 'super_admin' ? 'Navigation rapide super-admin' : 'Navigation rapide administration'}
        className={`fixed inset-x-0 bottom-0 z-50 grid border-t border-[#e7dfd3] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(33,23,18,0.08)] backdrop-blur lg:hidden ${adminRole === 'super_admin' ? 'grid-cols-5' : 'grid-cols-3'}`}
      >
        {(adminRole === 'super_admin'
          ? adminNavigationGroups.flatMap((group) => group.items).filter((item) => ['overview', 'shops', 'orders', 'identity'].includes(item.id))
          : adminNavigationGroups.flatMap((group) => group.items)
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={adminView === id ? 'page' : undefined}
            onClick={() => { setAdminView(id); setIsAdminMenuOpen(false); }}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-t-lg px-1 text-[10px] font-bold sm:text-[11px] ${adminView === id ? 'text-[#155544]' : 'text-slate-500'}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="max-w-full truncate">{label.replace(/ \(\d+\)$/, '')}</span>
          </button>
        ))}
        {adminRole === 'super_admin' && (
          <button
            type="button"
            aria-label="Plus"
            aria-expanded={isAdminMenuOpen}
            aria-controls="admin-menu-drawer"
            onClick={() => setIsAdminMenuOpen(true)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold sm:text-[11px] ${isAdminMenuOpen || !['overview', 'shops', 'orders', 'identity'].includes(adminView) ? 'text-[#155544]' : 'text-slate-500'}`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>Plus</span>
          </button>
        )}
      </nav>
      {isAdminMenuOpen && adminRole === 'super_admin' && (
        <div className="fixed inset-0 z-[70] bg-slate-950/40 lg:hidden" onClick={(event) => {
          if (event.target === event.currentTarget) setIsAdminMenuOpen(false);
        }}>
          <aside id="admin-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-menu-title" className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-[#e7dfd3] pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#1D6B57]">MaTable.ci</p>
                <h2 id="admin-menu-title" className="text-lg font-black text-[#211712]">Autres rubriques</h2>
              </div>
              <button type="button" aria-label="Fermer le menu" onClick={() => setIsAdminMenuOpen(false)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav aria-label="Autres rubriques super-admin" className="space-y-4">
              {adminNavigationGroups.map((group) => {
                const items = group.items.filter((item) => !['overview', 'shops', 'orders', 'identity'].includes(item.id));
                if (!items.length) return null;
                return (
                  <section key={group.label}>
                    <h3 className="mb-1 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{group.label}</h3>
                    <div className="space-y-1">
                      {items.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          aria-current={adminView === id ? 'page' : undefined}
                          onClick={() => { setAdminView(id); setIsAdminMenuOpen(false); }}
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${adminView === id ? 'bg-[#eaf4ef] text-[#155544]' : 'text-slate-800 hover:bg-emerald-50'}`}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-emerald-800" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
      {deleteShopTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteShopLoading) setDeleteShopTarget(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="delete-shop-title" className="my-auto w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-800"><Trash2 className="h-5 w-5" /></span>
              <div>
                <h2 id="delete-shop-title" className="text-lg font-black text-slate-950">Supprimer définitivement cette boutique ?</h2>
                <p className="mt-1 break-all text-sm font-bold text-rose-800">{deleteShopTarget.name} · /{deleteShopTarget.slug}</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-950">
              Cette action effacera la boutique, ses produits et commandes, ainsi que l’historique des paiements et boosts, les avis, signalements, favoris, sessions du commerçant et statistiques associés. Elle est irréversible. Le journal admin conservera uniquement l’identifiant, le nom, le slug et le motif de suppression.
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-slate-700" htmlFor="delete-shop-confirmation">Pour confirmer, retape exactement le slug : <span className="font-mono text-rose-800">{deleteShopTarget.slug}</span></label>
              <input id="delete-shop-confirmation" autoComplete="off" value={deleteShopConfirmation} onChange={(event) => setDeleteShopConfirmation(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none focus:border-rose-600" />
              <label className="block text-xs font-bold text-slate-700" htmlFor="delete-shop-reason">Motif obligatoire (conservé au journal d’audit)</label>
              <textarea id="delete-shop-reason" value={deleteShopReason} onChange={(event) => setDeleteShopReason(event.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-600" />
              <label className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                <input type="checkbox" checked={deleteShopAcknowledged} onChange={(event) => setDeleteShopAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 accent-rose-700" />
                <span>Je comprends que les données listées ci-dessus seront supprimées sans possibilité de restauration.</span>
              </label>
              {deleteShopError && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">{deleteShopError}</p>}
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={deleteShopLoading} onClick={() => setDeleteShopTarget(null)} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Annuler</button>
              <button type="button" disabled={deleteShopLoading || deleteShopConfirmation.trim() !== deleteShopTarget.slug || deleteShopReason.trim().length < 3 || !deleteShopAcknowledged} onClick={() => void handleDeleteShop()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-black text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 className="h-4 w-4" />{deleteShopLoading ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
