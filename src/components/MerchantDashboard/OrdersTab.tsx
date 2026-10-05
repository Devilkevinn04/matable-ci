import React from 'react';
import { Store, ShoppingBag, Package, Plus, Edit3, Trash2, Sparkles, Phone, Lock, Clock, Check, Send, ExternalLink, ChevronRight, UserPlus, X, UtensilsCrossed, Shirt, Search, Eye, EyeOff, Minus, TrendingUp, DollarSign, MapPin, Palette, Key, AlertTriangle, Copy, RotateCcw, Calendar, Upload, Boxes } from 'lucide-react';
import { MerchantState } from './useMerchant';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { formatFCFA } from '../../utils/format';

interface OrdersTabProps {
  state: MerchantState;
  filteredOrders: any[]; totalRevenue: number; avgBasket: number;
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ state, filteredOrders, totalRevenue, avgBasket }) => {
  const {
    currentShop, products, orders, activeTab, settingsSubTab, setSettingsSubTab,
    catalogSearch, setCatalogSearch, catalogFilter, setCatalogFilter,
    orderSearch, setOrderSearch, orderPaymentFilter, setOrderPaymentFilter, orderStatusFilter, setOrderStatusFilter,
    settingsName, setSettingsName, settingsWelcome, setSettingsWelcome, settingsOpen, setSettingsOpen,
    settingsPhone, setSettingsPhone, settingsCity, setSettingsCity, settingsNewPin, setSettingsNewPin,
    settingsSocialLinks, setSettingsSocialLinks, settingsDeliveryZones, setSettingsDeliveryZones, settingsSaved,
    hoursEnabled, setHoursEnabled, openTime, setOpenTime, closeTime, setCloseTime, activeDays, setActiveDays,
    manualOverride, hoursSaved, cronRunning, cronResult, copiedBilan, setCopiedBilan,
    isProductModalOpen, setIsProductModalOpen, editingProduct, prodTitle, setProdTitle, prodCategory, setProdCategory,
    prodDescription, setProdDescription, prodPrice, setProdPrice, prodStock, setProdStock, prodImage, setProdImage,
    prodLookbookImage, setProdLookbookImage, prodSizes, setProdSizes, prodColors, setProdColors, prodPrepTime, setProdPrepTime,
    prodIsAvailable, setProdIsAvailable,
    imageCompressing, compressedSizeKB, originalImageSizeKB, flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleTriggerCronBilan, handleQuickStockChange, handleQuickToggleVisibility,
    handleOpenAddModal, handleOpenEditModal, handleUpdateOrderStatus, handleImageUpload, handleSaveProduct, handleDeleteProduct,
    handleSaveGeneralSettings, addDeliveryZone, updateDeliveryZone, removeDeliveryZone, toast, copyOwnerLink, copyRegistrationLinks
  } = state;

  return (
    <>
{/* TAB 2: ORDERS MANAGEMENT */}

          <div className="space-y-4">
            {/* Orders Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Valeur des commandes
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(totalRevenue)}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
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

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Panier Moyen
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(avgBasket)}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Orders */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Rechercher par client, tél ou #..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setOrderPaymentFilter('all')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Toutes ({orders.length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('wave')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'wave'
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                  }`}
                >
                  Wave souhaité ({orders.filter(o => o.payment_method_preference === 'wave').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('mobile_money')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'mobile_money'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  Mobile Money souhaité ({orders.filter(o => o.payment_method_preference === 'mobile_money').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('cash')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${orderPaymentFilter === 'cash' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                >
                  Espèces ({orders.filter(o => o.payment_method_preference === 'cash').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('to_confirm')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${orderPaymentFilter === 'to_confirm' ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
                >
                  À convenir ({orders.filter(o => o.payment_method_preference === 'to_confirm').length})
                </button>
              </div>

              {/* Status filter bar */}
              <div className="flex items-center gap-1.5 w-full overflow-x-auto pb-1 mt-2">
                <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Statut :</span>
                {[
                  { id: 'all', label: 'Toutes', count: orders.length },
                  { id: 'pending', label: '⏳ En attente', count: orders.filter(o => (o.status || 'pending') === 'pending').length },
                  { id: 'confirmed', label: '✓ Confirmées', count: orders.filter(o => o.status === 'confirmed').length },
                  { id: 'preparing', label: '🍳 En préparation', count: orders.filter(o => o.status === 'preparing').length },
                  { id: 'ready', label: '📦 Prêtes', count: orders.filter(o => o.status === 'ready').length },
                  { id: 'delivered', label: '✨ Livrées', count: orders.filter(o => o.status === 'delivered').length },
                  { id: 'cancelled', label: '✕ Annulées', count: orders.filter(o => o.status === 'cancelled').length },
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => setOrderStatusFilter(st.id as any)}
                    className={`text-[11px] font-bold py-1 px-2.5 rounded-lg transition-colors shrink-0 ${
                      orderStatusFilter === st.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {st.label} ({st.count})
                  </button>
                ))}
              </div>
            </div>

            <p className="-mt-2 text-[11px] leading-5 text-slate-500">
              Une nouvelle commande est acceptée automatiquement. Le suivi WhatsApp indique le clic sur le bouton, pas l’envoi du message.
            </p>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">Aucune commande trouvée</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Modifiez vos critères de recherche ou de filtre pour afficher les commandes correspondantes.
                </p>
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
                              ✓ Confirmée
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

                      <div className="flex flex-col sm:items-end justify-between gap-2.5 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        <span className="font-black text-lg text-slate-900">
                          {formatFCFA(order.total_amount)}
                        </span>

                        {/* Order status action buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(!order.status || order.status === 'pending') && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
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
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                              >
                                Préparer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Marquer livrée
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
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
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                              >
                                Prête
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
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
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Marquer livrée
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
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
                              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
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
