import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Search, Send, ShieldCheck } from 'lucide-react';

interface VerificationItem {
  shop_id: number;
  shop_name: string;
  shop_slug: string;
  status: string;
  provider_status: string | null;
  session_id: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

type VerificationFilter = 'all' | 'pending' | 'submitted' | 'under_review' | 'rejected' | 'verified';

const statusLabels: Record<string, string> = {
  pending: 'À vérifier',
  submitted: 'Vérification démarrée',
  under_review: 'En cours de revue',
  verified: 'Vérifié',
  rejected: 'Refusé',
  not_required: 'Non requis',
};

interface AdminIdentityVerificationPanelProps {
  selectedShopId: number | null;
  requestingShopId: number | null;
  onRequestVerification: (shopId: number) => void;
  allowRequest?: boolean;
}

export function AdminIdentityVerificationPanel({
  selectedShopId,
  requestingShopId,
  onRequestVerification,
  allowRequest = true,
}: AdminIdentityVerificationPanelProps) {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<VerificationFilter>('all');
  const [openShopId, setOpenShopId] = useState<number | null>(null);

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/identity-verifications', { cache: 'no-store' });
      const data = await response.json() as { verifications?: VerificationItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Chargement des statuts impossible.');
      setItems(data.verifications || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement des statuts impossible.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(false);
    }, 120000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedShopId) return;
    setOpenShopId(selectedShopId);
    document.getElementById(`identity-verification-shop-${selectedShopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedShopId]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('fr');
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesQuery = !query
        || item.shop_name.toLocaleLowerCase('fr').includes(query)
        || item.shop_slug.toLocaleLowerCase('fr').includes(query)
        || String(item.shop_id).includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [items, searchQuery, statusFilter]);
  const openItemIndex = filteredItems.findIndex((item) => item.shop_id === openShopId);
  const openItem = openItemIndex >= 0 ? filteredItems[openItemIndex] : null;

  function moveOpenItem(direction: -1 | 1) {
    if (!filteredItems.length) return;
    const nextIndex = Math.min(filteredItems.length - 1, Math.max(0, openItemIndex + direction));
    setOpenShopId(filteredItems[nextIndex].shop_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section id="identity-verification-queue" className="chart-panel scroll-mt-24 p-3 sm:p-4 md:p-5">
      <div className="flex min-w-0 items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-slate-900">File de vérification Didit</h2>
          <p className="text-[11px] leading-4 text-slate-500">
            <span className="sm:hidden">Statuts Didit · consultation seule.</span>
            <span className="hidden sm:inline">Consultez les statuts transmis par Didit. Les décisions sont synchronisées par webhook et ne sont pas modifiables ici.</span>
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser les statuts" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement…</p>
        : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aucune boutique à vérifier.</p>
          : <>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="relative block min-w-0">
                <span className="sr-only">Rechercher une boutique</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Rechercher par boutique ou identifiant" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
              </label>
              <label className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-600">
                <span>Statut</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VerificationFilter)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 sm:min-w-36 sm:flex-none">
                  <option value="all">Tous ({items.length})</option>
                  <option value="pending">À vérifier ({items.filter((item) => item.status === 'pending').length})</option>
                  <option value="submitted">Démarrée ({items.filter((item) => item.status === 'submitted').length})</option>
                  <option value="under_review">En revue ({items.filter((item) => item.status === 'under_review').length})</option>
                  <option value="rejected">Refusée ({items.filter((item) => item.status === 'rejected').length})</option>
                  <option value="verified">Vérifiée ({items.filter((item) => item.status === 'verified').length})</option>
                </select>
              </label>
            </div>
            {filteredItems.length === 0
              ? <p className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">Aucun dossier ne correspond à ces critères.</p>
              : <>
              {openItem && (
                <div className="mt-4 space-y-3 md:hidden">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setOpenShopId(null)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-emerald-900">
                      <ArrowLeft className="h-4 w-4" /> Retour à la file
                    </button>
                    <span className="text-xs font-semibold text-slate-500">{openItemIndex + 1} sur {filteredItems.length}</span>
                  </div>
                  <article className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-base font-black text-slate-900">{openItem.shop_name}</h3>
                        <p className="mt-1 break-all text-sm text-slate-500">/{openItem.shop_slug} · Boutique #{openItem.shop_id}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${openItem.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : openItem.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>
                        {statusLabels[openItem.status] || openItem.status}
                      </span>
                    </div>
                    <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                      <div className="flex items-start justify-between gap-3 py-3 text-xs">
                        <dt className="text-slate-500">Résultat Didit</dt>
                        <dd className="break-all text-right font-bold text-slate-900">{openItem.provider_status || 'Aucun résultat reçu'}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-3 py-3 text-xs">
                        <dt className="text-slate-500">Session</dt>
                        <dd className="break-all text-right font-bold text-slate-900">{openItem.session_id ? `…${openItem.session_id.slice(-4)}` : 'Aucune session Didit'}</dd>
                      </div>
                      <div className="flex items-start justify-between gap-3 py-3 text-xs">
                        <dt className="text-slate-500">Démarrée le</dt>
                        <dd className="text-right font-bold text-slate-900">{openItem.submitted_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(openItem.submitted_at)) : 'Non démarrée'}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Le statut est transmis par Didit. Cet écran permet de consulter le dossier et de relancer le propriétaire ; il ne permet pas de valider ou refuser manuellement l’identité.</p>
                    {allowRequest && openItem.status !== 'verified' && (
                      <button type="button" onClick={() => onRequestVerification(openItem.shop_id)} disabled={requestingShopId !== null} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                        {requestingShopId === openItem.shop_id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {openItem.status === 'pending' ? 'Préparer un rappel WhatsApp' : 'Relancer sur WhatsApp'}
                      </button>
                    )}
                  </article>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => moveOpenItem(-1)} disabled={openItemIndex <= 0} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" /> Précédent
                    </button>
                    <button type="button" onClick={() => moveOpenItem(1)} disabled={openItemIndex >= filteredItems.length - 1} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-40">
                      Suivant <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              <div className={`${openItem ? 'hidden md:block' : ''} mt-4 space-y-3 sm:divide-y sm:divide-slate-200 sm:space-y-0`}>{filteredItems.map((item) => (
            <article id={`identity-verification-shop-${item.shop_id}`} key={item.shop_id} className={`min-w-0 rounded-xl border border-slate-200 p-3 sm:rounded-none sm:border-0 sm:px-0 sm:py-4 sm:first:pt-0 sm:last:pb-0 ${selectedShopId === item.shop_id ? 'bg-amber-50/50 ring-2 ring-amber-300 sm:px-3' : 'bg-white sm:bg-transparent'}`}>
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <h3 className="break-words font-bold text-slate-900">{item.shop_name}</h3>
                  <p className="mt-0.5 break-all text-xs text-slate-500">/{item.shop_slug}</p>
                </div>
                <span className={`inline-flex max-w-full justify-self-start rounded-full px-2.5 py-1 text-[11px] font-extrabold sm:justify-self-end ${item.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : item.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>
                  {statusLabels[item.status] || item.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Boutique #{item.shop_id}</p>
              {item.session_id
                ? <p className="mt-1 break-all text-[11px] text-slate-500"><span className="sm:hidden">Session …{item.session_id.slice(-4)}</span><span className="hidden sm:inline">Session {item.session_id}</span></p>
                : <p className="mt-1 text-[11px] text-slate-500">Aucune session Didit</p>}
              {item.submitted_at && <p className="mt-1 text-[11px] text-slate-500">Démarrée le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.submitted_at))}</p>}
              {item.provider_status && <p className="mt-2 break-words text-xs text-slate-600">Statut fournisseur : <strong>{item.provider_status}</strong></p>}
              <button type="button" onClick={() => { setOpenShopId(item.shop_id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 sm:w-auto">
                Consulter le dossier <ChevronRight className="h-4 w-4" />
              </button>
              {allowRequest && item.status !== 'verified' && (
                <button
                  type="button"
                  onClick={() => onRequestVerification(item.shop_id)}
                  disabled={requestingShopId !== null}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {requestingShopId === item.shop_id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {item.status === 'pending' ? 'Demander la vérification sur WhatsApp' : 'Relancer le propriétaire sur WhatsApp'}
                </button>
              )}
            </article>
              ))}</div>
              </>}
          </>}
    </section>
  );
}
