import React from 'react';
import { Store, Phone, Lock, ChevronRight, UserPlus, Key, Eye, EyeOff, AlertTriangle, Check, ExternalLink, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ShopCategory } from '../../types';
import { MerchantState } from './useMerchant';
import { CATEGORY_DEFAULTS, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { AuthExperienceLayout } from '../AuthExperienceLayout';
import { MerchantRegistrationScreen } from './MerchantRegistrationScreen';

interface AuthScreensProps {
  state: MerchantState;
  onBackToDirectory: () => void;
}


const shopCategoryOptions: { value: ShopCategory; label: string; icon: string }[] = SHOP_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_DEFAULTS[value].label,
  icon: CATEGORY_DEFAULTS[value].icon,
}));

const abidjanCommunes = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody',
  'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville',
  'Yopougon', 'Autre ville / commune',
];

export const AuthScreens: React.FC<AuthScreensProps> = ({ state, onBackToDirectory }) => {
  const {
    isSessionLoading, currentShop, phoneInput, setPhoneInput, pinInput, setPinInput,
    accessCodeInput, setAccessCodeInput, showAccessCode, setShowAccessCode, showPinInput,
    setShowPinInput, authMode, setAuthMode, authError, authLoading,
    handlePrivateAccessLogin, handleLogin,
    setIsRegisterModalOpen, setAuthError, isRegisterModalOpen, handleRegisterShop, regName, setRegName, regCategory, setRegCategory, regCity, setRegCity, regCityOther, setRegCityOther, regPhone, setRegPhone, showRegPin, regPin, setRegPin, setShowRegPin, regEmail, setRegEmail, regLoading
  } = state;

  // 0. SESSION LOADING — prevent flash of login form while checking cookie / access token
  if (isSessionLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Chargement de votre espace…</p>
      </div>
    );
  }

  if (isRegisterModalOpen) return <MerchantRegistrationScreen state={state} onBackToDirectory={onBackToDirectory} />;

  // 1. UN-AUTHENTICATED -> LOGIN VIEW
  if (!currentShop) {
    return (
      <AuthExperienceLayout
        eyebrow="Votre espace commerçant"
        title="Votre boutique, à portée de main."
        description="Gérez vos produits, vos commandes et votre vitrine locale depuis un seul espace."
        imageAlt="Une entrepreneure souriante, symbole des commerces de proximité"
        topPrompt="Pas encore de boutique ?"
        onBack={onBackToDirectory}
        topActionLabel="Créer ma boutique"
        onTopAction={() => setIsRegisterModalOpen(true)}
      >
        <div className="w-full">

          <div className="mb-6">
            <p className="text-sm font-bold text-[#e6572b]">Espace propriétaire</p>
            <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">Connexion</h2>
            <p className="mt-2 text-sm leading-6 text-[#68756c]">
              Connectez-vous avec le numéro WhatsApp et le code PIN choisis lors de la création de votre boutique.
            </p>
          </div>

          {authError && (
            <div className="relative mb-4 p-3 rounded-xl bg-[#fdf1ee] border-[2px] border-[#b93712] text-[#b93712] text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#b93712]" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="relative space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                  Numéro WhatsApp de la boutique
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#4a3a30] absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    required
                    placeholder="+225 07 00 11 22 33"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full text-xs py-3 pl-10 pr-3 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                  Code PIN (6 chiffres)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#4a3a30] absolute left-3 top-3.5" />
                  <input
                    type={showPinInput ? 'text' : 'password'}
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    minLength={6}
                    maxLength={6}
                    placeholder="••••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full text-xs py-3 pl-10 pr-12 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                  />
                  <button type="button" onClick={() => setShowPinInput((visible) => !visible)} aria-label={showPinInput ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#4a3a30] hover:bg-[#f7f1e6]">
                    {showPinInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60"
              >
                <span>{authLoading ? 'Connexion...' : 'Se connecter'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          <a href="/recuperation-acces?type=merchant" className="mt-3 block text-center text-xs font-semibold text-[#52635b] underline underline-offset-2 hover:text-[#0f4d3d]">PIN ou accès oublié ?</a>
          <div className="relative mt-5 pt-4 border-t-[2px] border-[#211712] text-center">
            <p className="text-xs text-[#4a3a30] max-w-sm mx-auto mb-3">
              Vous n’avez pas encore de boutique ? Créez-la ici. Pour vous reconnecter ensuite, utilisez le numéro WhatsApp et le code PIN choisis à la création.
            </p>
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="text-xs font-extrabold text-[#211712] hover:text-[#1b3a63] flex items-center justify-center gap-1.5 mx-auto py-1"
            >
              <UserPlus className="w-4 h-4" />
              <span>Créer ma boutique</span>
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            MaTable.ci • Espace boutique professionnel
          </p>
        </div>

        {/* REGISTER NEW SHOP MODAL */}
        {isRegisterModalOpen && createPortal((
            <div className="fixed inset-0 z-50 flex h-dvh min-h-0 max-h-dvh items-start justify-center overflow-y-auto bg-[#211712]/60 p-3 backdrop-blur-sm sm:p-4 lg:p-6" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="register-dialog-title" className="my-4 w-full max-w-xl overflow-hidden rounded-[18px] border border-[#ded8ce] bg-[#fffdf9] shadow-[0_18px_45px_rgba(37,35,31,0.18)] sm:my-8">
              <div className="flex flex-col gap-3 bg-[#1d6b57] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ff6a3d] text-white">
                    <Store className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="register-dialog-title" className="truncate text-xl font-black text-white">Créer ma boutique</h3>
                    <p className="mt-1 text-xs text-emerald-50">Quelques informations pour préparer votre espace.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  aria-label="Fermer le formulaire"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/10 text-white transition hover:bg-white/20 sm:ml-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mx-5 mt-5 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#6b5548] sm:mx-7">
                <div className="rounded-xl border border-[#ded8ce] bg-[#edf7f2] px-2 py-2 text-[#1d6b57]">
                  <span className="block text-sm">1</span>
                  Infos
                </div>
                <div className="rounded-xl border border-[#ded8ce] bg-[#fff4e8] px-2 py-2 text-[#8a5a12]">
                  <span className="block text-sm">2</span>
                  Accès
                </div>
                <div className="rounded-xl border border-[#ded8ce] bg-[#fffaf2] px-2 py-2 text-[#155c3d]">
                  <span className="block text-sm">3</span>
                  Validation
                </div>
              </div>

              <form onSubmit={handleRegisterShop} className="space-y-6 p-5 sm:p-7">
                <section className="space-y-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1d6b57]">Identité de la boutique</p>
                    <p className="mt-1 text-xs text-[#6b5548]">Ces informations seront visibles par vos clients.</p>
                  </div>

                  <input
                    type="text"
                    aria-label="Nom de votre boutique"
                    required
                    placeholder="Ex: Glamour Abidjan, Babi Braisé..."
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm font-bold text-[#211712] outline-none focus:border-[#1d6b57] placeholder:text-slate-400"
                  />

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-[#4a3a30]">Secteur d'activité *</label>
                      <select
                        value={regCategory}
                        onChange={(e) => setRegCategory(e.target.value as ShopCategory)}
                        className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm font-bold text-[#211712] outline-none focus:border-[#1d6b57]"
                      >
                        {shopCategoryOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-[#4a3a30]">Ville / Commune *</label>
                      <select
                        required
                        value={regCity}
                        onChange={(e) => setRegCity(e.target.value)}
                        className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm text-[#211712] outline-none focus:border-[#1d6b57]"
                      >
                        <option value="Abidjan">Abidjan</option>
                        {abidjanCommunes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                      </select>
                      {regCity === 'Autre ville / commune' && (
                        <input
                          type="text"
                          required
                          value={regCityOther}
                          onChange={(e) => setRegCityOther(e.target.value)}
                          placeholder="Saisissez votre ville ou commune"
                          className="mt-2 w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm text-[#211712] outline-none focus:border-[#1d6b57]"
                        />
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-3 border-t border-[#ded8ce] pt-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1d6b57]">Accès et contact</p>
                    <p className="mt-1 text-xs leading-5 text-[#6b5548]">Votre numéro sert de contact public pour les commandes. Conservez votre lien privé de gestion.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-[#4a3a30]">Numéro WhatsApp *</label>
                      <input
                        type="tel"
                        inputMode="tel"
                        required
                        placeholder="+225 07 00 11 22 33"
                        value={regPhone}
                        onChange={(e) => setRegPhone(e.target.value)}
                        className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm font-mono text-[#211712] outline-none focus:border-[#1d6b57]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-bold text-[#4a3a30]">Code PIN (6 chiffres) *</label>
                      <div className="relative">
                        <input
                          type={showRegPin ? 'text' : 'password'}
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          placeholder="6 chiffres"
                          value={regPin}
                          onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 pr-10 text-center text-sm font-mono tracking-widest text-[#211712] outline-none focus:border-[#1d6b57]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPin((visible) => !visible)}
                          aria-label={showRegPin ? 'Masquer le PIN' : 'Afficher le PIN'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-[#edf7f2]"
                        >
                          {showRegPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-[#4a3a30]">Email de réception <span className="font-normal text-slate-500">(optionnel)</span></label>
                    <input
                      type="email"
                      placeholder="vous@exemple.ci"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full rounded-xl border border-[#ded8ce] bg-white p-3 text-sm text-[#211712] outline-none focus:border-[#1d6b57]"
                    />
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl bg-[#edf7f2] p-4 sm:p-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#1d6b57]">Votre vitrine Standard</p>
                    <p className="mt-1 text-xs leading-5 text-[#6b5548]">Catalogue, horaires, zones de service et commandes WhatsApp sont inclus. Premium et Pro ajoutent personnalisation, réseaux sociaux, événements, visibilité et statistiques.</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[#155c3d]">
                    Après la création, votre essai Standard gratuit de 7 jours commence immédiatement. À son échéance, choisissez une formule et réglez-la avec KadevPay pour continuer.
                  </div>
                </section>

                <div className="flex flex-col-reverse gap-3 border-t border-[#ded8ce] pt-6 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="w-full rounded-xl border border-[#ded8ce] bg-white px-5 py-3 text-sm font-bold text-[#211712] transition hover:-translate-y-0.5 sm:w-auto"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="w-full rounded-xl border border-[#ff6a3d] bg-[#ff6a3d] px-6 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(255,106,61,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                  >
                    {regLoading ? 'Création...' : 'Créer ma boutique'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ), document.body)}
      </AuthExperienceLayout>
    );
  }


  return null;
};
