import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, RefreshCw, TimerOff, Truck, UserRound } from 'lucide-react';
import { DeliveryStatusBadge, isDeliveryDelivered, isDeliveryTerminal } from './deliveryStatus';
import { formatFCFA } from '../utils/format';

type CourseFilter = 'active' | 'all' | 'requested' | 'accepted' | 'to_pickup' | 'picked_up' | 'delivered' | 'cancelled';

interface AdminDeliveryCourse {
  id: number;
  order_id: number;
  shop_id: number;
  quoted_amount: number;
  status: string;
  ticket_number: string | null;
  created_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  driver_id: number | null;
  driver_name: string | null;
  shop_name: string;
  pickup_zone: string;
  destination_zone: string;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMATTER.format(date);
};

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

export function AdminDeliveryOperations() {
  const [filter, setFilter] = useState<CourseFilter>('active');
  const [courses, setCourses] = useState<AdminDeliveryCourse[]>([]);
  const [ttlMinutes, setTtlMinutes] = useState('120');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (nextFilter: CourseFilter = filter) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/delivery/courses?status=${nextFilter}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await readJson<{ courses: AdminDeliveryCourse[] }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les courses.');
      setCourses(data.courses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const askReason = (action: string, course: AdminDeliveryCourse) => {
    const reason = window.prompt(`Motif pour ${action} la course ${course.ticket_number || `#${course.id}`} :`);
    if (reason === null) return null;
    if (reason.trim().length < 3) {
      setError('Un motif (au moins 3 caractères) est obligatoire.');
      return null;
    }
    return reason.trim();
  };

  const releaseCourse = async (course: AdminDeliveryCourse) => {
    const reason = askReason('retirer le livreur de', course);
    if (!reason) return;
    setBusyKey(`release-${course.id}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/delivery/courses/${course.id}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await readJson<{ success: boolean }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de retirer ce livreur.');
      setNotice(`Course ${course.ticket_number || `#${course.id}`} de nouveau proposée aux livreurs.`);
      await load();
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'Impossible de retirer ce livreur.');
    } finally {
      setBusyKey('');
    }
  };

  const cancelCourse = async (course: AdminDeliveryCourse) => {
    const reason = askReason('annuler', course);
    if (!reason) return;
    setBusyKey(`cancel-${course.id}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/delivery/courses/${course.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await readJson<{ success: boolean }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible d’annuler cette course.');
      setNotice(`Course ${course.ticket_number || `#${course.id}`} annulée et parties notifiées.`);
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Impossible d’annuler cette course.');
    } finally {
      setBusyKey('');
    }
  };

  const expireStale = async () => {
    setBusyKey('expire');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/delivery/maintenance/expire-courses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl_minutes: Number(ttlMinutes) }),
      });
      const data = await readJson<{ cancelled: number; ttl_minutes: number }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible d’expirer les courses en attente.');
      setNotice(`${data.cancelled} course(s) expirée(s) après ${data.ttl_minutes} minutes sans livreur.`);
      await load();
    } catch (expireError) {
      setError(expireError instanceof Error ? expireError.message : 'Impossible d’expirer les courses en attente.');
    } finally {
      setBusyKey('');
    }
  };

  const summary = {
    active: courses.filter((course) => !isDeliveryTerminal(course.status)).length,
    waiting: courses.filter((course) => course.status === 'requested').length,
    delivered: courses.filter((course) => isDeliveryDelivered(course.status)).length,
  };

  return (
    <section aria-labelledby="delivery-operations-title" className="space-y-4 rounded-xl border border-[#E4EDE8] bg-white p-4">
      <header className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F0FAF5] text-[#0F6B54]">
          <Truck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 id="delivery-operations-title" className="text-sm font-black text-[#103E32]">Supervision des courses</h3>
          <p className="mt-1 text-xs leading-5 text-[#587067]">
            Suivez les courses en cours, retirez un livreur défaillant ou annulez une course avec un motif tracé dans le journal admin.
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-[#E4EDE8] bg-[#FAF8F2] px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#8A948E]">
            <Clock3 className="h-3 w-3" aria-hidden="true" />En cours
          </dt>
          <dd className="mt-1 text-xl font-black tabular-nums leading-none text-[#103E32]">{summary.active}</dd>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            <UserRound className="h-3 w-3" aria-hidden="true" />Sans livreur
          </dt>
          <dd className="mt-1 text-xl font-black tabular-nums leading-none text-amber-950">{summary.waiting}</dd>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Livrées
          </dt>
          <dd className="mt-1 text-xl font-black tabular-nums leading-none text-emerald-950">{summary.delivered}</dd>
        </div>
      </dl>
      <p className="text-[10px] font-semibold text-[#8A948E]">Compteurs calculés sur la sélection affichée.</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-[#292d2a]">
          Filtrer
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as CourseFilter)}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs focus:border-[#087F62] focus:outline-none focus:ring-2 focus:ring-[#087F62]/20"
          >
            <option value="active">En cours</option>
            <option value="requested">Sans livreur</option>
            <option value="accepted">Assignées</option>
            <option value="to_pickup">Vers la boutique</option>
            <option value="picked_up">En livraison</option>
            <option value="delivered">Livrées</option>
            <option value="cancelled">Annulées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || Boolean(busyKey)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#292d2a] transition-colors hover:bg-[#FAF8F2] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
        <span className="ml-auto" />
        <label className="flex flex-col gap-1 text-xs font-bold text-[#292d2a]">
          Sans livreur depuis (min)
          <input
            type="number"
            min={5}
            max={10080}
            value={ttlMinutes}
            onChange={(event) => setTtlMinutes(event.target.value)}
            className="min-h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-xs focus:border-[#087F62] focus:outline-none focus:ring-2 focus:ring-[#087F62]/20"
          />
        </label>
        <button
          type="button"
          onClick={() => void expireStale()}
          disabled={busyKey === 'expire'}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-100 disabled:opacity-50"
        >
          <TimerOff className="h-3.5 w-3.5" aria-hidden="true" />
          {busyKey === 'expire' ? 'Expiration…' : 'Expirer les offres'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{notice}</p>}
      {loading && courses.length === 0 && <p role="status" className="text-xs text-[#8A948E]">Chargement des courses…</p>}
      {!loading && courses.length === 0 && (
        <p className="rounded-lg border border-dashed border-[#E4EDE8] bg-[#FAF8F2] p-3 text-xs leading-5 text-[#8A948E]">
          Aucune course ne correspond à ce filtre.
        </p>
      )}

      <div className="space-y-2">
        {courses.map((course) => {
          const terminal = isDeliveryTerminal(course.status);
          return (
            <article key={course.id} className="rounded-xl border border-[#E4EDE8] bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-black tracking-wide text-[#103E32]">{course.ticket_number || `COURSE-${course.id}`}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-bold text-[#292d2a]">
                    <span className="truncate">{course.shop_name}</span>
                    <span className="text-[#587067]">{course.pickup_zone}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-[#8A948E]" aria-hidden="true" />
                    <span className="text-[#587067]">{course.destination_zone}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8A948E]">
                    {course.driver_name ? `Livreur : ${course.driver_name}` : 'Aucun livreur'} · commande #{course.order_id} · {formatDate(course.created_at)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <DeliveryStatusBadge status={course.status} />
                  <p className="text-xs font-black tabular-nums text-[#103E32]">{formatFCFA(Number(course.quoted_amount) || 0)}</p>
                </div>
              </div>
              {!terminal && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {course.driver_id !== null && course.status !== 'requested' && (
                    <button
                      type="button"
                      onClick={() => void releaseCourse(course)}
                      disabled={Boolean(busyKey)}
                      className="min-h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 disabled:opacity-50"
                    >
                      {busyKey === `release-${course.id}` ? 'Retrait…' : 'Retirer le livreur'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void cancelCourse(course)}
                    disabled={Boolean(busyKey)}
                    className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 text-[11px] font-bold text-rose-900 transition-colors hover:bg-rose-50 disabled:opacity-50"
                  >
                    {busyKey === `cancel-${course.id}` ? 'Annulation…' : 'Annuler la course'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
