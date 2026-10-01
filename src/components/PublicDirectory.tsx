import React, { useMemo, useState } from 'react';
import { getBannerImageForDisplay, getCategoryDefaults, getProductImageForDisplay, isShopCategory, normalizeCustomBannerImage } from '../utils/categoryDefaults';
import { ArrowRight, CheckCircle2, Clock3, MapPin, Search, Store, Sparkles, X } from 'lucide-react';
import { shopMatchesDirectorySearch } from '../utils/directorySearch';

interface DirectoryShop {
  id?: number;
  slug: string;
  name: string;
  category?: string;
  city?: string;
  is_open?: boolean;
  is_active?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  opening_hours?: { enabled?: boolean; open_time?: string; close_time?: string; days?: number[] };
  theme_config?: { custom_banner_url?: string; primary_color?: string; logo_url?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

interface PublicDirectoryProps {
  shops: DirectoryShop[];
  onOpenShop: (slug: string) => void;
  onCreateShop: () => void;
}

export const PublicDirectory: React.FC<PublicDirectoryProps> = ({ shops, onOpenShop, onCreateShop }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const categories = Array.from(new Set(shops.map(shop => shop.category).filter(Boolean))) as string[];
  const categoryLabel = (value?: string) => {
    if (value === 'food' || value?.toLowerCase().includes('rest')) return 'Restauration';
    if (isShopCategory(value)) return getCategoryDefaults(value).label;
    return value || 'Commerce local';
  };
  const filteredShops = useMemo(() => shops.filter(shop =>
    shopMatchesDirectorySearch(shop, query, categoryLabel(shop.category))
      && (category === 'all' || shop.category === category)
  ), [shops, query, category]);
  const featuredShop = shops.find(shop => shop.is_open && (shop.products_count || 0) > 0) || shops[0];
  const popularSearches = ['Attiéké', 'Wax', 'Cocody', 'Lingerie', 'Grillades'];
  const getShopImage = (shop: DirectoryShop) => normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category)
    || (shop.products_preview?.[0]
      ? getProductImageForDisplay(shop.products_preview[0].image_url, shop.category)
      : getCategoryDefaults(shop.category).bannerPlaceholderImageUrl);
  const getShopColor = (shop: DirectoryShop) => shop.theme_color || shop.theme_config?.primary_color || '#176b55';
  const getHoursSummary = (shop: DirectoryShop) => {
    const hours = shop.opening_hours;
    if (!hours || !hours.enabled) return 'Horaires non renseignés';
    if (hours.days && hours.days.length > 0 && hours.days.length < 7) {
      return `${hours.open_time || '08:00'}–${hours.close_time || '22:00'} · ${hours.days.length} j/s`;
    }
    return `${hours.open_time || '08:00'}–${hours.close_time || '22:00'} · 7j/7`;
  };

  return (
    <main className="public-directory min-h-screen text-[#25231f]">
      <section className="mx-auto w-full max-w-7xl px-5 pb-12 pt-8 sm:pb-16 sm:pt-12">
        <div className="max-w-4xl animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0f4d3d]">
            <Sparkles className="h-4 w-4 text-[#e6572b]" /> Découvrez près de vous
            </div>
            <h1 className="hero-title mt-4 max-w-[780px] font-serif text-[34px] font-medium leading-[1.12] text-[#25231f] sm:text-[46px]">Trouvez les belles adresses <span className="hero-accent">locales</span> près de vous.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#6f6a61]">Mode, restauration, artisanat et essentiels du quartier : explorez les vitrines et commandez directement auprès des commerçants.</p>
            <div className="hero-signals mt-5" aria-label="Les essentiels de MaTable">
              <span><span className="hero-signal-dot hero-signal-dot-orange" /> Adresses du quartier</span>
              <span><span className="hero-signal-dot hero-signal-dot-green" /> Catalogue en ligne</span>
              <span><span className="hero-signal-dot hero-signal-dot-gold" /> Commande WhatsApp</span>
            </div>
        </div>

        {featuredShop && !query.trim() && category === 'all' && (
          <button onClick={() => onOpenShop(featuredShop.slug)} className="featured-shop-card relative mt-8 min-h-[230px] w-full overflow-hidden rounded-xl bg-[#0f4d3d] text-left text-white group">
            {getShopImage(featuredShop) && <img
              src={getShopImage(featuredShop)}
              alt={`Illustration de ${featuredShop.name}`}
              className="absolute inset-0 h-full w-full object-cover opacity-55 transition-transform duration-500 group-hover:scale-[1.02]"
              onError={(event) => {
                const element = event.currentTarget;
                const fallback = getCategoryDefaults(featuredShop.category).bannerPlaceholderImageUrl;
                if (element.dataset.placeholderAttempted !== 'true' && element.src !== fallback) {
                  element.dataset.placeholderAttempted = 'true';
                  element.src = fallback;
                } else {
                  element.hidden = true;
                }
              }}
            />}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,77,61,0.92),rgba(15,77,61,0.72),rgba(15,77,61,0.22))]" />
            <div className="relative max-w-2xl p-6 sm:p-8">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#f2c38d]">À découvrir · {categoryLabel(featuredShop.category)}</span>
              <h2 className="mt-3 max-w-xl text-2xl font-bold text-white sm:text-3xl">{featuredShop.name}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/85">{featuredShop.welcome_message || 'Une adresse locale à découvrir maintenant.'}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white group-hover:gap-3 transition-all">Découvrir la boutique <ArrowRight className="h-4 w-4" /></span>
            </div>
          </button>
        )}

        <div className="relative mt-5 flex flex-col lg:flex-row gap-3">
          <label className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input aria-label="Rechercher une boutique, un produit ou une ville" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une boutique, un produit, une ville..." className="w-full rounded-lg border border-[#ded8ce] bg-[#fffdf9] py-3.5 pl-12 pr-12 text-[#25231f] outline-none transition focus:border-[#176b55] focus:ring-2 focus:ring-[#176b55]/15" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" title="Effacer la recherche" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button>}
          </label>
          <button onClick={onCreateShop} className="warm-cta rounded-lg px-5 py-3.5 font-semibold text-white flex items-center justify-center gap-2 transition-colors duration-200">
            <Store className="h-5 w-5" /> Créer ma boutique
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#4a3a30]">
          <span className="font-black text-[#211712]">Essayez :</span>
          {popularSearches.map(term => <button key={term} onClick={() => setQuery(term)} className="rounded-md border border-[#ded8ce] bg-[#fffdf9] px-2.5 py-1.5 font-medium text-[#6f6a61] transition-colors hover:border-[#176b55] hover:text-[#0f4d3d]">{term}</button>)}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => setCategory('all')} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${category === 'all' ? 'border-[#0f4d3d] bg-[#0f4d3d] text-white' : 'border-[#ded8ce] bg-[#fffdf9] text-[#6f6a61] hover:border-[#176b55]'}`}>Toutes les boutiques</button>
          {categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${category === item ? 'border-[#e6572b] bg-[#e6572b] text-white' : 'border-[#ded8ce] bg-[#fffdf9] text-[#6f6a61] hover:border-[#e6572b]'}`}>{categoryLabel(item)}</button>)}
        </div>

        <div className="mt-10 flex items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.1em] text-[#e6572b]">{query.trim() || category !== 'all' ? 'Résultats' : 'À découvrir'}</p><h2 aria-live="polite" className="mt-1 text-xl font-semibold text-[#25231f]">{query.trim() || category !== 'all' ? 'Boutiques correspondantes' : 'Boutiques à découvrir'}</h2></div>
        </div>

        {filteredShops.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#cfc8bc] bg-[#fffdf9] p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f9f0e6] text-[#93602e]">
              <Store className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-[#25231f]">{query.trim() || category !== 'all' ? 'Aucun résultat pour cette recherche' : 'Aucune boutique disponible pour le moment'}</h3>
            <p className="mt-2 text-sm text-[#6f6a61]">{query.trim() || category !== 'all' ? 'Essayez un autre nom de boutique, produit ou quartier, ou effacez les filtres.' : 'La vitrine s’actualisera dès qu’une boutique sera publiée.'}</p>
            {(query.trim() || category !== 'all') && <button type="button" onClick={() => { setQuery(''); setCategory('all'); }} className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-4 py-2 text-sm font-bold text-white hover:bg-[#176b55]">Effacer la recherche et les filtres <X className="h-4 w-4" /></button>}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredShops.map(shop => (
              <button key={shop.slug} onClick={() => onOpenShop(shop.slug)} style={{ '--shop-color': getShopColor(shop) } as React.CSSProperties} className="shop-card group relative overflow-hidden rounded-lg border border-[#ded8ce] bg-[#fffdf9] text-left transition-colors hover:border-[#176b55] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] focus-visible:ring-offset-2">
                <div className="relative h-40 overflow-hidden bg-[#e9e4da]">
                  {getShopImage(shop) ? <img
                    src={getShopImage(shop)}
                    alt={`Illustration de ${shop.name}`}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    onError={(event) => {
                      const element = event.currentTarget;
                      const fallback = getCategoryDefaults(shop.category).bannerPlaceholderImageUrl;
                      if (element.dataset.placeholderAttempted !== 'true' && element.src !== fallback) {
                        element.dataset.placeholderAttempted = 'true';
                        element.src = fallback;
                      } else {
                        element.hidden = true;
                      }
                    }}
                  /> : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${getShopColor(shop)}20`, color: getShopColor(shop) }}>{getCategoryDefaults(shop.category).icon}</div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f4d3d]/70 to-transparent" />
                  {shop.theme_config?.logo_url ? (
                    <img src={shop.theme_config.logo_url} alt={shop.name} className="absolute left-4 bottom-3 w-9 h-9 rounded-xl object-cover border-2 border-white bg-white shadow-sm" />
                  ) : null}
                  <span className="absolute bottom-3 left-4 text-[10px] font-semibold uppercase tracking-wider text-white">{categoryLabel(shop.category)}</span>
                  <span aria-label={shop.is_open ? 'Boutique ouverte maintenant' : 'Boutique fermée actuellement'} className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border-2 border-white px-3 py-1.5 text-[11px] font-black shadow-md ${shop.is_open ? 'bg-[#0f4d3d] text-white' : 'bg-[#fff4e5] text-[#7a3e00]'}`}>
                    {shop.is_open ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
                    {shop.is_open ? 'OUVERTE' : 'FERMÉE'}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-semibold text-[#25231f]">{shop.name}</h3>
                  <p className="mt-1 flex items-center gap-1 text-xs text-[#6f6a61]"><MapPin className="h-3.5 w-3.5" /> {shop.city || 'Côte d’Ivoire'}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#6f6a61]"><Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{getHoursSummary(shop)}</p>
                  <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#6f6a61]">{shop.welcome_message || 'Découvrez le catalogue et commandez directement.'}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-sm bg-[#f9f0e6] px-2 py-1 text-[10px] font-semibold text-[#93602e]">Livraison</span>
                    <span className="rounded-sm bg-[#e8eceb] px-2 py-1 text-[10px] font-semibold text-[#52635b]">Sur place</span>
                  </div>
                  <div className="mt-4 flex gap-1.5 h-10">
                    {(shop.products_preview || []).slice(0, 3).map(product => <img
                      key={product.id}
                      src={getProductImageForDisplay(product.image_url, shop.category)}
                      alt={`Aperçu : ${product.title}`}
                      className="h-10 w-10 rounded-md border border-[#ded8ce] object-cover"
                      onError={(event) => {
                        const element = event.currentTarget;
                        const fallback = getCategoryDefaults(shop.category).productPlaceholderImageUrl;
                        if (element.dataset.placeholderAttempted !== 'true' && element.src !== fallback) {
                          element.dataset.placeholderAttempted = 'true';
                          element.src = fallback;
                        } else {
                          element.hidden = true;
                        }
                      }}
                    />)}
                    {!shop.products_preview?.length && <span className="self-center text-[11px] font-medium text-[#93602e]">Collection en préparation</span>}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#eee9df] pt-3">
                    <span className="text-[11px] font-medium text-[#6f6a61]">{shop.products_count ? 'Catalogue en ligne' : 'Catalogue en préparation'}</span>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0f4d3d]">Découvrir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};