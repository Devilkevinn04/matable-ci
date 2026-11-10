import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, ShieldCheck, Trash2, Upload } from 'lucide-react';

type DocumentType = 'storefront' | 'interior' | 'products' | 'identity_front' | 'identity_back' | 'identity_passport';
interface VerificationDocument {
  id: string;
  document_type: DocumentType;
  content_type: string;
  file_size: number;
  status: 'pending_upload' | 'available';
  created_at: string;
}
interface ManualStatus {
  business_status: string;
  identity_status: string;
  consent_at: string | null;
  storage_available: boolean;
  documents: VerificationDocument[];
  decisions: Array<{ type: string; status: string; reason: string; created_at: string }>;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  storefront: 'Devanture ou enseigne',
  interior: 'Intérieur du commerce',
  products: 'Produits ou prestations',
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
  approved: 'Examen accepté',
  rejected: 'Refusé',
};

interface MerchantManualVerificationProps {
  shopId: number;
}

export function MerchantManualVerification({ shopId }: MerchantManualVerificationProps) {
  const [data, setData] = useState<ManualStatus | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [busyType, setBusyType] = useState<DocumentType | 'consent' | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/shops/${shopId}/manual-verification`, { cache: 'no-store' });
      const result = await response.json() as ManualStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Impossible de charger votre dossier.');
      setData(result);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger votre dossier.');
    }
  }, [shopId]);

  useEffect(() => { void refresh(); }, [refresh]);

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

  const businessDocs = data?.documents.filter((document) => ['storefront', 'interior', 'products'].includes(document.document_type)) || [];
  const identityDocs = data?.documents.filter((document) => document.document_type.startsWith('identity_')) || [];

  function documentPicker(documentType: DocumentType) {
    const active = data?.documents.find((document) => document.document_type === documentType && document.status === 'available');
    return <div key={documentType} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{DOCUMENT_LABELS[documentType]}</p>
        <p className="mt-1 text-xs text-slate-500">{active ? `${Math.ceil(active.file_size / 1024)} Ko · reçu ${new Date(active.created_at).toLocaleDateString('fr-FR')}` : 'Aucun fichier reçu'}</p>
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><ShieldCheck className="h-5 w-5" /></span>
      <div>
        <h3 className="font-extrabold text-slate-900">Vérification manuelle temporaire</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">Les dossiers sont examinés par l’équipe MaTable. Le contrôle visuel d’une pièce ne garantit pas son authenticité et ne remplace pas une vérification biométrique.</p>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {data && <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <p className="rounded-lg bg-slate-50 p-3 text-sm">Boutique : <b>{STATUS_LABELS[data.business_status] || data.business_status}</b></p>
      <p className="rounded-lg bg-slate-50 p-3 text-sm">Identité : <b>{STATUS_LABELS[data.identity_status] || data.identity_status}</b></p>
    </div>}
    {(['business', 'identity'] as const).map((type) => {
      const decision = data?.decisions.find((entry) => entry.type === type);
      return decision?.reason ? <p key={`${decision.created_at}-${type}`} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><b>{type === 'business' ? 'Boutique' : 'Identité'} · {STATUS_LABELS[decision.status] || decision.status} :</b> {decision.reason}</p> : null;
    })}
    <p className="mt-4 text-xs leading-5 text-slate-600">Photos acceptées : JPEG, PNG ou WebP, 10 Mo maximum. Les justificatifs sont conservés dans un espace privé et supprimés 90 jours après la décision.</p>
    {!data?.consent_at ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-700">
        <input type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-800" />
        <span>J’accepte le dépôt et l’examen manuel des photos de mon commerce et des documents d’identité transmis. Je comprends que les accès sont réservés au Super Admin, que les consultations sont journalisées et que les fichiers sont supprimés 90 jours après la décision. Je peux consulter la <a href="/confidentialite" target="_blank" rel="noreferrer" className="font-bold underline">politique de confidentialité</a>.</span>
      </label>
      <button type="button" onClick={() => void acceptConsent()} disabled={!consentChecked || busyType === 'consent'} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{busyType === 'consent' && <LoaderCircle className="h-4 w-4 animate-spin" />}Enregistrer mon consentement</button>
    </div> : <>
      <div className="mt-5 space-y-3">
        <div><h4 className="mb-2 text-sm font-black text-slate-800">Vérification de la boutique</h4><div className="space-y-2">{documentPicker('storefront')}{documentPicker('interior')}{documentPicker('products')}</div><p className="mt-2 text-xs text-slate-500">Ajoutez une photo de devanture et au moins une photo de l’intérieur ou de produits/prestations.</p></div>
        <div><h4 className="mb-2 text-sm font-black text-slate-800">Vérification d’identité</h4><div className="space-y-2">{documentPicker('identity_front')}{documentPicker('identity_back')}{documentPicker('identity_passport')}</div><p className="mt-2 text-xs text-slate-500">Ajoutez le recto et le verso de votre CNI, ou un passeport.</p></div>
      </div>
      {!data?.storage_available && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Le dépôt sécurisé n’est pas encore configuré. Les fichiers ne peuvent pas être envoyés tant que cette configuration n’est pas activée.</p>}
    </>}
    {businessDocs.length > 0 && identityDocs.length > 0 && <p className="mt-4 text-xs text-slate-500">Vos deux dossiers sont prêts à être examinés séparément. Vous serez informé du résultat dans votre espace commerçant.</p>}
  </section>;
}
