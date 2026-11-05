import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';

interface AutomationRule {
  id: string;
  label: string;
  description: string;
  shops_reached_30d: number;
  failed_30d: number;
}

interface PushStatus {
  configured: boolean;
  subscribed_devices: number;
  rules: AutomationRule[];
}

export const AdminPushAnnouncements: React.FC = () => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/push/status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les annonces automatiques.');
      setStatus(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les annonces automatiques.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-4" aria-labelledby="admin-push-title">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-[#123e32] p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><Bell className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="admin-push-title" className="text-lg font-extrabold">Annonces automatiques</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-emerald-50">MaTable écrit seule aux commerçants selon l’état de leur boutique. Chaque message n’est envoyé qu’une fois par boutique et seulement aux appareils abonnés.</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-4 text-xs font-bold hover:bg-white/10 disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualiser
        </button>
      </div>

      {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}

      {status && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e7dfd3] bg-white p-4">
              <p className="text-xs font-bold text-slate-500">Appareils abonnés</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#183b31]">{status.subscribed_devices}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${status.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-bold text-slate-600">Service Push</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                {status.configured
                  ? <><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />Actif</>
                  : <><TriangleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />Clés VAPID manquantes : aucun envoi</>}
              </p>
            </div>
          </div>

          <ul className="grid gap-3 md:grid-cols-2">
            {status.rules.map((rule) => (
              <li key={rule.id} className="rounded-2xl border border-[#e7dfd3] bg-white p-4">
                <p className="text-sm font-extrabold text-[#183b31]">{rule.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{rule.description}</p>
                <p className="mt-3 text-xs font-bold text-slate-700">
                  {rule.shops_reached_30d} boutique{rule.shops_reached_30d > 1 ? 's' : ''} jointe{rule.shops_reached_30d > 1 ? 's' : ''} sur 30 jours
                  {rule.failed_30d > 0 && <span className="ml-2 text-rose-700">· {rule.failed_30d} échec{rule.failed_30d > 1 ? 's' : ''}</span>}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};
