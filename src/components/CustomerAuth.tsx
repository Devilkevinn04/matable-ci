import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Heart, KeyRound, LayoutDashboard, LogOut, Mail, MapPin, Menu, MessageCircle, Package, PencilLine, ShieldCheck, ShoppingBag, Store, UserRound, X } from 'lucide-react';
import { AuthAudienceSwitcher, AuthExperienceLayout } from './AuthExperienceLayout';
import { CustomerOAuthButtons } from './CustomerOAuthButtons';
import { CustomerMerchantRegistrationForm } from './CustomerMerchantRegistrationForm';
import { TermsPrivacyConsent } from './TermsPrivacyConsent';
import { normalizeCustomerPhone } from '../utils/normalizeCustomerPhone';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';

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
  const [acceptedTermsPrivacy, setAcceptedTermsPrivacy] = useState(false);

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
          body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone), accepted_terms_privacy: acceptedTermsPrivacy }),
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
        body: JSON.stringify(mode === 'login' ? { email, password } : { first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone), email, password, accepted_terms_privacy: acceptedTermsPrivacy }),
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
    setAcceptedTermsPrivacy(false);
    setError('');
    onModeChange(nextMode);
  };

  return (
    <AuthExperienceLayout
      eyebrow={mode === 'register' && accountType === 'merchant' ? 'Votre commerce, en ligne' : 'Du local, tout simplement'}
      title={mode === 'register' && accountType === 'merchant' ? 'Faites découvrir votre boutique.' : mode === 'login' ? 'Bienvenue sur MaTable.ci' : 'Rejoignez la communauté MaTable.ci'}
      description={mode === 'register' && accountType === 'merchant'
        ? 'Créez votre vitrine locale et recevez les commandes de vos clients directement sur WhatsApp.'
        : mode === 'login'
          ? 'Connectez-vous pour retrouver les boutiques que vous aimez et commander en toute simplicité.'
          : 'Créez votre compte et commencez à découvrir, soutenir et suivre les commerces de votre quartier.'}
      imageAlt="Portrait chaleureux pour illustrer la communauté MaTable.ci"
      onBack={onBack}
      topPrompt={mode === 'register' && accountType === 'merchant' ? 'Déjà commerçant ?' : mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
      topActionLabel={mode === 'register' && accountType === 'merchant' ? 'Se connecter' : mode === 'login' ? 'Créer un compte' : 'Se connecter'}
      onTopAction={mode === 'register' && accountType === 'merchant' ? onMerchantLogin : () => switchMode(mode === 'login' ? 'register' : 'login')}
    >
      <div className="mb-6">
        {mode === 'login' && !pendingOAuthProfile && (
          <AuthAudienceSwitcher
            activeAudience="customer"
            onSelectCustomer={() => undefined}
            onSelectMerchant={onMerchantLogin}
          />
        )}
        <p className="text-sm font-bold text-[#e6572b]">{pendingOAuthProfile ? 'Presque terminé' : mode === 'login' ? 'Votre espace personnel' : 'Inscription gratuite'}</p>
        <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#25231f]">{pendingOAuthProfile ? 'Finaliser le compte' : mode === 'login' ? 'Connexion' : accountType === 'merchant' ? 'Créer ma boutique' : 'Créer un compte'}</h2>
        <p className="mt-2 text-sm leading-6 text-[#667168]">{pendingOAuthProfile ? `Compte associé à ${pendingOAuthProfile.email}. Ajoutez votre téléphone pour commander.` : mode === 'login' ? 'Accédez à votre compte MaTable.ci.' : accountType === 'merchant' ? 'Renseignez les informations de votre boutique pour démarrer.' : 'Rejoignez MaTable.ci en quelques secondes.'}</p>
      </div>

      {mode === 'register' && !pendingOAuthProfile && (
        <div className="mb-5 grid grid-cols-2 rounded-full bg-[#f0eee7] p-1" role="group" aria-label="Type de compte">
          <button type="button" onClick={() => { setAccountType('customer'); setAcceptedTermsPrivacy(false); }} aria-pressed={accountType === 'customer'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'customer' ? 'bg-[#0f4d3d] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <UserRound className="h-4 w-4" /> Client
          </button>
          <button type="button" onClick={() => { setAccountType('merchant'); setAcceptedTermsPrivacy(false); }} aria-pressed={accountType === 'merchant'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'merchant' ? 'bg-[#0f4d3d] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <Store className="h-4 w-4" /> Commerçant
          </button>
        </div>
      )}

      {mode === 'register' && accountType === 'merchant' ? (
        <CustomerMerchantRegistrationForm onCreated={onMerchantRegister} onLogin={onMerchantLogin} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {!pendingOAuthProfile && <CustomerOAuthButtons returnTo="/compte" />}
          {mode === 'register' && <div className="grid gap-3 min-[390px]:grid-cols-2 sm:gap-4"><label className="block text-sm font-semibold text-[#34463d]">Prénom<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required autoComplete="given-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="Votre prénom" /></label><label className="block text-sm font-semibold text-[#34463d]">Nom<input value={lastName} onChange={(event) => setLastName(event.target.value)} required autoComplete="family-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="Votre nom" /></label></div>}
          {mode === 'register' && <label className="block text-sm font-semibold text-[#34463d]">Numéro de téléphone<input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required autoComplete="tel" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="+225 07 00 00 00 00" /></label>}
          {!pendingOAuthProfile && <label className="block text-sm font-semibold text-[#34463d]">Adresse e-mail<div className="relative mt-1.5"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#869188]" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white py-3 pl-11 pr-4 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="vous@exemple.ci" /></div></label>}
          {!pendingOAuthProfile && <label className="block text-sm font-semibold text-[#34463d]">Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder="8 caractères minimum" /></label>}
          {(pendingOAuthProfile || mode === 'register') && (
            <TermsPrivacyConsent id="customer-account-terms-privacy" checked={acceptedTermsPrivacy} onChange={setAcceptedTermsPrivacy} />
          )}
          {error && <p role="alert" className="rounded-xl border border-[#e6572b]/30 bg-[#fff0e8] px-3 py-2.5 text-sm font-semibold text-[#a33e24]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Vérification...' : pendingOAuthProfile ? 'Terminer mon inscription' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'} <ArrowRight className="h-4 w-4" /></button>
          {mode === 'login' && <a href="/recuperation-acces?type=customer" className="block text-center text-xs font-semibold text-[#52635b] underline underline-offset-2 hover:text-[#0f4d3d]">Mot de passe oublié ?</a>}
          <p className="flex items-center justify-center gap-2 pt-1 text-center text-xs text-[#778179]"><ShieldCheck className="h-4 w-4 text-[#176b55]" /> Vos identifiants restent privés.</p>
        </form>
      )}
    </AuthExperienceLayout>
  );
};

interface CustomerAccountProps {
  user: CustomerUser;
  onLogout: () => void;
  onBack: () => void;
  onUserUpdated: (user: CustomerUser) => void;
}

export const CustomerAccount: React.FC<CustomerAccountProps> = ({ user, onLogout, onBack, onUserUpdated }) => (
  <CustomerAccountContent user={user} onLogout={onLogout} onBack={onBack} onUserUpdated={onUserUpdated} />
);

interface CustomerOrder {
  id: number;
  total_amount: number;
  status: string;
  created_at: string;
  shop_id: number;
  shop_name?: string;
  delivery_location?: string;
  items?: { id: number; product_title?: string; quantity: number; unit_price: number; selected_size?: string; selected_color?: string; selected_modifiers?: string[] }[];
}

type CustomerAccountSection = 'overview' | 'orders' | 'favorites' | 'profile' | 'security';

interface CustomerSavedState {
  shops: { id: number; name: string; slug: string; category: string; city?: string }[];
  products: { id: number; shop_id: number; title: string; price: number; image_url?: string | null; slug: string; shop_name: string }[];
}

const CustomerAccountContent: React.FC<CustomerAccountProps> = ({ user, onLogout, onBack, onUserUpdated }) => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [savedState, setSavedState] = useState<CustomerSavedState>({ shops: [], products: [] });
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [activeSection, setActiveSection] = useState<CustomerAccountSection>('overview');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [phone, setPhone] = useState(user.phone);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [customerSessions, setCustomerSessions] = useState<{ created_at: string; expires_at: number; is_current: boolean }[]>([]);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionsMessage, setSessionsMessage] = useState('');
  const [sessionsSaving, setSessionsSaving] = useState(false);
  const [dataExporting, setDataExporting] = useState(false);
  const [dataExportError, setDataExportError] = useState('');
  const [accountDeleteConfirmation, setAccountDeleteConfirmation] = useState('');
  const [accountDeletePassword, setAccountDeletePassword] = useState('');
  const [accountDeleteError, setAccountDeleteError] = useState('');
  const [accountDeleting, setAccountDeleting] = useState(false);
  const supportUrl = getSupportWhatsAppUrl('Bonjour, j’ai besoin d’aide pour mon compte client MaTable.ci.');

  useEffect(() => {
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setPhone(user.phone);
  }, [user.first_name, user.last_name, user.phone]);

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

  useEffect(() => {
    let isActive = true;
    setSavedLoading(true);
    setSavedError(null);
    fetch('/api/customer-engagement/state', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger vos favoris.');
        if (isActive) setSavedState({ shops: data.shops || [], products: data.products || [] });
      })
      .catch((error: unknown) => {
        if (isActive) setSavedError(error instanceof Error ? error.message : 'Impossible de charger vos favoris.');
      })
      .finally(() => { if (isActive) setSavedLoading(false); });
    return () => { isActive = false; };
  }, [savedRefresh]);

  useEffect(() => {
    let isActive = true;
    fetch('/api/auth/customer-sessions', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de consulter les sessions.');
        if (isActive) setCustomerSessions(Array.isArray(data.sessions) ? data.sessions : []);
      })
      .catch((error: unknown) => {
        if (isActive) setSessionsError(error instanceof Error ? error.message : 'Impossible de consulter les sessions.');
      });
    return () => { isActive = false; };
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    setProfileError('');
    try {
      const response = await fetch('/api/auth/customer-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer vos informations.');
      onUserUpdated(data.user as CustomerUser);
      setProfileMessage('Vos informations ont été mises à jour.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Impossible d’enregistrer vos informations.');
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage('');
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setPasswordSaving(true);
    try {
      const response = await fetch('/api/auth/customer-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour le mot de passe.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Mot de passe modifié. Les autres sessions ont été déconnectées.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const exportCustomerData = async () => {
    setDataExporting(true);
    setDataExportError('');
    try {
      const response = await fetch('/api/auth/customer-data-export', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Impossible de télécharger vos données.');
      }
      const downloadUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'matable-donnees-client.json';
      link.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setDataExportError(error instanceof Error ? error.message : 'Impossible de télécharger vos données.');
    } finally {
      setDataExporting(false);
    }
  };

  const revokeOtherSessions = async () => {
    setSessionsSaving(true);
    setSessionsError('');
    setSessionsMessage('');
    try {
      const response = await fetch('/api/auth/customer-sessions/revoke-others', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de fermer les autres sessions.');
      setCustomerSessions((previous) => previous.filter((session) => session.is_current));
      setSessionsMessage('Toutes les autres sessions ont été déconnectées.');
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : 'Impossible de fermer les autres sessions.');
    } finally {
      setSessionsSaving(false);
    }
  };

  const deleteCustomerAccount = async () => {
    setAccountDeleteError('');
    setAccountDeleting(true);
    try {
      const response = await fetch('/api/auth/customer-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          confirmation: accountDeleteConfirmation,
          current_password: accountDeletePassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de supprimer le compte.');
      onLogout();
    } catch (error) {
      setAccountDeleteError(error instanceof Error ? error.message : 'Impossible de supprimer le compte.');
    } finally {
      setAccountDeleting(false);
    }
  };

  const removeFavorite = async (targetType: 'shop' | 'product', targetId: number) => {
    try {
      const response = await fetch('/api/customer-engagement/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour vos favoris.');
      setSavedState((previous) => targetType === 'shop'
        ? { ...previous, shops: previous.shops.filter((shop) => shop.id !== targetId) }
        : { ...previous, products: previous.products.filter((product) => product.id !== targetId) });
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : 'Impossible de mettre à jour vos favoris.');
    }
  };

  const accountSections: { id: CustomerAccountSection; label: string; description: string; icon: typeof ShoppingBag }[] = [
    { id: 'overview', label: 'Vue d’ensemble', description: 'Résumé de votre compte', icon: LayoutDashboard },
    { id: 'orders', label: 'Mes commandes', description: 'Historique et détails', icon: ShoppingBag },
    { id: 'favorites', label: 'Mes favoris', description: 'Boutiques et produits gardés', icon: Heart },
    { id: 'profile', label: 'Mes informations', description: 'Coordonnées du compte', icon: UserRound },
    { id: 'security', label: 'Sécurité', description: 'Mot de passe et accès', icon: KeyRound },
  ];
  const currentAccountSection = accountSections.find(({ id }) => id === activeSection) || accountSections[0];
  const accountMenuVariants = {
    closed: {
      opacity: 0,
      y: -12,
      scale: 0.98,
      height: 0,
      transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.14, ease: 'easeIn' as const },
    },
    open: {
      opacity: 1,
      y: 0,
      scale: 1,
      height: 'auto',
      transition: prefersReducedMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 360, damping: 30, staggerChildren: 0.055, delayChildren: 0.06 },
    },
  };
  const accountMenuItemVariants = {
    closed: { opacity: 0, y: -8 },
    open: { opacity: 1, y: 0, transition: prefersReducedMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' as const } },
  };
  const activeOrdersCount = orders.filter((order) => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)).length;
  const completedOrdersCount = orders.filter((order) => order.status === 'delivered').length;

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#25231f]">
      <header className="border-b border-[#e3d9cc] bg-[#fffdf9]">
        <div className="mx-auto flex max-w-[1184px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <a href="/" className="inline-flex items-center gap-3 font-display text-lg font-extrabold tracking-tight text-[#25231f]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123b31] text-white">M</span>
            <span>MaTable<span className="text-[#176b55]">.ci</span></span>
          </a>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold text-[#31584c] transition hover:bg-[#e4f1ec]"><ShoppingBag className="h-4 w-4" />Découvrir</button>
            <button type="button" onClick={onLogout} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ded8ce] px-4 text-sm font-bold text-[#6f6a61] transition hover:bg-[#f7f3ee]"><LogOut className="h-4 w-4" />Déconnexion</button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#123b31] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-36 -z-10 h-96 w-96 rounded-full border border-white/10 sm:right-8 sm:top-[-17rem] sm:h-[34rem] sm:w-[34rem]" />
        <div className="mx-auto flex max-w-[1184px] flex-col justify-between gap-7 px-5 py-8 sm:px-8 sm:py-11 md:flex-row md:items-end">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 font-display text-xl font-extrabold text-[#f0ba80] sm:h-16 sm:w-16 sm:text-2xl">
              {(user.first_name || user.name).trim().charAt(0).toLocaleUpperCase()}
            </span>
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#f0ba80]">Votre espace client</p>
              <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">Bonjour {user.first_name || user.name}.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">Vos commandes et les informations de votre compte, réunies au même endroit.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pl-[4.5rem] md:pl-0">
            <div className="min-w-32 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3">
              <span className="block text-2xl font-extrabold tabular-nums">{ordersLoading ? '…' : orders.length}</span>
              <span className="text-xs text-white/70">commande{orders.length === 1 ? '' : 's'}</span>
            </div>
            <div className="min-w-40 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-[#f0ba80]" />Membre depuis</span>
              <span className="mt-1 block text-xs capitalize text-white/70">{user.created_at ? new Date(user.created_at).toLocaleDateString('fr-CI', { month: 'long', year: 'numeric' }) : 'MaTable.ci'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid min-w-0 max-w-[1184px] grid-cols-[minmax(0,1fr)] gap-6 px-5 py-7 sm:px-8 sm:py-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <motion.button
            type="button"
            aria-label={accountMenuOpen ? 'Fermer le menu du compte' : 'Ouvrir le menu du compte'}
            aria-expanded={accountMenuOpen}
            aria-controls="mobile-customer-account-menu"
            onClick={() => setAccountMenuOpen((open) => !open)}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-[#d9e7de] bg-[#fffdf9] px-4 text-left shadow-[0_8px_24px_rgba(36,28,22,.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e4f1ec] text-[#0f4d3d]"><currentAccountSection.icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.13em] text-[#b9441f]">Votre espace client</span>
                <span className="mt-0.5 block truncate font-display text-base font-extrabold text-[#25231f]">{currentAccountSection.label}</span>
              </span>
            </span>
            <span className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#f0f7f2] px-3 text-sm font-extrabold text-[#0f4d3d]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={accountMenuOpen ? 'close' : 'open'}
                  initial={prefersReducedMotion ? false : { opacity: 0, rotate: -70, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, rotate: 70, scale: 0.7 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                  className="flex"
                >
                  {accountMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
                </motion.span>
              </AnimatePresence>
              {accountMenuOpen ? 'Fermer' : 'Menu'}
            </span>
          </motion.button>

          <AnimatePresence initial={false}>
            {accountMenuOpen && (
              <motion.nav
                id="mobile-customer-account-menu"
                aria-label="Rubriques du compte"
                variants={accountMenuVariants}
                initial="closed"
                animate="open"
                exit="closed"
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
                className="mt-3 origin-top overflow-hidden rounded-[22px] border border-[#e3d9cc] bg-[#fffdf9] p-2 shadow-[0_18px_48px_rgba(36,28,22,.12)]"
              >
                <div className="grid gap-1.5">
                  {accountSections.map(({ id, label, description, icon: Icon }) => (
                    <motion.button
                      key={id}
                      type="button"
                      aria-current={activeSection === id ? 'page' : undefined}
                      variants={accountMenuItemVariants}
                      whileHover={prefersReducedMotion ? undefined : { x: 3 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.99 }}
                      onClick={() => { setActiveSection(id); setAccountMenuOpen(false); }}
                      className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${activeSection === id ? 'bg-[#e4f1ec] text-[#0f4d3d]' : 'text-[#514b43] hover:bg-[#f7f3ee]'}`}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activeSection === id ? 'bg-white text-[#0f4d3d]' : 'bg-[#f1eee7] text-[#6f6a61]'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm">{label}</strong>
                        <span className="mt-0.5 block text-xs text-[#81796f]">{description}</span>
                      </span>
                      {activeSection === id && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#176b55]" aria-hidden="true" />}
                    </motion.button>
                  ))}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </div>

        <nav aria-label="Menu du compte client" className="hidden gap-2 pb-1 lg:flex lg:flex-col">
          {accountSections.map(({ id, label, description, icon: Icon }) => (
            <button key={id} type="button" aria-current={activeSection === id ? 'page' : undefined} onClick={() => setActiveSection(id)} className={`flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 text-left transition sm:gap-3 sm:px-4 lg:min-w-0 ${activeSection === id ? 'border-[#c8dbd0] bg-[#e4f1ec] text-[#0f4d3d]' : 'border-transparent bg-[#fffdf9] text-[#6f6a61] hover:border-[#e3d9cc]'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${activeSection === id ? 'bg-white text-[#0f4d3d]' : 'bg-[#f1eee7] text-[#6f6a61]'}`}><Icon className="h-4 w-4" /></span>
              <span><strong className="block text-sm">{label}</strong><span className="hidden text-xs opacity-75 lg:block">{description}</span></span>
              <ChevronRight className="ml-auto hidden h-4 w-4 lg:block" />
            </button>
          ))}
          <div className="mt-2 hidden rounded-2xl border border-[#e3d9cc] bg-[#fffdf9] p-4 lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#b9441f]">Une question ?</p>
            <p className="mt-2 text-sm leading-5 text-[#6f6a61]">Notre équipe peut vous aider pour l’accès ou l’utilisation de votre compte.</p>
            {supportUrl
              ? <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#0f4d3d]"><MessageCircle className="h-4 w-4" />Contacter l’assistance</a>
              : <p className="mt-3 text-xs text-[#81796f]">Assistance WhatsApp momentanément indisponible.</p>}
            <button type="button" onClick={onBack} className="mt-2 flex min-h-10 items-center gap-2 text-sm font-bold text-[#0f4d3d]">Explorer les boutiques <ChevronRight className="h-4 w-4" /></button>
          </div>
        </nav>

        <section className="min-w-0 rounded-[24px] border border-[#e3d9cc] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(37,35,31,.05)] sm:p-7" aria-live="polite">
          {activeSection === 'overview' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">Votre espace MaTable</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Votre compte, en un coup d’œil</h2>
                <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Suivez vos achats et retrouvez rapidement vos informations utiles.</p>
              </div>
              <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white transition hover:bg-[#176b55]">
                Découvrir les boutiques <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e8e0d6] bg-white p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e4f1ec] text-[#0f4d3d]"><ShoppingBag className="h-5 w-5" /></span>
                <span className="mt-4 block text-2xl font-extrabold tabular-nums text-[#25231f]">{ordersLoading ? '…' : orders.length}</span>
                <span className="mt-1 block text-sm text-[#6f6a61]">Commande{orders.length === 1 ? '' : 's'} au total</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#eadfce] bg-[#fff8ec] p-4">
                <div className="flex items-start gap-3">
                  <Heart className="mt-0.5 h-5 w-5 shrink-0 text-[#b9441f]" />
                  <div><p className="font-bold text-[#3d3933]">Vos adresses et produits préférés</p><p className="mt-1 text-sm text-[#6f6a61]">{savedState.shops.length + savedState.products.length} élément{savedState.shops.length + savedState.products.length === 1 ? '' : 's'} enregistré{savedState.shops.length + savedState.products.length === 1 ? '' : 's'}.</p></div>
                </div>
                <button type="button" onClick={() => setActiveSection('favorites')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#e8c7a4] bg-white px-4 text-sm font-bold text-[#87411f] hover:bg-[#fff2df]">Voir mes favoris <ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="rounded-2xl border border-[#e8e0d6] bg-white p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff2df] text-[#9b5a13]"><Clock3 className="h-5 w-5" /></span>
                <span className="mt-4 block text-2xl font-extrabold tabular-nums text-[#25231f]">{ordersLoading ? '…' : activeOrdersCount}</span>
                <span className="mt-1 block text-sm text-[#6f6a61]">En cours</span>
              </div>
              <div className="rounded-2xl border border-[#e8e0d6] bg-white p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1eee7] text-[#52635b]"><CheckCircle2 className="h-5 w-5" /></span>
                <span className="mt-4 block text-2xl font-extrabold tabular-nums text-[#25231f]">{ordersLoading ? '…' : completedOrdersCount}</span>
                <span className="mt-1 block text-sm text-[#6f6a61]">Terminée{completedOrdersCount === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.8fr)]">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#81796f]">À retrouver</p>
                    <h3 className="mt-1 font-display text-xl font-extrabold">Activité récente</h3>
                  </div>
                  <button type="button" onClick={() => setActiveSection('orders')} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-[#0f4d3d] hover:bg-[#e4f1ec]">
                    Tout voir <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {ordersLoading && <div role="status" className="mt-4 space-y-3"><span className="sr-only">Chargement de votre activité…</span>{[0, 1].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
                {ordersError && <div role="alert" className="mt-4 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{ordersError}</p><button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
                {!ordersLoading && !ordersError && orders.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-5 sm:p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e4f1ec] text-[#0f4d3d]"><Package className="h-5 w-5" /></span>
                  <h4 className="mt-3 font-display text-lg font-bold">Votre prochaine découverte commence ici.</h4>
                  <p className="mt-1 max-w-lg text-sm leading-6 text-[#6f6a61]">Quand vous commanderez en étant connecté, votre historique apparaîtra dans cet espace.</p>
                  <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[#0f4d3d] transition hover:bg-[#e4f1ec]">
                    Parcourir les adresses locales <ArrowRight className="h-4 w-4" />
                  </button>
                </div>}
                {!ordersLoading && !ordersError && orders.length > 0 && <div className="mt-4 space-y-2">
                  {orders.slice(0, 3).map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8e0d6] bg-white p-4">
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-[#25231f]">{order.shop_name || 'Boutique locale'}</h4>
                      <p className="mt-1 text-xs text-[#81796f]">Commande #{order.id} · {new Date(order.created_at).toLocaleDateString('fr-CI', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#f1eee7] px-3 py-1.5 text-xs font-bold text-[#52635b]">{customerOrderStatusLabel(order.status)}</span>
                      <strong className="whitespace-nowrap text-sm font-extrabold text-[#0f4d3d]">{order.total_amount.toLocaleString('fr-FR')} F</strong>
                    </div>
                  </article>)}
                </div>}
              </div>

              <aside className="rounded-2xl bg-[#f5f2eb] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#81796f]">Vos informations</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#123b31] font-display font-extrabold text-[#f0ba80]">
                    {(user.first_name || user.name).trim().charAt(0).toLocaleUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#25231f]">{user.first_name} {user.last_name}</p>
                    <p className="truncate text-xs text-[#6f6a61]">Compte client MaTable.ci</p>
                  </div>
                </div>
                <dl className="mt-5 space-y-3 border-t border-[#e2dbd0] pt-4 text-sm">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#176b55]" />
                    <div className="min-w-0"><dt className="text-xs text-[#81796f]">E-mail</dt><dd className="truncate font-semibold text-[#3d3933]">{user.email}</dd></div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#176b55]" />
                    <div className="min-w-0"><dt className="text-xs text-[#81796f]">Téléphone</dt><dd className="font-semibold text-[#3d3933]">{user.phone || 'Non renseigné'}</dd></div>
                  </div>
                </dl>
                <button type="button" onClick={() => setActiveSection('profile')} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[#0f4d3d] transition hover:bg-[#e4f1ec]">
                  Gérer mes informations <ArrowRight className="h-4 w-4" />
                </button>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#6f6a61]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#176b55]" />
                  Vos coordonnées servent à faciliter le suivi de vos commandes.
                </div>
                {supportUrl && <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[#0f4d3d] transition hover:bg-[#e4f1ec]"><MessageCircle className="h-4 w-4" />Besoin d’aide ? Écrire au service client</a>}
              </aside>
            </div>
          </>}

          {activeSection === 'favorites' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">À garder près de vous</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes favoris</h2>
                <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Les boutiques et produits que vous avez enregistrés pour les retrouver facilement.</p>
              </div>
              <span className="rounded-full bg-[#fff2df] px-3 py-1.5 text-xs font-bold text-[#87411f]">{savedState.shops.length + savedState.products.length} enregistré{savedState.shops.length + savedState.products.length === 1 ? '' : 's'}</span>
            </div>
            {savedLoading && <div role="status" className="mt-6 space-y-3"><span className="sr-only">Chargement de vos favoris…</span>{[0, 1].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
            {savedError && <div role="alert" className="mt-6 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{savedError}</p><button type="button" onClick={() => setSavedRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
            {!savedLoading && !savedError && savedState.shops.length + savedState.products.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-7 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff2df] text-[#b9441f]"><Heart className="h-6 w-6" /></span>
              <h3 className="mt-3 font-display text-lg font-bold">Votre sélection personnelle vous attend.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6f6a61]">Enregistrez une boutique ou un produit avec l’icône marque-page pour les retrouver ici.</p>
              <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white">Explorer les boutiques <ArrowRight className="h-4 w-4" /></button>
            </div>}
            {!savedLoading && !savedError && (savedState.shops.length > 0 || savedState.products.length > 0) && <div className="mt-6 space-y-7">
              {savedState.shops.length > 0 && <div>
                <h3 className="font-display text-lg font-extrabold">Boutiques enregistrées</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {savedState.shops.map((shop) => <article key={`shop-${shop.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#e8e0d6] bg-white p-4">
                    <a href={`/${encodeURIComponent(shop.slug)}`} className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[#25231f]">{shop.name}</p>
                      <p className="mt-1 truncate text-xs text-[#6f6a61]">{[shop.category, shop.city].filter(Boolean).join(' · ') || 'Boutique locale'}</p>
                    </a>
                    <button type="button" onClick={() => void removeFavorite('shop', shop.id)} aria-label={`Retirer ${shop.name} des favoris`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#b9441f] hover:bg-[#fff2df]"><Heart className="h-5 w-5 fill-current" /></button>
                  </article>)}
                </div>
              </div>}
              {savedState.products.length > 0 && <div>
                <h3 className="font-display text-lg font-extrabold">Produits enregistrés</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {savedState.products.map((product) => <article key={`product-${product.id}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e8e0d6] bg-white p-3">
                    <a href={`/${encodeURIComponent(product.slug)}`} className="flex min-w-0 flex-1 items-center gap-3">
                      {product.image_url
                        ? <img src={product.image_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl bg-[#f1eee7] object-cover" />
                        : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#e4f1ec] text-[#0f4d3d]"><Store className="h-5 w-5" /></span>}
                      <span className="min-w-0"><span className="block truncate font-bold text-[#25231f]">{product.title}</span><span className="mt-1 block truncate text-xs text-[#6f6a61]">{product.shop_name} · {product.price.toLocaleString('fr-FR')} FCFA</span></span>
                    </a>
                    <button type="button" onClick={() => void removeFavorite('product', product.id)} aria-label={`Retirer ${product.title} des favoris`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#b9441f] hover:bg-[#fff2df]"><Heart className="h-5 w-5 fill-current" /></button>
                  </article>)}
                </div>
              </div>}
            </div>}
          </>}

          {activeSection === 'orders' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">Votre activité</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes commandes</h2>
                <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Les demandes envoyées depuis ce compte. Les commandes invitées n’apparaissent pas ici.</p>
              </div>
              {!ordersLoading && <span className="rounded-full bg-[#e4f1ec] px-3 py-1.5 text-xs font-bold text-[#0f4d3d]">{orders.length} au total</span>}
            </div>
            {ordersLoading && <div role="status" className="mt-6 space-y-3"><span className="sr-only">Chargement de vos commandes…</span>{[0, 1].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
            {ordersError && <div role="alert" className="mt-6 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{ordersError}</p><button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
            {!ordersLoading && !ordersError && orders.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-7 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e4f1ec] text-[#0f4d3d]"><Package className="h-6 w-6" /></span>
              <h3 className="mt-3 font-display text-lg font-bold">Votre carnet de commandes est vide</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6f6a61]">Connectez-vous au moment d’envoyer une commande pour la retrouver facilement ici.</p>
              <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white">Découvrir les boutiques <ChevronRight className="h-4 w-4" /></button>
            </div>}
            {!ordersLoading && !ordersError && orders.length > 0 && <div className="mt-6 space-y-3">
              {orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#e8e0d6] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#b9441f]">Commande #{order.id}</p>
                    <h3 className="mt-1 font-display text-lg font-bold">{order.shop_name || `Boutique locale`}</h3>
                    <time className="mt-1 block text-xs text-[#81796f]" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString('fr-CI', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="rounded-full bg-[#f1eee7] px-3 py-1.5 text-xs font-bold text-[#52635b]">{customerOrderStatusLabel(order.status)}</span>
                    <strong className="text-sm font-extrabold text-[#0f4d3d]">{order.total_amount.toLocaleString('fr-FR')} FCFA</strong>
                  </div>
                </div>
                {order.items?.length ? <ul className="mt-4 space-y-2 border-t border-[#eee6dd] pt-3">
                  {order.items.map((item) => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-[#4a3a30]">{item.quantity} × {item.product_title || 'Article'}{[item.selected_size, item.selected_color, ...(item.selected_modifiers || [])].filter(Boolean).length > 0 && <span className="ml-1 text-xs text-[#81796f]">· {[item.selected_size, item.selected_color, ...(item.selected_modifiers || [])].filter(Boolean).join(' · ')}</span>}</span>
                    <span className="font-semibold text-[#6f6a61]">{(item.unit_price * item.quantity).toLocaleString('fr-FR')} FCFA</span>
                  </li>)}
                </ul> : null}
                {order.delivery_location && <p className="mt-3 flex items-center gap-2 border-t border-[#eee6dd] pt-3 text-xs text-[#6f6a61]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#176b55]" />{order.delivery_location}</p>}
              </article>)}
            </div>}
          </>}

          {activeSection === 'profile' && <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">Votre profil</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes informations</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Mettez à jour les coordonnées associées à vos commandes.</p>
            <form onSubmit={saveProfile} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-[#4a3a30]">Prénom
                  <input required maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
                </label>
                <label className="block text-sm font-bold text-[#4a3a30]">Nom
                  <input required maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
                </label>
              </div>
              <label className="block text-sm font-bold text-[#4a3a30]">Téléphone
                <input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
              </label>
              <label className="block text-sm font-bold text-[#4a3a30]">Adresse e-mail
                <input type="email" value={user.email} readOnly className="mt-1.5 min-h-12 w-full rounded-xl border border-[#e8e0d6] bg-[#f7f3ee] px-3 text-sm font-medium text-[#6f6a61]" />
                <span className="mt-1 block text-xs font-normal text-[#81796f]">La modification de l’e-mail sera disponible avec la vérification de la nouvelle adresse.</span>
              </label>
              {profileError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{profileError}</p>}
              {profileMessage && <p role="status" className="flex items-center gap-2 rounded-xl border border-[#c8dbd0] bg-[#e4f1ec] px-3 py-2.5 text-sm font-semibold text-[#0f4d3d]"><Check className="h-4 w-4" />{profileMessage}</p>}
              <button type="submit" disabled={profileSaving} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">{profileSaving ? 'Enregistrement…' : <><PencilLine className="h-4 w-4" />Enregistrer les modifications</>}</button>
            </form>
          </div>}

          {activeSection === 'security' && <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#b9441f]">Protection du compte</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Sécurité</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f6a61]">Choisissez un mot de passe unique d’au moins 8 caractères. Les autres sessions seront déconnectées après la modification.</p>
            <form onSubmit={changePassword} className="mt-6 space-y-4">
              <label className="block text-sm font-bold text-[#4a3a30]">Mot de passe actuel
                <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
                <span className="mt-1 block text-xs font-normal text-[#81796f]">Laissez ce champ vide si vous vous connectez avec Google ou Apple et que vous définissez un mot de passe pour la première fois.</span>
              </label>
              <label className="block text-sm font-bold text-[#4a3a30]">Nouveau mot de passe
                <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
              </label>
              <label className="block text-sm font-bold text-[#4a3a30]">Confirmer le nouveau mot de passe
                <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#176b55]" />
              </label>
              {passwordError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{passwordError}</p>}
              {passwordMessage && <p role="status" className="flex items-center gap-2 rounded-xl border border-[#c8dbd0] bg-[#e4f1ec] px-3 py-2.5 text-sm font-semibold text-[#0f4d3d]"><Check className="h-4 w-4" />{passwordMessage}</p>}
              <button type="submit" disabled={passwordSaving} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">{passwordSaving ? 'Mise à jour…' : <><KeyRound className="h-4 w-4" />Mettre à jour le mot de passe</>}</button>
            </form>
            <div className="mt-10 border-t border-[#e3d9cc] pt-6">
              <h3 className="text-lg font-extrabold">Sessions actives</h3>
              <p className="mt-1 text-sm leading-6 text-[#6f6a61]">Les détails techniques des appareils ne sont pas enregistrés. Fermez les autres sessions si vous ne reconnaissez pas une connexion.</p>
              {sessionsError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{sessionsError}</p>}
              {sessionsMessage && <p role="status" className="mt-3 rounded-xl border border-[#c8dbd0] bg-[#e4f1ec] px-3 py-2.5 text-sm font-semibold text-[#0f4d3d]">{sessionsMessage}</p>}
              <ul className="mt-3 space-y-2">
                {customerSessions.map((session, index) => (
                  <li key={`${session.created_at}-${index}`} className="flex items-center justify-between rounded-xl border border-[#e3d9cc] bg-white px-3 py-2.5 text-sm">
                    <span>{session.is_current ? 'Session actuelle' : 'Autre session'} · ouverte le {new Date(session.created_at).toLocaleString('fr-FR')}</span>
                    <span className="text-xs text-[#6f6a61]">expire le {new Date(session.expires_at).toLocaleDateString('fr-FR')}</span>
                  </li>
                ))}
                {customerSessions.length === 0 && !sessionsError && <li className="text-sm text-[#6f6a61]">Aucune session active trouvée.</li>}
              </ul>
              <button type="button" onClick={revokeOtherSessions} disabled={sessionsSaving || !customerSessions.some((session) => !session.is_current)} className="mt-3 min-h-11 rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#4a3a30] disabled:opacity-50">{sessionsSaving ? 'Déconnexion…' : 'Déconnecter les autres sessions'}</button>
            </div>
            <div className="mt-8 rounded-2xl border border-[#e3d9cc] bg-[#fffdf9] p-5">
              <h3 className="text-lg font-extrabold">Vos données</h3>
              <p className="mt-1 text-sm leading-6 text-[#6f6a61]">Téléchargez une copie de votre profil, de vos commandes, de vos favoris, likes, avis et signalements.</p>
              {dataExportError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{dataExportError}</p>}
              <button type="button" onClick={exportCustomerData} disabled={dataExporting} className="mt-3 min-h-11 rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#4a3a30] disabled:opacity-50">{dataExporting ? 'Préparation…' : 'Télécharger mes données'}</button>
            </div>
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
              <h3 className="text-lg font-extrabold text-rose-900">Supprimer mon compte</h3>
              <p className="mt-1 text-sm leading-6 text-rose-900/80">Votre profil, vos favoris, vos likes, avis, signalements et sessions seront supprimés. Les commandes seront conservées pour le commerçant, mais votre nom, téléphone et indications de lieu seront anonymisés. Cette action est irréversible.</p>
              <label className="mt-4 block text-sm font-bold text-rose-950">Tapez SUPPRIMER pour confirmer
                <input value={accountDeleteConfirmation} onChange={(event) => setAccountDeleteConfirmation(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-medium" />
              </label>
              <label className="mt-3 block text-sm font-bold text-rose-950">Mot de passe (si votre compte n’utilise pas Google ou Apple)
                <input type="password" autoComplete="current-password" value={accountDeletePassword} onChange={(event) => setAccountDeletePassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-rose-200 bg-white px-3 text-sm font-medium" />
              </label>
              {accountDeleteError && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-2.5 text-sm text-rose-900">{accountDeleteError}</p>}
              <button type="button" onClick={deleteCustomerAccount} disabled={accountDeleting || accountDeleteConfirmation !== 'SUPPRIMER'} className="mt-4 min-h-11 rounded-full bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">{accountDeleting ? 'Suppression…' : 'Supprimer définitivement mon compte'}</button>
            </div>
          </div>}
        </section>
      </div>
    </main>
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
