// File « À traiter » de l’accueil commerçant : les demandes en attente d’une réponse,
// avec l’heure limite et les actions Accepter / Refuser, sans changer d’onglet.
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock3, Inbox, X } from 'lucide-react';
import type { Order, OrderStatus } from '../../types';
import { formatFCFA } from '../../utils/format';

const RESPONSE_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_VISIBLE = 3;

interface PendingOrdersQueueProps {
  orders: Order[];
  /** Autres commandes acceptées mais pas encore remises. */
  inProgressCount: number;
  onUpdateStatus: (orderId: number, status: OrderStatus) => void;
  onOpenOrders: (filter: 'pending' | 'actionable') => void;
  isShopPublished: boolean;
}

function minutesLeft(createdAt: string, now: number) {
  const deadline = Date.parse(createdAt) + RESPONSE_WINDOW_MS;
  return Number.isFinite(deadline) ? Math.round((deadline - now) / 60_000) : null;
}

function deadlineLabel(createdAt: string, now: number) {
  const left = minutesLeft(createdAt, now);
  if (left === null) return 'Réponse attendue sous 2 h';
  if (left <= 0) return 'Délai dépassé';
  if (left < 60) return `Plus que ${left} min pour répondre`;
  const deadline = new Date(Date.parse(createdAt) + RESPONSE_WINDOW_MS);
  return `Répondre avant ${deadline.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function PendingOrdersQueue({ orders, inProgressCount, onUpdateStatus, onOpenOrders, isShopPublished }: PendingOrdersQueueProps) {
  // Le compte à rebours se met à jour chaque minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pending = orders
    .filter((order) => (order.status || 'pending') === 'pending')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const visible = pending.slice(0, MAX_VISIBLE);

  if (pending.length === 0) {
    // Rien d’urgent : une ligne calme, et l’accès aux commandes en cours s’il y en a.
    if (!isShopPublished && inProgressCount === 0) return null;
    return (
      <section aria-label="Commandes à traiter" className="flex items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--mt-green-deep)]"><Inbox className="h-5 w-5" aria-hidden="true" /></span>
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          <span className="font-bold text-slate-900">Aucune demande en attente.</span>
          {inProgressCount > 0 ? ` ${inProgressCount} commande${inProgressCount > 1 ? 's' : ''} en cours.` : ' Vous serez prévenu à la prochaine.'}
        </p>
        {inProgressCount > 0 && (
          <button type="button" onClick={() => onOpenOrders('actionable')} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-bold text-[var(--mt-green-hover)]">
            Voir <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="pending-queue-title" className="rounded-3xl border border-orange-200 bg-[#fff8f1] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="pending-queue-title" className="text-base font-extrabold text-orange-950">
          {pending.length} demande{pending.length > 1 ? 's' : ''} à traiter
        </h2>
        {pending.length > MAX_VISIBLE && (
          <button type="button" onClick={() => onOpenOrders('pending')} className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-orange-900">
            Tout voir <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-2">
        {visible.map((order) => {
          const left = minutesLeft(order.created_at, now);
          const urgent = left !== null && left < 30;
          const items = order.items ?? [];
          const summary = items.length === 0
            ? null
            : items.length === 1
              ? `${items[0].quantity} × ${items[0].product_title}`
              : `${items[0].quantity} × ${items[0].product_title} et ${items.length - 1} autre${items.length > 2 ? 's' : ''}`;
          return (
            <li key={order.id} className="rounded-2xl border border-orange-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{order.customer_name}</p>
                  {summary && <p className="mt-0.5 truncate text-sm text-slate-600">{summary}</p>}
                </div>
                <p className="shrink-0 text-base font-black tabular-nums text-slate-900">{formatFCFA(order.total_amount)}</p>
              </div>
              <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${urgent ? 'bg-rose-50 text-rose-800' : 'bg-orange-50 text-orange-900'}`}>
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {deadlineLabel(order.created_at, now)}
              </p>
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateStatus(order.id, 'rejected')}
                  aria-label={`Refuser la commande de ${order.customer_name}`}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" /> Refuser
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateStatus(order.id, 'confirmed')}
                  aria-label={`Accepter la commande de ${order.customer_name}`}
                  className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-[var(--mt-green-primary)] px-4 text-sm font-bold text-white shadow-sm hover:bg-[var(--mt-green-hover)] active:scale-[0.98]"
                >
                  <Check className="h-4 w-4" aria-hidden="true" /> Accepter
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {inProgressCount > 0 && (
        <button type="button" onClick={() => onOpenOrders('actionable')} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1 text-sm font-bold text-orange-900">
          {inProgressCount} autre{inProgressCount > 1 ? 's' : ''} commande{inProgressCount > 1 ? 's' : ''} en cours <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
