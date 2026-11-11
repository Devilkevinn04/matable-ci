import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, RefreshCw, Search, ShieldCheck } from 'lucide-react';

type VerificationType = 'business' | 'identity';
type ReviewStatus = 'pending' | 'under_review' | 'action_required' | 'approved' | 'rejected';

interface VerificationRow {
  shop_id: number;
  shop_name: string;
  shop_slug: string;
  category: string;
  city: string | null;
  created_at: string;
  business_status: ReviewStatus | 'not_submitted';
  identity_status: ReviewStatus | 'not_submitted';
  business_method: string | null;
  identity_method: string | null;
}

interface VerificationDetail {
  shop: VerificationRow & {
    owner_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    whatsapp_number: string;
    publication_status: string;
  };
  history: Array<{ actor: string; action: string; details: { verification_type?: string; status?: string; reason?: string }; created_at: string }>;
  documents: Array<{ id: string; document_type: string; content_type: string; file_size: number; status: 'pending_upload' | 'available'; created_at: string; expires_at: string | null }>;
}
interface VerificationCounts {
  total: number;
  business_pending: number;
  business_action_required: number;
  business_approved: number;
  identity_pending: number;
  identity_action_required: number;
  identity_approved: number;
}

const statusLabels: Record<string, string> = {
  not_submitted: 'Non soumis',
  pending: 'En attente',
  under_review: 'En examen',
  action_required: 'À corriger',
  approved: 'Examen accepté',
  rejected: 'Refusé',
};

export function AdminManualVerificationPanel() {
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [counts, setCounts] = useState<VerificationCounts | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<VerificationType>('business');
  const [status, setStatus] = useState<ReviewStatus>('under_review');
  const [documentPreview, setDocumentPreview] = useState<{ id: string; url: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/identity-verifications/manual', { cache: 'no-store' });
      const result = await response.json() as { verifications?: VerificationRow[]; counts?: VerificationCounts; error?: string };
      if (!response.ok) throw new Error(result.error || 'Chargement des dossiers impossible.');
      setRows(result.verifications || []);
      setCounts(result.counts || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement des dossiers impossible.');
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(shopId: number) {
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/identity-verifications/manual/${shopId}`, { cache: 'no-store' });
      const result = await response.json() as VerificationDetail & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Ouverture du dossier impossible.');
      setDetail(result);
      setDocumentPreview(null);
      setType('business');
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ouverture du dossier impossible.');
    }
  }

  async function saveDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!detail || reason.trim().length < 3) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const expectedStatus = type === 'business' ? detail.shop.business_status : detail.shop.identity_status;
      const response = await fetch(`/api/admin/identity-verifications/manual/${detail.shop.shop_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verification_type: type, status, reason: reason.trim(), expected_status: expectedStatus }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Décision non enregistrée.');
      setNotice('Mise à jour enregistrée et journalisée.');
      setReason('');
      await Promise.all([refresh(), openDetail(detail.shop.shop_id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Décision non enregistrée.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return rows.filter((row) => {
      const matchesStatus = filter === 'all' || row.business_status === filter || row.identity_status === filter;
      const matchesQuery = !query || `${row.shop_name} ${row.shop_slug} ${row.city || ''} ${row.shop_id}`.toLocaleLowerCase('fr').includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [filter, rows, search]);

  return <section className="chart-panel space-y-4 p-4 md:p-5" aria-labelledby="manual-verification-title">
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <h2 id="manual-verification-title" className="text-sm font-black text-slate-900">Vérification manuelle · boutique et identité</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Les deux contrôles restent indépendants. « Examen accepté » signifie contrôle humain, pas authentification biométrique.</p>
        </div>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser les dossiers" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {counts && <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[
        ['Dossiers', counts.total],
        ['Boutique à examiner', counts.business_pending],
        ['Identité à examiner', counts.identity_pending],
        ['Corrections demandées', counts.business_action_required + counts.identity_action_required],
      ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div>)}
    </div>}
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="relative block"><span className="sr-only">Rechercher un dossier</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Boutique, commune ou identifiant" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm" /></label>
      <select aria-label="Filtrer par statut" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
        <option value="all">Tous les statuts</option>
        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    {loading ? <p className="flex items-center gap-2 py-4 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement…</p>
      : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {filtered.map((row) => <button key={row.shop_id} type="button" onClick={() => void openDetail(row.shop_id)} className={`block min-h-20 w-full p-3 text-left hover:bg-slate-50 ${detail?.shop.shop_id === row.shop_id ? 'bg-emerald-50' : 'bg-white'}`}>
            <span className="block font-bold text-slate-900">{row.shop_name}</span>
            <span className="mt-1 block text-xs text-slate-500">{row.city || 'Commune non renseignée'} · #{row.shop_id}</span>
            <span className="mt-2 flex flex-wrap gap-2 text-[11px]"><span>Boutique : <b>{statusLabels[row.business_status] || row.business_status}</b></span><span>Identité : <b>{statusLabels[row.identity_status] || row.identity_status}</b></span></span>
          </button>)}
          {filtered.length === 0 && <p className="p-4 text-sm text-slate-500">Aucun dossier correspondant.</p>}
        </div>
        {detail && <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div><h3 className="font-black text-slate-900">{detail.shop.shop_name}</h3><p className="mt-1 text-xs text-slate-500">{detail.shop.city || 'Commune non renseignée'} · {detail.shop.category} · inscription {new Date(detail.shop.created_at).toLocaleDateString('fr-FR')}</p></div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Responsable</dt><dd className="font-semibold">{detail.shop.owner_name || 'Non renseigné'}</dd></div>
            <div><dt className="text-xs text-slate-500">E-mail</dt><dd className="break-all font-semibold">{detail.shop.owner_email || 'Non renseigné'}</dd></div>
            <div><dt className="text-xs text-slate-500">Téléphone responsable</dt><dd className="font-semibold">{detail.shop.owner_phone || 'Non renseigné'}</dd></div>
            <div><dt className="text-xs text-slate-500">WhatsApp boutique</dt><dd className="font-semibold">{detail.shop.whatsapp_number}</dd></div>
          </dl>
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <h4 className="text-xs font-black text-slate-800">Justificatifs privés · accès journalisé</h4>
            {detail.documents.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>{({
                storefront: 'Devanture', interior: 'Intérieur', products: 'Produits / prestations',
                identity_front: 'Pièce · recto', identity_back: 'Pièce · verso', identity_passport: 'Passeport',
              } as Record<string, string>)[document.document_type] || document.document_type} · {Math.ceil(document.file_size / 1024)} Ko</span>
              {document.status === 'available' ? <button type="button" onClick={async () => {
                setError('');
                try {
                  const response = await fetch(`/api/admin/identity-verifications/manual/${detail.shop.shop_id}/documents/${document.id}`, { cache: 'no-store' });
                  const result = await response.json() as { url?: string; error?: string };
                  if (!response.ok || !result.url) throw new Error(result.error || 'Consultation impossible.');
                  setDocumentPreview({ id: document.id, url: result.url });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : 'Consultation impossible.');
                }
              }} className="min-h-9 rounded-md border border-slate-300 px-3 font-bold hover:bg-slate-50">Examiner</button>
                : <span className="text-amber-700">Dépôt incomplet</span>}
            </div>)}
            {detail.documents.length === 0 && <p className="text-xs text-slate-500">Aucun document déposé.</p>}
            {documentPreview && <div className="rounded-lg bg-slate-50 p-2"><img src={documentPreview.url} alt="Justificatif privé à examiner" className="mx-auto max-h-96 max-w-full rounded object-contain" referrerPolicy="no-referrer" /><p className="mt-2 text-center text-[10px] text-slate-500">Lien temporaire, expirant après une minute. Chaque ouverture est journalisée.</p></div>}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Vérifiez les pièces réellement consultées. Un examen visuel ne prouve pas l’authenticité officielle ni biométrique d’une identité.</div>
          <form onSubmit={(event) => void saveDecision(event)} className="space-y-3 border-t border-slate-200 pt-4">
            <label className="block text-xs font-bold">Volet à mettre à jour<select value={type} onChange={(event) => setType(event.target.value as VerificationType)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="business">Vérification de la boutique</option><option value="identity">Examen manuel d’identité</option></select></label>
            <label className="block text-xs font-bold">Statut<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus)} className="mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="under_review">En examen</option><option value="action_required">À corriger</option><option value="approved">Examen accepté</option><option value="rejected">Refusé</option></select></label>
            <label className="block text-xs font-bold">Motif ou note obligatoire<textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
            <button type="submit" disabled={busy || reason.trim().length < 3} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Enregistrer et journaliser</button>
          </form>
          <div className="border-t border-slate-200 pt-3"><h4 className="text-xs font-black text-slate-700">Historique des décisions ({detail.history.length})</h4>{detail.history.map((entry, index) => <p key={`${entry.created_at}-${index}`} className="mt-2 text-xs leading-5 text-slate-600">{new Date(entry.created_at).toLocaleString('fr-FR')} · {entry.actor} · {entry.details.verification_type === 'business' ? 'Boutique' : 'Identité'} · {statusLabels[entry.details.status || ''] || entry.details.status} — {entry.details.reason}</p>)}</div>
        </article>}
      </div>}
  </section>;
}
