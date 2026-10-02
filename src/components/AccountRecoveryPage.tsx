import React, { useState } from 'react';
import { ArrowRight, MessageCircle, ShieldAlert, UserRound } from 'lucide-react';
import { AuthExperienceLayout } from './AuthExperienceLayout';

type AccountType = 'customer' | 'merchant';

interface AccountRecoveryPageProps {
  initialAccountType: AccountType;
  onBack: () => void;
}

export const AccountRecoveryPage: React.FC<AccountRecoveryPageProps> = ({ initialAccountType, onBack }) => {
  const [accountType, setAccountType] = useState<AccountType>(initialAccountType);
  const [contact, setContact] = useState('');
  const accountLabel = accountType === 'merchant' ? 'commerçant' : 'client';
  const contactLabel = accountType === 'merchant' ? 'E-mail ou numéro WhatsApp de la boutique' : 'Adresse e-mail du compte';
  const message = `Bonjour, j’ai besoin d’aide pour récupérer l’accès à mon compte ${accountLabel}.${contact.trim() ? ` Mon contact de compte : ${contact.trim()}.` : ''} Je ne communiquerai pas mon mot de passe ni mon code PIN.`;
  const whatsappUrl = `https://wa.me/2250102749775?text=${encodeURIComponent(message)}`;

  return (
    <AuthExperienceLayout
      eyebrow="Assistance compte"
      title="Retrouver l’accès à votre compte."
      description="L’équipe d’assistance vous aidera à vérifier votre compte avant toute récupération d’accès."
      imageAlt="Assistance MaTable.ci pour les comptes clients et commerçants"
      onBack={onBack}
      topPrompt=""
      topActionLabel=""
    >
      <div>
        <p className="text-sm font-bold text-[#e6572b]">Récupération d’accès</p>
        <h2 className="mt-1 text-2xl font-extrabold text-[#25231f]">Quel compte souhaitez-vous récupérer ?</h2>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-[#f0eee7] p-1" role="group" aria-label="Type de compte à récupérer">
          <button type="button" aria-pressed={accountType === 'customer'} onClick={() => { setAccountType('customer'); setContact(''); }} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${accountType === 'customer' ? 'bg-white text-[#0f4d3d] shadow-sm' : 'text-[#59655c]'}`}><UserRound className="mr-1.5 inline h-4 w-4" />Client</button>
          <button type="button" aria-pressed={accountType === 'merchant'} onClick={() => { setAccountType('merchant'); setContact(''); }} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${accountType === 'merchant' ? 'bg-white text-[#0f4d3d] shadow-sm' : 'text-[#59655c]'}`}>Commerçant</button>
        </div>
        <label className="mt-5 block text-sm font-semibold text-[#34463d]">{contactLabel}<input type="text" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete={accountType === 'merchant' ? 'tel' : 'email'} className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/10" placeholder={accountType === 'merchant' ? '+225 07 00 11 22 33' : 'vous@exemple.ci'} /></label>
  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>La récupération est traitée par l’assistance. Ne transmettez jamais votre mot de passe ni votre code PIN.</p></div>
  <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55]"><MessageCircle className="h-4 w-4" />Contacter l’assistance<ArrowRight className="h-4 w-4" /></a>
  <a href={accountType === 'merchant' ? '/app' : '/connexion'} className="mt-4 block py-2 text-center text-sm font-bold text-[#0f4d3d] hover:text-[#e6572b]">Retour à la connexion</a>
      </div>
    </AuthExperienceLayout>
  );
};
