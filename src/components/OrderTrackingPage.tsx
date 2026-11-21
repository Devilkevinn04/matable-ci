// Page publique de suivi d’une commande : /suivi/:orderId#jeton
// Accessible sans compte, depuis l’écran de confirmation ou la liste « Mes commandes » de l’appareil.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Store } from 'lucide-react';
import { formatFCFA } from '../utils/format';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { OrderProgress } from './OrderProgress';

interface TrackedOrder {
  id: number;
  status: string;
  created_at: string;
  total_amount: number;
  items: { product_title: string; quantity: number; selected_size?: string; selected_color?: string }[];
  shop: { name: string; slug: string; category: string };
}

const ACTIVE = new Set(['pending', 'confirmed', 'preparing', 'ready']);

export function OrderTrackingPage() {
  const { orderId } = useParams();
  const [token] = useState(() => {
    try {
      return decodeURIComponent(window.location.hash.replace(/^#/, ''));
    } catch {
      return '';
    }
  });
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!orderId || !token) {
      setError('Ce lien de suivi est incomplet. Ouvrez-le depuis l’écran de confirmation de votre commande.');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      const data = await response.json() as TrackedOrder & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Commande introuvable.');
      setOrder(data);
      setError('');
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la commande.');
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => { void load(); }, [load]);
  // Tant que la commande est en cours, l’état se rafraîchit seul (page visible uniquement).
  useVisibilityPolling(load, 30_000, Boolean(order && ACTIVE.has(order.status)));

  useEffect(() => {
    document.title = order ? `Commande n° ${order.id} · ${order.shop.name} | MaTable` : 'Suivi de commande | MaTable';
  }, [order]);

  return (
    <main className="min-h-[100svh] bg-[#FAF8F2] px-4 pb-12 pt-4 text-[#292d2a]">
      <div className="mx-auto max-w-lg">
        <Link to={order ? `/${encodeURIComponent(order.shop.slug)}` : '/'} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--mt-green-deep)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {order ? order.shop.name : 'MaTable'}
        </Link>

        {loading ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Chargement de la commande">
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-[#ebe6dc]" />
            <div className="h-32 animate-pulse rounded-3xl bg-[#ebe6dc]" />
          </div>
        ) : error ? (
          <div role="alert" className="mt-4 rounded-3xl border border-[#e8b8a4] bg-white p-6 text-center">
            <h1 className="text-lg font-extrabold">Suivi indisponible</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-4 text-sm font-bold text-white">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Réessayer
            </button>
          </div>
        ) : order && (
          <>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">Commande n° {order.id}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Envoyée le {new Date(order.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>

            <section className="mt-5 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm" aria-live="polite">
              <OrderProgress status={order.status} category={order.shop.category} />
            </section>

            <section className="mt-4 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold">Votre commande</h2>
              <ul className="mt-3 divide-y divide-[#eee8df]">
                {order.items.map((item, index) => (
                  <li key={index} className="py-2.5 text-sm">
                    <span className="font-semibold">{item.quantity} × {item.product_title}</span>
                    {(item.selected_size || item.selected_color) && (
                      <span className="text-slate-500"> · {[item.selected_size && `Taille ${item.selected_size}`, item.selected_color].filter(Boolean).join(' · ')}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-baseline justify-between border-t border-[#eee8df] pt-3">
                <span className="text-sm font-bold">Total</span>
                <span className="text-lg font-black tabular-nums">{formatFCFA(order.total_amount)}</span>
              </div>
            </section>

            <Link to={`/${encodeURIComponent(order.shop.slug)}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#dfe8dd] bg-white px-4 text-sm font-bold text-[var(--mt-green-deep)]">
              <Store className="h-4 w-4" aria-hidden="true" /> Retourner à la boutique
            </Link>
            {updatedAt && ACTIVE.has(order.status) && (
              <p className="mt-3 text-center text-xs text-slate-500">
                Mis à jour à {updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · actualisation automatique
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
