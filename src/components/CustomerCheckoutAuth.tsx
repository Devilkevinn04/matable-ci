import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { CustomerUser } from './CustomerAuth';
import { CustomerOAuthButtons } from './CustomerOAuthButtons';
import { normalizeCustomerPhone } from '../utils/normalizeCustomerPhone';

interface CustomerCheckoutAuthProps {
  onAuthenticated: (user: CustomerUser) => void;
  prefillName?: string;
  prefillPhone?: string;
}

function splitCustomerName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return { firstName: trimmed, lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export const CustomerCheckoutAuth: React.FC<CustomerCheckoutAuthProps> = ({ onAuthenticated, prefillName, prefillPhone }) => {
  const initialName = useMemo(() => splitCustomerName(prefillName || ''), [prefillName]);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(prefillPhone ? normalizeCustomerPhone(prefillPhone) : '+225');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const helperCopy = useMemo(() => (mode === 'login'
    ? 'Connectez-vous pour finaliser votre commande et garder votre panier prêt.'
    : 'Créez un compte pour retrouver vos commandes et commander plus vite.'), [mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/customer-login' : '/api/auth/customer-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'login' ? { email, password } : { first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone), email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de continuer.');
      onAuthenticated(data.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Une erreur est survenue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#e9dfd0] bg-[#fffdf9] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d6b57] text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6b4d39]">Connexion</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf8f4] px-2 py-0.5 text-[10px] font-semibold text-[#12614a]">
              <CheckCircle2 className="h-3 w-3" /> rapide
            </span>
          </div>
          <h4 className="mt-1 text-lg font-black text-[#211712]">{mode === 'login' ? 'Connectez-vous pour commander' : 'Créer un compte'}</h4>
          <p className="mt-1 text-xs leading-5 text-[#4a3a30]">{helperCopy}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f2eee8] p-1">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={`rounded-lg px-2 py-2 text-xs font-bold transition ${mode === 'login' ? 'bg-white text-[#211712] shadow-sm ring-1 ring-[#e8ddd0]' : 'text-[#4a3a30]'}`}
        >
          Se connecter
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={`rounded-lg px-2 py-2 text-xs font-bold transition ${mode === 'register' ? 'bg-white text-[#211712] shadow-sm ring-1 ring-[#e8ddd0]' : 'text-[#4a3a30]'}`}
        >
          Créer un compte
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-[#dfd7ce] bg-white p-3 text-[11px] font-semibold text-[#52635b]">
        <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-[#1d6b57]" /> Sécurisé</span>
        <span className="inline-flex items-center gap-1 text-[#1d6b57]"><Sparkles className="h-3.5 w-3.5" /> Paiement sur WhatsApp</span>
      </div>

      <div className="mt-4"><CustomerOAuthButtons returnTo={`${window.location.pathname}${window.location.search}`} /></div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === 'register' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black text-[#211712]">
              Prénom
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
                autoComplete="given-name"
                className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#1d6b57] focus:ring-2 focus:ring-[#dff3ec]"
                placeholder="Votre prénom"
              />
            </label>
            <label className="block text-xs font-black text-[#211712]">
              Nom
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
                autoComplete="family-name"
                className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#1d6b57] focus:ring-2 focus:ring-[#dff3ec]"
                placeholder="Votre nom"
              />
            </label>
          </div>
        )}

        {mode === 'register' && (
          <label className="block text-xs font-black text-[#211712]">
            Téléphone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#1d6b57] focus:ring-2 focus:ring-[#dff3ec]"
              placeholder="07 00 00 00 00"
            />
          </label>
        )}

        <label className="block text-xs font-black text-[#211712]">
          Email
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white py-2.5 pl-9 pr-3 text-sm font-normal outline-none transition focus:border-[#1d6b57] focus:ring-2 focus:ring-[#dff3ec]"
              placeholder="vous@exemple.ci"
            />
          </div>
        </label>

        <label className="block text-xs font-black text-[#211712]">
          Mot de passe
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 pr-10 text-sm font-normal outline-none transition focus:border-[#1d6b57] focus:ring-2 focus:ring-[#dff3ec]"
              placeholder="8 caractères minimum"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-3 top-[1.1rem] text-slate-500 transition hover:text-slate-800"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error && (
          <p role="alert" aria-live="polite" className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d6b57] px-3 py-3 text-sm font-bold text-white transition hover:bg-[#145645] disabled:opacity-60"
        >
          {isSubmitting ? 'Vérification...' : mode === 'register' ? 'Créer mon compte' : 'Se connecter'}
          <ArrowRight className="h-4 w-4" />
        </button>

        {mode === 'login' && (
          <a href="/recuperation-acces?type=customer" className="block py-1 text-center text-xs font-semibold text-[#52635b] underline underline-offset-2 hover:text-[#0f4d3d]">
            Mot de passe oublié ?
          </a>
        )}
      </form>
    </section>
  );
};
