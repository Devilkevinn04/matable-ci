// Frise d’avancement d’une commande, vue par le client : Envoyée → Acceptée → (Prête) → Remise.
// Les états d’arrêt (refusée, annulée, expirée) remplacent la frise par un message clair.
import { Check, Clock3, XCircle } from 'lucide-react';

type Step = { key: string; label: string };

const ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];

const STOPPED: Record<string, { title: string; detail: string }> = {
  rejected: { title: 'Demande refusée par la boutique', detail: 'Les articles ont été remis en vente. Vous pouvez contacter la boutique ou commander ailleurs.' },
  cancelled: { title: 'Commande annulée', detail: 'Aucun paiement n’a été effectué via MaTable.' },
  expired: { title: 'Demande expirée', detail: 'La boutique n’a pas répondu dans les 2 heures : les articles ont été remis en vente.' },
};

const CAPTION: Record<string, string> = {
  pending: 'La boutique a 2 heures pour accepter votre demande. Vos articles sont réservés en attendant.',
  confirmed: 'La boutique a accepté. Convenez de la remise et du règlement avec elle sur WhatsApp.',
  preparing: 'Votre commande est en préparation.',
  ready: 'Votre commande est prête.',
  delivered: 'Commande remise. Merci et à bientôt !',
};

export function OrderProgress({ status, category, compact = false }: { status: string; category?: string; compact?: boolean }) {
  const stopped = STOPPED[status];
  if (stopped) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-slate-900">{stopped.title}</p>
          {!compact && <p className="mt-0.5 text-sm leading-5 text-slate-600">{stopped.detail}</p>}
        </div>
      </div>
    );
  }

  // « Prête » n’a de sens que pour la restauration ; ailleurs, on passe d’Acceptée à Remise.
  const steps: Step[] = category === 'food'
    ? [{ key: 'pending', label: 'Envoyée' }, { key: 'confirmed', label: 'Acceptée' }, { key: 'ready', label: 'Prête' }, { key: 'delivered', label: 'Remise' }]
    : [{ key: 'pending', label: 'Envoyée' }, { key: 'confirmed', label: 'Acceptée' }, { key: 'delivered', label: 'Remise' }];
  const rank = (key: string) => ORDER.indexOf(key);
  const current = rank(status === 'preparing' && category !== 'food' ? 'confirmed' : status);

  return (
    <div>
      <ol className="flex items-start" aria-label="Avancement de la commande">
        {steps.map((step, index) => {
          const reached = current >= rank(step.key);
          const isCurrent = reached && (index === steps.length - 1 || current < rank(steps[index + 1].key));
          return (
            <li key={step.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
              {index > 0 && (
                <span aria-hidden="true" className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${reached ? 'bg-[var(--mt-green-primary)]' : 'bg-[#e3ddd2]'}`} />
              )}
              <span className={`relative z-10 grid h-7 w-7 place-items-center rounded-full ${reached ? 'bg-[var(--mt-green-primary)] text-white' : 'border-2 border-[#d6cfc3] bg-white text-transparent'} ${isCurrent && status !== 'delivered' ? 'ring-4 ring-emerald-100' : ''}`}>
                {reached ? (isCurrent && status === 'pending' ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />) : null}
              </span>
              <span className={`mt-1.5 text-xs ${isCurrent ? 'font-extrabold text-slate-900' : reached ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {!compact && CAPTION[status] && <p className="mt-3 text-sm leading-6 text-slate-600">{CAPTION[status]}</p>}
    </div>
  );
}

/* -------- Commandes suivies sur cet appareil (clients sans compte) -------- */

const STORAGE_KEY = 'matable-tracked-orders';
const MAX_TRACKED = 10;

export interface TrackedOrderRef { id: number; token: string; shopSlug: string; shopName: string; createdAt: string }

export function readTrackedOrders(): TrackedOrderRef[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is TrackedOrderRef => Boolean(item && typeof item.id === 'number' && typeof item.token === 'string')) : [];
  } catch {
    return [];
  }
}

export function rememberTrackedOrder(order: TrackedOrderRef): void {
  try {
    const others = readTrackedOrders().filter((item) => item.id !== order.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([order, ...others].slice(0, MAX_TRACKED)));
  } catch {
    // Sans stockage, le lien de suivi reste utilisable depuis l’écran de confirmation.
  }
}

export function trackingPath(order: { id: number; token: string }): string {
  // Le jeton reste après « # » : il n’est jamais transmis dans l’adresse demandée au serveur.
  return `/suivi/${order.id}#${encodeURIComponent(order.token)}`;
}
