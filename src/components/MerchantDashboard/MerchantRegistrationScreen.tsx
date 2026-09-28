import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ShopCategory } from '../../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { AuthExperienceLayout } from '../AuthExperienceLayout';
import { MerchantState } from './useMerchant';

interface MerchantRegistrationScreenProps {
  state: MerchantState;
  onBackToDirectory: () => void;
}

const communes = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody',
  'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville',
  'Yopougon', 'Autre ville / commune',
];

export const MerchantRegistrationScreen: React.FC<MerchantRegistrationScreenProps> = ({ state, onBackToDirectory }) => {
  const {
    regName, setRegName, regCategory, setRegCategory, regCity, setRegCity,
    regCityOther, setRegCityOther, regPhone, setRegPhone, regPin, setRegPin,
    showRegPin, setShowRegPin, regEmail, setRegEmail, regLoading,
    handleRegisterShop, setIsRegisterModalOpen,
  } = state;

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
      <div className="mb-5">
        <p className="text-sm font-bold text-[#e6572b]">Espace commerçant</p>
        <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">Créer ma boutique</h2>
        <p className="mt-2 text-sm leading-6 text-[#68756c]">Votre vitrine et vos outils de gestion sont gratuits.</p>
      </div>

      <form onSubmit={handleRegisterShop} className="space-y-4">
        <label className="block text-sm font-semibold text-[#34463d]">
          Nom de la boutique
          <input type="text" value={regName} onChange={(event) => setRegName(event.target.value)} required autoComplete="organization" placeholder="Ex. : Atelier Awa" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
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
              {communes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
            </select>
          </label>
        </div>
        {regCity === 'Autre ville / commune' && <label className="block text-sm font-semibold text-[#34463d]">Votre ville<input value={regCityOther} onChange={(event) => setRegCityOther(event.target.value)} required placeholder="Saisissez votre ville" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" /></label>}

        <label className="block text-sm font-semibold text-[#34463d]">
          Numéro WhatsApp
          <input type="tel" inputMode="tel" value={regPhone} onChange={(event) => setRegPhone(event.target.value)} required autoComplete="tel" placeholder="+225 07 00 00 00 00" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-[#34463d]">
            Code PIN (6 chiffres)
            <div className="relative">
              <input type={showRegPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={regPin} onChange={(event) => setRegPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="new-password" placeholder="6 chiffres" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 pr-14 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
              <button type="button" onClick={() => setShowRegPin((visible) => !visible)} className="absolute right-2 top-[calc(50%+3px)] -translate-y-1/2 rounded-full px-2 py-1 text-xs font-bold text-[#176b55]">{showRegPin ? 'Masquer' : 'Afficher'}</button>
            </div>
          </label>
          <label className="block text-sm font-semibold text-[#34463d]">
            E-mail <span className="font-normal text-[#879087]">(facultatif)</span>
            <input type="email" value={regEmail} onChange={(event) => setRegEmail(event.target.value)} autoComplete="email" placeholder="vous@exemple.ci" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]" />
          </label>
        </div>

        <p className="rounded-[14px] bg-[#edf3ec] px-4 py-3 text-xs leading-5 text-[#426458]">Votre boutique et votre vitrine seront prêtes après la création.</p>
        <button type="submit" disabled={regLoading} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
          {regLoading ? 'Création en cours...' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </AuthExperienceLayout>
  );
};
