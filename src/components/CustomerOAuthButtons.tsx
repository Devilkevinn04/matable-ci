import React, { useEffect, useState } from 'react';
import { Apple } from 'lucide-react';

interface OAuthProviders {
  google: boolean;
  apple: boolean;
}

interface CustomerOAuthButtonsProps {
  returnTo: string;
}

export const CustomerOAuthButtons: React.FC<CustomerOAuthButtonsProps> = ({ returnTo }) => {
  const [providers, setProviders] = useState<OAuthProviders>({ google: false, apple: false });

  useEffect(() => {
    let active = true;
    fetch('/api/auth/customer-oauth/providers', { credentials: 'include', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && data) setProviders({ google: data.google === true, apple: data.apple === true });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!providers.google && !providers.apple) return null;
  const query = new URLSearchParams({ return_to: returnTo }).toString();
  const buttonClass = 'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d9ded7] bg-white px-3 py-2.5 text-sm font-bold text-[#25231f] transition hover:border-[#176b55] hover:bg-[#f8faf7]';

  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold text-[#778179]"><span className="h-px flex-1 bg-[#e6e4dc]" /><span>Ou continuer avec</span><span className="h-px flex-1 bg-[#e6e4dc]" /></div>
      <div className={`grid gap-2 ${providers.google && providers.apple ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {providers.google && <a href={`/api/auth/customer-oauth/google/start?${query}`} className={buttonClass}><span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-[#dadce0] text-sm font-black text-[#4285f4]">G</span>Continuer avec Google</a>}
        {providers.apple && <a href={`/api/auth/customer-oauth/apple/start?${query}`} className={buttonClass}><Apple aria-hidden="true" className="h-4 w-4 fill-current" />Continuer avec Apple</a>}
      </div>
    </div>
  );
};
