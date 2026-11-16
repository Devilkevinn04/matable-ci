import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldCheck } from 'lucide-react';
import { MerchantIdentityVerification } from './lazyMerchantIdentityVerification';
import type { VerificationStatus } from './MerchantIdentityVerification';
import { MerchantManualVerification, type ManualVerificationProgress } from './MerchantManualVerification';

type VerificationStep = 1 | 2;

interface MerchantVerificationWizardProps {
  shopId: number;
  shopName: string;
  step: VerificationStep;
  onStepChange: (step: VerificationStep) => void;
  diditStatus: string;
  diditAvailable: boolean | null;
  manualIdentityOpen: boolean;
  onToggleManualIdentity: () => void;
  identityStepDone: boolean;
  manualProgress: ManualVerificationProgress | null;
  onDiditStatusChange: (status: VerificationStatus) => void;
  onManualProgress: (progress: ManualVerificationProgress) => void;
}

const statusLabels: Record<string, string> = {
  pending: 'À commencer',
  submitted: 'Transmise',
  under_review: 'En cours d’examen',
  verified: 'Acceptée',
  approved: 'Acceptée',
  rejected: 'À reprendre',
  action_required: 'Correction demandée',
  not_required: 'Non requise',
};

function getStatusLabel(status: string): string {
  return statusLabels[status] || status.replaceAll('_', ' ');
}

export function MerchantVerificationWizard({
  shopId,
  shopName,
  step,
  onStepChange,
  diditStatus,
  diditAvailable,
  manualIdentityOpen,
  onToggleManualIdentity,
  identityStepDone,
  manualProgress,
  onDiditStatusChange,
  onManualProgress,
}: MerchantVerificationWizardProps) {
  const canOpenStep = (target: VerificationStep) => target === 1 || target === 2 && identityStepDone;
  const identitySummaryStatus = manualProgress?.identityStatus === 'approved'
    ? 'approved'
    : manualProgress?.identityReady ? 'submitted'
    : identityStepDone ? diditStatus : 'pending';

  useEffect(() => {
    if (diditAvailable === false && !manualIdentityOpen) {
      onToggleManualIdentity();
    }
  }, [diditAvailable, manualIdentityOpen, onToggleManualIdentity]);

  const steps = [
    { number: 1 as const, label: 'Identité', detail: 'Vérifier le responsable', done: identityStepDone, icon: ShieldCheck },
    { number: 2 as const, label: 'Suivi', detail: 'Voir le résultat', done: false, icon: FileCheck2 },
  ];

  return <section className="space-y-4">
    <header className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Vérification d’identité</p>
      <h2 className="mt-1 text-lg font-black text-slate-950">On avance étape par étape</h2>
      <p className="mt-1 text-sm leading-5 text-slate-600">Vérifiez l’identité de la personne responsable. Aucun justificatif sur l’existence ou l’activité de la boutique n’est demandé.</p>
      <nav aria-label="Étapes de vérification" className="mt-4 grid grid-cols-2 gap-2">
        {steps.map(({ number, label, detail, done, icon: Icon }) => {
          const active = step === number;
          const enabled = canOpenStep(number);
          return <button key={number} type="button" disabled={!enabled} aria-current={active ? 'step' : undefined} onClick={() => onStepChange(number)} className={`min-h-[76px] rounded-xl border p-2 text-left transition-colors sm:p-3 ${active ? 'border-emerald-700 bg-emerald-800 text-white shadow-sm' : done ? 'border-emerald-200 bg-white text-emerald-950' : 'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed disabled:opacity-60`}>
            <span className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-black sm:text-xs">{number}. {label}</span>
              {done ? <Check className="h-4 w-4 shrink-0" /> : <Icon className="h-4 w-4 shrink-0" />}
            </span>
            <span className={`mt-1 block text-[10px] leading-4 sm:text-[11px] ${active ? 'text-emerald-50' : 'text-slate-500'}`}>{detail}</span>
          </button>;
        })}
      </nav>
    </header>

    {step === 1 && <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-800 text-xs font-black text-white">1</span>
        <div><h3 className="text-sm font-black text-slate-900">Vérifier l’identité du responsable</h3><p className="text-xs text-slate-500">Le parcours sécurisé Didit est la méthode recommandée.</p></div>
      </div>
      <MerchantIdentityVerification shopId={shopId} shopName={shopName} onStatusChange={onDiditStatusChange} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Didit ne fonctionne pas ?</h4>
            <p className="mt-1 text-xs leading-5 text-slate-600">Envoyez une CNI recto-verso ou un passeport pour un examen manuel.</p>
          </div>
          <button type="button" aria-expanded={manualIdentityOpen} onClick={onToggleManualIdentity} className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            {manualIdentityOpen ? 'Masquer le dépôt manuel' : 'Choisir le dépôt manuel'}
          </button>
        </div>
        {manualIdentityOpen && <div className="mt-4">
          <MerchantManualVerification shopId={shopId} onProgress={onManualProgress} />
        </div>}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!identityStepDone && <p role="status" className="self-center text-xs text-slate-500">Terminez Didit ou déposez les justificatifs manuels pour continuer.</p>}
        <button type="button" onClick={() => onStepChange(2)} disabled={!identityStepDone} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Voir le suivi <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>}

    {step === 2 && <div className="space-y-3">
      <button type="button" onClick={() => onStepChange(1)} className="inline-flex min-h-9 items-center gap-1 px-1 text-xs font-bold text-emerald-900"><ArrowLeft className="h-4 w-4" /> Retour à l’identité</button>
      <article className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Check className="h-5 w-5" /></span>
          <div><h3 className="font-black text-slate-900">{identitySummaryStatus === 'approved' || identitySummaryStatus === 'verified' ? 'Votre identité est vérifiée' : 'Votre dossier est transmis'}</h3><p className="mt-1 text-sm leading-5 text-slate-600">Seule l’identité de la personne responsable est examinée. Le statut sera actualisé ici ; aucune vérification de l’existence de la boutique n’est requise.</p></div>
        </div>
        <dl className="mt-4">
          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">Vérification d’identité</dt><dd className="mt-1 text-sm font-black text-slate-900">{getStatusLabel(identitySummaryStatus)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => onStepChange(1)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700"><ShieldCheck className="h-4 w-4" /> Revoir l’identité</button>
        </div>
      </article>
    </div>}
  </section>;
}
