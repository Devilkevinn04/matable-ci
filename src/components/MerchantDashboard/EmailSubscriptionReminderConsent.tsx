import React, { useEffect, useState } from 'react';
import type { Shop } from '../../types';

interface EmailSubscriptionReminderConsentProps {
  shop: Pick<Shop, 'id' | 'email_subscription_reminders_enabled' | 'email_subscription_reminders_consent_at' | 'owner_email_configured'>;
}

export const EmailSubscriptionReminderConsent: React.FC<EmailSubscriptionReminderConsentProps> = ({ shop }) => {
  const [enabled, setEnabled] = useState(Boolean(shop.email_subscription_reminders_enabled));
  const [consentAt, setConsentAt] = useState(shop.email_subscription_reminders_consent_at || null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnabled(Boolean(shop.email_subscription_reminders_enabled));
    setConsentAt(shop.email_subscription_reminders_consent_at || null);
  }, [shop.id, shop.email_subscription_reminders_enabled, shop.email_subscription_reminders_consent_at]);

  const updateConsent = async (nextEnabled: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/shops/${shop.id}/subscription-email-reminder-consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de modifier cette préférence.');
      setEnabled(result.enabled);
      setConsentAt(result.consent_at || null);
      setMessage(result.enabled ? 'Votre accord pour les rappels par e-mail est enregistré.' : 'Votre accord pour les rappels par e-mail est retiré.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de modifier cette préférence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-y border-slate-200 py-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 focus-within:ring-2 focus-within:ring-emerald-700">
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving || (!shop.owner_email_configured && !enabled)}
          onChange={(event) => void updateConsent(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700"
        />
        <span>
          <strong className="block text-sm text-slate-900">Recevoir les rappels d’abonnement par e-mail</strong>
          <span className="mt-1 block text-xs leading-5 text-slate-600">
            En cas d’activation, MaTable pourra vous prévenir à J−14, J−7, J−3 et J−1 avant l’échéance. Vous pouvez retirer votre accord ici à tout moment.
            {!shop.owner_email_configured && ' Ajoutez d’abord une adresse e-mail dans le profil du responsable.'}
          </span>
          {enabled && consentAt && <span className="mt-1 block text-[11px] text-slate-500">Accord donné le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(consentAt))}.</span>}
        </span>
      </label>
      {message && <p role="status" className="mt-2 pl-7 text-xs text-slate-600">{message}</p>}
    </section>
  );
};
