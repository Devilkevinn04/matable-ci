import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, LoaderCircle, Smartphone } from 'lucide-react';

interface PushConfigurationState {
  configured: boolean;
  public_key: string | null;
  subscribed_devices: number;
}

interface PushOptInProps {
  configUrl: string;
  subscriptionUrl: string;
  title: string;
  description: string;
  tone?: 'emerald' | 'sky';
  className?: string;
}

function decodeApplicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function PushOptIn({
  configUrl,
  subscriptionUrl,
  title,
  description,
  tone = 'emerald',
  className = '',
}: PushOptInProps) {
  const [configuration, setConfiguration] = useState<PushConfigurationState | null>(null);
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
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(configUrl, { credentials: 'include', cache: 'no-store' });
        const data = await response.json() as PushConfigurationState & { error?: string };
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
  }, [configUrl, supported]);

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
      const response = await fetch(subscriptionUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      const data = await response.json() as { error?: string };
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
        const response = await fetch(subscriptionUrl, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de retirer cet appareil.');
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

  const accent = tone === 'sky'
    ? {
      panel: 'border-sky-200 bg-sky-50',
      icon: 'bg-sky-100 text-sky-900',
      button: 'bg-sky-900 hover:bg-sky-800 focus-visible:ring-sky-700',
      done: 'text-sky-800',
    }
    : {
      panel: 'border-[#e7dfd3] bg-white',
      icon: 'bg-[#d1fae5] text-[#047857]',
      button: 'bg-[#065f46] hover:bg-[#047857] focus-visible:ring-emerald-700',
      done: 'text-emerald-800',
    };

  return (
    <section className={`rounded-2xl border p-4 ${accent.panel} ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accent.icon}`}><Bell className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>

      {!supported && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Ce navigateur ne prend pas en charge les notifications Push. Essayez depuis un navigateur récent en HTTPS.</p>}
      {supported && configuration && !configuration.configured && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Le service Push n’est pas encore configuré sur le serveur.</p>}
      {permission === 'denied' && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Les notifications sont bloquées dans ce navigateur. Réactivez-les dans les réglages du site.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs font-semibold text-rose-800">{error}</p>}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className={`flex min-h-9 items-center gap-2 text-[11px] font-semibold ${accent.done}`} aria-live="polite">
          {subscribed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5 text-slate-400" />}
          {loading ? 'Vérification de cet appareil…' : subscribed ? 'Notifications activées sur cet appareil' : 'Notifications désactivées sur cet appareil'}
          {configuration?.configured && <span className="text-slate-500">· {configuration.subscribed_devices} appareil(s)</span>}
        </div>
        {subscribed ? (
          <button type="button" onClick={disablePush} disabled={busy || loading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50">
            {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
            Désactiver
          </button>
        ) : (
          <button type="button" onClick={enablePush} disabled={busy || loading || !configuration?.configured || !supported} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-full px-3 text-xs font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${accent.button}`}>
            {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
            Activer les alertes
          </button>
        )}
      </div>
    </section>
  );
}
