import React, { useCallback, useEffect, useState } from 'react';
import { Bell, LoaderCircle } from 'lucide-react';
import type { Shop } from '../../types';

interface PushConfiguration {
  configured: boolean;
  public_key: string | null;
}

function decodeApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const isSupported = () => typeof window !== 'undefined'
  && 'Notification' in window
  && 'serviceWorker' in navigator
  && 'PushManager' in window;

// Invite le commerçant à activer les alertes dès son arrivée après l'inscription.
// Le navigateur exige un geste explicite pour l'autorisation : un clic suffit.
export const MerchantPushPrompt: React.FC<{ shop: Shop }> = ({ shop }) => {
  const dismissKey = `matable-push-prompt-later-${shop.id}`;
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subscribe = useCallback(async (config: PushConfiguration) => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(config.public_key as string),
      });
    const response = await fetch(`/api/shops/${shop.id}/push/subscription`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Impossible d’enregistrer cet appareil.');
    }
  }, [shop.id]);

  useEffect(() => {
    if (shop.admin_mode || !isSupported()) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/shops/${shop.id}/push/config`, { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const config = await response.json() as PushConfiguration;
        if (cancelled || !config.configured || !config.public_key) return;
        setConfiguration(config);
        if (Notification.permission === 'granted') {
          await subscribe(config).catch(() => undefined);
          return;
        }
        if (window.sessionStorage.getItem(dismissKey) !== '1') setVisible(true);
      } catch {
        // L'invitation est optionnelle : aucune erreur bloquante.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [shop.id, shop.admin_mode, dismissKey, subscribe]);

  const dismiss = () => {
    window.sessionStorage.setItem(dismissKey, '1');
    setVisible(false);
  };

  const enable = async () => {
    if (!configuration) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notifications non autorisées. Vous pourrez réessayer à la prochaine connexion.');
      }
      await subscribe(configuration);
      setVisible(false);
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : 'Impossible d’activer les notifications.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const blocked = Notification.permission === 'denied';

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="merchant-push-title" className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#d1fae5] text-[#047857]"><Bell className="h-7 w-7" aria-hidden="true" /></span>
        <h2 id="merchant-push-title" className="mt-4 text-lg font-extrabold text-[#183b31]">Activez les alertes de commande</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {blocked
            ? 'Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages de votre navigateur, puis rechargez la page.'
            : 'Soyez prévenu dès qu’un client passe commande, même quand MaTable est fermé. Ce message reste affiché à chaque connexion tant que les alertes ne sont pas activées sur cet appareil.'}
        </p>
        {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{error}</p>}
        {!blocked && (
          <button type="button" onClick={() => void enable()} disabled={busy} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#123e32] px-5 text-sm font-bold text-white disabled:opacity-60">
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}Activer les alertes
          </button>
        )}
        <button type="button" onClick={dismiss} className="mt-2 min-h-11 w-full rounded-full text-sm font-bold text-slate-500 hover:bg-slate-100">Plus tard</button>
      </div>
    </div>
  );
};
