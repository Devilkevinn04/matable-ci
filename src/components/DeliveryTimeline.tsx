import { AlertCircle, CheckCircle2, Clock3 } from 'lucide-react';

export interface DeliveryTimelineEvent {
  id: number;
  actor_type: 'merchant' | 'driver' | 'admin' | string;
  actor_id: number | null;
  actor_name: string | null;
  previous_status: string | null;
  next_status: string;
  created_at: string;
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  requested: 'En attente d’un livreur',
  accepted: 'Livreur assigné',
  to_pickup: 'En route vers la boutique',
  picked_up: 'En cours de livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const ACTOR_LABELS: Record<string, string> = {
  merchant: 'Boutique',
  driver: 'Livreur',
  admin: 'MaTable.ci',
};

function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface DeliveryTimelineProps {
  events: DeliveryTimelineEvent[];
  loading?: boolean;
  error?: string | null;
  title?: string;
  emptyLabel?: string;
}

export function DeliveryTimeline({
  events,
  loading = false,
  error = null,
  title = 'Historique de la course',
  emptyLabel = 'L’historique apparaîtra dès la création de la course.',
}: DeliveryTimelineProps) {
  return (
    <section aria-label={title} className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <Clock3 className="h-3.5 w-3.5 text-slate-500" />
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
      </div>
      {loading && events.length === 0 && <p role="status" className="mt-2 text-[11px] text-slate-500">Chargement de l’historique…</p>}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}
        </p>
      )}
      {!loading && !error && events.length === 0 && <p className="mt-2 text-[11px] text-slate-500">{emptyLabel}</p>}
      {events.length > 0 && (
        <ol className="mt-2 space-y-2">
          {events.map((event, index) => (
            <li key={event.id} className="relative flex gap-2 pl-1">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                {index === events.length - 1
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-800">
                  {DELIVERY_STATUS_LABELS[event.next_status] || event.next_status}
                </p>
                <p className="text-[10px] text-slate-500">
                  {ACTOR_LABELS[event.actor_type] || event.actor_type}
                  {event.actor_name ? ` · ${event.actor_name}` : ''}
                  {' · '}
                  <time dateTime={event.created_at}>{formatEventDate(event.created_at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
