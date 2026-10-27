import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowRight, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatFCFA } from '../utils/format';
import { getCategoryDefaults } from '../utils/categoryDefaults';

export interface PublicCampaign {
  id: string;
  kind: 'product' | 'banner';
  headline: string;
  body: string;
  event_token: string;
  shop: {
    name: string;
    slug: string;
    image_url: string;
    category?: string;
    city?: string;
  };
  product?: Pick<Product, 'id' | 'title' | 'price' | 'sale_price' | 'sale_starts_at' | 'sale_ends_at' | 'image_url' | 'stock'>;
}

interface PublicCampaignCarouselProps {
  onOpenShop: (slug: string) => void;
  eligible: boolean;
  placement: 'billboard' | 'tiles' | 'feed';
  previewCampaigns?: PublicCampaign[];
}

const CONSENT_KEY = 'matable-ad-measurement-consent-v1';
const VISITOR_KEY = 'matable-ad-visitor-v1';

function getVisitorId(): string {
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing && /^[a-zA-Z0-9_-]{16,80}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(VISITOR_KEY, created);
  return created;
}

export const PublicCampaignCarousel: React.FC<PublicCampaignCarouselProps> = ({ onOpenShop, eligible, placement, previewCampaigns }) => {
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>(previewCampaigns || []);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [measurementConsent, setMeasurementConsent] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const campaignElement = useRef<HTMLElement | null>(null);
  const recordedImpressions = useRef(new Set<string>());
  const isPreview = previewCampaigns !== undefined;

  useEffect(() => {
    if (isPreview) {
      setCampaigns(previewCampaigns);
      setCampaignsLoaded(true);
      return undefined;
    }
    if (!eligible) {
      setCampaigns([]);
      setCampaignsLoaded(false);
      return;
    }
    let cancelled = false;
    setCampaignsLoaded(false);
    fetch('/api/advertising/campaigns')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Advertising campaign request failed: ${response.status}`);
        const payload = await response.json() as { campaigns?: PublicCampaign[] };
        if (!Array.isArray(payload.campaigns)) throw new Error('Advertising campaign response is invalid.');
        if (!cancelled) {
          setCampaigns(payload.campaigns);
          setCampaignsLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Unable to load public advertising campaigns.', error);
      });
    try {
      setMeasurementConsent(localStorage.getItem(CONSENT_KEY) === 'accepted');
    } catch (error) {
      console.error('Unable to read advertising measurement preference.', error);
    }
    return () => { cancelled = true; };
  }, [eligible, isPreview, previewCampaigns]);

  const bannerCampaigns = campaigns.filter((candidate) => candidate.kind === 'banner');
  const bannerCampaign = bannerCampaigns[bannerIndex % Math.max(bannerCampaigns.length, 1)];
  const productCampaigns = campaigns.filter((candidate) => candidate.kind === 'product');
  const tileCampaigns = productCampaigns.slice(0, 4);
  const feedCampaign = productCampaigns[4];
  const campaign = placement === 'billboard' ? bannerCampaign
    : placement === 'tiles' ? tileCampaigns[0]
      : feedCampaign;
  const billboardCampaigns = Array.from(
    { length: Math.min(3, bannerCampaigns.length) },
    (_, index) => bannerCampaigns[(bannerIndex + index) % bannerCampaigns.length],
  );
  const visibleCampaigns = placement === 'billboard'
    ? billboardCampaigns
    : placement === 'tiles' ? tileCampaigns : campaign ? [campaign] : [];

  const sendEvent = async (eventType: 'impression' | 'click', targetCampaign = campaign) => {
    if (isPreview || !targetCampaign || !measurementConsent) return;
    try {
      const visitorId = getVisitorId();
      const response = await fetch('/api/advertising/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: targetCampaign.id,
          event_type: eventType,
          event_token: targetCampaign.event_token,
          measurement_consent: true,
          visitor_id: visitorId,
        }),
      });
      if (!response.ok && response.status !== 204) {
        throw new Error(`Advertising event request failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Unable to record a consented advertising event.', error);
    }
  };

  const acceptMeasurement = (checked: boolean) => {
    setMeasurementConsent(checked);
    try {
      if (checked) localStorage.setItem(CONSENT_KEY, 'accepted');
      else localStorage.removeItem(CONSENT_KEY);
      window.dispatchEvent(new Event('matable-ad-measurement-consent-updated'));
    } catch (error) {
      console.error('Unable to save advertising measurement preference.', error);
    }
  };

  const openPartnerRequest = (event: React.MouseEvent<HTMLButtonElement>) => {
    const requestForm = document.getElementById('public-partner-request');
    if (!(requestForm instanceof HTMLDetailsElement)) return;
    event.preventDefault();
    requestForm.open = true;
    requestForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    if (placement !== 'billboard' || bannerCampaigns.length < 2
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setBannerIndex((index) => (index + 1) % bannerCampaigns.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [placement, bannerCampaigns.length]);

  useEffect(() => {
    setBannerIndex((index) => bannerCampaigns.length ? index % bannerCampaigns.length : 0);
  }, [bannerCampaigns.length]);

  useEffect(() => {
    const syncConsent = () => {
      try {
        setMeasurementConsent(localStorage.getItem(CONSENT_KEY) === 'accepted');
      } catch (error) {
        console.error('Unable to read advertising measurement preference.', error);
      }
    };
    window.addEventListener('matable-ad-measurement-consent-updated', syncConsent);
    return () => window.removeEventListener('matable-ad-measurement-consent-updated', syncConsent);
  }, []);

  useEffect(() => {
    const element = campaignElement.current;
    const observedCampaigns = placement === 'tiles' || placement === 'billboard'
      ? visibleCampaigns
      : campaign ? [campaign] : [];
    if (isPreview || !eligible || !measurementConsent || observedCampaigns.length === 0 || !element
      || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const target = placement === 'tiles' || placement === 'billboard'
          ? observedCampaigns.find((candidate) => candidate.id === (entry.target as HTMLElement).dataset.adCampaignId)
          : campaign;
        if (!target || recordedImpressions.current.has(target.id)) continue;
        recordedImpressions.current.add(target.id);
        void sendEvent('impression', target);
      }
    }, { threshold: [0.5] });
    const elements = placement === 'tiles' || placement === 'billboard'
      ? Array.from(element.querySelectorAll<HTMLElement>('[data-ad-campaign-id]'))
      : [element];
    elements.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [eligible, isPreview, measurementConsent, campaign?.id, placement, visibleCampaigns.map((item) => item.id).join(',')]);

  if (placement === 'billboard' && !campaign && (!eligible || campaignsLoaded)) {
    return (
      <aside className="flex min-h-[230px] flex-col justify-between overflow-hidden rounded-[26px] border border-[#d6e5dc] bg-[radial-gradient(circle_at_85%_15%,rgba(249,115,22,.15),transparent_35%),linear-gradient(135deg,#f4faf6,#fffdf8_58%,#e6f2e9)] p-5 shadow-[0_8px_28px_rgba(20,40,30,.08)] sm:min-h-[300px] sm:rounded-[32px] sm:p-8 lg:min-h-[350px] lg:p-9" aria-label="Espace partenaires">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#8f351d] shadow-sm">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Espace partenaires
          </span>
          <h2 className="mt-5 max-w-xl font-display text-2xl font-black leading-tight text-[#065f46] sm:mt-7 sm:text-3xl lg:text-4xl">
            Votre marque au cœur du commerce local.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-[#47534b]">
            Une vitrine premium pour rencontrer les boutiques et les clients de Côte d’Ivoire.
          </p>
        </div>
        <button type="button" onClick={openPartnerRequest} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-[#f97316] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#ea580c]">
          Proposer un partenariat <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }
  if ((!eligible && !isPreview) || (!campaign && !campaignsLoaded)) return null;
  if (!campaign && placement !== 'feed') return null;
  if (!campaign && placement === 'feed') {
    return (
      <li className="col-span-2 list-none sm:col-span-3 lg:col-span-4">
      <aside className="overflow-hidden rounded-3xl border border-dashed border-[#b8d3c8] bg-gradient-to-r from-[#f5faf6] to-white shadow-sm" aria-label="Espace publicitaire">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f1e8] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#065f46]">
              <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Espace publicitaire
            </span>
            <h3 className="mt-2 text-lg font-black text-[#292d2a]">Aucune campagne sponsorisée en cours</h3>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-[#647067]">
              Les mises en avant apparaîtront ici après validation. Les commerçants peuvent proposer un produit depuis leur espace; les marques peuvent demander un partenariat.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/commercants" className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#065f46] px-4 text-xs font-bold text-white transition hover:bg-[#047857]">
              Espace commerçant
            </Link>
            <button type="button" onClick={openPartnerRequest} className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#b8d3c8] bg-white px-4 text-xs font-bold text-[#065f46] transition hover:bg-[#f5faf6]">
              Proposer un partenariat
            </button>
          </div>
        </div>
      </aside>
      </li>
    );
  }
  if (placement === 'tiles') {
    return (
      <section ref={(element) => { campaignElement.current = element; }} className="mx-auto w-full max-w-[1280px] px-5 pb-5 pt-2 sm:px-8 sm:pb-7 lg:px-10" aria-labelledby="sponsored-tiles-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c2410c]">Sélection des commerçants</p>
            <h2 id="sponsored-tiles-title" className="mt-1 font-display text-xl font-extrabold tracking-tight sm:text-2xl">À la une</h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-[#647067]">Partenaires sponsorisés</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCampaigns.map((item) => (
            <button key={item.id} data-ad-campaign-id={item.id} type="button" onClick={() => { void sendEvent('click', item); onOpenShop(item.shop.slug); }} className="group flex min-h-24 min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-[#e0d5c6] bg-white p-2.5 text-left shadow-[0_2px_12px_rgba(20,40,30,.05)] transition hover:-translate-y-0.5 hover:border-[#b9d5ca] hover:shadow-[0_12px_28px_rgba(20,40,30,.09)]">
              <span className="relative h-[76px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-[#e9f5ee]">
                <img src={item.product?.image_url || item.shop.image_url} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[8px] font-black uppercase text-[#8f351d]">Sponsorisé</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#c2410c]">{item.shop.category ? getCategoryDefaults(item.shop.category).label : 'Commerce local'}</span>
                <span className="mt-0.5 block truncate font-display text-sm font-extrabold text-[#292d2a]">{item.headline}</span>
                <span className="mt-1 block truncate text-xs text-[#647067]">{item.shop.name}{item.shop.city ? ` · ${item.shop.city}` : ''}</span>
              </span>
              <ArrowUpRight className="mr-1 h-4 w-4 shrink-0 text-[#059669] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>
          ))}
        </div>
        {bannerCampaigns.length === 0 && (
          <label className="mt-3 flex items-start gap-2 text-[11px] leading-4 text-[#647067]">
            <input type="checkbox" checked={measurementConsent} onChange={(event) => acceptMeasurement(event.target.checked)} className="mt-0.5 accent-[#047857]" />
            <span>J’accepte la mesure anonymisée des impressions et clics publicitaires.</span>
          </label>
        )}
      </section>
    );
  }

  if (placement === 'billboard' && campaign) {
    const renderBanner = (item: PublicCampaign, featured: boolean) => (
      <button
        key={item.id}
        data-ad-campaign-id={item.id}
        type="button"
        onClick={() => { void sendEvent('click', item); onOpenShop(item.shop.slug); }}
        className={`group relative flex min-w-0 items-end overflow-hidden rounded-2xl bg-[#17332c] text-left shadow-[0_8px_24px_rgba(20,40,30,.12)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(20,40,30,.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2 ${featured ? 'min-h-[255px] p-5 sm:min-h-[300px] sm:rounded-[26px] sm:p-7 lg:min-h-[350px] lg:rounded-[30px] lg:p-8' : 'min-h-[150px] p-4 sm:min-h-[170px] sm:p-5 lg:min-h-0'}`}
      >
        <img src={item.shop.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.hidden = true; }} />
        <span aria-hidden="true" className={`absolute inset-0 ${featured ? 'bg-gradient-to-r from-[#102d25]/90 via-[#102d25]/55 to-[#102d25]/10' : 'bg-gradient-to-t from-[#102d25]/90 via-[#102d25]/35 to-transparent'}`} />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#8f351d] sm:left-4 sm:top-4">
          <Megaphone className="h-3 w-3" aria-hidden="true" /> Sponsorisé
        </span>
        <span className={`relative block min-w-0 text-white ${featured ? 'max-w-[90%] sm:max-w-[82%]' : 'w-full'}`}>
          <span className="block truncate text-[9px] font-bold uppercase tracking-[0.12em] text-white/80 sm:text-[10px]">{item.shop.name}{item.shop.city ? ` · ${item.shop.city}` : ''}</span>
          <span className={`mt-1 block font-display font-black leading-tight ${featured ? 'line-clamp-2 text-xl sm:text-2xl lg:text-3xl' : 'line-clamp-2 text-base sm:text-lg'}`}>{item.headline}</span>
          {featured && item.body && <span className="mt-2 line-clamp-2 block max-w-lg text-xs leading-5 text-white/90 sm:text-sm">{item.body}</span>}
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[10px] font-extrabold text-[#065f46] sm:text-xs">Découvrir <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </span>
      </button>
    );

    return (
      <section ref={(element) => { campaignElement.current = element; }} className="min-w-0" aria-label="Campagnes sponsorisées">
        <div className={`grid gap-3 ${visibleCampaigns.length > 1 ? 'lg:grid-cols-[1.55fr_1fr]' : ''}`}>
          {visibleCampaigns[0] && renderBanner(visibleCampaigns[0], true)}
          {visibleCampaigns.length > 1 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {visibleCampaigns.slice(1).map((item) => renderBanner(item, false))}
          </div>}
        </div>
        {bannerCampaigns.length > 1 && (
          <div className="mt-2 flex items-center justify-end gap-2" aria-label="Naviguer entre les campagnes">
            <span className="mr-auto text-[10px] font-semibold text-[#647067]" aria-live="polite">Partenaires mis en avant</span>
            <button type="button" aria-label="Campagne précédente" onClick={() => setBannerIndex((index) => (index - 1 + bannerCampaigns.length) % bannerCampaigns.length)} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d5c6] bg-white text-[#315548] shadow-sm transition hover:bg-[#e3f1e8]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-[10px] font-semibold text-[#647067]">{bannerIndex + 1} / {bannerCampaigns.length}</span>
            <button type="button" aria-label="Campagne suivante" onClick={() => setBannerIndex((index) => (index + 1) % bannerCampaigns.length)} className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e0d5c6] bg-white text-[#315548] shadow-sm transition hover:bg-[#e3f1e8]">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <label className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-[#647067]">
          <input type="checkbox" checked={measurementConsent} onChange={(event) => acceptMeasurement(event.target.checked)} className="mt-0.5 accent-[#047857]" />
          <span>J’accepte la mesure anonymisée des impressions et clics publicitaires. Elle reste désactivée sans votre accord.</span>
        </label>
      </section>
    );
  }

  const product = campaign?.kind === 'product' ? campaign.product : undefined;
  if (!campaign || campaign.kind === 'product' && !product) return null;

  if (!campaign || !product) return null;

  return (
    <li ref={(element) => { campaignElement.current = element; }} className="min-w-0 overflow-hidden rounded-2xl border border-[#e0d5c6] bg-white shadow-[0_2px_12px_rgba(20,40,30,.06)]" aria-label="Produit sponsorisé">
      <button type="button" onClick={() => { void sendEvent('click'); onOpenShop(campaign.shop.slug); }} className="group flex h-full w-full flex-col text-left">
        <span className="relative aspect-[4/3] w-full overflow-hidden bg-[#d1fae5]">
          <img src={product.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.hidden = true; }} />
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase text-[#8f351d]">Sponsorisé</span>
          <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#065f46]">{formatFCFA(product.price)}</span>
        </span>
        <span className="flex flex-1 flex-col p-3.5 sm:p-4">
          <span className="line-clamp-1 text-xs font-semibold text-[#647067]">{campaign.shop.name}</span>
          <span className="mt-1 line-clamp-2 min-h-10 font-display text-[15px] font-bold leading-5 text-[#292d2a] sm:text-base">{campaign.headline}</span>
          <span className="mt-2 line-clamp-2 text-xs leading-5 text-[#647067]">{campaign.body}</span>
          <span className="mt-auto pt-3 text-[10px] font-bold uppercase tracking-wide text-[#c2410c]">Mise en avant · Découvrir</span>
        </span>
      </button>
      {bannerCampaigns.length === 0 && tileCampaigns.length === 0 && (
        <label className="flex items-start gap-2 border-t border-[#eee8df] px-3.5 py-2.5 text-[10px] leading-4 text-[#647067] sm:px-4">
          <input type="checkbox" checked={measurementConsent} onChange={(event) => acceptMeasurement(event.target.checked)} className="mt-0.5 accent-[#047857]" />
          <span>Mesure publicitaire facultative</span>
        </label>
      )}
    </li>
  );
};