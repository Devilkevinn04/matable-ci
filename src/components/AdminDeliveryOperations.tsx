import { useEffect, useState } from 'react';

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

const STATUS_LABELS: Record<string, string> = {
  requested: 'En attente d’un livreur',
  accepted: 'Livreur assigné',
  to_pickup: 'Vers la boutique',
  picked_up: 'En cours de livraison',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

const formatDate = (value: string | null) => value
  ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

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

  return (
    <section aria-labelledby="delivery-operations-title" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <header>
        <h3 id="delivery-operations-title" className="text-sm font-black text-slate-950">Supervision des courses</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Suivez les courses en cours, retirez un livreur défaillant ou annulez une course avec un motif tracé dans le journal admin.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
          Filtrer
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as CourseFilter)}
            className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
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
          className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
        <span className="ml-auto" />
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-700">
          Sans livreur depuis (min)
          <input
            type="number"
            min={5}
            max={10080}
            value={ttlMinutes}
            onChange={(event) => setTtlMinutes(event.target.value)}
            className="min-h-9 w-28 rounded-lg border border-slate-300 bg-white px-2 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => void expireStale()}
          disabled={busyKey === 'expire'}
          className="min-h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-950 disabled:opacity-50"
        >
          {busyKey === 'expire' ? 'Expiration…' : 'Expirer les offres'}
        </button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{notice}</p>}
      {loading && courses.length === 0 && <p role="status" className="text-xs text-slate-500">Chargement des courses…</p>}
      {!loading && courses.length === 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Aucune course ne correspond à ce filtre.</p>}

      <div className="space-y-2">
        {courses.map((course) => (
          <article key={course.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-black text-slate-900">{course.ticket_number || `COURSE-${course.id}`}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-700">{course.shop_name} · {course.pickup_zone} → {course.destination_zone}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {course.driver_name ? `Livreur : ${course.driver_name}` : 'Aucun livreur'} · commande #{course.order_id} · {formatDate(course.created_at)}
                </p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${TERMINAL_STATUSES.has(course.status) ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-900'}`}>
                  {STATUS_LABELS[course.status] || course.status}
                </span>
                <p className="mt-1 text-xs font-black text-slate-800">{new Intl.NumberFormat('fr-FR').format(course.quoted_amount)} FCFA</p>
              </div>
            </div>
            {!TERMINAL_STATUSES.has(course.status) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {course.driver_id !== null && course.status !== 'requested' && (
                  <button
                    type="button"
                    onClick={() => void releaseCourse(course)}
                    disabled={Boolean(busyKey)}
                    className="min-h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[11px] font-bold text-amber-950 disabled:opacity-50"
                  >
                    {busyKey === `release-${course.id}` ? 'Retrait…' : 'Retirer le livreur'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void cancelCourse(course)}
                  disabled={Boolean(busyKey)}
                  className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 text-[11px] font-bold text-rose-900 disabled:opacity-50"
                >
                  {busyKey === `cancel-${course.id}` ? 'Annulation…' : 'Annuler la course'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
