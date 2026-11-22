import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2,   Store } from 'lucide-react';
import { ShopCategory } from '../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { ABIDJAN_COMMUNES } from '../utils/abidjanCommunes';
import { REGISTRATION_TIER_HIGHLIGHTS, SUBSCRIPTION_PLANS, TRIAL_DURATION_MONTHS, TRIAL_PROMOTION_SLOTS_PER_TIER, type SubscriptionTier } from '../utils/subscriptionFeatures';
import { useSubscriptionPrices } from '../utils/useSubscriptionPrices';
import { formatFCFA } from '../utils/format';
import { TermsPrivacyConsent } from './TermsPrivacyConsent';
import { ACQUISITION_SOURCES, normalizeAcquisitionSource } from '../utils/acquisitionSources';
import { getAnalyticsCampaignFromSearch, getStoredAnalyticsCampaign } from '../utils/analyticsAttribution';
import { hasAnalyticsConsent } from '../utils/cookieConsent';
import { clearAmbassadorReferral, getAmbassadorToken, getStoredAmbassadorCode } from '../utils/ambassadors';
import { MerchantShopPreview } from './AuthExperienceLayout';
import { ChoiceCards, CodeField, PhoneField, SelectField, TextField } from './ui/fields';

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

// Mêmes PIN refusés que côté serveur (isWeakShopPin), signalés avant l’envoi.
const WEAK_PINS = new Set(['000000', '000001', '111222', '123123', '123456', '222222', '999999']);

export const CustomerMerchantRegistrationForm: React.FC<CustomerMerchantRegistrationFormProps> = ({ onCreated, onLogin }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ShopCategory>('fashion');
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>('standard');
  const [city, setCity] = useState('');
  const [otherCity, setOtherCity] = useState('');
  const [phone, setPhone] = useState('+225');
  const [pin, setPin] = useState('');
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
  const { prices } = useSubscriptionPrices();

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
    if (!pendingMfaChallenge && WEAK_PINS.has(pin)) {
      document.querySelector<HTMLInputElement>('input[autocomplete="new-password"]')?.focus();
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
          subscription_tier: subscriptionTier,
          email: email.trim(),
          accepted_terms_privacy: acceptedTermsPrivacy,
          acquisition_source: acquisitionSource || null,
          acquisition_campaign: trackedCampaign,
          ambassador_token: await getAmbassadorToken(),
          ambassador_code: getStoredAmbassadorCode() || ambassadorCode,
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

  if (pendingMfaChallenge) {
    return (
      <form onSubmit={submit} className="auth-form space-y-4 rounded-[18px] border border-[#d8e4d9] bg-white p-4">
        <div>
          <h3 className="font-display text-xl font-extrabold text-[#292d2a]">Vérifiez votre adresse e-mail</h3>
          <p className="mt-1 text-sm leading-6 text-[#47534b]">Saisissez le code à 8 chiffres envoyé à l’adresse indiquée. Il est à usage unique et valide 10 minutes.</p>
        </div>
        <CodeField label="Code de vérification" length={8} required autoFocus value={mfaCode} onValueChange={setMfaCode} />
        {error && <p role="status" className="text-sm font-semibold text-[var(--mt-green-deep)]">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="min-h-12 w-full rounded-full bg-[var(--mt-green-deep)] px-4 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Vérification…' : 'Vérifier et ouvrir ma boutique'}</button>
        <button type="button" onClick={() => { setPendingMfaChallenge(''); setMfaCode(''); setError(''); }} className="w-full text-center text-xs font-semibold text-[#47534b] underline">Recommencer l’inscription</button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-1.5 flex-1 rounded-full bg-[var(--mt-green-primary)]" />
          <span className={`h-1.5 flex-1 rounded-full transition-colors ${step === 2 ? 'bg-[var(--mt-green-primary)]' : 'bg-[#e3ddd2]'}`} />
        </div>
        <p className="mt-3 text-xs font-semibold text-[#68756c]">Étape {step} sur 2</p>
        <h3 className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-[#292d2a]">{step === 1 ? 'Votre boutique' : 'Votre accès'}</h3>
        <p className="mt-1 text-sm leading-6 text-[#47534b]">{step === 1
          ? `${TRIAL_DURATION_MONTHS} mois gratuits, sans paiement, pour les ${TRIAL_PROMOTION_SLOTS_PER_TIER} premières boutiques Standard et les ${TRIAL_PROMOTION_SLOTS_PER_TIER} premières Premium. Pro est payante dès l’activation.`
          : 'Vos clients vous contacteront sur ce numéro WhatsApp. Le PIN protège votre espace commerçant.'}</p>
      </div>
      <form ref={formRef} onSubmit={submit} className="auth-form space-y-3">
        {step === 1 && <>
        <div className="space-y-5">
            <TextField label="Nom de la boutique" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Ex. : Atelier Awa" invalidMessage="Le nom doit contenir au moins 2 caractères." />

            <ChoiceCards<SubscriptionTier>
              legend="Formule"
              name="customer-merchant-subscription-tier"
              value={subscriptionTier}
              onChange={setSubscriptionTier}
              options={(['standard', 'premium', 'pro'] as const).map((tier) => ({
                value: tier,
                label: SUBSCRIPTION_PLANS[tier].label,
                aside: `${tier === 'pro' ? '' : 'puis '}${formatFCFA(prices?.[tier] ?? SUBSCRIPTION_PLANS[tier].price)}/mois`,
                description: REGISTRATION_TIER_HIGHLIGHTS[tier],
              }))}
            />

            <div className="grid gap-5 min-[430px]:grid-cols-2 min-[430px]:gap-3">
              <SelectField label="Activité" value={category} onChange={(event) => setCategory(event.target.value as ShopCategory)}>
                {SHOP_CATEGORIES.map((item) => <option key={item} value={item}>{getCategoryDefaults(item).label}</option>)}
              </SelectField>
              <SelectField label="Ville ou commune" value={city} onChange={(event) => setCity(event.target.value)} required>
                <option value="">Choisir…</option>
                <option value="Abidjan">Abidjan</option>
                {ABIDJAN_COMMUNES.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
              </SelectField>
            </div>
            {city === 'Autre ville / commune' && (
              <TextField label="Votre ville" value={otherCity} onChange={(event) => setOtherCity(event.target.value)} required placeholder="Ex. : Korhogo" />
            )}
            <SelectField label="Comment avez-vous connu MaTable ?" optional value={acquisitionSource} onChange={(event) => setAcquisitionSource(event.target.value)}>
              <option value="">Choisir une réponse</option>
              {ACQUISITION_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
            </SelectField>
            {linkedAmbassadorCode ? (
              <p className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#647067]">
                Recommandé par l’ambassadeur <strong className="text-[#292d2a]">{linkedAmbassadorCode}</strong>. Ce lien reste prioritaire sur tout code saisi.
              </p>
            ) : (
              <details className="group">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-[var(--mt-green-deep)] underline underline-offset-4 [&::-webkit-details-marker]:hidden">J’ai un code ambassadeur</summary>
                <TextField className="mt-2" label="Code ambassadeur" value={ambassadorCode} onChange={(event) => setAmbassadorCode(event.target.value)} maxLength={24} autoComplete="off" autoCapitalize="characters" hint="Le code attribue votre inscription à l’ambassadeur qui vous l’a donné. Le suivi d’un lien expire au plus tard après 90 jours." />
              </details>
            )}
        </div>
        </>}

        {step === 2 && <>
        <div className="space-y-5">
          <PhoneField label="Numéro WhatsApp de la boutique" required value={phone} onValueChange={setPhone} hint="Vos clients vous écriront sur ce numéro." />
          <CodeField
            label="Code PIN"
            hint="6 chiffres, à retenir : il protège votre espace commerçant. Évitez 123456 ou 000000."
            length={6}
            secret
            required
            autoComplete="new-password"
            value={pin}
            onValueChange={setPin}
            error={pin.length === 6 && WEAK_PINS.has(pin) ? 'Ce code est trop facile à deviner. Choisissez-en un autre.' : undefined}
          />
          <TextField label="Adresse e-mail" type="email" inputMode="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required autoComplete="email" placeholder="vous@exemple.ci" hint="Pour recevoir vos codes de connexion et le suivi de votre abonnement." />
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
          {step === 2 && <button type="button" onClick={() => setStep(1)} className="min-h-12 shrink-0 rounded-full border border-[#d5ddd5] bg-white px-4 py-3 text-sm font-bold text-[#47534b] transition hover:bg-[#f7f5f2]">Retour</button>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.24)] transition hover:bg-[var(--mt-green-primary)] disabled:cursor-wait disabled:opacity-60">
            {isSubmitting ? 'Création en cours…' : step === 1 ? 'Continuer' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
      <button type="button" onClick={onLogin} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 py-2 text-sm font-bold text-[var(--mt-green-deep)] hover:text-[#c2410c]">
        <Store className="h-4 w-4" aria-hidden="true" /> Déjà commerçant ? Se connecter
      </button>
      <div className="hidden items-center gap-3 rounded-[18px] border border-[#d8e4d9] bg-gradient-to-br sm:flex from-[#0c604a] to-[var(--mt-green-deep)] p-3.5 text-white shadow-[0_10px_28px_rgba(7,63,50,.12)] sm:p-4">
        <MerchantShopPreview name={name} category={getCategoryDefaults(category).label} city={city === 'Autre ville / commune' ? otherCity : city} />
      </div>
    </div>
  );
};
