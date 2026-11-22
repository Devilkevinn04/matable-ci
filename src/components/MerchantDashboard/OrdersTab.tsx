import React from 'react';
import { Gift, ShoppingBag, Check, ExternalLink, Search, TrendingUp, DollarSign, CheckCircle2, Clock3, CookingPot, Package, Sparkles, X } from 'lucide-react';
import type { MerchantOrderFilter, MerchantState } from './useMerchant';
import { formatFCFA } from '../../utils/format';
import { OrderContactReveal } from '../OrderContactReveal';
import { LoyaltyCodeForm } from './LoyaltyCodeForm';

interface OrdersTabProps {
  state: MerchantState;
  filteredOrders: any[]; orderValue: number; averageOrderValue: number;
  isShopPublished: boolean;
}

function MerchantLoyaltyReward({ shopId, orderId, deliveredOrders, availableRewards, onRedeemed }: {
  shopId: number;
  orderId: number;
  deliveredOrders: number;
  availableRewards: number;
  onRedeemed: () => Promise<void>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const redeemReward = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/shops/${shopId}/orders/${orderId}/loyalty/redeem`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer cette récompense.');
      setNotice('Récompense remise et enregistrée.');
      await onRedeemed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer cette récompense.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-xs text-emerald-900">
        <span>{deliveredOrders} commandes terminées · {availableRewards} récompense{availableRewards === 1 ? '' : 's'} disponible{availableRewards === 1 ? '' : 's'}</span>
      </div>
      <button
        type="button"
        onClick={() => void redeemReward()}
        disabled={saving}
        className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Remettre une récompense'}
      </button>
      {error && <p role="alert" className="w-full text-xs font-semibold text-rose-700">{error}</p>}
      {notice && <p role="status" className="w-full text-xs font-semibold text-emerald-800">{notice}</p>}
    </div>
  );
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ state, filteredOrders, orderValue, averageOrderValue, isShopPublished }) => {
  const {
    orders, orderSearch, setOrderSearch, orderPaymentFilter, setOrderPaymentFilter, orderStatusFilter, setOrderStatusFilter,
    handleUpdateOrderStatus, copyOwnerLink
  } = state;
  const orderStatusOptions: { id: MerchantOrderFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Toutes', count: orders.length },
    { id: 'actionable', label: 'À traiter', count: orders.filter(o => !['delivered', 'cancelled', 'rejected', 'expired'].includes(o.status || 'pending')).length },
    { id: 'pending', label: 'En attente', count: orders.filter(o => (o.status || 'pending') === 'pending').length },
    { id: 'confirmed', label: 'Acceptées', count: orders.filter(o => o.status === 'confirmed').length },
    { id: 'preparing', label: 'En préparation', count: orders.filter(o => o.status === 'preparing').length },
    { id: 'ready', label: 'Prêtes', count: orders.filter(o => o.status === 'ready').length },
    { id: 'delivered', label: 'Remises', count: orders.filter(o => o.status === 'delivered').length },
    { id: 'cancelled', label: 'Annulées', count: orders.filter(o => o.status === 'cancelled').length },
    { id: 'rejected', label: 'Refusées', count: orders.filter(o => o.status === 'rejected').length },
    { id: 'expired', label: 'Expirées', count: orders.filter(o => o.status === 'expired').length },
  ];

  return (
    <>
{/* TAB 2: ORDERS MANAGEMENT */}

          <div className="space-y-4">
            <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold text-emerald-800">Espace de vente</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Commandes</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Traitez les demandes clients et suivez leur progression.</p>
              </div>
            </header>

            {state.currentShop && !state.currentShop.admin_mode && orders.some((order) => order.loyalty_points) && (
              <details className="rounded-2xl border border-[#d6e5dc] bg-white">
                <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-sm font-bold text-[var(--mt-green-deep)]"><Gift className="h-4 w-4" aria-hidden="true" /> Valider un code de fidélité</summary>
                <div className="px-3 pb-3"><LoyaltyCodeForm shopId={state.currentShop.id} onUsed={() => void state.loadShopData(state.currentShop!.id)} /></div>
              </details>
            )}

            {/* Orders Statistics Cards */}
            {/* Indicateurs compacts : la liste des commandes reste visible sans défiler. */}
            <dl className="grid grid-cols-3 divide-x divide-[#eee8dc] rounded-2xl border border-[#e7dfd3] bg-white py-3 sm:py-4">
              {[
                { label: 'Montant', fullLabel: 'Montant des commandes', value: formatFCFA(orderValue), icon: DollarSign, tone: 'text-[var(--mt-green-primary)]' },
                { label: 'Reçues', fullLabel: 'Commandes reçues', value: String(orders.length), icon: ShoppingBag, tone: 'text-[var(--mt-green-primary)]' },
                { label: 'Panier moyen', fullLabel: 'Montant moyen par commande', value: formatFCFA(averageOrderValue), icon: TrendingUp, tone: 'text-[var(--mt-orange-deep)]' },
              ].map((metric) => (
                <div key={metric.fullLabel} className="min-w-0 px-3 sm:px-5">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <metric.icon className={`hidden h-4 w-4 shrink-0 sm:block ${metric.tone}`} aria-hidden="true" />
                    <span className="truncate sm:hidden">{metric.label}</span>
                    <span className="hidden truncate sm:inline">{metric.fullLabel}</span>
                  </dt>
                  <dd className="mt-1 break-words text-[13px] font-black leading-tight tabular-nums text-slate-900 sm:text-lg">{metric.value}</dd>
                </div>
              ))}
            </dl>

            {/* Filter and Search Bar for Orders */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Rechercher une commande par client, téléphone ou numéro"
                  placeholder="Client, téléphone ou n° de commande"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[#e7dfd3] bg-white py-2 pl-9 pr-3 text-base focus:border-[var(--mt-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-primary)]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:max-w-xl">
                <label className="mt-filter-field">
                  <span className="mt-filter-field-label">Statut</span>
                  <select
                    aria-label="Filtrer les commandes par statut"
                    value={orderStatusFilter}
                    onChange={(event) => setOrderStatusFilter(event.target.value as MerchantOrderFilter)}
                    className="mt-filter-field-select"
                  >
                    {orderStatusOptions.map((status) => (
                      <option key={status.id} value={status.id}>{status.label} ({status.count})</option>
                    ))}
                  </select>
                </label>
                <label className="mt-filter-field">
                  <span className="mt-filter-field-label">Règlement</span>
                  <select
                    aria-label="Filtrer les commandes par mode de règlement"
                    value={orderPaymentFilter}
                    onChange={(event) => setOrderPaymentFilter(event.target.value as typeof orderPaymentFilter)}
                    className="mt-filter-field-select"
                  >
                    <option value="all">Tous</option>
                    <option value="wave">Wave ({orders.filter(o => o.payment_method_preference === 'wave').length})</option>
                    <option value="mobile_money">Mobile Money ({orders.filter(o => o.payment_method_preference === 'mobile_money').length})</option>
                    <option value="cash">Espèces ({orders.filter(o => o.payment_method_preference === 'cash').length})</option>
                    <option value="to_confirm">À convenir ({orders.filter(o => o.payment_method_preference === 'to_confirm').length})</option>
                  </select>
                </label>
              </div>
            </div>

            <details className="-mt-2 px-1 text-xs leading-5 text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-600">Comment sont calculés ces montants ?</summary>
              <p className="mt-1">Ils regroupent les articles des commandes hors annulation et expiration. MaTable ne suit pas les encaissements : vérifiez le règlement directement avec vos clients. Le mode choisi ou un clic WhatsApp ne confirme pas le paiement.</p>
            </details>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">{orders.length === 0
                  ? isShopPublished ? 'Aucune commande enregistrée' : 'Votre vitrine n’est pas encore publiée'
                  : 'Aucune commande ne correspond'}</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  {orders.length === 0
                    ? isShopPublished
                      ? 'Les demandes envoyées depuis votre vitrine apparaîtront ici.'
                      : 'Les clients ne peuvent pas encore accéder à votre vitrine. Terminez les étapes d’activation avant de partager son lien. Les demandes apparaîtront ici après publication.'
                    : 'Modifiez votre recherche ou vos filtres pour afficher les commandes correspondantes.'}
                </p>
                {orders.length === 0 && isShopPublished && (
                  <button type="button" onClick={() => copyOwnerLink('public')} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-4 text-xs font-bold text-white transition hover:bg-[var(--mt-green-hover)]">
                    <ExternalLink className="h-4 w-4" /> Copier le lien de ma vitrine
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map(order => {
                  const pendingDeadline = Date.parse(order.created_at) + 2 * 60 * 60 * 1000;
                  const pendingDeadlineLabel = Number.isFinite(pendingDeadline)
                    ? new Date(pendingDeadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    : null;
                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        ['cancelled', 'rejected', 'expired'].includes(order.status)
                          ? 'border-rose-200 bg-rose-50/20 opacity-80'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            #{order.id}
                          </span>
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            {order.customer_name}
                          </span>
                          <span className="text-xs tabular-nums text-slate-500">
                            {order.customer_phone}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            Règlement : {{ wave: 'Wave', mobile_money: 'Mobile Money', cash: 'espèces', to_confirm: 'à convenir' }[order.payment_method_preference] || 'à convenir'}
                          </span>

                          {/* Status Badge */}
                          {order.status === 'confirmed' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Acceptée · stock réservé
                            </span>
                          )}
                          {order.status === 'delivered' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              <Sparkles className="h-3 w-3" aria-hidden="true" /> Remise
                            </span>
                          )}
                          {order.status === 'preparing' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                              <CookingPot className="h-3 w-3" aria-hidden="true" /> En préparation
                            </span>
                          )}
                          {order.status === 'ready' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
                              <Package className="h-3 w-3" aria-hidden="true" /> Prête
                            </span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                              <X className="h-3 w-3" aria-hidden="true" /> Demande annulée
                            </span>
                          )}
                          {order.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                              <X className="h-3 w-3" aria-hidden="true" /> Demande refusée · stock libéré
                            </span>
                          )}
                          {order.status === 'expired' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                              <Clock3 className="h-3 w-3" aria-hidden="true" /> Demande expirée · stock libéré
                            </span>
                          )}
                          {(!order.status || order.status === 'pending') && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                                <Clock3 className="h-3 w-3" aria-hidden="true" /> À traiter avant {pendingDeadlineLabel || 'expiration sous 2 h'} · stock réservé
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

                        <div className="bg-slate-50 p-2.5 rounded-xl text-xs text-slate-600 flex flex-wrap gap-2">
                          {(order.items ?? []).map((it, i) => (
                            <div key={i} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-medium">
                              <strong>{it.quantity}x</strong> {it.product_title}
                              {it.selected_size && <span className="text-slate-500 ml-1">(T:{it.selected_size})</span>}
                              {it.selected_color && <span className="text-slate-500 ml-1">({it.selected_color})</span>}
                              {it.selected_modifiers?.length > 0 && <span className="text-slate-500 ml-1">+ {it.selected_modifiers.join(', ')}</span>}
                              <span className="text-slate-500 tabular-nums ml-1.5">({formatFCFA(it.unit_price * it.quantity)})</span>
                            </div>
                          ))}
                        </div>
                        {order.loyalty_points && (
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--mt-green-deep)]">
                            <span className="inline-flex items-center gap-1.5 font-bold"><Gift className="h-3.5 w-3.5" aria-hidden="true" />{order.loyalty_points.available} point{order.loyalty_points.available === 1 ? '' : 's'}</span>
                            {order.loyalty_points.reserved > 0
                              ? <span className="font-semibold">{order.loyalty_points.reserved} réservé{order.loyalty_points.reserved === 1 ? '' : 's'} : demandez son code au client</span>
                              : order.loyalty_points.next_cost !== null && (order.loyalty_points.available >= order.loyalty_points.next_cost
                              ? <span className="font-semibold">Récompense disponible : le client peut réserver son code</span>
                              : <span className="text-[var(--mt-gray-600)]">Encore {order.loyalty_points.next_cost - order.loyalty_points.available} avant une récompense</span>)}
                          </p>
                        )}
                        {state.currentShop && !state.currentShop.admin_mode && order.status === 'delivered'
                          && order.customer_user_id && order.loyalty?.available_rewards > 0 && (
                            <MerchantLoyaltyReward
                              shopId={state.currentShop.id}
                              orderId={order.id}
                              deliveredOrders={order.loyalty.delivered_orders}
                              availableRewards={order.loyalty.available_rewards}
                              onRedeemed={() => state.loadShopData(order.shop_id)}
                            />
                          )}
                      </div>

                      <div className="flex min-w-0 flex-col gap-2.5 border-t border-slate-100 pt-3 md:w-56 md:shrink-0 md:items-end md:justify-between md:border-t-0 md:pt-0">
                        <span className="font-black text-lg text-slate-900 md:text-right">
                          {formatFCFA(order.total_amount)}
                        </span>

                        {/* Order status action buttons */}
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                          {state.currentShop && (
                            <OrderContactReveal
                              endpoint={`/api/shops/${state.currentShop.id}/orders/${order.id}/contacts/customer`}
                              contactLabel="le client"
                              orderStatus={order.status || 'pending'}
                            />
                          )}
                          {(!order.status || order.status === 'pending') && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                                className="min-h-11 flex-1 rounded-xl bg-[var(--mt-green-primary)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--mt-green-hover)] active:scale-[0.98] sm:flex-none"
                              >
                                Accepter
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}
                                className="min-h-11 flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 sm:flex-none"
                              >
                                Refuser
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
                                Marquer comme remise
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
                                Marquer comme remise
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
