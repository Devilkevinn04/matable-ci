import React from 'react';

interface TermsPrivacyConsentProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const TermsPrivacyConsent: React.FC<TermsPrivacyConsentProps> = ({ id, checked, onChange }) => (
  <label htmlFor={id} className="flex items-start gap-2.5 rounded-xl border border-[#dfd7ce] bg-white p-3 text-xs leading-5 text-[#47534b]">
    <input
      id={id}
      type="checkbox"
      required
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-[#047857]"
    />
    <span>
      J’accepte les{' '}
      <a href="/cgu" target="_blank" rel="noreferrer" className="font-bold text-[#047857] underline underline-offset-2">Conditions générales d’utilisation</a>
      {' '}et la{' '}
      <a href="/confidentialite" target="_blank" rel="noreferrer" className="font-bold text-[#047857] underline underline-offset-2">Politique de confidentialité</a>.
    </span>
  </label>
);
