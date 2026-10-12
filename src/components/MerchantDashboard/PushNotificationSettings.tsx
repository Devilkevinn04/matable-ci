import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, LoaderCircle, Smartphone } from 'lucide-react';
import type { Shop } from '../../types';

interface PushConfiguration {
  configured: boolean;
  public_key: string | null;
  subscribed_devices: number;
}

function decodeApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

interface PushNotificationSettingsProps {
  shop: Shop;
}

export const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({ shop }) => {
  const [configuration, setConfiguration] = useState<PushConfiguration | null>(null);
  const [supported] = useState(() => typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/shops/${shop.id}/push/config`, { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les réglages de notification.');
        if (cancelled) return;
        setConfiguration(data);
        if (supported) {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = await registration?.pushManager.getSubscription();
          if (!cancelled) setSubscribed(Boolean(subscription));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les réglages de notification.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [shop.id, supported]);

  const enablePush = async () => {
    if (!configuration?.configured || !configuration.public_key || !supported) return;
    setBusy(true);
    setError(null);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        if (nextPermission === 'denied') throw new Error('Les notifications sont bloquées dans votre navigateur. Autorisez-les dans les réglages du site.');
        throw new Error('Autorisez les notifications pour activer les alertes.');
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(configuration.public_key),
        });
      const response = await fetch(`/api/shops/${shop.id}/push/subscription`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer cet appareil.');
      setSubscribed(true);
      setConfiguration((previous) => previous
        ? { ...previous, subscribed_devices: Math.max(1, previous.subscribed_devices) }
        : previous);
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : 'Impossible d’activer les notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch(`/api/shops/${shop.id}/push/subscription`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de supprimer cet appareil du compte.');
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error('Le navigateur n’a pas pu désactiver cet appareil.');
      }
      setSubscribed(false);
      setConfiguration((previous) => previous
        ? { ...previous, subscribed_devices: Math.max(0, previous.subscribed_devices - 1) }
        : previous);
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Impossible de désactiver les notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-3xl rounded-2xl border border-[#e7dfd3] bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#eaf4ef] text-[#155544]"><Bell className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold text-[#211712]">Notifications sur cet appareil</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">Recevez les nouvelles commandes, les alertes de stock, les échéances d’abonnement, les changements de vérification et les annonces de MaTable.ci.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[#f7f4ee] p-3 text-xs leading-5 text-slate-600">
        L’autorisation est propre à ce navigateur et à cet appareil. Vous pouvez la retirer à tout moment ; les notifications WhatsApp restent indépendantes.
        {configuration?.configured && <span className="mt-1 block font-semibold text-slate-700">{configuration.subscribed_devices} appareil(s) associé(s) à cette boutique.</span>}
      </div>

      {!supported && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ce navigateur ne prend pas en charge les notifications Push. Essayez depuis un navigateur récent en HTTPS.</p>}
      {supported && configuration && !configuration.configured && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Le service Push n’est pas encore configuré sur le serveur.</p>}
      {permission === 'denied' && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Les notifications sont bloquées par le navigateur. Réactivez-les dans les réglages du site pour pouvoir vous abonner.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          {subscribed ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Smartphone className="h-4 w-4 text-slate-400" />}
          {loading ? 'Vérification de cet appareil…' : subscribed ? 'Notifications activées sur cet appareil' : 'Notifications désactivées sur cet appareil'}
        </div>
        {subscribed ? (
          <button type="button" onClick={disablePush} disabled={busy || loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-50">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
            Désactiver sur cet appareil
          </button>
        ) : (
          <button type="button" onClick={enablePush} disabled={busy || loading || !configuration?.configured || !supported} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Activer les notifications
          </button>
        )}
      </div>
    </section>
  );
};
