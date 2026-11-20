import React, { useEffect, useState } from 'react';
import { Store, Clock, Check, Send, Eye, EyeOff, TrendingUp, AlertTriangle, Copy, RotateCcw, Calendar } from 'lucide-react';
import type { Shop } from '../../types';
import { MerchantState } from './useMerchant';
import { ContextualHelp } from '../ContextualHelp';
import { ThemeCustomizer } from '../ThemeCustomizer';
import type { ManualVerificationProgress } from './MerchantManualVerification';
import { MerchantVerificationWizard } from './MerchantVerificationWizard';
import { cleanPhoneForWhatsApp, formatFCFA } from '../../utils/format';
import {
  getSubscriptionProductLimit,
  getSubscriptionProductPhotoLimit,
  isSubscriptionFeatureIncluded,
  TRIAL_CATALOG_LIMIT,
} from '../../utils/subscriptionFeatures';
import { WhatsAppSubscriptionReminderConsent } from './WhatsAppSubscriptionReminderConsent';
import { EmailSubscriptionReminderConsent } from './EmailSubscriptionReminderConsent';
import { MerchantBoostPurchase } from './MerchantBoostPurchase';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';
import { PushNotificationSettings } from './PushNotificationSettings';
import { ProductOffersManager } from './ProductOffersManager';
import { isShopPubliclyVisible } from '../../utils/shopPublication';

interface SettingsTabProps {
  state: MerchantState;

}

export const SettingsTab: React.FC<SettingsTabProps> = ({ state }) => {
  const [showPlanChooser, setShowPlanChooser] = useState(false);
  const [verificationStep, setVerificationStep] = useState<1 | 2>(1);
  const [diditStatus, setDiditStatus] = useState('pending');
  const [diditAvailable, setDiditAvailable] = useState<boolean | null>(null);
  const [manualIdentityOpen, setManualIdentityOpen] = useState(false);
  const [manualVerificationProgress, setManualVerificationProgress] = useState<ManualVerificationProgress | null>(null);
  const [merchantDataExporting, setMerchantDataExporting] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [savedOwnerEmail, setSavedOwnerEmail] = useState('');
  const [ownerEmailVerified, setOwnerEmailVerified] = useState(false);
  const [ownerEmailChallenge, setOwnerEmailChallenge] = useState('');
  const [ownerEmailCode, setOwnerEmailCode] = useState('');
  const [ownerEmailVerifying, setOwnerEmailVerifying] = useState(false);
  const [ownerCurrentPin, setOwnerCurrentPin] = useState('');
  const [ownerEmailLoading, setOwnerEmailLoading] = useState(false);
  const [ownerProfileSaving, setOwnerProfileSaving] = useState(false);
  const [ownerProfileError, setOwnerProfileError] = useState('');
  const {
    currentShop, products, showSettingsPin, setShowSettingsPin, setCurrentShop, settingsSubTab, settingsName, setSettingsName, settingsWelcome, setSettingsWelcome, settingsPhone, setSettingsPhone, settingsCity, setSettingsCity, settingsNewPin, setSettingsNewPin,
    settingsSocialLinks, setSettingsSocialLinks, settingsSaved,
    hoursEnabled, setHoursEnabled, openTime, setOpenTime, closeTime, setCloseTime, activeDays, setActiveDays,
    manualOverride, hoursSaved, cronResult, copiedBilan, setCopiedBilan,
    flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleSaveGeneralSettings, toast
  } = state;
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const featuredUntil = currentShop?.featured_until || null;
  const isFeatured = Boolean(featuredUntil && Date.parse(featuredUntil) > Date.now());
  const isPubliclyVisible = isShopPubliclyVisible(currentShop);
  const publicationLabel = currentShop.publication_status === 'draft'
    ? 'Vitrine en brouillon'
    : isPubliclyVisible
      ? 'Vitrine publiée'
      : 'Vitrine non visible';
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
  const currentShopProductCount = products.filter((product) => product.shop_id === currentShop.id).length;
  const currentProductLimit = currentShop.admin_mode
    ? Number.POSITIVE_INFINITY
    : subscriptionStatus === 'trialing' && (currentShop.subscription?.trialDaysRemaining ?? 0) > 0
      ? TRIAL_CATALOG_LIMIT
      : getSubscriptionProductLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
  const currentPhotoLimit = currentShop.admin_mode
    ? 6
    : getSubscriptionProductPhotoLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
  const settingsCopy: Record<typeof settingsSubTab, { eyebrow: string; title: string; description: string }> = {
    profile: { eyebrow: 'Compte', title: 'Profil personnel', description: 'Gérez vos coordonnées personnelles, votre e-mail de facturation et la sécurité de votre accès.' },
    themes: { eyebrow: 'Ma boutique', title: 'Apparence de la vitrine', description: 'Personnalisez les couleurs, les images et la présentation de votre boutique.' },
    general: { eyebrow: 'Ma boutique', title: 'Informations de la boutique', description: 'Gardez vos coordonnées et les informations publiques à jour.' },
    hours: { eyebrow: 'Ma boutique', title: 'Horaires et disponibilité', description: 'Définissez les jours et heures pendant lesquels vos clients peuvent commander.' },
    bilan: { eyebrow: 'Mon activité', title: 'Suivi de votre activité', description: 'Consultez les chiffres du jour et partagez votre bilan sur WhatsApp.' },
    verification: { eyebrow: 'Compte', title: 'Vérification d’identité', description: 'Vérifiez l’identité de la personne responsable de la boutique.' },
    subscription: { eyebrow: 'Compte', title: 'Abonnement', description: 'Consultez votre formule, son échéance et les options de paiement.' },
    visibility: { eyebrow: 'Visibilité', title: 'Campagnes et boosts', description: 'Gérez la mise à la une, les boosts sponsorisés et les campagnes publicitaires. Les promotions de prix se gèrent dans le catalogue.' },
    notifications: { eyebrow: 'Compte', title: 'Notifications Push', description: 'Choisissez si cet appareil peut recevoir les alertes importantes de votre boutique.' },
  };
  const activeSettingsCopy = settingsCopy[settingsSubTab];
  const identityStepDone = ['approved', 'verified', 'submitted', 'under_review', 'not_required'].includes(diditStatus)
    || Boolean(manualVerificationProgress?.identityReady);
  useEffect(() => {
    setVerificationStep(1);
    setDiditStatus(currentShop?.identity_verification_status || currentShop?.merchant_verification_status || 'pending');
    setDiditAvailable(null);
    setManualIdentityOpen(false);
    setManualVerificationProgress(null);
  }, [currentShop?.id]);

  const receiveManualVerificationProgress = React.useCallback((progress: ManualVerificationProgress) => {
    setManualVerificationProgress(progress);
  }, []);

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
          setSavedOwnerEmail(data.email || '');
          const emailVerified = Boolean(data.email_verified);
          setOwnerEmailVerified(emailVerified);
          setCurrentShop((shop) => shop ? {
            ...shop,
            owner_email_configured: Boolean(data.email),
            owner_email_verified: emailVerified,
          } : shop);
          setOwnerCurrentPin('');
          setOwnerEmailChallenge('');
          setOwnerEmailCode('');
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
          current_pin: ownerCurrentPin.trim() || undefined,
          pin_code: settingsNewPin.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer le profil.');
      setOwnerName(data.name || '');
      setOwnerPhone(data.phone || '');
      setOwnerCurrentPin('');
      setSettingsNewPin('');
      toast.success(data.pin_updated ? 'Profil enregistré et code PIN modifié.' : 'Profil enregistré.');
    } catch (error) {
      setOwnerProfileError(error instanceof Error ? error.message : 'Impossible d’enregistrer le profil.');
    } finally {
      setOwnerProfileSaving(false);
    }
  };

  const verifyOwnerEmail = async (verify: boolean) => {
    if (!currentShop) return;
    setOwnerEmailVerifying(true);
    setOwnerProfileError('');
    try {
      const response = await fetch(`/api/shops/${currentShop.id}/owner-profile/email-verification/${verify ? 'verify' : 'start'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verify
          ? { challenge_id: ownerEmailChallenge, code: ownerEmailCode, current_pin: ownerCurrentPin.trim() }
          : { email: ownerEmail.trim(), current_pin: ownerCurrentPin.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de vérifier cette adresse e-mail.');
      if (verify) {
        setOwnerEmail(data.email);
        setSavedOwnerEmail(data.email);
        setOwnerEmailVerified(true);
        setOwnerEmailChallenge('');
        setOwnerEmailCode('');
        setCurrentShop((shop) => shop ? {
          ...shop,
          owner_email_configured: true,
          owner_email_verified: true,
          email_subscription_reminders_enabled: false,
          email_subscription_reminders_consent_at: null,
        } : shop);
        setOwnerCurrentPin('');
        toast.success('Adresse e-mail vérifiée et enregistrée.');
      } else {
        setOwnerEmailChallenge(data.challenge_id);
        setOwnerEmailCode('');
        setOwnerProfileError('Un code à 8 chiffres a été envoyé à cette adresse. Vérifiez aussi vos courriers indésirables.');
      }
    } catch (error) {
      setOwnerProfileError(error instanceof Error ? error.message : 'Impossible de vérifier cette adresse e-mail.');
    } finally {
      setOwnerEmailVerifying(false);
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
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mt-green-primary)]">{activeSettingsCopy.eyebrow} · Paramètres</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[var(--mt-gray-900)]">{activeSettingsCopy.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{activeSettingsCopy.description}</p>
              </div>
              <div className="flex w-fit shrink-0 flex-wrap gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
                  currentShop.is_open
                    ? 'border-[#d8e9df] bg-[#eff7f1] text-[var(--mt-green-hover)]'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${currentShop.is_open ? 'bg-[var(--mt-green-primary)]' : 'bg-[var(--mt-orange-bright)]'}`} />
                  {currentShop.is_open ? 'Commandes ouvertes' : 'Commandes fermées'}
                </span>
                <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${
                  isPubliclyVisible
                    ? 'border-[#d8e9df] bg-[#eff7f1] text-[var(--mt-green-hover)]'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}>
                  {publicationLabel}
                </span>
              </div>
            </header>
            <p className="-mt-3 px-1 text-xs leading-5 text-slate-500">
              L’état des commandes est indépendant de la publication : une vitrine en brouillon ou non visible n’est pas accessible au public, même si les commandes sont ouvertes.
            </p>

            {settingsSubTab === 'profile' && <section className="flex flex-col gap-4 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="max-w-2xl">
                <h3 className="text-sm font-extrabold text-[var(--mt-gray-900)]">Mes données</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">Téléchargez les données MaTable enregistrées pour cette boutique. Les données conservées directement par des prestataires externes ne sont pas incluses. Pour demander la suppression du compte, contactez l’assistance.</p>
              </div>
              <button type="button" onClick={exportMerchantData} disabled={merchantDataExporting} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#47534b] disabled:opacity-50">
                {merchantDataExporting ? 'Préparation…' : 'Télécharger mes données'}
              </button>
            </section>}

            {currentShop && !currentShop.owner_email_verified && (
              <section role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5">
                {currentShop.admin_mode ? (
                  <>
                    <h3 className="text-sm font-extrabold">Adresse e-mail du commerçant non vérifiée</h3>
                    <p className="mt-1 text-sm leading-6">Le commerçant doit vérifier son adresse depuis sa propre session. Cette action n’est pas disponible en mode super-admin.</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-extrabold">Sécurisez l’accès à votre boutique</h3>
                    <p className="mt-1 text-sm leading-6">Vérifiez une adresse e-mail que vous pouvez consulter. La MFA e-mail sera requise après la période de transition ; sans adresse vérifiée, vous ne pourrez pas terminer la connexion.</p>
                    {settingsSubTab !== 'profile' && <button type="button" onClick={() => state.setSettingsSubTab('profile')} className="mt-2 text-sm font-bold underline underline-offset-2">Ajouter ou vérifier mon adresse</button>}
                  </>
                )}
              </section>
            )}

            {settingsSubTab === 'profile' && (
              <form onSubmit={saveOwnerProfile} className="space-y-5 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div>
                  <h3 className="text-base font-extrabold text-[var(--mt-gray-900)]">Mes coordonnées personnelles</h3>
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
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--mt-green-hover)] focus:ring-2 focus:ring-[var(--mt-green-hover)]/15 disabled:bg-slate-50"
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
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--mt-green-hover)] focus:ring-2 focus:ring-[var(--mt-green-hover)]/15 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-800">
                    E-mail de facturation
                    <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Requis pour la MFA et les reçus. Une adresse ne sera enregistrée qu’après vérification.</span>
                    <input
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={ownerEmail}
                      onChange={(event) => setOwnerEmail(event.target.value)}
                      disabled={ownerEmailLoading || ownerProfileSaving}
                      placeholder="vous@exemple.ci"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--mt-green-hover)] focus:ring-2 focus:ring-[var(--mt-green-hover)]/15 disabled:bg-slate-50"
                    />
                    {ownerEmailVerified && ownerEmail.trim().toLowerCase() === savedOwnerEmail.trim().toLowerCase()
                      ? <span className="mt-1 block text-xs font-semibold text-emerald-800">Adresse vérifiée</span>
                      : <span className="mt-1 block text-xs font-semibold text-amber-800">Adresse à vérifier</span>}
                  </label>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-sm font-bold text-slate-800">Modifier le code PIN</label>
                  <p className="mt-1 text-xs leading-5 text-slate-600">PIN à 6 chiffres utilisé pour accéder à l’espace commerçant. Laissez vide pour le conserver.</p>
                  <div className="relative mt-3">
                    <label className="sr-only" htmlFor="merchant-new-pin">Nouveau code PIN à 6 chiffres</label>
                    <input
                      id="merchant-new-pin"
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
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-12 text-sm font-mono tracking-widest outline-none focus:border-[var(--mt-green-hover)]"
                    />
                    <button type="button" disabled={ownerEmailLoading || ownerProfileSaving} onClick={() => setShowSettingsPin((visible) => !visible)} aria-label={showSettingsPin ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-hover)] disabled:opacity-50">
                      {showSettingsPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                </div>
                <label className="block max-w-md text-sm font-semibold text-slate-800">
                  Code PIN actuel
                  <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Requis pour vérifier l’e-mail ou modifier le code PIN.</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={6}
                    value={ownerCurrentPin}
                    onChange={(event) => setOwnerCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={ownerEmailLoading || ownerProfileSaving}
                    placeholder="PIN actuel à 6 chiffres"
                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono tracking-widest outline-none focus:border-[var(--mt-green-hover)] focus:ring-2 focus:ring-[var(--mt-green-hover)]/15 disabled:bg-slate-50"
                  />
                </label>
                {(!ownerEmailVerified || ownerEmail.trim().toLowerCase() !== savedOwnerEmail.trim().toLowerCase()) && (
                  <div className="max-w-md space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    {ownerEmailChallenge && <label className="block text-sm font-semibold text-slate-800">
                      Code reçu par e-mail
                      <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={ownerEmailCode} onChange={(event) => setOwnerEmailCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-2 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-center font-mono text-lg tracking-[0.3em]" />
                    </label>}
                    <button type="button" disabled={ownerEmailVerifying || ownerEmailLoading || !ownerEmail.trim() || !ownerCurrentPin.trim()} onClick={() => void verifyOwnerEmail(Boolean(ownerEmailChallenge))} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--mt-green-deep)] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
                      {ownerEmailVerifying ? 'Vérification…' : ownerEmailChallenge ? 'Confirmer l’adresse' : 'Envoyer un code de vérification'}
                    </button>
                    {ownerEmailChallenge && <button type="button" disabled={ownerEmailVerifying} onClick={() => void verifyOwnerEmail(false)} className="w-full text-center text-xs font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50">Renvoyer le code</button>}
                  </div>
                )}
                <button type="submit" disabled={ownerEmailLoading || ownerProfileSaving} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--mt-green-primary)] px-5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[var(--mt-green-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
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
              <MerchantVerificationWizard
                shopId={currentShop.id}
                shopName={currentShop.name}
                step={verificationStep}
                onStepChange={setVerificationStep}
                diditStatus={diditStatus}
                diditAvailable={diditAvailable}
                manualIdentityOpen={manualIdentityOpen}
                onToggleManualIdentity={() => setManualIdentityOpen((open) => !open)}
                identityStepDone={identityStepDone}
                manualProgress={manualVerificationProgress}
                onDiditStatusChange={(status) => {
                  setDiditStatus(status.status);
                  setDiditAvailable(status.didit_available ?? null);
                  setCurrentShop((shop) => {
                    if (!shop || status.status === 'not_required') return shop;
                    const identityStatus: NonNullable<Shop['identity_verification_status']> = status.status === 'verified'
                      ? 'approved'
                      : status.status === 'rejected'
                        ? 'action_required'
                        : status.status === 'under_review'
                          ? 'under_review'
                          : 'pending';
                    const normalizedDiditStatus = status.status === 'verified'
                      ? 'verified'
                      : status.status === 'rejected'
                        ? 'rejected'
                        : status.status === 'under_review'
                          ? 'under_review'
                          : status.status === 'submitted'
                            ? 'submitted'
                            : 'pending';
                    return {
                      ...shop,
                      identity_verification_status: identityStatus,
                      ...(status.identity_method === 'didit' || status.session_id
                        ? { merchant_verification_status: normalizedDiditStatus }
                        : {}),
                    };
                  });
                }}
                onManualProgress={receiveManualVerificationProgress}
              />
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
                  <div><span className="text-xs text-slate-500">Capacité du catalogue</span><strong className="mt-1 block text-slate-900">{currentShop.admin_mode ? `${currentShopProductCount} produits · limites ignorées en mode super-admin` : Number.isFinite(currentProductLimit) ? `${currentShopProductCount} / ${currentProductLimit} produits` : `${currentShopProductCount} produits · illimité`}</strong></div>
                  <div><span className="text-xs text-slate-500">Photos par produit</span><strong className="mt-1 block text-slate-900">{currentShop.admin_mode ? `Jusqu’à ${currentPhotoLimit} · mode super-admin` : `Jusqu’à ${currentPhotoLimit}`}</strong></div>
                </div>
                <p className="text-xs leading-5 text-slate-600">Le paiement est ponctuel, sans prélèvement automatique. GeniusPay confirme le règlement au serveur avant toute activation. Le paiement des commandes clients reste directement convenu avec la boutique.</p>
                <WhatsAppSubscriptionReminderConsent shop={currentShop} />
                <EmailSubscriptionReminderConsent shop={currentShop} />
                <div className="flex flex-col gap-3 rounded-xl border border-[#e3d9cc] bg-[var(--mt-gray-50)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">Besoin d’autres fonctionnalités ?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Comparez Standard, Premium et Pro, puis choisissez un paiement mensuel ou annuel.</p>
                  </div>
                  <button type="button" onClick={() => setShowPlanChooser(true)} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-[var(--mt-green-deep)] px-4 text-xs font-bold text-white transition hover:bg-[var(--mt-green-hover)]">Voir les formules</button>
                </div>
              </section>
            ))}

            {settingsSubTab === 'notifications' && currentShop && (
              currentShop.admin_mode
                ? <p role="status" className="max-w-3xl rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">Les notifications propres à l’appareil du commerçant ne peuvent pas être gérées depuis l’accès super-admin.</p>
                : <PushNotificationSettings shop={currentShop} />
            )}
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
                  <span className="rounded-2xl bg-[#d1fae5] p-3 text-[var(--mt-green-primary)]"><Store className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-extrabold text-[var(--mt-gray-900)] text-base">Informations publiques</h3>
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
                    <label htmlFor="merchant-store-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Nom commercial de la boutique *
                    </label>
                    <input
                      id="merchant-store-name"
                      type="text"
                      required
                      maxLength={100}
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-[#ded7cd] bg-[var(--mt-surface)] px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-primary)]/25 focus:border-[var(--mt-green-primary)]"
                    />
                  </div>

                  <div>
                    <label htmlFor="merchant-store-city" className="block text-xs font-bold text-slate-700 mb-1">
                      Ville / Commune
                    </label>
                    <input
                      id="merchant-store-city"
                      type="text"
                      maxLength={100}
                      value={settingsCity}
                      onChange={(e) => setSettingsCity(e.target.value)}
                      placeholder="Ex. : Abidjan"
                      className="min-h-11 w-full rounded-xl border border-[#ded7cd] bg-[var(--mt-surface)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-primary)]/25 focus:border-[var(--mt-green-primary)]"
                    />
                  </div>
                </div>

                {/* Slogan */}
                <div>
                  <label htmlFor="merchant-store-welcome" className="block text-xs font-bold text-slate-700 mb-1">
                    Slogan / Message de bienvenue sur la vitrine
                  </label>
                  <textarea
                    id="merchant-store-welcome"
                    rows={2}
                    maxLength={500}
                    value={settingsWelcome}
                    onChange={(e) => setSettingsWelcome(e.target.value)}
                    placeholder="Ex. : Nuisettes soyeuses et lingerie fine à Abidjan..."
                    className="min-h-24 w-full rounded-xl border border-[#ded7cd] bg-[var(--mt-surface)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-primary)]/25 focus:border-[var(--mt-green-primary)]"
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-500">{settingsWelcome.length}/500</p>
                </div>

                {/* WhatsApp Contact Number */}
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <label htmlFor="merchant-store-whatsapp" className="block text-xs font-bold text-slate-700">
                      Numéro WhatsApp de réception des commandes *
                    </label>
                    <ContextualHelp label="Numéro WhatsApp de réception des commandes">
                      Les clients pourront vous contacter sur ce numéro pour confirmer les détails de leur commande.
                    </ContextualHelp>
                  </div>
                  <input
                    id="merchant-store-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-[#ded7cd] bg-[var(--mt-surface)] px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-primary)]/25 focus:border-[var(--mt-green-primary)]"
                  />
                </div>

                {/* Social links */}
                {canUseSocialLinks ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <label className="block text-xs font-bold text-slate-700">Réseaux sociaux publics · Premium/Pro</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="url" aria-label="Lien Instagram" autoComplete="url" value={settingsSocialLinks.instagram || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, instagram: e.target.value }))} placeholder="Lien Instagram" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--mt-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-hover)]/15" />
                      <input type="url" aria-label="Lien Facebook" autoComplete="url" value={settingsSocialLinks.facebook || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, facebook: e.target.value }))} placeholder="Lien Facebook" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--mt-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-hover)]/15" />
                      <input type="url" aria-label="Lien du site web" autoComplete="url" value={settingsSocialLinks.website || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, website: e.target.value }))} placeholder="Lien du site web" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--mt-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-hover)]/15" />
                      <input type="url" aria-label="Lien WhatsApp" autoComplete="url" value={settingsSocialLinks.whatsapp || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, whatsapp: e.target.value }))} placeholder="Lien WhatsApp" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-[var(--mt-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--mt-green-hover)]/15" />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
                    <p className="text-xs font-bold text-amber-950">Réseaux sociaux publics · Premium/Pro</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Ajoutez les liens de vos réseaux sociaux avec une formule Premium ou Pro.</p>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    className="min-h-11 w-full rounded-xl bg-[var(--mt-green-primary)] px-5 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[var(--mt-green-hover)] sm:w-auto"
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
                        Gestion automatique de la prise de commandes selon vos plages horaires (fuseau GMT / UTC+0 Abidjan). Ce statut ne publie pas la vitrine.
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
                      <span>{currentShop.is_open ? 'Prise de commandes ouverte' : 'Prise de commandes fermée'}</span>
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
                          La prise de commandes est actuellement <strong>{currentShop.is_open ? 'ouverte' : 'fermée'}</strong>. Ce choix manuel reste prioritaire jusqu'à sa réinitialisation.
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
                      Lorsque ce mode est activé, la prise de commandes s’ouvre et se ferme selon le planning. <strong>Quand elle est fermée, les clients ne peuvent plus valider de commandes.</strong>
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
                        <label htmlFor="merchant-opening-time" className="block text-xs font-bold text-slate-700">
                          Heure d'ouverture quotidienne *
                        </label>
                        <input
                          id="merchant-opening-time"
                          type="time"
                          required
                          value={openTime}
                          onChange={(e) => setOpenTime(e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-slate-300 p-2.5 text-base font-mono font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <span className="text-[11px] text-slate-400 block">
                          Heure d'ouverture des prises de commande (ex: 08:00)
                        </span>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <label htmlFor="merchant-closing-time" className="block text-xs font-bold text-slate-700">
                          Heure de fermeture quotidienne *
                        </label>
                        <input
                          id="merchant-closing-time"
                          type="time"
                          required
                          value={closeTime}
                          onChange={(e) => setCloseTime(e.target.value)}
                          className="min-h-11 w-full rounded-xl border border-slate-300 p-2.5 text-base font-mono font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                            className="min-h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
                          >
                            7j/7
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5, 6])}
                            className="min-h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
                          >
                            Lun - Sam
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5])}
                            className="min-h-11 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
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
                              aria-pressed={isSelected}
                              onClick={() => {
                                if (isSelected) {
                                  if (activeDays.length > 1) {
                                    setActiveDays(activeDays.filter(d => d !== day));
                                  }
                                } else {
                                  setActiveDays([...activeDays, day]);
                                }
                              }}
                              className={`min-h-11 rounded-xl border px-2.5 text-xs font-bold transition-all ${
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
                    className="min-h-11 w-full rounded-xl bg-slate-900 px-6 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800 sm:w-auto"
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
