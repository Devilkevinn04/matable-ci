import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, MessageCircleMore, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { ShopCategory } from '../../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { ABIDJAN_COMMUNES } from '../../utils/abidjanCommunes';
import { TRIAL_CATALOG_LIMIT, TRIAL_DURATION_MONTHS, TRIAL_PROMOTION_SLOTS_PER_TIER } from '../../utils/subscriptionFeatures';
import { AuthExperienceLayout, MerchantRegistrationProgress, MerchantShopPreview } from '../AuthExperienceLayout';
import { MerchantState } from './useMerchant';
import { TermsPrivacyConsent } from '../TermsPrivacyConsent';
import { ACQUISITION_SOURCES } from '../../utils/acquisitionSources';
import { ChoiceCards, CodeField, PhoneField, SelectField, TextField } from '../ui/fields';
import { SUBSCRIPTION_PLANS } from '../../utils/subscriptionFeatures';
import { useSubscriptionPrices } from '../../utils/useSubscriptionPrices';
import { formatFCFA } from '../../utils/format';
import { getAmbassadorToken, getStoredAmbassadorCode } from '../../utils/ambassadors';

interface MerchantRegistrationScreenProps {
  state: MerchantState;
  onBackToDirectory: () => void;
}

// Mêmes PIN refusés que côté serveur (isWeakShopPin), signalés avant l’envoi.
const WEAK_PINS = new Set(['000000', '000001', '111222', '123123', '123456', '222222', '999999']);

export const MerchantRegistrationScreen: React.FC<MerchantRegistrationScreenProps> = ({ state, onBackToDirectory }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const { prices } = useSubscriptionPrices();
  const [linkedAmbassadorCode, setLinkedAmbassadorCode] = useState(getStoredAmbassadorCode);
  const {
    regName, setRegName, regCategory, setRegCategory, regCity, setRegCity,
    regSubscriptionTier, setRegSubscriptionTier,
    regCityOther, setRegCityOther, regPhone, setRegPhone, regPin, setRegPin,
    regEmail, setRegEmail, regLoading,
    regAcceptedTermsPrivacy, setRegAcceptedTermsPrivacy,
    regAcquisitionSource, setRegAcquisitionSource,
    regAmbassadorCode, setRegAmbassadorCode,
    handleRegisterShop, setIsRegisterModalOpen,
  } = state;
  useEffect(() => {
    const syncLinkedCode = () => setLinkedAmbassadorCode(getStoredAmbassadorCode());
    syncLinkedCode();
    void getAmbassadorToken().then(syncLinkedCode);
    window.addEventListener('matable-ambassador-referral-updated', syncLinkedCode);
    return () => window.removeEventListener('matable-ambassador-referral-updated', syncLinkedCode);
  }, []);
  const submitStep = (event: React.FormEvent<HTMLFormElement>) => {
    if (step === 2) {
      if (WEAK_PINS.has(regPin)) {
        event.preventDefault();
        return;
      }
      handleRegisterShop(event);
      return;
    }
    event.preventDefault();
    if (formRef.current?.reportValidity()) setStep(2);
  };

  const benefits = [
    { label: '0 % de commission', icon: Store },
    { label: 'Commandes WhatsApp', icon: MessageCircleMore },
    { label: 'Badge Vérifié', icon: ShieldCheck },
  ];

  return (
    <AuthExperienceLayout
      eyebrow="Votre commerce, en ligne"
      motionKey={`merchant-registration-${step}`}
      title="Faites découvrir votre boutique."
      description="Créez votre vitrine locale et recevez les commandes de vos clients directement sur WhatsApp."
      imageAlt="Aperçu dynamique de la vitrine de votre boutique"
      storyCard={<MerchantShopPreview
        name={regName}
        category={getCategoryDefaults(regCategory).label}
        city={regCity === 'Autre ville / commune' ? regCityOther : regCity}
      />}
      topPrompt="Déjà une boutique ?"
      topActionLabel="Se connecter"
      onTopAction={() => setIsRegisterModalOpen(false)}
      onBack={() => {
        setIsRegisterModalOpen(false);
        onBackToDirectory();
      }}
    >
      <div className="mb-5 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#dfe8dd] bg-[#edf3ec] px-2.5 py-1.5 text-xs font-bold text-[var(--mt-green-deep)]">
          <Sparkles className="h-3.5 w-3.5" />
          Espace commerçant
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--mt-orange-deep)]">Étape {step} sur 2</p>
          <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[var(--mt-gray-900)]">{step === 1 ? 'Présentez votre boutique' : 'Créez votre accès'}</h2>
        </div>
        <MerchantRegistrationProgress step={step} />
        <p className="text-sm leading-6 text-[#68756c]">{step === 1
          ? `Choisissez Standard ou Premium. Les ${TRIAL_PROMOTION_SLOTS_PER_TIER} premiers commerçants de chaque formule bénéficient de ${TRIAL_DURATION_MONTHS} mois d’essai gratuit et jusqu’à ${TRIAL_CATALOG_LIMIT} produits. Après attribution des places, le paiement est nécessaire pour activer la boutique.`
          : 'Ces informations permettent à vos clients de vous contacter et vous serviront à retrouver votre espace marchand.'}</p>
        {/* One compact row on phones so the form fields stay near the top of the screen. */}
        {step === 1 && <div className="grid grid-cols-3 gap-2">
          {benefits.map(({ label, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#e7e0d6] bg-[var(--mt-gray-50)] px-1.5 py-2 text-center text-[10px] font-semibold leading-tight text-[#47534b] sm:flex-row sm:gap-2 sm:px-2.5 sm:py-2.5 sm:text-left sm:text-[11px]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9f3ec] text-[var(--mt-green-deep)]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              {label}
            </div>
          ))}
        </div>}
        {step === 1 && <ChoiceCards<'standard' | 'premium'>
          legend="Formule"
          name="merchant-subscription-tier"
          value={regSubscriptionTier}
          onChange={setRegSubscriptionTier}
          options={(['standard', 'premium'] as const).map((tier) => ({
            value: tier,
            label: SUBSCRIPTION_PLANS[tier].label,
            aside: `puis ${formatFCFA(prices?.[tier] ?? SUBSCRIPTION_PLANS[tier].price)}/mois`,
            description: tier === 'standard' ? 'Jusqu’à 20 articles, commandes WhatsApp, QR code' : 'Catalogue illimité, vitrine à vos couleurs, logo et bannière',
          }))}
        />}
      </div>

      <form ref={formRef} onSubmit={submitStep} className="auth-form space-y-4">
        {step === 1 && (
        <div className="space-y-5">
          <TextField label="Nom de la boutique" value={regName} onChange={(event) => setRegName(event.target.value.slice(0, 100))} required maxLength={100} autoComplete="organization" placeholder="Ex. : Atelier Awa" />
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
            <SelectField label="Activité" value={regCategory} onChange={(event) => setRegCategory(event.target.value as ShopCategory)}>
              {SHOP_CATEGORIES.map((category) => <option key={category} value={category}>{getCategoryDefaults(category).label}</option>)}
            </SelectField>
            <SelectField label="Ville ou commune" value={regCity} onChange={(event) => setRegCity(event.target.value)} required>
              <option value="">Choisir…</option>
              <option value="Abidjan">Abidjan</option>
              {ABIDJAN_COMMUNES.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
            </SelectField>
          </div>
          {regCity === 'Autre ville / commune' && <TextField label="Votre ville" value={regCityOther} onChange={(event) => setRegCityOther(event.target.value)} required maxLength={100} placeholder="Ex. : Korhogo" />}
          <SelectField label="Comment avez-vous connu MaTable ?" optional value={regAcquisitionSource} onChange={(event) => setRegAcquisitionSource(event.target.value)}>
            <option value="">Choisir une réponse</option>
            {ACQUISITION_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
          </SelectField>
          {linkedAmbassadorCode ? (
            <p className="rounded-xl bg-[#f7f5f2] px-3 py-2 text-xs leading-5 text-[#647067]">
              Recommandé par l’ambassadeur <strong className="text-[#292d2a]">{linkedAmbassadorCode}</strong>. Ce lien reste prioritaire sur tout code saisi.
            </p>
          ) : (
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-[var(--mt-green-deep)] underline underline-offset-4 [&::-webkit-details-marker]:hidden">J’ai un code ambassadeur</summary>
              <TextField className="mt-2" label="Code ambassadeur" value={regAmbassadorCode} onChange={(event) => setRegAmbassadorCode(event.target.value)} maxLength={24} autoComplete="off" autoCapitalize="characters" hint="Le code attribue votre inscription à l’ambassadeur qui vous l’a donné. Le suivi d’un lien expire au plus tard après 90 jours." />
            </details>
          )}
        </div>
        )}

        {step === 2 && (
        <div className="space-y-5">
          <PhoneField label="Numéro WhatsApp de la boutique" required value={regPhone} onValueChange={setRegPhone} hint="Vos clients vous écriront sur ce numéro ; il sert aussi à vous connecter." />
          <CodeField
            label="Code PIN"
            hint="6 chiffres, à retenir : il protège votre espace commerçant. Évitez 123456 ou 000000."
            length={6}
            secret
            required
            autoComplete="new-password"
            value={regPin}
            onValueChange={setRegPin}
            error={regPin.length === 6 && WEAK_PINS.has(regPin) ? 'Ce code est trop facile à deviner. Choisissez-en un autre.' : undefined}
          />
          <TextField label="Adresse e-mail" type="email" inputMode="email" maxLength={254} value={regEmail} onChange={(event) => setRegEmail(event.target.value.slice(0, 254))} required autoComplete="email" placeholder="vous@exemple.ci" hint="Pour recevoir vos codes de connexion et le suivi de votre abonnement." />
        </div>
        )}

        {step === 2 && (
        <>
        <div className="rounded-[18px] border border-[#dfe8dd] bg-[#edf3ec] px-3 py-3 text-sm leading-6 text-[#426458]">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-deep)]" />
            <span>Votre tableau de bord est accessible dès la création. Pour publier et recevoir des commandes, vous devrez vérifier l’identité du responsable.</span>
          </div>
        </div>
        <TermsPrivacyConsent id="merchant-screen-terms-privacy" checked={regAcceptedTermsPrivacy} onChange={setRegAcceptedTermsPrivacy} />
        </>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {step === 2 && <button type="button" onClick={() => setStep(1)} className="min-h-12 shrink-0 rounded-full border border-[#d5ddd5] bg-white px-5 py-3 text-sm font-bold text-[#47534b] transition hover:bg-[#f7f5f2]">Retour</button>}
          {step === 1 ? (
            <button type="submit" className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.18)] transition hover:bg-[var(--mt-green-hover)]">
              Continuer <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={regLoading} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.24)] transition hover:bg-[var(--mt-green-hover)] disabled:cursor-wait disabled:opacity-60">
              {regLoading ? 'Création en cours…' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </AuthExperienceLayout>
  );
};
