import React, { useMemo, useState } from 'react';
import { ArrowRight, MapPin, Search, Store, UtensilsCrossed, Shirt, Sparkles, ShoppingBag, Zap } from 'lucide-react';

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
  theme_config?: { custom_banner_url?: string; primary_color?: string; logo_url?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number; stock: number }[];
  orders_today?: number;
  low_stock_count?: number;
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
  const filteredShops = useMemo(() => shops.filter(shop => {
    const haystack = `${shop.name} ${shop.city || ''} ${shop.category || ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (category === 'all' || shop.category === category);
  }), [shops, query, category]);
  const openShops = shops.filter(shop => shop.is_open).length;
  const productCount = shops.reduce((total, shop) => total + (shop.products_count || 0), 0);
  const categoryLabel = (value?: string) => {
    if (value === 'food' || value?.toLowerCase().includes('rest')) return 'Restauration';
    if (value === 'fashion') return 'Mode & Artisanat';
    return value || 'Commerce local';
  };
  const featuredShop = shops.find(shop => shop.is_open && (shop.products_count || 0) > 0) || shops[0];
  const popularSearches = ['Attiéké', 'Wax', 'Cocody', 'Lingerie', 'Grillades'];
  const getShopImage = (shop: DirectoryShop) => shop.theme_config?.custom_banner_url || shop.products_preview?.[0]?.image_url;
  const getShopColor = (shop: DirectoryShop) => shop.theme_color || shop.theme_config?.primary_color || '#e11d48';

  return (
    <main className="public-directory min-h-screen text-slate-900 overflow-hidden">
      <section className="relative max-w-7xl mx-auto px-5 pt-8 pb-12 sm:pt-12 sm:pb-16">
        <div className="float-orb float-orb-gold" />
        <div className="float-orb float-orb-rose" />
        <div className="float-orb float-orb-mint" />
        <div className="relative grid lg:grid-cols-[1.2fr_0.8fr] gap-8 items-end">
          <div className="max-w-3xl animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="warm-pill floating-badge inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] rounded-full px-3 py-2">
            <Sparkles className="w-4 h-4 text-[#e2461b]" /> Une communauté qui fait vivre le quartier
            </div>
            <h1 className="mt-4 text-4xl sm:text-6xl font-black tracking-tight leading-[0.98] text-[#211712] hero-title">Trouvez des adresses qui font <span className="hero-accent">sourire</span>, près de chez vous.</h1>
            <p className="mt-5 text-base sm:text-lg text-[#4a3a30] max-w-2xl">Mode, cuisine, artisanat et boutiques locales : découvrez des commerces qui parlent à tout le monde, avec un accès simple et une expérience vraiment conviviale.</p>
            <div className="hero-signals mt-5" aria-label="Les essentiels de MaTable">
              <span><span className="hero-signal-dot hero-signal-dot-orange" /> Bons plans locaux</span>
              <span><span className="hero-signal-dot hero-signal-dot-green" /> Commande WhatsApp</span>
              <span><span className="hero-signal-dot hero-signal-dot-gold" /> Adresses humaines</span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] bg-[#fffaf2] text-[#211712] p-5 shadow-[0_18px_35px_rgba(33,23,18,0.08)] border-[3px] border-[#211712] rotate-1 hover:rotate-0 transition-transform bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,244,234,0.9))] luxe-panel">
            <div className="ambient-orb ambient-orb-gold" />
            <div className="ambient-orb ambient-orb-blue" />
            <div className="absolute -top-3 -right-3 rounded-full bg-[#e8a93a] text-[#211712] text-[10px] font-black px-3 py-2 rotate-6 shadow-[3px_3px_0_rgba(33,23,18,0.95)] floating-badge">JOYFUL • LOCAL • EASY</div>
            <p className="relative text-[10px] uppercase tracking-[0.18em] text-[#1b3a63] font-black">Aujourd’hui sur MaTable</p>
            <div className="relative mt-4 grid grid-cols-2 gap-3">
              <div className="soft-stat rounded-2xl p-3">
                <strong className="block text-2xl font-black text-[#211712] leading-none">{shops.length}</strong>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#4a3a30]">boutiques</p>
              </div>
              <div className="rounded-2xl border-[2px] border-[#211712] bg-[#edf8f3] p-3 shadow-[3px_3px_0_rgba(33,23,18,0.94)]">
                <strong className="block text-2xl font-black text-[#155c3d] leading-none">{openShops}</strong>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#155c3d]">ouvertes</p>
              </div>
            </div>
            <div className="relative mt-5 flex items-center gap-2 rounded-2xl border-[2px] border-[#211712] bg-[linear-gradient(135deg,#1d6b57,#2f8364)] px-3 py-2 text-xs font-bold text-white shadow-[4px_4px_0_rgba(33,23,18,0.95)] leading-snug">
              <Zap className="w-4 h-4 text-[#e8a93a] shrink-0" />
              <span>Commandes simples, bons plans et bonne humeur.</span>
            </div>
          </div>
        </div>

        {featuredShop && (
          <button onClick={() => onOpenShop(featuredShop.slug)} className="featured-shop-card relative mt-9 w-full min-h-[240px] overflow-hidden rounded-[2rem] bg-slate-900 text-left text-white shadow-xl group luxe-hero">
            {getShopImage(featuredShop) && <img src={getShopImage(featuredShop)} alt={`Vitrine de ${featuredShop.name}`} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />}
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(17,10,7,0.84),rgba(17,10,7,0.64),rgba(17,10,7,0.28))]" />
            <div className="relative max-w-2xl p-6 sm:p-8">
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white/15 rounded-full px-3 py-1.5 backdrop-blur-sm">Boutique à découvrir</span>
              <p className="mt-4 text-xs font-black uppercase tracking-widest text-orange-100">{categoryLabel(featuredShop.category)} · {featuredShop.orders_today || 0} commande(s) aujourd’hui</p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white">{featuredShop.name}</h2>
              <p className="mt-2 text-sm text-amber-50 max-w-xl">{featuredShop.welcome_message || 'Une adresse locale à découvrir maintenant.'}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-black group-hover:gap-3 transition-all">Découvrir la boutique <ArrowRight className="w-4 h-4" /></span>
            </div>
          </button>
        )}

        <div className="relative mt-5 flex flex-col lg:flex-row gap-3">
          <label className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une boutique, une ville..." className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 outline-none focus:ring-2 focus:ring-rose-500" />
          </label>
          <button onClick={onCreateShop} className="warm-cta rounded-2xl text-white px-5 py-3.5 font-black flex items-center justify-center gap-2 border-2 border-[#211712] transition-all duration-200">
            <Store className="w-5 h-5" /> Créer ma boutique
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#4a3a30]">
          <span className="font-black text-[#211712]">Essayez :</span>
          {popularSearches.map(term => <button key={term} onClick={() => setQuery(term)} className="px-2.5 py-1.5 rounded-lg bg-[#fffaf2] border-2 border-[#211712] hover:border-[#1b3a63] hover:text-[#1b3a63] transition-colors">{term}</button>)}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => setCategory('all')} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${category === 'all' ? 'bg-[linear-gradient(135deg,#1d6b57,#2d8c69)] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]' : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-[#fff0e3]'}`}>Toutes les boutiques</button>
          {categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all ${category === item ? 'bg-[linear-gradient(135deg,#ff6a3d,#f29b5c)] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]' : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-[#fff0e3]'}`}>{categoryLabel(item)}</button>)}
        </div>

        <div className="mt-10 flex items-end justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-widest text-rose-600">À découvrir</p><h2 className="text-2xl font-black mt-1">{filteredShops.length} boutique(s) disponible(s)</h2></div>
          <span className="text-xs text-slate-500 hidden sm:flex items-center gap-1"><ShoppingBag className="w-3.5 h-3.5" /> {productCount} articles référencés</span>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredShops.map(shop => (
            <button key={shop.slug} onClick={() => onOpenShop(shop.slug)} style={{ '--shop-color': getShopColor(shop) } as React.CSSProperties} className="shop-card relative text-left bg-white border border-slate-200 rounded-[1.6rem] overflow-hidden hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(33,23,18,0.12)] hover:border-[var(--shop-color)] transition-all group animate-in fade-in slide-in-from-bottom-2 duration-500 bg-[linear-gradient(180deg,#fffdfb,#fff6ee)]">
              <div className="relative h-36 overflow-hidden bg-slate-100">
                {getShopImage(shop) ? <img src={getShopImage(shop)} alt={shop.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `${getShopColor(shop)}20`, color: getShopColor(shop) }}>{shop.category?.toLowerCase().includes('rest') || shop.category?.toLowerCase().includes('food') ? <UtensilsCrossed className="w-10 h-10" /> : <Shirt className="w-10 h-10" />}</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
                {shop.theme_config?.logo_url ? (
                  <img src={shop.theme_config.logo_url} alt={shop.name} className="absolute left-4 bottom-3 w-9 h-9 rounded-xl object-cover border-2 border-white bg-white shadow-sm" />
                ) : null}
                <span className="absolute left-16 bottom-3 text-[10px] text-white font-black uppercase tracking-wider">{categoryLabel(shop.category)}</span>
                <span className={`absolute right-4 top-4 text-[10px] font-black uppercase px-2 py-1 rounded-full ${shop.is_open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{shop.is_open ? 'Ouverte' : 'Fermée'}</span>
              </div>
              <div className="p-5">
                <h3 className="font-black text-lg">{shop.name}</h3>
                <p className="mt-1 text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {shop.city || 'Côte d’Ivoire'}</p>
                <p className="mt-3 text-sm text-slate-600 line-clamp-2 min-h-10">{shop.welcome_message || 'Découvrez le catalogue et commandez directement.'}</p>
                <div className="mt-4 flex gap-1.5 h-10">
                  {(shop.products_preview || []).slice(0, 3).map(product => <img key={product.id} src={product.image_url} alt={`Aperçu : ${product.title}`} className="w-10 h-10 rounded-lg object-cover border border-slate-100" />)}
                  {!shop.products_preview?.length && <span className="text-[11px] font-bold text-amber-700 self-center">Collection en préparation</span>}
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-400">{shop.products_count || 0} articles · {shop.orders_today || 0} commande(s) aujourd’hui</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-black" style={{ color: getShopColor(shop) }}>Découvrir <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
};