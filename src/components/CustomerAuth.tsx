import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Eye, EyeOff, Gift, Heart, KeyRound, LayoutDashboard, LogOut, Mail, MapPin, MessageCircle, Package, PencilLine, ShieldCheck, ShoppingBag, Store, Truck, UserRound } from 'lucide-react';
import { AuthAudienceSwitcher, AuthExperienceLayout } from './AuthExperienceLayout';
import { CustomerOAuthButtons } from './CustomerOAuthButtons';
import { CustomerMerchantRegistrationForm } from './CustomerMerchantRegistrationForm';
import { TermsPrivacyConsent } from './TermsPrivacyConsent';
import { normalizeCustomerPhone } from '../utils/normalizeCustomerPhone';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';
import { OrderContactReveal } from './OrderContactReveal';
import { DeliveryTimeline, type DeliveryTimelineEvent } from './DeliveryTimeline';
import { DeliveryProgress, DeliveryStatusBadge } from './deliveryStatus';
import { formatFCFA } from '../utils/format';
import { PushOptIn } from './PushOptIn';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { Link } from 'react-router-dom';
import { trackLogin, trackSignup } from '../utils/analyticsTracker';

const GuideChecklist = React.lazy(() => import('./UserGuidePage').then((module) => ({ default: module.GuideChecklist })));

export interface CustomerUser {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  email_verified?: boolean;
  created_at: string;
}

interface PendingOAuthProfile {
  email: string;
  first_name: string;
  last_name: string;
}

interface PendingOAuthLink {
  email: string;
  provider: 'google' | 'apple';
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOAuthProfile, setPendingOAuthProfile] = useState<PendingOAuthProfile | null>(null);
  const [pendingOAuthLink, setPendingOAuthLink] = useState<PendingOAuthLink | null>(null);
  const [acceptedTermsPrivacy, setAcceptedTermsPrivacy] = useState(false);
  const [pendingMfaChallenge, setPendingMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRegistration, setMfaRegistration] = useState(false);
  const [pendingOAuthMfa, setPendingOAuthMfa] = useState(false);
  const [mfaReturnTo, setMfaReturnTo] = useState('');
  const requestedReturnTo = new URLSearchParams(window.location.search).get('return_to');
  const customerReturnTo = requestedReturnTo?.startsWith('/')
    && !requestedReturnTo.startsWith('//')
    && !requestedReturnTo.includes('\\')
    ? requestedReturnTo
    : '/compte';
  const normalizedError = error.toLocaleLowerCase();
  const oauthLinkProviderLabel = pendingOAuthLink?.provider === 'apple' ? 'Apple' : 'Google';
  const duplicateAccountError = normalizedError.includes('compte existe déjà');
  const invalidCredentialsError = normalizedError.includes('identifiants invalides');
  const phoneFieldError = error && (normalizedError.includes('téléphone') || duplicateAccountError || (mode === 'login' && normalizedError.includes('requis')))
    ? duplicateAccountError ? 'Un compte utilise déjà cet e-mail ou ce téléphone.' : invalidCredentialsError ? 'Vérifiez le numéro de téléphone puis réessayez.' : error
    : '';
  const emailFieldError = error && (normalizedError.includes('email') || normalizedError.includes('e-mail') || duplicateAccountError || (mode === 'login' && normalizedError.includes('requis')))
    ? duplicateAccountError ? 'Un compte utilise déjà cet e-mail ou ce téléphone.' : invalidCredentialsError ? 'Vérifiez l’adresse e-mail puis réessayez.' : error
    : '';
  const passwordFieldError = error && (normalizedError.includes('mot de passe') || invalidCredentialsError || (mode === 'login' && normalizedError.includes('requis')))
    ? invalidCredentialsError ? 'Vérifiez le mot de passe puis réessayez.' : error
    : '';

  useEffect(() => setMode(initialMode), [initialMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'error') setError('La connexion Google/Apple n’a pas abouti. Réessayez ou utilisez votre adresse e-mail.');
    const oauthState = params.get('oauth');
    if (oauthState === 'mfa') {
      let active = true;
      fetch('/api/auth/customer-oauth/mfa-pending', { credentials: 'include', cache: 'no-store' })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.pending || typeof data.challenge_id !== 'string') {
            throw new Error('Cette vérification a expiré. Relancez la connexion sociale.');
          }
          if (!active) return;
          setPendingMfaChallenge(data.challenge_id);
          setPendingOAuthMfa(true);
          setMfaReturnTo(customerReturnTo);
          setMode('login');
          setAccountType('customer');
          setError('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
        })
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Cette vérification a expiré. Relancez la connexion sociale.');
        });
      return () => { active = false; };
    }
    if (oauthState !== 'complete' && oauthState !== 'link') return;

    let active = true;
    const endpoint = oauthState === 'link'
      ? '/api/auth/customer-oauth/link-pending'
      : '/api/auth/customer-oauth/pending';
    fetch(endpoint, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.pending) {
          throw new Error(oauthState === 'link'
            ? 'Cette association a expiré. Relancez la connexion sociale.'
            : 'Cette étape a expiré. Relancez la connexion sociale.');
        }
        if (!active) return;
        if (oauthState === 'link') {
          setPendingOAuthLink({ email: data.email, provider: data.provider === 'apple' ? 'apple' : 'google' });
          setMode('login');
          setAccountType('customer');
          return;
        }
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
      if (pendingMfaChallenge) {
        const response = await fetch(pendingOAuthMfa ? '/api/auth/customer-oauth/mfa-verify' : '/api/auth/customer-login/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(pendingOAuthMfa
            ? { code: mfaCode }
            : { challenge_id: pendingMfaChallenge, code: mfaCode }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Code de vérification invalide.');
        setPendingMfaChallenge('');
        setMfaCode('');
        setPendingOAuthMfa(false);
        if (mfaReturnTo) {
          window.location.assign(mfaReturnTo);
          return;
        }
        if (mfaRegistration) trackSignup('customer', 'email');
        else trackLogin('customer', 'email');
        onAuthenticated(data.user);
        return;
      }
      if (pendingOAuthLink) {
        const response = await fetch('/api/auth/customer-oauth/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible d’associer ce compte.');
        if (data.mfa_required && typeof data.challenge_id === 'string') {
          setPendingMfaChallenge(data.challenge_id);
          setMfaCode('');
          setPendingOAuthMfa(false);
          setMfaReturnTo(typeof data.return_to === 'string' ? data.return_to : customerReturnTo);
          setError('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
          return;
        }
        trackLogin('customer', pendingOAuthLink.provider);
        const returnTo = typeof data.return_to === 'string' && data.return_to.startsWith('/') && !data.return_to.startsWith('//') ? data.return_to : '/compte';
        window.location.assign(returnTo);
        return;
      }
      if (pendingOAuthProfile) {
        const response = await fetch('/api/auth/customer-oauth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ first_name: firstName, last_name: lastName, phone: normalizeCustomerPhone(phone), accepted_terms_privacy: acceptedTermsPrivacy }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de terminer la création du compte.');
        if (data.mfa_required && typeof data.challenge_id === 'string') {
          setPendingMfaChallenge(data.challenge_id);
          setMfaCode('');
          setMfaRegistration(true);
          setPendingOAuthMfa(false);
          setMfaReturnTo(typeof data.return_to === 'string' ? data.return_to : customerReturnTo);
          setError('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
          return;
        }
        trackSignup('customer', 'google');
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
      if (data.mfa_required && typeof data.challenge_id === 'string') {
        setPendingMfaChallenge(data.challenge_id);
        setMfaCode('');
        setMfaRegistration(mode === 'register');
        setPendingOAuthMfa(false);
        setMfaReturnTo('');
        setError('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
        return;
      }
      if (mode === 'login') trackLogin('customer', 'email');
      else trackSignup('customer', 'email');
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
      motionKey={`${mode}-${accountType}-${pendingMfaChallenge ? 'mfa' : pendingOAuthProfile ? 'oauth-profile' : pendingOAuthLink ? 'oauth-link' : 'form'}`}
      title={mode === 'register' && accountType === 'merchant' ? 'Faites découvrir votre boutique.' : mode === 'login' ? 'Bienvenue sur MaTable' : 'Rejoignez la communauté MaTable'}
      description={mode === 'register' && accountType === 'merchant'
        ? 'Créez votre vitrine locale et recevez les commandes de vos clients directement sur WhatsApp.'
        : mode === 'login'
          ? 'Connectez-vous pour retrouver les boutiques que vous aimez et commander en toute simplicité.'
          : 'Créez votre compte et commencez à découvrir, soutenir et suivre les commerces de votre quartier.'}
      imageAlt={mode === 'register' && accountType === 'merchant' ? 'Aperçu de la création de votre vitrine locale' : 'Illustration MaTable sur le commerce local'}
      onBack={onBack}
      topPrompt={pendingMfaChallenge ? undefined : mode === 'register' && accountType === 'merchant' ? 'Déjà commerçant ?' : mode === 'login' ? 'Pas encore de compte ?' : 'Déjà un compte ?'}
      topActionLabel={pendingMfaChallenge ? undefined : mode === 'register' && accountType === 'merchant' ? 'Se connecter' : mode === 'login' ? 'Créer un compte' : 'Se connecter'}
      onTopAction={pendingMfaChallenge ? undefined : mode === 'register' && accountType === 'merchant' ? onMerchantLogin : () => switchMode(mode === 'login' ? 'register' : 'login')}
    >
      <div className="mb-6">
        {mode === 'login' && !pendingOAuthProfile && !pendingOAuthLink && !pendingMfaChallenge && (
          <AuthAudienceSwitcher
            activeAudience="customer"
            onSelectCustomer={() => undefined}
            onSelectMerchant={onMerchantLogin}
          />
        )}
        <p className="text-sm font-bold text-[#c2410c]">{pendingOAuthProfile ? 'Presque terminé' : pendingOAuthLink ? 'Connexion sécurisée' : mode === 'login' ? 'Votre espace personnel' : 'Inscription gratuite'}</p>
        <h2 className="mt-1 text-[30px] font-extrabold leading-tight text-[#292d2a]">{pendingOAuthProfile ? 'Finaliser le compte' : pendingOAuthLink ? 'Associer ce compte' : mode === 'login' ? 'Connexion' : accountType === 'merchant' ? 'Créer ma boutique' : 'Créer un compte'}</h2>
        <p className="mt-2 text-sm leading-6 text-[#667168]">{pendingOAuthProfile ? `Compte associé à ${pendingOAuthProfile.email}. Ajoutez votre téléphone pour commander.` : pendingOAuthLink ? `Un compte MaTable existe déjà avec ${pendingOAuthLink.email}. Saisissez votre mot de passe pour y associer ${oauthLinkProviderLabel}.` : mode === 'login' ? 'Accédez à votre compte MaTable.' : accountType === 'merchant' ? 'Renseignez les informations de votre boutique pour démarrer.' : 'Rejoignez MaTable en quelques secondes.'}</p>
      </div>

      {mode === 'register' && !pendingOAuthProfile && !pendingMfaChallenge && (
        <div className="mb-5 grid grid-cols-2 rounded-full bg-[#f0eee7] p-1" role="group" aria-label="Type de compte">
          <button type="button" onClick={() => { setAccountType('customer'); setAcceptedTermsPrivacy(false); }} aria-pressed={accountType === 'customer'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'customer' ? 'bg-[var(--mt-green-deep)] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <UserRound className="h-4 w-4" /> Client
          </button>
          <button type="button" onClick={() => { setAccountType('merchant'); setAcceptedTermsPrivacy(false); }} aria-pressed={accountType === 'merchant'} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition ${accountType === 'merchant' ? 'bg-[var(--mt-green-deep)] text-white shadow-sm' : 'text-[#59655c] hover:bg-white/70'}`}>
            <Store className="h-4 w-4" /> Commerçant
          </button>
        </div>
      )}

      {mode === 'register' && accountType === 'merchant' ? (
        <CustomerMerchantRegistrationForm onCreated={onMerchantRegister} onLogin={onMerchantLogin} />
      ) : (
        <form onSubmit={submit} className="auth-form space-y-4">
          {!pendingMfaChallenge && !pendingOAuthProfile && !pendingOAuthLink && <CustomerOAuthButtons returnTo={customerReturnTo} />}
          {pendingMfaChallenge ? (
            <label className="block text-sm font-semibold text-[#47534b]">
              Code de vérification par e-mail
              <span className="mt-1 block text-xs font-normal text-[#667168]">Code à 8 chiffres, à usage unique, valide 10 minutes.</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                className="mt-2 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-[var(--mt-green-primary)]"
              />
            </label>
          ) : <>
          {mode === 'register' && <div className="grid gap-3 min-[390px]:grid-cols-2 sm:gap-4"><label className="block text-sm font-semibold text-[#47534b]">Prénom<input value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 60))} required maxLength={60} autoComplete="given-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10" placeholder="Votre prénom" /></label><label className="block text-sm font-semibold text-[#47534b]">Nom<input value={lastName} onChange={(event) => setLastName(event.target.value.slice(0, 60))} required maxLength={60} autoComplete="family-name" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10" placeholder="Votre nom" /></label></div>}
          {mode === 'register' && <label className="block text-sm font-semibold text-[#47534b]">Numéro de téléphone<input type="tel" inputMode="tel" maxLength={16} value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 16))} required autoComplete="tel" aria-invalid={Boolean(phoneFieldError)} aria-describedby={phoneFieldError ? 'customer-phone-error' : undefined} className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10" placeholder="+225 07 00 00 00 00" />{phoneFieldError && <span id="customer-phone-error" className="mt-1.5 block text-xs font-semibold text-[#a33e24]">{phoneFieldError}</span>}</label>}
          {pendingOAuthLink && <label className="block text-sm font-semibold text-[#47534b]">Adresse e-mail<input type="email" value={pendingOAuthLink.email} readOnly autoComplete="email" className="mt-1.5 min-h-12 w-full rounded-[14px] border border-[#deded5] bg-[#f7f6f1] px-4 py-3 text-sm font-normal text-[#292d2a] outline-none" /></label>}
          {!pendingOAuthProfile && !pendingOAuthLink && <label className="block text-sm font-semibold text-[#47534b]">Adresse e-mail<div className="relative mt-1.5"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#869188]" /><input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value.slice(0, 254))} required autoComplete="email" aria-invalid={Boolean(emailFieldError)} aria-describedby={emailFieldError ? 'customer-email-error' : undefined} className="min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white py-3 pl-11 pr-4 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10" placeholder="vous@exemple.ci" /></div>{emailFieldError && <span id="customer-email-error" className="mt-1.5 block text-xs font-semibold text-[#a33e24]">{emailFieldError}</span>}</label>}
          {!pendingOAuthProfile && <label className="block text-sm font-semibold text-[#47534b]">Mot de passe<div className="relative mt-1.5"><input type={showPassword ? 'text' : 'password'} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value.slice(0, 128))} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={Boolean(passwordFieldError)} aria-describedby={passwordFieldError ? 'customer-password-error' : undefined} className="min-h-12 w-full rounded-[14px] border border-[#deded5] bg-white px-4 py-3 pr-12 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10" placeholder="8 caractères minimum" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#647067] transition hover:bg-[#f3f1eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]">{showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}</button></div>{passwordFieldError && <span id="customer-password-error" className="mt-1.5 block text-xs font-semibold text-[#a33e24]">{passwordFieldError}</span>}</label>}
          {(pendingOAuthProfile || mode === 'register') && (
            <TermsPrivacyConsent id="customer-account-terms-privacy" checked={acceptedTermsPrivacy} onChange={setAcceptedTermsPrivacy} />
          )}
          </>}
          {error && <p role="alert" className="rounded-xl border border-[#F97316]/30 bg-[#fff0e8] px-3 py-2.5 text-sm font-semibold text-[#a33e24]">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--mt-green-primary)] disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'Vérification...' : pendingMfaChallenge ? 'Vérifier le code' : pendingOAuthLink ? 'Associer mon compte' : pendingOAuthProfile ? 'Terminer mon inscription' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'} <ArrowRight className="h-4 w-4" /></button>
          {pendingMfaChallenge
            ? <button type="button" onClick={() => { setPendingMfaChallenge(''); setMfaCode(''); setPendingOAuthMfa(false); setMfaReturnTo(''); setError(''); }} className="block w-full text-center text-xs font-semibold text-[#47534b] underline underline-offset-2 hover:text-[var(--mt-green-deep)]">Recommencer la connexion</button>
            : mode === 'login' && <Link to="/recuperation-acces?type=customer" className="block text-center text-xs font-semibold text-[#47534b] underline underline-offset-2 hover:text-[var(--mt-green-deep)]">Mot de passe oublié ?</Link>}
          <p className="flex items-center justify-center gap-2 pt-1 text-center text-xs text-[#778179]"><ShieldCheck className="h-4 w-4 text-[var(--mt-green-primary)]" /> Vos identifiants restent privés.</p>
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

interface CustomerOrderDelivery {
  id: number;
  status: string;
  ticket_number: string | null;
  quoted_amount: number;
  proof_available: boolean;
  proof_captured_at: string | null;
  proof_byte_size: number | null;
}

interface CustomerOrder {
  id: number;
  total_amount: number;
  delivery_fee?: number;
  status: string;
  created_at: string;
  shop_id: number;
  shop_name?: string;
  delivery_location?: string;
  delivery?: CustomerOrderDelivery | null;
  items?: { id: number; product_title?: string; quantity: number; unit_price: number; selected_size?: string; selected_color?: string; selected_modifiers?: string[] }[];
}

function CustomerDeliverySummary({ order }: { order: CustomerOrder }) {
  const delivery = order.delivery;
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<DeliveryTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  useEffect(() => {
    if (!delivery) return;
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);
    fetch(`/api/customers/orders/${order.id}/delivery/events`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { events?: DeliveryTimelineEvent[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le suivi de la livraison.');
        if (!cancelled) setTimelineEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setTimelineError(loadError instanceof Error ? loadError.message : 'Impossible de charger le suivi de la livraison.');
      })
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [order.id, delivery?.id, delivery?.status]);

  if (!delivery) return null;

  const loadProof = async () => {
    setProofLoading(true);
    setProofError(null);
    try {
      const response = await fetch(`/api/customers/orders/${order.id}/delivery/proof`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json() as { proof?: { data_url: string }; error?: string };
      if (!response.ok || !data.proof) throw new Error(data.error || 'Preuve photo indisponible.');
      setProofUrl(data.proof.data_url);
    } catch (error) {
      setProofError(error instanceof Error ? error.message : 'Preuve photo indisponible.');
    } finally {
      setProofLoading(false);
    }
  };

  return (
    <section aria-label={`Livraison MaTable de la commande ${order.id}`} className="mt-3 overflow-hidden rounded-xl border border-[#CBE6DA] bg-white">
      <div className="bg-[#F0FAF5] px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#0F6B54]">
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />Livraison MaTable
            </p>
            <p className="mt-1 font-mono text-sm font-black tracking-wide text-[#103E32]">{delivery.ticket_number || `COURSE-${delivery.id}`}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {order.status === 'pending'
              ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-900">En attente de la boutique</span>
              : <DeliveryStatusBadge status={delivery.status} />}
            <p className="text-xs font-black tabular-nums text-[#103E32]">{formatFCFA(Number(delivery.quoted_amount) || 0)}</p>
          </div>
        </div>
        {order.status === 'pending' && <p className="mt-2 text-[11px] leading-5 text-amber-900">La recherche d’un livreur commencera après acceptation de la commande.</p>}
        <div className="mt-2.5">
          <DeliveryProgress status={delivery.status} />
        </div>
      </div>

      <div className="space-y-2 px-3 py-3">
        {delivery.proof_available && (
          <button type="button" onClick={() => void loadProof()} disabled={proofLoading} className="min-h-9 w-full rounded-lg border border-[#B9DCCF] bg-white px-3 text-xs font-bold text-[#0F6B54] transition-colors hover:bg-[#F0FAF5] disabled:opacity-50">
            {proofLoading ? 'Chargement…' : proofUrl ? 'Preuve affichée' : 'Voir la preuve photo'}
          </button>
        )}
        {proofUrl && (
          <figure className="rounded-lg border border-[#E4EDE8] bg-white p-2">
            <img src={proofUrl} alt={`Preuve de livraison de la commande ${order.id}`} className="max-h-60 w-full rounded-md object-cover" />
            <figcaption className="mt-1 text-[10px] text-[#8A948E]">Photo enregistrée par le livreur.</figcaption>
          </figure>
        )}
        {proofError && <p role="alert" className="text-xs font-semibold text-rose-800">{proofError}</p>}
        <DeliveryTimeline
          events={timelineEvents}
          loading={timelineLoading}
          error={timelineError}
          title="Suivi de la livraison"
        />
      </div>
    </section>
  );
}

type CustomerAccountSection = 'overview' | 'orders' | 'favorites' | 'loyalty' | 'profile' | 'security';

interface CustomerLoyaltyCard {
  shop_id: number;
  shop_name: string;
  shop_slug: string;
  delivered_orders: number;
  available_rewards: number;
  orders_toward_next_reward: number;
  orders_to_next_reward: number;
}

interface CustomerSavedState {
  shops: { id: number; name: string; slug: string; category: string; city?: string }[];
  products: { id: number; shop_id: number; title: string; price: number; image_url?: string | null; slug: string; shop_name: string }[];
}

const CustomerAccountContent: React.FC<CustomerAccountProps> = ({ user, onLogout, onBack, onUserUpdated }) => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loyaltyCards, setLoyaltyCards] = useState<CustomerLoyaltyCard[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefresh, setOrdersRefresh] = useState(0);
  const [orderActionError, setOrderActionError] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const ordersLoadedRef = useRef(false);
  const [savedState, setSavedState] = useState<CustomerSavedState>({ shops: [], products: [] });
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [activeSection, setActiveSection] = useState<CustomerAccountSection>('overview');
  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [phone, setPhone] = useState(user.phone);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [emailVerificationChallenge, setEmailVerificationChallenge] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailVerificationBusy, setEmailVerificationBusy] = useState(false);
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
  const supportUrl = getSupportWhatsAppUrl('Bonjour, j’ai besoin d’aide pour mon compte client MaTable.');

  useEffect(() => {
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setPhone(user.phone);
  }, [user.first_name, user.last_name, user.phone]);

  useEffect(() => {
    let isActive = true;
    if (!ordersLoadedRef.current) setOrdersLoading(true);
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
      .then((data) => {
        if (!isActive) return;
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setLoyaltyCards(Array.isArray(data.loyalty) ? data.loyalty : []);
      })
      .catch((error: unknown) => {
        if (isActive) setOrdersError(error instanceof Error ? error.message : 'Impossible de charger vos commandes. Réessayez.');
      })
      .finally(() => {
        if (isActive) {
          setOrdersLoading(false);
          ordersLoadedRef.current = true;
        }
      });
    return () => { isActive = false; };
  }, [ordersRefresh]);

  const hasActiveDelivery = orders.some((order) => order.delivery
    && !['delivered', 'cancelled'].includes(order.delivery.status));
  const hasTrackableOrder = orders.some((order) => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status));
  useVisibilityPolling(
    () => setOrdersRefresh((value) => value + 1),
    20_000,
    hasActiveDelivery || hasTrackableOrder,
  );

  const cancelPendingOrder = async (orderId: number) => {
    if (!window.confirm('Annuler cette demande de commande ? Le stock réservé sera libéré.')) return;
    setCancellingOrderId(orderId);
    setOrderActionError('');
    try {
      const response = await fetch(`/api/customers/orders/${orderId}/cancel`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’annuler cette demande.');
      setOrdersRefresh((value) => value + 1);
    } catch (error) {
      setOrderActionError(error instanceof Error ? error.message : 'Impossible d’annuler cette demande.');
      setOrdersRefresh((value) => value + 1);
    } finally {
      setCancellingOrderId(null);
    }
  };

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

  const verifyCustomerEmail = async (verify: boolean) => {
    setEmailVerificationBusy(true);
    setProfileError('');
    setProfileMessage('');
    try {
      const response = await fetch(`/api/auth/customer-email-verification/${verify ? 'verify' : 'start'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(verify ? { challenge_id: emailVerificationChallenge, code: emailVerificationCode } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de vérifier cette adresse e-mail.');
      if (verify) {
        onUserUpdated(data.user as CustomerUser);
        setEmailVerificationChallenge('');
        setEmailVerificationCode('');
        setProfileMessage('Votre adresse e-mail est vérifiée pour la sécurité de votre compte.');
      } else {
        setEmailVerificationChallenge(data.challenge_id);
        setEmailVerificationCode('');
        setProfileMessage('Un code à 8 chiffres a été envoyé à votre adresse. Vérifiez aussi vos courriers indésirables.');
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Impossible de vérifier cette adresse e-mail.');
    } finally {
      setEmailVerificationBusy(false);
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

  const accountSections: { id: CustomerAccountSection; label: string; mobileLabel: string; description: string; icon: typeof ShoppingBag }[] = [
    { id: 'overview', label: 'Vue d’ensemble', mobileLabel: 'Accueil', description: 'Résumé de votre compte', icon: LayoutDashboard },
    { id: 'orders', label: 'Mes commandes', mobileLabel: 'Commandes', description: 'Historique et détails', icon: ShoppingBag },
    { id: 'favorites', label: 'Mes favoris', mobileLabel: 'Favoris', description: 'Boutiques et produits gardés', icon: Heart },
    { id: 'loyalty', label: 'Ma fidélité', mobileLabel: 'Fidélité', description: 'Récompenses par boutique', icon: Gift },
    { id: 'profile', label: 'Mes informations', mobileLabel: 'Profil', description: 'Coordonnées du compte', icon: UserRound },
    { id: 'security', label: 'Sécurité', mobileLabel: 'Sécurité', description: 'Mot de passe et accès', icon: KeyRound },
  ];
  const activeOrdersCount = orders.filter((order) => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)).length;
  const availableRewardsCount = loyaltyCards.reduce((sum, card) => sum + card.available_rewards, 0);

  return (
    <main className="min-h-screen bg-[#FAF8F2] pb-24 text-[#292d2a] lg:pb-0">
      <header className="border-b border-[#e3d9cc] bg-[#FFFFFF]">
        <div className="mx-auto flex max-w-[1184px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link to="/" className="inline-flex items-center gap-3 font-display text-lg font-extrabold tracking-tight text-[#292d2a]">
            <img src="/brand-kit/monogram.svg" alt="" className="h-10 w-10 shrink-0" />
            <span>MaTable</span>
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBack} aria-label="Découvrir les boutiques" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-[#47534b] transition hover:bg-[#d1fae5] sm:px-4"><ShoppingBag className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Découvrir</span></button>
            <button type="button" onClick={onLogout} aria-label="Déconnexion" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#ded8ce] px-3 text-sm font-bold text-[#647067] transition hover:bg-[#FAF8F2] sm:px-4"><LogOut className="h-4 w-4" /><span className="sr-only sm:not-sr-only">Déconnexion</span></button>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[var(--mt-green-deep)] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-36 -z-10 h-96 w-96 rounded-full border border-white/10 sm:right-8 sm:top-[-17rem] sm:h-[34rem] sm:w-[34rem]" />
        <div className="mx-auto flex max-w-[1184px] items-center gap-3 px-5 py-5 sm:gap-4 sm:px-8 sm:py-8">
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 font-display text-lg font-extrabold text-[#f0ba80] sm:h-16 sm:w-16 sm:text-2xl">
              {(user.first_name || user.name).trim().charAt(0).toLocaleUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#f0ba80] sm:text-xs">Votre espace client</p>
            <h1 className="mt-0.5 truncate font-display text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:mt-1 sm:text-4xl">Bonjour {user.first_name || user.name}.</h1>
            <p className="mt-1 text-xs leading-5 text-white/75 sm:mt-2 sm:text-sm">Commandes, favoris et informations au même endroit.</p>
            {user.created_at && <p className="mt-1 flex items-center gap-1.5 text-[10px] text-white/60 sm:text-xs"><CalendarDays className="h-3 w-3 text-[#f0ba80]" />Membre depuis {new Date(user.created_at).toLocaleDateString('fr-CI', { month: 'long', year: 'numeric' })}</p>}
          </div>
        </div>
      </section>

      {!user.email_verified && (
        <div role="status" className="mx-auto mt-4 max-w-[1184px] rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:mt-6 sm:px-6">
          <p className="font-extrabold">Vérifiez votre adresse e-mail pour protéger votre compte.</p>
          <p className="mt-1 leading-6">La connexion par code e-mail sera requise après la période de transition. Confirmez dès maintenant que vous pouvez recevoir les codes sur {user.email}.</p>
          <button type="button" onClick={() => setActiveSection('profile')} className="mt-2 font-bold underline underline-offset-2">Vérifier mon adresse</button>
        </div>
      )}

      <div className="mx-auto grid min-w-0 max-w-[1184px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-4 sm:px-8 sm:py-8 lg:grid-cols-[260px_minmax(0,1fr)]">

        <nav aria-label="Menu du compte client" className="hidden gap-2 pb-1 lg:flex lg:flex-col">
          {accountSections.map(({ id, label, description, icon: Icon }) => (
            <button key={id} type="button" aria-current={activeSection === id ? 'page' : undefined} onClick={() => setActiveSection(id)} className={`flex min-h-14 min-w-0 items-center gap-2 rounded-2xl border px-3 py-3 text-left transition sm:gap-3 sm:px-4 lg:min-w-0 ${activeSection === id ? 'border-[#c8dbd0] bg-[#d1fae5] text-[var(--mt-green-deep)]' : 'border-transparent bg-[#FFFFFF] text-[#647067] hover:border-[#e3d9cc]'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${activeSection === id ? 'bg-white text-[var(--mt-green-deep)]' : 'bg-[#f1eee7] text-[#647067]'}`}><Icon className="h-4 w-4" /></span>
              <span><strong className="block text-sm">{label}</strong><span className="hidden text-xs opacity-75 lg:block">{description}</span></span>
              <ChevronRight className="ml-auto hidden h-4 w-4 lg:block" />
            </button>
          ))}
          <div className="mt-2 hidden rounded-2xl border border-[#e3d9cc] bg-[#FFFFFF] p-4 lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#c2410c]">Une question ?</p>
            <p className="mt-2 text-sm leading-5 text-[#647067]">Notre équipe peut vous aider pour l’accès ou l’utilisation de votre compte.</p>
            {supportUrl
              ? <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--mt-green-deep)]"><MessageCircle className="h-4 w-4" />Contacter l’assistance</a>
              : <p className="mt-3 text-xs text-[#81796f]">Assistance WhatsApp momentanément indisponible.</p>}
            <button type="button" onClick={onBack} className="mt-2 flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--mt-green-deep)]">Explorer les boutiques <ChevronRight className="h-4 w-4" /></button>
          </div>
        </nav>

        <section className="min-w-0 rounded-[24px] border border-[#e3d9cc] bg-[#FFFFFF] p-4 shadow-[0_10px_30px_rgba(37,35,31,.05)] sm:p-7" aria-live="polite">
          {activeSection === 'overview' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#c2410c] sm:text-xs">Votre espace MaTable</p>
                <h2 className="mt-1 font-display text-xl font-extrabold sm:text-3xl">Votre activité</h2>
                <p className="mt-1 text-xs leading-5 text-[#647067] sm:mt-2 sm:text-sm sm:leading-6">Suivez vos commandes et retrouvez vos sélections.</p>
              </div>
              <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-4 text-xs font-bold text-white transition hover:bg-[var(--mt-green-primary)] sm:min-h-11 sm:px-5 sm:text-sm">
                Découvrir <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 sm:mt-5">
              <React.Suspense fallback={<p role="status" className="text-sm text-slate-500">Chargement de votre guide…</p>}>
                <GuideChecklist role="customer" accountId={user.id} collapsible />
              </React.Suspense>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
              <button type="button" onClick={() => setActiveSection('orders')} className="min-w-0 rounded-2xl border border-[#e8e0d6] bg-white p-3 text-left transition hover:border-[#c8dbd0] hover:bg-[#f8fcf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)] sm:p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d1fae5] text-[var(--mt-green-deep)] sm:h-10 sm:w-10"><ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                <span className="mt-2 block text-xl font-extrabold tabular-nums text-[#292d2a] sm:mt-3 sm:text-2xl">{ordersLoading ? '…' : orders.length}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#647067] sm:text-sm">Commandes</span>
              </button>
              <button type="button" onClick={() => setActiveSection('orders')} className="min-w-0 rounded-2xl border border-[#e8e0d6] bg-white p-3 text-left transition hover:border-[#e8c69a] hover:bg-[#fffaf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)] sm:p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff2df] text-[#9b5a13] sm:h-10 sm:w-10"><Clock3 className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                <span className="mt-2 block text-xl font-extrabold tabular-nums text-[#292d2a] sm:mt-3 sm:text-2xl">{ordersLoading ? '…' : activeOrdersCount}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#647067] sm:text-sm">En cours</span>
              </button>
              <button type="button" onClick={() => setActiveSection('favorites')} className="min-w-0 rounded-2xl border border-[#e8e0d6] bg-white p-3 text-left transition hover:border-[#e8c69a] hover:bg-[#fffaf2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)] sm:p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff2df] text-[#c2410c] sm:h-10 sm:w-10"><Heart className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                <span className="mt-2 block text-xl font-extrabold tabular-nums text-[#292d2a] sm:mt-3 sm:text-2xl">{savedLoading ? '…' : savedState.shops.length + savedState.products.length}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#647067] sm:text-sm">Favoris</span>
              </button>
              <button type="button" onClick={() => setActiveSection('loyalty')} className="min-w-0 rounded-2xl border border-[#e8e0d6] bg-white p-3 text-left transition hover:border-[#c8dbd0] hover:bg-[#f8fcf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)] sm:p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#d1fae5] text-[var(--mt-green-deep)] sm:h-10 sm:w-10"><Gift className="h-4 w-4 sm:h-5 sm:w-5" /></span>
                <span className="mt-2 block text-xl font-extrabold tabular-nums text-[#292d2a] sm:mt-3 sm:text-2xl">{ordersLoading ? '…' : availableRewardsCount}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-[#647067] sm:text-sm">Récompenses</span>
              </button>
            </div>

            <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,.8fr)]">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#81796f]">À retrouver</p>
                    <h3 className="mt-1 font-display text-xl font-extrabold">Activité récente</h3>
                  </div>
                  <button type="button" onClick={() => setActiveSection('orders')} className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-bold text-[var(--mt-green-deep)] hover:bg-[#d1fae5]">
                    Tout voir <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {ordersLoading && <div role="status" className="mt-4 space-y-3"><span className="sr-only">Chargement de votre activité…</span>{[0, 1].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
                {ordersError && <div role="alert" className="mt-4 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{ordersError}</p><button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
                {!ordersLoading && !ordersError && orders.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-5 sm:p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#d1fae5] text-[var(--mt-green-deep)]"><Package className="h-5 w-5" /></span>
                  <h4 className="mt-3 font-display text-lg font-bold">Votre prochaine découverte commence ici.</h4>
                  <p className="mt-1 max-w-lg text-sm leading-6 text-[#647067]">Quand vous commanderez en étant connecté, votre historique apparaîtra dans cet espace.</p>
                  <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)] transition hover:bg-[#d1fae5]">
                    Parcourir les adresses locales <ArrowRight className="h-4 w-4" />
                  </button>
                </div>}
                {!ordersLoading && !ordersError && orders.length > 0 && <div className="mt-4 space-y-2">
                  {orders.slice(0, 3).map((order) => <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8e0d6] bg-white p-4">
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-[#292d2a]">{order.shop_name || 'Boutique locale'}</h4>
                      <p className="mt-1 text-xs text-[#81796f]">Commande #{order.id} · {new Date(order.created_at).toLocaleDateString('fr-CI', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#f1eee7] px-3 py-1.5 text-xs font-bold text-[#47534b]">{customerOrderStatusLabel(order.status)}</span>
                      <strong className="whitespace-nowrap text-sm font-extrabold text-[var(--mt-green-deep)]">{(order.total_amount + Number(order.delivery_fee || 0)).toLocaleString('fr-FR')} F</strong>
                    </div>
                  </article>)}
                </div>}
              </div>

              <aside className="min-w-0 rounded-2xl bg-[#f5f2eb] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#81796f]">Vos informations</p>
                <div className="mt-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--mt-green-deep)] font-display font-extrabold text-[#f0ba80]">
                    {(user.first_name || user.name).trim().charAt(0).toLocaleUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#292d2a]">{user.first_name} {user.last_name}</p>
                    <p className="truncate text-xs text-[#647067]">Compte client MaTable</p>
                  </div>
                </div>
                <dl className="mt-5 space-y-3 border-t border-[#e2dbd0] pt-4 text-sm">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-primary)]" />
                    <div className="min-w-0"><dt className="text-xs text-[#81796f]">E-mail</dt><dd className="truncate font-semibold text-[#3d3933]">{user.email}</dd></div>
                  </div>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-primary)]" />
                    <div className="min-w-0"><dt className="text-xs text-[#81796f]">Téléphone</dt><dd className="font-semibold text-[#3d3933]">{user.phone || 'Non renseigné'}</dd></div>
                  </div>
                </dl>
                <button type="button" onClick={() => setActiveSection('profile')} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)] transition hover:bg-[#d1fae5]">
                  Gérer mes informations <ArrowRight className="h-4 w-4" />
                </button>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#647067]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-primary)]" />
                  Vos coordonnées servent à faciliter le suivi de vos commandes.
                </div>
                {supportUrl && <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#c8dbd0] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)] transition hover:bg-[#d1fae5]"><MessageCircle className="h-4 w-4" />Besoin d’aide ? Écrire au service client</a>}
              </aside>
            </div>
          </>}

          {activeSection === 'favorites' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#c2410c]">À garder près de vous</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes favoris</h2>
                <p className="mt-2 text-sm leading-6 text-[#647067]">Les boutiques et produits que vous avez enregistrés pour les retrouver facilement.</p>
              </div>
              <span className="rounded-full bg-[#fff2df] px-3 py-1.5 text-xs font-bold text-[#87411f]">{savedState.shops.length + savedState.products.length} enregistré{savedState.shops.length + savedState.products.length === 1 ? '' : 's'}</span>
            </div>
            {savedLoading && <div role="status" className="mt-6 space-y-3"><span className="sr-only">Chargement de vos favoris…</span>{[0, 1].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
            {savedError && <div role="alert" className="mt-6 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{savedError}</p><button type="button" onClick={() => setSavedRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
            {!savedLoading && !savedError && savedState.shops.length + savedState.products.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-7 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff2df] text-[#c2410c]"><Heart className="h-6 w-6" /></span>
              <h3 className="mt-3 font-display text-lg font-bold">Votre sélection personnelle vous attend.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#647067]">Enregistrez une boutique ou un produit avec l’icône marque-page pour les retrouver ici.</p>
              <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white">Explorer les boutiques <ArrowRight className="h-4 w-4" /></button>
            </div>}
            {!savedLoading && !savedError && (savedState.shops.length > 0 || savedState.products.length > 0) && <div className="mt-6 space-y-7">
              {savedState.shops.length > 0 && <div>
                <h3 className="font-display text-lg font-extrabold">Boutiques enregistrées</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {savedState.shops.map((shop) => <article key={`shop-${shop.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#e8e0d6] bg-white p-4">
                    <a href={`/${encodeURIComponent(shop.slug)}`} className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[#292d2a]">{shop.name}</p>
                      <p className="mt-1 truncate text-xs text-[#647067]">{[shop.category, shop.city].filter(Boolean).join(' · ') || 'Boutique locale'}</p>
                    </a>
                    <button type="button" onClick={() => void removeFavorite('shop', shop.id)} aria-label={`Retirer ${shop.name} des favoris`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#c2410c] hover:bg-[#fff2df]"><Heart className="h-5 w-5 fill-current" /></button>
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
                        : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#d1fae5] text-[var(--mt-green-deep)]"><Store className="h-5 w-5" /></span>}
                      <span className="min-w-0"><span className="block truncate font-bold text-[#292d2a]">{product.title}</span><span className="mt-1 block truncate text-xs text-[#647067]">{product.shop_name} · {product.price.toLocaleString('fr-FR')} FCFA</span></span>
                    </a>
                    <button type="button" onClick={() => void removeFavorite('product', product.id)} aria-label={`Retirer ${product.title} des favoris`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#c2410c] hover:bg-[#fff2df]"><Heart className="h-5 w-5 fill-current" /></button>
                  </article>)}
                </div>
              </div>}
            </div>}
          </>}

          {activeSection === 'orders' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#c2410c]">Votre activité</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes commandes</h2>
                <p className="mt-2 text-sm leading-6 text-[#647067]">Les demandes envoyées depuis ce compte. Les commandes invitées n’apparaissent pas ici.</p>
              </div>
              {!ordersLoading && <span className="rounded-full bg-[#d1fae5] px-3 py-1.5 text-xs font-bold text-[var(--mt-green-deep)]">{orders.length} au total</span>}
            </div>
            <PushOptIn
              configUrl="/api/auth/customer-push/config"
              subscriptionUrl="/api/auth/customer-push/subscription"
              title="Suivi de livraison sur cet appareil"
              description="Recevez une alerte quand un livreur accepte votre course, récupère le colis, arrive ou dépose la photo de preuve."
              className="mt-4"
            />
            {orderActionError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{orderActionError}</p>}
            {ordersLoading && <div role="status" className="mt-6 space-y-3"><span className="sr-only">Chargement de vos commandes…</span>{[0, 1].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-[#f1eee7]" />)}</div>}
            {ordersError && <div role="alert" className="mt-6 rounded-2xl border border-[#e8c69a] bg-[#fff8ec] p-4 text-sm text-[#704d16]"><p>{ordersError}</p><button type="button" onClick={() => setOrdersRefresh((value) => value + 1)} className="mt-2 font-bold underline underline-offset-2">Réessayer</button></div>}
            {!ordersLoading && !ordersError && orders.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-7 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d1fae5] text-[var(--mt-green-deep)]"><Package className="h-6 w-6" /></span>
              <h3 className="mt-3 font-display text-lg font-bold">Votre carnet de commandes est vide</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#647067]">Connectez-vous au moment d’envoyer une commande pour la retrouver facilement ici.</p>
              <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white">Découvrir les boutiques <ChevronRight className="h-4 w-4" /></button>
            </div>}
            {!ordersLoading && !ordersError && orders.length > 0 && <div className="mt-6 space-y-3">
              {orders.map((order) => <article key={order.id} className="rounded-2xl border border-[#e8e0d6] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#c2410c]">Commande #{order.id}</p>
                    <h3 className="mt-1 font-display text-lg font-bold">{order.shop_name || `Boutique locale`}</h3>
                    <time className="mt-1 block text-xs text-[#81796f]" dateTime={order.created_at}>{new Date(order.created_at).toLocaleDateString('fr-CI', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="rounded-full bg-[#f1eee7] px-3 py-1.5 text-xs font-bold text-[#47534b]">{customerOrderStatusLabel(order.status)}</span>
                    <strong className="text-sm font-extrabold text-[var(--mt-green-deep)]">{(order.total_amount + Number(order.delivery_fee || 0)).toLocaleString('fr-FR')} FCFA</strong>
                    {Number(order.delivery_fee || 0) > 0 && (
                      <span className="text-[10px] font-semibold text-[#647067] sm:text-right">
                        {order.total_amount.toLocaleString('fr-FR')} FCFA d’articles<br />+ {Number(order.delivery_fee).toLocaleString('fr-FR')} FCFA de livraison
                      </span>
                    )}
                  </div>
                </div>
                {order.items?.length ? <ul className="mt-4 space-y-2 border-t border-[#eee6dd] pt-3">
                  {order.items.map((item) => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-[#47534b]">{item.quantity} × {item.product_title || 'Article'}{[item.selected_size, item.selected_color, ...(item.selected_modifiers || [])].filter(Boolean).length > 0 && <span className="ml-1 text-xs text-[#81796f]">· {[item.selected_size, item.selected_color, ...(item.selected_modifiers || [])].filter(Boolean).join(' · ')}</span>}</span>
                    <span className="font-semibold text-[#647067]">{(item.unit_price * item.quantity).toLocaleString('fr-FR')} FCFA</span>
                  </li>)}
                </ul> : null}
                {order.delivery_location && <p className="mt-3 flex items-center gap-2 border-t border-[#eee6dd] pt-3 text-xs text-[#647067]"><MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--mt-green-primary)]" />{order.delivery_location}</p>}
                {order.status === 'pending' && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#eee6dd] pt-3">
                  <p className="text-xs leading-5 text-[#647067]">En attente de la boutique. Sans réponse sous 2 heures, la demande expire et le stock est libéré.</p>
                  <button type="button" onClick={() => void cancelPendingOrder(order.id)} disabled={cancellingOrderId === order.id} className="min-h-10 rounded-full border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50">
                    {cancellingOrderId === order.id ? 'Annulation…' : 'Annuler la demande'}
                  </button>
                </div>}
                <CustomerDeliverySummary order={order} />
                <div className="mt-3 border-t border-[#eee6dd] pt-3">
                  <OrderContactReveal
                    endpoint={`/api/customers/orders/${order.id}/contacts/merchant`}
                    contactLabel="la boutique"
                    orderStatus={order.status}
                  />
                </div>
              </article>)}
            </div>}
          </>}

          {activeSection === 'loyalty' && <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#c2410c]">Vos avantages</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Ma fidélité</h2>
                <p className="mt-2 text-sm leading-6 text-[#647067]">Chaque boutique suit séparément vos commandes livrées. Une récompense est disponible tous les cinq achats livrés.</p>
              </div>
              <span className="rounded-full bg-[#d1fae5] px-3 py-1.5 text-xs font-bold text-[var(--mt-green-deep)]">{availableRewardsCount} récompense{availableRewardsCount === 1 ? '' : 's'} disponible{availableRewardsCount === 1 ? '' : 's'}</span>
            </div>
            {loyaltyCards.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-[#d9cfc2] bg-[#f9f6f0] p-7 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d1fae5] text-[var(--mt-green-deep)]"><Gift className="h-6 w-6" /></span>
              <h3 className="mt-3 font-display text-lg font-bold">Votre fidélité commence ici</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#647067]">Connectez-vous avant de commander. Vos achats livrés auprès de chaque boutique alimenteront leur propre carte de fidélité.</p>
            </div>}
            {loyaltyCards.length > 0 && <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {loyaltyCards.map((card) => {
                const progress = card.available_rewards > 0 ? 100 : card.orders_toward_next_reward * 20;
                return <article key={card.shop_id} className="rounded-2xl border border-[#e8e0d6] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#c2410c]">Carte de fidélité</p>
                      <h3 className="mt-1 truncate font-display text-lg font-extrabold">{card.shop_name}</h3>
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d1fae5] text-[var(--mt-green-deep)]"><Gift className="h-5 w-5" /></span>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-[#292d2a]">{card.delivered_orders} commande{card.delivered_orders === 1 ? '' : 's'} livrée{card.delivered_orders === 1 ? '' : 's'}</span>
                    <span className="text-xs font-semibold text-[#647067]">{card.available_rewards > 0 ? `${card.available_rewards} récompense${card.available_rewards === 1 ? '' : 's'} à réclamer` : `${card.orders_to_next_reward} avant la prochaine`}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f1eee7]" role="progressbar" aria-label={`Progression fidélité chez ${card.shop_name}`} aria-valuemin={0} aria-valuemax={5} aria-valuenow={card.available_rewards > 0 ? 5 : card.orders_toward_next_reward}>
                    <div className="h-full rounded-full bg-[var(--mt-green-primary)] transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#647067]">{card.available_rewards > 0 ? 'Présentez-vous à la boutique pour recevoir votre récompense. Elle est remise par le commerçant et ne modifie pas automatiquement le prix des commandes.' : 'Une récompense est acquise après cinq commandes livrées auprès de cette boutique.'}</p>
                  <a href={`/${encodeURIComponent(card.shop_slug)}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[var(--mt-green-deep)]">Voir la boutique <ChevronRight className="h-4 w-4" /></a>
                </article>;
              })}
            </div>}
          </>}

          {activeSection === 'profile' && <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#c2410c]">Votre profil</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Mes informations</h2>
            <p className="mt-2 text-sm leading-6 text-[#647067]">Mettez à jour les coordonnées associées à vos commandes.</p>
            <form onSubmit={saveProfile} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-[#47534b]">Prénom
                  <input required maxLength={60} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
                </label>
                <label className="block text-sm font-bold text-[#47534b]">Nom
                  <input required maxLength={60} value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
                </label>
              </div>
              <label className="block text-sm font-bold text-[#47534b]">Téléphone
                <input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
              </label>
              <label className="block text-sm font-bold text-[#47534b]">Adresse e-mail
                <input type="email" value={user.email} readOnly className="mt-1.5 min-h-12 w-full rounded-xl border border-[#e8e0d6] bg-[#FAF8F2] px-3 text-sm font-medium text-[#647067]" />
                <span className="mt-1 block text-xs font-normal text-[#81796f]">{user.email_verified ? 'Adresse vérifiée.' : 'Un code sera envoyé à cette adresse pour confirmer que vous pouvez la consulter.'}</span>
              </label>
              {!user.email_verified && <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                {emailVerificationChallenge && <label className="block text-sm font-bold text-[#47534b]">Code reçu par e-mail
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={emailVerificationCode} onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-1.5 min-h-12 w-full rounded-xl border border-amber-200 bg-white px-3 text-center font-mono text-lg tracking-[0.3em]" />
                </label>}
                <button type="button" disabled={emailVerificationBusy} onClick={() => void verifyCustomerEmail(Boolean(emailVerificationChallenge))} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white disabled:opacity-50">
                  {emailVerificationBusy ? 'Vérification…' : emailVerificationChallenge ? 'Confirmer mon adresse' : 'Envoyer un code'}
                </button>
                {emailVerificationChallenge && <button type="button" disabled={emailVerificationBusy} onClick={() => void verifyCustomerEmail(false)} className="ml-3 text-sm font-bold text-[var(--mt-green-deep)] underline underline-offset-2">Renvoyer le code</button>}
              </div>}
              {profileError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{profileError}</p>}
              {profileMessage && <p role="status" className="flex items-center gap-2 rounded-xl border border-[#c8dbd0] bg-[#d1fae5] px-3 py-2.5 text-sm font-semibold text-[var(--mt-green-deep)]"><Check className="h-4 w-4" />{profileMessage}</p>}
              <button type="submit" disabled={profileSaving} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white transition hover:bg-[var(--mt-green-primary)] disabled:cursor-wait disabled:opacity-60">{profileSaving ? 'Enregistrement…' : <><PencilLine className="h-4 w-4" />Enregistrer les modifications</>}</button>
            </form>
          </div>}

          {activeSection === 'security' && <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#c2410c]">Protection du compte</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Sécurité</h2>
            <p className="mt-2 text-sm leading-6 text-[#647067]">Choisissez un mot de passe unique d’au moins 8 caractères. Les autres sessions seront déconnectées après la modification.</p>
            <form onSubmit={changePassword} className="mt-6 space-y-4">
              <label className="block text-sm font-bold text-[#47534b]">Mot de passe actuel
                <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
                <span className="mt-1 block text-xs font-normal text-[#81796f]">Laissez ce champ vide si vous vous connectez avec Google ou Apple et que vous définissez un mot de passe pour la première fois.</span>
              </label>
              <label className="block text-sm font-bold text-[#47534b]">Nouveau mot de passe
                <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
              </label>
              <label className="block text-sm font-bold text-[#47534b]">Confirmer le nouveau mot de passe
                <input required minLength={8} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#d9cfc2] bg-white px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--mt-green-primary)]" />
              </label>
              {passwordError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{passwordError}</p>}
              {passwordMessage && <p role="status" className="flex items-center gap-2 rounded-xl border border-[#c8dbd0] bg-[#d1fae5] px-3 py-2.5 text-sm font-semibold text-[var(--mt-green-deep)]"><Check className="h-4 w-4" />{passwordMessage}</p>}
              <button type="submit" disabled={passwordSaving} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white transition hover:bg-[var(--mt-green-primary)] disabled:cursor-wait disabled:opacity-60">{passwordSaving ? 'Mise à jour…' : <><KeyRound className="h-4 w-4" />Mettre à jour le mot de passe</>}</button>
            </form>
            <div className="mt-10 border-t border-[#e3d9cc] pt-6">
              <h3 className="text-lg font-extrabold">Sessions actives</h3>
              <p className="mt-1 text-sm leading-6 text-[#647067]">Les détails techniques des appareils ne sont pas enregistrés. Fermez les autres sessions si vous ne reconnaissez pas une connexion.</p>
              {sessionsError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{sessionsError}</p>}
              {sessionsMessage && <p role="status" className="mt-3 rounded-xl border border-[#c8dbd0] bg-[#d1fae5] px-3 py-2.5 text-sm font-semibold text-[var(--mt-green-deep)]">{sessionsMessage}</p>}
              <ul className="mt-3 space-y-2">
                {customerSessions.map((session, index) => (
                  <li key={`${session.created_at}-${index}`} className="flex items-center justify-between rounded-xl border border-[#e3d9cc] bg-white px-3 py-2.5 text-sm">
                    <span>{session.is_current ? 'Session actuelle' : 'Autre session'} · ouverte le {new Date(session.created_at).toLocaleString('fr-FR')}</span>
                    <span className="text-xs text-[#647067]">expire le {new Date(session.expires_at).toLocaleDateString('fr-FR')}</span>
                  </li>
                ))}
                {customerSessions.length === 0 && !sessionsError && <li className="text-sm text-[#647067]">Aucune session active trouvée.</li>}
              </ul>
              <button type="button" onClick={revokeOtherSessions} disabled={sessionsSaving || !customerSessions.some((session) => !session.is_current)} className="mt-3 min-h-11 rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#47534b] disabled:opacity-50">{sessionsSaving ? 'Déconnexion…' : 'Déconnecter les autres sessions'}</button>
            </div>
            <div className="mt-8 rounded-2xl border border-[#e3d9cc] bg-[#FFFFFF] p-5">
              <h3 className="text-lg font-extrabold">Vos données</h3>
              <p className="mt-1 text-sm leading-6 text-[#647067]">Téléchargez une copie de votre profil, de vos commandes, de vos favoris, likes, avis et signalements.</p>
              {dataExportError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{dataExportError}</p>}
              <button type="button" onClick={exportCustomerData} disabled={dataExporting} className="mt-3 min-h-11 rounded-full border border-[#d9cfc2] px-4 text-sm font-bold text-[#47534b] disabled:opacity-50">{dataExporting ? 'Préparation…' : 'Télécharger mes données'}</button>
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

      <nav aria-label="Navigation du compte client" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e3d9cc] bg-white/95 px-1 pt-2 shadow-[0_-8px_24px_rgba(36,28,22,.08)] backdrop-blur lg:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
        <div className="mx-auto flex max-w-lg items-stretch">
          {accountSections.map(({ id, mobileLabel, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={() => setActiveSection(id)}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--mt-green-primary)] ${activeSection === id ? 'text-[var(--mt-green-deep)]' : 'text-[#81796f] hover:text-[#47534b]'}`}
            >
              <span className={`flex h-7 w-9 items-center justify-center rounded-full ${activeSection === id ? 'bg-[#d1fae5]' : ''}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
              <span className="w-full truncate text-[10px] font-bold leading-tight sm:text-xs">{mobileLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
};

function customerOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'En attente de la boutique',
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    ready: 'Prête',
    delivered: 'Livrée',
    cancelled: 'Annulée',
    rejected: 'Refusée par la boutique',
    expired: 'Expirée',
  };
  return labels[status] || status;
}
