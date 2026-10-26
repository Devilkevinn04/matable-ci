import React from 'react';
import { ShoppingBag, Check, ExternalLink, Search, TrendingUp, DollarSign, MapPin, MessageCircle } from 'lucide-react';
import type { MerchantOrderFilter, MerchantState } from './useMerchant';
import { cleanPhoneForWhatsApp, formatFCFA } from '../../utils/format';

interface OrdersTabProps {
  state: MerchantState;
  filteredOrders: any[]; orderValue: number; averageOrderValue: number;
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ state, filteredOrders, orderValue, averageOrderValue }) => {
  const {
    orders, orderSearch, setOrderSearch, orderPaymentFilter, setOrderPaymentFilter, orderStatusFilter, setOrderStatusFilter,
    handleUpdateOrderStatus, copyOwnerLink
  } = state;
  const orderStatusOptions: { id: MerchantOrderFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Toutes', count: orders.length },
    { id: 'actionable', label: 'À traiter', count: orders.filter(o => !['delivered', 'cancelled', 'expired'].includes(o.status || 'pending')).length },
    { id: 'pending', label: 'En attente', count: orders.filter(o => (o.status || 'pending') === 'pending').length },
    { id: 'confirmed', label: 'Acceptées', count: orders.filter(o => o.status === 'confirmed').length },
    { id: 'preparing', label: 'En préparation', count: orders.filter(o => o.status === 'preparing').length },
    { id: 'ready', label: 'Prêtes', count: orders.filter(o => o.status === 'ready').length },
    { id: 'delivered', label: 'Livrées', count: orders.filter(o => o.status === 'delivered').length },
    { id: 'cancelled', label: 'Annulées', count: orders.filter(o => o.status === 'cancelled').length },
  ];

  return (
    <>
{/* TAB 2: ORDERS MANAGEMENT */}

          <div className="space-y-4">
            <header>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">Espace de vente</p>
              <h2 className="mt-1 text-xl font-black text-slate-900">Commandes</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Traitez les demandes clients et suivez leur progression.</p>
            </header>

            {/* Orders Statistics Cards */}
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4 min-[380px]:col-span-2 sm:col-span-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d1fae5] font-bold text-[#1D6B57]">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Montant des commandes
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(orderValue)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f4ee] font-bold text-[#1D6B57]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Commandes reçues
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {orders.length}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff6ea] font-bold text-[#b94c24]">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Montant moyen par commande
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(averageOrderValue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Orders */}
            <div className="space-y-3 rounded-2xl border border-[#e7dfd3] bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative w-full sm:flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  aria-label="Rechercher une commande par client, téléphone ou numéro"
                  placeholder="Rechercher par client, tél ou #..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                    className="min-h-10 w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#1D6B57]/20"
                />
              </div>
                <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 sm:w-56">
                  <span className="shrink-0">Paiement</span>
                  <select
                    aria-label="Filtrer les commandes par mode de paiement"
                    value={orderPaymentFilter}
                    onChange={(event) => setOrderPaymentFilter(event.target.value as typeof orderPaymentFilter)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-2 text-xs font-bold text-slate-800 outline-none"
                  >
                    <option value="all">Tous les modes</option>
                    <option value="wave">Wave ({orders.filter(o => o.payment_method_preference === 'wave').length})</option>
                    <option value="mobile_money">Mobile Money ({orders.filter(o => o.payment_method_preference === 'mobile_money').length})</option>
                    <option value="cash">Espèces ({orders.filter(o => o.payment_method_preference === 'cash').length})</option>
                    <option value="to_confirm">À convenir ({orders.filter(o => o.payment_method_preference === 'to_confirm').length})</option>
                  </select>
                </label>
              </div>

              <div className="border-t border-[#f0ebe2] pt-3">
                <label className="flex min-h-10 w-full items-center gap-3 rounded-xl border border-slate-200 bg-[#fffdf8] px-3 text-xs font-bold text-slate-600 sm:w-auto">
                  <span className="shrink-0">Statut</span>
                  <select
                    aria-label="Filtrer les commandes par statut"
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value as MerchantOrderFilter)}
                    className="min-w-0 flex-1 bg-transparent py-2 text-slate-800 outline-none sm:w-56 sm:flex-none"
                  >
                    {orderStatusOptions.map((status) => (
                      <option key={status.id} value={status.id}>{status.label} ({status.count})</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <p className="-mt-2 rounded-xl border border-slate-200 bg-[#fffdf8] px-3 py-2 text-[11px] leading-5 text-slate-600">
              Les montants ci-dessus sont calculés à partir des commandes hors annulation et expiration, y compris les commandes livrées. MaTable.ci ne suit pas les encaissements : vérifiez directement le règlement auprès de vos clients. Le mode choisi ou un clic WhatsApp ne confirme pas le paiement.
            </p>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">{orders.length === 0 ? 'Aucune commande enregistrée' : 'Aucune commande ne correspond'}</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {orders.length === 0
                    ? 'Les demandes envoyées depuis votre vitrine apparaîtront ici. Partagez votre boutique pour recevoir vos premières commandes.'
                    : 'Modifiez votre recherche ou vos filtres pour afficher les commandes correspondantes.'}
                </p>
                {orders.length === 0 && (
                  <button type="button" onClick={() => copyOwnerLink('public')} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#065f46] px-4 text-xs font-bold text-white transition hover:bg-[#047857]">
                    <ExternalLink className="h-4 w-4" /> Copier le lien de ma vitrine
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map(order => {
                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        order.status === 'cancelled'
                          ? 'border-rose-200 bg-rose-50/20 opacity-80'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            #{order.id}
                          </span>
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            {order.customer_name}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            {order.customer_phone}
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {{ wave: 'WAVE', mobile_money: 'MOBILE MONEY', cash: 'ESPÈCES', to_confirm: 'À CONVENIR' }[order.payment_method_preference] || 'À CONVENIR'}
                          </span>

                          {/* Status Badge */}
                          {order.status === 'confirmed' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              ✓ Acceptée · stock réservé
                            </span>
                          )}
                          {order.status === 'delivered' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✨ Livrée
                            </span>
                          )}
                          {order.status === 'preparing' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              🍳 En préparation
                            </span>
                          )}
                          {order.status === 'ready' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                              📦 Prête
                            </span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              ✕ Demande annulée
                            </span>
                          )}
                          {(!order.status || order.status === 'pending') && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              ⏳ En attente
                            </span>
                          )}
                          {order.whatsapp_tracking_available && (
                            <span
                              title={order.whatsapp_clicked_at ? `Clic relevé le ${new Date(order.whatsapp_clicked_at).toLocaleString('fr-FR')}. L’envoi du message n’est pas vérifiable.` : 'Aucun clic sur le bouton WhatsApp enregistré.'}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${order.whatsapp_clicked_at ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                            >
                              {order.whatsapp_clicked_at ? 'Clic WhatsApp relevé' : 'Pas encore de clic WhatsApp'}
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400 ml-auto md:ml-0">
                            {new Date(order.created_at).toLocaleString('fr-FR')}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span><strong>{order.delivery_location}</strong></span>
                          {order.delivery_note && <span className="text-slate-500 italic">({order.delivery_note})</span>}
                          {order.delivery_slot && <span className="text-amber-700 font-bold ml-1.5">⏰ {order.delivery_slot}</span>}
                        </p>

                        <div className="bg-slate-50 p-2.5 rounded-xl text-xs text-slate-600 flex flex-wrap gap-2">
                          {(order.items ?? []).map((it, i) => (
                            <div key={i} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-medium">
                              <strong>{it.quantity}x</strong> {it.product_title}
                              {it.selected_size && <span className="text-slate-500 ml-1">(T:{it.selected_size})</span>}
                              {it.selected_color && <span className="text-slate-500 ml-1">({it.selected_color})</span>}
                              {it.selected_modifiers?.length > 0 && <span className="text-slate-500 ml-1">+ {it.selected_modifiers.join(', ')}</span>}
                              <span className="text-slate-400 font-mono ml-1.5">({formatFCFA(it.unit_price * it.quantity)})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex min-w-0 flex-col gap-2.5 border-t border-slate-100 pt-3 md:w-56 md:shrink-0 md:items-end md:justify-between md:border-t-0 md:pt-0">
                        <span className="font-black text-lg text-slate-900 md:text-right">
                          {formatFCFA(order.total_amount)}
                        </span>

                        {/* Order status action buttons */}
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          {order.customer_phone && (
                            <a
                              href={`https://wa.me/${cleanPhoneForWhatsApp(order.customer_phone)}?text=${encodeURIComponent(`Bonjour ${order.customer_name}, je vous contacte au sujet de votre demande de commande #${order.id} sur MaTable.ci.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 sm:w-auto"
                            >
                              <MessageCircle className="h-4 w-4" /> Contacter sur WhatsApp
                            </a>
                          )}
                          {(!order.status || order.status === 'pending') && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                                className="min-h-11 flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 sm:flex-none"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="min-h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:flex-none"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'confirmed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                                className="min-h-11 flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-600 sm:flex-none"
                              >
                                Préparer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:flex-none"
                              >
                                Marquer livrée
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="min-h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:flex-none"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'preparing' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                                className="min-h-11 flex-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700 sm:flex-none"
                              >
                                Prête
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="min-h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:flex-none"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'ready' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 sm:flex-none"
                              >
                                Marquer livrée
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="min-h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:flex-none"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'delivered' && (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                              <Check className="w-3.5 h-3.5" /> Commande terminée
                            </span>
                          )}

                          {order.status === 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                              className="min-h-11 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
                            >
                              Réactiver la commande
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

    </>
  );
  return null;
};
