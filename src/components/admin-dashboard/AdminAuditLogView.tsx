// Vue « Journal d’audit » du dashboard admin.
import { RefreshCw } from 'lucide-react';
import { adminAuditActionLabels, formatAuditDetailValue, adminAuditDetailLabels } from './shared';
import type { AdminRole } from './shared';
import type { useAdminAuditLog } from './useAdminAuditLog';

export function AdminAuditLogView({ audit }: { audit: ReturnType<typeof useAdminAuditLog> }) {
  const {
    auditLogs,
    auditLogTotal,
    auditLogPage,
    setAuditLogPage,
    auditLogSearch,
    setAuditLogSearch,
    auditLogActor,
    setAuditLogActor,
    auditLogLoading,
    auditLogError,
    setAuditLogRefresh,
  } = audit;
  return (
    <>
      <section aria-labelledby="admin-audit-title" className="chart-panel p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="admin-audit-title" className="text-lg font-black text-slate-900">Journal d’audit</h2>
            <p className="mt-1 text-xs text-slate-500">Actions administratives enregistrées, avec leur auteur, leur cible et leur date.</p>
          </div>
          <button type="button" onClick={() => setAuditLogRefresh((value) => value + 1)} disabled={auditLogLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${auditLogLoading ? 'animate-spin' : ''}`} /> Actualiser
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="sr-only">Rechercher dans le journal</span>
            <input value={auditLogSearch} onChange={(event) => { setAuditLogSearch(event.target.value); setAuditLogPage(0); }} placeholder="Rechercher par boutique ou action" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span>Administrateur</span>
            <select value={auditLogActor} onChange={(event) => { setAuditLogActor(event.target.value as 'all' | AdminRole | 'didit_webhook'); setAuditLogPage(0); }} className="min-h-10 min-w-40 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
              <option value="all">Tous les rôles</option>
              <option value="super_admin">Super-admin</option>
              <option value="verification_admin">Vérification</option>
              <option value="didit_webhook">Webhook Didit</option>
            </select>
          </label>
        </div>
        {auditLogError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{auditLogError}</p>}
        {auditLogLoading ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" />Chargement du journal…</p>
          : auditLogs.length === 0 ? <p className="mt-5 rounded-lg bg-slate-50 px-3 py-5 text-sm text-slate-600">Aucune action ne correspond à ces critères.</p>
            : <div className="mt-4 divide-y divide-slate-200">
              {auditLogs.map((entry) => (
                <article key={entry.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{adminAuditActionLabels[entry.action] || entry.action.replaceAll('_', ' ')}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.actor === 'verification_admin' ? 'bg-violet-100 text-violet-800' : entry.actor === 'didit_webhook' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>{entry.actor === 'verification_admin' ? 'Admin vérification' : entry.actor === 'didit_webhook' ? 'Webhook Didit' : entry.actor === 'super_admin' ? 'Super-admin' : entry.actor}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{entry.shop_name || (entry.shop_id ? `Boutique #${entry.shop_id}` : 'Plateforme')}{entry.shop_id && entry.shop_name ? ` · Boutique #${entry.shop_id}` : ''}</p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.created_at))}</time>
                  </div>
                  {Object.entries(entry.details).length > 0 && (
                    <dl className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(entry.details).map(([key, value]) => (
                        <div key={key} className="max-w-full rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
                          <dt className="inline font-semibold text-slate-500">{adminAuditDetailLabels[key] || key}: </dt>
                          <dd className="inline break-words text-slate-800">{formatAuditDetailValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </article>
              ))}
            </div>}
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{auditLogTotal.toLocaleString('fr-FR')} action(s) · page {auditLogPage + 1}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAuditLogPage((page) => Math.max(0, page - 1))} disabled={auditLogPage === 0 || auditLogLoading} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Précédent</button>
            <button type="button" onClick={() => setAuditLogPage((page) => page + 1)} disabled={(auditLogPage + 1) * 50 >= auditLogTotal || auditLogLoading} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Suivant</button>
          </div>
        </div>
      </section>
    </>
  );
}
