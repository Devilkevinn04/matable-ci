import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';

export interface PublicPermanentPartner {
  id: string;
  name: string;
  descriptor: string;
  headline: string;
  logo_url: string | null;
  destination_url: string | null;
}

interface PublicPartnerCarouselProps {
  previewPartners?: PublicPermanentPartner[];
}

export const PublicPartnerCarousel: React.FC<PublicPartnerCarouselProps> = ({ previewPartners }) => {
  const [partners, setPartners] = useState<PublicPermanentPartner[]>(previewPartners || []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPreview = previewPartners !== undefined;

  useEffect(() => {
    if (isPreview) {
      setPartners(previewPartners);
      return undefined;
    }
    let cancelled = false;
    fetch('/api/advertising/partners')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Permanent partner request failed: ${response.status}`);
        const payload = await response.json() as { partners?: PublicPermanentPartner[] };
        if (!Array.isArray(payload.partners)) throw new Error('Permanent partner response is invalid.');
        if (!cancelled) setPartners(payload.partners);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Unable to load permanent partners.', error);
      });
    return () => { cancelled = true; };
  }, [isPreview, previewPartners]);

  useEffect(() => {
    if (partners.length < 2 || paused || hovered || focused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % partners.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [partners.length, paused, hovered, focused]);

  useEffect(() => {
    setActiveIndex((current) => partners.length ? current % partners.length : 0);
  }, [partners.length]);

  if (partners.length === 0) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + partners.length) % partners.length);
  };

  return (
    <section
      className="mt-5 w-full max-w-[610px]"
      aria-label="Partenaires permanents de MaTable.ci"
      aria-roledescription="carrousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#647067] sm:text-[10px]">Partenaire permanent</p>
        {isPreview && <span className="rounded-full bg-[#e3f1e8] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#065f46]">Exemple fictif · aperçu</span>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#e4ddd2] bg-white shadow-[0_8px_22px_rgba(20,40,30,.08)]">
        <div className="overflow-hidden">
          <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
            {partners.map((partner, index) => (
              <article
                key={partner.id}
                aria-label={`${partner.name}, partenaire permanent`}
                aria-hidden={index !== activeIndex}
                className="relative flex min-h-[124px] min-w-0 flex-[0_0_100%] items-center gap-3 overflow-hidden bg-gradient-to-r from-[#f6f4ec] via-white to-[#e7f2eb] p-3 sm:min-h-[136px] sm:gap-4 sm:p-4"
              >
                <span aria-hidden="true" className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white text-lg font-black text-[#065f46] shadow-sm sm:h-16 sm:w-16">
                  {partner.name.trim().slice(0, 1).toUpperCase()}
                  {partner.logo_url && <img src={partner.logo_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(event) => { event.currentTarget.hidden = true; }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-black uppercase tracking-wide text-[#647067] sm:text-[10px]">{partner.name} · {partner.descriptor}</p>
                  <h2 className="mt-1 line-clamp-2 font-display text-base font-extrabold leading-tight text-[#292d2a] sm:text-lg">{partner.headline}</h2>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#e3f1e8] px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-[#065f46] sm:text-[9px]">Partenaire MaTable</span>
                </div>
                {partner.destination_url && (
                  <a
                    href={partner.destination_url}
                    target={partner.destination_url.startsWith('https://') ? '_blank' : undefined}
                    rel={partner.destination_url.startsWith('https://') ? 'sponsored noopener noreferrer' : 'sponsored'}
                    tabIndex={index === activeIndex ? 0 : -1}
                    aria-label={`Découvrir ${partner.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#065f46] shadow-sm transition hover:bg-[#e3f1e8]"
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
        {partners.length > 1 && (
          <div className="flex items-center justify-between border-t border-[#eee8de] bg-[#fffdf8] px-3 py-1.5">
            <span className="text-[9px] font-semibold text-[#647067]" aria-live="polite">Partenaire {activeIndex + 1} sur {partners.length}</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => move(-1)} aria-label="Partenaire précédent" className="flex h-8 w-8 items-center justify-center rounded-full text-[#315548] transition hover:bg-[#e3f1e8]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => setPaused((current) => !current)} aria-label={paused ? 'Reprendre le défilement des partenaires' : 'Mettre en pause le défilement des partenaires'} className="flex h-8 w-8 items-center justify-center rounded-full text-[#315548] transition hover:bg-[#e3f1e8]">
                {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
              <button type="button" onClick={() => move(1)} aria-label="Partenaire suivant" className="flex h-8 w-8 items-center justify-center rounded-full text-[#315548] transition hover:bg-[#e3f1e8]"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
