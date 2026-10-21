import React, { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, MessageCircleMore, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { ShopCategory } from '../../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { ABIDJAN_COMMUNES } from '../../utils/abidjanCommunes';
import { TRIAL_CATALOG_LIMIT, TRIAL_DURATION_DAYS } from '../../utils/subscriptionFeatures';
import { AuthExperienceLayout } from '../AuthExperienceLayout';
import { MerchantState } from './useMerchant';
import { TermsPrivacyConsent } from '../TermsPrivacyConsent';

interface MerchantRegistrationScreenProps {
  state: MerchantState;
  onBackToDirectory: () => void;
}

export const MerchantRegistrationScreen: React.FC<MerchantRegistrationScreenProps> = ({ state, onBackToDirectory }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const {
    regName, setRegName, regCategory, setRegCategory, regCity, setRegCity,
    regCityOther, setRegCityOther, regPhone, setRegPhone, regPin, setRegPin,
    showRegPin, setShowRegPin, regEmail, setRegEmail, regLoading,
    regAcceptedTermsPrivacy, setRegAcceptedTermsPrivacy,
    handleRegisterShop, setIsRegisterModalOpen,
  } = state;

  const benefits = [
    { label: 'Vitrine locale', icon: Store },
    { label: 'Commandes WhatsApp', icon: MessageCircleMore },
    { label: 'Sécurisé', icon: ShieldCheck },
  ];

  return (
    <AuthExperienceLayout
      eyebrow="Votre commerce, en ligne"
      title="Faites découvrir votre boutique."
      description="Créez votre vitrine locale et recevez les commandes de vos clients directement sur WhatsApp."
      imageAlt="Une entrepreneure souriante pour représenter les commerces locaux"
      topPrompt="Déjà une boutique ?"
      topActionLabel="Se connecter"
      onTopAction={() => setIsRegisterModalOpen(false)}
      onBack={() => {
        setIsRegisterModalOpen(false);
        onBackToDirectory();
      }}
    >
      <div className="mb-5 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#dfe8dd] bg-[#edf3ec] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f4d3d]">
          <Sparkles className="h-3.5 w-3.5" />
          Espace commerçant
        </div>
        <div>
          <p className="text-sm font-bold text-[#e6572b]">Étape {step} sur 2</p>
          <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">{step === 1 ? 'Présentez votre boutique' : 'Créez votre accès'}</h2>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#e9e5dc]" role="progressbar" aria-label="Progression de l’inscription" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step}>
          <div className={`h-full rounded-full bg-[#176b55] transition-all ${step === 1 ? 'w-1/2' : 'w-full'}`} />
        </div>
        <p className="text-sm leading-6 text-[#68756c]">{step === 1
          ? `Créez votre vitrine locale en deux étapes. Vous bénéficiez de ${TRIAL_DURATION_DAYS} jours d’essai Standard gratuit à la création, avec jusqu’à ${TRIAL_CATALOG_LIMIT} produits.`
          : 'Ces informations permettent à vos clients de vous contacter et vous serviront à retrouver votre espace marchand.'}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {benefits.map(({ label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 rounded-2xl border border-[#e7e0d6] bg-[#f7f3ee] px-2.5 py-2.5 text-[11px] font-semibold text-[#34463d]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e9f3ec] text-[#0f4d3d]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>

      <form ref={formRef} onSubmit={handleRegisterShop} className="space-y-4">
        {step === 1 && (
        <div className="rounded-[18px] border border-[#eef0ea] bg-[#f7f5f2] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#52635b]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeee6] text-[#0f4d3d]">1</span>
            Informations boutique
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#34463d]">
              Nom de la boutique
              <input type="text" value={regName} onChange={(event) => setRegName(event.target.value)} required autoComplete="organization" placeholder="Ex. : Atelier Awa" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <label className="block text-sm font-semibold text-[#34463d]">
                Activité
                <select value={regCategory} onChange={(event) => setRegCategory(event.target.value as ShopCategory)} className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-3 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]">
                  {SHOP_CATEGORIES.map((category) => <option key={category} value={category}>{getCategoryDefaults(category).icon} {getCategoryDefaults(category).label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-[#34463d]">
                Ville / commune
                <select value={regCity} onChange={(event) => setRegCity(event.target.value)} required className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-3 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]">
                  <option value="Abidjan">Abidjan</option>
                  {ABIDJAN_COMMUNES.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                </select>
              </label>
            </div>
            {regCity === 'Autre ville / commune' && <label className="block text-sm font-semibold text-[#34463d]">Votre ville<input value={regCityOther} onChange={(event) => setRegCityOther(event.target.value)} required placeholder="Saisissez votre ville" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" /></label>}
          </div>
        </div>
        )}

        {step === 2 && (
        <div className="rounded-[18px] border border-[#eef0ea] bg-[#f7f5f2] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#52635b]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dfeee6] text-[#0f4d3d]">2</span>
            Accès et sécurité
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#34463d]">
              Numéro WhatsApp
              <input type="tel" inputMode="tel" value={regPhone} onChange={(event) => setRegPhone(event.target.value)} required autoComplete="tel" placeholder="+225 07 00 00 00 00" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <label className="block text-sm font-semibold text-[#34463d]">
                Code PIN (6 chiffres)
                <div className="relative">
                  <input type={showRegPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={regPin} onChange={(event) => setRegPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="new-password" placeholder="6 chiffres" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 pr-14 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
                  <button type="button" onClick={() => setShowRegPin((visible) => !visible)} className="absolute right-2 top-[calc(50%+3px)] -translate-y-1/2 rounded-full px-2 py-1 text-xs font-bold text-[#176b55]">{showRegPin ? 'Masquer' : 'Afficher'}</button>
                </div>
              </label>
              <label className="block text-sm font-semibold text-[#34463d]">
                E-mail
                <input type="email" value={regEmail} onChange={(event) => setRegEmail(event.target.value)} required autoComplete="email" placeholder="vous@exemple.ci" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
              </label>
            </div>
          </div>
        </div>
        )}

        {step === 2 && (
        <>
        <div className="rounded-[18px] border border-[#dfe8dd] bg-[#edf3ec] px-3 py-3 text-sm leading-6 text-[#426458]">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f4d3d]" />
            <span>Votre tableau de bord est accessible dès la création. Pour publier et recevoir des commandes, vous devrez vérifier l’identité du responsable.</span>
          </div>
        </div>
        <TermsPrivacyConsent id="merchant-screen-terms-privacy" checked={regAcceptedTermsPrivacy} onChange={setRegAcceptedTermsPrivacy} />
        </>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {step === 2 && <button type="button" onClick={() => setStep(1)} className="min-h-12 flex-1 rounded-full border border-[#d5ddd5] bg-white px-5 py-3 text-sm font-bold text-[#34463d] transition hover:bg-[#f7f5f2]">Retour</button>}
          {step === 1 ? (
            <button type="button" onClick={() => {
              if (formRef.current?.reportValidity()) setStep(2);
            }} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.18)] transition hover:bg-[#176b55]">
              Continuer <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={regLoading} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(15,77,61,0.24)] transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
              {regLoading ? 'Création en cours…' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </AuthExperienceLayout>
  );
};
