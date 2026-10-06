import React, { useState } from 'react';
import { ArrowRight, Store } from 'lucide-react';
import { ShopCategory } from '../types';
import { getCategoryDefaults, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { TRIAL_CATALOG_LIMIT, TRIAL_DURATION_DAYS } from '../utils/subscriptionFeatures';

interface CustomerMerchantRegistrationFormProps {
  onCreated: () => void;
  onLogin: () => void;
}

interface ShopRegistrationResponse {
  success: boolean;
  shop?: { id: number; slug: string };
  error?: string;
}

const communes = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody',
  'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville',
  'Yopougon', 'Autre ville / commune',
];

export const CustomerMerchantRegistrationForm: React.FC<CustomerMerchantRegistrationFormProps> = ({ onCreated, onLogin }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ShopCategory>('fashion');
  const [city, setCity] = useState('Abidjan');
  const [otherCity, setOtherCity] = useState('');
  const [phone, setPhone] = useState('+225');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
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
          welcome_message: getCategoryDefaults(category).welcomeMessage,
        }),
      });
      const data = await response.json() as ShopRegistrationResponse;
      if (!response.ok) throw new Error(data.error || 'Impossible de créer votre boutique pour le moment.');
      if (data.success !== true || !data.shop?.id || !data.shop.slug) {
        throw new Error('La création de la boutique n’a pas pu être confirmée. Réessayez.');
      }
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Une erreur est survenue lors de la création de votre boutique.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClass = 'mt-1.5 min-h-11 w-full rounded-[12px] border border-[#deded5] bg-white px-3 py-2 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10';

  return (
    <div>
      <p className="mb-3 text-sm leading-6 text-[#52635b]">Créez votre vitrine et recevez les commandes directement sur WhatsApp. {TRIAL_DURATION_DAYS} jours d’essai Standard gratuit, jusqu’à {TRIAL_CATALOG_LIMIT} produits.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-semibold text-[#34463d]">
          Nom de la boutique
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} autoComplete="organization" placeholder="Ex. : Atelier Awa" className={fieldClass} />
        </label>

        <div className="grid gap-3 min-[430px]:grid-cols-2">
          <label className="block text-sm font-semibold text-[#34463d]">
            Activité
            <select value={category} onChange={(event) => setCategory(event.target.value as ShopCategory)} className={fieldClass}>
              {SHOP_CATEGORIES.map((item) => <option key={item} value={item}>{getCategoryDefaults(item).icon} {getCategoryDefaults(item).label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#34463d]">
            Ville / commune
            <select value={city} onChange={(event) => setCity(event.target.value)} className={fieldClass}>
              <option value="Abidjan">Abidjan</option>
              {communes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
            </select>
          </label>
        </div>
        {city === 'Autre ville / commune' && (
          <label className="block text-sm font-semibold text-[#34463d]">
            Votre ville
            <input value={otherCity} onChange={(event) => setOtherCity(event.target.value)} required placeholder="Saisissez votre ville" className={fieldClass} />
          </label>
        )}

        <label className="block text-sm font-semibold text-[#34463d]">
          Numéro WhatsApp
          <input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" placeholder="+225 07 00 00 00 00" className={fieldClass} />
        </label>

        <div className="grid gap-3 min-[430px]:grid-cols-2">
          <label className="block text-sm font-semibold text-[#34463d]">
            Code PIN (6 chiffres)
            <input type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="new-password" placeholder="Choisissez un PIN" className={fieldClass} />
          </label>
          <label className="block text-sm font-semibold text-[#34463d]">
            E-mail
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="vous@exemple.ci" className={fieldClass} />
          </label>
        </div>

        <p className="rounded-xl bg-[#edf3ec] px-3 py-2.5 text-xs leading-5 text-[#426458]">Votre vitrine publique sera activée après la vérification de votre identité.</p>
        {error && <p role="alert" className="rounded-xl border border-[#e6572b]/30 bg-[#fff0e8] px-3 py-2.5 text-sm font-semibold text-[#a33e24]">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
          {isSubmitting ? 'Création en cours…' : 'Créer ma boutique'} <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      <button type="button" onClick={onLogin} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 py-2 text-sm font-bold text-[#0f4d3d] hover:text-[#e6572b]">
        <Store className="h-4 w-4" aria-hidden="true" /> Déjà commerçant ? Se connecter
      </button>
    </div>
  );
};
