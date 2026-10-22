import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, CircleHelp, RotateCcw } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  getGuideProgressKey,
  parseGuideProgress,
  toggleGuideStep,
  type GuideRole,
} from '../utils/guideProgress';

interface GuideStep {
  id: string;
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}

interface RoleGuide {
  label: string;
  intro: string;
  steps: GuideStep[];
  note?: string;
}

const roleGuides: Record<GuideRole, RoleGuide> = {
  customer: {
    label: 'Client',
    intro: 'Repérez une boutique, préparez votre demande et convenez directement des modalités avec le commerçant.',
    steps: [
      { id: 'find-shop', title: 'Trouver une boutique ou un produit', description: 'Parcourez l’annuaire ou recherchez par nom, catégorie et ville.', href: '/boutiques', linkLabel: 'Explorer les boutiques' },
      { id: 'check-store', title: 'Vérifier les informations de la vitrine', description: 'Consultez le catalogue, les prix, les horaires et les options de retrait ou livraison indiquées par le commerçant.' },
      { id: 'prepare-order', title: 'Préparer votre demande', description: 'Choisissez les articles et quantités, puis précisez vos coordonnées et le lieu souhaité avant de continuer.' },
      { id: 'contact-merchant', title: 'Confirmer avec le commerçant', description: 'La demande se poursuit sur WhatsApp. Confirmez directement la disponibilité, le prix final et les modalités; le paiement de la commande n’est pas encaissé par MaTable.ci.' },
      { id: 'manage-account', title: 'Retrouver votre espace client', description: 'La création d’un compte client est facultative. Si vous en avez un, utilisez votre espace pour retrouver vos informations et commandes disponibles.', href: '/connexion', linkLabel: 'Ouvrir mon compte' },
    ],
    note: 'Ne communiquez jamais votre mot de passe, PIN ou code de vérification dans une conversation.',
  },
  merchant: {
    label: 'Marchand',
    intro: 'Configurez une vitrine exacte, terminez les étapes de vérification et traitez les demandes dans votre espace marchand.',
    steps: [
      { id: 'merchant-access', title: 'Ouvrir votre espace marchand', description: 'Connectez-vous avec les informations de votre boutique. Si vous débutez, créez votre vitrine.', href: '/app', linkLabel: 'Accéder à mon espace' },
      { id: 'merchant-profile', title: 'Compléter les informations de la boutique', description: 'Vérifiez le nom, le contact WhatsApp, la commune, la catégorie, les horaires et la présentation.' },
      { id: 'merchant-catalog', title: 'Mettre le catalogue à jour', description: 'Ajoutez des photos récentes, des prix exacts et le stock disponible. Désactivez les articles indisponibles.' },
      { id: 'merchant-identity', title: 'Suivre la vérification d’identité', description: 'Le responsable soumet la vérification demandée et suit le statut fourni par Didit depuis le tableau de bord.' },
      { id: 'merchant-plan', title: 'Consulter la formule et les limites', description: 'Vérifiez les limites de votre formule. Une modification planifiée prend effet à la prochaine échéance selon les conditions affichées.', href: '/commercants', linkLabel: 'Voir les formules' },
      { id: 'merchant-orders', title: 'Traiter les demandes clients', description: 'Consultez les commandes reçues, confirmez les détails et convenez du paiement, du retrait ou de la livraison avec le client.' },
    ],
    note: 'Gardez votre PIN privé. L’équipe MaTable.ci ne vous demandera jamais de mot de passe ni de code à usage unique.',
  },
  'super-admin': {
    label: 'Super-admin',
    intro: 'Utilisez les vues d’administration selon le besoin, expliquez les décisions sensibles et vérifiez leur journalisation.',
    steps: [
      { id: 'admin-directory', title: 'Examiner les boutiques et les comptes', description: 'Recherchez l’enregistrement concerné et utilisez uniquement les informations nécessaires à l’opération.', href: '/admin', linkLabel: 'Ouvrir l’administration' },
      { id: 'admin-subscriptions', title: 'Gérer les tarifs et formules', description: 'Les tarifs et limites numériques Pro sont auditables. Les changements d’avantages pour les abonnés Pro existants s’appliquent au prochain renouvellement.' },
      { id: 'admin-lifecycle', title: 'Contrôler les changements d’abonnement', description: 'Vérifiez la date d’échéance et les paiements en attente avant toute programmation, résiliation ou suspension; indiquez un motif lorsque l’interface le demande.' },
      { id: 'admin-audit', title: 'Vérifier le journal d’audit', description: 'Après une opération sensible, contrôlez l’acteur, le motif, l’objet et le résultat dans le journal.' },
      { id: 'admin-roles', title: 'Respecter le périmètre de chaque rôle', description: 'Réservez la gestion globale au Super-admin. Ne demandez jamais de PIN, mot de passe ou code de vérification.' },
    ],
    note: 'Les guides n’autorisent aucune opération supplémentaire. Les permissions sont contrôlées par le serveur.',
  },
  verification: {
    label: 'Vérification',
    intro: 'Le rôle vérification traite les dossiers d’identité et la modération dans son périmètre limité.',
    steps: [
      { id: 'verification-queue', title: 'Consulter la file d’identité', description: 'Ouvrez le dossier de la boutique concernée et examinez les informations disponibles dans l’outil.', href: '/admin', linkLabel: 'Ouvrir l’espace vérification' },
      { id: 'verification-status', title: 'Suivre les statuts Didit', description: 'Utilisez les statuts Didit comme source des décisions de vérification; ne prétendez pas valider un contrôle auprès du fournisseur.' },
      { id: 'verification-moderation', title: 'Traiter les avis et signalements', description: 'Examinez les éléments soumis et appliquez uniquement les actions de modération permises par votre rôle.' },
      { id: 'verification-escalate', title: 'Transmettre les autres demandes', description: 'Transmettez les demandes de compte, d’abonnement ou de paiement au Super-admin.' },
    ],
    note: 'Ce rôle n’accède pas aux opérations financières ou globales. Ne demandez jamais un mot de passe, PIN ou code secret.',
  },
};

const isGuideRole = (value: string | null): value is GuideRole =>
  value !== null && Object.hasOwn(roleGuides, value);

interface GuideChecklistProps {
  role: GuideRole;
  accountId?: string | number | null;
  collapsible?: boolean;
}

export function GuideChecklist({ role, accountId, collapsible = false }: GuideChecklistProps) {
  const storageKey = getGuideProgressKey(role, accountId);
  const [progress, setProgress] = useState<string[]>([]);
  const [storageError, setStorageError] = useState('');
  const guide = roleGuides[role];
  const validStepIds = useMemo(() => guide.steps.map((step) => step.id), [guide]);
  const completedCount = progress.length;

  useEffect(() => {
    try {
      setProgress(parseGuideProgress(window.localStorage.getItem(storageKey), validStepIds));
      setStorageError('');
    } catch {
      setProgress([]);
      setStorageError('La progression ne peut pas être lue dans le stockage de ce navigateur.');
    }
  }, [storageKey, validStepIds]);

  const toggleStep = (stepId: string) => {
    const nextProgress = toggleGuideStep(progress, stepId);
    setProgress(nextProgress);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextProgress));
      setStorageError('');
    } catch {
      setStorageError('La progression est visible pour cette session, mais n’a pas pu être enregistrée dans ce navigateur.');
    }
  };

  const resetProgress = () => {
    setProgress([]);
    try {
      window.localStorage.removeItem(storageKey);
      setStorageError('');
    } catch {
      setStorageError('La progression a été réinitialisée à l’écran, mais le stockage du navigateur est indisponible.');
    }
  };

  const content = (
        <section className="rounded-2xl border border-[#e3d9cc] bg-white p-4 sm:p-6" aria-labelledby={`guide-heading-${role}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">Guide · {guide.label}</p>
              <h2 id={`guide-heading-${role}`} className="mt-1 text-xl font-black sm:text-2xl">Les étapes essentielles</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f6a61]">{guide.intro}</p>
            </div>
            <button
              type="button"
              onClick={resetProgress}
              disabled={completedCount === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d9d1c6] px-3 text-xs font-bold text-[#514a42] hover:bg-[#f8f6f0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Réinitialiser
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3" role="status" aria-label={`Progression du guide : ${completedCount} sur ${guide.steps.length} étapes`}>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eee9e1]">
              <div
                className="h-full rounded-full bg-[#176b55] transition-[width]"
                style={{ width: `${(completedCount / guide.steps.length) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-black text-[#176b55]">{completedCount}/{guide.steps.length}</span>
          </div>

          <ol className="mt-5 space-y-3">
            {guide.steps.map((step, index) => {
              const isComplete = progress.includes(step.id);
              return (
                <li key={step.id} className={`rounded-xl border p-4 transition ${isComplete ? 'border-[#b7d7c6] bg-[#f1f8f3]' : 'border-[#e8e1d7] bg-[#fffdf9]'}`}>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-label={`${isComplete ? 'Marquer comme non terminée' : 'Marquer comme terminée'} : ${step.title}`}
                      aria-pressed={isComplete}
                      onClick={() => toggleStep(step.id)}
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
                        isComplete ? 'border-[#176b55] bg-[#176b55] text-white' : 'border-[#bdb5aa] bg-white text-transparent hover:border-[#176b55]'
                      }`}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#a2642e]">Étape {index + 1}</p>
                      <h3 className={`mt-1 text-sm font-extrabold sm:text-base ${isComplete ? 'text-[#176b55]' : 'text-[#25231f]'}`}>{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6f6a61]">{step.description}</p>
                      {step.href && step.linkLabel && (
                        <Link to={step.href} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#c8dbd0] bg-white px-3 text-xs font-bold text-[#0f4d3d] hover:bg-[#e4f1ec]">
                          {step.linkLabel}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {guide.note && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {guide.note}
            </p>
          )}
          {storageError && <p role="alert" className="mt-3 text-xs font-semibold text-rose-800">{storageError}</p>}
        </section>
  );

  if (collapsible) {
    return (
      <details className="group rounded-2xl">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[#c8dbd0] bg-white px-4 py-3 text-sm font-bold text-[#0f4d3d] hover:bg-[#f4faf6] [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" aria-hidden="true" />Guide personnel · {guide.label}</span>
          <span className="text-xs font-black">{completedCount}/{guide.steps.length} · Ouvrir</span>
        </summary>
        <div className="mt-3">{content}</div>
      </details>
    );
  }

  return content;
}

export function UserGuidePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const requestedRole = searchParams.get('role');
  const role = isGuideRole(requestedRole) ? requestedRole : 'customer';
  const locationState: unknown = location.state;
  const accountId = locationState && typeof locationState === 'object' && 'guideAccountId' in locationState
    && (typeof locationState.guideAccountId === 'string' || typeof locationState.guideAccountId === 'number')
    ? locationState.guideAccountId
    : null;
  const returnPath = role === 'merchant' ? '/app' : role === 'super-admin' || role === 'verification' ? '/admin' : '/compte';
  const returnLabel = role === 'merchant' ? 'Retour à ma boutique' : role === 'super-admin' || role === 'verification' ? 'Retour à l’administration' : 'Retour à mon compte';

  return (
    <main className="min-h-[70vh] bg-[#f8f6f0] px-4 py-8 text-[#25231f] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link to={returnPath} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#176b55] hover:text-[#e6572b]">
          {returnLabel}
        </Link>
        <header className="mt-6 rounded-3xl bg-[#123b31] p-5 text-white sm:mt-8 sm:p-8">
          <div className="flex items-center gap-2 text-[#f0ba80]">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Guide personnel MaTable.ci</p>
          </div>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Votre parcours · {roleGuides[role].label}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">
            Suivez les étapes à votre rythme. Votre progression est enregistrée séparément pour votre espace sur cet appareil.
          </p>
        </header>
        <div className="mt-6">
          <GuideChecklist role={role} accountId={accountId} />
        </div>
      </div>
    </main>
  );
}
