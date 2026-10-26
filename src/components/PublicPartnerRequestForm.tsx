import React, { useState } from 'react';

export const PublicPartnerRequestForm: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await fetch('/api/advertising/partner-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_name: values.get('contact_name'),
          company_name: values.get('company_name'),
          email: values.get('email'),
          phone: values.get('phone'),
          requested_format: values.get('requested_format'),
          objective: values.get('objective'),
          message: values.get('message'),
          privacy_consent: values.get('privacy_consent') === 'on',
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Impossible de transmettre votre demande.');
      form.reset();
      setNotice('Votre demande a été transmise. Notre équipe la traitera manuellement, sans engagement ni paiement automatique.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Impossible de transmettre votre demande.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details id="public-partner-request" className="mx-auto mt-5 max-w-5xl rounded-2xl border border-[#e0d5c6] bg-[#FFFFFF] p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-extrabold text-[#065f46]">Vous représentez une marque ou une structure ? Proposer un partenariat</summary>
      <div className="mt-3">
        <p className="text-sm leading-5 text-[#647067]">Les propositions externes sont étudiées au cas par cas. Cette demande ne crée ni campagne ni paiement automatique.</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">{notice}</p>}
        <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">Nom du contact *
            <input name="contact_name" required maxLength={100} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">Entreprise ou structure *
            <input name="company_name" required maxLength={120} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">E-mail *
            <input name="email" type="email" required maxLength={254} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">Téléphone
            <input name="phone" type="tel" maxLength={32} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700">Format souhaité *
            <select name="requested_format" required className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="partnership">Partenariat</option>
              <option value="banner">Bannière</option>
              <option value="product">Produit</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Objectif *
            <input name="objective" required maxLength={120} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-700 sm:col-span-2">Votre proposition *
            <textarea name="message" required minLength={10} maxLength={1000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="flex items-start gap-2 text-xs leading-5 text-slate-600 sm:col-span-2">
            <input name="privacy_consent" type="checkbox" required className="mt-1 accent-[#047857]" />
            <span>J’accepte l’utilisation de ces coordonnées pour étudier et traiter cette demande. *</span>
          </label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-[#047857] px-5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-start">{busy ? 'Transmission…' : 'Envoyer une demande'}</button>
        </form>
      </div>
    </details>
  );
};
