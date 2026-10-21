import React, { useEffect, useMemo, useState } from 'react';
import { Flag, Star, X } from 'lucide-react';

type TargetType = 'shop' | 'product';

interface TrustReview {
  id: number;
  rating: number;
  comment: string;
  author_name: string;
  created_at: string;
}

interface TrustOrder {
  id: number;
  shop_id: number;
  status: string;
  items?: { product_id: number }[];
}

interface CustomerTrustPanelProps {
  targetType: TargetType;
  targetId: number;
  targetName: string;
  isAuthenticated: boolean;
  onClose: () => void;
}

const reportReasons = [
  { value: 'inaccurate', label: 'Informations inexactes' },
  { value: 'fraud', label: 'Suspicion de fraude' },
  { value: 'inappropriate', label: 'Contenu inapproprié' },
  { value: 'unavailable', label: 'Élément indisponible' },
  { value: 'other', label: 'Autre' },
];

export const CustomerTrustPanel: React.FC<CustomerTrustPanelProps> = ({ targetType, targetId, targetName, isAuthenticated, onClose }) => {
  const [reviews, setReviews] = useState<TrustReview[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [orders, setOrders] = useState<TrustOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersAuthenticated, setOrdersAuthenticated] = useState(isAuthenticated);
  const [ordersError, setOrdersError] = useState('');
  const [rating, setRating] = useState(5);
  const [orderId, setOrderId] = useState('');
  const [comment, setComment] = useState('');
  const [reportReason, setReportReason] = useState('inaccurate');
  const [reportDetails, setReportDetails] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const eligibleOrders = useMemo(() => orders.filter((order) =>
    order.status === 'delivered'
    && (targetType === 'shop'
      ? order.shop_id === targetId
      : order.items?.some((item) => Number(item.product_id) === targetId)),
  ), [orders, targetId, targetType]);

  useEffect(() => {
    let active = true;
    fetch(`/api/customer-engagement/reviews?target_type=${targetType}&target_id=${targetId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les avis.');
        if (!active) return;
        setReviews(data.reviews || []);
        setAverageRating(data.average_rating ?? null);
        setReviewCount(Number(data.review_count) || 0);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Impossible de charger les avis.');
      });
    fetch('/api/auth/customer-orders', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (response.status === 401) return { unauthenticated: true };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger vos commandes.');
        return data;
      })
      .then((data) => {
        if (!active) return;
        if (data?.unauthenticated) {
          setOrdersAuthenticated(false);
          setOrders([]);
          return;
        }
        setOrdersAuthenticated(true);
        setOrders(data?.orders || []);
      })
      .catch((caught: unknown) => {
        if (active) setOrdersError(caught instanceof Error ? caught.message : 'Impossible de charger vos commandes.');
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });
    return () => { active = false; };
  }, [targetId, targetType]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = async (path: '/api/customer-engagement/reviews' | '/api/customer-engagement/reports', payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, target_type: targetType, target_id: targetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’envoyer votre demande.');
      setNotice(success);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’envoyer votre demande.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orderId) {
      setError('Sélectionnez une commande terminée pour déposer un avis.');
      return;
    }
    if (await submit('/api/customer-engagement/reviews', { order_id: Number(orderId), rating, comment }, 'Merci. Votre avis sera visible après modération.')) {
      setComment('');
      setOrderId('');
    }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await submit('/api/customer-engagement/reports', { reason: reportReason, details: reportDetails }, 'Votre signalement a été transmis à l’équipe de modération.')) {
      setReportDetails('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="customer-trust-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#fffdf9] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#b9441f]">Communauté MaTable</p><h2 id="customer-trust-title" className="mt-1 text-xl font-black text-slate-900">{targetName}</h2><p className="mt-1 text-sm text-slate-600">{averageRating == null ? 'Pas encore d’avis publié' : `★ ${averageRating}/5 · ${reviewCount} avis vérifié${reviewCount > 1 ? 's' : ''}`}</p></div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-700"><X className="h-5 w-5" /></button>
        </header>

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{notice}</p>}

        <div className="mt-5 max-h-48 space-y-3 overflow-y-auto">
          {reviews.map((review) => <article key={review.id} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{review.author_name}</strong><span className="text-amber-600" aria-label={`${review.rating} sur 5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>{review.comment && <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">{review.comment}</p>}<time className="mt-1 block text-[11px] text-slate-500">{new Date(review.created_at).toLocaleDateString('fr-FR')}</time></article>)}
          {reviews.length === 0 && <p className="text-sm text-slate-500">Les avis validés par l’équipe apparaîtront ici.</p>}
        </div>

        <div className="mt-6 grid gap-5 border-t border-slate-200 pt-5 sm:grid-cols-2">
          <form onSubmit={submitReview} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Star className="h-4 w-4 text-amber-500" />Donner un avis vérifié</h3>
            <p className="text-xs leading-5 text-slate-600">Seules les commandes clôturées peuvent donner lieu à un avis.</p>
            <select aria-label="Commande terminée" value={orderId} onChange={(event) => setOrderId(event.target.value)} required disabled={ordersLoading || eligibleOrders.length === 0} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100">
              <option value="">{ordersLoading ? 'Chargement de vos commandes…' : 'Choisir une commande terminée'}</option>
              {eligibleOrders.map((order) => <option key={order.id} value={order.id}>Commande #{order.id}</option>)}
            </select>
            {ordersError && <p role="alert" className="text-xs text-rose-800">{ordersError}</p>}
            {!ordersLoading && !ordersError && !ordersAuthenticated && <p className="text-xs text-slate-600">Connectez-vous à votre compte client pour déposer un avis vérifié. <a href="/connexion" onClick={onClose} className="font-bold text-[#0f4d3d] underline underline-offset-2">Se connecter</a></p>}
            {!ordersLoading && !ordersError && ordersAuthenticated && eligibleOrders.length === 0 && <p className="text-xs text-slate-600">{orders.length === 0 ? 'Aucune commande n’est associée à votre compte pour le moment.' : 'Une commande livrée de cette boutique ou contenant ce produit est nécessaire pour laisser un avis.'}</p>}
            <div className="flex gap-1" aria-label="Note sur cinq">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} étoile${value > 1 ? 's' : ''}`} aria-pressed={rating === value} className={`rounded p-1 text-2xl ${rating >= value ? 'text-amber-500' : 'text-slate-300'}`}>★</button>)}
            </div>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={3} placeholder="Votre expérience (facultatif)" className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" />
            <button type="submit" disabled={saving || ordersLoading || eligibleOrders.length === 0} className="min-h-10 rounded-full bg-[#0f4d3d] px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Envoi…' : 'Envoyer mon avis'}</button>
          </form>

          <form onSubmit={submitReport} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Flag className="h-4 w-4 text-rose-700" />Signaler un problème</h3>
            <p className="text-xs leading-5 text-slate-600">Un signalement est transmis à l’équipe de modération, pas au livreur ni à la boutique.</p>
            <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{reportReasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select>
            <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Expliquez brièvement (facultatif)" className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" />
            <button type="submit" disabled={saving || !ordersAuthenticated} className="min-h-10 rounded-full border border-rose-300 px-4 text-xs font-bold text-rose-800 disabled:opacity-50">{saving ? 'Envoi…' : 'Envoyer le signalement'}</button>
            {!ordersAuthenticated && <p className="text-xs text-slate-500">Connectez-vous à votre compte client pour envoyer un signalement. <a href="/connexion" onClick={onClose} className="font-bold text-[#0f4d3d] underline underline-offset-2">Se connecter</a></p>}
          </form>
        </div>
      </section>
    </div>
  );
};
