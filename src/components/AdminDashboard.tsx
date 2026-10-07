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
} from 'lucide-react';
import { AdminIdentityVerificationPanel } from './AdminIdentityVerificationPanel';
import { AdminShopList } from './AdminShopList';
import {
  audienceSourceLabels,
  formatAudienceChange,
  ownerNotificationTemplates,
  subscriptionStatusLabels,
} from './adminDashboardTypes';
import type {
  AdminAnalytics,
  AdminContentModeration,
  AdminFinance,
  AdminHealth,
  AdminMaintenance,
  AdminOrder,
  AdminShopItem,
  AdminSubscriptionShop,
  AdminSubscriptions,
} from './adminDashboardTypes';

export const AdminDashboard: React.FC = () => {
  const [adminView, setAdminView] = useState<'overview' | 'shops' | 'orders' | 'identity' | 'audience' | 'finance' | 'subscriptions' | 'operations' | 'moderation'>('overview');
  const [shops, setShops] = useState<AdminShopItem[]>([]);
  const [adminKey, setAdminKey] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'orders' | 'name'>('sales');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [financeDays, setFinanceDays] = useState(90);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptions | null>(null);
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [trialExtensionDays, setTrialExtensionDays] = useState(7);
  const [subscriptionActionShopId, setSubscriptionActionShopId] = useState<number | null>(null);
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState<AdminMaintenance | null>(null);
  const [maintenanceEnabledDraft, setMaintenanceEnabledDraft] = useState(false);
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState('Le service revient bientôt. Merci de votre patience.');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [notificationShopId, setNotificationShopId] = useState('');
  const [notificationTemplate, setNotificationTemplate] = useState<typeof ownerNotificationTemplates[number]['id']>('welcome');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [selectedVerificationShopId, setSelectedVerificationShopId] = useState<number | null>(null);
  const [featuredActionShopId, setFeaturedActionShopId] = useState<number | null>(null);
  const [contentModeration, setContentModeration] = useState<AdminContentModeration>({ reviews: [], reports: [] });
  const [contentModerationError, setContentModerationError] = useState('');

  const fetchAdminShops = async (refreshOperations = true) => {
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

      const res = await fetch('/api/admin/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsAuthenticated(true);
        await fetchAnalytics(analyticsDays);
        await fetchFinance(financeDays);
        await fetchSubscriptions();
        if (refreshOperations) await fetchOperations();
      } else if (res.status === 401) {
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async () => {
    try {
      setOperationsLoading(true);
      const [healthRes, ordersRes, maintenanceRes] = await Promise.all([
        fetch('/api/admin/health'),
        fetch('/api/admin/orders?limit=50'),
        fetch('/api/admin/maintenance'),
      ]);
      if (!healthRes.ok || !ordersRes.ok || !maintenanceRes.ok) throw new Error('Impossible de charger les outils opérationnels.');
      const [health, orderData, maintenance] = await Promise.all([healthRes.json(), ordersRes.json(), maintenanceRes.json()]);
      setAdminHealth(health);
      setAdminOrders(orderData.orders || []);
      setMaintenanceMode(maintenance);
      setMaintenanceEnabledDraft(maintenance.enabled);
      setMaintenanceMessageDraft(maintenance.message);
    } catch {
      showNotice('Les outils opérationnels sont momentanément indisponibles.');
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

  const fetchFinance = async (days: number) => {
    try {
      const response = await fetch(`/api/admin/payments?days=${days}`);
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
    if (!isAuthenticated) return;
    const refreshTimer = window.setInterval(() => {
      fetchAdminShops(false);
    }, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && adminView === 'moderation') void fetchContentModeration();
  }, [isAuthenticated, adminView]);

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: adminKey }),
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
              <h1 className="text-xl font-black text-slate-900">Accès super-admin</h1>
            </div>
          </div>
          <div className="mb-4 rounded-2xl bg-gradient-to-r from-[#eef5ff] to-[#f7e7c7] p-4 border-[2px] border-[#211712]">
            <div className="flex items-center gap-2 text-[#1b3a63] font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              Espace de contrôle central
            </div>
            <p className="mt-2 text-sm text-[#4a3a30]">Entrez la clé configurée côté serveur pour piloter les boutiques et les alertes.</p>
          </div>
          <div className="relative">
            <input
              type={showAdminKey ? 'text' : 'password'}
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="Clé super-admin"
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
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/toggle-active`, {
        method: 'PATCH',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setShops(prev =>
          prev.map(s => (s.id === shopId ? { ...s, ...data.shop } : s))
        );
        await fetchSubscriptions();
        showNotice('Statut boutique mis à jour.');
      } else {
        showNotice(data.error || 'Impossible de mettre à jour le statut.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
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
      (statusFilter === 'inactive' && !s.is_active))
  ).sort((a, b) => {
    if (sortBy === 'sales') return b.total_sales - a.total_sales;
    if (sortBy === 'orders') return b.orders_count - a.orders_count;
    return a.name.localeCompare(b.name);
  });
  const filteredAdminOrders = adminOrders.filter((order) => {
    const query = orderSearch.trim().toLowerCase();
    return !query || [order.shop_name, order.customer_name, order.customer_phone, String(order.id)]
      .some((value) => value.toLowerCase().includes(query));
  });
  const filteredFinancePayments = (finance?.payments || []).filter((payment) => {
    const query = paymentSearch.trim().toLowerCase();
    const matchesQuery = !query || [payment.shop_name, payment.provider_reference || '', payment.id]
      .some((value) => value.toLowerCase().includes(query));
    return matchesQuery
      && (paymentStatusFilter === 'all' || payment.status === paymentStatusFilter)
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
  const totalSales = shops.reduce((sum, shop) => sum + shop.total_sales, 0);
  const totalOrders = shops.reduce((sum, shop) => sum + shop.orders_count, 0);
  const averageOrderValue = totalOrders ? Math.round(totalSales / totalOrders) : 0;

  const exportShopsCsv = () => {
    const headers = ['Boutique', 'Slug', 'Statut', 'Valeur commandes FCFA', 'Commandes', 'Panier moyen', 'Produits'];
    const rows = filteredShops.map(shop => [
      shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.total_sales,
      shop.orders_count, shop.average_order_value, shop.products_count,
    ]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matable-super-admin-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const pendingVerificationShops = shops.filter((shop) => ['submitted', 'under_review'].includes(shop.merchant_verification_status || ''));
  const focusVerificationShop = (shopId: number) => {
    setSelectedVerificationShopId(shopId);
    setAdminView('identity');
    window.setTimeout(() => document.getElementById(`identity-verification-shop-${shopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  return (
    <div className="admin-dashboard min-h-screen pb-20">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white/90 text-slate-900 backdrop-blur-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.08),transparent_20%),radial-gradient(circle_at_top_right,_rgba(15,118,110,0.06),transparent_30%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="brand-mark brand-mark-header">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="min-w-0 break-words text-lg font-black tracking-tight text-[#211712] sm:text-xl">Super-Admin MaTable.ci</h1>
                  <span className="dashboard-chip dashboard-chip-soft">Tour de contrôle</span>
                </div>
                <p className="text-[11px] text-[#4a3a30] mt-0.5 leading-4 max-w-xl">
                  Administration des boutiques, commandes et vérifications
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

      <main className="mx-auto w-full max-w-6xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6">
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

        {adminView === 'overview' && pendingVerificationShops.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p><strong>{pendingVerificationShops.length} dossier(s) d’identité à examiner.</strong> Les photos attendent une validation visuelle.</p>
            </div>
            <button type="button" onClick={() => focusVerificationShop(pendingVerificationShops[0].id)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">
              Ouvrir le premier dossier
            </button>
          </motion.div>
        )}

        <div className="grid min-w-0 gap-3 sm:gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start xl:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Navigation super-admin" className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white/90 p-1.5 backdrop-blur-sm sm:grid-cols-4 sm:gap-2 lg:sticky lg:top-6 lg:grid-cols-1 lg:gap-2 lg:p-2">
          {[
            { id: 'overview' as const, label: 'Accueil', icon: Activity },
            { id: 'shops' as const, label: `Boutiques (${shops.length})`, icon: Store },
            { id: 'orders' as const, label: 'Commandes', icon: ShoppingBag },
            { id: 'moderation' as const, label: 'Avis & signalements', icon: Flag },
            { id: 'identity' as const, label: `Identité (${pendingVerificationShops.length})`, icon: ShieldCheck },
            { id: 'audience' as const, label: 'Audience', icon: BarChart3 },
            { id: 'finance' as const, label: 'Finances', icon: CreditCard },
            { id: 'subscriptions' as const, label: 'Abonnements', icon: RefreshCw },
            { id: 'operations' as const, label: 'Opérations', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-current={adminView === id ? 'page' : undefined} onClick={() => setAdminView(id)} className={`flex min-h-10 min-w-0 items-center justify-start gap-2 rounded-lg border px-2 py-2 text-left text-[11px] font-bold transition sm:min-h-11 sm:px-3 sm:text-sm ${adminView === id ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
              <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
        {adminView === 'overview' && (
          <section aria-labelledby="admin-overview-title" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><p className="text-xs font-bold uppercase text-[#176b55]">Accueil</p><h2 id="admin-overview-title" className="mt-1 text-xl font-black text-[#211712]">Vue d’ensemble</h2></div>
              <p className="text-xs text-slate-500">Actualisation automatique toutes les 30 secondes</p>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[{ label: 'Boutiques actives', value: `${activeShopsCount}/${shops.length}`, tone: 'bg-emerald-50 border-emerald-100 text-emerald-900' }, { label: 'Valeur des commandes', value: `${new Intl.NumberFormat('fr-FR').format(totalSales)} F`, tone: 'bg-sky-50 border-sky-100 text-sky-900' }, { label: 'Commandes', value: totalOrders, tone: 'bg-slate-100 border-slate-200 text-slate-900' }, { label: 'Panier moyen', value: `${new Intl.NumberFormat('fr-FR').format(averageOrderValue)} F`, tone: 'bg-amber-50 border-amber-100 text-amber-900' }].map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.3 }}
                  className={`rounded-2xl border p-3 shadow-sm ${item.tone}`}
                >
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{item.label}</span>
                  <span className="mt-2 block text-xl font-black text-slate-900">{item.value}</span>
                </motion.div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-labelledby="admin-follow-up-title" className="min-w-0 chart-panel p-4 md:p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><h3 id="admin-follow-up-title" className="text-sm font-black text-slate-900">Dossiers à suivre</h3><p className="mt-1 text-xs text-slate-500">Vérifications nécessitant une revue.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{pendingVerificationShops.length}</span></div>
                {pendingVerificationShops.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucun dossier en attente.</p> : <div className="divide-y divide-slate-200">{pendingVerificationShops.slice(0, 5).map((shop) => <div key={shop.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{shop.name}</p><p className="mt-1 text-xs text-slate-500">{shop.merchant_verification_status === 'under_review' ? 'Revue en cours' : 'À examiner'} · {shop.whatsapp_number}</p></div><button type="button" onClick={() => focusVerificationShop(shop.id)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Ouvrir</button></div>)}</div>}
                {pendingVerificationShops.length > 5 && <button type="button" onClick={() => setAdminView('identity')} className="mt-2 text-xs font-bold text-sky-800 underline underline-offset-2">Voir les {pendingVerificationShops.length} dossiers</button>}
              </section>
              <section aria-labelledby="admin-recent-orders-title" className="min-w-0 chart-panel p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><div className="min-w-0"><h3 id="admin-recent-orders-title" className="text-sm font-black text-slate-900">Commandes récentes</h3><p className="mt-1 text-xs text-slate-500">Dernières demandes enregistrées.</p></div><button type="button" onClick={() => setAdminView('orders')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes les commandes</button></div>
                {adminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande enregistrée.</p> : <div className="divide-y divide-slate-200">{adminOrders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</p><p className="mt-1 truncate text-xs text-slate-500">{order.customer_name} · {new Date(order.created_at).toLocaleDateString('fr-FR')}</p></div><div className="shrink-0 text-right"><strong className="block text-sm text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} F</strong><span className="text-[10px] font-semibold text-slate-500">{order.status}</span></div></div>)}</div>}
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
              <div><h2 id="admin-orders-title" className="text-sm font-black text-slate-900">Commandes récentes</h2><p className="mt-1 text-xs text-slate-500">Les 50 dernières commandes chargées par le service.</p></div>
              <button type="button" onClick={() => exportOperationsCsv(`matable-commandes-${new Date().toISOString().slice(0, 10)}.csv`, ['ID', 'Boutique', 'Client', 'Téléphone', 'Montant', 'Statut', 'Date'], filteredAdminOrders.map(order => [order.id, order.shop_name, order.customer_name, order.customer_phone, order.total_amount, order.status, order.created_at]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Exporter CSV</button>
            </div>
            <label className="relative mt-4 block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Rechercher boutique, client, téléphone ou numéro" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-700" /></label>
            <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {filteredAdminOrders.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune commande correspondante.</p> : filteredAdminOrders.map((order) => (
                <article key={order.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">#{order.id} · {order.shop_name}</h3><p className="mt-1 truncate text-xs text-slate-600">{order.customer_name} · {order.items_count} article(s)</p><p className="mt-1 text-xs text-slate-500">{order.customer_phone} · {new Date(order.created_at).toLocaleString('fr-FR')}</p></div>
                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{order.status}</span><strong className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} FCFA</strong></div>
                </article>
              ))}
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
                <h2 className="font-black text-slate-900 text-sm">Audience & flux</h2>
                <p className="text-[11px] text-slate-500 leading-4">Visites consenties, sessions, commandes et conversion.</p>
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
            <button type="button" onClick={() => exportOperationsCsv(`matable-audience-${new Date().toISOString().slice(0, 10)}.csv`, ['Boutique', 'Visites consenties', 'Sessions uniques', 'Commandes', 'Chiffre d’affaires FCFA', 'Ratio commandes'], analytics?.by_shop.map(shop => [shop.shop_name, shop.page_views, shop.unique_visitors, shop.orders, shop.sales, shop.conversion_rate]) || [])} disabled={!analytics?.by_shop.length} className="inline-flex min-h-10 min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold text-slate-700 disabled:opacity-50 sm:w-auto sm:px-3">
              <Download className="h-4 w-4" />Exporter
            </button>
          </div>

          {analytics ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {[
                  { label: 'Visites consenties', value: analytics.totals.page_views, current: analytics.totals.page_views, previous: analytics.previous.page_views, icon: Eye, tone: 'text-slate-700' },
                  { label: 'Sessions uniques', value: analytics.totals.unique_visitors, current: analytics.totals.unique_visitors, previous: analytics.previous.unique_visitors, icon: Users, tone: 'text-sky-700' },
                  { label: 'Commandes', value: analytics.totals.orders, current: analytics.totals.orders, previous: analytics.previous.orders, icon: ShoppingBag, tone: 'text-emerald-700' },
                  { label: 'Chiffre d’affaires', value: `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} F`, current: analytics.totals.sales, previous: analytics.previous.sales, icon: DollarSign, tone: 'text-amber-700' },
                  { label: 'Ratio commandes', value: `${analytics.totals.conversion_rate}%`, current: analytics.totals.conversion_rate, previous: analytics.previous.conversion_rate, percentagePoints: true, icon: TrendingUp, tone: 'text-rose-700' },
                ].map(({ label, value, current, previous, percentagePoints, icon: Icon, tone }) => (
                  <div key={label} className="metric-card p-3">
                    <Icon className={`w-4 h-4 ${tone} mb-3`} />
                    <span className="block text-[11px] text-slate-500">{label}</span>
                    <strong className="mt-1 block text-lg text-slate-900">{value}</strong>
                    <span className="mt-1 block text-[10px] font-bold text-slate-500">{formatAudienceChange(current, previous, percentagePoints)} vs période précédente</span>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[11px] text-slate-500">Comparaison avec les {analytics.days} jours précédents. Mesure limitée aux sessions ayant accepté les statistiques; une visite est comptée une fois par navigateur et par boutique.</p>

              <div className="mt-5 grid lg:grid-cols-[1.2fr_1fr] gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800">Visites consenties par jour</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">{analyticsDays} jours</span>
                  </div>
                  <div className="chart-grid relative h-44 rounded-2xl border border-slate-200 bg-white p-3">
                    <svg viewBox="0 0 420 160" className="h-full w-full">
                      <path d="M18 35H402 M18 82H402 M18 140H402" stroke="#e2e8e5" strokeWidth="1" />
                      <polyline
                        fill="none"
                        stroke="#176b55"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints}
                      />
                      {analytics.daily.map((day, index) => {
                        const x = 18 + (index * (384 / Math.max(analytics.daily.length - 1, 1)));
                        const y = 140 - (day.page_views / maxDailyViews) * 96;
                        return <circle key={day.date} cx={x} cy={y} r="2.5" fill="#d58b42" />;
                      })}
                    </svg>
                    <div className="absolute inset-x-3 bottom-3 flex justify-between text-[9px] text-slate-400">
                      {analytics.daily.filter((_, index) => index % Math.max(1, Math.ceil(analytics.daily.length / 6)) === 0 || index === analytics.daily.length - 1).map((day) => (
                        <span key={day.date}>{day.date.slice(5)}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <h3 className="text-xs font-black text-slate-800">Origine des visites</h3>
                  <p className="mt-1 text-[10px] text-slate-500">Catégories calculées sans conserver les URL référentes.</p>
                  <div className="mt-3 space-y-3">
                    {analytics.sources.length === 0 ? <p className="py-3 text-xs text-slate-500">Aucune visite consentie sur cette période.</p> : analytics.sources.map((source) => (
                      <div key={source.source}>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700"><span>{audienceSourceLabels[source.source]}</span><span>{source.visits} visites</span></div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.min(100, (source.visits / Math.max(1, analytics.sources[0].visits)) * 100)}%` }} /></div>
                        <div className="mt-1 text-[10px] text-slate-500">{source.visitors} sessions uniques</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <div className="mb-2"><h3 className="text-xs font-black text-slate-800">Performance par boutique</h3><p className="mt-1 text-[10px] text-slate-500">Les ratios rapprochent commandes et visiteurs sur la période; ils ne représentent pas une attribution individuelle.</p></div>
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead><tr className="border-y border-slate-200 text-[10px] uppercase text-slate-500"><th className="py-2 pr-3">Boutique</th><th className="px-3 py-2 text-right">Visites</th><th className="px-3 py-2 text-right">Sessions</th><th className="px-3 py-2 text-right">Commandes</th><th className="px-3 py-2 text-right">CA</th><th className="py-2 pl-3 text-right">Ratio</th></tr></thead>
                  <tbody>{analytics.by_shop.slice(0, 10).map((shop) => <tr key={shop.shop_id} className="border-b border-slate-100 text-slate-700"><th className="py-2.5 pr-3 font-bold">{shop.shop_name}</th><td className="px-3 py-2.5 text-right tabular-nums">{shop.page_views}</td><td className="px-3 py-2.5 text-right tabular-nums">{shop.unique_visitors}</td><td className="px-3 py-2.5 text-right tabular-nums">{shop.orders}</td><td className="px-3 py-2.5 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(shop.sales)} F</td><td className="py-2.5 pl-3 text-right font-bold tabular-nums">{shop.conversion_rate}%</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Chargement des données d’audience…</p>
          )}
        </motion.section>
        )}

        {adminView === 'finance' && (
          <section aria-labelledby="admin-finance-title" className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase text-emerald-800">Recettes MaTable.ci</p><h2 id="admin-finance-title" className="mt-1 text-xl font-black text-slate-900">Argent</h2><p className="mt-1 text-xs text-slate-500">Le MRR ne compte que les abonnements actifs. Les encaissements suivent les confirmations KadevPay.</p></div>
              <select aria-label="Période du journal financier" value={financeDays} onChange={(event) => { const days = Number(event.target.value); setFinanceDays(days); void fetchFinance(days); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <option value={30}>30 derniers jours</option>
                <option value={90}>90 derniers jours</option>
                <option value={180}>180 derniers jours</option>
                <option value={365}>365 derniers jours</option>
              </select>
            </div>
            {!finance ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Chargement des données financières…</p> : <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-900">MRR actuel</p><p className="mt-1 text-2xl font-black text-emerald-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.mrr)} FCFA</p><p className="mt-1 text-xs text-emerald-800">{finance.summary.active_subscriptions} abonnement(s) actifs</p></article>
                <article className="rounded-lg border border-sky-100 bg-sky-50 p-4"><p className="text-xs font-semibold text-sky-900">Encaissements période</p><p className="mt-1 text-2xl font-black text-sky-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.collected_amount)} FCFA</p><p className="mt-1 text-xs text-sky-800">{finance.summary.confirmed_count} paiement(s) confirmé(s)</p></article>
                <article className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-900">Revenus promotions</p><p className="mt-1 text-2xl font-black text-amber-950">{new Intl.NumberFormat('fr-FR').format(finance.summary.promotions.amount)} FCFA</p><p className="mt-1 text-xs text-amber-800">{finance.summary.promotions.count} paiement(s)</p></article>
                <article className="rounded-lg border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-900">Paiements à vérifier</p><p className="mt-1 text-2xl font-black text-rose-950">{finance.summary.failed_count + finance.summary.refunded_count + finance.summary.past_due_subscriptions}</p><p className="mt-1 text-xs text-rose-800">{finance.summary.failed_count} échec(s) · {finance.summary.refunded_count} remboursement(s) · {finance.summary.past_due_subscriptions} abonnement(s) en retard</p></article>
              </div>

              <section className="border-y border-slate-200 py-4" aria-label="MRR par formule">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="text-sm font-black text-slate-900">MRR par formule</h3><p className="mt-1 text-xs text-slate-500">Revenu mensuel théorique des forfaits actifs.</p></div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {finance.summary.mrr_by_tier.map((tier) => <div key={tier.tier} className="min-w-24"><p className="text-xs font-semibold capitalize text-slate-500">{tier.tier} · {tier.count}</p><p className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(tier.amount)} F</p></div>)}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-slate-500">Essais actifs</p><strong className="text-slate-900">{finance.summary.active_trials}</strong></div>
                  <div><p className="text-xs text-slate-500">Fin sous 7 jours</p><strong className="text-slate-900">{finance.summary.trials_expiring_7d}</strong></div>
                  <div><p className="text-xs text-slate-500">Essais terminés</p><strong className="text-slate-900">{finance.summary.completed_trials}</strong></div>
                  <div><p className="text-xs text-slate-500">Conversion essai → payant</p><strong className="text-slate-900">{finance.summary.converted_trials} · {finance.summary.trial_conversion_rate}%</strong></div>
                </div>
              </section>

              <section aria-labelledby="admin-payments-list-title" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 id="admin-payments-list-title" className="text-sm font-black text-slate-900">Journal des paiements</h3><p className="mt-1 text-xs text-slate-500">Jusqu’aux 200 derniers paiements et intentions sur {finance.days} jours.</p></div>
                  <button type="button" disabled={filteredFinancePayments.length === 0} onClick={() => exportOperationsCsv(`matable-paiements-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Boutique', 'Type', 'Formule', 'Durée', 'Montant', 'Devise', 'Statut', 'Référence'], filteredFinancePayments.map((payment) => [payment.paid_at || payment.created_at, payment.shop_name, payment.payment_type === 'promotion' ? 'Promotion' : 'Abonnement', payment.tier, payment.subscription_term, payment.amount, payment.currency, payment.status, payment.provider_reference || payment.id]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" />Exporter la sélection</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px_180px]">
                  <input type="search" value={paymentSearch} onChange={(event) => setPaymentSearch(event.target.value)} placeholder="Rechercher boutique ou référence" aria-label="Rechercher un paiement" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700" />
                  <select aria-label="Filtrer par type de paiement" value={paymentTypeFilter} onChange={(event) => setPaymentTypeFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"><option value="all">Tous les types</option><option value="subscription">Abonnements</option><option value="promotion">Promotions</option></select>
                  <select aria-label="Filtrer par statut de paiement" value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700"><option value="all">Tous les statuts</option><option value="paid">Confirmés</option><option value="pending">En attente</option><option value="failed">Échecs</option><option value="cancelled">Annulés</option><option value="refunded">Remboursés</option></select>
                </div>
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {filteredFinancePayments.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Aucun paiement correspondant à ces filtres.</p> : filteredFinancePayments.map((payment) => {
                    const isPaid = payment.status === 'paid';
                    const isPending = payment.status === 'pending';
                    const statusLabel = isPaid ? 'Confirmé' : isPending ? 'En attente' : payment.status === 'refunded' ? 'Remboursé' : payment.status === 'cancelled' ? 'Annulé' : 'Échec';
                    return <article key={payment.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{payment.shop_name} · {payment.payment_type === 'promotion' ? 'Promotion' : `Abonnement ${payment.tier} ${payment.subscription_term === 'annual' ? 'annuel' : 'mensuel'}`}</h4><p className="mt-1 truncate text-xs text-slate-500">{payment.provider_reference || payment.id}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.paid_at || payment.created_at))}</p></div>
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isPaid ? 'bg-emerald-100 text-emerald-900' : isPending ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-900'}`}>{statusLabel}</span><strong className="text-sm font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(payment.amount)} {payment.currency}</strong></div>
                    </article>;
                  })}
                </div>
                <p className="text-xs text-slate-500">Les promotions restent à zéro tant que leur tarif et leur parcours de paiement ne sont pas activés. Les remboursements ne sont comptés que si leur statut est remonté au journal.</p>
              </section>
            </>}
          </section>
        )}

        {adminView === 'subscriptions' && (
          <section aria-labelledby="admin-subscriptions-title" className="space-y-5">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-800">Revenus récurrents</p>
                <h2 id="admin-subscriptions-title" className="mt-1 text-xl font-black text-slate-900">Abonnements</h2>
                <p className="mt-1 text-xs text-slate-500">{subscriptions?.summary.whatsapp_reminders_enabled ? `Rappels automatiques à J−2 · ${subscriptions.summary.whatsapp_reminder_opt_ins} boutique(s) consentante(s).` : 'Configurez WhatsApp Business API pour activer les rappels automatiques ; les relances manuelles restent disponibles.'}</p>
              </div>
              <button type="button" onClick={() => void fetchSubscriptions()} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Actualiser</button>
            </header>

            {!subscriptions ? <p role="status" className="border-y border-slate-200 py-6 text-sm text-slate-500">Chargement des abonnements…</p> : <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="border-l-2 border-emerald-600 pl-3"><p className="text-xs text-slate-500">MRR actif</p><strong className="text-lg font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(subscriptions.summary.mrr)} F</strong></div>
                <div className="border-l-2 border-sky-600 pl-3"><p className="text-xs text-slate-500">Abonnements payants</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_subscriptions}</strong></div>
                <div className="border-l-2 border-amber-500 pl-3"><p className="text-xs text-slate-500">Essais actifs · fin sous 7 j</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_trials} · {subscriptions.summary.trials_expiring_7d}</strong></div>
                <div className="border-l-2 border-rose-600 pl-3"><p className="text-xs text-slate-500">Conversion essai → payant</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.converted_trials}/{subscriptions.summary.completed_trials} · {subscriptions.summary.trial_conversion_rate}%</strong></div>
              </div>

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

              <section aria-labelledby="trials-expiring-title" className="border-y border-amber-200 py-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 id="trials-expiring-title" className="text-sm font-black text-slate-900">Essais à relancer</h3><p className="mt-1 text-xs text-slate-500">Échéance dans les 7 prochains jours · l’envoi reste à confirmer dans WhatsApp · prolongation plafonnée à 30 jours par essai.</p></div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Prolonger de
                    <select aria-label="Durée de prolongation d’essai" value={trialExtensionDays} onChange={(event) => setTrialExtensionDays(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
                      {trialExtensionOptions.map((days) => <option key={days} value={days}>{days} jours</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 divide-y divide-amber-100">
                  {expiringTrials.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun essai n’expire sous 7 jours.</p> : expiringTrials.map((shop) => (
                    <article key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{shop.name}</h4><p className="mt-1 text-xs text-slate-500">{shop.plan} · {shop.trial_days_remaining === 1 ? 'échéance demain' : `${shop.trial_days_remaining} jours restants`} · fin le {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'date inconnue'} · prolongation : {shop.trial_extension_days_used}/30 jours</p></div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.whatsapp_reminders_opt_in ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Relancer WhatsApp</button> : <span className="self-center text-xs text-slate-500">Opt-in WhatsApp requis</span>}
                        <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Clock className="h-3.5 w-3.5" />{shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : `Prolonger (${shop.trial_extension_days_remaining} j restants)`}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section aria-labelledby="subscription-list-title" className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 id="subscription-list-title" className="text-sm font-black text-slate-900">Toutes les boutiques</h3><p className="mt-1 text-xs text-slate-500">Formule, état, prochaine échéance et activité.</p></div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px]">
                    <input type="search" value={subscriptionSearch} onChange={(event) => setSubscriptionSearch(event.target.value)} placeholder="Rechercher une boutique…" aria-label="Rechercher un abonnement" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700" />
                    <select aria-label="Filtrer les abonnements par statut" value={subscriptionStatusFilter} onChange={(event) => setSubscriptionStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                      <option value="all">Tous les statuts</option><option value="trialing">Essai actif</option><option value="active">Payé</option><option value="expired">Expiré</option><option value="past_due">À régulariser</option><option value="suspended">Suspendu</option><option value="not_started">Non démarré</option>
                    </select>
                  </div>
                </div>
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {filteredSubscriptions.length === 0 ? <p className="py-6 text-sm text-slate-500">Aucun abonnement ne correspond à ces critères.</p> : filteredSubscriptions.map((shop) => {
                    const canExtendTrial = shop.status === 'trialing'
                      || shop.status === 'expired' && Boolean(shop.trial_end) && !shop.subscription_expires_at;
                    const statusTone = shop.status === 'active' ? 'bg-emerald-100 text-emerald-900'
                      : shop.status === 'trialing' ? 'bg-sky-100 text-sky-900'
                        : shop.status === 'past_due' || shop.status === 'expired' ? 'bg-amber-100 text-amber-950'
                          : 'bg-slate-100 text-slate-700';
                    return <article key={shop.id} className="flex flex-col gap-3 py-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{shop.name}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">{shop.plan}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone}`}>{subscriptionStatusLabels[shop.status] || shop.status}</span>{!shop.is_active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">Boutique suspendue</span>}</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{shop.whatsapp_number}</span><span>{shop.products_count} article(s)</span><span>{shop.orders_count} commande(s)</span><span>{shop.publication_status === 'active' ? 'Publiée' : 'Non publiée'}</span><span>{shop.whatsapp_reminders_opt_in ? 'Rappel WhatsApp activé' : 'Sans opt-in WhatsApp'}</span><span>Inscrite le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.created_at))}</span></div>
                        <p className="mt-1 text-xs text-slate-500">{shop.status === 'trialing' ? 'Fin d’essai' : 'Prochain renouvellement'} : {shop.next_renewal_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.next_renewal_at)) : 'Non défini'}{shop.trial_start ? ` · Prolongation cumulée : ${shop.trial_extension_days_used}/30 jours` : ''} · Dernière commande : {shop.last_order_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.last_order_at)) : 'aucune'}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.status === 'trialing' && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7 && shop.whatsapp_reminders_opt_in && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="min-h-9 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">WhatsApp</button>}
                        {canExtendTrial && <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : `Prolonger (${shop.trial_extension_days_remaining} j restants)`}</button>}
                        <button type="button" onClick={() => void handleToggleActive(shop.id)} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold ${shop.is_active ? 'border-rose-200 text-rose-800 hover:bg-rose-50' : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>{shop.is_active ? 'Suspendre' : 'Réactiver'}</button>
                      </div>
                    </article>;
                  })}
                </div>
              </section>

              <section aria-labelledby="subscription-audit-title" className="border-t border-slate-200 pt-4">
                <h3 id="subscription-audit-title" className="text-sm font-black text-slate-900">Actions admin récentes</h3>
                {subscriptions.audit_logs.length === 0 ? <p className="mt-2 text-xs text-slate-500">Les prolongations, corrections et relances apparaîtront ici.</p> : <div className="mt-2 divide-y divide-slate-200">
                {subscriptions.audit_logs.slice(0, 8).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="font-semibold text-slate-800">{entry.action === 'trial_extended' ? 'Essai prolongé' : entry.action === 'trial_expiry_reconciled' ? 'Échéance d’essai synchronisée' : entry.action === 'trial_reminder_prepared' ? 'Relance WhatsApp préparée' : entry.action === 'shop_suspended' ? 'Boutique suspendue' : entry.action === 'shop_reactivated' ? 'Boutique réactivée' : entry.action} · {entry.shop_name || 'Boutique supprimée'}</span><time className="text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.created_at))}</time></div>)}
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
            <button type="button" onClick={fetchOperations} disabled={operationsLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${operationsLoading ? 'animate-spin' : ''}`} /> Actualiser
            </button>
          </div>

          {adminHealth && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-[10px] font-bold text-emerald-700">Service</span><strong className="mt-1 block text-sm text-emerald-900">Opérationnel</strong></div>
              <div className={`rounded-2xl border p-3 ${adminHealth.database === 'postgresql' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><span className={`text-[10px] font-bold ${adminHealth.database === 'postgresql' ? 'text-emerald-700' : 'text-amber-800'}`}>Base réellement utilisée</span><strong className={`mt-1 block text-sm ${adminHealth.database === 'postgresql' ? 'text-emerald-950' : 'text-amber-950'}`}>{adminHealth.database === 'sqlite' ? 'SQLite (fichier local)' : adminHealth.database === 'postgresql' ? 'PostgreSQL (Neon)' : adminHealth.database}</strong><span className={`mt-1 block text-[10px] leading-4 ${adminHealth.database === 'postgresql' ? 'text-emerald-800' : 'text-amber-900'}`}>{adminHealth.database === 'postgresql' ? 'Connexion persistante activée en production.' : 'SQLite convient au développement et aux tests locaux.'}</span></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-bold text-sky-700">Commandes</span><strong className="mt-1 block text-sm text-sky-900">{adminHealth.counts.orders}</strong></div>
            </div>
          )}

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 ${maintenanceMode?.enabled ? 'text-amber-700' : 'text-slate-500'}`} />
                  <h3 className="text-sm font-black text-slate-900">Mode maintenance</h3>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${maintenanceMode?.enabled ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                    {maintenanceMode?.enabled ? 'Activé' : 'Désactivé'}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">Le site marchand et ses API seront suspendus. L’administration, les contrôles de santé et les webhooks de paiement resteront accessibles.</p>
              </div>
              <button type="button" onClick={saveMaintenanceMode} disabled={maintenanceSaving || !maintenanceMode} className={`inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 sm:w-auto ${maintenanceEnabledDraft ? 'bg-amber-800 hover:bg-amber-900' : 'bg-emerald-800 hover:bg-emerald-900'}`}>
                {maintenanceSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {maintenanceEnabledDraft ? 'Enregistrer la maintenance' : 'Enregistrer les réglages'}
              </button>
            </div>
            <label className="mt-3 block text-xs font-bold text-slate-700" htmlFor="admin-maintenance-message">Message affiché aux visiteurs</label>
            <textarea id="admin-maintenance-message" value={maintenanceMessageDraft} maxLength={240} onChange={(event) => setMaintenanceMessageDraft(event.target.value)} rows={2} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-700" />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>Ce message sera aussi renvoyé aux API publiques.</span><span>{maintenanceMessageDraft.length}/240</span></div>
          </div>

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
                {ownerNotificationTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
              <button type="button" onClick={prepareOwnerNotification} disabled={notificationLoading || !notificationShopId} className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> {notificationLoading ? 'Préparation...' : 'Ouvrir WhatsApp'}
              </button>
            </div>
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
        <AdminIdentityVerificationPanel selectedShopId={selectedVerificationShopId} />
        )}

        {adminView === 'shops' && (
          <AdminShopList
            shops={filteredShops}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onExport={exportShopsCsv}
            onFocusVerification={focusVerificationShop}
            onOpenMerchantSpace={handleOpenMerchantSpace}
            featuredActionShopId={featuredActionShopId}
            onSetFeatured={(shopId, days) => void handleSetFeatured(shopId, days)}
            onToggleActive={(shopId) => void handleToggleActive(shopId)}
          />
        )}
        </div>
        </div>

      </main>
    </div>
  );
};
