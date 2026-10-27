import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';

export interface PublicPermanentPartner {
  id: string;
  name: string;
  descriptor: string;
  headline: string;
  logo_url: string | null;
  destination_url: string | null;
}

function shufflePartners(items: PublicPermanentPartner[]): PublicPermanentPartner[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

interface PublicPartnerCarouselProps {
  previewPartners?: PublicPermanentPartner[];
}

export const PublicPartnerCarousel: React.FC<PublicPartnerCarouselProps> = ({ previewPartners }) => {
  const [partners, setPartners] = useState<PublicPermanentPartner[]>(previewPartners || []);
  const scrollContainer = useRef<HTMLDivElement | null>(null);
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
        if (!cancelled) setPartners(shufflePartners(payload.partners));
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error('Unable to load permanent partners.', error);
      });
    return () => { cancelled = true; };
  }, [isPreview, previewPartners]);

  useEffect(() => {
    const container = scrollContainer.current;
    if (!container || partners.length < 2 || paused || hovered || focused
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || container.scrollWidth <= container.clientWidth) return undefined;
    const interval = window.setInterval(() => {
      const maxScroll = container.scrollWidth - container.clientWidth;
      const distance = Math.max(container.clientWidth * 0.75, 240);
      if (container.scrollLeft + distance >= maxScroll - 12) {
        container.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        container.scrollBy({ left: distance, behavior: 'smooth' });
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [partners.length, paused, hovered, focused]);

  if (partners.length === 0) return null;

  const scroll = (direction: -1 | 1) => {
    const container = scrollContainer.current;
    if (!container) return;
    const distance = Math.max(container.clientWidth * 0.75, 240);
    container.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  return (
    <section
      className="mx-auto w-full max-w-[1280px] px-4 py-4 sm:px-8 sm:py-5 lg:px-10"
      aria-label="Partenaires permanents de MaTable.ci"
      aria-roledescription="carrousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c2410c]">Partenaires et institutions</p>
          <h2 className="mt-1 font-display text-lg font-extrabold tracking-tight text-[#183f32] sm:text-xl">Ils accompagnent le commerce local</h2>
        </div>
        <div className="flex items-center gap-2">
          {isPreview && <span className="hidden rounded-full bg-[#e3f1e8] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#065f46] sm:inline-flex">Exemple fictif · aperçu</span>}
          {partners.length > 1 && <>
            <button type="button" onClick={() => scroll(-1)} aria-label="Partenaires précédents" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e0d5c6] bg-white text-[#315548] shadow-sm transition hover:bg-[#e3f1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPaused((current) => !current)} aria-label={paused ? 'Reprendre le défilement des partenaires' : 'Mettre en pause le défilement des partenaires'} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e0d5c6] bg-white text-[#315548] shadow-sm transition hover:bg-[#e3f1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]">
              {paused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Partenaires suivants" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e0d5c6] bg-white text-[#315548] shadow-sm transition hover:bg-[#e3f1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>}
        </div>
      </div>
      <div ref={scrollContainer} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {partners.map((partner) => (
          <article key={partner.id} className="flex min-h-[106px] min-w-[78%] snap-start items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-3 shadow-[0_3px_14px_rgba(20,40,30,.05)] sm:min-w-[44%] sm:p-4 lg:min-w-[calc(25%-9px)]">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#eee8de] bg-[#fffdf8] text-lg font-black text-[#065f46]">
              {partner.name.trim().slice(0, 1).toUpperCase()}
              {partner.logo_url && <img src={partner.logo_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(event) => { event.currentTarget.hidden = true; }} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-black uppercase tracking-wide text-[#647067]">{partner.name} · {partner.descriptor}</p>
              <h3 className="mt-1 line-clamp-2 font-display text-sm font-extrabold leading-tight text-[#292d2a] sm:text-base">{partner.headline}</h3>
              <span className="mt-2 inline-flex rounded-full bg-[#e3f1e8] px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-[#065f46]">Partenaire MaTable</span>
            </div>
            {partner.destination_url && (
              <a
                href={partner.destination_url}
                target={partner.destination_url.startsWith('https://') ? '_blank' : undefined}
                rel={partner.destination_url.startsWith('https://') ? 'sponsored noopener noreferrer' : 'sponsored'}
                aria-label={`Découvrir ${partner.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f7f3] text-[#065f46] transition hover:bg-[#e3f1e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
};
