import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Eye, Megaphone, MousePointer2, Package, QrCode, RefreshCw, Route, ShoppingBag, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Shop } from '../../types';
import { getSubscriptionAnalyticsDayLimit } from '../../utils/subscriptionFeatures';

type DailyAnalytics = {
  date: string;
  page_views: number;
  unique_visitors: number;
  orders: number;
  order_value: number;
};

type ProductAnalytics = {
  product_id: number;
  title: string;
  views: number;
  clicks: number;
};

type FunnelStep = {
  step: string;
  count: number;
  conversion_from_previous: number;
  conversion_from_visit: number;
};

type PageAnalytics = {
  path: string;
  views: number;
  visitors: number;
};

type CampaignAnalytics = {
  campaign: string;
  visits: number;
  visitors: number;
  product_views: number;
  product_clicks: number;
  cart_adds: number;
  checkouts: number;
  order_events: number;
  orders: number;
  sales: number;
  whatsapp_clicks: number;
  conversion_rate: number;
};

type ProAnalytics = {
  days: number;
  summary: {
    page_views: number;
    unique_visitors: number;
    orders: number;
    order_value: number;
    whatsapp_clicks: number;
    product_views: number;
    product_clicks: number;
    qr_scans?: number;
    qr_visitors?: number;
  };
  daily: DailyAnalytics[];
  top_products: ProductAnalytics[];
  funnel?: FunnelStep[];
  top_pages?: PageAnalytics[];
  co_viewed_products?: Array<{
    product_a: number;
    product_b: number;
    title_a: string | null;
    title_b: string | null;
    sessions: number;
  }>;
  campaigns?: CampaignAnalytics[];
};

const funnelLabels: Record<string, string> = {
  visite: 'Visite de la vitrine',
  produit_vu: 'Article consulté',
  panier: 'Ajout au panier',
  commande_commencee: 'Commande commencée',
  commande_creee: 'Commande envoyée',
};

const campaignLabels: Record<string, string> = {
  qr: 'QR code',
};

function campaignLabel(campaign: string) {
  return campaignLabels[campaign] || campaign;
}

const numberFormat = new Intl.NumberFormat('fr-FR');
const currencyFormat = new Intl.NumberFormat('fr-FR');
const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function formatCurrency(value: number) {
  return `${currencyFormat.format(value)} F`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: 'green' | 'orange' | 'blue' | 'gold';
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    orange: 'bg-orange-50 text-orange-800 ring-orange-100',
    blue: 'bg-sky-50 text-sky-800 ring-sky-100',
    gold: 'bg-amber-50 text-amber-800 ring-amber-100',
  };

  return (
    <div className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 shadow-[0_3px_12px_rgba(41,45,42,.03)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold leading-5 text-slate-600">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-black tracking-tight text-[#183b31] sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p>
    </div>
  );
}

function DailyBars({
  title,
  description,
  rows,
  valueFor,
  color,
  formatValue,
}: {
  title: string;
  description: string;
  rows: DailyAnalytics[];
  valueFor: (row: DailyAnalytics) => number;
  color: string;
  formatValue: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...rows.map(valueFor));
  const tickIndexes = Array.from(new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]));

  return (
    <section className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5" aria-label={title}>
      <div>
        <h3 className="font-extrabold text-[#183b31]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {rows.length ? (
        <>
          <div className="mt-5 grid h-36 grid-cols-[36px_minmax(0,1fr)] gap-2 sm:h-44 sm:grid-cols-[48px_minmax(0,1fr)]">
            <div className="flex flex-col justify-between pb-1 text-right text-[10px] tabular-nums text-slate-400" aria-hidden="true">
              <span>{formatValue(maxValue)}</span>
              <span>{formatValue(Math.round(maxValue / 2))}</span>
              <span>0</span>
            </div>
            <div
              className="relative flex min-w-0 items-end gap-[3px] border-b border-l border-slate-200 px-1 pb-1"
              role="img"
              aria-label={`${title}: ${rows.map((row) => `${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${row.date}T12:00:00`))}, ${formatValue(valueFor(row))}`).join('; ')}`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col justify-between pb-1" aria-hidden="true">
                <span className="border-t border-dashed border-slate-100" />
                <span className="border-t border-dashed border-slate-100" />
                <span className="border-t border-slate-200" />
              </div>
              {rows.map((row) => {
                const value = valueFor(row);
                const height = value ? Math.max(4, (value / maxValue) * 100) : 0;
                return (
                  <div key={row.date} className="relative z-[1] flex h-full min-w-0 flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-3 rounded-t-[3px] transition-[height] duration-300 sm:max-w-4"
                      style={{ height: `${height}%`, backgroundColor: color, opacity: value ? 0.85 : 0.12 }}
                      title={`${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${row.date}T12:00:00`))} : ${formatValue(value)}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="ml-10 mt-2 flex justify-between text-[10px] font-medium text-slate-400 sm:ml-14">
            {tickIndexes.map((index) => (
              <span key={rows[index].date}>{shortDateFormat.format(new Date(`${rows[index].date}T12:00:00`))}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 grid h-36 place-items-center rounded-xl bg-[#faf9f5] px-4 text-center text-sm text-slate-500">
          Les données apparaîtront ici dès que votre boutique aura reçu de l’activité.
        </div>
      )}
    </section>
  );
}

export function ProAnalyticsPanel({ shop, compact = false }: { shop: Shop; compact?: boolean }) {
  const maxDays = shop.admin_mode ? 90 : getSubscriptionAnalyticsDayLimit(shop.subscription?.plan, shop.subscription?.planFeatures);
  const [days, setDays] = useState(compact ? Math.min(7, maxDays) : maxDays);
  const [analytics, setAnalytics] = useState<ProAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const canUseAnalytics = shop.admin_mode || shop.subscription?.isActive === true;

  useEffect(() => {
    setDays(compact ? Math.min(7, maxDays) : maxDays);
  }, [compact, maxDays]);

  useEffect(() => {
    if (!canUseAnalytics) {
      setAnalytics(null);
      setLoading(false);
      return;
    }
    let isCurrentRequest = true;
    setLoading(true);
    setError('');
    fetch(`/api/shops/${shop.id}/analytics?days=${days}`, { credentials: 'include' })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger les statistiques.';
          throw new Error(message);
        }
        return payload as ProAnalytics;
      })
      .then((payload) => { if (isCurrentRequest) setAnalytics(payload); })
      .catch((caught: unknown) => {
        if (isCurrentRequest) setError(caught instanceof Error ? caught.message : 'Impossible de charger les statistiques.');
      })
      .finally(() => { if (isCurrentRequest) setLoading(false); });
    return () => { isCurrentRequest = false; };
  }, [canUseAnalytics, days, refreshKey, shop.id]);

  const periods = Array.from(new Set([7, 30, 90, maxDays])).filter((period) => period <= maxDays);
  const dailyRows = useMemo(() => analytics?.daily || [], [analytics?.daily]);
  const metrics = [
    { icon: Eye, label: 'Visites de la vitrine', value: numberFormat.format(analytics?.summary.page_views ?? 0), detail: `${numberFormat.format(analytics?.summary.unique_visitors ?? 0)} visiteurs distincts · après consentement`, tone: 'green' as const },
    { icon: ShoppingBag, label: 'Commandes reçues', value: numberFormat.format(analytics?.summary.orders ?? 0), detail: 'Commandes non annulées', tone: 'orange' as const },
    { icon: MousePointer2, label: 'Clics WhatsApp', value: numberFormat.format(analytics?.summary.whatsapp_clicks ?? 0), detail: 'Clics suivis depuis les reçus de commande', tone: 'blue' as const },
    { icon: Wallet, label: 'Valeur des commandes', value: formatCurrency(analytics?.summary.order_value ?? 0), detail: 'Montant demandé, pas un paiement encaissé', tone: 'gold' as const },
  ];

  if (!canUseAnalytics) {
    return (
      <section className="max-w-3xl rounded-2xl border border-[#e7dfd3] bg-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Statistiques de la boutique</p>
        <h3 className="mt-1 text-lg font-extrabold text-slate-900">Suivez la visibilité de votre boutique</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">Les statistiques sont accessibles pendant un essai ou un abonnement actif.</p>
      </section>
    );
  }

  if (compact) {
    const daily = dailyRows.slice(-7);
    const maxOrders = Math.max(1, ...daily.map((day) => day.orders));
    return (
      <section aria-labelledby="merchant-overview-analytics-title" className="rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-emerald-800">Votre activité</p>
            <h3 id="merchant-overview-analytics-title" className="mt-1 text-lg font-black text-[#183b31]">Cette semaine</h3>
          </div>
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} aria-label="Actualiser les statistiques" className="grid h-9 w-9 place-items-center rounded-full border border-[#dfe8dd] text-[#047857] hover:bg-emerald-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
        {error && <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{error}</div>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#f4f7f3] p-3"><p className="text-[10px] font-bold text-slate-500">Visiteurs</p><p className="mt-1 text-xl font-black text-[#183b31]">{numberFormat.format(analytics?.summary.unique_visitors ?? 0)}</p></div>
          <div className="rounded-xl bg-[#fff5eb] p-3"><p className="text-[10px] font-bold text-slate-500">Commandes</p><p className="mt-1 text-xl font-black text-[#a64a1f]">{numberFormat.format(analytics?.summary.orders ?? 0)}</p></div>
        </div>
        {loading && !analytics && <p role="status" className="mt-3 text-xs text-slate-500">Chargement…</p>}
        {!loading && !error && !daily.length && <p className="mt-4 rounded-xl bg-[#faf9f5] p-4 text-xs leading-5 text-slate-500">Les visites apparaîtront ici dès que votre vitrine recevra de l’activité.</p>}
        {daily.length > 0 && (
          <div className="mt-4">
            <div className="flex h-16 items-end gap-1.5" role="img" aria-label="Commandes reçues chaque jour cette semaine">
              {daily.map((day) => (
                <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${shortDateFormat.format(new Date(`${day.date}T12:00:00`))} : ${day.orders} commande(s)`}>
                  <span className="text-[9px] font-bold tabular-nums text-slate-500">{day.orders || ''}</span>
                  <span className="w-full max-w-7 rounded-t bg-[#e77a3d]" style={{ height: `${day.orders ? Math.max(12, (day.orders / maxOrders) * 38) : 3}px`, opacity: day.orders ? 1 : 0.2 }} />
                  <span className="text-[9px] text-slate-400">{new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' }).format(new Date(`${day.date}T12:00:00`))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {analytics && <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500">Les montants des commandes ne signifient pas que le paiement a été encaissé sur MaTable.ci.</p>}
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-4" aria-labelledby="merchant-pro-analytics-title">
      <header className="overflow-hidden rounded-[1.5rem] bg-[#123e32] p-5 text-white shadow-[0_12px_30px_rgba(18,62,50,.12)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Aperçu de votre boutique
            </p>
            <h2 id="merchant-pro-analytics-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Vos statistiques</h2>
            <p className="mt-2 max-w-xl text-xs leading-5 text-emerald-50/80 sm:text-sm">Comprenez les visites, les commandes et les articles qui attirent l’attention.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Période des statistiques">
            {periods.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={days === period}
                onClick={() => setDays(period)}
                className={`min-h-10 rounded-full px-4 text-xs font-extrabold transition ${days === period ? 'bg-[#f0ba80] text-[#292d2a]' : 'border border-white/25 bg-white/5 text-white hover:bg-white/10'}`}
              >
                {period} jours
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-[11px] text-emerald-50/80">
          <p>Formule {shop.subscription?.plan || 'Standard'} · données sur {analytics?.days || days} jours · visites comptées après consentement</p>
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/25 px-3 font-bold text-white transition hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="min-h-10 rounded-full border border-rose-300 bg-white px-4 text-xs font-bold">Réessayer</button>
        </div>
      )}
      {loading && !analytics && <p role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Chargement de vos statistiques…</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyBars
          title="Visites de la vitrine"
          description="Nombre de consultations mesurées chaque jour."
          rows={dailyRows}
          valueFor={(day) => day.page_views}
          color="#087c5b"
          formatValue={(value) => numberFormat.format(value)}
        />
        <DailyBars
          title="Commandes reçues"
          description="Commandes enregistrées et non annulées, par jour."
          rows={dailyRows}
          valueFor={(day) => day.orders}
          color="#e77a3d"
          formatValue={(value) => numberFormat.format(value)}
        />
      </div>

      <section aria-labelledby="merchant-analytics-details-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white">
        <div className="border-b border-[#eee8dc] px-4 py-4 sm:px-5">
          <h3 id="merchant-analytics-details-title" className="font-extrabold text-[#183b31]">Autres indicateurs</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Interactions suivies avec le consentement du visiteur.</p>
        </div>
        <div className="grid divide-y divide-[#eee8dc] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="flex items-center gap-3 p-4 sm:p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-800"><Users className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[11px] font-semibold text-slate-500">Visiteurs distincts</p><p className="mt-1 font-black text-[#183b31]">{numberFormat.format(analytics?.summary.unique_visitors ?? 0)}</p></div></div>
          <div className="flex items-center gap-3 p-4 sm:p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-800"><Package className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[11px] font-semibold text-slate-500">Vues des produits</p><p className="mt-1 font-black text-[#183b31]">{numberFormat.format(analytics?.summary.product_views ?? 0)}</p></div></div>
          <div className="flex items-center gap-3 p-4 sm:p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><MousePointer2 className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-[11px] font-semibold text-slate-500">Clics sur les produits</p><p className="mt-1 font-black text-[#183b31]">{numberFormat.format(analytics?.summary.product_clicks ?? 0)}</p></div></div>
        </div>
      </section>

      <section aria-labelledby="merchant-top-products-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white">
        <div className="border-b border-[#eee8dc] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2"><Package className="h-4 w-4 text-emerald-800" aria-hidden="true" /><h3 id="merchant-top-products-title" className="font-extrabold text-[#183b31]">Articles qui attirent le plus</h3></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Classés selon les vues enregistrées pendant la période choisie.</p>
        </div>
        {analytics?.top_products.length ? (
          <ol className="divide-y divide-[#f0eee8]">
            {analytics.top_products.map((product, index) => {
              const maxViews = Math.max(1, ...analytics.top_products.map((item) => item.views));
              const engagementRate = product.views ? (product.clicks / product.views) * 100 : 0;
              return (
                <li key={product.product_id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f4f7f3] text-xs font-black text-[#315548]">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{product.title}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#087c5b]" style={{ width: `${Math.min(100, (product.views / maxViews) * 100)}%` }} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-[#183b31]">{numberFormat.format(product.views)} <span className="text-[10px] font-semibold text-slate-500">vues</span></p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{numberFormat.format(product.clicks)} clics · {engagementRate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune vue produit mesurée sur cette période. Partagez votre vitrine pour commencer.</p>
        )}
      </section>

      <section aria-labelledby="merchant-funnel-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white">
        <div className="border-b border-[#eee8dc] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2"><Route className="h-4 w-4 text-emerald-800" aria-hidden="true" /><h3 id="merchant-funnel-title" className="font-extrabold text-[#183b31]">Parcours jusqu’à la commande</h3></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Sessions anonymes ayant atteint chaque étape, avec consentement.</p>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="space-y-2.5">
            {(analytics?.funnel || []).map((step) => (
              <div key={step.step} className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f6f1] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-700">{funnelLabels[step.step] || step.step}</p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#087c5b]" style={{ width: `${Math.min(100, step.conversion_from_visit)}%` }} /></div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black tabular-nums text-[#183b31]">{numberFormat.format(step.count)}</p>
                  <p className="text-[10px] text-slate-500">{step.conversion_from_visit.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des visites</p>
                </div>
              </div>
            ))}
            {!(analytics?.funnel || []).length && <p className="rounded-xl bg-[#faf9f5] p-4 text-xs leading-5 text-slate-500">Le parcours apparaîtra dès les premières visites consenties.</p>}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-[#e7dfd3] p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><QrCode className="h-4 w-4" aria-hidden="true" /></span>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Scans du QR code</p>
                <p className="mt-0.5 font-black text-[#183b31]">{numberFormat.format(analytics?.summary.qr_scans ?? 0)} <span className="text-[10px] font-semibold text-slate-500">· {numberFormat.format(analytics?.summary.qr_visitors ?? 0)} visiteurs</span></p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pages les plus vues</p>
              <ul className="mt-2 space-y-1.5">
                {(analytics?.top_pages || []).slice(0, 5).map((page) => (
                  <li key={page.path} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-600">{page.path}</span>
                    <span className="shrink-0 font-bold tabular-nums text-[#183b31]">{numberFormat.format(page.views)}</span>
                  </li>
                ))}
                {!(analytics?.top_pages || []).length && <li className="text-xs text-slate-500">Aucune page mesurée.</li>}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="merchant-campaigns-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white">
        <div className="border-b border-[#eee8dc] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-emerald-800" aria-hidden="true" /><h3 id="merchant-campaigns-title" className="font-extrabold text-[#183b31]">Campagnes et partages</h3></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Résultats des liens contenant <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">?src=campagne</code> et des scans de votre QR code. Les commandes sont rattachées lorsque le client a consenti au suivi.</p>
        </div>
        {(analytics?.campaigns || []).length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-xs">
              <thead className="bg-[#faf9f5] text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 sm:px-5">Campagne</th>
                  <th scope="col" className="px-3 py-3 text-right">Visiteurs</th>
                  <th scope="col" className="px-3 py-3 text-right">Articles</th>
                  <th scope="col" className="px-3 py-3 text-right">Panier</th>
                  <th scope="col" className="px-3 py-3 text-right">Commandes</th>
                  <th scope="col" className="px-3 py-3 text-right">Ventes</th>
                  <th scope="col" className="px-3 py-3 text-right">WhatsApp</th>
                  <th scope="col" className="px-4 py-3 text-right sm:px-5">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0eee8]">
                {(analytics?.campaigns || []).map((campaign) => (
                  <tr key={campaign.campaign} className="align-top">
                    <th scope="row" className="px-4 py-3 font-bold text-[#183b31] sm:px-5">
                      <span className="block">{campaignLabel(campaign.campaign)}</span>
                      <code className="mt-0.5 block text-[10px] font-medium text-slate-500">src={campaign.campaign}</code>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      <span className="block font-bold text-[#183b31]">{numberFormat.format(campaign.visitors)}</span>
                      <span className="text-[10px] text-slate-500">{numberFormat.format(campaign.visits)} vues</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      <span className="block font-bold text-[#183b31]">{numberFormat.format(campaign.product_views)}</span>
                      <span className="text-[10px] text-slate-500">{numberFormat.format(campaign.product_clicks)} clics</span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[#183b31]">{numberFormat.format(campaign.cart_adds)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      <span className="block font-bold text-[#183b31]">{numberFormat.format(campaign.orders)}</span>
                      <span className="text-[10px] text-slate-500">{numberFormat.format(campaign.checkouts)} départs</span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[#183b31]">{formatCurrency(campaign.sales)}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-[#183b31]">{numberFormat.format(campaign.whatsapp_clicks)}</td>
                    <td className="px-4 py-3 text-right font-black tabular-nums text-[#087c5b] sm:px-5">{campaign.conversion_rate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Aucune campagne mesurée sur cette période. Partagez un lien avec <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">?src=</code> ou utilisez votre QR code pour suivre les retombées.</p>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-[#eadfce] bg-[#fffaf2] p-4 text-xs leading-5 text-[#6b6255]">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-[#93602e]" aria-hidden="true" />
        <p><span className="font-bold text-[#4c4031]">À propos des montants :</span> les commandes affichées sont les demandes enregistrées sur MaTable.ci. Leur valeur n’indique pas qu’un paiement a été encaissé ni confirmé.</p>
      </div>

    </section>
  );
}
