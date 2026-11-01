import React, { useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { AuthExperienceLayout } from './AuthExperienceLayout';

interface CustomerPasswordResetPageProps {
  token: string;
  onBack: () => void;
}

export const CustomerPasswordResetPage: React.FC<CustomerPasswordResetPageProps> = ({ token, onBack }) => {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/customer-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de modifier le mot de passe.');
      setCompleted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible de modifier le mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthExperienceLayout
      eyebrow="Sécurité du compte"
      title="Choisissez un nouveau mot de passe."
      description="Le lien de réinitialisation est temporaire et ne peut être utilisé qu’une seule fois."
      imageAlt="Sécurisation d’un compte client MaTable.ci"
      onBack={onBack}
      topPrompt=""
      topActionLabel=""
    >
      <div>
        <p className="text-sm font-bold text-[#F97316]">Mot de passe client</p>
        <h2 className="mt-1 text-2xl font-extrabold text-[#292d2a]">Réinitialisation sécurisée</h2>
        {!token ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">Le lien est invalide ou incomplet. Demandez un nouveau lien depuis la page de récupération.</p>
        ) : completed ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <p role="status">Votre mot de passe a été modifié. Toutes les sessions existantes ont été déconnectées.</p>
            <button type="button" onClick={onBack} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#065f46] px-5 py-3 text-sm font-bold text-white hover:bg-[#047857]">Se connecter<ArrowRight className="h-4 w-4" /></button>
          </div>
        ) : (
          <form onSubmit={resetPassword} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-[#47534b]">
              Nouveau mot de passe
              <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/10" />
            </label>
            <label className="block text-sm font-semibold text-[#47534b]">
              Confirmer le mot de passe
              <input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/10" />
            </label>
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Utilisez au moins 8 caractères. Le lien expirera après 30 minutes.</span></p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#065f46] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#047857] disabled:cursor-wait disabled:opacity-60">
              <span>{submitting ? 'Modification…' : 'Enregistrer le nouveau mot de passe'}</span><ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </AuthExperienceLayout>
  );
};
