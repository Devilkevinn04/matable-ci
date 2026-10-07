import React, { useState } from 'react';
import { Store, ShoppingBag, Package, Plus, Edit3, Trash2, Phone, Lock, Clock, Check, Send, ExternalLink, ChevronRight, UserPlus, X, UtensilsCrossed, Shirt, Search, Eye, EyeOff, Minus, TrendingUp, DollarSign, MapPin, Palette, Key, AlertTriangle, Copy, RotateCcw, Calendar, Upload, Boxes, ShieldCheck } from 'lucide-react';
import type { Shop } from '../../types';
import { MerchantState } from './useMerchant';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { MerchantIdentityVerification } from './lazyMerchantIdentityVerification';
import { ProAnalyticsPanel } from './ProAnalyticsPanel';
import { cleanPhoneForWhatsApp, formatFCFA } from '../../utils/format';
import { isSubscriptionFeatureIncluded } from '../../utils/subscriptionFeatures';
import { WhatsAppSubscriptionReminderConsent } from './WhatsAppSubscriptionReminderConsent';
import { MerchantBoostPurchase } from './MerchantBoostPurchase';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';

interface SettingsTabProps {
  state: MerchantState;

}

export const SettingsTab: React.FC<SettingsTabProps> = ({ state }) => {
  const [showPlanChooser, setShowPlanChooser] = useState(false);
  const {
    currentShop, products, orders, activeTab, showSettingsPin, setShowSettingsPin, setCurrentShop, settingsSubTab, setSettingsSubTab,
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
  const totalRevenue = orders.reduce((total, order) => total + order.total_amount, 0);
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const featuredUntil = currentShop?.featured_until || null;
  const isFeatured = Boolean(featuredUntil && Date.parse(featuredUntil) > Date.now());
  const canUseSocialLinks = Boolean(currentShop?.admin_mode || currentShop?.subscription?.isActive
    && isSubscriptionFeatureIncluded(currentShop.subscription.plan, 'social_links'));

  return (
    <>
{/* TAB 4: SETTINGS & THEMES */}

          <div className="space-y-6">
            {/* Settings Sub-Tab Navigation */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:grid-cols-3 xl:grid-cols-7">
              <button
                type="button"
                onClick={() => setSettingsSubTab('themes')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
                  settingsSubTab === 'themes'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Palette className="w-4 h-4" />
                <span className="truncate">Thèmes & style</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('general')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
                  settingsSubTab === 'general'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Store className="w-4 h-4" />
                <span className="truncate">Coordonnées</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('hours')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
                  settingsSubTab === 'hours'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span className="truncate">Horaires</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('bilan')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
                  settingsSubTab === 'bilan'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Send className="w-4 h-4" />
                <span className="truncate">Flash bilan</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('verification')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${
                  settingsSubTab === 'verification'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="truncate">Vérification</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('subscription')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${settingsSubTab === 'subscription' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <DollarSign className="w-4 h-4" />
                <span className="truncate">Mon forfait</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('analytics')}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-colors ${settingsSubTab === 'analytics' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="truncate">Statistiques Pro</span>
              </button>
            </div>

            {/* Sub-Tab 1: THEME CUSTOMIZER */}
            {settingsSubTab === 'themes' && (
              <ThemeCustomizer
                shop={currentShop}
                onUpdateShop={(updated) => {
                  setCurrentShop((previous) => previous
                    ? { ...updated, admin_mode: previous.admin_mode }
                    : updated);
                }}
              />
            )}

            {settingsSubTab === 'verification' && currentShop && (
              <React.Suspense fallback={<p role="status" className="text-sm text-slate-600">Chargement de la vérification…</p>}>
                <MerchantIdentityVerification
                  shopId={currentShop.id}
                  onStatusChange={(status) => setCurrentShop((shop) => shop
                    ? { ...shop, merchant_verification_status: status.status as Shop['merchant_verification_status'] }
                    : null)}
                />
              </React.Suspense>
            )}

            {settingsSubTab === 'subscription' && currentShop && (showPlanChooser ? (
              <MerchantTrialOnboarding
                shop={currentShop}
                productCount={products.filter((product) => product.shop_id === currentShop.id).length}
                isStarting={false}
                mode="plans"
                onBack={() => setShowPlanChooser(false)}
              />
            ) : (
              <section className="max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div>
                  <p className="text-xs font-bold uppercase text-emerald-800">Abonnement</p>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-900">Votre formule</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Formule</span><strong className="mt-1 block capitalize text-slate-900">{currentShop.subscription?.plan || 'Standard'}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">État</span><strong className="mt-1 block text-slate-900">{currentShop.subscription?.status === 'trialing' ? 'Essai gratuit' : currentShop.subscription?.status === 'active' ? 'Actif' : 'À régulariser'}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">{currentShop.subscription?.status === 'active' ? 'Échéance' : 'Fin de l’essai'}</span><strong className="mt-1 block text-slate-900">{(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd || '')) : 'Non démarré'}</strong></div>
                </div>
                <p className="text-xs leading-5 text-slate-600">L’essai est gratuit. Après son échéance, le renouvellement sécurisé est disponible via KadevPay; le règlement d’une commande client reste directement convenu avec la boutique.</p>
                <WhatsAppSubscriptionReminderConsent shop={currentShop} />
                <div className="flex flex-col gap-3 rounded-xl border border-[#e3d9cc] bg-[#f7f3ee] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">Besoin d’autres fonctionnalités ?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Comparez Standard, Premium et Pro, puis choisissez un paiement mensuel ou annuel.</p>
                  </div>
                  <button type="button" onClick={() => setShowPlanChooser(true)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[#0f4d3d] px-4 text-xs font-bold text-white transition hover:bg-[#176b55]">Voir les formules</button>
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500">Visibilité de la vitrine</p>
                      <h4 className="mt-1 text-sm font-extrabold text-slate-900">Mise à la une</h4>
                      <p className="mt-1 text-xs text-slate-600">{isFeatured && featuredUntil ? `Votre boutique est mise à la une jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(featuredUntil))}.` : 'Votre boutique n’est pas actuellement mise à la une.'}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${isFeatured ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{isFeatured ? 'Active' : 'Inactive'}</span>
                  </div>
                  <MerchantBoostPurchase shop={currentShop} productCount={products.filter((product) => product.shop_id === currentShop.id).length} />
                </div>
              </section>
            ))}

            {settingsSubTab === 'analytics' && currentShop && <ProAnalyticsPanel shop={currentShop} />}

            {/* Sub-Tab 2: GENERAL SETTINGS */}
            {settingsSubTab === 'general' && (
              <form onSubmit={handleSaveGeneralSettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Coordonnées de la boutique & Sécurité
                </h3>

                {settingsSaved && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Modifications enregistrées avec succès !</span>
                  </div>
                )}

                {/* Shop Name & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nom commercial de la boutique *
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ville / Commune
                    </label>
                    <input
                      type="text"
                      value={settingsCity}
                      onChange={(e) => setSettingsCity(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Slogan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Slogan / Message de bienvenue sur la vitrine
                  </label>
                  <textarea
                    rows={2}
                    value={settingsWelcome}
                    onChange={(e) => setSettingsWelcome(e.target.value)}
                    placeholder="Ex: Nuisettes soyeuses & lingerie fine. Livraison discrète à Abidjan..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* WhatsApp Contact Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Numéro WhatsApp de réception des commandes *
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Les clients seront automatiquement redirigés vers ce numéro WhatsApp avec leur panier validé.
                  </p>
                </div>

                {/* Social links */}
                {canUseSocialLinks ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <label className="block text-xs font-bold text-slate-700">Réseaux sociaux publics · Premium/Pro</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="url" value={settingsSocialLinks.instagram || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, instagram: e.target.value }))} placeholder="Instagram URL" className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white" />
                      <input type="url" value={settingsSocialLinks.facebook || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, facebook: e.target.value }))} placeholder="Facebook URL" className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white" />
                      <input type="url" value={settingsSocialLinks.website || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, website: e.target.value }))} placeholder="Site web URL" className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white" />
                      <input type="url" value={settingsSocialLinks.whatsapp || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, whatsapp: e.target.value }))} placeholder="WhatsApp URL" className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white" />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
                    <p className="text-xs font-bold text-amber-950">Réseaux sociaux publics · Premium/Pro</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Ajoutez les liens de vos réseaux sociaux avec une formule Premium ou Pro.</p>
                  </div>
                )}

                {/* Delivery zones */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Zones de service & livraison
                    </label>
                    <button
                      type="button"
                      onClick={addDeliveryZone}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black"
                    >
                      + Ajouter
                    </button>
                  </div>

                  {settingsDeliveryZones.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Aucune zone renseignée. Ajoutez une zone conforme à votre service.</p>
                  ) : (
                    settingsDeliveryZones.map((zone, index) => (
                      <div key={`${zone.label || 'zone'}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            value={zone.label}
                            onChange={(e) => updateDeliveryZone(index, 'label', e.target.value)}
                            placeholder="Nom de la zone"
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                          />
                          <select
                            value={zone.mode}
                            onChange={(e) => updateDeliveryZone(index, 'mode', e.target.value)}
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                          >
                            <option value="livraison">Livraison</option>
                            <option value="sur_place">Sur place</option>
                            <option value="retirer">Retrait</option>
                          </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="number"
                            min={0}
                            value={zone.fee}
                            onChange={(e) => updateDeliveryZone(index, 'fee', Number(e.target.value || 0))}
                            placeholder="Frais (FCFA)"
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                          />
                          <input
                            value={zone.description || ''}
                            onChange={(e) => updateDeliveryZone(index, 'description', e.target.value)}
                            placeholder="Description / délai"
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeDeliveryZone(index)}
                            className="text-[10px] font-bold text-rose-700"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Change PIN Code */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-slate-500" />
                    <span>Modifier mon code PIN secret à 6 chiffres</span>
                  </label>
                  <div className="relative w-full sm:w-64">
                    <input
                      type={showSettingsPin ? 'text' : 'password'}
                      maxLength={6}
                      placeholder="Laissez vide pour conserver l'actuel"
                      value={settingsNewPin}
                      onChange={(e) => setSettingsNewPin(e.target.value)}
                      className="w-full text-xs p-2.5 pr-12 rounded-lg border border-slate-300 bg-white font-mono tracking-widest text-center"
                    />
                    <button type="button" onClick={() => setShowSettingsPin((visible) => !visible)} aria-label={showSettingsPin ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                      {showSettingsPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Le code PIN est indispensable pour accéder à votre espace de gestion.
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    Enregistrer les coordonnées
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tab 3: OPENING HOURS & AUTOMATION */}
            {settingsSubTab === 'hours' && (
              <form onSubmit={handleSaveOpeningHours} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Automatisation des Horaires d'Ouverture
                      </h3>
                      <p className="text-xs text-slate-500">
                        Gestion automatique des prises de commande selon vos plages horaires (Fuseau GMT / UTC+0 Abidjan).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs ${
                      currentShop.is_open
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${currentShop.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>{currentShop.is_open ? 'Actuellement Ouvert' : 'Actuellement Fermé'}</span>
                    </span>
                  </div>
                </div>

                {hoursSaved && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Planning des horaires enregistré avec succès !</span>
                  </div>
                )}

                {/* Manual Override Alert */}
                {manualOverride && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-black text-amber-950">Forçage manuel actuellement actif</p>
                        <p className="text-amber-800 text-[11px]">
                          La boutique a été basculée manuellement en mode <strong>{currentShop.is_open ? 'Ouverte' : 'Fermée'}</strong>. Ce choix reste prioritaire jusqu'à sa réinitialisation.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetManualOverride}
                      className="py-2 px-3 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reprendre le planning automatique</span>
                    </button>
                  </div>
                )}

                {/* Automation Toggle */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <label htmlFor="hours-enable-toggle" className="font-extrabold text-slate-900 text-sm cursor-pointer">
                      Activer le planning automatique
                    </label>
                    <p className="text-xs text-slate-500">
                      Lorsque ce mode est activé, la vitrine bascule automatiquement entre Ouvert et Fermé. <strong>Lorsque la boutique est fermée, les clients ne peuvent plus valider de commandes.</strong>
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      id="hours-enable-toggle"
                      type="checkbox"
                      checked={hoursEnabled}
                      onChange={(e) => setHoursEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5.5 after:w-5.5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {hoursEnabled && (
                  <div className="space-y-5 animate-fadeIn">
                    {/* Time Slots */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Heure d'ouverture quotidienne *
                        </label>
                        <input
                          type="time"
                          value={openTime}
                          onChange={(e) => setOpenTime(e.target.value)}
                          className="w-full text-base font-mono font-bold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <span className="text-[11px] text-slate-400 block">
                          Heure d'ouverture des prises de commande (ex: 08:00)
                        </span>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Heure de fermeture quotidienne *
                        </label>
                        <input
                          type="time"
                          value={closeTime}
                          onChange={(e) => setCloseTime(e.target.value)}
                          className="w-full text-base font-mono font-bold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <span className="text-[11px] text-slate-400 block">
                          Heure de clôture des prises de commande (ex: 22:00)
                        </span>
                      </div>
                    </div>

                    {/* Active Days Selection */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <span>Jours d'ouverture hebdomadaires</span>
                        </label>

                        {/* Presets */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5, 6, 0])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            7j/7
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5, 6])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Lun - Sam
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Lun - Ven
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-1">
                        {[
                          { day: 1, label: 'Lundi' },
                          { day: 2, label: 'Mardi' },
                          { day: 3, label: 'Mercredi' },
                          { day: 4, label: 'Jeudi' },
                          { day: 5, label: 'Vendredi' },
                          { day: 6, label: 'Samedi' },
                          { day: 0, label: 'Dimanche' },
                        ].map(({ day, label }) => {
                          const isSelected = activeDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (activeDays.length > 1) {
                                    setActiveDays(activeDays.filter(d => d !== day));
                                  }
                                } else {
                                  setActiveDays([...activeDays, day]);
                                }
                              }}
                              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between gap-3">
                  <button
                    type="submit"
                    className="py-2.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    Enregistrer la programmation des horaires
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tab 4: FLASH BILAN 20H */}
            {settingsSubTab === 'bilan' && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Flash Bilan Automatisé de 20h
                      </h3>
                      <p className="text-xs text-slate-500">
                        Résumé quotidien généré automatiquement chaque soir pour le commerçant avec récapitulatif WhatsApp.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Copy Bilan */}
                    {flashBilan && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(flashBilan.whatsapp_message);
                            setCopiedBilan(true);
                            setTimeout(() => setCopiedBilan(false), 2500);
                          } catch {
                            toast.error('Impossible de copier le bilan.');
                          }
                        }}
                        className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        {copiedBilan ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedBilan ? 'Copié !' : 'Copier le texte'}</span>
                      </button>
                    )}

                    {/* Send WhatsApp */}
                    {flashBilan && (
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(currentShop.whatsapp_number)}?text=${encodeURIComponent(flashBilan.whatsapp_message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Envoyer sur mon WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Recap Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Ventes du jour</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? formatFCFA(flashBilan.total_sales) : formatFCFA(totalRevenue)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Commandes</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? flashBilan.total_orders : orders.length}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">Stock bas</span>
                    <span className="text-base font-black text-amber-700">
                      {flashBilan ? flashBilan.low_stock_products.length : lowStockCount} article(s)
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block">Rupture stock</span>
                    <span className="text-base font-black text-rose-700">
                      {flashBilan ? flashBilan.out_of_stock_products.length : outOfStockCount} article(s)
                    </span>
                  </div>
                </div>

                {/* Top Selling Products calculation */}
                {flashBilan?.top_selling_products && flashBilan.top_selling_products.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-indigo-600" />
                      <span>Top des articles les plus vendus aujourd'hui :</span>
                    </h4>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
                      {flashBilan.top_selling_products.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-black text-[10px] flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-slate-900">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 font-medium">{item.quantity_sold} vendus</span>
                            <span className="font-black text-slate-900">{formatFCFA(item.revenue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message preview */}
                {flashBilan && (
                  <div>
                    <span className="text-xs font-bold text-slate-700 block mb-2">
                      Aperçu du message WhatsApp pré-formaté :
                    </span>
                    <div className="p-4 rounded-xl bg-slate-900 text-white font-mono text-xs leading-relaxed whitespace-pre-wrap selection:bg-indigo-500">
                      {flashBilan.whatsapp_message}
                    </div>
                  </div>
                )}

                {cronResult && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {cronResult.message} ({cronResult.bilans?.length || 0} boutique(s) traitée(s)).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
    </>
  );
  return null;
};
