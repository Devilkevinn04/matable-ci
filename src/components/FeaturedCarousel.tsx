import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { getCategoryDefaults, getProductImageForDisplay, normalizeCustomBannerImage } from '../utils/categoryDefaults';

interface FeaturedShop {
  slug: string;
  name: string;
  category?: string;
  is_open?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  theme_config?: { custom_banner_url?: string; primary_color?: string; event_mode_enabled?: boolean; event_banner_text?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

export function isShopPromotion(shop: FeaturedShop): boolean {
  const hasCampaign = shop.theme_config?.event_mode_enabled && Boolean(shop.theme_config.event_banner_text?.trim());
  return Boolean(shop.is_featured || shop.is_sponsored || hasCampaign);
}

interface FeaturedCarouselProps {
  shops: FeaturedShop[];
  onOpenShop: (slug: string) => void;
}

export const FeaturedCarousel: React.FC<FeaturedCarouselProps> = ({ shops, onOpenShop }) => {
  const carouselShops = useMemo(() => {
    return shops.filter(isShopPromotion).slice(0, 6);
  }, [shops]);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const activeShop = carouselShops[activeIndex];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, carouselShops.length - 1)));
  }, [carouselShops.length]);

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
      className="featured-carousel relative grid min-h-[300px] overflow-hidden rounded-[24px] bg-[#17332c] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6572b] sm:min-h-[320px] lg:grid-cols-[1.05fr_.95fr]"
      aria-label="Boutiques mises en avant"
      aria-roledescription="carrousel"
      tabIndex={0}
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
      <div className="relative z-10 flex flex-col items-start justify-center p-6 pb-20 sm:p-9 sm:pb-20">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#f2c38d]">
          <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          {activeShop.is_sponsored ? 'Sponsorisé' : activeShop.theme_config?.event_mode_enabled ? 'Offre en cours' : 'À la une'} · {getCategoryDefaults(activeShop.category).label}
        </span>
        <div aria-live="polite" aria-atomic="true">
          <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold text-white sm:text-[34px]">{activeShop.name}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#e6efe9]">{activeShop.theme_config?.event_mode_enabled && activeShop.theme_config.event_banner_text?.trim()
            ? activeShop.theme_config.event_banner_text
            : activeShop.welcome_message || 'Une belle adresse locale à découvrir.'}</p>
        </div>
        <button type="button" onClick={() => onOpenShop(activeShop.slug)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#b9441f] px-5 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
          Voir la boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        {carouselShops.length > 1 && <div className="absolute bottom-5 left-6 flex items-center gap-2 sm:left-9">
          {carouselShops.map((shop, index) => <button key={shop.slug} type="button" onClick={() => setActiveIndex(index)} aria-label={`Afficher ${shop.name}`} aria-current={index === activeIndex ? 'true' : undefined} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-white' : 'w-2 bg-white/40 hover:bg-white/75'}`} />)}
        </div>}
      </div>

      <button type="button" onClick={() => onOpenShop(activeShop.slug)} aria-label={`Découvrir ${activeShop.name}`} className="group relative min-h-[200px] overflow-hidden text-left lg:min-h-full">
        {shopImage && <img src={shopImage} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={(event) => { event.currentTarget.hidden = true; }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#17211f]/35 to-transparent" />
        <span className="absolute bottom-4 left-4 rounded-full bg-[#fffdf9]/90 px-3 py-1.5 text-xs font-bold text-[#0f4d3d]">Découvrir cette adresse <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></span>
      </button>

      {carouselShops.length > 1 && <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 sm:bottom-5 sm:right-6">
        <button type="button" onClick={() => move(-1)} aria-label="Boutique précédente" title="Boutique précédente" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-black/45 text-white hover:bg-black/75">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => move(1)} aria-label="Boutique suivante" title="Boutique suivante" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-black/45 text-white hover:bg-black/75">
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-10 text-center text-xs font-bold tabular-nums" aria-live="off">{activeIndex + 1}/{carouselShops.length}</span>
      </div>}
    </section>
  );
};
