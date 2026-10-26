import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowRight, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatFCFA } from '../utils/format';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { getActiveProductPrice } from '../utils/productPricing';

interface PublicCampaign {
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
  placement: 'billboard' | 'hero' | 'tiles' | 'feed';
  onCampaignVisibilityChange?: (visible: boolean) => void;
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

export const PublicCampaignCarousel: React.FC<PublicCampaignCarouselProps> = ({ onOpenShop, eligible, placement, onCampaignVisibilityChange }) => {
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [measurementConsent, setMeasurementConsent] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);
  const campaignElement = useRef<HTMLElement | null>(null);
  const recordedImpressions = useRef(new Set<string>());

  useEffect(() => {
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
  }, [eligible]);

  const bannerCampaigns = campaigns.filter((candidate) => candidate.kind === 'banner');
  const bannerCampaign = bannerCampaigns[bannerIndex % Math.max(bannerCampaigns.length, 1)];
  const productCampaigns = campaigns.filter((candidate) => candidate.kind === 'product');
  const heroCampaign = productCampaigns[0];
  const tileCampaigns = productCampaigns.slice(1, 4);
  const feedCampaign = productCampaigns[4];
  const campaign = placement === 'billboard' ? bannerCampaign
    : placement === 'hero' ? heroCampaign
    : placement === 'tiles' ? tileCampaigns[0]
      : feedCampaign;
  const visibleCampaigns = placement === 'tiles' ? tileCampaigns : campaign ? [campaign] : [];

  useEffect(() => {
    if (placement === 'hero') onCampaignVisibilityChange?.(Boolean(heroCampaign));
  }, [placement, heroCampaign?.id, onCampaignVisibilityChange]);

  const sendEvent = async (eventType: 'impression' | 'click', targetCampaign = campaign) => {
    if (!targetCampaign || !measurementConsent) return;
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
    const observedCampaigns = placement === 'tiles'
      ? tileCampaigns
      : campaign ? [campaign] : [];
    if (!eligible || !measurementConsent || observedCampaigns.length === 0 || !element
      || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const target = placement === 'tiles'
          ? observedCampaigns.find((candidate) => candidate.id === (entry.target as HTMLElement).dataset.adCampaignId)
          : campaign;
        if (!target || recordedImpressions.current.has(target.id)) continue;
        recordedImpressions.current.add(target.id);
        void sendEvent('impression', target);
      }
    }, { threshold: [0.5] });
    const elements = placement === 'tiles'
      ? Array.from(element.querySelectorAll<HTMLElement>('[data-ad-campaign-id]'))
      : [element];
    elements.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [eligible, measurementConsent, campaign?.id, placement, tileCampaigns.length]);

  if (!eligible || (!campaign && !campaignsLoaded)) return null;
  if (!campaign && placement !== 'feed') return null;
  if (!campaign && placement === 'feed') {
    const openPartnerRequest = (event: React.MouseEvent<HTMLButtonElement>) => {
      const requestForm = document.getElementById('public-partner-request');
      if (!(requestForm instanceof HTMLDetailsElement)) return;
      event.preventDefault();
      requestForm.open = true;
      requestForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

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
  if (placement === 'hero' && campaign) {
    const product = campaign.product;
    return (
      <button
        ref={(element) => { campaignElement.current = element; }}
        data-ad-campaign-id={campaign.id}
        type="button"
        onClick={() => { void sendEvent('click', campaign); onOpenShop(campaign.shop.slug); }}
        className="group relative col-span-2 flex min-h-[150px] min-w-0 items-end overflow-hidden rounded-2xl border border-white/80 bg-[#17332c] p-4 text-left shadow-[0_10px_26px_rgba(20,40,30,.16)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(20,40,30,.22)] sm:min-h-[180px] sm:rounded-[22px] sm:p-5"
      >
        <img
          src={product?.image_url || campaign.shop.image_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#102d25]/90 via-[#102d25]/58 to-[#102d25]/10" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#8f351d] sm:left-4 sm:top-4 sm:text-[10px]">
          <Megaphone className="h-3 w-3" aria-hidden="true" /> Sponsorisé
        </span>
        <span className="absolute right-3 top-3 rounded-full bg-[#fff]/90 px-2.5 py-1 text-[9px] font-bold text-[#315548] sm:right-4 sm:top-4 sm:text-[10px]">
          {campaign.shop.category ? getCategoryDefaults(campaign.shop.category).label : 'Commerce local'}
        </span>
        <span className="relative block max-w-[85%] text-white sm:max-w-[75%]">
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-white/80 sm:text-xs">À la une · {campaign.shop.name}{campaign.shop.city ? ` · ${campaign.shop.city}` : ''}</span>
          <span className="mt-1 block line-clamp-2 font-display text-lg font-black leading-tight sm:text-2xl">{campaign.headline}</span>
          {product && <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#065f46]">{formatFCFA(getActiveProductPrice(product))} {getActiveProductPrice(product) < product.price && <span className="font-semibold text-slate-400 line-through">{formatFCFA(product.price)}</span>}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></span>}
        </span>
      </button>
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
                <img src={item.product?.image_url || item.shop.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
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
    return (
      <section ref={(element) => { campaignElement.current = element; }} className="relative mx-auto w-full max-w-[1280px] px-4 pb-4 sm:px-8 sm:pb-6 lg:px-10" aria-label="Campagnes sponsorisées">
        <button type="button" onClick={() => { void sendEvent('click'); onOpenShop(campaign.shop.slug); }} className="group relative flex min-h-[230px] w-full items-end overflow-hidden rounded-[26px] bg-[#17332c] p-5 pb-16 text-left shadow-[0_12px_32px_rgba(20,40,30,.14)] sm:min-h-[300px] sm:rounded-[32px] sm:p-8 sm:pb-20 lg:min-h-[350px] lg:p-10 lg:pb-20">
          <img src={campaign.shop.image_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
          <span className="absolute inset-0 bg-gradient-to-r from-[#102d25]/85 via-[#102d25]/35 to-transparent" />
          <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#8f351d] sm:left-7 sm:top-7">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Sponsorisé
          </span>
          <span className="absolute right-5 top-5 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-[#315548] sm:right-7 sm:top-7">
            {campaign.shop.category ? getCategoryDefaults(campaign.shop.category).label : 'Commerce local'}{campaign.shop.city ? ` · ${campaign.shop.city}` : ''}
          </span>
          <span className="relative block max-w-2xl text-white">
            <span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/80">Mise en avant par {campaign.shop.name}</span>
            <span className="mt-2 block font-display text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">{campaign.headline}</span>
            <span className="mt-2 block max-w-xl text-sm leading-6 text-white/90 sm:text-base">{campaign.body}</span>
            <span className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold text-[#065f46]">Découvrir <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
          </span>
        </button>
        {bannerCampaigns.length > 1 && (
          <div className="absolute bottom-8 right-7 flex items-center gap-2 sm:bottom-10 sm:right-12" aria-label="Naviguer entre les campagnes">
            <button type="button" aria-label="Campagne précédente" onClick={() => setBannerIndex((index) => (index - 1 + bannerCampaigns.length) % bannerCampaigns.length)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#292d2a] shadow-sm transition hover:bg-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {bannerCampaigns.map((item, index) => (
              <button key={item.id} type="button" aria-label={`Afficher la campagne ${index + 1}`} aria-current={index === bannerIndex ? 'true' : undefined} onClick={() => setBannerIndex(index)} className={`h-2.5 rounded-full transition-all ${index === bannerIndex ? 'w-6 bg-white' : 'w-2.5 bg-white/55 hover:bg-white/80'}`} />
            ))}
            <button type="button" aria-label="Campagne suivante" onClick={() => setBannerIndex((index) => (index + 1) % bannerCampaigns.length)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#292d2a] shadow-sm transition hover:bg-white">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <label className="mt-2 flex items-start gap-2 px-1 text-[11px] leading-4 text-[#647067]">
          <input type="checkbox" checked={measurementConsent} onChange={(event) => acceptMeasurement(event.target.checked)} className="mt-0.5 accent-[#047857]" />
          <span>J’accepte la mesure anonymisée des impressions et clics publicitaires.</span>
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
          <img src={product.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
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