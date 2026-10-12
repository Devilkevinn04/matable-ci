import { motion } from 'motion/react';
import { Clock, Download, Eye, Filter, Search, Star, Trash2 } from 'lucide-react';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import type { AdminShopItem } from './adminDashboardTypes';

interface AdminShopListProps {
  shops: AdminShopItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: 'all' | 'active' | 'inactive';
  onStatusFilterChange: (filter: 'all' | 'active' | 'inactive') => void;
  sortBy: 'sales' | 'orders' | 'name';
  onSortChange: (sort: 'sales' | 'orders' | 'name') => void;
  onExport: () => void;
  onFocusVerification: (shopId: number) => void;
  onOpenMerchantSpace: (shopId: number) => void;
  featuredActionShopId: number | null;
  onSetFeatured: (shopId: number, days: number) => void;
  onToggleActive: (shopId: number) => void;
  onRequestDelete: (shop: Pick<AdminShopItem, 'id' | 'name' | 'slug'>) => void;
}

export function AdminShopList({
  shops,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortChange,
  onExport,
  onFocusVerification,
  onOpenMerchantSpace,
  featuredActionShopId,
  onSetFeatured,
  onToggleActive,
  onRequestDelete,
}: AdminShopListProps) {
  return (
    <>
      <div className="chart-panel p-3 md:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher une boutique..."
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-violet-300 focus:bg-white"
            />
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{shops.length} boutique(s)</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {(['all', 'active', 'inactive'] as const).map((filter) => (
            <button key={filter} onClick={() => onStatusFilterChange(filter)} className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${statusFilter === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {filter === 'all' ? 'Toutes' : filter === 'active' ? 'Actives' : 'Inactives'}
            </button>
          ))}
          <select value={sortBy} onChange={(event) => onSortChange(event.target.value as typeof sortBy)} className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none">
            <option value="sales">Trier par valeur des commandes</option>
            <option value="orders">Trier par commandes</option>
            <option value="name">Trier par nom</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-4">
          <h2 className="font-black text-slate-900 text-sm">Liste des commerçants</h2>
          <button type="button" onClick={onExport} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Download className="h-4 w-4" />Exporter CSV</button>
        </div>

        <div className="divide-y divide-slate-200">
          {shops.length === 0 && <p className="p-5 text-sm text-slate-500">Aucune boutique ne correspond à ces critères.</p>}
          {shops.map((shop) => {
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
                      <button type="button" onClick={() => onFocusVerification(shop.id)} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-extrabold text-amber-900 transition hover:bg-amber-100">
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
                  <button onClick={() => onOpenMerchantSpace(shop.id)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Gérer intégralement</button>
                  <select
                    aria-label={`Mettre ${shop.name} à la une`}
                    value={isFeatured ? 'featured' : ''}
                    disabled={featuredActionShopId === shop.id}
                    onChange={(event) => {
                      const days = Number(event.target.value);
                      if (Number.isInteger(days)) onSetFeatured(shop.id, days);
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
                  <button onClick={() => onToggleActive(shop.id)} className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${shop.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {shop.is_active ? '● ON' : '○ OFF'}
                  </button>
                  <button type="button" onClick={() => onRequestDelete({ id: shop.id, name: shop.name, slug: shop.slug })} aria-label={`Supprimer définitivement ${shop.name}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-extrabold text-rose-800 hover:bg-rose-50">
                    <Trash2 className="h-4 w-4" />Supprimer
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
}
