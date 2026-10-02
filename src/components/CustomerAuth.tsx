import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Store, UserRound } from 'lucide-react';
import { AuthExperienceLayout } from './AuthExperienceLayout';
import { CustomerOAuthButtons } from './CustomerOAuthButtons';

export interface CustomerUser {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  created_at: string;
}

interface PendingOAuthProfile {
  email: string;
  first_name: string;
  last_name: string;
}

interface CustomerAuthProps {
  initialMode?: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onAuthenticated: (user: CustomerUser) => void;
  onBack: () => void;
  onMerchantLogin: () => void;
  onMerchantRegister: () => void;
}

export const CustomerAuth: React.FC<CustomerAuthProps> = ({ initialMode = 'login', onModeChange, onAuthenticated, onBack, onMerchantLogin, onMerchantRegister }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [accountType, setAccountType] = useState<'customer' | 'merchant'>('customer');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+225');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOAuthProfile, setPendingOAuthProfile] = useState<PendingOAuthProfile | null>(null);

  useEffect(() => setMode(initialMode), [initialMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'error') setError('La connexion Google/Apple n’a pas abouti. Réessayez ou utilisez votre adresse e-mail.');
    if (params.get('oauth') !== 'complete') return;

    let active = true;
    fetch('/api/auth/customer-oauth/pending', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.pending) throw new Error('Cette étape a expiré. Relancez la connexion sociale.');
        if (!active) return;
        setPendingOAuthProfile({ email: data.email, first_name: data.first_name || '', last_name: data.last_name || '' });
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setMode('register');
        setAccountType('customer');
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Cette étape a expiré. Relancez la connexion sociale.');
      });
    return () => { active = false; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      if (pendingOAuthProfile) {
        const response = await fetch('/api/auth/customer-oauth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de terminer la création du compte.');
        const returnTo = typeof data.return_to === 'string' && data.return_to.startsWith('/') && !data.return_to.startsWith('//') ? data.return_to : '/compte';
        window.location.assign(returnTo);
        return;
      }
      const response = await fetch(mode === 'login' ? '/api/auth/customer-login' : '/api/auth/customer-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'login' ? { email, password } : { first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone), email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de terminer la demande.');
      onAuthenticated(data.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Une erreur est survenue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setAccountType('customer');
    setError('');
    onModeChange(nextMode);
  };

  return (
    <AuthExperienceLayout
      eyebrow="Du local, tout simplement"
      title={mode === 'login' ? 'Bienvenue sur MaTable.ci' : 'Rejoignez la communauté MaTable.ci'}
      description={mode === 'login' ? 'Connectez-vous pour retrouver les boutiques que vous aimez et commander en toute simplicité.' : 'Créez votre compte et commencez à découvrir, soutenir et suivre les commerces de votre quartier.'}
      imageAlt="Portrait chaleureux pour illustrer la communauté MaTable.ci"
      onBack={onBack}
      topPrompt={mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
      topActionLabel={mode === 'login' ? 'Créer un compte' : 'Se connecter'}
      onTopAction={() => switchMode(mode === 'login' ? 'register' : 'login')}
    >
      <div className="mb-6">
        <p className="text-sm font-bold text-[#e6572b]">{pendingOAuthProfile ? 'Presque terminé' : mode === 'login' ? 'Votre espace personnel' : 'Inscription gratuite'}</p>
        <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">{pendingOAuthProfile ? 'Finaliser le compte' : mode === 'login' ? 'Connexion' : 'Créer un compte'}</h2>
        <p className="mt-2 text-sm leading-6 text-[#667168]">{pendingOAuthProfile ? `Compte associé à ${pendingOAuthProfile.email}. Ajoutez votre téléphone pour commander.` : mode === 'login' ? 'Accédez à votre compte MaTable.ci.' : 'Rejoignez MaTable.ci en quelques secondes.'}</p>
      </div>

      {mode === 'register' && !pendingOAuthProfile && (
        <div className="mb-5 grid grid-cols-2 rounded-full bg-[#f0eee7] p-1" role="group" aria-label="Type de compte">
          <button type="button" onClick={() => setAccountType('customer')} aria-pressed={accountType === 'customer'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'customer' ? 'bg-[#0f4d3d] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <UserRound className="h-4 w-4" /> Client
          </button>
          <button type="button" onClick={() => setAccountType('merchant')} aria-pressed={accountType === 'merchant'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'merchant' ? 'bg-[#0f4d3d] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <Store className="h-4 w-4" /> Commerçant
          </button>
        </div>
      )}

      {mode === 'register' && accountType === 'merchant' ? (
        <div className="rounded-2xl bg-[#f6f3ed] p-5">
          <p className="text-sm leading-6 text-[#52635b]">Ouvrez votre vitrine, ajoutez votre catalogue et recevez les commandes directement sur WhatsApp.</p>
          <button type="button" onClick={onMerchantRegister} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55]">
            Créer ma boutique <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMerchantLogin} className="mt-3 w-full py-2 text-sm font-bold text-[#0f4d3d] hover:text-[#e6572b]">Déjà commerçant ? Se connecter</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!pendingOAuthProfile && <CustomerOAuthButtons returnTo="/compte" />}
          {mode === 'register' && <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold text-[#34463d]">Prénom<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required autoComplete="given-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="Votre prénom" /></label><label className="block text-sm font-semibold text-[#34463d]">Nom<input value={lastName} onChange={(event) => setLastName(event.target.value)} required autoComplete="family-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="Votre nom" /></label></div>}
          {mode === 'register' && <label className="block text-sm font-semibold text-[#34463d]">Numéro de téléphone<input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="+225 07 00 00 00 00" /></label>}
          {!pendingOAuthProfile && <label className="block text-sm font-semibold text-[#34463d]">Adresse e-mail<div className="relative mt-1.5"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#869188]" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white py-3 pl-11 pr-4 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="vous@exemple.ci" /></div></label>}
          {!pendingOAuthProfile && <label className="block text-sm font-semibold text-[#34463d]">Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="8 caractères minimum" /></label>}
          {error && <p role="alert" className="rounded-xl border border-[#e6572b]/30 bg-[#fff0e8] px-3 py-2.5 text-sm font-semibold text-[#a33e24]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Vérification...' : pendingOAuthProfile ? 'Terminer mon inscription' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'} <ArrowRight className="h-4 w-4" /></button>
          {mode === 'login' && <button type="button" onClick={onMerchantLogin} className="w-full py-2 text-sm font-semibold text-[#68756c] hover:text-[#0f4d3d]">Vous gérez une boutique ? Accès commerçant</button>}
          {mode === 'login' && <a href="/recuperation-acces?type=customer" className="block text-center text-xs font-semibold text-[#52635b] underline underline-offset-2 hover:text-[#0f4d3d]">Mot de passe oublié ?</a>}
          <p className="flex items-center justify-center gap-2 pt-1 text-center text-xs text-[#778179]"><ShieldCheck className="h-4 w-4 text-[#176b55]" /> Vos identifiants restent privés.</p>
        </form>
      )}
    </AuthExperienceLayout>
  );
};

function normalizeCustomerPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('225')) return `+${digits}`;
  if (digits.startsWith('0')) return `+225${digits}`;
  return `+225${digits}`;
}

interface CustomerAccountProps {
  user: CustomerUser;
  onLogout: () => void;
  onBack: () => void;
}

export const CustomerAccount: React.FC<CustomerAccountProps> = ({ user, onLogout, onBack }) => (
  <CustomerAccountContent user={user} onLogout={onLogout} onBack={onBack} />
);

const CustomerAccountContent: React.FC<CustomerAccountProps> = ({ user, onLogout, onBack }) => {
  const [orders, setOrders] = useState<{ id: number; total_amount: number; status: string; created_at: string; shop_id: number }[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefresh, setOrdersRefresh] = useState(0);

  useEffect(() => {
    let isActive = true;
    setOrdersLoading(true);
    setOrdersError(null);
    fetch('/api/auth/customer-orders', { credentials: 'include' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.status === 401
            ? 'Votre session a expiré. Reconnectez-vous pour consulter vos commandes.'
            : 'Impossible de charger vos commandes. Réessayez.');
        }
        return response.json();
      })
      .then((data) => { if (isActive) setOrders(Array.isArray(data.orders) ? data.orders : []); })
      .catch((error: unknown) => {
        if (isActive) setOrdersError(error instanceof Error ? error.message : 'Impossible de charger vos commandes. Réessayez.');
      })
      .finally(() => { if (isActive) setOrdersLoading(false); });
    return () => { isActive = false; };
  }, [ordersRefresh]);

  return (
    <AuthExperienceLayout
      eyebrow="Votre espace client"
      title={`Bonjour ${user.name}.`}
      description="Retrouvez vos informations et suivez vos commandes auprès des commerces locaux."
      onBack={onBack}
      topPrompt=""
      topActionLabel=""
    >
      <div>
        <p className="text-sm font-bold text-[#e6572b]">Mon compte MaTable.ci</p>
        <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">Votre espace</h2>
        <p className="mt-2 text-sm leading-6 text-[#68756c]">Ce compte sert à retrouver les commandes passées en étant connecté. Une commande passée en invité n’apparaît pas dans cet historique.</p>
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-extrabold text-[#25231f]">Mes informations</h3>
          <div className="divide-y divide-[#e6e4dc] border-y border-[#e6e4dc]">
          <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-[#68756c]">Nom</span>
            <span className="text-sm font-bold text-[#25231f]">{user.name}</span>
          </div>
          <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-[#68756c]">Adresse e-mail</span>
            <span className="break-all text-sm font-bold text-[#25231f]">{user.email}</span>
          </div>
          <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-[#68756c]">Téléphone</span>
            <span className="text-sm font-bold text-[#25231f]">{user.phone}</span>
          </div>
          </div>
        </div>

        <div className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-[#25231f]">Mes commandes</h3>
              <p className="mt-0.5 text-xs text-[#68756c]">Demandes envoyées depuis ce compte</p>
            </div>
            {ordersLoading && <span className="text-xs font-semibold text-[#176b55]">Chargement...</span>}
          </div>
          {ordersError && (
            <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{ordersError}</p>
              <button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button>
            </div>
          )}
          {!ordersLoading && !ordersError && orders.length === 0 && <p className="mt-3 text-sm leading-6 text-[#68756c]">Aucune commande liée à ce compte pour le moment. Connectez-vous pendant le checkout pour qu’une prochaine commande figure ici.</p>}
          {!ordersLoading && !ordersError && orders.length > 0 && <div className="mt-3 divide-y divide-[#e6e4dc] border-y border-[#e6e4dc]">{orders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><span className="block font-bold text-[#25231f]">Commande #{order.id}</span><time className="mt-0.5 block text-xs text-[#68756c]" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString('fr-CI', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div><span className="rounded-full bg-[#f0eee7] px-2.5 py-1 text-xs font-semibold text-[#52635b]">{customerOrderStatusLabel(order.status)}</span><span className="font-bold text-[#0f4d3d]">{order.total_amount.toLocaleString('fr-FR')} FCFA</span></div>)}</div>}
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onBack} className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55]">Découvrir les boutiques</button>
          <button type="button" onClick={onLogout} className="min-h-12 rounded-full border border-[#d9ded7] px-5 py-3 text-sm font-bold text-[#52635b] transition hover:bg-[#f6f3ed]">Se déconnecter</button>
        </div>
      </div>
    </AuthExperienceLayout>
  );
};

function customerOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'À confirmer',
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    ready: 'Prête',
    delivered: 'Livrée',
    cancelled: 'Annulée',
    expired: 'Expirée',
  };
  return labels[status] || status;
}
