import React, { useEffect, useState } from 'react';
import { Store, Clock, Check, Send,   TrendingUp, AlertTriangle, Copy, RotateCcw, Calendar } from 'lucide-react';
import type { Shop } from '../../types';
import { MerchantState } from './useMerchant';
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
import { CodeField, PhoneField, TextAreaField, TextField } from '../ui/fields';
import { StickyActionBar, SubmitButton, useSubmitting } from '../ui/FormActions';

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
    currentShop, products, setCurrentShop, settingsSubTab, settingsName, setSettingsName, settingsWelcome, setSettingsWelcome, settingsPhone, setSettingsPhone, settingsCity, setSettingsCity, settingsNewPin, setSettingsNewPin,
    settingsSocialLinks, setSettingsSocialLinks,
    hoursEnabled, setHoursEnabled, openTime, setOpenTime, closeTime, setCloseTime, activeDays, setActiveDays,
    manualOverride, cronResult, copiedBilan, setCopiedBilan,
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

  const generalSubmit = useSubmitting();
  const hoursSubmit = useSubmitting();

  return (
    <>
{/* TAB 4: SETTINGS & THEMES */}

          <div className="max-w-5xl space-y-5">
            {/* Sur mobile : titre seul. L’état des commandes figure déjà dans l’en-tête de l’espace commerçant. */}
            <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-center sm:justify-between sm:rounded-3xl sm:border sm:border-[#e7dfd3] sm:bg-white sm:p-6">
              <div>
                <p className="hidden text-xs font-bold text-[var(--mt-green-primary)] sm:block">{activeSettingsCopy.eyebrow} · Paramètres</p>
                <h2 className="text-xl font-black tracking-tight text-[var(--mt-gray-900)] sm:mt-1 sm:text-2xl">{activeSettingsCopy.title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{activeSettingsCopy.description}</p>
              </div>
              <div className="hidden w-fit shrink-0 flex-wrap gap-2 sm:flex">
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
            <p className={`-mt-3 px-1 text-xs leading-5 text-slate-500 ${settingsSubTab === 'hours' || settingsSubTab === 'visibility' ? '' : 'max-sm:hidden'}`}>
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

            {currentShop && !currentShop.owner_email_verified && settingsSubTab !== 'profile' && !currentShop.admin_mode && (
              <button type="button" onClick={() => state.setSettingsSubTab('profile')} className="flex min-h-12 w-full items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 text-left text-sm font-semibold text-amber-950 sm:hidden">
                <span className="min-w-0 flex-1">Vérifiez votre e-mail pour sécuriser l’accès</span>
                <span aria-hidden="true">›</span>
              </button>
            )}
            {currentShop && !currentShop.owner_email_verified && (
              <section role="status" className={`rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5 ${settingsSubTab === 'profile' || currentShop.admin_mode ? '' : 'max-sm:hidden'}`}>
                {currentShop.admin_mode ? (
                  <>
                    <h3 className="text-sm font-extrabold">Adresse e-mail du commerçant non vérifiée</h3>
                    <p className="mt-1 text-sm leading-6">Le commerçant doit vérifier son adresse depuis sa propre session. Cette action n’est pas disponible en mode super-admin.</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-extrabold">Sécurisez l’accès à votre boutique</h3>
                    <p className="mt-1 text-sm leading-6">Vérifiez une adresse e-mail que vous pouvez consulter. Bientôt, un code envoyé par e-mail sera demandé à chaque connexion : sans adresse vérifiée, vous ne pourrez plus vous connecter.</p>
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
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-4">
                  <TextField label="Nom complet" autoComplete="name" maxLength={100} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} disabled={ownerEmailLoading || ownerProfileSaving} placeholder="Votre prénom et nom" />
                  <PhoneField label="Téléphone personnel" optional value={ownerPhone} onValueChange={setOwnerPhone} disabled={ownerEmailLoading || ownerProfileSaving} hint="Ne change ni le WhatsApp de la vitrine ni votre identifiant de connexion." />
                  <TextField
                    label="Adresse e-mail"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={254}
                    value={ownerEmail}
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    disabled={ownerEmailLoading || ownerProfileSaving}
                    placeholder="vous@exemple.ci"
                    hint={ownerEmailVerified && ownerEmail.trim().toLowerCase() === savedOwnerEmail.trim().toLowerCase()
                      ? '✓ Adresse vérifiée. Elle reçoit vos codes de connexion et vos reçus.'
                      : 'À vérifier : elle recevra vos codes de connexion et vos reçus.'}
                  />
                  <CodeField label="Nouveau code PIN" optional length={6} secret autoComplete="new-password" value={settingsNewPin} onValueChange={setSettingsNewPin} disabled={ownerEmailLoading || ownerProfileSaving} hint="Laissez vide pour garder votre code actuel." />
                </div>
                <CodeField className="max-w-md" label="Code PIN actuel" length={6} secret autoComplete="current-password" value={ownerCurrentPin} onValueChange={setOwnerCurrentPin} disabled={ownerEmailLoading || ownerProfileSaving} hint="Demandé pour vérifier l’e-mail ou changer de code PIN." />
                                {(!ownerEmailVerified || ownerEmail.trim().toLowerCase() !== savedOwnerEmail.trim().toLowerCase()) && (
                  <div className="max-w-md space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    {ownerEmailChallenge && <CodeField label="Code reçu par e-mail" length={8} autoFocus value={ownerEmailCode} onValueChange={setOwnerEmailCode} />}
                    <button type="button" disabled={ownerEmailVerifying || ownerEmailLoading || !ownerEmail.trim() || !ownerCurrentPin.trim()} onClick={() => void verifyOwnerEmail(Boolean(ownerEmailChallenge))} className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--mt-green-deep)] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50">
                      {ownerEmailVerifying ? 'Vérification…' : ownerEmailChallenge ? 'Confirmer l’adresse' : 'Envoyer un code de vérification'}
                    </button>
                    {ownerEmailChallenge && <button type="button" disabled={ownerEmailVerifying} onClick={() => void verifyOwnerEmail(false)} className="w-full text-center text-xs font-semibold text-slate-700 underline underline-offset-2 disabled:opacity-50">Renvoyer le code</button>}
                  </div>
                )}
                <StickyActionBar aboveNav>
                  <SubmitButton label="Enregistrer le profil" doneLabel="Profil enregistré" pending={ownerProfileSaving} disabled={ownerEmailLoading} />
                </StickyActionBar>
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">Formule</span><strong className="mt-1 block capitalize text-slate-900">{currentShop.subscription?.plan || 'Standard'}</strong></div>
                  <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-500">État</span><strong className="mt-1 block text-slate-900">{subscriptionStatusLabel}</strong></div>
                  <div className="col-span-2 rounded-xl bg-slate-50 p-3 sm:col-span-1"><span className="text-xs text-slate-500">{subscriptionStatus === 'active' ? 'Échéance' : subscriptionStatus === 'trialing' ? 'Fin de l’essai' : 'Prochaine échéance'}</span><strong className="mt-1 block text-slate-900">{(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(currentShop.subscription?.expiresAt || currentShop.subscription?.trialEnd || '')) : 'Non démarré'}</strong></div>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#e7dfd3] bg-[#fffdf8] p-3 sm:p-4">
                  <div><span className="text-xs text-slate-500">Capacité du catalogue</span><strong className="mt-1 block text-slate-900">{currentShop.admin_mode ? `${currentShopProductCount} produits · limites ignorées en mode super-admin` : Number.isFinite(currentProductLimit) ? `${currentShopProductCount} / ${currentProductLimit} produits` : `${currentShopProductCount} produits · illimité`}</strong></div>
                  <div><span className="text-xs text-slate-500">Photos par produit</span><strong className="mt-1 block text-slate-900">{currentShop.admin_mode ? `Jusqu’à ${currentPhotoLimit} · mode super-admin` : `Jusqu’à ${currentPhotoLimit}`}</strong></div>
                </div>
                <p className="text-xs leading-5 text-slate-600">Le paiement de l’abonnement est ponctuel, sans prélèvement automatique : votre formule s’active dès que le paiement est confirmé. Les commandes de vos clients se règlent toujours directement avec vous.</p>
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
              <form onSubmit={generalSubmit.wrap(handleSaveGeneralSettings)} className="space-y-5 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center gap-3 border-b border-[#eee8df] pb-4">
                  <span className="rounded-2xl bg-[#d1fae5] p-3 text-[var(--mt-green-primary)]"><Store className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-extrabold text-[var(--mt-gray-900)] text-base">Informations publiques</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Les détails que vos clients retrouvent sur votre vitrine.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
                  <TextField id="merchant-store-name" label="Nom de la boutique" required maxLength={100} value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                  <TextField id="merchant-store-city" label="Ville ou commune" maxLength={100} value={settingsCity} onChange={(e) => setSettingsCity(e.target.value)} placeholder="Ex. : Cocody" optional />
                </div>

                <TextAreaField id="merchant-store-welcome" label="Message de bienvenue" optional rows={3} maxLength={500} value={settingsWelcome} onChange={(e) => setSettingsWelcome(e.target.value)} placeholder="Ex. : Nos plats du jour, préparés à la commande à Cocody." hint="Affiché sous le nom de votre boutique, en haut de la vitrine." />

                {/* WhatsApp Contact Number */}                {/* WhatsApp Contact Number */}
                <PhoneField id="merchant-store-whatsapp" label="Numéro WhatsApp des commandes" required value={settingsPhone} onValueChange={setSettingsPhone} hint="Vos clients vous écrivent sur ce numéro pour confirmer leur commande." />

                {/* Social links */}
                {canUseSocialLinks ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <p className="text-sm font-bold text-slate-800">Réseaux sociaux</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <TextField label="Instagram" type="url" inputMode="url" autoComplete="url" value={settingsSocialLinks.instagram || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, instagram: e.target.value }))} placeholder="https://instagram.com/…" invalidMessage="Saisissez un lien complet, commençant par https://" />
                      <TextField label="Facebook" type="url" inputMode="url" autoComplete="url" value={settingsSocialLinks.facebook || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, facebook: e.target.value }))} placeholder="https://facebook.com/…" invalidMessage="Saisissez un lien complet, commençant par https://" />
                      <TextField label="Site web" type="url" inputMode="url" autoComplete="url" value={settingsSocialLinks.website || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, website: e.target.value }))} placeholder="https://…" invalidMessage="Saisissez un lien complet, commençant par https://" />
                      <TextField label="Lien WhatsApp" type="url" inputMode="url" autoComplete="url" value={settingsSocialLinks.whatsapp || ''} onChange={(e) => setSettingsSocialLinks((prev) => ({ ...prev, whatsapp: e.target.value }))} placeholder="https://wa.me/…" invalidMessage="Saisissez un lien complet, commençant par https://" />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
                    <p className="text-xs font-bold text-amber-950">Réseaux sociaux publics · Premium/Pro</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Ajoutez les liens de vos réseaux sociaux avec une formule Premium ou Pro.</p>
                  </div>
                )}

                <StickyActionBar aboveNav>
                  <SubmitButton label="Enregistrer les coordonnées" doneLabel="Coordonnées enregistrées" pending={generalSubmit.pending} done={generalSubmit.done} />
                </StickyActionBar>
              </form>
            )}

            {/* Sub-Tab 3: OPENING HOURS & AUTOMATION */}
            {settingsSubTab === 'hours' && (
              <form onSubmit={hoursSubmit.wrap(handleSaveOpeningHours)} className="space-y-6 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-emerald-50 text-[var(--mt-green-deep)] shrink-0">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Ouverture automatique des commandes
                      </h3>
                      <p className="text-xs text-slate-500">
                        Les commandes s’ouvrent et se ferment seules selon vos horaires (heure d’Abidjan). Votre vitrine reste visible dans tous les cas.
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

                <StickyActionBar aboveNav>
                  <SubmitButton label="Enregistrer les horaires" doneLabel="Horaires enregistrés" pending={hoursSubmit.pending} done={hoursSubmit.done} />
                </StickyActionBar>
              </form>
            )}

            {/* Sub-Tab 4: FLASH BILAN 20H */}
            {settingsSubTab === 'bilan' && (
              <div className="space-y-6 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-emerald-50 text-[var(--mt-green-deep)] shrink-0">
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
                        <span>{copiedBilan ? 'Texte copié' : 'Copier le texte'}</span>
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
                      <TrendingUp className="w-4 h-4 text-[var(--mt-green-primary)]" />
                      <span>Top des articles les plus vendus aujourd'hui :</span>
                    </h4>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
                      {flashBilan.top_selling_products.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black text-[10px] flex items-center justify-center">
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
