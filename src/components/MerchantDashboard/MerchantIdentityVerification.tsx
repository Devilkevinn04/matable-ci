import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileCheck2, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';

export interface VerificationStatus {
  status: string;
  identity_method?: 'manual' | 'didit' | null;
  didit_available?: boolean;
  provider_status?: string | null;
  session_id?: string | null;
  session_url?: string | null;
  resume_available?: boolean;
  restart_available?: boolean;
  submitted_at: string | null;
  reviewer_note: string | null;
  decline_reasons?: Array<{ check: string; status: string; risks: string[] }>;
  decline_advice?: string[];
}

interface MerchantIdentityVerificationProps {
  shopId: number;
  shopName: string;
  onStatusChange?: (status: VerificationStatus) => void;
}

const statusDetails: Record<string, { label: string; description: string; tone: string }> = {
  pending: { label: 'À compléter', description: 'Aucune vérification d’identité n’est en cours. Vous pouvez commencer le parcours sécurisé ou consulter le dépôt manuel temporaire.', tone: 'border-amber-200 bg-amber-50 text-amber-950' },
  submitted: { label: 'Vérification démarrée', description: 'Terminez les étapes sur la page Didit déjà ouverte. Cette session reste active ; son résultat sera actualisé ici automatiquement.', tone: 'border-sky-200 bg-sky-50 text-sky-950' },
  under_review: { label: 'En cours de vérification', description: 'Didit examine les informations transmises. Aucune action n’est nécessaire ; le statut sera actualisé automatiquement.', tone: 'border-sky-200 bg-sky-50 text-sky-950' },
  verified: { label: 'Identité vérifiée', description: 'Le contrôle de votre identité a été validé.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  rejected: { label: 'Vérification non validée', description: 'Le contrôle n’a pas été validé. Consultez les corrections indiquées, puis choisissez la suite adaptée.', tone: 'border-rose-200 bg-rose-50 text-rose-950' },
  not_required: { label: 'Vérification non requise', description: 'Aucune vérification d’identité supplémentaire n’est demandée pour cette boutique.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
};

const expiredDetails = {
  label: 'Session expirée',
  description: 'Votre précédente session Didit a expiré avant d’être terminée. Vous pouvez la relancer; son expiration ne bloque pas à elle seule une boutique déjà approuvée.',
  tone: 'border-amber-200 bg-amber-50 text-amber-950',
};

const DIDIT_RETURN_STORAGE_KEY = 'matable:didit-return-at';
const FAST_POLL_DURATION_MS = 2 * 60 * 1000;
const FAST_POLL_INTERVAL_MS = 10 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;

function normalizeStatus(status: string): string {
  if (status === 'approved') return 'verified';
  if (status === 'action_required') return 'rejected';
  if (status === 'not_submitted') return 'pending';
  return status;
}

export function MerchantIdentityVerification({ shopId, shopName, onStatusChange }: MerchantIdentityVerificationProps) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasLoadedStatus, setHasLoadedStatus] = useState(false);
  const [fastPolling, setFastPolling] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
  const expired = ['Expired', 'Kyc Expired', 'Abandoned'].includes(status?.provider_status || '')
    && !['verified', 'rejected'].includes(status?.status || '');
  const details = expired ? expiredDetails : (statusDetails[status?.status || 'pending'] || statusDetails.pending);
  const canResume = Boolean(status?.resume_available && status?.session_url);
  const canStartVerification = status?.didit_available !== false
    && (!status || (!['verified', 'not_required'].includes(status.status) && status.restart_available !== false));
  const supportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour la vérification Didit de la boutique ${shopName}.`);
  const progress = status?.status === 'verified' || status?.status === 'not_required'
    ? 100
    : status?.status === 'under_review'
      ? 75
      : status?.status === 'submitted'
        ? 50
        : status?.status === 'rejected'
          ? 25
          : 0;

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/shops/${shopId}/identity-verification`, { cache: 'no-store' });
      const payload = await response.json() as VerificationStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Impossible de charger le statut.');
      const data = { ...payload, status: normalizeStatus(payload.status) };
      setStatus(data);
      setError('');
      setHasLoadedStatus(true);
      onStatusChangeRef.current?.(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger le statut.');
    }
  }, [shopId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Retour depuis Didit : le tableau de bord a déjà basculé sur cet onglet et
  // déposé un marqueur. On rafraîchit tout de suite, puis toutes les 10 s
  // pendant 2 minutes avant de revenir au rythme normal de 60 s.
  useEffect(() => {
    let returned = new URLSearchParams(window.location.search).get('verification') === 'complete';
    try {
      const storedAt = Number(window.sessionStorage.getItem(DIDIT_RETURN_STORAGE_KEY) || 0);
      if (storedAt && Date.now() - storedAt < 5 * 60 * 1000) returned = true;
      window.sessionStorage.removeItem(DIDIT_RETURN_STORAGE_KEY);
    } catch {
      // Stockage indisponible : le paramètre d’URL suffit.
    }
    if (!returned) return;
    setFastPolling(true);
    void refreshStatus();
    const timer = window.setTimeout(() => setFastPolling(false), FAST_POLL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  useEffect(() => {
    if (!['submitted', 'under_review'].includes(status?.status || '')) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshStatus();
    }, fastPolling ? FAST_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [fastPolling, refreshStatus, status?.status]);

  function resumeVerification() {
    const url = status?.session_url;
    if (!url || !url.startsWith('https://verify.didit.me/')) {
      setError('Le lien de reprise est invalide. Contactez l’assistance.');
      return;
    }
    window.location.assign(url);
  }

  async function startVerification() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/shops/${shopId}/identity-verification/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true }),
      });
      const data = await response.json() as { session_url?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de démarrer la vérification.');
      if (!data.session_url || !data.session_url.startsWith('https://verify.didit.me/')) {
        throw new Error('Le lien de vérification reçu est invalide.');
      }
      window.location.assign(data.session_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de démarrer la vérification.');
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <h3 className="font-extrabold text-slate-900">Vérification d’identité sécurisée</h3>
          <p className="mt-1 text-sm text-slate-600">La vérification est réalisée par Didit, notre prestataire spécialisé. MaTable ne reçoit pas et ne conserve pas vos pièces d’identité ou vos données biométriques.</p>
        </div>
      </div>

      <div className={`mt-4 rounded-xl border p-3 ${details.tone}`}>
        <div className="flex items-center gap-2">
          {progress === 100
            ? <CheckCircle2 className="h-5 w-5 shrink-0" />
            : <FileCheck2 className="h-5 w-5 shrink-0" />}
          <p className="text-sm font-bold">{details.label}</p>
        </div>
        <p className="mt-1 text-xs">{details.description}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-label="Progression de la vérification d’identité" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-current transition-[width] duration-[var(--mt-motion-deliberate)]" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 text-[10px] font-semibold">
          <span className="text-left">À démarrer</span><span className="text-center">Envoyée</span><span className="text-right">Terminée</span>
        </div>
      </div>
      {status?.didit_available === false && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Didit est momentanément indisponible. Utilisez le dépôt manuel présenté plus bas pour transmettre votre pièce d’identité.
        </p>
      )}

      {status?.status === 'rejected' && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-950">
          <p className="text-xs font-bold">Comment corriger</p>
          {status.decline_advice && status.decline_advice.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
              {status.decline_advice.map((advice) => <li key={advice}>{advice}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5">Le motif détaillé n’est pas disponible. Vérifiez la qualité de votre pièce et de votre selfie, puis réessayez.</p>
          )}
        </div>
      )}

      {canResume && (
        <button type="button" onClick={resumeVerification} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-600">
          <ExternalLink className="h-4 w-4" /> Reprendre ma vérification
        </button>
      )}

      {canStartVerification && (
        <>
          <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-slate-800">Préparer votre vérification</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
              <li>Préparez une pièce valide : CNI, passeport ou permis de conduire.</li>
              <li>Utilisez le document original, bien éclairé et entièrement visible.</li>
              <li>Gardez votre visage dégagé pour la vérification selfie si elle est demandée.</li>
            </ul>
          </details>

          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus-within:ring-2 focus-within:ring-emerald-700">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-emerald-800" />
            <span className="text-xs leading-5">J’accepte que Didit traite les informations nécessaires pour vérifier l’identité du responsable. MaTable reçoit le résultat, pas les documents ni les données biométriques. <a href="/confidentialite" target="_blank" rel="noreferrer" className="font-bold underline">Détails et droits</a>.</span>
          </label>
          <button type="button" onClick={() => void startVerification()} disabled={!consent || busy || !hasLoadedStatus} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {busy ? 'Connexion à Didit…' : status?.status === 'rejected' || expired ? 'Relancer la vérification avec Didit' : 'Continuer avec Didit'}
          </button>
        </>
      )}

      {status?.status === 'rejected' && supportUrl && (
        <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100">
          Contacter l’assistance
        </a>
      )}
      {['submitted', 'under_review'].includes(status?.status || '') && !canResume && (
        <p className="mt-3 text-xs leading-5 text-slate-600">La création d’une autre session interromprait le suivi de celle-ci. Vous pourrez en relancer une dans quelques minutes si aucune réponse n’arrive, ou contacter l’assistance.</p>
      )}
      <button type="button" onClick={() => void refreshStatus()} disabled={!hasLoadedStatus} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-wait disabled:opacity-60">
        <RefreshCw className="h-3.5 w-3.5" /> Actualiser le statut
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
