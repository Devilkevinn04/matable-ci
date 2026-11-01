import React, { useState } from 'react';
import { ArrowRight, MessageCircle, ShieldAlert, UserRound } from 'lucide-react';
import { AuthExperienceLayout } from './AuthExperienceLayout';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';

type AccountType = 'customer' | 'merchant';

interface AccountRecoveryPageProps {
  initialAccountType: AccountType;
  onBack: () => void;
}

export const AccountRecoveryPage: React.FC<AccountRecoveryPageProps> = ({ initialAccountType, onBack }) => {
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [contact, setContact] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [error, setError] = useState('');
  const accountLabel = accountType === 'merchant' ? 'commerçant' : 'client';
  const contactLabel = accountType === 'merchant' ? 'E-mail ou numéro WhatsApp de la boutique' : 'Adresse e-mail du compte';
  const message = `Bonjour, j’ai besoin d’aide pour récupérer l’accès à mon compte ${accountLabel}.${contact.trim() ? ` Mon contact de compte : ${contact.trim()}.` : ''} Je ne communiquerai pas mon mot de passe ni mon code PIN.`;
  const whatsappUrl = getSupportWhatsAppUrl(message);

  const requestPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequesting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/customer-password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’envoyer la demande.');
      setRequestSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Impossible d’envoyer la demande.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AuthExperienceLayout
      eyebrow="Assistance compte"
      title="Retrouver l’accès à votre compte."
      description={accountType === 'customer'
        ? 'Recevez un lien sécurisé pour choisir un nouveau mot de passe client.'
        : 'L’équipe d’assistance vous aidera à vérifier votre compte commerçant.'}
      imageAlt="Assistance MaTable.ci pour les comptes clients et commerçants"
      onBack={onBack}
      topPrompt=""
      topActionLabel=""
    >
      <div>
        <p className="text-sm font-bold text-[#F97316]">Récupération d’accès</p>
        <h2 className="mt-1 text-2xl font-extrabold text-[#292d2a]">Quel compte souhaitez-vous récupérer ?</h2>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[#f0eee7] p-1" role="group" aria-label="Type de compte à récupérer">
          <button type="button" aria-pressed={accountType === 'customer'} onClick={() => { setAccountType('customer'); setContact(''); setRequestSent(false); setError(''); }} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${accountType === 'customer' ? 'bg-white text-[#065f46] shadow-sm' : 'text-[#59655c]'}`}><UserRound className="mr-1.5 inline h-4 w-4" />Client</button>
          <button type="button" aria-pressed={accountType === 'merchant'} onClick={() => { setAccountType('merchant'); setContact(''); setRequestSent(false); setError(''); }} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${accountType === 'merchant' ? 'bg-white text-[#065f46] shadow-sm' : 'text-[#59655c]'}`}>Commerçant</button>
        </div>
        {accountType === 'customer' ? (
          requestSent ? (
            <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">Si un compte client correspond à cette adresse, un lien de réinitialisation va être envoyé. Vérifiez aussi vos courriers indésirables.</p>
          ) : (
            <form onSubmit={requestPasswordReset}>
              <label className="mt-5 block text-sm font-semibold text-[#47534b]">{contactLabel}<input required type="email" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email" className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/10" placeholder="vous@exemple.ci" /></label>
              {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={requesting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#065f46] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#047857] disabled:cursor-wait disabled:opacity-60">
                <span>{requesting ? 'Envoi en cours…' : 'Envoyer le lien sécurisé'}</span><ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )
        ) : (
          <>
            <label className="mt-5 block text-sm font-semibold text-[#47534b]">{contactLabel}<input type="text" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="tel" className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#292d2a] outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/10" placeholder="+225 07 00 11 22 33" /></label>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>La récupération commerçant est traitée par l’assistance. Ne transmettez jamais votre mot de passe ni votre code PIN.</p></div>
            {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#065f46] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#047857]"><MessageCircle className="h-4 w-4" />Contacter l’assistance<ArrowRight className="h-4 w-4" /></a> : <p className="mt-5 text-sm text-slate-600">Le contact WhatsApp de l’assistance n’est pas encore configuré.</p>}
          </>
        )}
        <a href={accountType === 'merchant' ? '/app' : '/connexion'} className="mt-4 block py-2 text-center text-sm font-bold text-[#065f46] hover:text-[#F97316]">Retour à la connexion</a>
      </div>
    </AuthExperienceLayout>
  );
};
