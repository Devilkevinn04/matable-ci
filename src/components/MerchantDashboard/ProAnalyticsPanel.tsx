import React, { useEffect, useState } from 'react';
import type { Shop } from '../../types';
import { isSubscriptionFeatureIncluded } from '../../utils/subscriptionFeatures';

type ProAnalytics = {
  days: number;
  summary: { page_views: number; unique_visitors: number; orders: number; order_value: number; product_views: number; product_clicks: number };
  daily: { date: string; page_views: number; unique_visitors: number; orders: number; order_value: number }[];
  top_products: { product_id: number; title: string; views: number; clicks: number }[];
};

export function ProAnalyticsPanel({ shop }: { shop: Shop }) {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<ProAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const canUseAnalytics = shop.subscription?.isActive === true
    && isSubscriptionFeatureIncluded(shop.subscription.plan, 'advanced_analytics');

  useEffect(() => {
    if (!canUseAnalytics) return;
    let isCurrentRequest = true;
    setLoading(true);
    setError('');
    fetch(`/api/shops/${shop.id}/analytics?days=${days}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Impossible de charger les statistiques.');
        return payload as ProAnalytics;
      })
      .then((payload) => { if (isCurrentRequest) setAnalytics(payload); })
      .catch((caught: unknown) => {
        if (isCurrentRequest) setError(caught instanceof Error ? caught.message : 'Impossible de charger les statistiques.');
      })
      .finally(() => { if (isCurrentRequest) setLoading(false); });
    return () => { isCurrentRequest = false; };
  }, [canUseAnalytics, days, refreshKey, shop.id]);

  if (!canUseAnalytics) {
    return (
      <section className="max-w-3xl rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase text-emerald-800">Statistiques avancées · Pro</p>
        <h3 className="mt-1 text-lg font-extrabold text-slate-900">Suivez la visibilité de votre boutique</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">La formule Pro rassemble les visites consenties, les vues et clics produits, les commandes et leur valeur sur une période de 7 à 90 jours.</p>
      </section>
    );
  }

  const summaryItems = [
    { label: 'Visites consenties', value: analytics?.summary.page_views ?? 0 },
    { label: 'Sessions uniques', value: analytics?.summary.unique_visitors ?? 0 },
    { label: 'Commandes actionnables', value: analytics?.summary.orders ?? 0 },
    { label: 'Valeur des commandes', value: `${new Intl.NumberFormat('fr-FR').format(analytics?.summary.order_value ?? 0)} FCFA` },
    { label: 'Vues produits consenties', value: analytics?.summary.product_views ?? 0 },
    { label: 'Clics produits', value: analytics?.summary.product_clicks ?? 0 },
  ];

  return (
    <section className="max-w-5xl space-y-4" aria-labelledby="merchant-pro-analytics-title">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-bold uppercase text-emerald-800">Formule Pro</p>
          <h3 id="merchant-pro-analytics-title" className="mt-1 text-lg font-extrabold text-slate-900">Statistiques de la boutique</h3>
          <p className="mt-1 text-xs text-slate-500">Une visite n’est comptée que si le navigateur a accepté les statistiques.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
          Période
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2">
            <option value={7}>7 jours</option>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
          </select>
        </label>
      </div>

      {loading && <p role="status" className="text-sm text-slate-500">Chargement des statistiques…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span>{error}</span><button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="min-h-9 rounded-md border border-rose-300 bg-white px-3 text-xs font-bold">Réessayer</button></div>}
      <dl className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => <div key={item.label}><dt className="text-xs font-semibold text-slate-500">{item.label}</dt><dd className="mt-1 text-xl font-black text-slate-900">{typeof item.value === 'number' ? new Intl.NumberFormat('fr-FR').format(item.value) : item.value}</dd></div>)}
      </dl>
      <p className="text-xs leading-5 text-slate-500">La valeur des commandes correspond aux commandes actionnables enregistrées sur MaTable.ci; elle ne représente pas un paiement encaissé par la plateforme.</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[620px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2.5 font-bold">Jour</th><th className="px-3 py-2.5 font-bold">Visites</th><th className="px-3 py-2.5 font-bold">Sessions</th><th className="px-3 py-2.5 font-bold">Commandes</th><th className="px-3 py-2.5 text-right font-bold">Valeur des commandes</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!analytics?.daily.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{loading ? 'Chargement…' : 'Aucune activité mesurée sur cette période.'}</td></tr>}
            {analytics?.daily.map((day) => <tr key={day.date}><td className="px-3 py-2.5 font-semibold text-slate-800">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${day.date}T00:00:00`))}</td><td className="px-3 py-2.5 tabular-nums">{new Intl.NumberFormat('fr-FR').format(day.page_views)}</td><td className="px-3 py-2.5 tabular-nums">{new Intl.NumberFormat('fr-FR').format(day.unique_visitors)}</td><td className="px-3 py-2.5 tabular-nums">{new Intl.NumberFormat('fr-FR').format(day.orders)}</td><td className="px-3 py-2.5 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(day.order_value)} FCFA</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-800">Produits les plus vus</div>
        <table className="w-full min-w-[480px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2.5 font-bold">Produit</th><th className="px-3 py-2.5 text-right font-bold">Vues consenties</th><th className="px-3 py-2.5 text-right font-bold">Clics</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!analytics?.top_products.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">{loading ? 'Chargement…' : 'Aucune vue produit consentie sur cette période.'}</td></tr>}
            {analytics?.top_products.map((product) => <tr key={product.product_id}><td className="px-3 py-2.5 font-semibold text-slate-800">{product.title}</td><td className="px-3 py-2.5 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(product.views)}</td><td className="px-3 py-2.5 text-right tabular-nums">{new Intl.NumberFormat('fr-FR').format(product.clicks)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
