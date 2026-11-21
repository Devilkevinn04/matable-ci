import React, { useState, useEffect, useRef } from 'react';
import { m } from 'motion/react';
import {
  ShieldCheck,
  Store,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Send,
  DollarSign,
  CreditCard,
  Search,
  Check,
  BarChart3,
  ClipboardList,
  Download,
  TrendingUp,
  Eye,
  Users,
  Activity,
  ShoppingBag,
  LogOut,
  Flag,
  UserRound,
  Trash2,
  MoreHorizontal,
  ChevronRight,
  BookOpen,
  X,
  Megaphone,
  Tag,
  Star,
} from 'lucide-react';
import { AdminIdentityVerificationPanel, statusLabels as verificationStatusLabels } from './AdminIdentityVerificationPanel';
import { AdminManualVerificationPanel } from './AdminManualVerificationPanel';
import { AdminShopList } from './AdminShopList';
import { getAcquisitionSourceLabel } from '../utils/acquisitionSources';
import { AdminPushAnnouncements } from './AdminPushAnnouncements';
import { AdminHomepageMarketing } from './AdminHomepageMarketing';
import { AdminProductPromotions } from './AdminProductPromotions';
import { AdminAmbassadors } from './AdminAmbassadors';
import { AnalyticsDailyBars } from './AnalyticsDailyBars';
import { Link } from 'react-router-dom';
import { ContextualHelp } from './ContextualHelp';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
const GuideChecklist = React.lazy(() => import('./UserGuidePage').then((module) => ({ default: module.GuideChecklist })));
import {
  audienceSourceLabels,
  ownerNotificationTemplates,
} from './adminDashboardTypes';
import type {
  AdminAnalytics,
  AdminContentModeration,
  AdminFinance,
  AdminHealth,
  AdminMaintenance,
  AdminOrder,
  AdminShopItem,
} from './adminDashboardTypes';
import {  trackLogout } from '../utils/analyticsTracker';

import {
  adminOrderTransitions,
  type AdminRole,
  type AdminView,
  type DashboardMetricCardProps,
  DashboardMetricCard,
  type VerificationShopSummary,
  type AdminAmbassadorOverview,
  adminOrderStatusLabels,
} from './admin-dashboard/shared';
import { useAdminSubscriptions } from './admin-dashboard/useAdminSubscriptions';
import { AdminSubscriptionsView } from './admin-dashboard/AdminSubscriptionsView';
import { useAdminCustomers } from './admin-dashboard/useAdminCustomers';
import { AdminCustomersView } from './admin-dashboard/AdminCustomersView';
import { AdminLoginForm } from './admin-dashboard/AdminLoginForm';
import { useAdminAuditLog } from './admin-dashboard/useAdminAuditLog';
import { AdminAuditLogView } from './admin-dashboard/AdminAuditLogView';
import { askReason, confirmAction } from './ui/ConfirmSheet';

export const AdminDashboard: React.FC = () => {
  const [adminView, setAdminView] = useState<AdminView>('overview');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [shops, setShops] = useState<AdminShopItem[]>([]);
  const [verificationShops, setVerificationShops] = useState<VerificationShopSummary[]>([]);
  const [verificationShopSearch, setVerificationShopSearch] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('super_admin');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [publicationFilter, setPublicationFilter] = useState<'all' | 'draft' | 'active' | 'suspended'>('all');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'pending' | 'submitted' | 'under_review' | 'verified' | 'rejected' | 'not_required'>('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'not_started' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'orders' | 'name'>('sales');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };
  const [deleteShopTarget, setDeleteShopTarget] = useState<Pick<AdminShopItem, 'id' | 'name' | 'slug'> | null>(null);
  const [deleteShopConfirmation, setDeleteShopConfirmation] = useState('');
  const [deleteShopReason, setDeleteShopReason] = useState('');
  const [deleteShopAcknowledged, setDeleteShopAcknowledged] = useState(false);
  const [deleteShopLoading, setDeleteShopLoading] = useState(false);
  const [deleteShopError, setDeleteShopError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsUpdatedAt, setAnalyticsUpdatedAt] = useState<string | null>(null);
  const analyticsRequestId = useRef(0);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [ambassadorOverview, setAmbassadorOverview] = useState<AdminAmbassadorOverview | null>(null);
  const [ambassadorOverviewError, setAmbassadorOverviewError] = useState('');
  const ambassadorOverviewRequestId = useRef(0);
  const [audienceShopSearch, setAudienceShopSearch] = useState('');
  const [audienceShopSort, setAudienceShopSort] = useState<'views' | 'sessions' | 'orders' | 'sales' | 'conversion' | 'name'>('views');
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [financeDays, setFinanceDays] = useState(90);
  const [financePaymentsPage, setFinancePaymentsPage] = useState(0);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const subscriptionsAdmin = useAdminSubscriptions({ shops, showNotice });
  const { fetchSubscriptions } = subscriptionsAdmin;
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [overviewPendingOrders, setOverviewPendingOrders] = useState<AdminOrder[]>([]);
  const [overviewPendingOrderCount, setOverviewPendingOrderCount] = useState<number | null>(null);
  const [overviewPendingOrdersLoading, setOverviewPendingOrdersLoading] = useState(false);
  const [overviewPendingOrdersError, setOverviewPendingOrdersError] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(0);
  const [orderActionLoadingId, setOrderActionLoadingId] = useState<number | null>(null);
  const customers = useAdminCustomers({ enabled: isAuthenticated && adminView === 'customers', showNotice });
  const { customerTotal, fetchAdminCustomers } = customers;
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [healthPollingError, setHealthPollingError] = useState('');
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
    'Bonjour {boutique}, votre boutique MaTable est actuellement en veille et n’apparaît pas sur le site, car votre identité n’a pas encore été vérifiée. Pour la faire réapparaître, connectez-vous à votre tableau de bord marchand : {dashboard}, puis ouvrez « Vérification d’identité » et suivez les étapes de Didit. Après la vérification, la remise en ligne pourra être finalisée si les autres critères de publication sont remplis. Répondez à ce message si vous avez besoin d’aide.',
  );
  const [selectedVerificationShopId, setSelectedVerificationShopId] = useState<number | null>(null);
  const [featuredActionShopId, setFeaturedActionShopId] = useState<number | null>(null);
  const [contentModeration, setContentModeration] = useState<AdminContentModeration>({ reviews: [], reports: [] });
  const [contentModerationError, setContentModerationError] = useState('');
  const [contentModerationLoading, setContentModerationLoading] = useState(false);
  const [contentModerationLoaded, setContentModerationLoaded] = useState(false);
  const audit = useAdminAuditLog(isAuthenticated && adminRole === 'super_admin' && adminView === 'audit');

  const fetchAdminShops = async () => {
    try {
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
        return;
      }
      setAdminView('overview');

      const res = await fetch('/api/admin/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsAuthenticated(true);
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
    }
  };

  const refreshOverviewQueues = async () => {
    await Promise.all([fetchOverviewPendingOrders(), fetchContentModeration()]);
  };

  const loadAdminHealth = async () => {
    const healthRes = await fetch('/api/admin/health', { cache: 'no-store' });
    if (!healthRes.ok) throw new Error('Impossible de charger l’état du service.');
    const health = await healthRes.json() as AdminHealth;
    setAdminHealth(health);
  };

  const pollAdminHealth = async () => {
    try {
      await loadAdminHealth();
      setHealthPollingError('');
      setOperationsError((current) => current === 'Impossible de charger l’état du service.' ? '' : current);
    } catch (error) {
      setHealthPollingError(error instanceof Error ? error.message : 'L’état du service est momentanément indisponible.');
    }
  };

  const fetchOperations = async (role = adminRole) => {
    try {
      setOperationsLoading(true);
      setOperationsError('');
      setHealthPollingError('');
      await loadAdminHealth();
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
    setContentModerationLoading(true);
    try {
      const response = await fetch('/api/admin/content-moderation');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger la modération.');
      if (!Array.isArray(data.reviews) || !Array.isArray(data.reports)) {
        throw new Error('Les données de modération reçues sont invalides.');
      }
      setContentModeration({ reviews: data.reviews, reports: data.reports });
      setContentModerationError('');
      setContentModerationLoaded(true);
    } catch (error) {
      setContentModerationLoaded(false);
      setContentModerationError(error instanceof Error ? error.message : 'Impossible de charger la modération.');
    } finally {
      setContentModerationLoading(false);
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

  const fetchOverviewPendingOrders = async () => {
    setOverviewPendingOrdersLoading(true);
    setOverviewPendingOrdersError('');
    try {
      const response = await fetch('/api/admin/orders?limit=5&offset=0&status=pending');
      const data = await response.json() as { orders?: AdminOrder[]; total?: number; error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les commandes en attente.');
      if (!Array.isArray(data.orders) || typeof data.total !== 'number' || !Number.isSafeInteger(data.total) || data.total < 0) {
        throw new Error('Les données des commandes en attente sont invalides.');
      }
      setOverviewPendingOrders(data.orders);
      setOverviewPendingOrderCount(data.total);
    } catch (error) {
      setOverviewPendingOrdersError(error instanceof Error ? error.message : 'Impossible de charger les commandes en attente.');
    } finally {
      setOverviewPendingOrdersLoading(false);
    }
  };

  const updateOrderStatus = async (order: AdminOrder, status: AdminOrder['status']) => {
    if (!adminOrderTransitions[order.status].includes(status)) {
      showNotice(`Transition non autorisée : ${adminOrderStatusLabels[order.status]} → ${adminOrderStatusLabels[status]}.`);
      return;
    }
    const reason = await askReason({
      title: `Commande #${order.id} : ${adminOrderStatusLabels[order.status]} → ${adminOrderStatusLabels[status]}`,
      message: 'Le stock est ajusté automatiquement et le motif est inscrit au journal d’audit.',
      confirmLabel: 'Changer le statut',
      tone: ['cancelled', 'rejected'].includes(status) ? 'danger' : 'default',
      suggestions: ['Demande du client', 'Demande de la boutique', 'Erreur de saisie', 'Rupture de stock'],
    });
    if (reason === null) return;
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
      await Promise.all([fetchOperations(), fetchAdminOrders(), fetchOverviewPendingOrders()]);
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
    const requestId = ++analyticsRequestId.current;
    setAnalyticsError('');
    try {
      const res = await fetch(`/api/admin/analytics?days=${days}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Impossible de charger les données d’audience.');
      const data = await res.json() as AdminAnalytics;
      if (requestId !== analyticsRequestId.current) return;
      setAnalytics(data);
      setAnalyticsUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (requestId !== analyticsRequestId.current) return;
      setAnalyticsError(error instanceof Error ? error.message : 'Les données d’audience sont momentanément indisponibles.');
    }
  };

  const fetchAmbassadorOverview = async (days: number) => {
    const requestId = ++ambassadorOverviewRequestId.current;
    setAmbassadorOverviewError('');
    try {
      const response = await fetch(`/api/admin/ambassadors/overview?days=${days}`, { cache: 'no-store' });
      const data = await response.json() as AdminAmbassadorOverview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les statistiques ambassadeurs.');
      if (requestId !== ambassadorOverviewRequestId.current) return;
      setAmbassadorOverview(data);
    } catch (error) {
      if (requestId !== ambassadorOverviewRequestId.current) return;
      setAmbassadorOverviewError(error instanceof Error ? error.message : 'Les statistiques ambassadeurs sont momentanément indisponibles.');
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

  const saveMaintenanceMode = async () => {
    if (!maintenanceMode) return;
    const stateChanged = maintenanceEnabledDraft !== maintenanceMode.enabled;
    if (stateChanged && !(await confirmAction(maintenanceEnabledDraft
      ? { title: 'Activer la maintenance ?', message: 'Le site public et les espaces commerçants deviennent indisponibles. L’administration reste accessible.', confirmLabel: 'Activer la maintenance', tone: 'danger' }
      : { title: 'Rouvrir le site ?', message: 'Clients et commerçants retrouvent l’accès immédiatement.', confirmLabel: 'Rouvrir le site' }))) return;

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
    if (!isAuthenticated || adminRole !== 'super_admin' || !['overview', 'audience'].includes(adminView)) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void fetchAnalytics(analyticsDays);
  }, [isAuthenticated, adminRole, adminView, analyticsDays]);

  useEffect(() => {
    if (isAuthenticated && adminView === 'moderation') void fetchContentModeration();
  }, [isAuthenticated, adminView]);

  useEffect(() => {
    if (!isAuthenticated || adminRole !== 'super_admin' || adminView !== 'overview') return;
    void refreshOverviewQueues();
  }, [isAuthenticated, adminRole, adminView]);
  useVisibilityPolling(
    refreshOverviewQueues,
    30_000,
    isAuthenticated && adminRole === 'super_admin' && adminView === 'overview',
  );
  useVisibilityPolling(
    () => fetchAnalytics(analyticsDays),
    30_000,
    isAuthenticated && adminRole === 'super_admin' && ['overview', 'audience'].includes(adminView),
  );
  useVisibilityPolling(
    () => fetchAmbassadorOverview(analyticsDays),
    30_000,
    isAuthenticated && adminRole === 'super_admin' && adminView === 'overview',
  );
  useVisibilityPolling(
    pollAdminHealth,
    30_000,
    isAuthenticated && adminRole === 'super_admin' && ['overview', 'operations'].includes(adminView),
  );

  useEffect(() => {
    if (!isAuthenticated || adminRole !== 'super_admin' || adminView !== 'finance') return;
    const timer = window.setTimeout(() => {
      void fetchFinance(financeDays, financePaymentsPage, paymentSearch, paymentStatusFilter, paymentTypeFilter);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, adminRole, adminView, financeDays, financePaymentsPage, paymentSearch, paymentStatusFilter, paymentTypeFilter]);

  useEffect(() => {
    if (!isAuthenticated || adminView !== 'orders') return;
    const timer = window.setTimeout(() => { void fetchAdminOrders(); }, 250);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, adminView, orderSearch, orderStatusFilter, orderPage]);

  const handleAdminLogout = async () => {
    await fetch('/api/auth/admin-logout', { method: 'POST' });
    trackLogout('admin');
    setIsAuthenticated(false);
    setAdminHealth(null);
    setAdminOrders([]);
    setOverviewPendingOrders([]);
    setOverviewPendingOrderCount(null);
    setOverviewPendingOrdersError('');
    setAnalytics(null);
    setAnalyticsError('');
    setAnalyticsUpdatedAt(null);
    setFinance(null);
    setContentModeration({ reviews: [], reports: [] });
    setContentModerationLoaded(false);
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
    return <AdminLoginForm onAuthenticated={fetchAdminShops} />;
  }

  // Manual ON/OFF toggle
  const handleToggleActive = async (shopId: number) => {
    const shop = shops.find((item) => item.id === shopId);
    if (!shop) return;
    const reason = await askReason(shop.is_active
      ? { title: `Désactiver ${shop.name} ?`, message: 'La vitrine n’est plus visible et les commandes sont bloquées. Le motif est inscrit au journal d’audit.', confirmLabel: 'Désactiver la boutique', tone: 'danger', suggestions: ['Signalements répétés', 'Contenu non conforme', 'Demande du commerçant', 'Identité non vérifiée'] }
      : { title: `Réactiver ${shop.name} ?`, message: 'La vitrine redevient visible si les autres conditions de publication sont remplies.', confirmLabel: 'Réactiver la boutique', suggestions: ['Situation régularisée', 'Demande du commerçant', 'Erreur de désactivation'] });
    if (reason === null) return;
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
    newTab.document.write('<html><head><title>Chargement…</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><p role="status" style="display:flex;align-items:center;gap:10px;color:#64748b;font-size:14px"><span aria-hidden="true" style="width:16px;height:16px;border:2px solid #d1d5db;border-top-color:#087f62;border-radius:50%;animation:spin .8s linear infinite"></span>Chargement de l\'espace commerçant…</p><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>');
    newTab.document.close();
    newTab.location.href = `/app?admin_shop_id=${shopId}`;
    showNotice('Espace boutique ouvert en mode super-admin.');
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

  const activeShopsCount = shops.filter(s => s.is_active).length;
  const overviewDaily = analytics?.daily || [];
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
      ? ['Boutique', 'Slug', 'Statut du compte', 'Montant des commandes FCFA (paiements non suivis)', 'Commandes', 'Panier moyen', 'Produits', 'Origine déclarée', 'Lien de campagne']
      : ['Boutique', 'Slug', 'Statut', 'Commandes', 'Produits', 'Origine déclarée', 'Lien de campagne'];
    const rows = filteredShops.map(shop => adminRole === 'super_admin'
      ? [shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.total_sales, shop.orders_count, shop.average_order_value, shop.products_count, getAcquisitionSourceLabel(shop.acquisition_source), shop.acquisition_campaign || '']
      : [shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.orders_count, shop.products_count, getAcquisitionSourceLabel(shop.acquisition_source), shop.acquisition_campaign || '']);
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
  const overviewModerationCount = contentModeration.reports.length + contentModeration.reviews.length;
  const overviewActionCount = overviewPendingOrderCount === null || !contentModerationLoaded || Boolean(overviewPendingOrdersError || contentModerationError)
    ? null
    : overviewPendingOrderCount + pendingVerificationShops.length + overviewModerationCount;
  const overviewActionItems = [
    {
      id: 'reports',
      title: 'Signalements à examiner',
      detail: 'Vérifier le contenu signalé et décider de la suite.',
      count: contentModeration.reports.length,
      priority: 'Important',
      icon: Flag,
      view: 'moderation' as AdminView,
      tone: 'bg-rose-50 text-rose-800',
      priorityTone: 'bg-rose-100 text-rose-900',
    },
    {
      id: 'identity',
      title: 'Dossiers d’identité à suivre',
      detail: 'Examiner les statuts transmis par Didit.',
      count: pendingVerificationShops.length,
      priority: 'Important',
      icon: ShieldCheck,
      view: 'identity' as AdminView,
      tone: 'bg-amber-50 text-amber-800',
      priorityTone: 'bg-amber-100 text-amber-900',
    },
    {
      id: 'orders',
      title: 'Commandes en attente de réponse',
      detail: 'Suivre les demandes en attente côté commerçant.',
      count: overviewPendingOrderCount || 0,
      priority: 'À suivre',
      icon: ShoppingBag,
      view: 'orders' as AdminView,
      tone: 'bg-sky-50 text-sky-800',
      priorityTone: 'bg-sky-100 text-sky-900',
    },
    {
      id: 'reviews',
      title: 'Avis à modérer',
      detail: 'Décider si les avis peuvent être publiés.',
      count: contentModeration.reviews.length,
      priority: 'Normal',
      icon: CheckCircle2,
      view: 'moderation' as AdminView,
      tone: 'bg-violet-50 text-violet-800',
      priorityTone: 'bg-violet-100 text-violet-900',
    },
  ].filter((item) => item.count > 0);
  const adminNavigationGroups: { label: string; items: { id: AdminView; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = adminRole === 'super_admin'
    ? [
      {
        label: 'Vue générale',
        items: [
          { id: 'overview', label: 'Accueil', icon: Activity },
        ],
      },
      {
        label: 'Activité commerciale',
        items: [
          { id: 'shops', label: `Boutiques (${shops.length})`, icon: Store },
          { id: 'orders', label: 'Commandes', icon: ShoppingBag },
          { id: 'customers', label: `Clients (${customerTotal})`, icon: UserRound },
        ],
      },
      {
        label: 'Marketing et partenariats',
        items: [
          { id: 'advertising', label: 'Publicité et partenaires', icon: Megaphone },
          { id: 'ambassadors', label: 'Ambassadeurs', icon: Users },
          { id: 'promotions', label: 'Promotions', icon: Tag },
          { id: 'push', label: 'Annonces automatiques', icon: Send },
        ],
      },
      {
        label: 'Confiance et sécurité',
        items: [
          { id: 'moderation', label: 'Avis & signalements', icon: Flag },
          { id: 'identity', label: `Identité (${pendingVerificationCount})`, icon: ShieldCheck },
          { id: 'audit', label: 'Journal d’audit', icon: ClipboardList },
        ],
      },
      {
        label: 'Configuration et système',
        items: [
          { id: 'finance', label: 'Finances', icon: CreditCard },
          { id: 'subscriptions', label: 'Abonnements', icon: RefreshCw },
          { id: 'operations', label: 'Opérations', icon: Activity },
          { id: 'audience', label: 'Rapports', icon: BarChart3 },
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
        <div className="relative max-w-6xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="brand-mark brand-mark-header">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="min-w-0 truncate text-base font-black tracking-tight text-[var(--mt-gray-900)] sm:text-xl">{adminRole === 'super_admin' ? 'Super-Admin MaTable' : 'Administration MaTable'}</h1>
                  <ContextualHelp label="À propos de cet espace">
                    {adminRole === 'super_admin'
                      ? 'Gérez la plateforme, ses boutiques et ses paramètres.'
                      : 'Traitez les vérifications d’identité et les signalements qui vous sont attribués.'}
                  </ContextualHelp>
                  <span className="hidden sm:inline-flex"><span className="dashboard-chip dashboard-chip-soft">{adminRole === 'super_admin' ? 'Tour de contrôle' : 'Espace vérification'}</span></span>
                </div>
                <p className="mt-0.5 hidden max-w-xl text-[11px] leading-4 text-[#47534b] sm:block">
                  {adminRole === 'super_admin'
                    ? 'Pilotage global de la plateforme'
                    : 'File de vérification Didit et modération de contenu'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={() => void handleAdminLogout()} aria-label="Déconnexion" className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-[var(--mt-gray-900)] transition hover:bg-rose-50">
                <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          </div>

        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6 lg:ml-64 lg:w-auto lg:max-w-none">
        {actionNotice && (
          <m.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 flex items-center gap-2"
          >
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{actionNotice}</span>
          </m.div>
        )}

        {adminRole === 'super_admin' && adminView === 'overview' && pendingVerificationShops.length > 0 && (
          <m.div
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
          </m.div>
        )}

        {adminRole === 'super_admin' && adminView === 'overview' && (
          <section aria-label="Guide de travail super-admin" className="rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">Repères Super-admin</h2>
              <p className="mt-1 text-xs text-slate-600">Choisissez un espace selon l’opération à effectuer. Les actions sensibles sont journalisées et doivent être justifiées.</p>
              <Link to={`/guide?role=${adminRole === 'super_admin' ? 'super-admin' : 'verification'}`} state={{ guideAccountId: adminRole }} className="mt-2 inline-flex min-h-9 items-center gap-2 text-xs font-bold text-emerald-800 hover:text-emerald-950"><BookOpen className="h-4 w-4" />Guide {adminRole === 'super_admin' ? 'Super-admin' : 'vérification'}</Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([
                { view: 'shops', label: 'Boutiques et comptes', detail: 'Accès, visibilité et répertoire clients' },
                { view: 'finance', label: 'Finances et abonnements', detail: 'Paiements, échéances et formules' },
                { view: 'audit', label: 'Audit et opérations', detail: 'Historique des actions et état du service' },
              ] as const).map(({ view, label, detail }) => (
                <button key={view} type="button" onClick={() => setAdminView(view)} className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:bg-emerald-50">
                  <span><strong className="block text-xs font-bold text-slate-900">{label}</strong><span className="mt-1 block text-[11px] leading-4 text-slate-600">{detail}</span></span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-emerald-800" />
                </button>
              ))}
            </div>
            <div className="mt-4">
              <React.Suspense fallback={<p role="status" className="text-sm text-slate-500">Chargement du guide…</p>}>
                <GuideChecklist role={adminRole === 'super_admin' ? 'super-admin' : 'verification'} accountId={adminRole} collapsible />
              </React.Suspense>
            </div>
          </section>
        )}

        {adminRole === 'verification_admin' && ['identity', 'verification-shops', 'moderation'].includes(adminView) && (
          <section aria-label="Guide de traitement · vérification" className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <React.Suspense fallback={<p role="status" className="text-sm text-sky-900">Chargement du guide…</p>}>
                <GuideChecklist role="verification" accountId={adminRole} collapsible />
              </React.Suspense>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" aria-current={adminView === 'identity' ? 'page' : undefined} onClick={() => setAdminView('identity')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${adminView === 'identity' ? 'bg-sky-900 text-white hover:bg-sky-800' : 'border border-sky-300 bg-white text-sky-950 hover:bg-sky-100'}`}>File Identité</button>
                <button type="button" aria-current={adminView === 'verification-shops' ? 'page' : undefined} onClick={() => setAdminView('verification-shops')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${adminView === 'verification-shops' ? 'bg-sky-900 text-white hover:bg-sky-800' : 'border border-sky-300 bg-white text-sky-950 hover:bg-sky-100'}`}>Boutiques</button>
                <button type="button" aria-current={adminView === 'moderation' ? 'page' : undefined} onClick={() => setAdminView('moderation')} className={`min-h-9 rounded-lg px-3 text-xs font-bold ${adminView === 'moderation' ? 'bg-sky-900 text-white hover:bg-sky-800' : 'border border-sky-300 bg-white text-sky-950 hover:bg-sky-100'}`}>Avis & signalements</button>
              </div>
            </div>
          </section>
        )}

        <div className="grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-1 lg:items-start">
        <nav aria-label={adminRole === 'super_admin' ? 'Navigation super-admin' : 'Navigation administration'} className="admin-sidebar hidden min-w-0 flex-col gap-1 overflow-y-auto p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:overflow-x-hidden lg:rounded-none lg:border-0 lg:px-4 lg:py-6">
          <div className="mb-3 hidden px-3 pt-2 lg:block">
            <p className="text-2xl font-black tracking-tight text-white">MaTable</p>
            <p className="mt-1 text-sm text-white/70">{adminRole === 'super_admin' ? 'Super-Admin · Tour de contrôle' : 'Espace vérification'}</p>
          </div>
          {adminNavigationGroups.map((group) => (
            <section key={group.label} className="mb-2">
              <h2 className="px-2 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{group.label}</h2>
              <div className="space-y-1">
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-current={adminView === id ? 'page' : undefined} onClick={() => setAdminView(id)} className={`flex min-h-10 w-full min-w-0 items-center justify-start gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${adminView === id ? 'bg-[var(--mt-green-hover)] text-white' : 'text-white/90 hover:bg-[var(--mt-green-hover)] hover:text-white'}`}>
                    <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="mt-auto hidden rounded-2xl bg-[var(--mt-green-hover)] px-4 py-3 text-sm font-bold text-white lg:block">
            {adminRole === 'super_admin' ? 'Super-Admin' : 'Admin de vérification'}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
        {adminView === 'overview' && (
          <section aria-labelledby="admin-overview-title" className="space-y-4">
            <header className="overflow-hidden rounded-[1.5rem] bg-[#123e32] p-5 text-white shadow-[0_12px_30px_rgba(18,62,50,.12)] sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Aperçu de la plateforme</p>
                  <h2 id="admin-overview-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Activité de MaTable</h2>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-emerald-50/80 sm:text-sm">Les indicateurs résument les boutiques, les sessions d’audience consenties et les commandes sur la période choisie.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="admin-overview-days">Période des statistiques</label>
                  <select id="admin-overview-days" value={analyticsDays} onChange={(event) => setAnalyticsDays(Number(event.target.value))} className="min-h-10 rounded-full border border-white/25 bg-white/10 px-4 text-xs font-extrabold text-white focus:bg-[#123e32]">
                    <option value={7}>7 derniers jours</option>
                    <option value={30}>30 derniers jours</option>
                    <option value={90}>90 derniers jours</option>
                  </select>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-4 text-[11px] text-emerald-50/80">
                <p>{analytics ? `Données du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${analytics.daily[0]?.date || new Date().toISOString().slice(0, 10)}T12:00:00`))} au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${analytics.daily.at(-1)?.date || new Date().toISOString().slice(0, 10)}T12:00:00`))}` : 'Chargement des données de la période…'}</p>
                <p>{analyticsUpdatedAt
                  ? `Dernière mise à jour ${new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(analyticsUpdatedAt))} · actualisation toutes les 30 s si l’onglet est visible`
                  : 'Chargement des statistiques…'}</p>
              </div>
            </header>
            {analyticsError && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                Mise à jour impossible : {analyticsError}
                {analytics && ` Les dernières données disponibles (${analytics.days} jours) sont conservées.`}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              {([
                {
                  label: 'Sessions d’audience',
                  value: analytics ? new Intl.NumberFormat('fr-FR').format(analytics.totals.unique_visitors) : '—',
                  detail: 'Sessions mesurées après consentement, pas des personnes uniques.',
                  current: analytics?.totals.unique_visitors,
                  previous: analytics?.previous.unique_visitors,
                  series: analytics?.daily.map((day) => day.unique_visitors) || [],
                  icon: Eye,
                  tone: 'emerald',
                },
                {
                  label: 'Commandes reçues',
                  value: analytics ? new Intl.NumberFormat('fr-FR').format(analytics.totals.orders) : '—',
                  detail: 'Hors commandes annulées ou expirées.',
                  current: analytics?.totals.orders,
                  previous: analytics?.previous.orders,
                  series: analytics?.daily.map((day) => day.orders) || [],
                  icon: ShoppingBag,
                  tone: 'orange',
                },
                {
                  label: 'Commandes / sessions',
                  value: analytics ? `${analytics.totals.conversion_rate.toLocaleString('fr-FR')} %` : '—',
                  detail: 'Ratio indicatif des totaux ; ne relie pas une session à une commande.',
                  current: analytics?.totals.conversion_rate,
                  previous: analytics?.previous.conversion_rate,
                  percentagePoints: true,
                  series: analytics?.daily.map((day) => day.unique_visitors ? day.orders / day.unique_visitors * 100 : 0) || [],
                  icon: TrendingUp,
                  tone: 'sky',
                },
                {
                  label: 'Montant demandé',
                  value: analytics ? `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} FCFA` : '—',
                  detail: 'Valeur des commandes, non encaissée par MaTable.',
                  current: analytics?.totals.sales,
                  previous: analytics?.previous.sales,
                  series: analytics?.daily.map((day) => day.sales) || [],
                  icon: DollarSign,
                  tone: 'amber',
                },
              ] satisfies Omit<DashboardMetricCardProps, 'periodLabel'>[]).map((metric) => (
                <DashboardMetricCard
                  key={metric.label}
                  {...metric}
                  periodLabel={analytics ? `vs ${analytics.days} j` : 'chargement'}
                />
              ))}
            </div>
            <section aria-labelledby="admin-ambassador-overview-title" className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Acquisition partenaire</p>
                  <h3 id="admin-ambassador-overview-title" className="mt-1 text-base font-black text-slate-900">Réseau d’ambassadeurs</h3>
                  <p className="mt-1 text-xs text-slate-600">Performance des liens sur les {ambassadorOverview?.days ?? analyticsDays} derniers jours.</p>
                </div>
                <button type="button" onClick={() => setAdminView('ambassadors')} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-50">
                  Gérer les ambassadeurs <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {ambassadorOverviewError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">Mise à jour des statistiques ambassadeurs impossible : {ambassadorOverviewError}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">
                {[
                  { label: 'Actifs', value: ambassadorOverview ? `${ambassadorOverview.ambassadors_active} / ${ambassadorOverview.ambassadors_total}` : '—' },
                  { label: 'Clics', value: ambassadorOverview ? new Intl.NumberFormat('fr-FR').format(ambassadorOverview.clicks) : '—' },
                  { label: 'Inscriptions', value: ambassadorOverview ? new Intl.NumberFormat('fr-FR').format(ambassadorOverview.referrals) : '—' },
                  { label: 'Jetons de lien actifs', value: ambassadorOverview ? new Intl.NumberFormat('fr-FR').format(ambassadorOverview.active_link_tokens) : '—' },
                  { label: 'Conversion indicative', value: ambassadorOverview ? `${ambassadorOverview.conversion_rate.toLocaleString('fr-FR')} %` : '—' },
                  { label: 'Candidatures à traiter', value: ambassadorOverview ? new Intl.NumberFormat('fr-FR').format(ambassadorOverview.pending_applications) : '—' },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl bg-emerald-50/70 p-3">
                    <p className="text-[10px] font-bold leading-4 text-slate-600">{metric.label}</p>
                    <p className="mt-1 text-lg font-black tabular-nums text-[#183b31]">{metric.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-slate-500">La conversion est le ratio global inscriptions / clics sur la période ; elle ne représente pas un parcours individuel attribué.</p>
            </section>
            <section aria-label="État du réseau de boutiques" className="flex flex-col gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Store className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">Réseau de boutiques</p>
                  <p className="mt-1 text-[11px] text-slate-500">Comptes actifs : {new Intl.NumberFormat('fr-FR').format(activeShopsCount)} sur {new Intl.NumberFormat('fr-FR').format(shops.length)} · le statut actif ne signifie pas que la vitrine est publiée.</p>
                </div>
              </div>
              <button type="button" onClick={() => setAdminView('shops')} className="min-h-10 shrink-0 rounded-xl border border-[#dfe8dd] px-4 text-xs font-bold text-[#315548] transition hover:bg-emerald-50">Voir les boutiques</button>
            </section>
            {adminRole === 'super_admin' && (
              <section aria-labelledby="admin-action-center-title" className="chart-panel p-4 md:p-5">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mt-green-hover)]">Intervention humaine</p>
                    <h3 id="admin-action-center-title" className="mt-1 text-base font-black text-slate-900">File d’intervention</h3>
                    <p className="mt-1 text-xs text-slate-500">Les règles simples sont suivies par le système ; ces éléments nécessitent une vérification ou un jugement. Actualisation automatique toutes les 30 secondes, lorsque cet onglet est visible.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {overviewActionCount !== null
                      ? `${overviewActionCount} à traiter`
                      : overviewPendingOrdersLoading || contentModerationLoading
                        ? 'Actualisation…'
                        : 'Données indisponibles'}
                  </span>
                </header>
                {overviewPendingOrdersError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{overviewPendingOrdersError}</p>}
                {contentModerationError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">Modération indisponible : {contentModerationError}</p>}
                {overviewPendingOrdersLoading || contentModerationLoading ? (
                  <p role="status" className="mt-3 text-xs text-slate-500">Actualisation des files de commandes et de modération…</p>
                ) : null}
                {overviewActionCount !== null && !overviewPendingOrdersLoading && !contentModerationLoading && overviewActionItems.length === 0 && (
                  <p className="py-5 text-sm font-semibold text-emerald-800">Aucune intervention requise dans les files chargées.</p>
                )}
                {overviewActionItems.length > 0 && (
                  <div className="mt-2 divide-y divide-slate-200">
                    {overviewActionItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <article key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${item.priorityTone}`}>{item.priority}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
                          </div>
                          <strong className="shrink-0 text-lg font-black tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(item.count)}</strong>
                          <button
                            type="button"
                            onClick={() => {
                              if (item.view === 'orders') {
                                setOrderStatusFilter('pending');
                                setOrderSearch('');
                                setOrderPage(0);
                              }
                              setAdminView(item.view);
                            }}
                            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            Ouvrir <ChevronRight className="h-4 w-4" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
                {overviewPendingOrderCount !== null && overviewPendingOrderCount > 0 && overviewPendingOrders.length > 0 && (
                  <div className="mt-3 rounded-xl bg-slate-50 px-3">
                    <p className="py-2 text-[10px] font-black uppercase tracking-wide text-slate-500">Demandes récentes en attente</p>
                    {overviewPendingOrders.slice(0, 3).map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setOrderStatusFilter('pending');
                          setOrderSearch(String(order.id));
                          setOrderPage(0);
                          setAdminView('orders');
                        }}
                        className="flex min-h-10 w-full items-center justify-between gap-3 border-t border-slate-200 py-2 text-left"
                      >
                        <span className="min-w-0 truncate text-xs font-semibold text-slate-800">#{order.id} · {order.shop_name}</span>
                        <span className="shrink-0 text-[10px] text-slate-500">{new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {analytics && adminRole === 'super_admin' && (
              <div className="space-y-4">
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  <AnalyticsDailyBars
                    title="Visites des vitrines"
                    description="Consultations de boutiques par jour, uniquement après consentement à la mesure."
                    rows={overviewDaily}
                    valueFor={(day) => day.page_views}
                    color="#087c5b"
                    formatValue={(value) => new Intl.NumberFormat('fr-FR').format(value)}
                    emptyMessage="Les visites mesurées apparaîtront ici dès qu’une vitrine recevra de l’activité."
                  />
                  <AnalyticsDailyBars
                    title="Commandes reçues"
                    description="Commandes enregistrées par jour, hors annulation et expiration."
                    rows={overviewDaily}
                    valueFor={(day) => day.orders}
                    color="#e77a3d"
                    formatValue={(value) => new Intl.NumberFormat('fr-FR').format(value)}
                    emptyMessage="Les commandes apparaîtront ici dès qu’une boutique en recevra."
                  />
                </div>
                <section aria-labelledby="admin-overview-clarifications" className="rounded-2xl border border-[#e7dfd3] bg-white p-4">
                  <h3 id="admin-overview-clarifications" className="text-sm font-extrabold text-[#183b31]">Comment lire ces chiffres ?</h3>
                  <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-3">
                    <p><strong className="text-slate-800">Boutiques actives :</strong> les comptes peuvent utiliser MaTable ; cela ne confirme pas que leur vitrine est publiée.</p>
                    <p><strong className="text-slate-800">Valeur des commandes :</strong> sommes demandées dans les commandes ; les paiements client-commerçant ne sont pas encaissés ni suivis par MaTable.</p>
                    <p><strong className="text-slate-800">Sessions d’audience :</strong> sessions anonymisées comptées uniquement après consentement aux statistiques; elles ne correspondent pas forcément à des personnes distinctes.</p>
                  </div>
                </section>
                <section aria-labelledby="admin-top-shops-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 id="admin-top-shops-title" className="text-sm font-black text-slate-900">Boutiques par montant commandé</h3><p className="mt-1 text-xs text-slate-500">Classement sur la même période</p></div><button type="button" onClick={() => setAdminView('shops')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes</button></div>
                  {overviewTopShops.length === 0 || overviewTopShops.every((shop) => shop.sales === 0) ? <p className="py-6 text-sm text-slate-500">Aucun montant de commande sur cette période.</p> : <div className="mt-2 divide-y divide-slate-100">{overviewTopShops.filter((shop) => shop.sales > 0).map((shop, index) => <div key={shop.shop_id} className="py-3"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-[10px] font-black text-emerald-800">{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{shop.shop_name}</p><p className="mt-1 text-[10px] text-slate-500">{shop.orders} commande{shop.orders === 1 ? '' : 's'} · {shop.unique_visitors} session{shop.unique_visitors === 1 ? '' : 's'} unique{shop.unique_visitors === 1 ? '' : 's'}</p></div></div><strong className="shrink-0 text-xs tabular-nums text-slate-900">{new Intl.NumberFormat('fr-FR').format(shop.sales)} F</strong></div><div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.min(100, shop.sales / Math.max(1, overviewTopShops[0]?.sales || 1) * 100)}%` }} /></div></div>)}</div>}
                </section>
              </div>
            )}
            <div className="grid gap-4">
              <section aria-labelledby="admin-recent-orders-title" className="min-w-0 chart-panel p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><h3 id="admin-recent-orders-title" className="text-sm font-black text-slate-900">Commandes récentes</h3><p className="mt-1 text-xs text-slate-500">Dernières demandes enregistrées.</p></div><button type="button" onClick={() => setAdminView('orders')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes les commandes</button></div>
                {adminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande enregistrée.</p> : <div className="divide-y divide-slate-200">{adminOrders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</p><p className="mt-1 truncate text-xs text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleDateString('fr-FR')}</p></div><div className="shrink-0 text-right">{adminRole === 'super_admin' && <strong className="block text-sm text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} F</strong>}<span className="text-[10px] font-semibold text-slate-500">{adminOrderStatusLabels[order.status]}</span></div></div>)}</div>}
              </section>
            </div>
            <section aria-label="État du service et alertes" className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3"><Activity className={`h-5 w-5 shrink-0 ${adminHealth?.operational_status === 'critical' ? 'text-rose-700' : adminHealth?.operational_status === 'warning' ? 'text-amber-700' : 'text-emerald-700'}`} /><div><p className="text-sm font-bold text-slate-900">État du service</p><p className="text-xs text-slate-500">{adminHealth ? `${adminHealth.database === 'postgresql' ? 'PostgreSQL' : 'SQLite'} · ${adminHealth.operational_status === 'critical' ? 'Action requise' : adminHealth.operational_status === 'warning' ? 'À surveiller' : 'Opérationnel'}` : operationsError || healthPollingError || 'Vérification en cours'}</p></div></div>
                <button type="button" onClick={() => setAdminView('operations')} className="min-h-10 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Détails opérations</button>
              </div>
              {(operationsError || healthPollingError) && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">État technique indisponible : {operationsError || healthPollingError}</p>}
              {!!adminHealth?.alerts.length && (
                <div className={`mt-3 rounded-lg border px-3 py-2 ${adminHealth.operational_status === 'critical' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`} role={adminHealth.operational_status === 'critical' ? 'alert' : 'status'}>
                  <p className="text-xs font-bold text-slate-900">{adminHealth.operational_status === 'critical' ? 'Action technique requise' : 'Points à surveiller'}</p>
                  <ul className="mt-1 space-y-1">
                    {adminHealth.alerts.map((alert) => (
                      <li key={alert.code} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                        <span>{alert.message}</span>
                        <button type="button" onClick={() => {
                          if (alert.code.includes('pending_order')) {
                            setOrderStatusFilter('pending');
                            setOrderPage(0);
                            setAdminView('orders');
                          } else setAdminView('operations');
                        }} className="shrink-0 font-bold text-sky-800 underline underline-offset-2">Examiner</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {maintenanceMode?.enabled && (
                <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-bold text-amber-950">Le mode maintenance est activé : le site marchand est actuellement indisponible.</p>
                  <button type="button" onClick={() => setAdminView('operations')} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950">Examiner</button>
                </div>
              )}
            </section>
          </section>
        )}

        {adminView === 'orders' && (
          <section aria-labelledby="admin-orders-title" className="chart-panel p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 id="admin-orders-title" className="text-sm font-black text-slate-900">Gestion des commandes</h2><p className="mt-1 text-xs text-slate-500">{orderTotal} commande(s) correspondante(s), affichage par pages de 100.</p>{adminRole === 'super_admin' && <p className="mt-1 text-xs text-slate-500">Les montants affichés sont les montants demandés dans les commandes ; les règlements entre clients et commerçants ne sont pas suivis ici.</p>}</div>
              <button type="button" onClick={() => exportOperationsCsv(`matable-commandes-${new Date().toISOString().slice(0, 10)}.csv`, adminRole === 'super_admin' ? ['ID', 'Boutique', 'Client', 'Téléphone', 'Montant demandé (paiement non suivi)', 'Statut', 'Date'] : ['ID', 'Boutique', 'Client', 'Téléphone', 'Statut', 'Date'], filteredAdminOrders.map(order => adminRole === 'super_admin' ? [order.id, order.shop_name, order.customer_name, order.customer_phone, order.total_amount, order.status, order.created_at] : [order.id, order.shop_name, order.customer_name, order.customer_phone, order.status, order.created_at]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Exporter CSV</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={orderSearch} onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(0); }} placeholder="Rechercher boutique, client, téléphone ou numéro" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-700" /></label>
              <select value={orderStatusFilter} onChange={(event) => { setOrderStatusFilter(event.target.value); setOrderPage(0); }} aria-label="Filtrer les commandes par statut" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <option value="all">Tous les statuts</option>
                {(Object.keys(adminOrderStatusLabels) as AdminOrder['status'][]).map((status) => <option key={status} value={status}>{adminOrderStatusLabels[status]}</option>)}
              </select>
            </div>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {filteredAdminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande correspondante.</p> : filteredAdminOrders.map((order) => (
                <article key={order.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</h3><p className="mt-1 truncate text-xs text-slate-600">{order.customer_name} · {order.items_count} article(s)</p><p className="mt-1 text-xs text-slate-500">{order.customer_phone} · {new Date(order.created_at).toLocaleString('fr-FR')}</p></div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{adminOrderStatusLabels[order.status]}</span>{adminRole === 'super_admin' && <strong className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} FCFA</strong>}
                    {adminOrderTransitions[order.status].length > 0 && (
                      <label className="sr-only" htmlFor={`order-status-${order.id}`}>Modifier le statut de la commande {order.id}</label>
                    )}
                    {adminOrderTransitions[order.status].length > 0 && (
                      <select id={`order-status-${order.id}`} defaultValue="" disabled={orderActionLoadingId === order.id} onChange={(event) => { const status = event.target.value as AdminOrder['status']; if (status) void updateOrderStatus(order, status); event.currentTarget.value = ''; }} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">
                        <option value="" disabled>Changer le statut…</option>
                        {adminOrderTransitions[order.status].map((status) => <option key={status} value={status}>{adminOrderStatusLabels[status]}</option>)}
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
          <AdminCustomersView customers={customers} adminRole={adminRole} />
        )}

        {adminView === 'audience' && (
        <m.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 rounded-[1.5rem] border border-[#e7dfd3] bg-[#fffdf8] p-3 shadow-[0_12px_30px_rgba(33,23,18,.05)] sm:p-5 md:p-6"
        >
          <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#123e32] via-[#174c3d] to-[#1d5b47] p-4 text-white shadow-[0_12px_28px_rgba(18,62,50,.16)] sm:p-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Activity className="h-5 w-5 text-emerald-100" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">Mesure consentie · rapports agrégés</p>
                  <h2 className="mt-1 text-lg font-black tracking-tight sm:text-xl">Audience et acquisition</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-emerald-50/80">Sessions anonymisées après consentement. Elles ne représentent pas nécessairement des personnes distinctes.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <div role="group" aria-label="Période d’audience" className="flex min-h-10 items-center gap-1 rounded-xl border border-white/15 bg-black/10 p-1">
                  {[7, 30, 90].map((days) => (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={analyticsDays === days}
                      onClick={() => setAnalyticsDays(days)}
                      className={`min-h-8 flex-1 rounded-lg px-3 text-xs font-bold transition sm:flex-none ${analyticsDays === days ? 'bg-white text-[#123e32] shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                    >
                      {days} j
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => exportOperationsCsv(`matable-audience-${new Date().toISOString().slice(0, 10)}.csv`, ['Boutique', 'Pages vues consenties', 'Sessions distinctes', 'Commandes valides', 'Valeur des commandes FCFA', 'Commandes / sessions (%)'], filteredAudienceShops.map(shop => [shop.shop_name, shop.page_views, shop.unique_visitors, shop.orders, shop.sales, shop.conversion_rate]))} disabled={!filteredAudienceShops.length} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-3 text-xs font-bold text-[#123e32] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
                  <Download className="h-4 w-4" aria-hidden="true" />Exporter les boutiques
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-3 text-[10px] font-medium text-emerald-50/75">
              <span>{analytics ? `${analytics.days} derniers jours · données agrégées` : 'Chargement des données…'}</span>
              <span>{analyticsUpdatedAt
                ? `Mis à jour à ${new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(analyticsUpdatedAt))} · auto toutes les 30 s si visible`
                : 'Actualisation en cours'}</span>
            </div>
          </header>

          {analyticsError && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
              Mise à jour impossible : {analyticsError}
              {analytics && ` Les dernières données disponibles (${analytics.days} jours) sont conservées.`}
            </p>
          )}
          {analytics ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {([
                  { label: 'Pages vues mesurées', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.page_views), detail: 'Une même page est comptée une fois par session et par jour.', current: analytics.totals.page_views, previous: analytics.previous.page_views, series: analytics.daily.map((day) => day.page_views), icon: Eye, tone: 'emerald' },
                  { label: 'Sessions distinctes', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.unique_visitors), detail: 'Sessions anonymisées; pas des personnes identifiées.', current: analytics.totals.unique_visitors, previous: analytics.previous.unique_visitors, series: analytics.daily.map((day) => day.unique_visitors), icon: Users, tone: 'sky' },
                  { label: 'Commandes non annulées', value: new Intl.NumberFormat('fr-FR').format(analytics.totals.orders), detail: 'Commandes annulées et expirées exclues.', current: analytics.totals.orders, previous: analytics.previous.orders, series: analytics.daily.map((day) => day.orders), icon: ShoppingBag, tone: 'orange' },
                  { label: 'Montant des commandes', value: `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} FCFA`, detail: 'Montant demandé, pas un encaissement confirmé.', current: analytics.totals.sales, previous: analytics.previous.sales, series: analytics.daily.map((day) => day.sales), icon: DollarSign, tone: 'amber' },
                  { label: 'Commandes / sessions', value: `${analytics.totals.conversion_rate.toLocaleString('fr-FR')} %`, detail: 'Ratio indicatif; ne prouve pas une attribution de vente.', current: analytics.totals.conversion_rate, previous: analytics.previous.conversion_rate, percentagePoints: true, series: analytics.daily.map((day) => day.unique_visitors ? day.orders / day.unique_visitors * 100 : 0), icon: TrendingUp, tone: 'rose' },
                ] satisfies Omit<DashboardMetricCardProps, 'periodLabel'>[]).map((metric) => (
                  <DashboardMetricCard key={metric.label} {...metric} periodLabel={`vs ${analytics.days} j`} />
                ))}
              </div>

              <aside className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
                <strong>Comment lire ces chiffres ?</strong> Seules les pages vues enregistrées après consentement aux statistiques sont comptées. Les sessions utilisent un identifiant temporaire du navigateur : elles ne représentent pas des personnes uniques. Le ratio « commandes / sessions » rapproche deux totaux sur la période, mais ne prouve pas qu’une visite a généré une commande. Aucune liste de visiteurs identifiables n’est collectée ici.
              </aside>

              <div className="mt-5 grid lg:grid-cols-[1.2fr_1fr] gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-800">Pages vues consenties par jour</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">{analytics.days} jours</span>
                  </div>
                  <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                    <div className="flex h-44 flex-col justify-between pb-6 text-right text-[10px] tabular-nums text-slate-500">
                      {[maxDailyViews, Math.round(maxDailyViews / 2), 0].map((value, index) => <span key={`${value}-${index}`}>{new Intl.NumberFormat('fr-FR').format(value)}</span>)}
                    </div>
                    <div className="chart-grid relative h-44 min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
                      <svg role="img" aria-label={`Pages vues consenties par jour, échelle de 0 à ${maxDailyViews}`} viewBox="0 0 420 160" className="h-full w-full">
                        <path d="M18 35H402 M18 82H402 M18 140H402" stroke="#e2e8e5" strokeWidth="1" />
                        <polyline fill="none" stroke="var(--mt-green-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartPoints} />
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
        </m.section>
        )}

        {adminView === 'finance' && adminRole === 'super_admin' && (
          <section aria-labelledby="admin-finance-title" className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase text-emerald-800">Recettes MaTable</p><div className="flex items-center gap-2"><h2 id="admin-finance-title" className="mt-1 text-xl font-black text-slate-900">Argent</h2><ContextualHelp label="Indicateurs financiers" variant="info">Le MRR est une estimation : les abonnements annuels sont répartis sur douze mois et le tarif catalogue sert en l’absence de paiement enregistré. Les encaissements présentés sont les paiements GeniusPay confirmés; les commandes des clients ne sont pas des recettes MaTable.</ContextualHelp></div><p className="mt-1 text-xs text-slate-500">MRR estimé et paiements GeniusPay confirmés sur la période.</p></div>
              <select aria-label="Période du journal financier" value={financeDays} onChange={(event) => { setFinanceDays(Number(event.target.value)); setFinancePaymentsPage(0); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <option value={30}>30 derniers jours</option>
                <option value={90}>90 derniers jours</option>
                <option value={180}>180 derniers jours</option>
                <option value={365}>365 derniers jours</option>
              </select>
            </div>
            {!finance ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Chargement des données financières…</p> : <>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
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
                <p className="text-xs text-slate-500">Les promotions correspondent aux boosts confirmés par GeniusPay. Les remboursements signalés par le fournisseur apparaissent ici et nécessitent une revue des droits d’abonnement.</p>
              </section>
            </>}
          </section>
        )}

        {adminView === 'ambassadors' && adminRole === 'super_admin' && <AdminAmbassadors />}

        {adminView === 'subscriptions' && adminRole === 'super_admin' && (
          <AdminSubscriptionsView subscriptionsAdmin={subscriptionsAdmin} shops={shops} handleToggleActive={handleToggleActive} />
        )}

        {adminView === 'operations' && (
        <section className="chart-panel p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Centre opérationnel</h2>
                <p className="text-[11px] text-slate-500">État applicatif et outils de contact. Les sauvegardes et la release ne sont pas supervisées ici.</p>
              </div>
            </div>
            <button type="button" onClick={() => void fetchOperations()} disabled={operationsLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${operationsLoading ? 'animate-spin' : ''}`} /> Actualiser
            </button>
          </div>

          {(operationsError || healthPollingError) && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{operationsError || healthPollingError}</p>}
          {adminHealth ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <div className={`rounded-2xl border p-3 ${adminHealth.operational_status === 'ok' ? 'border-emerald-200 bg-emerald-50' : adminHealth.operational_status === 'critical' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                <span className={`text-[10px] font-bold ${adminHealth.operational_status === 'ok' ? 'text-emerald-700' : adminHealth.operational_status === 'critical' ? 'text-rose-800' : 'text-amber-800'}`}>Service</span>
                <strong className={`mt-1 block text-sm ${adminHealth.operational_status === 'ok' ? 'text-emerald-900' : adminHealth.operational_status === 'critical' ? 'text-rose-900' : 'text-amber-900'}`}>{adminHealth.operational_status === 'ok' ? 'Opérationnel' : adminHealth.operational_status === 'critical' ? 'Action requise' : 'À surveiller'}</strong>
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
          {adminHealth && (
            <section aria-label="Alertes opérationnelles" className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black text-slate-900">Suivi des automatisations</h3>
                <p className="text-[10px] text-slate-500">Vérifié à {new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(adminHealth.checked_at))} · actualisation automatique toutes les 30 s</p>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Rappels de commande dus : <strong>{adminHealth.operations.pending_order_reminders}</strong></p>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Commandes dépassant 2 h : <strong>{adminHealth.operations.overdue_pending_orders}</strong></p>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Échecs Push (24 h) : <strong>{adminHealth.operations.failed_push_deliveries_24h}</strong></p>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">Push : <strong>{adminHealth.operations.push_configured ? 'configuré' : 'non configuré'}</strong> · {adminHealth.operations.push_subscriptions} appareil(s)</p>
              </div>
              {adminHealth.alerts.length > 0 ? (
                <ul className="mt-3 space-y-2" role={adminHealth.operational_status === 'critical' ? 'alert' : 'status'}>
                  {adminHealth.alerts.map((alert) => (
                    <li key={alert.code} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${alert.severity === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                      <span className="font-semibold">{alert.message}</span>
                      <button type="button" onClick={() => {
                        if (alert.code.includes('pending_order')) {
                          setOrderStatusFilter('pending');
                          setOrderPage(0);
                          setAdminView('orders');
                        } else setAdminView('operations');
                      }} className="font-bold underline underline-offset-2">Examiner</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900" role="status">Aucune alerte opérationnelle détectée.</p>
              )}
            </section>
          )}
          <section aria-label="Statut des sauvegardes et de la release" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black text-amber-950">Sauvegardes et déploiements</h3>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">Non supervisés ici</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-amber-950">
              L’état du service ne confirme ni l’exécution du timer et la validité de la dernière sauvegarde, ni le SHA réellement déployé. Un service sain ne garantit donc pas qu’une sauvegarde récente est disponible.
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-bold text-amber-950">Vérifications VPS</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-white/80 p-3 text-[10px] leading-5 text-slate-800">{`systemctl list-timers matable-postgres-backup.timer --no-pager
journalctl -u matable-postgres-backup.service -n 10 --no-pager -o cat
make -f /srv/apps/matable/Makefile production-status`}</pre>
            </details>
          </section>

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
            <div><div className="flex items-center gap-2"><h2 id="admin-moderation-title" className="text-xl font-black text-slate-900">Avis & signalements</h2><ContextualHelp label="Modération des avis et signalements" variant="info">Publier rend un avis visible; masquer le retire de l’espace public. Les signalements peuvent être pris en charge, traités ou classés sans suite selon la vérification effectuée.</ContextualHelp></div><p className="mt-1 text-sm text-slate-600">Les avis restent invisibles au public jusqu’à leur validation.</p></div>
            {contentModerationError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{contentModerationError}</p>}
            <section className="chart-panel p-4 md:p-5">
              <h3 className="text-sm font-black text-slate-900">Avis à modérer ({contentModeration.reviews.length})</h3>
              <div className="mt-3 divide-y divide-slate-200">
                {contentModeration.reviews.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun avis en attente.</p> : contentModeration.reviews.map((review) => (
                  <article key={review.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="text-sm font-bold text-slate-900">{review.target_type === 'shop' ? review.shop_name : review.product_title || review.shop_name} · <span className="inline-flex text-amber-500" aria-label={`${review.rating} sur 5`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-3.5 w-3.5 ${index < review.rating ? 'fill-current' : 'text-slate-300'}`} aria-hidden="true" />)}</span></p><p className="mt-1 text-xs text-slate-500">{review.customer_name || 'Client'} · {new Date(review.created_at).toLocaleString('fr-FR')}</p></div>
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
        <>
        {adminRole === 'super_admin' && <AdminManualVerificationPanel />}
        <AdminIdentityVerificationPanel
          selectedShopId={selectedVerificationShopId}
          requestingShopId={verificationRequestShopId}
          onRequestVerification={(shopId) => void requestOwnerIdentityVerification(shopId)}
        />
        </>
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
                    <p className="mt-1 text-xs text-slate-500">{[shop.city, shop.category ? getCategoryDefaults(shop.category).label : null].filter(Boolean).join(' · ') || 'Localisation non renseignée'}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">Identité : {verificationStatusLabels[shop.merchant_verification_status] || 'Statut inconnu'}</p>
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
        {adminView === 'promotions' && adminRole === 'super_admin' && <AdminProductPromotions />}
        {adminView === 'advertising' && adminRole === 'super_admin' && <AdminHomepageMarketing />}

        {adminView === 'audit' && adminRole === 'super_admin' && (
          <AdminAuditLogView audit={audit} />
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
          ? adminNavigationGroups.flatMap((group) => group.items).filter((item) => ['overview', 'shops', 'identity', 'finance'].includes(item.id))
          : adminNavigationGroups.flatMap((group) => group.items)
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={adminView === id ? 'page' : undefined}
            onClick={() => { setAdminView(id); setIsAdminMenuOpen(false); }}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-t-lg px-1 text-[10px] font-bold sm:text-[11px] ${adminView === id ? 'text-[var(--mt-green-hover)]' : 'text-slate-500'}`}
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
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold sm:text-[11px] ${isAdminMenuOpen || !['overview', 'shops', 'identity', 'finance'].includes(adminView) ? 'text-[var(--mt-green-hover)]' : 'text-slate-500'}`}
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
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mt-green-primary)]">MaTable</p>
                <h2 id="admin-menu-title" className="text-lg font-black text-[var(--mt-gray-900)]">Autres rubriques</h2>
              </div>
              <button type="button" aria-label="Fermer le menu" onClick={() => setIsAdminMenuOpen(false)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav aria-label="Autres rubriques super-admin" className="space-y-4">
              {adminNavigationGroups.map((group) => {
                const items = group.items.filter((item) => !['overview', 'shops', 'identity', 'finance'].includes(item.id));
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
                          className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${adminView === id ? 'bg-[#d1fae5] text-[var(--mt-green-hover)]' : 'text-slate-800 hover:bg-emerald-50'}`}
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
