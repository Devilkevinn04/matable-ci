import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, LoaderCircle, Trash2, Upload } from 'lucide-react';

type DocumentType = 'identity_front' | 'identity_back' | 'identity_passport';
type IdentityDocumentKind = 'identity_card' | 'passport';

interface VerificationDocument {
  id: string;
  document_type: DocumentType;
  content_type: string;
  file_size: number;
  status: 'pending_upload' | 'available';
  created_at: string;
}

interface ManualStatus {
  identity_status: string;
  consent_at: string | null;
  storage_available: boolean;
  documents: VerificationDocument[];
  decisions: Array<{ type: string; status: string; reason: string; created_at: string }>;
}

export interface ManualVerificationProgress {
  identityStatus: string;
  identityReady: boolean;
}

interface MerchantManualVerificationProps {
  shopId: number;
  onProgress?: (progress: ManualVerificationProgress) => void;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  identity_front: 'Pièce d’identité · recto',
  identity_back: 'Pièce d’identité · verso',
  identity_passport: 'Passeport',
};
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STATUS_LABELS: Record<string, string> = {
  not_submitted: 'À compléter',
  pending: 'En attente',
  under_review: 'En examen',
  action_required: 'Correction demandée',
  approved: 'Acceptée',
  rejected: 'À reprendre',
};

export function MerchantManualVerification({ shopId, onProgress }: MerchantManualVerificationProps) {
  const [data, setData] = useState<ManualStatus | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [identityDocumentKind, setIdentityDocumentKind] = useState<IdentityDocumentKind>('identity_card');
  const [busyType, setBusyType] = useState<DocumentType | 'consent' | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/shops/${shopId}/manual-verification`, { cache: 'no-store' });
      const result = await response.json() as ManualStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Impossible de charger votre dossier.');
      setData(result);
      const availableTypes = new Set(result.documents
        .filter((document) => document.status === 'available')
        .map((document) => document.document_type));
      setIdentityDocumentKind(
        availableTypes.has('identity_passport') && !(availableTypes.has('identity_front') && availableTypes.has('identity_back'))
          ? 'passport'
          : 'identity_card',
      );
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger votre dossier.');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const identityDocs = data?.documents.filter((document) => document.document_type.startsWith('identity_')) || [];
  const hasIdentityPassport = identityDocs.some((document) => document.document_type === 'identity_passport' && document.status === 'available');
  const hasIdentityFront = identityDocs.some((document) => document.document_type === 'identity_front' && document.status === 'available');
  const hasIdentityBack = identityDocs.some((document) => document.document_type === 'identity_back' && document.status === 'available');
  const identityReady = hasIdentityPassport || hasIdentityFront && hasIdentityBack;
  const identityApproved = data?.identity_status === 'approved';
  const identityProgress = identityDocumentKind === 'passport'
    ? Number(hasIdentityPassport)
    : Number(hasIdentityFront) + Number(hasIdentityBack);

  useEffect(() => {
    if (!data || !onProgress) return;
    onProgress({
      identityStatus: data.identity_status,
      identityReady: identityReady || identityApproved,
    });
  }, [data, identityApproved, identityReady, onProgress]);

  async function acceptConsent() {
    setBusyType('consent');
    setError('');
    try {
      const response = await fetch(`/api/shops/${shopId}/manual-verification/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Consentement non enregistré.');
      setNotice('Votre consentement est enregistré.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Consentement non enregistré.');
    } finally {
      setBusyType(null);
    }
  }

  async function uploadDocument(documentType: DocumentType, file?: File) {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError('Formats acceptés : JPEG, PNG ou WebP.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      setError('Chaque image doit peser au maximum 10 Mo.');
      return;
    }
    setBusyType(documentType);
    setError('');
    setNotice('');
    try {
      const urlResponse = await fetch(`/api/shops/${shopId}/manual-verification/documents/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_type: documentType, content_type: file.type, size: file.size }),
      });
      const upload = await urlResponse.json() as { document_id?: string; upload_url?: string; error?: string };
      if (!urlResponse.ok || !upload.document_id || !upload.upload_url) {
        throw new Error(upload.error || 'Impossible de préparer le dépôt sécurisé.');
      }
      const putResponse = await fetch(upload.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error('Le dépôt a échoué. Vérifiez votre connexion puis réessayez.');
      const completeResponse = await fetch(`/api/shops/${shopId}/manual-verification/documents/${upload.document_id}/complete`, { method: 'POST' });
      const completion = await completeResponse.json() as { error?: string };
      if (!completeResponse.ok) throw new Error(completion.error || 'Impossible de vérifier le fichier reçu.');
      setNotice(`${DOCUMENT_LABELS[documentType]} ajouté en toute sécurité.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le dépôt a échoué.');
      await refresh();
    } finally {
      setBusyType(null);
    }
  }

  async function deleteDocument(documentId: string) {
    setDeletingId(documentId);
    setError('');
    try {
      const response = await fetch(`/api/shops/${shopId}/manual-verification/documents/${documentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || 'Suppression impossible.');
      }
      setNotice('Justificatif supprimé.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Suppression impossible.');
    } finally {
      setDeletingId('');
    }
  }

  function documentPicker(documentType: DocumentType) {
    const active = data?.documents.find((document) => document.document_type === documentType && document.status === 'available');
    const pending = !active && data?.documents.some((document) => document.document_type === documentType && document.status === 'pending_upload');
    return <div key={documentType} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{DOCUMENT_LABELS[documentType]}</p>
        <p className="mt-1 text-xs text-slate-500">{active ? `${Math.ceil(active.file_size / 1024)} Ko · reçu ${new Date(active.created_at).toLocaleDateString('fr-FR')}` : pending ? 'Dépôt à terminer' : 'Aucun fichier reçu'}</p>
      </div>
      <div className="flex items-center gap-2">
        {active && <button type="button" onClick={() => void deleteDocument(active.id)} disabled={Boolean(deletingId)} aria-label={`Supprimer ${DOCUMENT_LABELS[documentType]}`} className="grid h-10 w-10 place-items-center rounded-lg border border-rose-200 text-rose-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white hover:bg-emerald-700 has-[:disabled]:cursor-wait has-[:disabled]:opacity-50">
          {busyType === documentType ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {active ? 'Remplacer' : 'Ajouter'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!data?.consent_at || !data.storage_available || Boolean(busyType)} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void uploadDocument(documentType, file);
          }} className="sr-only" />
        </label>
      </div>
    </div>;
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><FileCheck2 className="h-5 w-5" /></span>
      <div>
        <h3 className="font-extrabold text-slate-900">Vérifier mon identité manuellement</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">Choisissez une seule option : CNI recto-verso ou passeport. Aucun justificatif sur votre boutique n’est demandé.</p>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {loading && !data && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement de votre dossier…</p>}
    {!loading && !data && <button type="button" onClick={() => { setLoading(true); void refresh(); }} className="mt-4 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700">Réessayer le chargement</button>}
    {data?.decisions.find((decision) => decision.type === 'identity')?.reason && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><b>{STATUS_LABELS[data.decisions.find((decision) => decision.type === 'identity')?.status || ''] || 'Mise à jour'} :</b> {data.decisions.find((decision) => decision.type === 'identity')?.reason}</p>}
    <ol className="mt-4 grid gap-2 sm:grid-cols-3">
      {[
        ['1', 'Choisir une pièce', 'CNI ou passeport'],
        ['2', 'Ajouter les photos', 'Le recto et le verso si CNI'],
        ['3', 'Attendre la revue', 'Le statut sera mis à jour ici'],
      ].map(([number, title, description]) => <li key={number} className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-800 text-[11px] font-black text-white">{number}</span>
        <span><span className="block text-xs font-bold text-slate-800">{title}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span></span>
      </li>)}
    </ol>
    <p className="mt-3 text-xs leading-5 text-slate-600">Photos JPEG, PNG ou WebP, 10 Mo maximum. Stockage privé ; suppression 90 jours après la décision.</p>
    {data && !data.consent_at ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-700">
        <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-800" />
        <span>J’accepte l’examen sécurisé de ma pièce d’identité. Seul le Super Admin peut la consulter ; les accès sont journalisés et le fichier est supprimé 90 jours après la décision. <a href="/confidentialite" target="_blank" rel="noreferrer" className="font-bold underline">Politique de confidentialité</a>.</span>
      </label>
      <button type="button" onClick={() => void acceptConsent()} disabled={!consentChecked || busyType === 'consent'} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{busyType === 'consent' && <LoaderCircle className="h-4 w-4 animate-spin" />}Enregistrer mon consentement</button>
    </div> : data ? <div className="mt-4 rounded-xl border border-slate-200 p-3 sm:p-4" role="tabpanel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h4 className="text-sm font-black text-slate-800">Pièce d’identité du responsable</h4><p className="mt-1 text-xs text-slate-500">Choisissez CNI recto-verso ou passeport.</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">Statut : {STATUS_LABELS[data.identity_status] || data.identity_status}</span>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600"><span>Pièces reçues</span><span>{identityProgress}/{identityDocumentKind === 'identity_card' ? 2 : 1}</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Pièces d’identité reçues" aria-valuemin={0} aria-valuemax={identityDocumentKind === 'identity_card' ? 2 : 1} aria-valuenow={identityProgress}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-[var(--mt-motion-standard)]" style={{ width: `${identityProgress / (identityDocumentKind === 'identity_card' ? 2 : 1) * 100}%` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={identityDocumentKind === 'identity_card'} onClick={() => setIdentityDocumentKind('identity_card')} className={`min-h-10 rounded-lg border px-3 text-xs font-bold ${identityDocumentKind === 'identity_card' ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-slate-300 text-slate-700'}`}>Carte d’identité</button>
        <button type="button" aria-pressed={identityDocumentKind === 'passport'} onClick={() => setIdentityDocumentKind('passport')} className={`min-h-10 rounded-lg border px-3 text-xs font-bold ${identityDocumentKind === 'passport' ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-slate-300 text-slate-700'}`}>Passeport</button>
      </div>
      <div className="mt-3 space-y-2">
        {identityDocumentKind === 'identity_card'
          ? <>{documentPicker('identity_front')}{documentPicker('identity_back')}</>
          : documentPicker('identity_passport')}
      </div>
      {identityApproved
        ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Votre identité a déjà été acceptée.</p>
        : identityReady && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Pièces d’identité déposées. L’équipe MaTable peut maintenant examiner votre identité.</p>}
    </div> : null}
    {!data?.storage_available && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Le dépôt sécurisé n’est pas encore configuré. Les fichiers ne peuvent pas être envoyés tant que cette configuration n’est pas activée.</p>}
  </section>;
}
