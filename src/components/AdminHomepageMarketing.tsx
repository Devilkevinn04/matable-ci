import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';

interface BetaState {
  started: boolean;
  delivery_available: boolean;
  delivery_enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  days_remaining: number;
}

interface AdminCampaign {
  id: string;
  kind: 'product' | 'banner';
  headline: string;
  body: string;
  status: string;
  duration_days: number;
  starts_at: string | null;
  ends_at: string | null;
  review_note: string | null;
  charter_accepted_at: string | null;
  shop_name: string;
  shop_city: string | null;
  metrics: Record<string, number>;
}

interface PartnerRequest {
  id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string | null;
  requested_format: 'banner' | 'product' | 'partnership' | 'other';
  objective: string;
  message: string;
  status: 'pending' | 'contacted' | 'declined';
}

interface PermanentPartner {
  id: string;
  name: string;
  descriptor: string;
  headline: string;
  is_active: boolean | number;
}

interface MarketingState {
  beta: BetaState;
  campaigns: AdminCampaign[];
  requests: PartnerRequest[];
  partners: PermanentPartner[];
}

const statusLabels: Record<string, string> = {
  pending_review: 'À examiner',
  rejected: 'Refusée',
  scheduled: 'Programmée',
  active: 'En diffusion',
  suspended: 'Suspendue',
  completed: 'Terminée',
  cancelled: 'Annulée',
};

const partnerRequestStatusLabels: Record<PartnerRequest['status'], string> = {
  pending: 'À traiter',
  contacted: 'Prise en charge',
  declined: 'Refusée',
};

const partnerRequestFormatLabels: Record<PartnerRequest['requested_format'], string> = {
  banner: 'Bannière',
  product: 'Produit sponsorisé',
  partnership: 'Partenariat',
  other: 'Autre',
};

export const AdminHomepageMarketing: React.FC = () => {
  const [data, setData] = useState<MarketingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    const [betaResponse, campaignsResponse, requestsResponse, partnersResponse] = await Promise.all([
      fetch('/api/admin/advertising/beta', { cache: 'no-store' }),
      fetch('/api/admin/advertising/campaigns', { cache: 'no-store' }),
      fetch('/api/admin/advertising/partner-requests', { cache: 'no-store' }),
      fetch('/api/admin/advertising/partners', { cache: 'no-store' }),
    ]);
    const [betaPayload, campaignsPayload, requestsPayload, partnersPayload] = await Promise.all([
      betaResponse.json() as Promise<{ beta?: BetaState; error?: string }>,
      campaignsResponse.json() as Promise<{ campaigns?: AdminCampaign[]; error?: string }>,
      requestsResponse.json() as Promise<{ requests?: PartnerRequest[]; error?: string }>,
      partnersResponse.json() as Promise<{ partners?: PermanentPartner[]; error?: string }>,
    ]);
    if (!betaResponse.ok || !campaignsResponse.ok || !requestsResponse.ok || !partnersResponse.ok) {
      throw new Error(betaPayload.error || campaignsPayload.error || requestsPayload.error || partnersPayload.error || 'Impossible de charger la régie publicitaire.');
    }
    if (!betaPayload.beta || !Array.isArray(campaignsPayload.campaigns)
      || !Array.isArray(requestsPayload.requests) || !Array.isArray(partnersPayload.partners)) {
      throw new Error('La réponse de la régie publicitaire est invalide.');
    }
    setData({
      beta: betaPayload.beta,
      campaigns: campaignsPayload.campaigns,
      requests: requestsPayload.requests,
      partners: partnersPayload.partners,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la régie publicitaire.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadData]);

  const runAction = async (url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Cette action est impossible.');
      setNotice(successMessage);
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Cette action est impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deletePermanentPartner = async (partnerId: string, partnerName: string) => {
    if (!window.confirm(`Retirer définitivement ${partnerName} des partenaires permanents ?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/advertising/partners/${encodeURIComponent(partnerId)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || 'Impossible de retirer le partenaire.');
      }
      setNotice('Partenaire permanent retiré.');
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Impossible de retirer le partenaire.');
    } finally {
      setBusy(false);
    }
  };

  const betaAction = data?.beta.started
    ? data.beta.delivery_enabled ? 'pause' : 'resume'
    : 'open';
  const betaActionLabel = betaAction === 'open' ? 'Ouvrir la bêta (30 jours)'
    : betaAction === 'pause' ? 'Suspendre la diffusion'
      : 'Reprendre la diffusion';

  return (
    <section className="space-y-5" aria-labelledby="admin-advertising-title">
      <header className="flex flex-col gap-3 rounded-2xl border border-[#d8e9df] bg-[#f5faf6] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-[#e3f1e8] p-3 text-[#047857]"><Megaphone className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 id="admin-advertising-title" className="text-xl font-black text-slate-900">Publicité et visibilité</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">La diffusion et la rotation des campagnes éligibles sont automatiques. La validation des contenus et le contrôle de diffusion restent réservés à l’administration.</p>
          </div>
        </div>
        <button type="button" disabled={busy || loading || !data || (betaAction === 'resume' && data.beta.days_remaining === 0)} onClick={() => void runAction('/api/admin/advertising/beta', 'POST', { action: betaAction }, 'Configuration de la bêta mise à jour.')} className="min-h-11 shrink-0 rounded-full bg-[#047857] px-5 text-sm font-bold text-white disabled:opacity-50">
          {betaActionLabel}
        </button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{notice}</p>}
      {loading && <p role="status" className="text-sm text-slate-500">Chargement de la régie…</p>}

      {data && <>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-black text-slate-900">Période de bêta</h3>
          <p className="mt-2 text-sm text-slate-700">
            {data.beta.delivery_enabled ? 'Diffusion ouverte' : data.beta.started ? 'Diffusion suspendue ou période terminée' : 'Bêta non démarrée'}
            {data.beta.ends_at ? ` · fin le ${new Date(data.beta.ends_at).toLocaleString('fr-FR')} · ${data.beta.days_remaining} jour(s) restant(s)` : ''}
          </p>
          <p className="mt-2 text-xs text-slate-500">Une seule campagne produit et une bannière au maximum par boutique. Toute campagne reste soumise à validation et à ses dates.</p>
          {!data.beta.delivery_available && <p className="mt-2 text-xs font-bold text-amber-800">La configuration de la bêta est modifiable, mais la diffusion publique reste désactivée par ADVERTISING_BETA_ENABLED.</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="admin-permanent-partners-title">
          <h3 id="admin-permanent-partners-title" className="text-sm font-black text-slate-900">Partenaires permanents ({data.partners.length})</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Les partenaires actifs sont présentés dans un ordre renouvelé automatiquement. La création, la modification du contenu et le réglage de l’ordre ne sont plus disponibles ici ; seuls l’activation, la suspension et le retrait restent accessibles.</p>
          <div className="mt-3 divide-y divide-slate-200">
            {data.partners.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun partenaire permanent configuré.</p> : data.partners.map((partner) => (
              <article key={partner.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900">{partner.name} · {partner.descriptor}</h4>
                    <p className="mt-1 text-xs text-slate-600">{partner.headline} · {partner.is_active ? 'En affichage public' : 'En pause'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => void runAction(
                      `/api/admin/advertising/partners/${encodeURIComponent(partner.id)}`,
                      'PATCH',
                      { is_active: !partner.is_active },
                      partner.is_active ? 'Partenaire mis en pause.' : 'Partenaire activé sur l’accueil.',
                    )} className={`min-h-9 rounded-lg border px-3 text-xs font-bold disabled:opacity-50 ${partner.is_active ? 'border-amber-300 text-amber-900' : 'border-emerald-300 text-emerald-900'}`}>
                      {partner.is_active ? 'Mettre en pause' : 'Activer sur l’accueil'}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void deletePermanentPartner(partner.id, partner.name)} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-900 disabled:opacity-50">Retirer</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="admin-ad-campaigns-title">
          <div className="flex items-center justify-between gap-3"><h3 id="admin-ad-campaigns-title" className="text-sm font-black text-slate-900">Campagnes ({data.campaigns.length})</h3><button type="button" disabled={busy} onClick={() => void loadData().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Actualisation impossible.'))} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Actualiser</button></div>
          <div className="mt-3 divide-y divide-slate-200">
            {data.campaigns.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune campagne.</p> : data.campaigns.map((campaign) => (
              <article key={campaign.id} className="space-y-3 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{campaign.headline} · {campaign.shop_name}</h4>
                    <p className="mt-1 text-xs text-slate-600">{campaign.kind === 'product' ? 'Produit sponsorisé' : 'Bannière'} · {campaign.shop_city || 'Commune non précisée'} · {statusLabels[campaign.status] || campaign.status}</p>
                    <p className="mt-1 text-sm text-slate-700">{campaign.body}</p>
                    {campaign.starts_at && campaign.ends_at && <p className="mt-1 text-xs text-slate-500">{new Date(campaign.starts_at).toLocaleString('fr-FR')} – {new Date(campaign.ends_at).toLocaleString('fr-FR')}</p>}
                    {campaign.review_note && <p className="mt-1 text-xs text-rose-800">Note : {campaign.review_note}</p>}
                    {campaign.charter_accepted_at && <p className="mt-1 text-xs text-slate-500">Charte confirmée le {new Date(campaign.charter_accepted_at).toLocaleString('fr-FR')}</p>}
                    <p className="mt-2 text-xs text-slate-500">Mesures consenties · impressions : {campaign.metrics.impression || 0} · clics : {campaign.metrics.click || 0}</p>
                  </div>
                </div>
                {['pending_review', 'active', 'scheduled', 'suspended'].includes(campaign.status) && <>
                  {campaign.status !== 'suspended' && <label className="block text-xs font-semibold text-slate-600">Motif de modération{campaign.status === 'pending_review' ? ' (requis pour refuser)' : ''}
                    <input value={notes[campaign.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [campaign.id]: event.target.value }))} maxLength={500} className="mt-1 min-h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                  </label>}
                  <div className="flex flex-wrap gap-2">
                    {campaign.status === 'pending_review' && <>
                      <button type="button" disabled={busy} onClick={() => void runAction(
                        `/api/admin/advertising/campaigns/${encodeURIComponent(campaign.id)}/review`,
                        'POST',
                        { action: 'approve' },
                        'Campagne approuvée et démarrée automatiquement.',
                      )} className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-50">Approuver</button>
                      <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/campaigns/${encodeURIComponent(campaign.id)}/review`, 'POST', { action: 'reject', note: notes[campaign.id] || '' }, 'Campagne refusée.')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-900 disabled:opacity-50">Refuser</button>
                    </>}
                    {campaign.status === 'active' || campaign.status === 'scheduled' ? <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/campaigns/${encodeURIComponent(campaign.id)}/review`, 'POST', { action: 'suspend', note: notes[campaign.id] || '' }, 'Campagne suspendue.')} className="min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-bold text-amber-900 disabled:opacity-50">Suspendre</button> : null}
                    {campaign.status === 'suspended' && <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/campaigns/${encodeURIComponent(campaign.id)}/review`, 'POST', { action: 'resume' }, 'Campagne reprise.')} className="min-h-9 rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-900 disabled:opacity-50">Reprendre</button>}
                    <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/campaigns/${encodeURIComponent(campaign.id)}/review`, 'POST', { action: 'cancel', note: notes[campaign.id] || '' }, 'Campagne arrêtée.')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Arrêter</button>
                  </div>
                </>}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="admin-partner-requests-title">
          <h3 id="admin-partner-requests-title" className="text-sm font-black text-slate-900">Demandes de partenaires ({data.requests.length})</h3>
          <p className="mt-1 text-xs text-slate-500">Les propositions externes sont traitées au cas par cas, sans compte annonceur ni paiement autonome.</p>
          <div className="mt-3 divide-y divide-slate-200">
            {data.requests.length === 0 ? <p className="py-5 text-sm text-slate-500">Aucune demande reçue.</p> : data.requests.map((request) => (
              <article key={request.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{request.company_name} · {partnerRequestFormatLabels[request.requested_format]}</h4>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${request.status === 'pending' ? 'bg-amber-50 text-amber-900' : request.status === 'contacted' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                    {partnerRequestStatusLabels[request.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{request.contact_name} · <a className="underline" href={`mailto:${request.email}`}>{request.email}</a>{request.phone ? ` · ${request.phone}` : ''}</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">{request.objective}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-600">{request.message}</p>
                {request.status === 'pending' && <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/partner-requests/${encodeURIComponent(request.id)}`, 'PATCH', { status: 'contacted' }, 'Demande marquée comme prise en charge.')} className="min-h-9 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-50">Prendre en charge</button>
                  <button type="button" disabled={busy} onClick={() => void runAction(`/api/admin/advertising/partner-requests/${encodeURIComponent(request.id)}`, 'PATCH', { status: 'declined', note: 'Demande refusée après examen.' }, 'Demande refusée.')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Refuser</button>
                </div>}
              </article>
            ))}
          </div>
        </section>
      </>}
    </section>
  );
};