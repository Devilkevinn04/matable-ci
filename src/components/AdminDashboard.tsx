import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Store,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Phone,
  Send,
  Zap,
  DollarSign,
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
  Sparkles,
} from 'lucide-react';
import { Shop } from '../types';

interface AdminShopItem extends Shop {
  payment_status: 'pending' | 'awaiting_review' | 'approved' | 'rejected' | 'suspended';
  daysRemaining: number;
  alertLevel: string;
  alertMessage: string;
  shouldDeactivate: boolean;
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
  database_path: string;
  counts: { shops: number; products: number; orders: number };
  latest_analytics_event_at: string | null;
  integrations: { paystack: string; whatsapp_cloud: string; whatsapp_click_to_chat: string };
}

export const AdminDashboard: React.FC = () => {
  const [shops, setShops] = useState<AdminShopItem[]>([]);
  const [adminKey, setAdminKey] = useState('');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expiring'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'orders' | 'expiry' | 'name'>('sales');
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<any | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [adminOrders, setAdminOrders] = useState<AdminOrder[]>([]);
  const [adminHealth, setAdminHealth] = useState<AdminHealth | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);

  const fetchAdminShops = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsAuthenticated(true);
        await fetchAnalytics(analyticsDays);
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

  useEffect(() => {
    fetchAdminShops();
  }, []);

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
      if (res.ok) {
        setShops(prev =>
          prev.map(s => (s.id === shopId ? { ...s, is_active: !s.is_active } : s))
        );
        showNotice('Statut boutique mis à jour.');
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Impossible de mettre à jour le statut.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
    }
  };

  // Extend subscription (+1, +3, +6, +12 months)
  const handleExtendSubscription = async (shopId: number, months: number) => {
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/extend-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months }),
      });
      if (res.ok) {
        const data = await res.json();
        showNotice(data.message);
        fetchAdminShops();
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Impossible de prolonger la boutique.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
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

  // Change Subscription Tier (Standard, Premium, Pro)
  const handleUpdateTier = async (shopId: number, tier: 'standard' | 'premium' | 'pro') => {
    try {
      const res = await fetch(`/api/shops/${shopId}/tier`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_tier: tier }),
      });
      if (res.ok) {
        setShops(prev =>
          prev.map(s => (s.id === shopId ? { ...s, subscription_tier: tier } : s))
        );
        showNotice(`Classe d'abonnement mise à jour : ${tier.toUpperCase()}`);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Impossible de modifier la classe.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
    }
  };

  // Run Cron Engine
  const handleTriggerCron = async () => {
    try {
      setCronRunning(true);
      const res = await fetch('/api/admin/trigger-cron', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCronResult(data);
        fetchAdminShops();
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Impossible d’actualiser le bilan.');
      }
    } catch {
      showNotice('Impossible de contacter le serveur.');
    } finally {
      setCronRunning(false);
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
      (statusFilter === 'inactive' && !s.is_active) ||
      (statusFilter === 'expiring' && s.daysRemaining <= 4))
  ).sort((a, b) => {
    if (sortBy === 'sales') return b.total_sales - a.total_sales;
    if (sortBy === 'orders') return b.orders_count - a.orders_count;
    if (sortBy === 'expiry') return a.daysRemaining - b.daysRemaining;
    return a.name.localeCompare(b.name);
  });

  const activeShopsCount = shops.filter(s => s.is_active).length;
  const expiringShopsCount = shops.filter(s => s.daysRemaining <= 4 && s.daysRemaining >= 0).length;
  const totalSales = shops.reduce((sum, shop) => sum + shop.total_sales, 0);
  const totalOrders = shops.reduce((sum, shop) => sum + shop.orders_count, 0);
  const averageOrderValue = totalOrders ? Math.round(totalSales / totalOrders) : 0;

  const exportShopsCsv = () => {
    const headers = ['Boutique', 'Slug', 'Statut', 'CA FCFA', 'Commandes', 'Panier moyen', 'Produits', 'Echeance'];
    const rows = filteredShops.map(shop => [
      shop.name, shop.slug, shop.is_active ? 'active' : 'inactive', shop.total_sales,
      shop.orders_count, shop.average_order_value, shop.products_count,
      shop.subscription_expires_at,
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

  return (
    <div className="admin-dashboard min-h-screen pb-20">
      <header className="relative overflow-hidden border-b-[3px] border-[#211712] bg-[#fffaf2] text-[#211712]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(232,169,58,0.18),transparent_20%),radial-gradient(circle_at_top_right,_rgba(27,58,99,0.12),transparent_30%)]" />
        <div className="relative max-w-6xl mx-auto px-4 py-6">
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
                  Gestion des boutiques et alertes automatiques
                </p>
              </div>
            </div>

            <button
              id="trigger-cron-btn"
              onClick={handleTriggerCron}
              disabled={cronRunning}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1b3a63] px-4 py-2.5 text-xs font-black text-white shadow-[4px_4px_0_rgba(33,23,18,0.96)] border-[2px] border-[#211712] transition hover:translate-y-[-1px]"
            >
              <Zap className="w-4 h-4 text-[#e8a93a]" />
              <span>{cronRunning ? 'Exécution en cours...' : 'Exécuter le Cron Job'}</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {[{ label: 'Total Boutiques', value: shops.length, tone: 'bg-white border-[#211712]' }, { label: 'Actives', value: `${activeShopsCount}/${shops.length}`, tone: 'bg-[#edf7f2] border-[#211712] text-[#155c3d]' }, { label: 'Alertes', value: expiringShopsCount, tone: 'bg-[#f8eed7] border-[#211712] text-[#8a5a12]' }, { label: 'Tarif / Mois', value: '5 000 F', tone: 'bg-[#edf2fb] border-[#211712] text-[#1b3a63]' }, { label: 'CA cumulé', value: `${new Intl.NumberFormat('fr-FR').format(totalSales)} F`, tone: 'bg-[#edf7f2] border-[#211712] text-[#155c3d]' }, { label: 'Commandes', value: totalOrders, tone: 'bg-[#eef5ff] border-[#211712] text-[#1b3a63]' }, { label: 'Panier moyen', value: `${new Intl.NumberFormat('fr-FR').format(averageOrderValue)} F`, tone: 'bg-[#f9e7d6] border-[#211712] text-[#b93712]' }].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
                className={`rounded-2xl border-[2px] p-3 ${item.tone}`}
              >
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#4a3a30]">{item.label}</span>
                <span className="mt-2 block text-xl font-black text-[#211712]">{item.value}</span>
              </motion.div>
            ))}
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

        <section className="chart-panel p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Centre opérationnel</h2>
                <p className="text-[11px] text-slate-500">État du service, commandes récentes et alertes de stock.</p>
              </div>
            </div>
            <button type="button" onClick={fetchOperations} disabled={operationsLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${operationsLoading ? 'animate-spin' : ''}`} /> Actualiser
            </button>
          </div>

          {adminHealth && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-[10px] font-bold text-emerald-700">Service</span><strong className="mt-1 block text-sm text-emerald-900">Opérationnel</strong></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="text-[10px] font-bold text-slate-500">Stockage</span><strong className="mt-1 block text-sm text-slate-900">SQLite persistant</strong></div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[10px] font-bold text-sky-700">Commandes</span><strong className="mt-1 block text-sm text-sky-900">{adminHealth.counts.orders}</strong></div>
            </div>
          )}

          <div className="mt-5 grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-black text-slate-800">Commandes récentes</h3>
                <button type="button" onClick={() => exportOperationsCsv(`matable-commandes-${new Date().toISOString().slice(0, 10)}.csv`, ['ID', 'Boutique', 'Client', 'Téléphone', 'Montant', 'Statut', 'Date'], adminOrders.map(order => [order.id, order.shop_name, order.customer_name, order.customer_phone, order.total_amount, order.status, order.created_at]))} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900"><Download className="w-3 h-3" /> CSV</button>
              </div>
              <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                {adminOrders.length === 0 ? <p className="text-[11px] text-slate-500">Aucune commande enregistrée.</p> : adminOrders.slice(0, 8).map(order => (
                  <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px]">
                    <div className="min-w-0"><p className="truncate font-bold text-slate-800">#{order.id} · {order.shop_name}</p><p className="truncate text-slate-500">{order.customer_name} · {order.items_count} article(s)</p></div>
                    <div className="shrink-0 text-right"><p className="font-black text-slate-800">{new Intl.NumberFormat('fr-FR').format(order.total_amount)} F</p><span className="text-[9px] font-bold uppercase text-slate-500">{order.status}</span></div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {cronResult && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="chart-panel p-4 md:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-rose-600" />
                <h3 className="font-black text-slate-900 text-sm">Rapport du cron</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                {new Date(cronResult.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-amber-800 font-bold">Alertes générées : {cronResult.alertsCount}</span>
              <span className="rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-rose-800 font-bold">Boutiques OFF : {cronResult.deactivatedCount}</span>
            </div>

            {cronResult.alerts.length > 0 && (
              <div className="mt-4 space-y-2">
                {cronResult.alerts.map((alert: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <span>{alert.shop_name}</span>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] text-slate-600">{alert.type}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600">{alert.message.slice(0, 120)}...</p>
                    </div>
                    <a
                      href={`https://wa.me/${alert.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(alert.message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}

        <section className="chart-panel p-4 md:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-600" />
              <div>
                <h2 className="font-black text-slate-900 text-sm">Pilotage global</h2>
                <p className="text-[11px] text-slate-500 leading-4">Analyse globale des boutiques et alertes.</p>
              </div>
            </div>
            <button onClick={exportShopsCsv} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
              <Download className="w-3.5 h-3.5" /> Exporter CSV
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-[11px] text-emerald-700 font-bold block">CA cumulé</span><strong className="text-lg text-emerald-900">{new Intl.NumberFormat('fr-FR').format(totalSales)} F</strong></div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3"><span className="text-[11px] text-sky-700 font-bold block">Commandes</span><strong className="text-lg text-sky-900">{totalOrders}</strong></div>
          </div>
        </section>

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
            {(['all', 'active', 'inactive', 'expiring'] as const).map(filter => (
              <button key={filter} onClick={() => setStatusFilter(filter)} className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${statusFilter === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {filter === 'all' ? 'Toutes' : filter === 'active' ? 'Actives' : filter === 'inactive' ? 'Inactives' : 'Échéance ≤ 4j'}
              </button>
            ))}
            <select value={sortBy} onChange={event => setSortBy(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none">
              <option value="sales">Trier par CA</option>
              <option value="orders">Trier par commandes</option>
              <option value="expiry">Trier par échéance</option>
              <option value="name">Trier par nom</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200 bg-slate-50/80 p-4">
            <h2 className="font-black text-slate-900 text-sm">Liste des commerçants</h2>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredShops.map((shop) => {
              const isExpired = shop.daysRemaining < 0;
              const isUrgent = shop.daysRemaining <= 4 && shop.daysRemaining >= 0;

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
                      <span className="text-[10px] text-slate-400 font-mono">/{shop.slug}</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${shop.category === 'food' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {shop.category === 'food' ? '🍲 Restauration' : '👗 Mode'}
                      </span>
                      {isExpired ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">Expiré</span>
                      ) : isUrgent ? (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 animate-pulse">Expire dans {shop.daysRemaining}j</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">{shop.daysRemaining} jours restants</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>📞 {shop.whatsapp_number}</span>
                      <span>📍 {shop.city || 'Abidjan'}</span>
                      <span>📦 {shop.products_count} articles</span>
                      <span>🛒 {shop.orders_count} commandes</span>
                      <span>💰 {new Intl.NumberFormat('fr-FR').format(shop.total_sales)} FCFA</span>
                    </div>

                    {shop.payment_status === 'approved' && (
                      <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[10px] font-black text-emerald-800">
                        <Check className="w-3.5 h-3.5" />
                        Paiement validé automatiquement
                      </div>
                    )}

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-4 pt-1">
                      <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400" /><span>Échéance : <strong>{shop.subscription_expires_at}</strong></span></div>
                      <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /><span>Dernière commande : <strong>{shop.last_order_at ? new Date(shop.last_order_at).toLocaleDateString('fr-FR') : 'Aucune'}</strong></span></div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button onClick={() => handleOpenMerchantSpace(shop.id)} disabled={!shop.is_active} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Ouvrir l’espace</button>
                    <button onClick={() => handleToggleActive(shop.id)} className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${shop.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                      {shop.is_active ? '● ON' : '○ OFF'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      {[1, 3, 6, 12].map((months) => (
                        <button key={months} onClick={() => handleExtendSubscription(shop.id, months)} className="rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700">+{months}M</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.7rem] bg-slate-900 p-6 text-slate-200">
          <h3 className="font-black text-white text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-400" /> Moteur d’alerte automatique</h3>
          <ul className="mt-3 text-xs space-y-1.5 text-slate-300 list-disc list-inside">
            <li><strong>À J-10, J-8, J-6, J-4, J-2</strong> : envoi automatique d’un rappel WhatsApp.</li>
            <li><strong>À J-0</strong> : alerte ultime de coupure.</li>
            <li><strong>À J+1</strong> : basculement automatique de la boutique à l’état <code className="text-rose-400">OFF (is_active = false)</code>.</li>
          </ul>
        </div>
      </main>
    </div>
  );
};


