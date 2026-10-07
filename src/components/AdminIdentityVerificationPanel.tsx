import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';

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
}

export function AdminIdentityVerificationPanel({
  selectedShopId,
  requestingShopId,
  onRequestVerification,
}: AdminIdentityVerificationPanelProps) {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    document.getElementById(`identity-verification-shop-${selectedShopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedShopId]);

  return (
    <section id="identity-verification-queue" className="chart-panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <div><h2 className="text-sm font-black text-slate-900">Vérifications d’identité Didit</h2><p className="text-[11px] text-slate-500">Les décisions proviennent de Didit et sont synchronisées par webhook. Elles ne peuvent pas être modifiées manuellement ici.</p></div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser les statuts" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement…</p>
        : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aucune boutique à vérifier.</p>
          : <div className="mt-4 divide-y divide-slate-200">{items.map((item) => (
            <article id={`identity-verification-shop-${item.shop_id}`} key={item.shop_id} className={`py-4 first:pt-0 last:pb-0 ${selectedShopId === item.shop_id ? 'rounded-xl bg-amber-50/50 px-3 ring-2 ring-amber-300' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900">{item.shop_name} <span className="font-normal text-slate-500">/{item.shop_slug}</span></h3>
                  <p className="mt-1 text-xs text-slate-500">Boutique #{item.shop_id}{item.session_id ? ` · Session ${item.session_id}` : ' · Aucune session Didit'}</p>
                  {item.submitted_at && <p className="mt-1 text-[11px] text-slate-500">Démarrée le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.submitted_at))}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${item.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : item.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>
                  {statusLabels[item.status] || item.status}
                </span>
              </div>
              {item.provider_status && <p className="mt-2 text-xs text-slate-600">Statut fournisseur : <strong>{item.provider_status}</strong></p>}
              {item.status !== 'verified' && (
                <button
                  type="button"
                  onClick={() => onRequestVerification(item.shop_id)}
                  disabled={requestingShopId !== null}
                  className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {requestingShopId === item.shop_id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {item.status === 'pending' ? 'Demander la vérification sur WhatsApp' : 'Relancer le propriétaire sur WhatsApp'}
                </button>
              )}
            </article>
          ))}</div>}
    </section>
  );
}
