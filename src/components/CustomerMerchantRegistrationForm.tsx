import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, MessageCircleMore, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { ShopCategory } from '../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { ABIDJAN_COMMUNES } from '../utils/abidjanCommunes';
import { TRIAL_CATALOG_LIMIT, TRIAL_DURATION_MONTHS } from '../utils/subscriptionFeatures';
import { TermsPrivacyConsent } from './TermsPrivacyConsent';
import { ACQUISITION_SOURCES, normalizeAcquisitionSource } from '../utils/acquisitionSources';
import { getAnalyticsCampaignFromSearch, getStoredAnalyticsCampaign } from '../utils/analyticsAttribution';
import { hasAnalyticsConsent } from '../utils/cookieConsent';
import { clearAmbassadorReferral, getAmbassadorToken, getStoredAmbassadorCode } from '../utils/ambassadors';
import { MerchantRegistrationProgress, MerchantShopPreview } from './AuthExperienceLayout';

interface CustomerMerchantRegistrationFormProps {
  onCreated: () => void;
  onLogin: () => void;
}

interface ShopRegistrationResponse {
  success: boolean;
  shop?: { id: number; slug: string };
  mfa_required?: boolean;
  challenge_id?: string;
  error?: string;
}

export const CustomerMerchantRegistrationForm: React.FC<CustomerMerchantRegistrationFormProps> = ({ onCreated, onLogin }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ShopCategory>('fashion');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [phone, setPhone] = useState('+225');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [email, setEmail] = useState('');
  const [acceptedTermsPrivacy, setAcceptedTermsPrivacy] = useState(false);
  const [ambassadorCode, setAmbassadorCode] = useState('');
  const [linkedAmbassadorCode, setLinkedAmbassadorCode] = useState(getStoredAmbassadorCode);
  // Campaign from ?src= / utm_source, kept only when the visitor accepted audience analytics.
  const [trackedCampaign] = useState(() => (hasAnalyticsConsent()
    ? getAnalyticsCampaignFromSearch(window.location.search) || getStoredAnalyticsCampaign()
    : null));
  const [acquisitionSource, setAcquisitionSource] = useState(() => normalizeAcquisitionSource(trackedCampaign) || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingMfaChallenge, setPendingMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    const syncLinkedCode = () => setLinkedAmbassadorCode(getStoredAmbassadorCode());
    syncLinkedCode();
    void getAmbassadorToken().then(syncLinkedCode);
    window.addEventListener('matable-ambassador-referral-updated', syncLinkedCode);
    return () => window.removeEventListener('matable-ambassador-referral-updated', syncLinkedCode);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 1) {
      if (formRef.current?.reportValidity()) setStep(2);
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      if (pendingMfaChallenge) {
        const verification = await fetch('/api/auth/merchant-login/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ challenge_id: pendingMfaChallenge, code: mfaCode }),
        });
        const verified = await verification.json() as { error?: string };
        if (!verification.ok) throw new Error(verified.error || 'Code de vérification invalide.');
        clearAmbassadorReferral();
        onCreated();
        return;
      }
      const response = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          whatsapp_number: phone.trim(),
          pin,
          pin_code: pin,
          city: city === 'Autre ville / commune' ? otherCity.trim() : city,
          category,
          email: email.trim(),
          accepted_terms_privacy: acceptedTermsPrivacy,
          acquisition_source: acquisitionSource || null,
          acquisition_campaign: trackedCampaign,
          ambassador_token: await getAmbassadorToken(),
          ambassador_code: ambassadorCode,
          welcome_message: getCategoryDefaults(category).welcomeMessage,
        }),
      });
      const data = await response.json() as ShopRegistrationResponse;
      if (!response.ok) throw new Error(data.error || 'Impossible de créer votre boutique pour le moment.');
      if (data.mfa_required && typeof data.challenge_id === 'string') {
        setPendingMfaChallenge(data.challenge_id);
        setMfaCode('');
        setError('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
        return;
      }
      if (data.success !== true || !data.shop?.id || !data.shop.slug) {
        throw new Error('La création de la boutique n’a pas pu être confirmée. Réessayez.');
      }
      clearAmbassadorReferral();
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Une erreur est survenue lors de la création de votre boutique.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass = 'mt-1.5 min-h-11 w-full rounded-[12px] border border-[#deded5] bg-white px-3 py-2 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10';

  if (pendingMfaChallenge) {
    return (
      <form onSubmit={submit} className="auth-form space-y-4 rounded-[18px] border border-[#d8e4d9] bg-white p-4">
        <div>
          <h3 className="font-display text-xl font-extrabold text-[#292d2a]">Vérifiez votre adresse e-mail</h3>
          <p className="mt-1 text-sm leading-6 text-[#47534b]">Saisissez le code à 8 chiffres envoyé à l’adresse indiquée. Il est à usage unique et valide 10 minutes.</p>
        </div>
        <label className="block text-sm font-semibold text-[#47534b]">
          Code de vérification
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className={`${fieldClass} text-center font-mono text-lg tracking-[0.3em]`} />
        </label>
        {error && <p role="status" className="text-sm font-semibold text-[var(--mt-green-deep)]">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="min-h-11 w-full rounded-xl bg-[var(--mt-green-deep)] px-4 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Vérification…' : 'Vérifier et ouvrir ma boutique'}</button>
        <button type="button" onClick={() => { setPendingMfaChallenge(''); setMfaCode(''); setError(''); }} className="w-full text-center text-xs font-semibold text-[#47534b] underline">Recommencer l’inscription</button>
      </form>
    );
  }

  const benefits = [
    { label: 'Vitrine locale', icon: Store },
    { label: 'Commandes WhatsApp', icon: MessageCircleMore },
    { label: 'Sécurisé', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#dfe8dd] bg-[#edf3ec] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--mt-green-deep)]">
        <Sparkles className="h-3.5 w-3.5" />
        Espace commerçant
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#c2410c]">Étape {step} sur 2</p>
        <h3 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#292d2a]">{step === 1 ? 'Présentons votre boutique' : 'Sécurisons votre accès'}</h3>
        <p className="mt-1 text-sm leading-6 text-[#47534b]">{step === 1
          ? `Créez votre vitrine et recevez les commandes directement sur WhatsApp. ${TRIAL_DURATION_MONTHS} mois d’essai Standard gratuit, jusqu’à ${TRIAL_CATALOG_LIMIT} produits. Vous pouvez aussi payer directement une formule.`
          : 'Votre numéro WhatsApp sera visible pour le contact client. Le PIN protège l’accès à votre espace marchand.'}</p>
      </div>
      <MerchantRegistrationProgress step={step} />
      <div className="grid gap-2 sm:grid-cols-3">
        {benefits.map(({ label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2 rounded-2xl border border-[#e7e0d6] bg-[#FAF8F2] px-2.5 py-2.5 text-[11px] font-semibold text-[#47534b]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9f3ec] text-[var(--mt-green-deep)]">
              <Icon className="h-3.5 w-3.5" />
            </span>
            {label}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[18px] border border-[#d8e4d9] bg-gradient-to-br from-[#0c604a] to-[var(--mt-green-deep)] p-3.5 text-white shadow-[0_10px_28px_rgba(7,63,50,.12)] sm:p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0ba80] text-[var(--mt-green-deep)]"><Store className="h-5 w-5" aria-hidden="true" /></span>
        <MerchantShopPreview name={name} category={getCategoryDefaults(category).label} city={city === 'Autre ville / commune' ? otherCity : city} />
      </div>
      <form ref={formRef} onSubmit={submit} className="auth-form space-y-3">
        {step === 1 && <>
        <div className="rounded-[18px] border border-[#eef0ea] bg-[#f7f5f2] p-3">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#47534b]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeee6] text-[var(--mt-green-deep)]">1</span>
            Informations boutique
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#47534b]">
              Nom de la boutique
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Ex. : Atelier Awa" className={fieldClass} />
            </label>

            <div className="grid gap-3 min-[430px]:grid-cols-2">
              <label className="block text-sm font-semibold text-[#47534b]">
                Activité
                <select value={category} onChange={(event) => setCategory(event.target.value as ShopCategory)} className={fieldClass}>
                  {SHOP_CATEGORIES.map((item) => <option key={item} value={item}>{getCategoryDefaults(item).label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-[#47534b]">
                Ville / commune
                <select value={city} onChange={(event) => setCity(event.target.value)} required className={fieldClass}>
                  <option value="">Choisir une ville ou commune</option>
                  <option value="Abidjan">Abidjan</option>
                  {ABIDJAN_COMMUNES.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                </select>
              </label>
            </div>
            {city === 'Autre ville / commune' && (
              <label className="block text-sm font-semibold text-[#47534b]">
                Votre ville
                <input value={otherCity} onChange={(event) => setOtherCity(event.target.value)} required placeholder="Saisissez votre ville" className={fieldClass} />
              </label>
            )}
            <label className="block text-sm font-semibold text-[#47534b]">
              Comment avez-vous connu MaTable ? <span className="font-normal text-[#77736a]">(facultatif)</span>
              <select value={acquisitionSource} onChange={(event) => setAcquisitionSource(event.target.value)} className={fieldClass}>
                <option value="">Choisir une réponse</option>
                {ACQUISITION_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#47534b]">Code ambassadeur (facultatif)
              <input value={ambassadorCode} onChange={(event) => setAmbassadorCode(event.target.value)} maxLength={24} className={fieldClass} autoComplete="off" />
            </label>
            <p className="text-xs leading-5 text-[#647067]">
              {linkedAmbassadorCode
                ? <>Lien ambassadeur détecté : <strong>{linkedAmbassadorCode}</strong>. C’est ce lien, le premier visité, qui attribuera l’inscription même si vous saisissez un autre code. Il sera effacé de cet appareil après l’inscription réussie.</>
                : 'Un code saisi manuellement attribuera l’inscription au partenaire correspondant.'}
              {' '}L’identifiant du lien expire au plus tard après 90 jours et ce suivi ne dépend pas de votre choix concernant les statistiques d’audience.
            </p>
          </div>
        </div>
        </>}

        {step === 2 && <>
        <div className="rounded-[18px] border border-[#eef0ea] bg-[#f7f5f2] p-3">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#47534b]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeee6] text-[var(--mt-green-deep)]">2</span>
            Accès et sécurité
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#47534b]">
              Numéro WhatsApp
              <input type="tel" inputMode="tel" maxLength={16} value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 16))} required autoComplete="tel" placeholder="+225 07 00 00 00 00" className={fieldClass} />
            </label>

            <div className="grid gap-3 min-[430px]:grid-cols-2">
              <label className="block text-sm font-semibold text-[#47534b]">
                Code PIN (6 chiffres)
                <span className="relative mt-1.5 block">
                  <input type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="new-password" placeholder="Choisissez un PIN" aria-label="Code PIN (6 chiffres)" className={`${fieldClass} mt-0 pr-12`} />
                  <button type="button" onClick={() => setShowPin((visible) => !visible)} aria-label={showPin ? 'Masquer le PIN' : 'Afficher le PIN'} aria-pressed={showPin} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#647067] transition hover:bg-[#f3f1eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]">{showPin ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button>
                </span>
              </label>
              <label className="block text-sm font-semibold text-[#47534b]">
                E-mail
                <input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required autoComplete="email" placeholder="vous@exemple.ci" className={fieldClass} />
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-[18px] border border-[#dfe8dd] bg-[#edf3ec] px-3 py-3 text-sm leading-6 text-[#426458]">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-deep)]" />
            <span>Votre vitrine publique sera activée après la vérification de votre identité.</span>
          </div>
        </div>
        <TermsPrivacyConsent id="merchant-registration-terms-privacy" checked={acceptedTermsPrivacy} onChange={setAcceptedTermsPrivacy} />
        </>}
        {error && <p role="alert" className="rounded-xl border border-[#F97316]/30 bg-[#fff0e8] px-3 py-2.5 text-sm font-semibold text-[#a33e24]">{error}</p>}
        <div className="flex gap-2">
          {step === 2 && <button type="button" onClick={() => setStep(1)} className="min-h-12 flex-1 rounded-full border border-[#d5ddd5] bg-white px-4 py-3 text-sm font-bold text-[#47534b] transition hover:bg-[#f7f5f2]">Retour</button>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.24)] transition hover:bg-[var(--mt-green-primary)] disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? 'Création en cours…' : step === 1 ? 'Continuer' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
      <button type="button" onClick={onLogin} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 py-2 text-sm font-bold text-[var(--mt-green-deep)] hover:text-[#c2410c]">
        <Store className="h-4 w-4" aria-hidden="true" /> Déjà commerçant ? Se connecter
      </button>
    </div>
  );
};
