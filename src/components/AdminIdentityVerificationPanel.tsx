import { useEffect, useState } from 'react';
import { Check, LoaderCircle, RefreshCw, ShieldAlert, X } from 'lucide-react';

interface VerificationItem {
  shop_id: number;
  shop_name: string;
  shop_slug: string;
  owner_email: string | null;
  document_type: string;
  document_number_last4: string;
  client_face_distance: number | null;
  status: string;
  decision_method: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
  has_document_back: boolean;
  identity_data: { first_name: string; last_name: string; birth_date: string } | null;
}

const statusLabels: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'À examiner', tone: 'bg-sky-100 text-sky-800' },
  under_review: { label: 'En cours de revue', tone: 'bg-amber-100 text-amber-900' },
  verified: { label: 'Vérifié', tone: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'À corriger', tone: 'bg-rose-100 text-rose-800' },
};

interface AdminIdentityVerificationPanelProps {
  selectedShopId: number | null;
}

export function AdminIdentityVerificationPanel({ selectedShopId }: AdminIdentityVerificationPanelProps) {
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/identity-verifications', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chargement des dossiers impossible.');
      setItems(data.verifications || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement des dossiers impossible.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(false), 30000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    if (!selectedShopId) return;
    document.getElementById(`identity-verification-shop-${selectedShopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedShopId]);

  async function decide(shopId: number, status: 'under_review' | 'verified' | 'rejected') {
    setWorkingId(shopId);
    setError('');
    try {
      const response = await fetch(`/api/admin/identity-verifications/${shopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_note: notes[shopId] || '' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Décision impossible.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Décision impossible.');
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section id="identity-verification-queue" className="chart-panel scroll-mt-24 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-700" />
          <div><h2 className="text-sm font-black text-slate-900">Vérification d’identité</h2><p className="text-[11px] text-slate-500">Acceptation locale automatique ; revue visuelle des dossiers incertains. Aucun liveness.</p></div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser les dossiers" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {loading ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement des dossiers…</p>
        : items.length === 0 ? <p className="mt-4 text-sm text-slate-500">Aucun dossier de vérification.</p>
          : <div className="mt-4 divide-y divide-slate-200">{items.map((item) => (
            <article id={`identity-verification-shop-${item.shop_id}`} key={item.shop_id} className={`scroll-mt-28 py-5 first:pt-0 last:pb-0 ${selectedShopId === item.shop_id ? 'rounded-xl bg-amber-50/50 px-3 ring-2 ring-amber-300' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="font-bold text-slate-900">{item.shop_name} <span className="font-normal text-slate-500">/{item.shop_slug}</span></h3><p className="mt-1 break-words text-xs text-slate-600">{item.owner_email || 'E-mail absent'} · {item.document_type === 'cni' ? 'CNI' : 'Passeport'} se terminant par {item.document_number_last4}</p><p className="mt-1 text-[11px] text-slate-500">Reçu le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.submitted_at))}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusLabels[item.status]?.tone || 'bg-slate-100 text-slate-700'}`}>{item.status === 'verified' && item.decision_method === 'local_auto' ? 'Vérifié automatiquement (prototype)' : statusLabels[item.status]?.label || item.status}</span>
              </div>
              <div className="mt-3 grid gap-3 text-xs text-slate-700 sm:grid-cols-3">
                <p>Nom OCR : <strong>{[item.identity_data?.first_name, item.identity_data?.last_name].filter(Boolean).join(' ') || 'Non extrait'}</strong></p>
                <p>Naissance OCR : <strong>{item.identity_data?.birth_date || 'Non extraite'}</strong></p>
                <p>Distance faciale : <strong>{item.client_face_distance?.toFixed(3) ?? 'Indisponible'}</strong> <span className="text-slate-500">(pas une probabilité)</span></p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <figure><figcaption className="mb-1 text-[11px] font-bold text-slate-600">Pièce d’identité</figcaption><img src={`/api/admin/identity-verifications/${item.shop_id}/media/document`} alt={`Document d’identité de ${item.shop_name}`} loading="lazy" className="max-h-64 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" /></figure>
                <figure><figcaption className="mb-1 text-[11px] font-bold text-slate-600">Verso</figcaption>{item.has_document_back ? <img src={`/api/admin/identity-verifications/${item.shop_id}/media/back`} alt={`Verso du document d’identité de ${item.shop_name}`} loading="lazy" className="max-h-64 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" /> : <p className="grid min-h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs text-slate-500">Verso non disponible pour cet ancien dossier</p>}</figure>
                <figure><figcaption className="mb-1 text-[11px] font-bold text-slate-600">Selfie</figcaption><img src={`/api/admin/identity-verifications/${item.shop_id}/media/selfie`} alt={`Selfie du propriétaire de ${item.shop_name}`} loading="lazy" className="max-h-64 w-full rounded-lg border border-slate-200 bg-slate-50 object-contain" /></figure>
              </div>
              {item.reviewer_note && <p className="mt-3 text-sm text-rose-700">Retour précédent : {item.reviewer_note}</p>}
              {item.status !== 'verified' && <>
                <label className="mt-3 block text-xs font-semibold text-slate-700">Note de revue<textarea value={notes[item.shop_id] ?? item.reviewer_note ?? ''} onChange={(event) => setNotes((previous) => ({ ...previous, [item.shop_id]: event.target.value }))} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={workingId === item.shop_id} onClick={() => void decide(item.shop_id, 'under_review')} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Marquer en revue</button>
                  <button type="button" disabled={workingId === item.shop_id} onClick={() => void decide(item.shop_id, 'verified')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Approuver</button>
                  <button type="button" disabled={workingId === item.shop_id} onClick={() => void decide(item.shop_id, 'rejected')} className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><X className="h-3.5 w-3.5" />Refuser</button>
                </div>
              </>}
            </article>
          ))}</div>}
    </section>
  );
}
