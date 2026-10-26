import React, { useEffect, useState } from 'react';
import { Store, Clock, Check, Send, Eye, EyeOff, TrendingUp, AlertTriangle, Copy, RotateCcw, Calendar } from 'lucide-react';
import type { Shop } from '../../types';
import { MerchantState } from './useMerchant';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { MerchantIdentityVerification } from './lazyMerchantIdentityVerification';
import { cleanPhoneForWhatsApp, formatFCFA } from '../../utils/format';
import {
  getSubscriptionProductLimit,
  getSubscriptionProductPhotoLimit,
  isSubscriptionFeatureIncluded,
  TRIAL_CATALOG_LIMIT,
} from '../../utils/subscriptionFeatures';
import { WhatsAppSubscriptionReminderConsent } from './WhatsAppSubscriptionReminderConsent';
import { MerchantBoostPurchase } from './MerchantBoostPurchase';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';
import { PushNotificationSettings } from './PushNotificationSettings';
import { ProductOffersManager } from './ProductOffersManager';

interface SettingsTabProps {
  state: MerchantState;

}

export const SettingsTab: React.FC<SettingsTabProps> = ({ state }) => {
  const [showPlanChooser, setShowPlanChooser] = useState(false);
  const [merchantDataExporting, setMerchantDataExporting] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerEmailLoading, setOwnerEmailLoading] = useState(false);
  const [ownerProfileSaving, setOwnerProfileSaving] = useState(false);
  const [ownerProfileError, setOwnerProfileError] = useState('');
  const {
    currentShop, products, showSettingsPin, setShowSettingsPin, setCurrentShop, settingsSubTab, settingsName, setSettingsName, settingsWelcome, setSettingsWelcome, settingsPhone, setSettingsPhone, settingsCity, setSettingsCity, settingsNewPin, setSettingsNewPin,
    settingsSocialLinks, setSettingsSocialLinks, settingsDeliveryZones, settingsSaved,
    hoursEnabled, setHoursEnabled, openTime, setOpenTime, closeTime, setCloseTime, activeDays, setActiveDays,
    manualOverride, hoursSaved, cronResult, copiedBilan, setCopiedBilan,
    flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleSaveGeneralSettings, addDeliveryZone, updateDeliveryZone, removeDeliveryZone, toast
  } = state;
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const featuredUntil = currentShop?.featured_until || null;
  const isFeatured = Boolean(featuredUntil && Date.parse(featuredUntil) > Date.now());
  const canUseSocialLinks = Boolean(currentShop?.admin_mode || currentShop?.subscription?.isActive
    && isSubscriptionFeatureIncluded(currentShop.subscription.plan, 'social_links'));
  const subscriptionStatus = currentShop.subscription?.status || 'not_started';
  const subscriptionStatusLabel = {
    not_started: 'Non démarré',
    trialing: 'Essai gratuit en cours',
    active: 'Actif',
    past_due: 'Paiement à régulariser',
    cancelled: 'Résilié',
    expired: 'Expiré',
    suspended: 'Suspendu',
  }[subscriptionStatus];
  const currentProductLimit = !currentShop.admin_mode
    && subscriptionStatus === 'trialing'
    && (currentShop.subscription?.trialDaysRemaining ?? 0) > 0
    ? TRIAL_CATALOG_LIMIT
    : getSubscriptionProductLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
  const currentPhotoLimit = getSubscriptionProductPhotoLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
  const settingsCopy: Record<typeof settingsSubTab, { eyebrow: string; title: string; description: string }> = {
    profile: { eyebrow: 'Compte', title: 'Profil personnel', description: 'Gérez vos coordonnées personnelles, votre e-mail de facturation et la sécurité de votre accès.' },
    themes: { eyebrow: 'Ma boutique', title: 'Apparence de la vitrine', description: 'Personnalisez les couleurs, les images et la présentation de votre boutique.' },
    general: { eyebrow: 'Ma boutique', title: 'Informations de la boutique', description: 'Gardez vos coordonnées, votre contact et vos informations de livraison à jour.' },
    hours: { eyebrow: 'Ma boutique', title: 'Horaires et disponibilité', description: 'Définissez les jours et heures pendant lesquels vos clients peuvent commander.' },
    bilan: { eyebrow: 'Mon activité', title: 'Suivi de votre activité', description: 'Consultez les chiffres du jour et partagez votre bilan sur WhatsApp.' },
    verification: { eyebrow: 'Compte', title: 'Vérification du commerce', description: 'Suivez la vérification de votre identité et de votre boutique.' },
    subscription: { eyebrow: 'Compte', title: 'Abonnement', description: 'Consultez votre formule, son échéance et les options de paiement.' },
    visibility: { eyebrow: 'Visibilité', title: 'Campagnes et boosts', description: 'Gérez la mise à la une, les boosts sponsorisés et les campagnes publicitaires. Les promotions de prix se gèrent dans le catalogue.' },
    notifications: { eyebrow: 'Compte', title: 'Notifications Push', description: 'Choisissez si cet appareil peut recevoir les alertes importantes de votre boutique.' },
  };
  const activeSettingsCopy = settingsCopy[settingsSubTab];

  useEffect(() => {
    if (settingsSubTab !== 'profile' || !currentShop) return;
    let cancelled = false;
    setOwnerEmail('');
    setOwnerName('');
    setOwnerPhone('');
    setOwnerEmailLoading(true);
    setOwnerProfileError('');
    fetch(`/api/shops/${currentShop.id}/owner-profile`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le profil.');
        if (!cancelled) {
          setOwnerName(data.name || '');
          setOwnerPhone(data.phone || '');
          setOwnerEmail(data.email || '');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setOwnerProfileError(error instanceof Error ? error.message : 'Impossible de charger le profil.');
      })
      .finally(() => {
        if (!cancelled) setOwnerEmailLoading(false);
      });
    return () => { cancelled = true; };
  }, [settingsSubTab, currentShop?.id]);

  const saveOwnerProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentShop) return;
    setOwnerProfileSaving(true);
    setOwnerProfileError('');
    try {
      const response = await fetch(`/api/shops/${currentShop.id}/owner-profile`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ownerName.trim(),
          phone: ownerPhone.trim(),
          email: ownerEmail.trim(),
          pin_code: settingsNewPin.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer le profil.');
      setOwnerName(data.name || '');
      setOwnerPhone(data.phone || '');
      setOwnerEmail(data.email);
      setSettingsNewPin('');
      toast.success(data.pin_updated ? 'Profil enregistré et code PIN modifié.' : 'Profil enregistré.');
    } catch (error) {
      setOwnerProfileError(error instanceof Error ? error.message : 'Impossible d’enregistrer le profil.');
    } finally {
      setOwnerProfileSaving(false);
    }
  };
  const exportMerchantData = async () => {
    if (!currentShop) return;
    setMerchantDataExporting(true);
    try {
      const response = await fetch('/api/auth/merchant-data-export', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Impossible de préparer vos données.');
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `matable-donnees-boutique-${currentShop.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de préparer vos données.');
    } finally {
      setMerchantDataExporting(false);
    }
  };

  return (
    <>
{/* TAB 4: SETTINGS & THEMES */}

          <div className="max-w-5xl space-y-5">
            <header className="flex flex-col gap-4 rounded-3xl border border-[#e7dfd3] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#1D6B57]">{activeSettingsCopy.eyebrow} · Paramètres</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#292d2a]">{activeSettingsCopy.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{activeSettingsCopy.description}</p>
              </div>
              <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[#d8e9df] bg-[#eff7f1] px-3 py-1.5 text-xs font-bold text-[#047857]">
                <span className={`h-2 w-2 rounded-full ${currentShop.is_open ? 'bg-[#1D6B57]' : 'bg-[#F97316]'}`} />
                {currentShop.is_open ? 'Boutique ouverte' : 'Boutique fermée'}
              </span>
            </header>

            {settingsSubTab === 'profile' && <section className="flex flex-col gap-4 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="max-w-2xl">
                <h3 className="text-sm font-extrabold text-[#292d2a]">Mes données</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">Téléchargez les données MaTable.ci enregistrées pour cette boutique. Les données conservées directement par des prestataires externes ne sont pas incluses. Pour demander la suppression du compte, contactez l’assistance.</p>
              </div>
              <button type="button" onClick={exportMerchantData} disabled={merchantDataExporting} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#47534b] disabled:opacity-50">
                {merchantDataExporting ? 'Préparation…' : 'Télécharger mes données'}
              </button>
            </section>}

            {settingsSubTab === 'profile' && (
              <form onSubmit={saveOwnerProfile} className="space-y-5 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div>
                  <h3 className="text-base font-extrabold text-[#292d2a]">Mes coordonnées personnelles</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">Ces informations restent privées et sont distinctes du nom et du WhatsApp affichés sur la vitrine.</p>
                </div>
                {ownerProfileError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{ownerProfileError}</p>}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block text-sm font-semibold text-slate-800">
                    Nom complet
                    <input
                      type="text"
                      autoComplete="name"
                      maxLength={100}
                      value={ownerName}
                      onChange={(event) => setOwnerName(event.target.value)}
                      disabled={ownerEmailLoading || ownerProfileSaving}
                      placeholder="Votre nom et prénom"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">
                    Téléphone personnel
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Facultatif, format ivoirien. Ne change pas le WhatsApp public ni votre identifiant.</span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={20}
                      value={ownerPhone}
                      onChange={(event) => setOwnerPhone(event.target.value)}
                      disabled={ownerEmailLoading || ownerProfileSaving}
                      placeholder="+225 07 00 00 00 00"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">
                    E-mail de facturation
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Requis pour le paiement et l’envoi des reçus.</span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={ownerEmail}
                      onChange={(event) => setOwnerEmail(event.target.value)}
                      disabled={ownerEmailLoading || ownerProfileSaving}
                      placeholder="vous@exemple.ci"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15 disabled:bg-slate-50"
                    />
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-bold text-slate-800">Modifier le code PIN</label>
                  <p className="mt-1 text-xs leading-5 text-slate-600">PIN à 6 chiffres utilisé pour accéder à l’espace commerçant. Laissez vide pour le conserver.</p>
                  <div className="relative mt-3">
                    <input
                      type={showSettingsPin ? 'text' : 'password'}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      autoComplete="new-password"
                      value={settingsNewPin}
                      onChange={(event) => setSettingsNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Nouveau PIN à 6 chiffres"
                      disabled={ownerEmailLoading || ownerProfileSaving}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-12 text-sm font-mono tracking-widest outline-none focus:border-[#047857]"
                    />
                    <button type="button" disabled={ownerEmailLoading || ownerProfileSaving} onClick={() => setShowSettingsPin((visible) => !visible)} aria-label={showSettingsPin ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                      {showSettingsPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                </div>
                <button type="submit" disabled={ownerEmailLoading || ownerProfileSaving} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1D6B57] px-5 py-3 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#047857] disabled:cursor-wait disabled:opacity-60">
                  {ownerProfileSaving ? 'Enregistrement…' : 'Enregistrer le profil'}
                </button>
              </form>
            )}

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
                  shopName={currentShop.name}
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
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">État</span><strong className="mt-1 block text-slate-900">{subscriptionStatusLabel}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">{subscriptionStatus === 'active' ? 'Échéance' : subscriptionStatus === 'trialing' ? 'Fin de l’essai' : 'Prochaine échéance'}</span><strong className="mt-1 block text-slate-900">{(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd || '')) : 'Non démarré'}</strong></div>
                </div>
                <div className="grid gap-3 rounded-xl border border-[#e7dfd3] bg-[#fffdf8] p-4 sm:grid-cols-2">
                  <div><span className="text-xs text-slate-500">Capacité du catalogue</span><strong className="mt-1 block text-slate-900">{Number.isFinite(currentProductLimit) ? `${products.filter((product) => product.shop_id === currentShop.id).length} / ${currentProductLimit} produits` : `${products.filter((product) => product.shop_id === currentShop.id).length} produits · illimité`}</strong></div>
                  <div><span className="text-xs text-slate-500">Photos par produit</span><strong className="mt-1 block text-slate-900">Jusqu’à {currentPhotoLimit}</strong></div>
                </div>
                <p className="text-xs leading-5 text-slate-600">Le paiement est ponctuel, sans prélèvement automatique. GeniusPay confirme le règlement au serveur avant toute activation. Le paiement des commandes clients reste directement convenu avec la boutique.</p>
                <WhatsAppSubscriptionReminderConsent shop={currentShop} />
                <div className="flex flex-col gap-3 rounded-xl border border-[#e3d9cc] bg-[#FAF8F2] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">Besoin d’autres fonctionnalités ?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Comparez Standard, Premium et Pro, puis choisissez un paiement mensuel ou annuel.</p>
                  </div>
                  <button type="button" onClick={() => setShowPlanChooser(true)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[#065f46] px-4 text-xs font-bold text-white transition hover:bg-[#047857]">Voir les formules</button>
                </div>
              </section>
            ))}

            {settingsSubTab === 'notifications' && currentShop && <PushNotificationSettings shop={currentShop} />}
            {settingsSubTab === 'visibility' && currentShop && (
              <section className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">Visibilité de la vitrine</p>
                    <h3 className="mt-1 text-lg font-extrabold text-slate-900">Mise à la une</h3>
                    <p className="mt-1 text-xs text-slate-600">{isFeatured && featuredUntil ? `Votre boutique est mise à la une jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(featuredUntil))}.` : 'Votre boutique n’est pas actuellement mise à la une.'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${isFeatured ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{isFeatured ? 'Active' : 'Inactive'}</span>
                </div>
                <MerchantBoostPurchase shop={currentShop} productCount={products.filter((product) => product.shop_id === currentShop.id).length} />
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="mb-3 text-lg font-extrabold text-slate-900">Campagnes publicitaires</h3>
                  <ProductOffersManager shop={currentShop} products={products} />
                </div>
              </section>
            )}

            {/* Sub-Tab 2: GENERAL SETTINGS */}
            {settingsSubTab === 'general' && (
              <form onSubmit={handleSaveGeneralSettings} className="space-y-5 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center gap-3 border-b border-[#eee8df] pb-4">
                  <span className="rounded-2xl bg-[#d1fae5] p-3 text-[#1D6B57]"><Store className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-extrabold text-[#292d2a] text-base">Informations publiques</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Les détails que vos clients retrouvent sur votre vitrine.</p>
                  </div>
                </div>

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
                      className="w-full rounded-xl border border-[#ded7cd] bg-[#FFFFFF] p-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#1D6B57]/25 focus:border-[#1D6B57]"
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
                      placeholder="Ex. : Abidjan, Bouaké, Yamoussoukro"
                      className="w-full rounded-xl border border-[#ded7cd] bg-[#FFFFFF] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6B57]/25 focus:border-[#1D6B57]"
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
                    className="w-full rounded-xl border border-[#ded7cd] bg-[#FFFFFF] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D6B57]/25 focus:border-[#1D6B57]"
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
                    className="w-full rounded-xl border border-[#ded7cd] bg-[#FFFFFF] p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1D6B57]/25 focus:border-[#1D6B57]"
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

                <div className="pt-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-[#1D6B57] px-5 py-3 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#047857]"
                  >
                    Enregistrer les coordonnées
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tab 3: OPENING HOURS & AUTOMATION */}
            {settingsSubTab === 'hours' && (
              <form onSubmit={handleSaveOpeningHours} className="space-y-6 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
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
                          required
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
                          required
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
              <div className="space-y-6 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
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
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Montant des commandes enregistrées aujourd’hui</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? formatFCFA(flashBilan.total_sales) : '—'}
                    </span>
                    <span className="mt-1 block text-[10px] text-slate-500">Montant commandé, pas un paiement confirmé.</span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Commandes</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? flashBilan.total_orders : '—'}
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
