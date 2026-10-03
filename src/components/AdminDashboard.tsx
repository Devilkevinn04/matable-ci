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
  Filter,
  Package,
  TrendingUp,
  Eye,
  EyeOff,
  Users,
  Activity,
  ShoppingBag,
  LogOut,
  Star,
} from 'lucide-react';
import { Shop } from '../types';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { AdminIdentityVerificationPanel } from './AdminIdentityVerificationPanel';

interface AdminShopItem extends Shop {
  products_count: number;
  orders_count: number;
  total_sales: number;
  average_order_value: number;
  last_order_at: string | null;
}

interface AdminAnalytics {
  days: number;
  daily: { date: string; page_views: number; unique_visitors: number }[];
  by_shop: { shop_id: number; shop_name: string; page_views: number; unique_visitors: number; orders: number; sales: number; conversion_rate: number }[];
  totals: { page_views: number; unique_visitors: number; orders: number; sales: number; conversion_rate: number };
}

interface AdminFinance {
  days: number;
  since: string;
  summary: {
    confirmed_count: number;
    collected_amount: number;
    pending_count: number;
    pending_amount: number;
    failed_count: number;
    refunded_count: number;
    mrr: number;
    active_subscriptions: number;
    mrr_by_tier: { tier: string; count: number; amount: number }[];
    active_trials: number;
    trials_expiring_7d: number;
    completed_trials: number;
    converted_trials: number;
    trial_conversion_rate: number;
    past_due_subscriptions: number;
    whatsapp_reminders_enabled: boolean;
    whatsapp_reminder_opt_ins: number;
    subscriptions: { count: number; amount: number };
    promotions: { count: number; amount: number };
  };
  by_tier: { tier: string; count: number; amount: number }[];
  payments: {
    id: string;
    shop_id: number;
    shop_name: string;
    payment_type: 'subscription' | 'promotion';
    tier: string;
    amount: number;
    currency: string;
    status: string;
    provider_reference: string | null;
    created_at: string;
    paid_at: string | null;
  }[];
}

interface AdminSubscriptionShop {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string;
  owner_email: string | null;
  whatsapp_reminders_opt_in: boolean;
  plan: string;
  status: string;
  is_active: boolean;
  publication_status: string | null;
  merchant_verification_status: string | null;
  trial_start: string | null;
  trial_end: string | null;
  trial_days_remaining: number | null;
  subscription_expires_at: string | null;
  next_renewal_at: string | null;
  created_at: string;
  products_count: number;
  orders_count: number;
  last_order_at: string | null;
}

interface AdminSubscriptions {
  summary: {
    mrr: number;
    active_subscriptions: number;
    mrr_by_tier: { tier: string; count: number; amount: number }[];
    active_trials: number;
    trials_expiring_7d: number;
    completed_trials: number;
    converted_trials: number;
    trial_conversion_rate: number;
    past_due_subscriptions: number;
    whatsapp_reminders_enabled: boolean;
    whatsapp_reminder_opt_ins: number;
  };
  shops: AdminSubscriptionShop[];
  audit_logs: { id: number; action: string; shop_id: number | null; shop_name: string | null; details: string; created_at: string }[];
}

interface AdminOrder {
  id: number;
  shop_id: number;
  shop_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  total_amount: number;
  status: string;
  created_at: string;
  items_count: number;
}

interface AdminHealth {
  status: string;
  checked_at: string;
  database: string;
  database_path: string | null;
  counts: { shops: number; products: number; orders: number };
  latest_analytics_event_at: string | null;
  integrations: { whatsapp_click_to_chat: string };
}

const ownerNotificationTemplates = [
  { id: 'welcome', label: 'Bienvenue et démarrage' },
  { id: 'catalog', label: 'Rappel catalogue à jour' },
  { id: 'orders', label: 'Rappel nouvelles commandes' },
  { id: 'support', label: 'Proposition d’assistance' },
  { id: 'trial_expiring', label: 'Relance essai arrivant à échéance' },
] as const;

const subscriptionStatusLabels: Record<string, string> = {
  trialing: 'Essai actif',
  active: 'Payé',
  expired: 'Expiré',
  past_due: 'À régulariser',
  suspended: 'Suspendu',
  cancelled: 'Résilié',
  not_started: 'Non démarré',
};

export const AdminDashboard: React.FC = () => {
  const [adminView, setAdminView] = useState<'overview' | 'shops' | 'orders' | 'identity' | 'audience' | 'finance' | 'subscriptions' | 'operations'>('overview');
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
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [notificationShopId, setNotificationShopId] = useState('');
  const [notificationTemplate, setNotificationTemplate] = useState<typeof ownerNotificationTemplates[number]['id']>('welcome');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [selectedVerificationShopId, setSelectedVerificationShopId] = useState<number | null>(null);
  const [featuredActionShopId, setFeaturedActionShopId] = useState<number | null>(null);

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

      const res = await fetch('/api/admin/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsAuthenticated(true);
        await fetchAnalytics(analyticsDays);
        await fetchFinance(financeDays);
        await fetchSubscriptions();
        await fetchOperations();
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
      const [healthRes, ordersRes] = await Promise.all([
        fetch('/api/admin/health'),
        fetch('/api/admin/orders?limit=50'),
      ]);
      if (!healthRes.ok || !ordersRes.ok) throw new Error('Impossible de charger les outils opérationnels.');
      const [health, orderData] = await Promise.all([healthRes.json(), ordersRes.json()]);
      setAdminHealth(health);
      setAdminOrders(orderData.orders || []);
    } catch {
      showNotice('Les outils opérationnels sont momentanément indisponibles.');
    } finally {
      setOperationsLoading(false);
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

  useEffect(() => {
    fetchAdminShops();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshTimer = window.setInterval(() => {
      fetchAdminShops();
    }, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [isAuthenticated]);

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
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/extend-trial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: trialExtensionDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de prolonger l’essai.');
      showNotice(`Essai prolongé de ${trialExtensionDays} jours pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de prolonger l’essai.');
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
        const x = 18 + (index * (420 / Math.max(analytics.daily.length - 1, 1)));
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
    // ⚠️ Must open the window SYNCHRONOUSLY before any await,
    // otherwise browsers treat it as a popup and block it.
    // No noopener here: we need to control the tab (same-origin URL).
    const newTab = window.open('about:blank', '_blank');
    if (!newTab) {
      showNotice('Impossible d\'ouvrir un nouvel onglet. Vérifiez les paramètres de votre navigateur.');
      return;
    }
    // Show a loading page while we fetch the real URL
    newTab.document.write('<html><head><title>Chargement…</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc"><p style="color:#64748b;font-size:14px">⏳ Chargement de l\'espace commerçant…</p></body></html>');
    newTab.document.close();
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/access-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        newTab.close();
        showNotice(data.error || 'Impossible de générer le lien privé.');
        return;
      }
      newTab.location.href = data.access_url;
      showNotice('Espace propriétaire ouvert dans un nouvel onglet.');
    } catch {
      newTab.close();
      showNotice('Impossible de contacter le serveur.');
    }
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
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-xl tracking-tight text-[#211712]">Super-Admin MaTable.ci</h1>
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
                onClick={fetchAdminShops}
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

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
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

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Navigation super-admin" className="sticky top-2 z-20 flex min-w-0 gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white/90 p-1.5 backdrop-blur-sm lg:top-6 lg:flex-col lg:overflow-visible">
          {[
            { id: 'overview' as const, label: 'Accueil', icon: Activity },
            { id: 'shops' as const, label: `Boutiques (${shops.length})`, icon: Store },
            { id: 'orders' as const, label: 'Commandes', icon: ShoppingBag },
            { id: 'identity' as const, label: `Identité (${pendingVerificationShops.length})`, icon: ShieldCheck },
            { id: 'audience' as const, label: 'Audience', icon: BarChart3 },
            { id: 'finance' as const, label: 'Finances', icon: CreditCard },
            { id: 'subscriptions' as const, label: 'Abonnements', icon: RefreshCw },
            { id: 'operations' as const, label: 'Opérations', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-current={adminView === id ? 'page' : undefined} onClick={() => setAdminView(id)} className={`flex min-h-11 min-w-max items-center justify-start gap-2 rounded-lg border px-3 py-2 text-left text-xs font-bold transition sm:text-sm lg:w-full ${adminView === id ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
              <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
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
              <section aria-labelledby="admin-follow-up-title" className="chart-panel p-4 md:p-5">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 id="admin-follow-up-title" className="text-sm font-black text-slate-900">Dossiers à suivre</h3><p className="mt-1 text-xs text-slate-500">Vérifications nécessitant une revue.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{pendingVerificationShops.length}</span></div>
                {pendingVerificationShops.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucun dossier en attente.</p> : <div className="divide-y divide-slate-200">{pendingVerificationShops.slice(0, 5).map((shop) => <div key={shop.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{shop.name}</p><p className="mt-1 text-xs text-slate-500">{shop.merchant_verification_status === 'under_review' ? 'Revue en cours' : 'À examiner'} · {shop.whatsapp_number}</p></div><button type="button" onClick={() => focusVerificationShop(shop.id)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Ouvrir</button></div>)}</div>}
                {pendingVerificationShops.length > 5 && <button type="button" onClick={() => setAdminView('identity')} className="mt-2 text-xs font-bold text-sky-800 underline underline-offset-2">Voir les {pendingVerificationShops.length} dossiers</button>}
              </section>
              <section aria-labelledby="admin-recent-orders-title" className="chart-panel p-4 md:p-5">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3"><div><h3 id="admin-recent-orders-title" className="text-sm font-black text-slate-900">Commandes récentes</h3><p className="mt-1 text-xs text-slate-500">Dernières demandes enregistrées.</p></div><button type="button" onClick={() => setAdminView('orders')} className="shrink-0 text-xs font-bold text-sky-800 underline underline-offset-2">Toutes les commandes</button></div>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Audience & flux</h2>
                <p className="text-[11px] text-slate-500 leading-4">Visites uniques, vues, commandes et conversion.</p>
              </div>
            </div>
            <select
              value={analyticsDays}
              onChange={event => { const days = Number(event.target.value); setAnalyticsDays(days); fetchAnalytics(days); }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 outline-none"
            >
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
            </select>
          </div>

          {analytics ? (
            <>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Pages vues', value: analytics.totals.page_views, icon: Eye, tone: 'text-slate-700' },
                  { label: 'Visiteurs uniques', value: analytics.totals.unique_visitors, icon: Users, tone: 'text-sky-700' },
                  { label: 'Commandes', value: analytics.totals.orders, icon: ShoppingBag, tone: 'text-emerald-700' },
                  { label: 'CA période', value: `${new Intl.NumberFormat('fr-FR').format(analytics.totals.sales)} F`, icon: DollarSign, tone: 'text-amber-700' },
                  { label: 'Taux conversion', value: `${analytics.totals.conversion_rate}%`, icon: TrendingUp, tone: 'text-rose-700' },
                ].map(({ label, value, icon: Icon, tone }) => (
                  <div key={label} className="metric-card p-3">
                    <Icon className={`w-4 h-4 ${tone} mb-3`} />
                    <span className="block text-[11px] text-slate-500">{label}</span>
                    <strong className="mt-1 block text-lg text-slate-900">{value}</strong>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid lg:grid-cols-[1.2fr_1fr] gap-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800">Trafic quotidien</h3>
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">{analyticsDays} jours</span>
                  </div>
                  <div className="chart-grid relative h-44 rounded-2xl border border-slate-200 bg-white p-3">
                    <svg viewBox="0 0 420 160" className="h-full w-full">
                      <polyline
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints}
                      />
                    </svg>
                    <div className="absolute inset-x-3 bottom-3 flex justify-between text-[9px] text-slate-400">
                      {analytics.daily.map((day, index) => (
                        <span key={day.date} className={index % Math.max(1, Math.ceil(analytics.daily.length / 6)) === 0 || index === analytics.daily.length - 1 ? '' : 'invisible'}>{day.date.slice(5)}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <h3 className="text-xs font-black text-slate-800">Performance par boutique</h3>
                  <p className="mt-1 text-[10px] text-slate-400">Indicateurs cumulés sur la période sélectionnée.</p>
                  <div className="mt-3 space-y-3">
                    {analytics.by_shop.map((shop) => (
                      <div key={shop.shop_id} className="mini-row">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700">
                            <span className="truncate pr-2">{shop.shop_name}</span>
                            <span>{shop.page_views} vues</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-violet-500" style={{ width: `${Math.min(100, (shop.page_views / Math.max(1, analytics.by_shop[0]?.page_views || 1)) * 100)}%` }} />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                            <span>{shop.unique_visitors} uniques</span>
                            <span>{shop.conversion_rate}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
                  <button type="button" disabled={filteredFinancePayments.length === 0} onClick={() => exportOperationsCsv(`matable-paiements-${new Date().toISOString().slice(0, 10)}.csv`, ['Date', 'Boutique', 'Type', 'Formule', 'Montant', 'Devise', 'Statut', 'Référence'], filteredFinancePayments.map((payment) => [payment.paid_at || payment.created_at, payment.shop_name, payment.payment_type === 'promotion' ? 'Promotion' : 'Abonnement', payment.tier, payment.amount, payment.currency, payment.status, payment.provider_reference || payment.id]))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-4 w-4" />Exporter la sélection</button>
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
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{payment.shop_name} · {payment.payment_type === 'promotion' ? 'Promotion' : `Abonnement ${payment.tier}`}</h4><p className="mt-1 truncate text-xs text-slate-500">{payment.provider_reference || payment.id}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.paid_at || payment.created_at))}</p></div>
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

              <section aria-labelledby="trials-expiring-title" className="border-y border-amber-200 py-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><h3 id="trials-expiring-title" className="text-sm font-black text-slate-900">Essais à relancer</h3><p className="mt-1 text-xs text-slate-500">Échéance dans les 7 prochains jours · l’envoi reste à confirmer dans WhatsApp.</p></div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Prolonger de
                    <select aria-label="Durée de prolongation d’essai" value={trialExtensionDays} onChange={(event) => setTrialExtensionDays(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
                      <option value={7}>7 jours</option><option value={14}>14 jours</option><option value={30}>30 jours</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 divide-y divide-amber-100">
                  {expiringTrials.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun essai n’expire sous 7 jours.</p> : expiringTrials.map((shop) => (
                    <article key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{shop.name}</h4><p className="mt-1 text-xs text-slate-500">{shop.plan} · {shop.trial_days_remaining === 1 ? 'échéance demain' : `${shop.trial_days_remaining} jours restants`} · fin le {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'date inconnue'}</p></div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.whatsapp_reminders_opt_in ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Relancer WhatsApp</button> : <span className="self-center text-xs text-slate-500">Opt-in WhatsApp requis</span>}
                        <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleExtendTrial(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Clock className="h-3.5 w-3.5" />Prolonger</button>
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
                        <p className="mt-1 text-xs text-slate-500">{shop.status === 'trialing' ? 'Fin d’essai' : 'Prochain renouvellement'} : {shop.next_renewal_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.next_renewal_at)) : 'Non défini'} · Dernière commande : {shop.last_order_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.last_order_at)) : 'aucune'}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {shop.status === 'trialing' && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7 && shop.whatsapp_reminders_opt_in && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="min-h-9 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">WhatsApp</button>}
                        {canExtendTrial && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleExtendTrial(shop)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Prolonger l’essai</button>}
                        <button type="button" onClick={() => void handleToggleActive(shop.id)} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold ${shop.is_active ? 'border-rose-200 text-rose-800 hover:bg-rose-50' : 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'}`}>{shop.is_active ? 'Suspendre' : 'Réactiver'}</button>
                      </div>
                    </article>;
                  })}
                </div>
              </section>

              <section aria-labelledby="subscription-audit-title" className="border-t border-slate-200 pt-4">
                <h3 id="subscription-audit-title" className="text-sm font-black text-slate-900">Actions admin récentes</h3>
                {subscriptions.audit_logs.length === 0 ? <p className="mt-2 text-xs text-slate-500">Les prolongations et relances apparaîtront ici.</p> : <div className="mt-2 divide-y divide-slate-200">
                  {subscriptions.audit_logs.slice(0, 8).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="font-semibold text-slate-800">{entry.action === 'trial_extended' ? 'Essai prolongé' : entry.action === 'trial_reminder_prepared' ? 'Relance WhatsApp préparée' : entry.action === 'shop_suspended' ? 'Boutique suspendue' : entry.action === 'shop_reactivated' ? 'Boutique réactivée' : entry.action} · {entry.shop_name || 'Boutique supprimée'}</span><time className="text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.created_at))}</time></div>)}
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

          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-xs font-black text-emerald-950">Notifier un propriétaire</h3>
                <p className="text-[11px] text-emerald-800">Choisissez un message prédéfini. WhatsApp s’ouvre avec le texte personnalisé prêt à envoyer.</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
              <select value={notificationShopId} onChange={(event) => setNotificationShopId(event.target.value)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                <option value="">Choisir une boutique</option>
                {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
              </select>
              <select value={notificationTemplate} onChange={(event) => setNotificationTemplate(event.target.value as typeof notificationTemplate)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                {ownerNotificationTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
              </select>
              <button type="button" onClick={prepareOwnerNotification} disabled={notificationLoading || !notificationShopId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> {notificationLoading ? 'Préparation...' : 'Ouvrir WhatsApp'}
              </button>
            </div>
          </div>

        </section>
        )}

        {adminView === 'identity' && (
        <AdminIdentityVerificationPanel selectedShopId={selectedVerificationShopId} />
        )}

        {adminView === 'shops' && <>
        <div className="chart-panel p-3 md:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher une boutique..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-violet-300 focus:bg-white"
              />
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{filteredShops.length} boutique(s)</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            {(['all', 'active', 'inactive'] as const).map(filter => (
              <button key={filter} onClick={() => setStatusFilter(filter)} className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${statusFilter === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {filter === 'all' ? 'Toutes' : filter === 'active' ? 'Actives' : 'Inactives'}
              </button>
            ))}
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none">
              <option value="sales">Trier par valeur des commandes</option>
              <option value="orders">Trier par commandes</option>
              <option value="name">Trier par nom</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-4">
            <h2 className="font-black text-slate-900 text-sm">Liste des commerçants</h2>
            <button type="button" onClick={exportShopsCsv} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Exporter CSV</button>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredShops.length === 0 && <p className="p-5 text-sm text-slate-500">Aucune boutique ne correspond à ces critères.</p>}
            {filteredShops.map((shop) => {
              const isFeatured = Boolean(shop.featured_until && Date.parse(shop.featured_until) > Date.now());
              return (
                <motion.div
                  key={shop.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-slate-900 text-base">{shop.name}</h3>
                      {isFeatured && <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-900"><Star className="h-3 w-3 fill-current" aria-hidden="true" /> À la une</span>}
                      <span className="text-[10px] text-slate-400 font-mono">/{shop.slug}</span>
                      <span
                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-md"
                        style={{ color: getCategoryDefaults(shop.category).primaryColor, backgroundColor: `${getCategoryDefaults(shop.category).primaryColor}1A` }}
                      >
                        {getCategoryDefaults(shop.category).icon} {getCategoryDefaults(shop.category).label}
                      </span>
                      {['submitted', 'under_review'].includes(shop.merchant_verification_status || '') && (
                        <button type="button" onClick={() => focusVerificationShop(shop.id)} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-900 transition hover:bg-amber-100">
                          <Eye className="h-3 w-3" /> {shop.merchant_verification_status === 'under_review' ? 'Revue en cours' : 'À examiner'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>📞 {shop.whatsapp_number}</span>
                      <span>📍 {shop.city || 'Abidjan'}</span>
                      <span>📦 {shop.products_count} articles</span>
                      <span>🛒 {shop.orders_count} commandes</span>
                      <span>💰 {new Intl.NumberFormat('fr-FR').format(shop.total_sales)} FCFA</span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-4 pt-1">
                      <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /><span>Dernière commande : <strong>{shop.last_order_at ? new Date(shop.last_order_at).toLocaleDateString('fr-FR') : 'Aucune'}</strong></span></div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button onClick={() => handleOpenMerchantSpace(shop.id)} disabled={!shop.is_active} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Ouvrir l’espace</button>
                    <select
                      aria-label={`Mettre ${shop.name} à la une`}
                      value={isFeatured ? 'featured' : ''}
                      disabled={featuredActionShopId === shop.id}
                      onChange={(event) => {
                        const days = Number(event.target.value);
                        if (Number.isInteger(days)) void handleSetFeatured(shop.id, days);
                      }}
                      className="max-w-48 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
                    >
                      <option value="" disabled>☆ Mettre à la une…</option>
                      {isFeatured && <option value="featured">★ À la une</option>}
                      {isFeatured && <option value="0">Retirer de la une</option>}
                      <option value="7">7 jours</option>
                      <option value="14">14 jours</option>
                      <option value="30">30 jours</option>
                      <option value="60">60 jours</option>
                      <option value="90">90 jours</option>
                    </select>
                    <button onClick={() => handleToggleActive(shop.id)} className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${shop.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                      {shop.is_active ? '● ON' : '○ OFF'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
        </>}
        </div>
        </div>

      </main>
    </div>
  );
};


