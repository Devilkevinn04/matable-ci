import { AlertCircle, CheckCircle2, Clock3, Store, Truck, UserRound, XCircle } from 'lucide-react';
import { DELIVERY_STATUS_LABELS } from './deliveryStatus';

export { DELIVERY_STATUS_LABELS };

export interface DeliveryTimelineEvent {
  id: number;
  actor_type: 'merchant' | 'driver' | 'admin' | string;
  actor_id: number | null;
  actor_name: string | null;
  previous_status: string | null;
  next_status: string;
  created_at: string;
}

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

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'accepted':
      return <UserRound className="h-3 w-3" aria-hidden="true" />;
    case 'to_pickup':
      return <Store className="h-3 w-3" aria-hidden="true" />;
    case 'picked_up':
      return <Truck className="h-3 w-3" aria-hidden="true" />;
    case 'delivered':
      return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
    case 'cancelled':
      return <XCircle className="h-3 w-3" aria-hidden="true" />;
    default:
      return <Clock3 className="h-3 w-3" aria-hidden="true" />;
  }
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
    <section aria-label={title} className="rounded-xl border border-[#E4EDE8] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-[#587067]" aria-hidden="true" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-[#103E32]">{title}</h3>
        </div>
        {events.length > 0 && (
          <span className="text-[10px] font-semibold tabular-nums text-[#8A948E]">
            {events.length} étape{events.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && events.length === 0 && <p role="status" className="mt-3 text-[11px] text-[#8A948E]">Chargement de l’historique…</p>}

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{error}
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="mt-3 rounded-lg border border-dashed border-[#E4EDE8] bg-[#FAF8F2] px-3 py-2.5 text-[11px] leading-5 text-[#8A948E]">{emptyLabel}</p>
      )}

      {events.length > 0 && (
        <ol className="mt-3">
          {events.map((event, index) => {
            const isCurrent = index === events.length - 1;
            const isCancelled = event.next_status === 'cancelled';
            return (
              <li key={event.id} className={isCurrent ? 'relative flex gap-3' : 'relative flex gap-3 pb-3'}>
                {!isCurrent && (
                  <span className="absolute bottom-0 left-[11px] top-6 w-px bg-[#E4EDE8]" aria-hidden="true" />
                )}
                <span
                  className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                    isCancelled
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : isCurrent
                        ? 'border-[#087F62] bg-[#087F62] text-white'
                        : 'border-[#CFE4D9] bg-[#F0FAF5] text-[#0F6B54]'
                  }`}
                >
                  <StatusIcon status={event.next_status} />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-bold leading-tight text-[#1B2620]">
                    {DELIVERY_STATUS_LABELS[event.next_status] || event.next_status}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#8A948E]">
                    {ACTOR_LABELS[event.actor_type] || event.actor_type}
                    {event.actor_name ? ` · ${event.actor_name}` : ''}
                    {' · '}
                    <time dateTime={event.created_at}>{formatEventDate(event.created_at)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
