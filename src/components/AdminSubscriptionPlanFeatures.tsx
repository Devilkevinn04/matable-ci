import { useEffect, useState } from 'react';
import {
  parseSubscriptionProFeatures,
  type SubscriptionProFeatures,
} from '../utils/subscriptionFeatures';

export function AdminSubscriptionPlanFeatures() {
  const [features, setFeatures] = useState<SubscriptionProFeatures | null>(null);
  const [drafts, setDrafts] = useState({
    productLimit: '',
    productPhotoLimit: '',
    analyticsDayLimit: '',
    boostDiscountPercent: '',
  });
  const [unlimitedProducts, setUnlimitedProducts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadFeatures = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/subscription-plan-features', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les avantages Pro.');
      const loadedFeatures = parseSubscriptionProFeatures(data.pro_features);
      setFeatures(loadedFeatures);
      setDrafts({
        productLimit: loadedFeatures.productLimit === null ? '' : String(loadedFeatures.productLimit),
        productPhotoLimit: String(loadedFeatures.productPhotoLimit),
        analyticsDayLimit: String(loadedFeatures.analyticsDayLimit),
        boostDiscountPercent: String(loadedFeatures.boostDiscountPercent),
      });
      setUnlimitedProducts(loadedFeatures.productLimit === null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les avantages Pro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFeatures();
  }, []);

  const saveFeatures = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!features) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const proFeatures: SubscriptionProFeatures = {
        productLimit: unlimitedProducts ? null : Number(drafts.productLimit),
        productPhotoLimit: Number(drafts.productPhotoLimit),
        analyticsDayLimit: Number(drafts.analyticsDayLimit),
        boostDiscountPercent: Number(drafts.boostDiscountPercent),
      };
      const response = await fetch('/api/admin/subscription-plan-features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pro_features: proFeatures, expected_pro_features: features }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer les avantages Pro.');
      const savedFeatures = parseSubscriptionProFeatures(data.pro_features);
      setFeatures(savedFeatures);
      setDrafts({
        productLimit: savedFeatures.productLimit === null ? '' : String(savedFeatures.productLimit),
        productPhotoLimit: String(savedFeatures.productPhotoLimit),
        analyticsDayLimit: String(savedFeatures.analyticsDayLimit),
        boostDiscountPercent: String(savedFeatures.boostDiscountPercent),
      });
      setUnlimitedProducts(savedFeatures.productLimit === null);
      setNotice('Avantages Pro enregistrés. Les abonnements Pro en cours gardent leurs conditions jusqu’au prochain renouvellement.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer les avantages Pro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="admin-plan-features-title" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="admin-plan-features-title" className="text-sm font-black text-slate-900">Avantages et limites Pro</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Les changements s’appliquent aux nouveaux abonnements immédiatement et aux abonnements Pro existants à leur prochaine échéance payée.
          </p>
        </div>
        <button type="button" onClick={() => void loadFeatures()} disabled={loading || saving} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">
          Actualiser
        </button>
      </div>
      {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Chargement des avantages Pro…</p> : (
        <form onSubmit={(event) => void saveFeatures(event)} className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="block text-xs font-bold text-slate-700">
              <label htmlFor="admin-pro-product-limit">Articles maximum</label>
              <input
                id="admin-pro-product-limit"
                type="number"
                min={1}
                max={100000}
                step={1}
                required={!unlimitedProducts}
                disabled={unlimitedProducts}
                value={drafts.productLimit}
                onChange={(event) => setDrafts((current) => ({ ...current, productLimit: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100"
                aria-label="Nombre maximum d’articles Pro"
              />
              <label className="mt-2 flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  checked={unlimitedProducts}
                  onChange={(event) => setUnlimitedProducts(event.target.checked)}
                />
                Catalogue illimité
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Photos maximum par article
              <input
                type="number"
                min={1}
                max={20}
                step={1}
                required
                value={drafts.productPhotoLimit}
                onChange={(event) => setDrafts((current) => ({ ...current, productPhotoLimit: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Historique des statistiques (jours)
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                required
                value={drafts.analyticsDayLimit}
                onChange={(event) => setDrafts((current) => ({ ...current, analyticsDayLimit: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900"
              />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Réduction sur les boosts (%)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                required
                value={drafts.boostDiscountPercent}
                onChange={(event) => setDrafts((current) => ({ ...current, boostDiscountPercent: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!features || saving || loading} className="min-h-10 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer les avantages Pro'}
            </button>
            {notice && <p role="status" className="text-xs font-semibold text-emerald-800">{notice}</p>}
            {error && <p role="alert" className="text-xs font-semibold text-rose-800">{error}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
