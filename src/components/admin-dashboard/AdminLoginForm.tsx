// Formulaire de connexion admin (clé d’accès puis code e-mail).
import React, { useState } from 'react';
import { m } from 'motion/react';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { trackLogin } from '../../utils/analyticsTracker';
import type { AdminRole } from './shared';

export function AdminLoginForm({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [adminKey, setAdminKey] = useState('');
  const [adminMfaChallenge, setAdminMfaChallenge] = useState('');
  const [adminMfaCode, setAdminMfaCode] = useState('');
  const [loginRole, setLoginRole] = useState<AdminRole>('super_admin');
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    const res = await fetch(adminMfaChallenge ? '/api/auth/admin-login/verify' : '/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adminMfaChallenge
        ? { challenge_id: adminMfaChallenge, code: adminMfaCode }
        : { key: adminKey, role: loginRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(data.error || 'Connexion super-admin impossible.');
      return;
    }
    if (data.mfa_required && typeof data.challenge_id === 'string') {
      setAdminMfaChallenge(data.challenge_id);
      setAdminMfaCode('');
      setAdminKey('');
      return;
    }
    setAdminMfaChallenge('');
    setAdminMfaCode('');
    setAdminKey('');
    trackLogin('admin', data.role || loginRole);
    await onAuthenticated();
  };

  return (
    <div className="admin-login min-h-screen flex items-center justify-center p-6" role="main">
      <m.form
        onSubmit={handleAdminLogin}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-form w-full max-w-md rounded-[2rem] border-[3px] border-[var(--mt-gray-900)] bg-[var(--mt-surface)] p-6 shadow-[10px_10px_0_rgba(33,23,18,0.96)] backdrop-blur-xl"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="brand-mark">M</div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mt-gray-600)]">MaTable</div>
            <h1 className="text-xl font-black text-[var(--mt-green-deep)]">
              {loginRole === 'verification_admin' ? 'Accès vérification' : 'Accès super-admin'}
            </h1>
          </div>
        </div>
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-[#eef5ff] to-[#f7e7c7] p-4 border-[2px] border-[var(--mt-gray-900)]">
          <div className="flex items-center gap-2 text-[var(--mt-green-deep)] font-bold text-xs">
            <ShieldCheck className="w-4 h-4" />
            {loginRole === 'verification_admin' ? 'Espace de vérification' : 'Espace de contrôle central'}
          </div>
          <p id="admin-login-instructions" className="mt-2 text-sm text-[#47534b]">
            {adminMfaChallenge
              ? 'Saisissez le code à 8 chiffres envoyé à l’adresse de sécurité associée à ce rôle. Il expire dans 10 minutes.'
              : loginRole === 'verification_admin'
              ? 'Entrez la clé de vérification configurée côté serveur. Cet accès est limité aux vérifications et à la modération.'
              : 'Entrez la clé configurée côté serveur pour piloter les boutiques et les alertes.'}
          </p>
        </div>
        {!adminMfaChallenge && <label className="mb-3 block text-xs font-bold text-slate-700" htmlFor="admin-role">Type d’accès</label>}
        {!adminMfaChallenge && <select
          id="admin-role"
          value={loginRole}
          onChange={(event) => {
            setLoginRole(event.target.value as AdminRole);
            setAdminKey('');
            setAuthError(null);
          }}
          className="mb-4 w-full rounded-2xl border border-[var(--mt-gray-200)] bg-white px-3 py-3 text-sm font-medium text-[var(--mt-gray-900)] outline-none focus:border-[var(--mt-green-primary)] focus:bg-white"
        >
          <option value="super_admin">Super-admin</option>
          <option value="verification_admin">Admin de vérification</option>
        </select>}
        {adminMfaChallenge ? (
          <label htmlFor="admin-mfa-code" className="mb-1.5 block text-xs font-bold text-slate-700">Code e-mail
            <input
              id="admin-mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{8}"
              maxLength={8}
              value={adminMfaCode}
              onChange={(event) => setAdminMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              required
              className="mt-2 w-full rounded-2xl border-[2px] border-[var(--mt-gray-900)] bg-white px-3 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-[var(--mt-green-primary)]"
            />
          </label>
        ) : <div className="relative">
            <label htmlFor="admin-access-key" className="mb-1.5 block text-xs font-bold text-slate-700">Clé d’accès</label>
            <input
              id="admin-access-key"
              type={showAdminKey ? 'text' : 'password'}
              value={adminKey}
              maxLength={512}
              onChange={(event) => setAdminKey(event.target.value.slice(0, 512))}
              placeholder={loginRole === 'verification_admin' ? 'Clé admin de vérification' : 'Clé super-admin'}
              aria-invalid={Boolean(authError)}
              aria-describedby={authError ? 'admin-key-error' : 'admin-login-instructions'}
              required
              className="w-full rounded-2xl border-[2px] border-[var(--mt-gray-900)] bg-[var(--mt-surface)] px-3 py-3 pr-12 text-sm font-medium text-[var(--mt-gray-900)] outline-none transition focus:border-[var(--mt-green-primary)] focus:bg-white"
            />
            <button type="button" onClick={() => setShowAdminKey((visible) => !visible)} aria-label={showAdminKey ? 'Masquer la clé' : 'Afficher la clé'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
              {showAdminKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>}
        {adminMfaChallenge && <button type="button" onClick={() => { setAdminMfaChallenge(''); setAdminMfaCode(''); setAuthError(null); }} className="mt-3 text-xs font-bold text-slate-600 underline">Revenir à la clé d’accès</button>}
        {authError && <p id="admin-key-error" role="alert" className="mt-3 text-sm text-[#b93712]">{authError}</p>}
        <button type="submit" className="mt-5 w-full rounded-2xl bg-[var(--mt-green-primary)] px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0_rgba(33,23,18,0.95)] border-2 border-[var(--mt-gray-900)] transition hover:translate-y-[-1px]">
          Se connecter
        </button>
      </m.form>
    </div>
  );
}
