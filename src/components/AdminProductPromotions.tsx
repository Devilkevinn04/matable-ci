import React, { useEffect, useState } from 'react';
import { RefreshCw, Tag } from 'lucide-react';
import { formatFCFA } from '../utils/format';

type PromotionStatus = 'active' | 'scheduled' | 'expired' | 'invalid';
type PromotionFilter = 'all' | PromotionStatus;

interface ProductPromotion {
  product_id: number;
  shop_id: number;
  product_title: string;
  price: number;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  stock: number;
  is_available: boolean | number;
  is_visible: boolean | number;
  shop_name: string;
  shop_slug: string;
  shop_city: string | null;
  shop_active: boolean | number;
  publication_status: string | null;
  merchant_verification_status: string | null;
  sale_status: PromotionStatus;
}

interface PromotionResponse {
  promotions: ProductPromotion[];
  summary: Record<PromotionStatus, number>;
  total: number;
  page: number;
  page_size: number;
  status: PromotionFilter;
}

const statusLabels: Record<PromotionStatus, string> = {
  active: 'Active',
  scheduled: 'Programmée',
  expired: 'Terminée',
  invalid: 'À vérifier',
};

const statusStyles: Record<PromotionStatus, string> = {
  active: 'bg-emerald-100 text-emerald-900',
  scheduled: 'bg-sky-100 text-sky-900',
  expired: 'bg-slate-100 text-slate-700',
  invalid: 'bg-rose-100 text-rose-900',
};

function formatDate(value: string | null): string {
  if (!value) return 'Date manquante';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date invalide';
}

export const AdminProductPromotions: React.FC = () => {
  const [data, setData] = useState<PromotionResponse | null>(null);
  const [filter, setFilter] = useState<PromotionFilter>('all');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ status: filter, page: String(page) });
    fetch(`/api/admin/product-sales?${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as PromotionResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Impossible de charger les promotions.');
        if (!Array.isArray(payload.promotions) || !payload.summary || typeof payload.total !== 'number') {
          throw new Error('La réponse des promotions est invalide.');
        }
        setData(payload);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les promotions.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter, page, refresh]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="space-y-5" aria-labelledby="admin-product-promotions-title">
      <header className="flex flex-col gap-3 rounded-2xl border border-[#d8e9df] bg-[#f5faf6] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-[#e3f1e8] p-3 text-[#047857]"><Tag className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="admin-product-promotions-title" className="text-xl font-black text-slate-900">Promotions du catalogue</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Suivi des prix réduits publiés par les boutiques. Le prix normal est conservé; le prix promotionnel s’applique uniquement pendant la période déclarée. Cette vue ne modifie pas les tarifs marchands.</p>
          </div>
        </div>
        <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualiser
        </button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(statusLabels) as PromotionStatus[]).map((status) => (
          <button key={status} type="button" onClick={() => { setFilter(status); setPage(1); }} aria-pressed={filter === status} className={`rounded-xl border p-4 text-left transition ${filter === status ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700/15' : 'border-slate-200 bg-white hover:border-emerald-300'}`}>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusStyles[status]}`}>{statusLabels[status]}</span>
            <strong className="mt-3 block text-2xl font-black text-slate-900">{data?.summary[status] ?? '—'}</strong>
            <span className="text-xs text-slate-500">offre{data?.summary[status] === 1 ? '' : 's'}</span>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Offres marchandes</h3>
            <p className="mt-1 text-xs text-slate-500">{data?.total ?? 0} résultat(s) · actualisé selon l’horloge du serveur</p>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-xs font-bold text-slate-600">
            <span>Afficher</span>
            <select value={filter} onChange={(event) => { setFilter(event.target.value as PromotionFilter); setPage(1); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
              <option value="all">Toutes</option>
              {(Object.keys(statusLabels) as PromotionStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
          </label>
        </div>
        {loading ? <p role="status" className="p-6 text-sm text-slate-500">Chargement des promotions…</p>
          : data?.promotions.length ? <div className="divide-y divide-slate-200">
            {data.promotions.map((promotion) => (
              <article key={`${promotion.shop_id}-${promotion.product_id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">{promotion.product_title}</h4>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusStyles[promotion.sale_status]}`}>{statusLabels[promotion.sale_status]}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{promotion.shop_name} · {promotion.shop_city || 'Commune non renseignée'} · stock : {promotion.stock}</p>
                  <p className="mt-1 text-xs text-slate-500">Boutique {promotion.shop_active ? 'active' : 'inactive'} · publication : {promotion.publication_status || 'inconnue'} · vérification : {promotion.merchant_verification_status || 'inconnue'}</p>
                  <p className="mt-1 text-xs text-slate-500">Début : {formatDate(promotion.sale_starts_at)} · fin : {formatDate(promotion.sale_ends_at)}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <strong className="block text-base font-black text-orange-800">{promotion.sale_price === null ? 'Prix invalide' : formatFCFA(promotion.sale_price)}</strong>
                  <span className="text-xs font-semibold text-slate-500">Prix normal : {formatFCFA(promotion.price)}</span>
                </div>
              </article>
            ))}
          </div> : <p className="p-6 text-center text-sm text-slate-500">{filter === 'all' ? 'Aucune promotion marchande enregistrée.' : `Aucune promotion ${statusLabels[filter].toLocaleLowerCase('fr')} à afficher.`}</p>}
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-xs text-slate-500">Page {page} sur {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Précédent</button>
            <button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Suivant</button>
          </div>
        </footer>
      </section>
    </section>
  );
};
