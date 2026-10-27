import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BadgePercent, CheckCircle2, Clock3, MapPin, RotateCcw, Search, Store, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { MotionReveal } from './MotionSystem';
import { getCategoryDefaults, getProductImageForDisplay, isShopCategory, normalizeCustomBannerImage, SHOP_CATEGORIES } from '../utils/categoryDefaults';
import { shopMatchesDirectorySearch } from '../utils/directorySearch';
import { getPublicDiscoveryPages, toDiscoveryCitySlug, type DiscoveryPage } from '../utils/discoverySeo';
import { ProductNewsFeed, type FeedProduct } from './ProductNewsFeed';
import { PublicCampaignCarousel, type PublicCampaign } from './PublicCampaignCarousel';
import { PublicPartnerCarousel, type PublicPermanentPartner } from './PublicPartnerCarousel';
import { formatFCFA } from '../utils/format';
import { useAutoScrollRail } from '../hooks/useAutoScrollRail';

interface DirectoryShop {
  id?: number;
  slug: string;
  name: string;
  category?: string;
  city?: string;
  created_at?: string;
  is_open?: boolean;
  is_featured?: boolean;
  is_sponsored?: boolean;
  boost_placements?: string[];
  is_active?: boolean;
  products_count?: number;
  welcome_message?: string | null;
  theme_color?: string;
  opening_hours?: { enabled?: boolean; open_time?: string; close_time?: string; days?: number[] };
  theme_config?: { custom_banner_url?: string; primary_color?: string; logo_url?: string; event_mode_enabled?: boolean; event_type?: string; event_banner_text?: string };
  products_preview?: { id: number; title: string; image_url: string; price: number }[];
}

interface PublicDirectoryProps {
  shops: DirectoryShop[];
  isLoading: boolean;
  loadError: boolean;
  onRetry: () => void;
  onOpenShop: (slug: string) => void;
  onOpenDirectory: (query?: string) => void;
  discoveryPage?: DiscoveryPage;
  isShopDirectoryPage?: boolean;
  isPromotionsPage?: boolean;
}

type DirectorySort = 'recommended' | 'open' | 'name';

const categoryTileColors: Record<string, string> = {
  fashion: '#d1fae5',
  food: '#fbe3d6',
  beauty: '#f3e3ea',
  electronics: '#e4e9ee',
  home: '#e9e4da',
  services: '#e2eee6',
  health: '#e0efec',
  crafts: '#f3e6c9',
  education: '#e6e9f3',
  automotive: '#e8e6e1',
  other: '#eee9df',
};

const homeTitleWords = [
  { text: 'Le', accent: false },
  { text: 'commerce', accent: false },
  { text: 'local,', accent: false },
  { text: 'tout', accent: true },
  { text: 'près', accent: true },
  { text: 'de', accent: true },
  { text: 'vous.', accent: true },
];

const DEMO_SHOPS: DirectoryShop[] = [
  { id: 9101, slug: 'demo-atelier-nzassa', name: 'Atelier N’Zassa', category: 'fashion', city: 'Abidjan · Cocody', is_open: true, is_featured: true, products_count: 12, theme_color: '#8b5e3c', products_preview: [
    { id: 98101, title: 'Ensemble en pagne tissé', image_url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=900&auto=format&fit=crop&q=82', price: 25000 },
    { id: 98102, title: 'Sac artisanal en raphia', image_url: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=900&auto=format&fit=crop&q=82', price: 18000 },
  ] },
  { id: 9102, slug: 'demo-maquis-lagune', name: 'Maquis La Lagune', category: 'food', city: 'Abidjan · Marcory', is_open: true, is_sponsored: true, products_count: 18, theme_color: '#c2410c', products_preview: [
    { id: 98103, title: 'Poulet braisé & attiéké', image_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=900&auto=format&fit=crop&q=82', price: 6500 },
    { id: 98104, title: 'Poisson braisé du jour', image_url: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=900&auto=format&fit=crop&q=82', price: 8500 },
  ] },
  { id: 9103, slug: 'demo-douceur-abidjan', name: 'Douceur d’Abidjan', category: 'beauty', city: 'Abidjan · Cocody', is_open: true, products_count: 24, theme_color: '#9d174d', products_preview: [
    { id: 98105, title: 'Soin éclat au karité', image_url: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=900&auto=format&fit=crop&q=82', price: 12000 },
    { id: 98106, title: 'Coffret beauté naturelle', image_url: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=900&auto=format&fit=crop&q=82', price: 22000 },
  ] },
  { id: 9104, slug: 'demo-tech-ivoire', name: 'Tech Ivoire', category: 'electronics', city: 'Abidjan · Plateau', is_open: false, products_count: 32, theme_color: '#1d4ed8', products_preview: [
    { id: 98107, title: 'Casque sans fil Bluetooth', image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&auto=format&fit=crop&q=82', price: 28000 },
    { id: 98108, title: 'Enceinte nomade', image_url: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=900&auto=format&fit=crop&q=82', price: 19500 },
  ] },
  { id: 9105, slug: 'demo-maison-kawa', name: 'Maison Kawa', category: 'home', city: 'Grand-Bassam', is_open: true, products_count: 16, theme_color: '#166534', products_preview: [
    { id: 98109, title: 'Lampe tressée à la main', image_url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=900&auto=format&fit=crop&q=82', price: 32000 },
    { id: 98110, title: 'Panier déco en fibres naturelles', image_url: 'https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?w=900&auto=format&fit=crop&q=82', price: 14500 },
  ] },
  { id: 9106, slug: 'demo-racines-du-terroir', name: 'Racines du Terroir', category: 'crafts', city: 'Yamoussoukro', is_open: true, products_count: 20, theme_color: '#a16207', products_preview: [
    { id: 98111, title: 'Coffret de douceurs locales', image_url: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=900&auto=format&fit=crop&q=82', price: 11000 },
    { id: 98112, title: 'Miel de forêt ivoirien', image_url: 'https://images.unsplash.com/photo-1587049352851-8d4e89133924?w=900&auto=format&fit=crop&q=82', price: 7500 },
  ] },
  { id: 9107, slug: 'demo-atelier-bouake', name: 'Atelier de Bouaké', category: 'services', city: 'Bouaké', is_open: true, products_count: 9, theme_color: '#0f766e', products_preview: [
    { id: 98113, title: 'Création de logo sur mesure', image_url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=900&auto=format&fit=crop&q=82', price: 35000 },
    { id: 98114, title: 'Pack photo pour boutique', image_url: 'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=900&auto=format&fit=crop&q=82', price: 25000 },
  ] },
  { id: 9108, slug: 'demo-bien-etre-ivoire', name: 'Bien-être Ivoire', category: 'health', city: 'Abidjan · Riviera', is_open: true, products_count: 14, theme_color: '#047857', products_preview: [
    { id: 98115, title: 'Infusion gingembre & citron', image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=900&auto=format&fit=crop&q=82', price: 4500 },
    { id: 98116, title: 'Huile de massage relaxante', image_url: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=900&auto=format&fit=crop&q=82', price: 9000 },
  ] },
];

const DEMO_PRODUCTS: FeedProduct[] = DEMO_SHOPS.flatMap((shop, shopIndex) =>
  (shop.products_preview || []).map((product, productIndex) => ({
    id: product.id,
    shop_id: shop.id || 0,
    title: product.title,
    description: `Une création choisie avec soin par ${shop.name}.`,
    price: product.price,
    sale_price: product.id === 98103 ? 5500 : product.id === 98109 ? 27500 : null,
    sale_starts_at: null,
    sale_ends_at: product.id === 98103 || product.id === 98109
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null,
    stock: 3 + ((shopIndex + productIndex) % 8),
    image_url: product.image_url,
    created_at: new Date(Date.now() - (shopIndex + productIndex + 1) * 24 * 60 * 60 * 1000).toISOString(),
    popularity: { views: 120 - shopIndex * 8 - productIndex * 3, clicks: 20 - shopIndex },
    like_count: 8 + shopIndex,
    shop: { id: shop.id || 0, name: shop.name, slug: shop.slug, category: shop.category || 'other', city: shop.city },
  })),
);

export const PublicDirectory: React.FC<PublicDirectoryProps> = ({ shops, isLoading, loadError, onRetry, onOpenShop, onOpenDirectory, discoveryPage, isShopDirectoryPage = false, isPromotionsPage = false }) => {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState(() => isShopDirectoryPage ? new URLSearchParams(location.search).get('q') || '' : '');
  const [category, setCategory] = useState(discoveryPage?.category || 'all');
  const [directorySort, setDirectorySort] = useState<DirectorySort>('recommended');
  const [openOnly, setOpenOnly] = useState(false);
  const [campaignEligible, setCampaignEligible] = useState(false);
  const [activeDemoShop, setActiveDemoShop] = useState<DirectoryShop | null>(null);
  const [demoBasket, setDemoBasket] = useState<Record<number, number>>({});
  const isLocalAdvertisingDemo = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true
    && new URLSearchParams(location.search).get('demo') === '1'
    && !discoveryPage && !isShopDirectoryPage;
  const directoryShops = isLocalAdvertisingDemo ? DEMO_SHOPS : shops;
  const directoryIsLoading = isLoading && !isLocalAdvertisingDemo;
  useEffect(() => {
    if (isShopDirectoryPage) setQuery(new URLSearchParams(location.search).get('q') || '');
  }, [isShopDirectoryPage, location.search]);
  useEffect(() => {
    if (!activeDemoShop) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveDemoShop(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDemoShop]);
  const availableCategories = new Set(directoryShops.map((shop) => shop.category).filter(Boolean));
  const categories = SHOP_CATEGORIES.filter((item) => availableCategories.has(item));
  const discoveryPages = getPublicDiscoveryPages(directoryShops);
  const cityPages = discoveryPages.filter((page) => page.city);
  const relatedDiscoveryPages = discoveryPage?.city
    ? discoveryPages.filter((page) => page.category)
    : cityPages;
  const categoryLabel = (value?: string) => {
    if (value === 'food' || value?.toLowerCase().includes('rest')) return 'Restauration';
    if (isShopCategory(value)) return getCategoryDefaults(value).label;
    return value || 'Commerce local';
  };
  const handleOpenShop = (slug: string) => {
    if (!isLocalAdvertisingDemo) {
      onOpenShop(slug);
      return;
    }
    setDemoBasket({});
    setActiveDemoShop(directoryShops.find((shop) => shop.slug === slug) || null);
  };
  const handleOpenDirectory = (search?: string) => {
    if (!isLocalAdvertisingDemo) {
      onOpenDirectory(search);
      return;
    }
    setCategory('all');
    if (search === undefined) setQuery('');
    else setQuery(search);
  };
  const homeShops = [...directoryShops]
    .filter((shop) => (category === 'all' || shop.category === category)
      && (!query.trim() || shopMatchesDirectorySearch(shop, query, categoryLabel(shop.category))))
    .sort((left, right) => Number(Boolean(right.is_sponsored || right.is_featured)) - Number(Boolean(left.is_sponsored || left.is_featured)))
    .slice(0, 8);
  const categoryRail = useAutoScrollRail<HTMLDivElement>(
    !discoveryPage && !isShopDirectoryPage && !directoryIsLoading,
    categories.length,
    4600,
  );
  const shopRail = useAutoScrollRail<HTMLDivElement>(
    !discoveryPage && !isShopDirectoryPage && !isLoading,
    homeShops.length,
    5200,
  );
  const demoContent = useMemo(() => {
    if (!isLocalAdvertisingDemo) return undefined;
    const shuffled = <T,>(items: T[]) => {
      const result = [...items];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return result;
    };
    const getPreviewShopImage = (shop: DirectoryShop) => normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category)
      || (shop.products_preview?.[0]
        ? getProductImageForDisplay(shop.products_preview[0].image_url, shop.category)
        : getCategoryDefaults(shop.category).bannerPlaceholderImageUrl);
    const availableShops = shuffled(directoryShops).slice(0, 8);
    const bannerCampaigns: PublicCampaign[] = availableShops.slice(0, 3).map((shop, index) => ({
      id: `local-demo-banner-${shop.slug}-${index}`,
      kind: 'banner',
      headline: [
        'Les bonnes adresses de votre quartier',
        'Le savoir-faire local à découvrir',
        'Des talents proches de vous',
      ][index],
      body: `Découvrez ${shop.name} et ses produits disponibles à ${shop.city || 'Côte d’Ivoire'}.`,
      event_token: 'local-demo-only',
      shop: {
        name: shop.name,
        slug: shop.slug,
        image_url: getPreviewShopImage(shop),
        category: shop.category,
        city: shop.city,
      },
    }));
    const products = shuffled(availableShops.flatMap((shop) =>
      (shop.products_preview || []).map((product) => ({ shop, product })),
    )).slice(0, 6);
    const productCampaigns: PublicCampaign[] = products.map(({ shop, product }, index) => ({
      id: `local-demo-product-${product.id}-${index}`,
      kind: 'product',
      headline: product.title || 'Produit local à découvrir',
      body: `Une sélection de ${shop.name}, boutique locale à ${shop.city || 'Côte d’Ivoire'}.`,
      event_token: 'local-demo-only',
      shop: {
        name: shop.name,
        slug: shop.slug,
        image_url: getPreviewShopImage(shop),
        category: shop.category,
        city: shop.city,
      },
      product: {
        id: product.id,
        title: product.title,
        price: product.price,
        sale_price: null,
        sale_starts_at: null,
        sale_ends_at: null,
        image_url: product.image_url,
        stock: 1,
      },
    }));
    const demoPartners: PublicPermanentPartner[] = shuffled([
      { id: 'local-demo-partner-koro', name: 'KÔRÔ', descriptor: 'Artisanat & création', headline: 'Les talents d’ici rayonnent.', logo_url: null, destination_url: null },
      { id: 'local-demo-partner-naya', name: 'NAYA', descriptor: 'Solutions de paiement', headline: 'Le commerce avance avec vous.', logo_url: null, destination_url: null },
      { id: 'local-demo-partner-terre', name: 'TERRE D’ICI', descriptor: 'Produits du terroir', headline: 'Le meilleur de nos terroirs.', logo_url: null, destination_url: null },
      { id: 'local-demo-partner-civ', name: 'CÔTE D’IVOIRE', descriptor: 'Partenaire institutionnel', headline: 'Ensemble, faisons grandir nos commerces.', logo_url: null, destination_url: null },
    ]);
    return { campaigns: [...bannerCampaigns, ...productCampaigns], partners: demoPartners };
  }, [directoryShops, isLocalAdvertisingDemo]);
  const categoryCounts = new Map<string, number>();
  for (const shop of directoryShops) {
    if (shop.category) categoryCounts.set(shop.category, (categoryCounts.get(shop.category) || 0) + 1);
  }
  const popularSearches = [
    ...categories.slice(0, 4).map(categoryLabel),
    ...cityPages.slice(0, 1).map((page) => page.city || ''),
  ].filter(Boolean).slice(0, 5);
  const filteredShops = useMemo(() => {
    const filtered = directoryShops.filter((shop) =>
    shopMatchesDirectorySearch(shop, query, categoryLabel(shop.category))
      && (category === 'all' || shop.category === category)
      && (!openOnly || shop.is_open)
      && (!discoveryPage?.citySlug || toDiscoveryCitySlug(shop.city || '') === discoveryPage.citySlug)
    );
    const targetPlacement = discoveryPage?.citySlug
      ? 'city'
      : discoveryPage?.category || category !== 'all'
        ? 'category'
        : !isShopDirectoryPage
          ? 'home'
          : null;
    const ordered = targetPlacement
      ? filtered.map((shop, index) => ({ shop, index })).sort((left, right) => {
        const leftBoosted = left.shop.boost_placements?.includes(targetPlacement) || left.shop.boost_placements?.includes('directory');
        const rightBoosted = right.shop.boost_placements?.includes(targetPlacement) || right.shop.boost_placements?.includes('directory');
        return Number(rightBoosted) - Number(leftBoosted) || left.index - right.index;
      }).map(({ shop }) => shop)
      : filtered;
    if (directorySort === 'open') return [...ordered].sort((left, right) => Number(Boolean(right.is_open)) - Number(Boolean(left.is_open)));
    if (directorySort === 'name') return [...ordered].sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }));
    return ordered;
  }, [directoryShops, query, category, openOnly, directorySort, discoveryPage?.citySlug, discoveryPage?.category, isShopDirectoryPage]);
  const hasActiveDirectoryFilters = Boolean(query.trim() || category !== 'all' || openOnly);
  const getShopImage = (shop: DirectoryShop) => normalizeCustomBannerImage(shop.theme_config?.custom_banner_url, shop.category)
    || (shop.products_preview?.[0]
      ? getProductImageForDisplay(shop.products_preview[0].image_url, shop.category)
      : getCategoryDefaults(shop.category).bannerPlaceholderImageUrl);
  const getShopColor = (shop: DirectoryShop) => shop.theme_color || shop.theme_config?.primary_color || '#047857';
  const searchForm = <form
    onSubmit={(event) => {
      event.preventDefault();
      if (isLocalAdvertisingDemo) {
        setQuery(query.trim());
        return;
      }
      if (isShopDirectoryPage) onOpenDirectory(query.trim() || undefined);
      else onOpenDirectory(query);
    }}
    className={`mt-4 flex w-full max-w-[610px] items-center gap-1.5 rounded-[16px] border p-1.5 shadow-[0_10px_28px_rgba(0,0,0,.12)] focus-within:ring-2 focus-within:ring-[#f0ba80]/50 sm:mt-6 sm:gap-2 sm:rounded-[18px] sm:p-2 ${isShopDirectoryPage ? 'border-white/20 bg-white text-[#292d2a]' : 'border-[#d9cdbd] bg-white focus-within:border-[#047857] focus-within:ring-[#047857]/15'}`}
  >
    <Search className="ml-2 h-5 w-5 shrink-0 text-[#82796e]" aria-hidden="true" />
    <input
      aria-label={isShopDirectoryPage ? 'Rechercher une boutique, une ville ou un quartier' : 'Rechercher une boutique, un produit ou un quartier'}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={isShopDirectoryPage ? 'Boutique ou quartier…' : 'Boutique, produit, quartier…'}
      className="min-h-10 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs outline-none placeholder:text-[#898178] sm:min-h-11 sm:px-2 sm:text-base"
    />
    {query && <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
    <button type="submit" className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-2.5 text-xs font-bold text-white transition sm:min-h-11 sm:px-5 sm:text-sm ${isShopDirectoryPage ? 'bg-[#c2410c] hover:bg-[#a53a1d]' : 'bg-[#065f46] hover:bg-[#047857]'}`}>
      <span className="sm:hidden">Chercher</span>
      <span className="hidden sm:inline">{isShopDirectoryPage ? 'Rechercher' : 'Voir les boutiques'}</span>
    </button>
  </form>;

  if (isPromotionsPage) {
    return (
      <main className="min-h-screen bg-[#FAF8F2] text-[#292d2a]">
        <section className="relative isolate overflow-hidden bg-[#065f46] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 -z-10 h-80 w-80 rounded-full border border-white/10 sm:right-[12%] sm:h-[34rem] sm:w-[34rem]" />
          <div className="mx-auto grid max-w-[1184px] gap-8 px-5 py-9 sm:px-8 sm:py-12 lg:grid-cols-[1fr_350px] lg:items-end">
            <MotionReveal>
              <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-white/65">
                <Link to="/" className="font-semibold text-white hover:underline">Accueil</Link>
                <span aria-hidden="true" className="px-2">/</span>
                <span>Promotions</span>
              </nav>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]"><BadgePercent className="h-4 w-4" aria-hidden="true" /> Bons plans des boutiques</p>
              <h1 className="mt-3 max-w-3xl font-display text-4xl font-extrabold leading-[1.04] tracking-[-.045em] sm:text-6xl">Les bons plans du quartier. <span className="text-[#f0ba80]">Vraiment.</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-lg sm:leading-7">Des prix réduits publiés par les boutiques locales, visibles pendant leurs dates réelles. Repérez une offre, découvrez le vendeur et échangez directement avec lui.</p>
              <a href="#offres-actives" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f0ba80] px-5 text-sm font-extrabold text-[#292d2a] transition hover:bg-[#ffd09a]">Voir les offres actives <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
            </MotionReveal>
            <MotionReveal delay={0.1}>
            <aside className="rounded-[24px] border border-white/15 bg-white/[0.08] p-5 backdrop-blur-sm sm:p-6" aria-label="Comment reconnaître une offre active">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#f0ba80]">Une offre claire, pas de surprise</p>
              <ul className="mt-4 space-y-3 text-sm leading-5 text-white/90">
                <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0ba80]" aria-hidden="true" /><span>Le prix réduit et le prix habituel sont affichés ensemble.</span></li>
                <li className="flex gap-2.5"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#f0ba80]" aria-hidden="true" /><span>La période de validité est indiquée sur chaque offre.</span></li>
                <li className="flex gap-2.5"><Store className="mt-0.5 h-4 w-4 shrink-0 text-[#f0ba80]" aria-hidden="true" /><span>Disponibilité, retrait et livraison se confirment avec la boutique.</span></li>
              </ul>
              <Link to="/comment-ca-marche#promotions" className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#f0ba80] hover:text-white">Comprendre les promotions <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </aside>
            </MotionReveal>
          </div>
        </section>
        <div id="offres-actives">
          <ProductNewsFeed key="promotions" onOpenShop={handleOpenShop} categories={categories} promotionsOnly />
        </div>
      </main>
    );
  }

  return (
    <main className="public-directory min-h-screen bg-[#FAF8F2] text-[#292d2a]">
      {discoveryPage ? (
        <section className="mx-auto w-full max-w-[1184px] px-5 pb-7 pt-10 sm:px-8 sm:pb-10 sm:pt-14">
          <nav aria-label="Fil d’Ariane" className="mb-5 text-sm text-[#647067]">
            <Link to="/" className="font-semibold text-[#065f46] hover:underline">Accueil</Link>
            <span aria-hidden="true" className="px-2">/</span>
            <span>{discoveryPage.city || (discoveryPage.category ? categoryLabel(discoveryPage.category) : 'Boutiques')}</span>
          </nav>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c] sm:text-sm">Commerce local · Côte d’Ivoire</p>
          <h1 className="max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">{discoveryPage.heading}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f5a55] sm:text-lg">{discoveryPage.description.replace(' | MaTable.ci', '')}</p>
          {relatedDiscoveryPages.length > 0 && (
            <nav aria-label={discoveryPage.city ? 'Découvrir par catégorie' : 'Découvrir par ville'} className="mt-6 flex flex-wrap gap-2">
              <span className="self-center pr-1 text-sm font-bold text-[#47534b]">{discoveryPage.city ? 'Explorer les catégories :' : 'Explorer par ville :'}</span>
              {relatedDiscoveryPages.map((page) => (
                <Link key={page.path} to={page.path} className="rounded-full border border-[#e0d5c6] bg-white px-3 py-1.5 text-sm font-semibold text-[#065f46] transition hover:border-[#047857]">
                  {page.city || (page.category ? categoryLabel(page.category) : '')}
                </Link>
              ))}
            </nav>
          )}
        </section>
      ) : isShopDirectoryPage ? (
        <section className="relative isolate overflow-hidden bg-[#065f46] text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-36 -z-10 h-[470px] w-[470px] rounded-full border border-white/10 sm:right-[8%] sm:top-[-250px] sm:h-[700px] sm:w-[700px]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-5 top-20 -z-10 h-64 w-64 rounded-full border border-[#f0ba80]/20 sm:right-[15%] sm:top-8 sm:h-96 sm:w-96" />
          <div className="mx-auto grid w-full max-w-[1280px] gap-9 px-5 pb-10 pt-8 sm:px-8 sm:pb-14 sm:pt-10 lg:grid-cols-[1fr_340px] lg:items-end lg:gap-16 lg:px-12 lg:pb-16 lg:pt-12">
            <MotionReveal className="min-w-0">
              <nav aria-label="Fil d’Ariane" className="mb-8 text-sm text-white/65">
                <Link to="/" className="font-semibold text-white hover:underline">Accueil</Link>
                <span aria-hidden="true" className="px-2">/</span>
                <span>Boutiques</span>
              </nav>
              <p className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f0ba80] sm:text-sm">
                <span className="h-px w-7 bg-[#f0ba80]" aria-hidden="true" /> Le carnet des bonnes adresses
              </p>
              <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.04] tracking-[-0.045em] sm:text-6xl lg:text-[68px]">
                Les boutiques qui font <span className="text-[#f0ba80]">vivre</span> nos quartiers.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#e0ebe5] sm:text-lg">
                    Des créateurs aux bonnes tables, trouvez une adresse et découvrez l’histoire derrière chaque vitrine.
              </p>
              {searchForm}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/70 sm:text-sm" aria-label="Suggestions de recherche">
                <span className="mr-1 font-semibold text-white/90">Explorer :</span>
                {popularSearches.map((term) => <button key={term} type="button" onClick={() => setQuery(term)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-white transition hover:border-[#f0ba80] hover:bg-white/10">{term}</button>)}
              </div>
            </MotionReveal>
            <MotionReveal delay={0.1}>
            <aside className="relative overflow-hidden rounded-[26px] border border-white/15 bg-[#FFFFFF] p-5 text-[#292d2a] shadow-[0_24px_70px_rgba(0,0,0,.2)] sm:p-6" aria-label="Repères de l’annuaire">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c]">Le commerce à portée de main</p>
                  <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight">Une adresse, une histoire.</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d1fae5] text-xl" aria-hidden="true">✳</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#647067]">Trouvez votre prochain coup de cœur et prenez contact en direct.</p>
              <div className="mt-5 grid grid-cols-2 divide-x divide-[#e7ddd0] rounded-2xl bg-[#FAF8F2] py-3">
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#065f46]">{directoryIsLoading ? '…' : directoryShops.length}</span>
                  <span className="text-xs font-semibold text-[#647067]">adresses locales</span>
                </div>
                <div className="px-4">
                  <span className="block font-display text-2xl font-extrabold text-[#065f46]">{directoryIsLoading ? '…' : categories.length}</span>
                  <span className="text-xs font-semibold text-[#647067]">univers à explorer</span>
                </div>
              </div>
              {cityPages.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                {cityPages.slice(0, 3).map((page) => <Link key={page.path} to={page.path} className="inline-flex items-center gap-1 rounded-full bg-[#d1fae5] px-3 py-1.5 text-xs font-bold text-[#065f46] transition hover:bg-[#d2e8dd]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{page.city}</Link>)}
              </div>}
            </aside>
            </MotionReveal>
          </div>
        </section>
      ) : (
      <section className="mx-auto w-full max-w-[1280px] px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6 lg:px-10">
        <div className="grid overflow-hidden rounded-3xl border border-[#e7dfd3] bg-white shadow-[0_8px_28px_rgba(20,40,30,.07)] lg:min-h-[330px] lg:grid-cols-[.88fr_1.12fr]">
          <motion.div
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { delayChildren: 0.08, staggerChildren: 0.12 } } }}
            className="flex min-w-0 flex-col justify-center bg-gradient-to-br from-[#fffdf8] via-[#f8f5ef] to-[#edf5f0] p-5 sm:p-8 lg:p-9"
          >
            <motion.p variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }} className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#c2410c] sm:text-xs">Le commerce local, simplifié</motion.p>
            <motion.h1
              variants={{ hidden: {}, visible: { transition: { delayChildren: 0.04, staggerChildren: 0.055 } } }}
              className="max-w-[600px] font-display text-[36px] font-extrabold leading-[1.02] tracking-[-0.055em] text-[#065f46] sm:text-[48px] lg:text-[58px]"
            >
              {homeTitleWords.map((word, index) => (
                <React.Fragment key={word.text}>
                  {index > 0 && ' '}
                  <motion.span
                    variants={{
                      hidden: { opacity: 0, y: 12, filter: 'blur(5px)' },
                      visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.42, ease: 'easeOut' } },
                    }}
                    className={`inline-block ${word.accent ? 'text-[#c2410c]' : ''}`}
                  >
                    {word.text}
                  </motion.span>
                </React.Fragment>
              ))}
            </motion.h1>
            <motion.p variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }} className="mt-3 max-w-[480px] text-sm leading-6 text-[#47534b] sm:text-[15px]">
              Parcourez les boutiques, repérez leurs produits et contactez directement les commerçants de Côte d’Ivoire.
            </motion.p>
            <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }}>
              {searchForm}
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } }} className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-[#315548] sm:text-xs">
              <span className="inline-flex items-center gap-1.5"><Store className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Boutiques locales</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Échange direct</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#059669]" aria-hidden="true" /> Retrait ou livraison à convenir</span>
            </motion.div>
          </motion.div>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: prefersReducedMotion ? 0 : 0.22, ease: 'easeOut' }}
            className="flex min-w-0 flex-col justify-center bg-[#fffdf8] p-4 sm:p-6 lg:p-7"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff0df] px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-[#8f351d] sm:text-[10px]">
                <BadgePercent className="h-3.5 w-3.5" aria-hidden="true" /> Vitrine premium
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-[#647067] sm:text-[10px]">Sponsors & partenaires</span>
            </div>
            <PublicCampaignCarousel onOpenShop={handleOpenShop} eligible={campaignEligible} placement="billboard" previewCampaigns={demoContent?.campaigns} />
          </motion.div>
        </div>
      </section>
      )}

      {demoContent && <aside className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-[1200px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-950 sm:text-sm" role="status">
        Démo interactive locale · boutiques et produits fictifs. Essayez la recherche, les catégories, les campagnes et le panier. Aucun événement publicitaire ni commande ne sera envoyé.
      </aside>}
      {!discoveryPage && !isShopDirectoryPage && <PublicPartnerCarousel previewPartners={demoContent?.partners} />}

      {!discoveryPage && !isShopDirectoryPage && (directoryIsLoading || categories.length > 0) && <section className="mx-auto w-full max-w-[1280px] px-5 pb-4 sm:px-8 sm:pb-6 lg:px-10" aria-labelledby="home-categories-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <MotionReveal>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c2410c]">Explorez par univers</p>
            <h2 id="home-categories-title" className="mt-1 font-display text-xl font-extrabold tracking-tight sm:text-2xl">Les catégories du moment</h2>
          </MotionReveal>
          <button type="button" onClick={() => handleOpenDirectory()} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-[#065f46] hover:text-[#047857]">
            Toutes les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {directoryIsLoading ? <div role="status" aria-label="Chargement des catégories" className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[94px] min-w-[118px] animate-pulse rounded-2xl bg-[#e9e4da] sm:min-w-[150px]" />)}
        </div> : <div
          ref={categoryRail.railRef}
          {...categoryRail.handlers}
          className="carousel-rail -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0"
          aria-label="Catégories de boutiques"
          aria-roledescription="carrousel"
          role="region"
          tabIndex={0}
        >
          {categories.map((item, index) => {
            const count = categoryCounts.get(item) || 0;
            return <MotionReveal key={item} delay={index * 0.05} className="w-[46%] shrink-0 snap-start sm:w-[calc(33.333%-8px)] lg:w-[calc(20%-10px)]">
            <button type="button" aria-pressed={category === item} onClick={() => isLocalAdvertisingDemo ? setCategory(category === item ? 'all' : item) : onOpenDirectory(categoryLabel(item))} className={`motion-interactive group flex min-h-[112px] w-full flex-col items-start justify-between rounded-2xl border border-black/[.04] px-3 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(20,40,30,.08)] sm:px-4 ${category === item && isLocalAdvertisingDemo ? 'ring-2 ring-[#065f46] ring-offset-2' : ''}`} style={{ backgroundColor: categoryTileColors[item] || '#f1f5f2' }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 text-xl" aria-hidden="true">{getCategoryDefaults(item).icon}</span>
              <span className="mt-2 flex w-full items-end justify-between gap-1">
                <span className="min-w-0">
                  <span className="block truncate font-display text-xs font-extrabold text-[#292d2a] sm:text-sm">{categoryLabel(item)}</span>
                  <span className="mt-0.5 block text-[9px] text-[#47534b]">{count} boutique{count === 1 ? '' : 's'}</span>
                </span>
                <ArrowRight className="mb-0.5 h-3.5 w-3.5 shrink-0 text-[#047857] transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </button>
            </MotionReveal>;
          })}
        </div>}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <section className="mx-auto w-full max-w-[1280px] px-5 pb-6 pt-3 sm:px-8 sm:pb-8 lg:px-10" aria-labelledby="home-shops-title">
        <div className="overflow-hidden rounded-[26px] border border-[#e7dfd3] bg-gradient-to-br from-[#f6faf6] via-white to-[#fff8ef] p-4 shadow-[0_8px_28px_rgba(20,40,30,.06)] sm:rounded-[32px] sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-3">
            <MotionReveal>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c2410c]">Les commerces de proximité</p>
              <h2 id="home-shops-title" className="mt-1 font-display text-xl font-extrabold tracking-tight text-[#183f32] sm:text-2xl">Boutiques à la une</h2>
            </MotionReveal>
            <div className="flex items-center gap-3">
              <Link to="/promotions" className="hidden min-h-10 items-center gap-1.5 rounded-full bg-[#fff0df] px-4 text-xs font-extrabold text-[#a53a1d] transition hover:bg-[#fbe3d6] sm:inline-flex">
                <BadgePercent className="h-4 w-4" aria-hidden="true" /> Offres du moment
              </Link>
              <button type="button" onClick={() => handleOpenDirectory()} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-[11px] font-bold text-[#065f46] hover:text-[#047857] sm:text-sm">
                Toutes <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {isLoading ? (
            <div role="status" aria-label="Chargement des boutiques à la une" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-[220px] animate-pulse rounded-2xl bg-[#e9e4da]" />)}
            </div>
          ) : homeShops.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-[#d8d0c3] bg-white px-5 text-center text-sm text-[#647067]">Les boutiques locales seront bientôt à découvrir ici.</div>
          ) : (
            <div
              ref={shopRail.railRef}
              {...shopRail.handlers}
              className="carousel-rail -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:gap-4"
              aria-label="Boutiques à la une"
              aria-roledescription="carrousel"
              role="region"
              tabIndex={0}
            >
              {homeShops.map((shop, index) => (
                <MotionReveal key={shop.slug} delay={index * 0.04} className="h-[336px] min-w-[78%] snap-start sm:min-w-[44%] lg:min-w-[calc(25%-12px)]">
                  <Link to={`/${encodeURIComponent(shop.slug)}`} onClick={(event) => { if (isLocalAdvertisingDemo) { event.preventDefault(); handleOpenShop(shop.slug); } }} className="motion-interactive group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white shadow-[0_2px_12px_rgba(20,40,30,.05)] transition hover:-translate-y-1 hover:border-[#b9d5ca] hover:shadow-[0_12px_28px_rgba(20,40,30,.1)]">
                    <span className="relative block aspect-[1.45] overflow-hidden bg-[#e9f5ee]">
                      <img src={getShopImage(shop)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(event) => { event.currentTarget.hidden = true; }} />
                      <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-[#8f351d] sm:text-[9px]">{categoryLabel(shop.category)}</span>
                      {(shop.is_sponsored || shop.is_featured) && <span className="absolute right-2 top-2 rounded-full bg-[#065f46]/95 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-white">À la une</span>}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
                      <span className="block truncate font-display text-sm font-extrabold text-[#292d2a] sm:text-base">{shop.name}</span>
                      {shop.city && <span className="mt-1 flex items-center gap-1 truncate text-[10px] text-[#647067] sm:text-xs"><MapPin className="h-3 w-3 shrink-0 text-[#059669]" aria-hidden="true" />{shop.city}</span>}
                      {shop.products_preview && shop.products_preview.length > 0 && <span className="mt-3 flex min-w-0 items-center gap-2 border-t border-[#eee8de] pt-2.5">
                        {shop.products_preview.slice(0, 2).map((product) => (
                          <span key={product.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#e9f5ee]">
                              <img src={getProductImageForDisplay(product.image_url, shop.category)} alt="" loading="lazy" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[9px] font-semibold text-[#47534b]">{product.title}</span>
                              <span className="block truncate text-[9px] font-extrabold text-[#065f46]">{formatFCFA(product.price)}</span>
                            </span>
                          </span>
                        ))}
                      </span>}
                      <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-[9px] font-semibold text-[#647067] sm:text-[10px]">
                        <span className="truncate">Retrait ou livraison à convenir</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#059669] transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                </MotionReveal>
              ))}
            </div>
          )}
        </div>
        <MotionReveal delay={0.12} className="mt-3">
        <Link to="/promotions" className="motion-interactive group relative flex min-h-[92px] items-center justify-between gap-4 overflow-hidden rounded-2xl bg-[#fff0df] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(150,70,30,.12)] sm:px-6">
          <span aria-hidden="true" className="absolute -right-7 -top-8 h-36 w-36 rounded-full border-[18px] border-[#f5d3b5]" />
          <span className="relative flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c2410c] text-white"><BadgePercent className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0">
            <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#a53a1d]">Promotions des boutiques</span>
            <span className="mt-1 block font-display text-base font-extrabold leading-tight text-[#292d2a] sm:text-lg">Les offres actives, réunies au même endroit.</span>
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#a53a1d] sm:text-sm">Voir les offres <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </Link>
        </MotionReveal>
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <PublicCampaignCarousel onOpenShop={handleOpenShop} eligible={campaignEligible} placement="tiles" previewCampaigns={demoContent?.campaigns} />}

      {!discoveryPage && !isShopDirectoryPage && <ProductNewsFeed
        onOpenShop={handleOpenShop}
        categories={categories}
        onCampaignEligibilityChange={setCampaignEligible}
        demoProducts={isLocalAdvertisingDemo ? DEMO_PRODUCTS : undefined}
        demoCampaigns={isLocalAdvertisingDemo ? demoContent?.campaigns : undefined}
        demoCategory={isLocalAdvertisingDemo ? category : 'all'}
        demoSearch={isLocalAdvertisingDemo ? query : ''}
      />}

      {(discoveryPage || isShopDirectoryPage) && <section id="boutiques" className={`relative isolate mx-auto w-full scroll-mt-24 overflow-hidden rounded-[28px] border border-[#e8dfd2] bg-gradient-to-br from-[#f5efe4] via-[#fcfaf5] to-[#edf5ef] px-4 pb-8 pt-6 shadow-[0_14px_50px_rgba(42,53,43,.06)] sm:rounded-[36px] sm:px-8 sm:pb-12 sm:pt-9 ${isShopDirectoryPage ? 'max-w-[1280px] lg:px-12' : 'max-w-[1184px]'}`}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 z-0 h-72 w-72 rounded-full bg-[#d5e9dc]/45 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 z-0 h-80 w-80 rounded-full bg-[#f3d9bb]/35 blur-3xl" />
        <div className="relative z-10 mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#a53a1d] sm:text-xs"><span className="h-px w-6 bg-[#c2410c]" aria-hidden="true" />{isShopDirectoryPage ? 'Le carnet des adresses' : 'Découverte'}</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#183f32] sm:text-3xl">
              {discoveryPage ? 'Les boutiques à découvrir' : hasActiveDirectoryFilters ? 'Adresses correspondantes' : 'Le répertoire des boutiques'}
            </h2>
          </div>
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 text-xs font-bold text-[#47534b] shadow-sm backdrop-blur sm:text-sm" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-[#07805b]" aria-hidden="true" />
            {directoryIsLoading ? 'Chargement…' : `${filteredShops.length} adresse${filteredShops.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {isShopDirectoryPage && (
          <div className="relative z-10 mb-5 overflow-hidden rounded-[24px] border border-white/90 bg-white/75 p-3 shadow-[0_8px_28px_rgba(40,52,43,.07)] backdrop-blur-sm sm:rounded-[28px] sm:p-5">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full bg-[#f3d9bb]/35 blur-2xl" />
            <div className="relative">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a53a1d]">À chacun son univers</p>
                  <p className="mt-1 font-display text-lg font-extrabold text-[#183f32] sm:text-xl">Qu’avez-vous envie de découvrir ?</p>
                </div>
                <span className="hidden pb-1 text-xs font-medium text-[#647067] sm:block">Choisissez une catégorie</span>
              </div>
              <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0" aria-label="Filtrer par catégorie">
                <button
                  type="button"
                  aria-pressed={category === 'all'}
                  onClick={() => setCategory('all')}
                  className={`motion-interactive flex min-h-[70px] min-w-[104px] shrink-0 flex-col items-start justify-between rounded-2xl border px-3 py-2.5 text-left transition sm:min-w-[126px] sm:px-4 ${category === 'all' ? 'border-[#065f46] bg-[#065f46] text-white shadow-[0_8px_18px_rgba(6,95,70,.2)]' : 'border-[#e9e1d7] bg-[#fffdf8] text-[#183f32] hover:border-[#9cbdab] hover:bg-[#f4faf6]'}`}
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-base ${category === 'all' ? 'bg-white/15' : 'bg-[#e2eee6]'}`} aria-hidden="true">✳</span>
                  <span className="flex w-full items-center justify-between gap-2 text-xs font-bold sm:text-sm">
                    Tout voir
                    <span className={`text-[10px] ${category === 'all' ? 'text-white/70' : 'text-[#81786d]'}`}>{directoryShops.length}</span>
                  </span>
                </button>
                {categories.map((item) => {
                  const selected = category === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCategory(selected ? 'all' : item)}
                      className={`motion-interactive flex min-h-[70px] min-w-[104px] shrink-0 flex-col items-start justify-between rounded-2xl border px-3 py-2.5 text-left transition sm:min-w-[126px] sm:px-4 ${selected ? 'border-[#065f46] bg-[#065f46] text-white shadow-[0_8px_18px_rgba(6,95,70,.2)]' : 'border-[#e9e1d7] bg-[#fffdf8] text-[#183f32] hover:border-[#9cbdab] hover:bg-[#f4faf6]'}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-lg ${selected ? 'bg-white/15' : ''}`} style={!selected ? { backgroundColor: categoryTileColors[item] || '#e9e4da' } : undefined} aria-hidden="true">{getCategoryDefaults(item).icon}</span>
                      <span className="flex w-full items-center justify-between gap-2 text-xs font-bold sm:text-sm">
                        {categoryLabel(item)}
                        <span className={`text-[10px] ${selected ? 'text-white/70' : 'text-[#81786d]'}`}>{categoryCounts.get(item) || 0}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-[#e9e1d7] pt-3 sm:mt-4 sm:pt-4">
              <label htmlFor="directory-sort" className="mr-1 text-[10px] font-black uppercase tracking-wide text-[#647067] sm:text-xs">Affiner</label>
              <select
                id="directory-sort"
                value={directorySort}
                onChange={(event) => setDirectorySort(event.target.value as DirectorySort)}
                className="min-h-10 min-w-[185px] flex-1 rounded-xl border border-[#e0d5c6] bg-[#fffdf8] px-3 text-sm font-semibold text-[#292d2a] outline-none transition focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/15 sm:flex-none"
              >
                <option value="recommended">Ordre recommandé</option>
                <option value="open">Ouvertes en premier</option>
                <option value="name">Nom : A à Z</option>
              </select>
              <button
                type="button"
                aria-pressed={openOnly}
                onClick={() => setOpenOnly((current) => !current)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition sm:text-sm ${openOnly ? 'border-[#065f46] bg-[#e2eee6] text-[#065f46]' : 'border-[#e0d5c6] bg-white text-[#47534b] hover:border-[#047857]'}`}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Ouvertes uniquement
              </button>
              {hasActiveDirectoryFilters && <button type="button" onClick={() => { setQuery(''); setCategory('all'); setOpenOnly(false); handleOpenDirectory(); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-[#065f46] transition hover:bg-[#e9f5ee] sm:text-sm">Effacer les filtres <X className="h-4 w-4" aria-hidden="true" /></button>}
            </div>
            {cityPages.length > 0 && (
              <nav className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-[#e9e1d7] pt-3 sm:mt-4 sm:pt-4" aria-label="Découvrir les boutiques par ville">
                <span className="mr-1 text-[10px] font-black uppercase tracking-wide text-[#647067]">Explorer une ville</span>
                {cityPages.map((page) => <Link key={page.path} to={page.path} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 text-xs font-bold text-[#315548] shadow-sm transition hover:border-[#9cbdab] hover:bg-white"><MapPin className="h-3.5 w-3.5 text-[#c2410c]" aria-hidden="true" />{page.city}</Link>)}
              </nav>
            )}
          </div>
        )}

        {directoryIsLoading ? (
          <div role="status" aria-label="Chargement des boutiques" className="relative z-10 grid grid-cols-2 gap-3 sm:gap-4 max-[360px]:grid-cols-1">
            {[0, 1, 2, 3].map((item) => <div key={item} className="overflow-hidden rounded-[20px] border border-[#e7ddd0] bg-white sm:rounded-[24px]" aria-hidden="true">
              <div className="aspect-[1.35] animate-pulse bg-[#e5ded3]" />
              <div className="space-y-3 p-3 sm:p-5">
                <div className="h-3 w-20 animate-pulse rounded bg-[#d8e7df]" />
                <div className="h-6 w-3/4 animate-pulse rounded bg-[#e9e4da]" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-[#eee9df]" />
              </div>
            </div>)}
          </div>
        ) : loadError ? (
          <div role="alert" className="relative z-10 rounded-2xl border border-[#e8b8a4] bg-[#fff8f4] p-8 text-center">
            <h3 className="font-display text-lg font-bold text-[#292d2a]">Impossible de charger les boutiques</h3>
            <p className="mt-2 text-sm text-[#647067]">Vérifiez votre connexion, puis réessayez.</p>
            <button type="button" onClick={onRetry} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#065f46] px-4 text-sm font-bold text-white hover:bg-[#047857]"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer</button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="relative z-10 rounded-2xl border border-dashed border-[#cfc8bc] bg-[#FFFFFF] p-8 text-center">
            <Store className="mx-auto h-10 w-10 text-[#047857]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold">{openOnly && !query.trim() && category === 'all' ? 'Aucune boutique ouverte en ce moment' : hasActiveDirectoryFilters ? 'Aucune boutique trouvée' : 'Aucune boutique disponible pour le moment'}</h3>
            <p className="mt-2 text-sm text-[#647067]">{openOnly && !query.trim() && category === 'all' ? 'Consultez les horaires affichés sur les boutiques ou retirez ce filtre.' : hasActiveDirectoryFilters ? 'Essayez un autre mot-clé ou effacez vos filtres.' : 'La vitrine s’actualisera dès qu’une boutique sera publiée.'}</p>
            {hasActiveDirectoryFilters && <button type="button" onClick={() => { setQuery(''); setCategory('all'); setOpenOnly(false); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#065f46] px-4 py-2 text-sm font-bold text-white">Effacer les filtres <X className="h-4 w-4" /></button>}
          </div>
        ) : (
          <div className={`relative z-10 grid items-stretch gap-3 sm:gap-4 lg:gap-5 max-[360px]:grid-cols-1 ${filteredShops.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {filteredShops.map((shop, index) => (
              <MotionReveal key={shop.slug} delay={Math.min(index, 7) * 0.045} className={filteredShops.length === 1 ? 'mx-auto w-full max-w-[760px]' : undefined}>
              <Link to={`/${encodeURIComponent(shop.slug)}`} onClick={(event) => { if (isLocalAdvertisingDemo) { event.preventDefault(); handleOpenShop(shop.slug); } }} className="motion-interactive group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#e3d9cc] bg-[#FFFFFF] transition hover:border-[#b7cfc3] hover:shadow-[0_16px_40px_rgba(36,28,22,.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] focus-visible:ring-offset-2 sm:rounded-[24px]">
                <div className="relative aspect-[1.35] shrink-0 overflow-hidden sm:aspect-[1.65]" style={{ backgroundColor: `${getShopColor(shop)}30` }}>
                  <img src={getShopImage(shop)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" onError={(event) => { event.currentTarget.hidden = true; }} />
                  <span className="absolute inset-0 bg-gradient-to-t from-[#17211f]/75 via-transparent to-[#17211f]/5" />
                  <span className="absolute bottom-3 left-3 rounded-full bg-[#FFFFFF]/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#065f46] sm:bottom-4 sm:left-4 sm:px-3 sm:py-1.5 sm:text-xs">{categoryLabel(shop.category)}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-5 lg:p-6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-[#c2410c] sm:text-xs sm:tracking-[0.13em]"><span className="sm:hidden">Adresse</span><span className="hidden sm:inline">Une adresse à découvrir</span></span>
                    <div className="flex shrink-0 items-center gap-1">
                    {shop.boost_placements?.some((placement) => placement === (discoveryPage?.citySlug ? 'city' : discoveryPage?.category || category !== 'all' ? 'category' : !isShopDirectoryPage ? 'home' : 'directory') || placement === 'directory') && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-950 sm:text-[10px]">Sponsorisé</span>}
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold sm:px-3 sm:py-1.5 sm:text-xs ${shop.is_open ? 'bg-[#e2eee6] text-[#065f46]' : 'bg-[#f3eee7] text-[#7a3e00]'}`}>
                      {shop.is_open ? <><CheckCircle2 className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />Ouverte</> : <><Clock3 className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden="true" />Fermée</>}
                    </span>
                    </div>
                  </div>
                  <div className="mt-2 flex min-w-0 items-center gap-2 sm:mt-4 sm:gap-3">
                    {shop.theme_config?.logo_url && <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e9e1d7] bg-white sm:h-12 sm:w-12 sm:rounded-2xl">
                      <img src={shop.theme_config.logo_url} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
                    </span>}
                    <h3 className="line-clamp-2 min-w-0 font-display text-base font-extrabold leading-tight tracking-tight text-[#292d2a] sm:text-xl lg:text-2xl">{shop.name}</h3>
                  </div>
                  {shop.city && <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#47534b] sm:mt-3 sm:gap-2 sm:text-sm"><MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" /><span className="truncate">{shop.city}</span></p>}
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#647067] sm:mt-3 sm:text-sm sm:leading-6">{shop.welcome_message || 'Une vitrine locale à découvrir et un commerçant à rencontrer.'}</p>
                  <div className="mt-auto flex flex-col items-start gap-2 border-t border-[#eee6dd] pt-3 sm:mt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:pt-4">
                    <span className="text-[10px] font-semibold leading-4 text-[#647067] sm:text-xs">
                      {shop.opening_hours?.enabled && shop.opening_hours.open_time && shop.opening_hours.close_time && `${shop.opening_hours.open_time}–${shop.opening_hours.close_time} · `}
                      {shop.products_count ? `${shop.products_count} article${shop.products_count === 1 ? '' : 's'} en vitrine` : 'Vitrine à découvrir'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#065f46] sm:gap-2 sm:text-sm">Découvrir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 sm:h-4 sm:w-4" aria-hidden="true" /></span>
                  </div>
                </div>
              </Link>
              </MotionReveal>
            ))}
          </div>
        )}
      </section>}

      {!discoveryPage && !isShopDirectoryPage && <section className="mx-auto w-full max-w-[1184px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col items-start justify-between gap-6 overflow-hidden rounded-[24px] bg-[#065f46] px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10 sm:py-10">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f0ba80]">Vous vendez en Côte d’Ivoire ?</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">Présentez votre commerce sur MaTable.ci.</h2>
            <p className="mt-2 text-sm leading-6 text-[#e0eae3]">Découvrez les outils, les étapes de création et les formules pour commerçants.</p>
          </div>
          <Link to="/commercants" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#FFFFFF] px-6 text-sm font-bold text-[#065f46] transition hover:bg-[#f6eadc]">Espace commerçant <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>}

      {activeDemoShop && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[#10231d]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={() => setActiveDemoShop(null)}>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-store-title"
          className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-[#FAF8F2] shadow-2xl sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative h-40 overflow-hidden bg-[#d1fae5] sm:h-56">
            <img src={getShopImage(activeDemoShop)} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#10231d]/75 to-transparent" />
            <button type="button" aria-label="Fermer l’aperçu de la boutique" onClick={() => setActiveDemoShop(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#183f32] shadow-lg transition hover:bg-[#fff0df]">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="absolute bottom-4 left-5 right-5 text-white sm:bottom-6 sm:left-7">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">{categoryLabel(activeDemoShop.category)} · {activeDemoShop.city}</p>
              <h2 id="demo-store-title" className="mt-1 font-display text-2xl font-black sm:text-3xl">{activeDemoShop.name}</h2>
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[#c2410c]">Vitrine de démonstration</p>
                <p className="mt-1 text-sm text-[#647067]">Ajoutez des articles pour essayer le panier local.</p>
              </div>
              <span className="rounded-full bg-[#e2eee6] px-3 py-1.5 text-xs font-bold text-[#065f46]">{activeDemoShop.is_open ? 'Ouverte' : 'Fermée'}</span>
            </div>
            <ul className="space-y-3">
              {(activeDemoShop.products_preview || []).map((product) => {
                const quantity = demoBasket[product.id] || 0;
                return <li key={product.id} className="flex items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-3">
                  <img src={product.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl bg-[#e9f5ee] object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-[#292d2a]">{product.title}</h3>
                    <p className="mt-1 text-sm font-extrabold text-[#065f46]">{formatFCFA(product.price)}</p>
                  </div>
                  <button type="button" onClick={() => setDemoBasket((current) => ({ ...current, [product.id]: (current[product.id] || 0) + 1 }))} className="min-h-10 shrink-0 rounded-full bg-[#065f46] px-3 text-xs font-bold text-white transition hover:bg-[#047857]">
                    {quantity ? `Ajouté (${quantity})` : 'Ajouter'}
                  </button>
                </li>;
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#e9f5ee] p-4">
              <div>
                <p className="text-xs font-bold text-[#315548]">Panier de démo · {Object.values(demoBasket).reduce((sum, quantity) => sum + quantity, 0)} article(s)</p>
                <p className="mt-1 text-lg font-black text-[#065f46]">{formatFCFA((activeDemoShop.products_preview || []).reduce((sum, product) => sum + product.price * (demoBasket[product.id] || 0), 0))}</p>
              </div>
              <span className="text-right text-[11px] leading-4 text-[#647067]">Aucune commande ni paiement<br />ne sera envoyé.</span>
            </div>
          </div>
        </section>
      </div>}
    </main>
  );
};
