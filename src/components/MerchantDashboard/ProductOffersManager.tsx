import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, RotateCcw } from 'lucide-react';
import type { Product, Shop } from '../../types';
import { normalizeCustomBannerImage } from '../../utils/categoryDefaults';

interface Campaign {
  id: string;
  kind: 'product' | 'banner';
  product_id: number | null;
  headline: string;
  body: string;
  duration_days: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  review_note: string | null;
}

interface CampaignResponse {
  beta: { delivery_enabled: boolean; ends_at: string | null; days_remaining: number };
  campaigns: Campaign[];
  eligibility: Record<'product' | 'banner', string[]>;
}

interface ProductOffersManagerProps {
  shop: Shop;
  products: Product[];
}

const statusLabels: Record<string, string> = {
  pending_review: 'En attente de validation',
  rejected: 'Refusée',
  scheduled: 'Programmée',
  active: 'En diffusion',
  suspended: 'Suspendue',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

export const ProductOffersManager: React.FC<ProductOffersManagerProps> = ({ shop, products }) => {
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [kind, setKind] = useState<'product' | 'banner'>('product');
  const [productId, setProductId] = useState('');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCampaigns = useCallback(async () => {
    const response = await fetch(`/api/shops/${shop.id}/advertising-campaigns`, { cache: 'no-store' });
    const payload = await response.json() as CampaignResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Impossible de charger les campagnes.');
    setData(payload);
  }, [shop.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shops/${shop.id}/advertising-campaigns`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as CampaignResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Impossible de charger les campagnes.');
        if (!cancelled) setData(payload);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les campagnes.');
      });
    return () => { cancelled = true; };
  }, [shop.id]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const values = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/shops/${shop.id}/advertising-campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          product_id: kind === 'product' ? Number(productId) : null,
          headline,
          body,
          duration_days: 7,
          charter_accepted: values.get('charter_accepted') === 'on',
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Impossible de soumettre la campagne.');
      setHeadline('');
      setBody('');
      setNotice('Campagne transmise. Elle sera diffusée uniquement après validation.');
      await loadCampaigns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Impossible de soumettre la campagne.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (campaignId: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/shops/${shop.id}/advertising-campaigns/${encodeURIComponent(campaignId)}/cancel`, { method: 'PATCH' });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Impossible d’annuler la campagne.');
      setNotice('Campagne annulée.');
      await loadCampaigns();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Impossible d’annuler la campagne.');
    } finally {
      setBusy(false);
    }
  };

  const submissionBlockers = data?.eligibility?.[kind] || ['Chargement des conditions de participation.'];
  const canSubmit = submissionBlockers.length === 0;
  const availableProducts = products.filter((product) => product.shop_id === shop.id && product.is_available && product.stock > 0);
  const hasCustomBanner = Boolean(normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category));

  return (
    <section className="space-y-4 rounded-3xl border border-[#d8e9df] bg-[#f5faf6] p-5 shadow-sm sm:p-7" aria-labelledby="merchant-advertising-title">
      <header className="flex items-start gap-3">
        <span className="rounded-2xl bg-[#e3f1e8] p-3 text-[#047857]"><Megaphone className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h3 id="merchant-advertising-title" className="text-base font-extrabold text-[#292d2a]">Campagnes sponsorisées · bêta</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Les campagnes produit et bannière sont gratuites pendant la bêta de 30 jours et restent soumises à validation.</p>
        </div>
      </header>
      {data && <p className="rounded-xl border border-[#d8e9df] bg-white px-4 py-3 text-sm text-[#047857]">
        {data.beta.delivery_enabled ? `Bêta ouverte · ${data.beta.days_remaining} jour(s) restant(s).` : 'La diffusion bêta est actuellement fermée.'}
      </p>}
      {submissionBlockers.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
        <p className="font-bold">Conditions à remplir pour {kind === 'product' ? 'le produit sponsorisé' : 'la bannière'} :</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
          {submissionBlockers.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{notice}</p>}

      <form onSubmit={(event) => void submit(event)} className="grid gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">Format
          <select value={kind} onChange={(event) => setKind(event.target.value as 'product' | 'banner')} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="product">Produit sponsorisé</option>
            <option value="banner">Bannière de boutique</option>
          </select>
        </label>
        <p className="self-center text-xs font-semibold text-slate-600">Durée fixe de la bêta : 7 jours</p>
        {kind === 'banner' && !hasCustomBanner && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:col-span-2">Ajoutez d’abord une image de bannière dans Apparence de la vitrine.</p>}
        {kind === 'product' && <label className="text-xs font-bold text-slate-700 sm:col-span-2">Produit à mettre en avant
          <select value={productId} onChange={(event) => setProductId(event.target.value)} required className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">Choisir un produit disponible</option>
            {availableProducts.map((product) => <option key={product.id} value={product.id}>{product.title} · {product.stock} en stock</option>)}
          </select>
        </label>}
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">Titre
          <input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={90} required className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
        </label>
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={220} minLength={1} required rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex items-start gap-2 text-xs leading-5 text-slate-600 sm:col-span-2">
          <input name="charter_accepted" type="checkbox" required className="mt-1 accent-[#047857]" />
          <span>Je confirme l’exactitude des informations et respecte la charte : pas de promesse trompeuse, contenu illicite ou image sans droit d’usage. La campagne est soumise à validation MaTable.ci. *</span>
        </label>
        <button type="submit" disabled={!canSubmit || busy || (kind === 'product' && availableProducts.length === 0) || (kind === 'banner' && !hasCustomBanner)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#047857] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
          {busy ? <RotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {canSubmit ? 'Soumettre pour validation' : 'Soumission indisponible'}
        </button>
      </form>

      <div className="space-y-3">
        <h4 className="text-sm font-extrabold text-[#292d2a]">Mes campagnes</h4>
        {!data?.campaigns.length ? <p className="text-sm text-slate-500">Aucune campagne soumise.</p> : data.campaigns.map((campaign) => (
          <article key={campaign.id} className="flex flex-col gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-slate-900">{campaign.headline} · {campaign.kind === 'product' ? 'Produit' : 'Bannière'}</p>
              <p className="mt-1 text-xs text-slate-600">{statusLabels[campaign.status] || campaign.status} · {campaign.duration_days} jour(s)</p>
              {campaign.review_note && <p className="mt-1 text-xs text-slate-600">Note : {campaign.review_note}</p>}
              {campaign.starts_at && campaign.ends_at && <p className="mt-1 text-xs text-slate-500">{new Date(campaign.starts_at).toLocaleString('fr-FR')} – {new Date(campaign.ends_at).toLocaleString('fr-FR')}</p>}
            </div>
            {['pending_review', 'rejected', 'scheduled', 'active'].includes(campaign.status) && <button type="button" disabled={busy} onClick={() => void cancel(campaign.id)} className="min-h-10 rounded-full border border-slate-300 px-4 text-xs font-bold text-slate-700 disabled:opacity-50">Annuler</button>}
          </article>
        ))}
      </div>
    </section>
  );
};