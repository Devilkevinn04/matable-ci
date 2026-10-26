import React, { useEffect, useState } from 'react';
import type { Shop } from '../../types';

interface WhatsAppSubscriptionReminderConsentProps {
  shop: Pick<Shop, 'id' | 'whatsapp_subscription_reminders_enabled' | 'whatsapp_subscription_reminders_consent_at'>;
}

export const WhatsAppSubscriptionReminderConsent: React.FC<WhatsAppSubscriptionReminderConsentProps> = ({ shop }) => {
  const [enabled, setEnabled] = useState(Boolean(shop.whatsapp_subscription_reminders_enabled));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnabled(Boolean(shop.whatsapp_subscription_reminders_enabled));
  }, [shop.id, shop.whatsapp_subscription_reminders_enabled]);

  const updateConsent = async (nextEnabled: boolean) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/shops/${shop.id}/subscription-reminder-consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de modifier cette préférence.');
      setEnabled(result.enabled);
      setMessage(result.enabled ? 'Votre accord pour les rappels est enregistré.' : 'Votre accord pour les rappels est retiré.');
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
          disabled={saving}
          onChange={(event) => void updateConsent(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700"
        />
        <span>
          <strong className="block text-sm text-slate-900">Autoriser les rappels WhatsApp avant l’échéance</strong>
          <span className="mt-1 block text-xs leading-5 text-slate-600">Si WhatsApp Business est configuré sur MaTable.ci, des messages peuvent être envoyés à J−14, J−7, J−3 et J−1 avant la fin de l’essai ou de l’abonnement. Vous pouvez retirer votre accord ici à tout moment.</span>
          {enabled && shop.whatsapp_subscription_reminders_consent_at && <span className="mt-1 block text-[11px] text-slate-500">Accord donné le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.whatsapp_subscription_reminders_consent_at))}.</span>}
        </span>
      </label>
      {message && <p role="status" className="mt-2 pl-7 text-xs text-slate-600">{message}</p>}
    </section>
  );
};