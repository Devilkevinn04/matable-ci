import React, { useState } from 'react';
import { ArrowRight, Mail, UserRound } from 'lucide-react';
import { CustomerUser } from './CustomerAuth';

interface CustomerCheckoutAuthProps {
  onAuthenticated: (user: CustomerUser) => void;
}

export const CustomerCheckoutAuth: React.FC<CustomerCheckoutAuthProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+225');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <section className="rounded-2xl border-2 border-[#211712] bg-[#fffaf2] p-4 shadow-[4px_4px_0_rgba(33,23,18,0.12)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d6b57] text-white"><UserRound className="h-5 w-5" /></div>
        <div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#e2461b]">Compte MaTable.ci</p><h4 className="mt-1 text-lg font-black text-[#211712]">Connectez-vous pour commander</h4><p className="mt-1 text-xs leading-5 text-[#4a3a30]">Créez votre compte MaTable.ci ou connectez-vous. Votre panier sera conservé.</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-white p-1">
        <button type="button" onClick={() => { setMode('register'); setError(''); }} className={`rounded-lg px-2 py-2 text-xs font-black ${mode === 'register' ? 'bg-[#211712] text-white' : 'text-[#4a3a30]'}`}>Créer un compte</button>
        <button type="button" onClick={() => { setMode('login'); setError(''); }} className={`rounded-lg px-2 py-2 text-xs font-black ${mode === 'login' ? 'bg-[#211712] text-white' : 'text-[#4a3a30]'}`}>Se connecter</button>
      </div>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {mode === 'register' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-black text-[#211712]">Prénom<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required autoComplete="given-name" className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1d6b57]" placeholder="Votre prénom" /></label><label className="block text-xs font-black text-[#211712]">Nom<input value={lastName} onChange={(event) => setLastName(event.target.value)} required autoComplete="family-name" className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1d6b57]" placeholder="Votre nom" /></label></div>}
        {mode === 'register' && <label className="block text-xs font-black text-[#211712]">Téléphone<input value={phone} onChange={(event) => setPhone(event.target.value)} required className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1d6b57]" placeholder="07 00 00 00 00" /></label>}
        <label className="block text-xs font-black text-[#211712]">Email<div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-[#1d6b57]" placeholder="vous@exemple.ci" /></div></label>
        <label className="block text-xs font-black text-[#211712]">Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="mt-1 w-full rounded-xl border-2 border-[#ded8ce] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#1d6b57]" placeholder="8 caractères minimum" /></label>
        {error && <p role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#211712] bg-[#ff6a3d] px-3 py-3 text-sm font-black text-white shadow-[3px_3px_0_rgba(33,23,18,0.95)] disabled:opacity-60">{isSubmitting ? 'Vérification...' : mode === 'register' ? 'Créer et continuer' : 'Se connecter et continuer'} <ArrowRight className="h-4 w-4" /></button>
      </form>
    </section>
  );
};

function normalizeCustomerPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('225')) return `+${digits}`;
  if (digits.startsWith('0')) return `+225${digits}`;
  return `+225${digits}`;
}
