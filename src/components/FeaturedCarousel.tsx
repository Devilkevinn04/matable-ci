import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Star } from 'lucide-react';
import { getCategoryDefaults, getProductImageForDisplay, normalizeCustomBannerImage } from '../utils/categoryDefaults';

interface FeaturedShop {
  slug: string;
  name: string;
  category?: string;
  is_open?: boolean;
  is_featured?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  theme_config?: { custom_banner_url?: string; primary_color?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

interface FeaturedCarouselProps {
  shops: FeaturedShop[];
  onOpenShop: (slug: string) => void;
}

export const FeaturedCarousel: React.FC<FeaturedCarouselProps> = ({ shops, onOpenShop }) => {
  const carouselShops = useMemo(() => {
    const featured = shops.filter((shop) => shop.is_featured);
    const catalogShops = shops.filter((shop) => !shop.is_featured && shop.is_open && (shop.products_count || 0) > 0);
    const prioritizedShops = [...featured, ...catalogShops];
    return (prioritizedShops.length ? prioritizedShops : shops).slice(0, 6);
  }, [shops]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => document.visibilityState === 'visible');
  const touchStartX = useRef<number | null>(null);
  const activeShop = carouselShops[activeIndex];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, carouselShops.length - 1)));
  }, [carouselShops.length]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setIsDocumentVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (carouselShops.length < 2 || isPaused || isInteracting || prefersReducedMotion || !isDocumentVisible) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % carouselShops.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [carouselShops.length, isDocumentVisible, isInteracting, isPaused, prefersReducedMotion]);

  if (!activeShop) return null;

  const move = (direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + carouselShops.length) % carouselShops.length);
  };
  const shopImage = normalizeCustomBannerImage(activeShop.theme_config?.custom_banner_url, activeShop.category)
    || (activeShop.products_preview?.[0]
      ? getProductImageForDisplay(activeShop.products_preview[0].image_url, activeShop.category)
      : getCategoryDefaults(activeShop.category).bannerPlaceholderImageUrl);

  return (
    <section
      className="featured-carousel relative mt-8 overflow-hidden rounded-xl bg-[#0f4d3d] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6572b]"
      aria-label="Boutiques à la une"
      aria-roledescription="carrousel"
      tabIndex={0}
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        }
      }}
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const distance = event.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(distance) > 45) move(distance > 0 ? -1 : 1);
        touchStartX.current = null;
      }}
    >
      <button type="button" onClick={() => onOpenShop(activeShop.slug)} className="group relative block min-h-[230px] w-full touch-pan-y overflow-hidden text-left sm:min-h-[280px]">
        {shopImage && <img
          src={shopImage}
          alt={`Vitrine de ${activeShop.name}`}
          className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,77,61,0.94),rgba(15,77,61,0.72),rgba(15,77,61,0.2))]" />
        <div className="relative max-w-2xl p-6 pb-24 sm:p-9">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#f2c38d]">
            {activeShop.is_featured && <><Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> À la une · </>}
            {getCategoryDefaults(activeShop.category).label}
          </span>
          <div aria-live="polite" aria-atomic="true">
            <h2 className="mt-3 max-w-xl text-2xl font-bold text-white sm:text-3xl">{activeShop.name}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/90">{activeShop.welcome_message || 'Une adresse locale à découvrir maintenant.'}</p>
          </div>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white group-hover:gap-3 transition-all">
            Découvrir la boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </button>

      {carouselShops.length > 1 && <div className="absolute bottom-3 right-3 flex items-center gap-2 sm:bottom-5 sm:right-6">
        <button type="button" onClick={() => setIsPaused((paused) => !paused)} aria-label={isPaused ? 'Reprendre le défilement' : 'Mettre le défilement en pause'} title={isPaused ? 'Reprendre le défilement' : 'Mettre le défilement en pause'} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-[#0f4d3d]/80 text-white hover:bg-[#0f4d3d]">
          {isPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => move(-1)} aria-label="Boutique précédente" title="Boutique précédente" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-[#0f4d3d]/80 text-white hover:bg-[#0f4d3d]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Boutique suivante" title="Boutique suivante" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-[#0f4d3d]/80 text-white hover:bg-[#0f4d3d]">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-10 text-center text-xs font-bold tabular-nums" aria-live="off">{activeIndex + 1}/{carouselShops.length}</span>
      </div>}
      {carouselShops.length > 1 && <div className="absolute bottom-5 left-6 flex gap-1.5" aria-label="Choisir une boutique">
        {carouselShops.map((shop, index) => <button
          key={shop.slug}
          type="button"
          onClick={() => setActiveIndex(index)}
          aria-label={`Afficher ${shop.name}`}
          aria-current={index === activeIndex ? 'true' : undefined}
          className={`h-2.5 rounded-full border border-white/80 transition-[width,background-color] motion-reduce:transition-none ${index === activeIndex ? 'w-7 bg-white' : 'w-2.5 bg-white/35 hover:bg-white/75'}`}
        />)}
      </div>}
      {prefersReducedMotion && <span className="sr-only">Défilement automatique désactivé selon vos préférences de mouvement.</span>}
    </section>
  );
};
