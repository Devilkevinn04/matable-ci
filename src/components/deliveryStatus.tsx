import { XCircle } from 'lucide-react';

/** Libellés partagés par le suivi client, marchand, livreur et les consoles admin. */
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  requested: 'En attente d’un livreur',
  accepted: 'Livreur assigné',
  to_pickup: 'En route vers la boutique',
  picked_up: 'En cours de livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

export const DELIVERY_PROGRESS_STEPS = [
  { status: 'requested', label: 'Demandée' },
  { status: 'accepted', label: 'Livreur assigné' },
  { status: 'to_pickup', label: 'Vers la boutique' },
  { status: 'picked_up', label: 'En route vers le client' },
  { status: 'delivered', label: 'Livrée' },
] as const;

export type DeliveryStatusTone = 'waiting' | 'active' | 'done' | 'cancelled' | 'neutral';

export function isDeliveryCancelled(status: string): boolean {
  return status === 'cancelled';
}

export function isDeliveryDelivered(status: string): boolean {
  return status === 'delivered';
}

export function isDeliveryTerminal(status: string): boolean {
  return isDeliveryCancelled(status) || isDeliveryDelivered(status);
}

/** Position de 0 à 4 dans le parcours ; -1 si la course est annulée. */
export function deliveryProgressIndex(status: string): number {
  if (isDeliveryCancelled(status)) return -1;
  const index = DELIVERY_PROGRESS_STEPS.findIndex((step) => step.status === status);
  return index === -1 ? 0 : index;
}

export function getDeliveryStatusTone(status: string): DeliveryStatusTone {
  if (isDeliveryCancelled(status)) return 'cancelled';
  if (isDeliveryDelivered(status)) return 'done';
  if (status === 'requested') return 'waiting';
  if (DELIVERY_STATUS_LABELS[status]) return 'active';
  return 'neutral';
}

const BADGE_CLASSES: Record<DeliveryStatusTone, string> = {
  waiting: 'border-amber-200 bg-amber-50 text-amber-900',
  active: 'border-[#B9DCCF] bg-[#F0FAF5] text-[#0F6B54]',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-900',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

const DOT_CLASSES: Record<DeliveryStatusTone, string> = {
  waiting: 'bg-amber-500',
  active: 'bg-[#087F62]',
  done: 'bg-emerald-600',
  cancelled: 'bg-rose-500',
  neutral: 'bg-slate-400',
};

export function DeliveryStatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: 'sm' | 'md';
}) {
  const tone = getDeliveryStatusTone(status);
  const sizing = size === 'md' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold ${BADGE_CLASSES[tone]} ${sizing}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      {DELIVERY_STATUS_LABELS[status] || status}
    </span>
  );
}

/**
 * Mini frise de progression : 5 pastilles reliées, sans libellé pour rester
 * lisible dans une carte étroite. Le détail textuel est fourni juste en dessous.
 */
export function DeliveryProgress({ status }: { status: string }) {
  const currentIndex = deliveryProgressIndex(status);

  if (currentIndex === -1) {
    return (
      <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-900">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Course annulée : aucun livreur ne se déplace.
      </p>
    );
  }

  const currentSteps = DELIVERY_PROGRESS_STEPS[currentIndex];

  return (
    <div>
      <ol className="flex items-center" aria-label="Progression de la livraison">
        {DELIVERY_PROGRESS_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li key={step.status} className={index === DELIVERY_PROGRESS_STEPS.length - 1 ? 'flex items-center' : 'flex flex-1 items-center'}>
              <span
                aria-current={current ? 'step' : undefined}
                className={`grid h-3 w-3 shrink-0 place-items-center rounded-full border-2 ${
                  done || current ? 'border-[#087F62] bg-[#087F62]' : 'border-[#D5E3DC] bg-white'
                }`}
              >
                <span className="sr-only">
                  {step.label}
                  {current ? ' (étape actuelle)' : done ? ' (terminée)' : ''}
                </span>
              </span>
              {index < DELIVERY_PROGRESS_STEPS.length - 1 && (
                <span className={`h-0.5 flex-1 ${done ? 'bg-[#087F62]' : 'bg-[#E4EDE8]'}`} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[10px] font-bold text-[#0F6B54]">
        {currentSteps.label} · étape {currentIndex + 1} sur {DELIVERY_PROGRESS_STEPS.length}
      </p>
    </div>
  );
}
