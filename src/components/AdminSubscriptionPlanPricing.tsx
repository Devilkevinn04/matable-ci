import { useEffect, useState } from 'react';
import type { SubscriptionTier } from '../utils/subscriptionFeatures';
import type { SubscriptionPrices } from '../utils/useSubscriptionPrices';

const planLabels: Record<SubscriptionTier, string> = {
  standard: 'Standard',
  premium: 'Premium',
  pro: 'Pro',
};

export function AdminSubscriptionPlanPricing() {
  const [prices, setPrices] = useState<SubscriptionPrices | null>(null);
  const [drafts, setDrafts] = useState<Record<SubscriptionTier, string>>({
    standard: '',
    premium: '',
    pro: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPrices = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/subscription-plans', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les tarifs.');
      setPrices(data.prices);
      setDrafts({
        standard: String(data.prices.standard),
        premium: String(data.prices.premium),
        pro: String(data.prices.pro),
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les tarifs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrices();
  }, []);

  const savePrices = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const nextPrices = Object.fromEntries(
        (Object.keys(planLabels) as SubscriptionTier[]).map((tier) => [tier, Number(drafts[tier])]),
      ) as SubscriptionPrices;
      const response = await fetch('/api/admin/subscription-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prices: nextPrices, expected_prices: prices }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer les tarifs.');
      setPrices(data.prices);
      setDrafts({
        standard: String(data.prices.standard),
        premium: String(data.prices.premium),
        pro: String(data.prices.pro),
      });
      setNotice('Tarifs enregistrés. Les prochains paiements utiliseront ces montants.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer les tarifs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="admin-plan-prices-title" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-plan-prices-title" className="text-sm font-black text-slate-900">Tarifs des formules</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Montants mensuels en FCFA. Le tarif annuel correspond à 10 mensualités. Les paiements déjà effectués et leurs échéances ne sont pas modifiés; les changements s’appliquent aux prochains paiements.
          </p>
        </div>
        <button type="button" onClick={() => void loadPrices()} disabled={loading || saving} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
          Actualiser
        </button>
      </div>
      {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Chargement des tarifs…</p> : (
        <form onSubmit={(event) => void savePrices(event)} className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(planLabels) as SubscriptionTier[]).map((tier) => (
              <label key={tier} className="block text-xs font-bold text-slate-700">
                {planLabels[tier]} · FCFA/mois
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={drafts[tier]}
                  onChange={(event) => setDrafts((current) => ({ ...current, [tier]: event.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900"
                  aria-label={`Tarif mensuel ${planLabels[tier]} en FCFA`}
                />
                {prices && <span className="mt-1 block font-normal text-slate-500">Actuel : {new Intl.NumberFormat('fr-FR').format(prices[tier])} FCFA</span>}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!prices || saving || loading} className="min-h-10 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer les tarifs'}
            </button>
            {notice && <p role="status" className="text-xs font-semibold text-emerald-800">{notice}</p>}
            {error && <p role="alert" className="text-xs font-semibold text-rose-800">{error}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
