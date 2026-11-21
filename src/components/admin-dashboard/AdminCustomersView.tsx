// Vue « Clients » du dashboard admin.
import { Search } from 'lucide-react';
import type { AdminOrder } from '../adminDashboardTypes';
import { adminOrderStatusLabels } from './shared';
import type { AdminRole } from './shared';
import type { useAdminCustomers } from './useAdminCustomers';

export function AdminCustomersView({ customers, adminRole }: { customers: ReturnType<typeof useAdminCustomers>; adminRole: AdminRole }) {
  const {
    adminCustomers,
    customerSearch,
    setCustomerSearch,
    customerStatusFilter,
    setCustomerStatusFilter,
    customerTotal,
    customerPage,
    setCustomerPage,
    customerLoading,
    customerActionLoadingId,
    customerDetailId,
    customerDetail,
    customerDetailLoading,
    customerDetailError,
    toggleCustomerDetails,
    handleToggleCustomerActive,
  } = customers;
  return (
    <>
      <section aria-labelledby="admin-customers-title" className="chart-panel p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="admin-customers-title" className="text-sm font-black text-slate-900">Répertoire clients</h2><p className="mt-1 text-xs text-slate-500">{customerTotal} compte(s) · les commandes invités peuvent ne pas être liées à un compte.</p></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="relative block w-full sm:min-w-[280px]"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="search" value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(0); }} placeholder="Rechercher nom, téléphone ou e-mail" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-700" /></label>
            <label className="sr-only" htmlFor="admin-customer-status">Filtrer les comptes clients</label>
            <select id="admin-customer-status" value={customerStatusFilter} onChange={(event) => { setCustomerStatusFilter(event.target.value as typeof customerStatusFilter); setCustomerPage(0); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
              <option value="all">Tous les comptes</option>
              <option value="active">Comptes actifs</option>
              <option value="suspended">Comptes suspendus</option>
            </select>
          </div>
        </div>
        {customerLoading ? <p className="py-6 text-center text-sm text-slate-500">Chargement des clients…</p> : (
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {adminCustomers.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucun compte client correspondant.</p> : adminCustomers.map((customer) => (
              <article key={customer.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.name || `Client #${customer.id}`}</h3><p className="mt-1 truncate text-xs text-slate-600">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p><p className="mt-1 text-xs text-slate-500">Inscrit le {new Date(customer.created_at).toLocaleDateString('fr-FR')} · {customer.is_active ? 'Compte actif' : 'Compte désactivé'}</p></div>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 sm:justify-end"><div className="text-left sm:text-right"><strong className="block text-sm text-slate-900">{customer.orders_count} commande(s) liée(s)</strong>{adminRole === 'super_admin' && <span className="text-xs text-slate-500">Montant des commandes non annulées (non encaissé) : {new Intl.NumberFormat('fr-FR').format(customer.order_value)} FCFA</span>}</div>{adminRole === 'super_admin' && <><button type="button" disabled={customerDetailLoading} onClick={() => void toggleCustomerDetails(customer.id)} aria-expanded={customerDetailId === customer.id} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">{customerDetailId === customer.id ? 'Masquer le détail' : 'Détail'}</button><button type="button" disabled={customerActionLoadingId === customer.id} onClick={() => void handleToggleCustomerActive(customer)} className={`min-h-9 rounded-lg border px-3 py-1 text-xs font-bold disabled:opacity-50 ${customer.is_active ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>{customerActionLoadingId === customer.id ? 'Mise à jour…' : customer.is_active ? 'Suspendre' : 'Réactiver'}</button></>}</div>
                {customerDetailId === customer.id && (
                  <div className="w-full basis-full rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <h4 className="text-xs font-black text-slate-800">Détail du compte · {customer.email || `Client #${customer.id}`}</h4>
                    {customerDetailLoading ? <p className="py-3 text-xs text-slate-500">Chargement du détail…</p>
                      : customerDetailError ? <p role="alert" className="py-3 text-xs font-semibold text-rose-700">{customerDetailError}</p>
                        : customerDetail?.customer.id === customer.id ? (
                          <>
                            <p className="mt-1 text-xs text-slate-600">Inscription le {new Date(customerDetail.customer.created_at).toLocaleDateString('fr-FR')} · {customerDetail.customer.is_active ? 'Compte actif' : 'Compte désactivé'} · {customerDetail.total_orders} commande(s) liée(s)</p>
                            <div className="mt-3">
                              <h5 className="text-xs font-bold text-slate-700">Historique récent des commandes</h5>
                              {customerDetail.orders.length === 0 ? <p className="py-3 text-xs text-slate-500">Aucune commande liée à ce compte.</p> : (
                                <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                                  {customerDetail.orders.map((order) => (
                                    <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                      <span className="font-semibold text-slate-700">#{order.id} · {order.shop_name} · {new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                                      <span className="text-slate-600">{order.items_count} article(s) · {adminOrderStatusLabels[order.status as AdminOrder['status']] || order.status} · {new Intl.NumberFormat('fr-FR').format(order.total_amount)} FCFA (montant demandé, non encaissé)</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {customerDetail.total_orders > customerDetail.orders_limit && <p className="mt-2 text-xs text-slate-500">Affichage des {customerDetail.orders_limit} commandes les plus récentes.</p>}
                            </div>
                          </>
                        ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" disabled={customerPage === 0} onClick={() => setCustomerPage((page) => page - 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Précédent</button>
          <span className="text-xs text-slate-500">Page {customerPage + 1} / {Math.max(1, Math.ceil(customerTotal / 100))}</span>
          <button type="button" disabled={(customerPage + 1) * 100 >= customerTotal} onClick={() => setCustomerPage((page) => page + 1)} className="min-h-9 rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold disabled:opacity-40">Suivant</button>
        </div>
      </section>
    </>
  );
}
