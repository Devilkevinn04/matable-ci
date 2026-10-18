import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, RefreshCw, Send } from 'lucide-react';

interface PlatformAnnouncement {
  id: number;
  title: string;
  body: string;
  url: string;
  created_at: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
}

interface PushStatus {
  configured: boolean;
  subscribed_devices: number;
  announcements: PlatformAnnouncement[];
}

export const AdminPushAnnouncements: React.FC = () => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/app');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/push/status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger le statut Push.');
      setStatus(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le statut Push.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewing) {
      if (!status?.subscribed_devices) {
        setError('Aucun appareil marchand n’est abonné. Demandez aux commerçants d’activer les notifications Push avant de préparer une diffusion.');
        return;
      }
      setReviewing(true);
      return;
    }
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/push/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de publier cette annonce.');
      setNotice(`Annonce envoyée : ${data.delivery.sent} appareil(s) notifié(s), ${data.delivery.failed} échec(s), dans ${data.delivery.recipientShops} boutique(s) abonnée(s).`);
      setTitle('');
      setBody('');
      setReviewing(false);
      await refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Impossible de publier cette annonce.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-violet-800" />
          <div>
            <h3 className="text-xs font-black text-violet-950">Annonces Push aux commerçants</h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-violet-900">
              Diffuse une annonce sur les appareils des commerçants qui ont activé les notifications. Les commandes et alertes personnelles ne sont jamais envoyées par cette campagne.
            </p>
          </div>
        </div>
        <div className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status?.configured ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
          {loading ? 'Vérification…' : status?.configured ? 'Push configuré' : 'Push non configuré'}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-violet-950">
        <span>{loading ? 'Chargement du nombre d’appareils abonnés…' : status ? `${status.subscribed_devices} appareil(s) marchand actuellement abonné(s)` : 'Nombre d’appareils abonnés indisponible'}</span>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 font-bold disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </button>
      </div>

      {status && !status.configured && <p className="mt-3 rounded-xl bg-amber-100 p-3 text-xs leading-5 text-amber-950">Configurez VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT dans l’environnement de production pour activer les envois.</p>}
      {status?.configured && status.subscribed_devices === 0 && <p className="mt-3 rounded-xl bg-amber-100 p-3 text-xs leading-5 text-amber-950">Aucun appareil marchand n’est abonné pour le moment. Les commerçants doivent activer les notifications dans leur espace marchand avant qu’une annonce puisse être diffusée.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-100 p-3 text-xs text-rose-900">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-100 p-3 text-xs text-emerald-950">{notice}</p>}

      <form onSubmit={publish} className="mt-3 grid gap-2">
        <label className="sr-only" htmlFor="admin-push-title">Titre de l’annonce</label>
        <input id="admin-push-title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={100} placeholder="Titre de l’annonce" className="min-h-10 min-w-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-600" />
        <label className="sr-only" htmlFor="admin-push-body">Message de l’annonce</label>
        <textarea id="admin-push-body" value={body} onChange={(event) => setBody(event.target.value)} required minLength={3} maxLength={240} rows={2} placeholder="Message (240 caractères maximum)" className="min-h-16 min-w-0 resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-600" />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="sr-only" htmlFor="admin-push-url">Lien interne au clic</label>
          <input id="admin-push-url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={500} placeholder="Lien interne (ex. /)" className="min-h-10 min-w-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-600" />
          {reviewing && (
            <div className="rounded-xl border border-violet-200 bg-white p-3 sm:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Aperçu avant diffusion</p>
                  <p className="mt-1 break-words text-sm font-black text-slate-900">{title}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{body}</p>
                  <p className="mt-2 break-all text-[11px] text-slate-500">À l’ouverture : {url || 'Aucun lien'}</p>
                  <p className="mt-2 text-[11px] font-semibold text-violet-900">Destinataires : appareils actuellement abonnés ({status?.subscribed_devices ?? 0})</p>
                </div>
                <button type="button" onClick={() => setReviewing(false)} disabled={publishing} className="min-h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Modifier</button>
              </div>
            </div>
          )}
          <button type="submit" disabled={publishing || loading || !status?.configured || status.subscribed_devices === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-violet-800 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {publishing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {publishing ? 'Envoi en cours…' : reviewing ? 'Confirmer et envoyer' : 'Prévisualiser'}
          </button>
        </div>
      </form>

      {status?.announcements.length ? (
        <div className="mt-4 border-t border-violet-200 pt-3">
          <h4 className="text-[10px] font-black uppercase tracking-wide text-violet-900">Annonces récentes</h4>
          <ul className="mt-2 divide-y divide-violet-200">
            {status.announcements.slice(0, 5).map((announcement) => (
              <li key={announcement.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-slate-800"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" /><span className="truncate">{announcement.title}</span></span>
                <span className="text-slate-600">{announcement.sent_count} envoyé(s) · {announcement.failed_count} échec(s) · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(announcement.created_at))}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
