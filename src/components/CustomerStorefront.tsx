import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShoppingBag, 
  Bookmark,
  Heart,
  Phone, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Plus, 
  Minus, 
  ArrowLeft,
  ArrowRight, 
  Info,
  Clock,
  ChevronDown,
  ChevronUp,
  Tag,
  Search,
  ShieldCheck
} from 'lucide-react';
import { Shop, Product } from '../types';
import { formatFCFA, generateWhatsAppOrderReceipt, getProductUnitPrice } from '../utils/format';
import { getContrastTextColor, normalizeHex } from '../utils/color';
import { getDefaultSelectedModifiers } from '../utils/cart';
import { getBannerImageForDisplay, getCategoryDefaults, getProductImageForDisplay, getWelcomeMessageForDisplay } from '../utils/categoryDefaults';
import { CategoryProductImage } from './CategoryProductImage';
import { CustomerProductCard } from './CustomerProductCard';
import { useToast } from './Toast';
import { hasAnalyticsConsent } from './CookieBanner';
import { CustomerUser } from './CustomerAuth';
import { CustomerCheckoutAuth } from './CustomerCheckoutAuth';
import { CustomerTrustPanel } from './CustomerTrustPanel';
import { getCanonicalOrigin } from '../utils/seoCanonical';
import { useCustomerCart } from './useCustomerCart';
import { isAgeRestrictedProduct, isAtLeastAge } from '../utils/ageRestrictedProducts';

interface CustomerStorefrontProps {
  shopSlug: string;
  onSelectShop?: (slug: string) => void;
  customerUser?: CustomerUser | null;
  onCustomerAuthenticated?: (user: CustomerUser) => void;
}

function getAnalyticsReferrerHost(): string {
  try {
    return document.referrer ? new URL(document.referrer).hostname : '';
  } catch {
    return '';
  }
}

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({ shopSlug, customerUser, onCustomerAuthenticated }) => {
  const toast = useToast();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [hasAgeRestrictedProducts, setHasAgeRestrictedProducts] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageBirthDate, setAgeBirthDate] = useState('');
  const [ageVerificationError, setAgeVerificationError] = useState('');
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  const [likedProductIds, setLikedProductIds] = useState<Set<number>>(new Set());
  const [isFavoriteShop, setIsFavoriteShop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Category Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Truncation toggle map for product descriptions
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  // Product interactive selection state (Fashion sizes/colors, Food modifiers)
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [selectedColors, setSelectedColors] = useState<Record<number, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, string[]>>({});
  const {
    cart,
    cartShopSlug,
    requiresShopSwitch,
    setCart,
    isCartOpen,
    setIsCartOpen,
    pendingShopSwitchProduct,
    setPendingShopSwitchProduct,
    addToCart,
    updateQuantity,
    getProductQuantityInCart,
    totalCartCount,
    totalCartAmount,
  } = useCustomerCart(shopSlug, selectedSizes, selectedColors, selectedModifiers);

  // Checkout form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('Cocody Angré');
  const [customLocation, setCustomLocation] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('Dès que prêt (30-45 min)');
  const [paymentMethod, setPaymentMethod] = useState<'wave' | 'mobile_money' | 'cash' | 'to_confirm'>('to_confirm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCheckoutAuth, setShowCheckoutAuth] = useState(false);
  const [trustTarget, setTrustTarget] = useState<{ type: 'shop' | 'product'; id: number; name: string } | null>(null);
  const [checkoutAuthUser, setCheckoutAuthUser] = useState<CustomerUser | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: number; whatsappUrl: string; whatsappText: string; whatsappTrackingToken: string } | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);
  const [formStartedAt] = useState(() => Date.now());
  const [website, setWebsite] = useState('');

  // Ces deux useMemo doivent être déclarés avant les "return" conditionnels
  // ci-dessous (loading / error / boutique inactive), sinon React appelle un
  // nombre de hooks différent selon l'état, ce qui casse le rendu (page blanche).
  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!ageVerified && isAgeRestrictedProduct(p)) return false;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        `${p.title} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory, ageVerified]);

  const fetchShopData = async (signal: AbortSignal, ageConfirmed = false): Promise<boolean> => {
    try {
      if (!ageConfirmed) {
        setLoading(true);
        setError(null);
      }
      if (!ageConfirmed) {
        setShop(null);
        setProducts([]);
      }
      const ageQuery = ageConfirmed ? '?age_confirmed=1' : '';
      const res = await fetch(`/api/v1/catalog/storefronts/${encodeURIComponent(shopSlug)}${ageQuery}`, { signal });
      if (!res.ok) {
        throw new Error('Boutique introuvable');
      }
      const data = await res.json();
      if (signal.aborted) return false;
      setShop(data.shop);
      setProducts(data.products || []);
      setHasAgeRestrictedProducts(Boolean(data.has_age_restricted_products));

      // Initialize default selections for products
      const initSizes: Record<number, string> = {};
      const initColors: Record<number, string> = {};
      const initModifiers: Record<number, string[]> = {};

      (data.products || []).forEach((p: Product) => {
        if (p.sizes && p.sizes.length > 0) {
          initSizes[p.id] = p.sizes[0];
        }
        if (p.colors && p.colors.length > 0) {
          const firstCol = p.colors[0];
          initColors[p.id] = typeof firstCol === 'string' ? firstCol : firstCol.name;
        }
        const requiredModifierSelections = getDefaultSelectedModifiers(p.modifier_groups || []);
        if (requiredModifierSelections.length > 0) initModifiers[p.id] = requiredModifierSelections;
      });

      setSelectedSizes(initSizes);
      setSelectedColors(initColors);
      setSelectedModifiers(initModifiers);
      return true;
    } catch (err: any) {
      if (signal.aborted) return false;
      if (ageConfirmed) setAgeVerificationError('Impossible de charger les produits. Réessayez.');
      else setError(err.message || 'Erreur lors du chargement');
      return false;
    } finally {
      if (!signal.aborted && !ageConfirmed) setLoading(false);
    }
  };

  const handleAgeVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAtLeastAge(ageBirthDate, 18)) {
      setAgeVerificationError('Vous devez avoir au moins 18 ans pour accéder à ces produits.');
      return;
    }

    setAgeVerificationError('');
    const loaded = await fetchShopData(new AbortController().signal, true);
    if (loaded) {
      setAgeVerified(true);
      setAgeBirthDate('');
    } else {
      setAgeVerificationError('Impossible de charger les produits. Réessayez.');
    }
  };

  useEffect(() => {
    if (ageVerified || !cart.some((item) => isAgeRestrictedProduct(item.product))) return;
    setCart((items) => items.filter((item) => !isAgeRestrictedProduct(item.product)));
  }, [ageVerified, cart, setCart]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchShopData(controller.signal);
    setOrderSuccess(null);
    return () => controller.abort();
  }, [shopSlug]);

  useEffect(() => {
    if (!customerUser) return;
    setCustomerName(customerUser.name);
    setCustomerPhone(customerUser.phone);
  }, [customerUser]);

  useEffect(() => {
    if (!customerUser) {
      setFavoriteProductIds(new Set());
      setLikedProductIds(new Set());
      setIsFavoriteShop(false);
      return;
    }
    let active = true;
    fetch('/api/customer-engagement/state', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger vos favoris.');
        if (!active) return;
        setFavoriteProductIds(new Set(data.favorite_product_ids || []));
        setLikedProductIds(new Set(data.liked_product_ids || []));
        setIsFavoriteShop((data.favorite_shop_ids || []).includes(shop?.id));
      })
      .catch((engagementError: unknown) => {
        if (active) {
          console.error('Unable to load customer favorites and likes.', engagementError);
          toast.error(engagementError instanceof Error ? engagementError.message : 'Impossible de charger vos favoris.');
        }
      });
    return () => { active = false; };
  }, [customerUser?.id, shop?.id]);

  const toggleCustomerFavorite = async (targetType: 'shop' | 'product', targetId: number) => {
    if (!customerUser) {
      toast.info('Connectez-vous pour enregistrer vos favoris.');
      window.location.assign('/connexion');
      return;
    }
    try {
      const response = await fetch('/api/customer-engagement/favorites', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour vos favoris.');
      if (targetType === 'shop') setIsFavoriteShop(Boolean(data.is_favorite));
      else setFavoriteProductIds((previous) => {
        const next = new Set(previous);
        if (data.is_favorite) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
      toast.success(data.is_favorite ? 'Ajouté à vos favoris.' : 'Retiré de vos favoris.');
    } catch (engagementError) {
      toast.error(engagementError instanceof Error ? engagementError.message : 'Impossible de mettre à jour vos favoris.');
    }
  };

  const toggleProductLike = async (productId: number) => {
    if (!customerUser) {
      toast.info('Connectez-vous pour aimer un produit.');
      window.location.assign('/connexion');
      return;
    }
    try {
      const response = await fetch(`/api/customer-engagement/products/${productId}/like`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour votre mention J’aime.');
      setLikedProductIds((previous) => {
        const next = new Set(previous);
        if (data.is_liked) next.add(productId);
        else next.delete(productId);
        return next;
      });
      setProducts((previous) => previous.map((product) => product.id === productId ? { ...product, like_count: data.like_count } : product));
    } catch (engagementError) {
      toast.error(engagementError instanceof Error ? engagementError.message : 'Impossible de mettre à jour votre mention J’aime.');
    }
  };

  useEffect(() => {
    if (!shop?.id || !hasAnalyticsConsent()) return;
    const storageKey = `matable_page_view_${shop.id}`;
    if (sessionStorage.getItem(storageKey)) return;
    const sessionId = sessionStorage.getItem('matable_analytics_session') || crypto.randomUUID();
    sessionStorage.setItem('matable_analytics_session', sessionId);
    sessionStorage.setItem(storageKey, '1');
    let referrerHost = '';
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : '';
    } catch {
      referrerHost = '';
    }
    fetch('/api/analytics/page-view', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: shop.id, session_id: sessionId, path: window.location.pathname, referrer_host: referrerHost }),
    }).catch(() => undefined);
  }, [shop?.id]);

  useEffect(() => {
    if (!shop?.id || !hasAnalyticsConsent() || typeof IntersectionObserver === 'undefined') return;
    const sessionId = sessionStorage.getItem('matable_analytics_session') || crypto.randomUUID();
    sessionStorage.setItem('matable_analytics_session', sessionId);
    const reportView = (productId: number) => {
      if (!hasAnalyticsConsent()) return;
      const viewKey = `matable_product_view_${shop.id}_${productId}`;
      if (sessionStorage.getItem(viewKey)) return;
      sessionStorage.setItem(viewKey, '1');
      fetch('/api/analytics/product-event', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id,
          product_id: productId,
          event_type: 'product_view',
          session_id: sessionId,
          referrer_host: getAnalyticsReferrerHost(),
        }),
      }).catch((error: unknown) => console.error('Unable to record product view analytics.', error));
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const productId = Number((entry.target as HTMLElement).dataset.analyticsProductId);
        if (Number.isInteger(productId)) reportView(productId);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    document.querySelectorAll<HTMLElement>('[data-analytics-product-id]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [filteredProducts, shop?.id]);

  const reportProductClick = (productId: number) => {
    if (!shop?.id || !hasAnalyticsConsent()) return;
    const sessionId = sessionStorage.getItem('matable_analytics_session') || crypto.randomUUID();
    sessionStorage.setItem('matable_analytics_session', sessionId);
    fetch('/api/analytics/product-event', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop_id: shop.id,
        product_id: productId,
        event_type: 'product_click',
        session_id: sessionId,
        referrer_host: getAnalyticsReferrerHost(),
      }),
    }).catch((error: unknown) => console.error('Unable to record product click analytics.', error));
  };

  useEffect(() => {
    if (!shop) return;

    const origin = getCanonicalOrigin(window.location.origin);
    const canonicalUrl = `${origin}/${shop.slug}`;
    const description = getWelcomeMessageForDisplay(shop.welcome_message, shop.category).slice(0, 160);
    const image = getBannerImageForDisplay(shop.theme_config?.custom_banner_url, shop.category);
    const upsertMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        element.dataset.matableSeo = 'true';
        document.head.appendChild(element);
      }
      element.content = content;
    };

    document.title = `${shop.name} — Boutique locale en Côte d’Ivoire | MaTable.ci`;
    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="robots"]', 'name', 'robots', 'index, follow, max-image-preview:large');
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', document.title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
    upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', shop.name);
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', document.title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      canonical.dataset.matableSeo = 'true';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let structuredData = document.head.querySelector<HTMLScriptElement>('script[data-matable-seo="structured-data"]');
    if (!structuredData) {
      structuredData = document.createElement('script');
      structuredData.type = 'application/ld+json';
      structuredData.dataset.matableSeo = 'structured-data';
      document.head.appendChild(structuredData);
    }
    structuredData.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: shop.name,
      description,
      url: canonicalUrl,
      image,
      telephone: shop.whatsapp_number,
      address: { '@type': 'PostalAddress', addressLocality: shop.city || 'Abidjan', addressCountry: 'CI' },
      areaServed: 'Côte d’Ivoire',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Catalogue ${shop.name}`,
        itemListElement: products.filter(product => product.is_available && product.stock > 0).slice(0, 30).map(product => ({
          '@type': 'Offer',
          priceCurrency: 'XOF',
          price: product.price,
          availability: 'https://schema.org/InStock',
          itemOffered: { '@type': 'Product', name: product.title, description: product.description || undefined, image: getProductImageForDisplay(product.image_url, shop.category) },
        })),
      },
    });

    return () => {
      document.title = 'Produits locaux à découvrir en Côte d’Ivoire | MaTable.ci';
      const defaultDescription = 'Découvrez les produits des commerces locaux en Côte d’Ivoire, explorez les boutiques par ville et commandez directement sur WhatsApp avec MaTable.ci.';
      const descriptionMeta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (descriptionMeta) descriptionMeta.content = defaultDescription;
      const defaultCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (defaultCanonical) defaultCanonical.href = `${origin}/`;
      document.head.querySelectorAll('[data-matable-seo="structured-data"]').forEach(element => element.remove());
    };
  }, [shop, products]);

  const toggleDescription = (id: number) => {
    setExpandedDescriptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const authenticatedCustomer = customerUser || checkoutAuthUser;

  const normalizeCustomerPhoneValue = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('225')) return `+${digits}`;
    if (digits.startsWith('0')) return `+225${digits}`;
    return `+225${digits}`;
  };

  // Handle WhatsApp Checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || cart.length === 0) return;
    if (!ageVerified && cart.some((item) => isAgeRestrictedProduct(item.product))) {
      toast.error('Confirmez votre majorité avant de commander ces produits.');
      return;
    }

    const trimmedName = customerName.trim();
    const normalizedPhone = normalizeCustomerPhoneValue(customerPhone);
    const digitsOnlyPhone = normalizedPhone.replace(/\D/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      toast.error('Veuillez renseigner un nom complet pour la commande.');
      return;
    }
    if (!normalizedPhone || digitsOnlyPhone.length < 10) {
      toast.error('Veuillez renseigner un numéro de téléphone WhatsApp valide.');
      return;
    }
    const finalLocation = deliveryLocation === 'Autre' 
      ? (customLocation.trim() || 'Abidjan') 
      : deliveryLocation;

    setIsSubmitting(true);

    try {
      // 1. Décrémentation automatique du stock en base de données
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id,
          customer_name: trimmedName,
          customer_phone: normalizedPhone,
          delivery_location: finalLocation,
          delivery_note: deliveryNote,
          delivery_slot: shop.category === 'food' ? deliverySlot : undefined,
          payment_method_preference: paymentMethod,
          age_confirmed: ageVerified,
          items: cart.map(item => ({
            product_id: item.product.id,
            quantity: item.quantity,
            unit_price: getProductUnitPrice(item.product, item.selected_modifiers),
            selected_size: item.selected_size,
            selected_color: item.selected_color,
            selected_modifiers: item.selected_modifiers,
          })),
          website,
          form_started_at: formStartedAt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur de validation de commande');
      }
      if (Number(data.order?.shop_id) !== shop.id) {
        throw new Error('La commande ne correspond pas à cette boutique. Veuillez réessayer.');
      }

      // 2. Prepare WhatsApp from the exact server-confirmed order.
      const { text, url } = generateWhatsAppOrderReceipt(
        shop,
        data.order,
      );

      setOrderSuccess({
        orderId: data.order.id,
        whatsappUrl: url,
        whatsappText: text,
        whatsappTrackingToken: String(data.whatsapp_tracking_token || ''),
      });
      setMessageCopied(false);
      toast.success('Commande acceptée automatiquement. Vous pouvez contacter le commerçant sur WhatsApp.');

      // Update only local stock so the confirmation screen stays mounted.
      const confirmedQuantities = new Map<number, number>();
      for (const item of data.order.items || []) {
        confirmedQuantities.set(item.product_id, (confirmedQuantities.get(item.product_id) || 0) + Number(item.quantity));
      }
      setProducts(prevProducts => prevProducts.map(product => {
        const orderedQuantity = confirmedQuantities.get(product.id);
        if (!orderedQuantity) return product;
        const remainingStock = Math.max(0, product.stock - orderedQuantity);
        return {
          ...product,
          stock: remainingStock,
          is_available: remainingStock > 0 && product.is_available,
        };
      }));
      setIsCartOpen(true);

      // Le client choisit lui-même quand ouvrir WhatsApp via le bouton visible.
    } catch (err: any) {
      toast.error(err.message || 'Impossible de finaliser la commande.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading-wrap">
        <div className="page-loading-shell">
          <div className="page-loading-orb page-loading-orb-1" />
          <div className="page-loading-orb page-loading-orb-2" />
          <div className="brand-mark brand-mark-hero">M</div>
          <div className="page-loading-copy">
            <span className="eyebrow">MaTable.ci</span>
            <h2>Chargement de la vitrine…</h2>
            <div className="loading-progress">
              <div className="loading-progress-bar" />
            </div>
            <div className="loading-dots">
              <span />
              <span />
              <span />
            </div>
            <p>Conçu pour des connexions rapides et stables sur mobile.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="not-found-page">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#176b55]">Erreur 404</p>
        <h2 className="text-2xl font-black text-slate-900">Cette page n’existe pas</h2>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          La boutique ou l’adresse demandée n’existe pas ou a été déplacée.
        </p>
        <a href="/" className="inline-flex items-center justify-center rounded-xl bg-[#176b55] px-5 py-3 font-bold text-white">Retour aux boutiques</a>
      </div>
    );
  }

  // If shop subscription is OFF
  if (!shop.is_active) {
    return (
      <div className="max-w-lg mx-auto my-16 p-8 bg-white rounded-3xl border border-rose-100 shadow-xl text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">{shop.name}</h2>
        <div className="inline-block bg-rose-50 text-rose-700 font-semibold px-4 py-1.5 rounded-full text-sm mb-4">
          Boutique temporairement indisponible
        </div>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">
          Cette boutique est temporairement indisponible. Le commerçant peut la réactiver depuis son espace de gestion lorsque la vitrine est de nouveau ouverte.
        </p>
      </div>
    );
  }

  // Dynamic Theme Variables
  const primaryColor = normalizeHex(shop.theme_config?.primary_color || shop.theme_color || '#0F172A');
  const secondaryColor = normalizeHex(shop.theme_config?.secondary_color || '#F8FAFC');
  const fontFamily = shop.theme_config?.font_family || 'Plus Jakarta Sans';
  const categoryDefaults = getCategoryDefaults(shop.category);
  const layoutStyle = shop.theme_config?.layout_style || categoryDefaults.layoutStyle;
  const bannerUrl = getBannerImageForDisplay(shop.theme_config?.custom_banner_url, shop.category);
  const logoUrl = shop.theme_config?.logo_url;
  const isEventMode = shop.theme_config?.event_mode_enabled;
  const eventBannerText = shop.theme_config?.event_banner_text;
  const primaryTextColor = getContrastTextColor(primaryColor);
  const secondaryTextColor = getContrastTextColor(secondaryColor);

  // Advanced CSS classes
  const cardRadius = shop.theme_config?.advanced_css?.borderRadius || 'rounded-2xl';
  const shadowClass = 
    shop.theme_config?.advanced_css?.shadowIntensity === 'none' ? 'shadow-none' :
    shop.theme_config?.advanced_css?.shadowIntensity === 'strong' ? 'shadow-lg' :
    shop.theme_config?.advanced_css?.shadowIntensity === 'soft' ? 'shadow-md' : 'shadow-2xs';
  const glowStyle = shop.theme_config?.advanced_css?.accentGlow ? { boxShadow: `0 0 20px ${primaryColor}40` } : {};

  const hoursSummary = shop.opening_hours?.enabled
    ? `${shop.opening_hours.open_time || '08:00'}–${shop.opening_hours.close_time || '22:00'} · ${shop.opening_hours.days && shop.opening_hours.days.length > 0 && shop.opening_hours.days.length < 7 ? `${shop.opening_hours.days.length} jours / semaine` : '7 jours / semaine'}`
    : 'Horaires flexibles selon le commerçant';

  return (
    <div 
      className={`storefront-page min-h-screen transition-colors ${totalCartCount > 0 && !isCartOpen ? 'pb-28 sm:pb-32' : 'pb-8'}`}
      style={{ 
        background: 'linear-gradient(180deg, #faf8f3 0%, #f1eee7 100%)',
        fontFamily: `"${fontFamily}", system-ui, sans-serif`
      }}
    >
      {/* 1. Header & Shop Identity */}
      <header className="bg-[#fffdf9]/95 backdrop-blur-md border-b border-[#ded8ce] sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <a href="/" aria-label="Retour à l’annuaire" title="Retour à l’annuaire" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 sm:h-10 sm:w-10"><ArrowLeft className="h-4 w-4" /></a>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop.name}
                className="h-10 w-10 rounded-xl object-cover shrink-0 border border-slate-200 bg-white sm:h-11 sm:w-11"
              />
            ) : (
              <div 
                className="h-10 w-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0 sm:h-11 sm:w-11"
                style={{ backgroundColor: primaryColor, color: primaryTextColor }}
              >
                <span aria-hidden="true">{categoryDefaults.icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <h1 className="max-w-full truncate text-sm font-black text-[#211712] sm:text-lg">{shop.name}</h1>
                <span className={`shrink-0 text-[11px] font-semibold sm:text-xs ${shop.is_open ? 'text-[#176b55]' : 'text-[#8a5a12]'}`}>
                  {shop.is_open ? 'Ouverte' : 'Fermée'}
                </span>
              </div>
              <div className="hidden min-w-0 items-center gap-2 truncate text-[11px] text-slate-500 sm:flex">
                <span>matable.ci/{shop.slug}</span>
                {shop.city ? <span className="text-slate-300">•</span> : null}
                {shop.city ? <span className="truncate">{shop.city}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCustomerFavorite('shop', shop.id)}
              aria-pressed={isFavoriteShop}
              aria-label={isFavoriteShop ? 'Retirer cette boutique de vos favoris' : 'Ajouter cette boutique à vos favoris'}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${isFavoriteShop ? 'border-[#c8dbd0] bg-[#e4f1ec] text-[#0f4d3d]' : 'border-[#ded8ce] bg-white text-[#4a3a30] hover:border-[#176b55]'}`}
            >
              <Bookmark className={`h-4 w-4 ${isFavoriteShop ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline">{isFavoriteShop ? 'Enregistrée' : 'Enregistrer'}</span>
            </button>
            <button
              id="cart-header-btn"
              onClick={() => totalCartCount > 0 ? setIsCartOpen(true) : document.getElementById('store-catalogue')?.scrollIntoView({ behavior: 'smooth' })}
              className="relative inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f4d3d] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#176b55]"
              aria-label={totalCartCount > 0 ? 'Voir le panier' : 'Découvrir le catalogue'}
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">{totalCartCount > 0 ? 'Mon panier' : 'Catalogue'}</span>
              {totalCartCount > 0 && (
                <span 
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-black"
                  style={{ backgroundColor: primaryColor, color: primaryTextColor }}
                >
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {pendingShopSwitchProduct && requiresShopSwitch && (
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingShopSwitchProduct(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="shop-switch-title" className="w-full max-w-md rounded-2xl border-2 border-[#211712] bg-[#fffaf2] p-5 shadow-2xl">
              <h2 id="shop-switch-title" className="text-lg font-black text-[#211712]">Votre panier appartient à une autre boutique</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a3a30]">Pour commander chez {shop?.name}, il faut remplacer le panier de « {cartShopSlug} ». Votre commande restera liée à une seule boutique.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPendingShopSwitchProduct(null)} className="min-h-11 rounded-xl border-2 border-[#ded8ce] bg-white px-4 text-sm font-bold text-[#211712]">Garder ce panier</button>
                <button type="button" onClick={() => { const product = pendingShopSwitchProduct; setPendingShopSwitchProduct(null); addToCart(product, true); }} className="min-h-11 rounded-xl border-2 border-[#211712] bg-[#1d6b57] px-4 text-sm font-bold text-white">Vider et continuer</button>
              </div>
            </section>
          </div>,
          document.body,
        )
      )}

      {bannerUrl && (
        <div className="max-w-6xl mx-auto px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="group relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-slate-900 shadow-[0_18px_45px_rgba(33,23,18,0.12)]">
            <div aria-hidden="true" className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: secondaryColor, color: primaryColor }}>
              <span className="text-7xl">{categoryDefaults.icon}</span>
              <span className="text-xs font-black uppercase">{categoryDefaults.label}</span>
            </div>
            <img
              src={bannerUrl}
              alt={`Illustration de la boutique ${shop.name}`}
              className="relative z-10 h-44 w-full object-cover transition-transform duration-700 group-hover:scale-[1.02] sm:h-60 lg:h-64"
              onError={(event) => {
                const element = event.currentTarget;
                if (element.dataset.placeholderAttempted !== 'true' && element.src !== categoryDefaults.bannerPlaceholderImageUrl) {
                  element.dataset.placeholderAttempted = 'true';
                  element.src = categoryDefaults.bannerPlaceholderImageUrl;
                } else {
                  element.hidden = true;
                }
              }}
            />
            <div className="absolute inset-0 z-20 bg-gradient-to-r from-slate-950/65 via-slate-950/20 to-transparent sm:bg-gradient-to-t sm:from-slate-950/75 sm:via-slate-950/10" />
            <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
              <div className="max-w-2xl text-white drop-shadow-sm">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {categoryDefaults.label} <span className="text-white/45">/</span> {shop.city || 'Côte d’Ivoire'}
                </p>
                <p className="mt-2 line-clamp-2 max-w-xl text-sm font-medium leading-6 text-white sm:text-base">{getWelcomeMessageForDisplay(shop.welcome_message, shop.category)}</p>
              </div>
              <a href="#store-catalogue" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/70 bg-[#fffdf9] px-4 py-2 text-xs font-extrabold text-[#0f4d3d] transition hover:-translate-y-0.5 hover:bg-white sm:min-h-11 sm:text-sm">Découvrir la sélection<ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </div>
      )}

      {isEventMode && eventBannerText && (
        <div className="max-w-6xl mx-auto px-3 pt-3 sm:px-4">
          <div className="flex justify-center sm:justify-start">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#e7d5bd] bg-[#fffaf1] px-4 py-2 text-center text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#70451f] shadow-[0_4px_14px_rgba(33,23,18,0.05)] sm:text-xs">
              <span className="shrink-0 text-sm" aria-hidden="true">✦</span>
              <span>{eventBannerText}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main storefront content */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        {/* Closed warning */}
        {!shop.is_open && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Boutique actuellement fermée aux commandes</p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                {shop.opening_hours?.enabled 
                  ? `Plage horaire de prise de commande : ${shop.opening_hours.open_time} à ${shop.opening_hours.close_time}. Les commandes reprendront automatiquement dès l'ouverture.` 
                  : 'Le commerçant a momentanément désactivé la prise de commande. Vous pouvez parcourir le catalogue en attendant la réouverture.'}
              </p>
            </div>
          </div>
        )}

        {/* Catalog Section Header */}
        <div id="store-catalogue" className="scroll-mt-24 mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#ded8ce] pb-4">
          <div className="relative pl-4">
            <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-[#b9441f]" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#8c5a36]">{categoryDefaults.label} <span className="px-1 text-[#c5b6a3]">/</span> La sélection</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#211712] sm:text-3xl">À découvrir</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#eee9df] px-3 py-1.5 text-[11px] font-bold text-[#6f6a61]">{products.length} pièce{products.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setTrustTarget({ type: 'shop', id: shop.id, name: shop.name })} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#c8dbd0] bg-white px-3 text-[11px] font-bold text-[#0f4d3d] transition hover:bg-[#e4f1ec]">
              <span aria-hidden="true">★</span>Avis boutique
            </button>
          </div>
        </div>

        {/* Search Bar & Category Filter */}
        {(products.length > 4 || categories.length > 1) && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {products.length > 4 && <div className="relative w-full sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Rechercher dans le catalogue de ${shop.name}`}
              placeholder="Rechercher dans le catalogue..."
              className="w-full rounded-full border border-[#ded8ce] bg-[#fffdf9] py-2.5 pl-10 pr-9 text-xs font-medium shadow-[0_4px_14px_rgba(33,23,18,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#176b55]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-100"
              >
                ✕
              </button>
            )}
          </div>}

          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-[#0f4d3d] text-white'
                    : 'bg-white text-slate-600 hover:bg-[#e4f1ec] hover:text-[#0f4d3d]'
                }`}
              >
                Tous les articles ({products.length})
              </button>
              {categories.map((cat) => {
                const count = products.filter(p => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                      ? 'bg-[#0f4d3d] text-white'
                      : 'bg-white text-slate-600 hover:bg-[#e4f1ec] hover:text-[#0f4d3d]'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* 3. DYNAMIC PRODUCT GRID
            Applies:
            - Fashion: 3:4 portrait grid with size/color options
            - Food: 1:1 or 16:9 landscape cards with prep_time & modifiers
        */}
        {hasAgeRestrictedProducts && !ageVerified && (
          <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5" aria-labelledby="age-restricted-title">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-900">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="age-restricted-title" className="text-base font-black text-amber-950">Certains produits sont réservés aux adultes (18+)</h2>
                <p className="mt-1 text-sm leading-6 text-amber-900">Confirmez votre majorité pour les afficher. Votre date de naissance n’est ni enregistrée ni transmise à MaTable.ci.</p>
                <form onSubmit={handleAgeVerification} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="block flex-1 text-xs font-bold text-amber-950">
                    Date de naissance
                    <input
                      type="date"
                      value={ageBirthDate}
                      onChange={(event) => setAgeBirthDate(event.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      required
                      autoComplete="bday"
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/15"
                    />
                  </label>
                  <button type="submit" className="min-h-11 rounded-xl bg-amber-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-950">
                    Confirmer mon âge
                  </button>
                </form>
                {ageVerificationError && <p role="alert" className="mt-2 text-sm font-bold text-rose-800">{ageVerificationError}</p>}
                <p className="mt-2 text-[11px] leading-5 text-amber-800">Cette confirmation repose sur votre déclaration et ne constitue pas une vérification d’identité.</p>
              </div>
            </div>
          </section>
        )}
        {products.length === 0 && !hasAgeRestrictedProducts ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center sm:py-14">
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-black text-slate-900">La sélection arrive bientôt</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Cette boutique prépare son catalogue. Vous pouvez contacter le commerçant pour connaître les articles disponibles.</p>
            <a href={`https://wa.me/${shop.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour, je souhaite connaître les articles disponibles chez ${shop.name}.`)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: primaryColor }}><Phone className="h-4 w-4" />Demander le catalogue</a>
          </div>
        ) : filteredProducts.length === 0 ? (
          hasAgeRestrictedProducts && !ageVerified ? null : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-800 font-bold text-sm">Aucun article ne correspond à votre recherche.</p>
            <p className="text-slate-500 text-xs mt-1">Modifiez vos mots-clés ou sélectionnez une autre catégorie.</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
              className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Afficher tout le catalogue
            </button>
          </div>
          )
        ) : (
          <div className={products.length === 1
            ? 'mx-auto grid w-full max-w-md grid-cols-1 gap-3 sm:gap-4'
            : 'grid grid-cols-1 min-[560px]:grid-cols-2 gap-3 sm:gap-4'
          }>
            {filteredProducts.map((product) => {
              const activeModifiers = selectedModifiers[product.id] || [];
              const cartIndex = cart.findIndex((item) => item.product.id === product.id);
              return (
                <div key={product.id} data-analytics-product-id={product.id}>
                  <CustomerProductCard
                    product={product}
                    category={shop.category}
                    categoryDefaults={categoryDefaults}
                    isShopOpen={shop.is_open}
                    layoutStyle={layoutStyle}
                    cardRadius={cardRadius}
                    shadowClass={shadowClass}
                    primaryColor={primaryColor}
                    primaryTextColor={primaryTextColor}
                    glowStyle={glowStyle}
                    quantityInCart={getProductQuantityInCart(product.id)}
                    isDescriptionExpanded={Boolean(expandedDescriptions[product.id])}
                    activeSize={selectedSizes[product.id]}
                    activeColor={selectedColors[product.id]}
                    activeModifiers={activeModifiers}
                    selectedUnitPrice={getProductUnitPrice(product, activeModifiers)}
                    isFavorite={favoriteProductIds.has(product.id)}
                    isLiked={likedProductIds.has(product.id)}
                    onToggleFavorite={() => toggleCustomerFavorite('product', product.id)}
                    onToggleLike={() => toggleProductLike(product.id)}
                    onOpenTrust={() => setTrustTarget({ type: 'product', id: product.id, name: product.title })}
                    onToggleDescription={() => toggleDescription(product.id)}
                    onSelectSize={(size) => setSelectedSizes((previous) => ({ ...previous, [product.id]: size }))}
                    onSelectColor={(color) => setSelectedColors((previous) => ({ ...previous, [product.id]: color }))}
                    onToggleModifier={(groupName, optionLabel, maxSelections) => {
                      const group = product.modifier_groups?.find((candidate) => candidate.name === groupName);
                      if (!group) return;
                      setSelectedModifiers((previous) => {
                        const current = previous[product.id] || [];
                        const currentForGroup = current.filter((value) => group.options.some((option) => (typeof option === 'string' ? option : option.label) === value));
                        const isSelected = current.includes(optionLabel);
                        if (!isSelected && currentForGroup.length >= maxSelections) return previous;
                        return { ...previous, [product.id]: isSelected ? current.filter((value) => value !== optionLabel) : [...current, optionLabel] };
                      });
                    }}
                    onAddToCart={() => { reportProductClick(product.id); addToCart(product); }}
                    onDecreaseQuantity={() => { if (cartIndex > -1) updateQuantity(cartIndex, -1); }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <details className="mt-8 rounded-xl border border-[#ded8ce] bg-[#fffdf9] px-4 py-3 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase text-slate-500">Informations pratiques</p><h3 className="mt-1 text-sm font-black text-slate-900">Horaires, livraison & contact</h3></div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#52645c]"><MapPin className="h-3.5 w-3.5" />{shop.city || 'Abidjan'}</span>
          </summary>
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><Clock className="h-3.5 w-3.5 text-[#1D6B57]" />Horaires</span><span className="text-right text-[11px] font-black text-slate-800">{hoursSummary}</span></div>
          {shop.theme_config?.social_links && Object.values(shop.theme_config.social_links).some(Boolean) &&           <div className="mt-3 flex gap-5 overflow-x-auto border-b border-[#e5d9ca]">{shop.theme_config.social_links.instagram && <a href={shop.theme_config.social_links.instagram} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Instagram</a>}{shop.theme_config.social_links.facebook && <a href={shop.theme_config.social_links.facebook} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Facebook</a>}{shop.theme_config.social_links.website && <a href={shop.theme_config.social_links.website} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Site web</a>}{shop.theme_config.social_links.whatsapp && <a href={shop.theme_config.social_links.whatsapp} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">WhatsApp</a>}</div>}
          {shop.theme_config?.delivery_zones && shop.theme_config.delivery_zones.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{shop.theme_config.delivery_zones.map((zone, index) => <div key={`${zone.label}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{zone.label}</span><span className="text-[10px] font-bold uppercase text-slate-500">{zone.mode}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600"><span>{zone.description || 'Service disponible'}</span><span className="font-black text-[#1D6B57]">{zone.fee ? `${zone.fee.toLocaleString('fr-FR')} FCFA` : 'Gratuit'}</span></div></div>)}</div>}
        </details>
      </div>

      {/* 4. FLOATING BOTTOM BAR (Cart Summary) */}
      {totalCartCount > 0 && !isCartOpen && (
        createPortal(<div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-lg px-4">
          <button
            id="floating-cart-btn"
            onClick={() => setIsCartOpen(true)}
            className="w-full text-white p-4 rounded-2xl shadow-[0_10px_25px_rgba(32,23,18,0.2)] flex items-center justify-between gap-3 active:scale-[0.99] transition-transform border-[2px] border-[#211712]"
            style={{ background: 'linear-gradient(135deg, #1D6B57 0%, #E6572B 100%)', ...glowStyle }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                {totalCartCount}
              </div>
              <div className="text-left">
                <span className="text-xs text-white/80 block">Articles · hors livraison</span>
                <span className="font-black text-base sm:text-lg text-white">
                  {formatFCFA(totalCartAmount)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white/15 hover:bg-white/25 px-3.5 py-2 rounded-xl transition-colors">
              <span>Commander</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </button>
        </div>, document.body)
      )}

      {/* 5. CHECKOUT DRAWER / MODAL */}
      {isCartOpen && (
        createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCartOpen(false); }}>
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-dialog-title"
            className="bg-[#FFFDF9] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-[0_18px_40px_rgba(34,32,27,0.18)] overflow-hidden animate-in slide-in-from-bottom-6 duration-200 border-[3px] border-[#211712] sm:border"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b-[2px] border-[#E4D9C8] bg-[#FFF5EE] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="checkout-dialog-title" className="font-black text-slate-900 text-base">Finaliser ma commande</h3>
                  <p className="text-xs text-slate-500">{totalCartCount} article(s) sélectionné(s)</p>
                </div>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
              {orderSuccess ? (
                /* ORDER SUCCESS SCREEN WITH DIRECT WHATSAPP LAUNCH */
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-900 mb-1">
                    Commande acceptée automatiquement (N° {orderSuccess.orderId})
                  </h4>
                  <p className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full inline-block font-semibold mb-4">
                    ✓ Stock réservé · commande validée
                  </p>
                  <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6 leading-relaxed">
                    Votre commande est enregistrée sans validation manuelle. Contactez le commerçant sur WhatsApp pour convenir de la livraison et du paiement.
                  </p>

                  <a
                    href={orderSuccess.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (orderSuccess.whatsappTrackingToken) {
                        void fetch(`/api/orders/${orderSuccess.orderId}/whatsapp-click`, {
                          method: 'POST',
                          keepalive: true,
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: orderSuccess.whatsappTrackingToken }),
                        }).catch(() => undefined);
                      }
                    }}
                    className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-3 transition-all"
                  >
                    <Phone className="w-5 h-5 fill-white" />
                    <span>Contacter le commerçant sur WhatsApp</span>
                  </a>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    La boutique verra si vous cliquez sur ce bouton. MaTable.ci ne peut pas confirmer l’ouverture de WhatsApp ni l’envoi du message.
                  </p>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(orderSuccess.whatsappText);
                        setMessageCopied(true);
                      } catch {
                        toast.error('Impossible de copier le message.');
                      }
                    }}
                    className="mt-3 text-xs text-slate-600 hover:text-slate-900 font-semibold"
                  >
                    {messageCopied ? 'Message copié' : 'Copier le message si WhatsApp ne s’ouvre pas'}
                  </button>

                  <button
                    onClick={() => {
                      setCart([]);
                      setOrderSuccess(null);
                      setIsCartOpen(false);
                    }}
                    className="mt-4 text-xs text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    Fermer et retourner au catalogue
                  </button>
                </div>
              ) : (
                <>
                  {/* Selected items list */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Détails de vos articles
                    </span>
                    {cart.map((item, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F8F3EC] border border-[#E4D9C8]"
                      >
                        <CategoryProductImage
                          imageUrl={item.product.image_url}
                          category={shop.category}
                          title={item.product.title}
                          className="h-12 w-12 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {item.product.title}
                          </h4>
                          <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                            {item.selected_size && (
                              <span className="font-bold text-slate-700 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                T: {item.selected_size}
                              </span>
                            )}
                            {item.selected_color && (
                              <span className="text-slate-600">({item.selected_color})</span>
                            )}
                            {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                              <span className="text-amber-700">+{item.selected_modifiers.join(', ')}</span>
                            )}
                            {trustTarget && <CustomerTrustPanel targetType={trustTarget.type} targetId={trustTarget.id} targetName={trustTarget.name} onClose={() => setTrustTarget(null)} />}
                          </div>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                            {formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers))} x {item.quantity} = {formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers) * item.quantity)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQuantity(idx, -1)}
                            className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-extrabold text-xs px-2 text-slate-900">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(idx, 1)}
                            disabled={item.quantity >= item.product.stock}
                            className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {authenticatedCustomer && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Compte vérifié</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{authenticatedCustomer.name}</p>
                          <p className="text-[11px] text-slate-600">{authenticatedCustomer.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCheckoutAuth(true)}
                          className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700"
                        >
                          Changer
                        </button>
                      </div>
                    </div>
                  )}

                  {!authenticatedCustomer && !showCheckoutAuth && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-600">
                        Vous pouvez commander sans compte. Connectez-vous si vous souhaitez retrouver cette commande dans votre historique.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCheckoutAuth(true)}
                        className="mt-2 text-xs font-bold text-[#176b55] underline underline-offset-2"
                      >
                        Se connecter (facultatif)
                      </button>
                    </div>
                  )}

                  {showCheckoutAuth && !authenticatedCustomer && (
                    <CustomerCheckoutAuth
                      prefillName={customerName}
                      prefillPhone={customerPhone}
                      onAuthenticated={(user) => {
                        setCheckoutAuthUser(user);
                        setCustomerName(user.name);
                        setCustomerPhone(user.phone);
                        onCustomerAuthenticated?.(user);
                        setShowCheckoutAuth(false);
                        window.setTimeout(() => (document.getElementById('checkout-form') as HTMLFormElement | null)?.requestSubmit(), 0);
                      }}
                    />
                  )}

                  {/* Customer Information Form */}
                  <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4 pt-2 border-t border-slate-200">
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="website">Site web</label>
                      <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6B6355] block">
                      Vos coordonnées pour la commande
                    </span>

                    {/* Customer Name */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Votre Nom complet *
                      </label>
                      <input 
                        type="text"
                        required
                        placeholder="Ex: Kouassi Ange, Fatou Traoré..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#E6572B] bg-white"
                      />
                    </div>

                    {/* Customer Phone */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Numéro de Téléphone (WhatsApp) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-semibold">
                          🇨🇮 +225
                        </span>
                        <input 
                          type="tel"
                          required
                          placeholder="07 00 11 22 33"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full text-sm pl-20 pr-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#E6572B] bg-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Delivery Location / Commune */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Quartier / Commune *
                      </label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          'Cocody Angré',
                          'Cocody Riviera',
                          'Marcory Zone 4',
                          'Yopougon',
                          'Treichville',
                          'Plateau',
                          'Koumassi',
                          'Autre',
                        ].map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setDeliveryLocation(loc)}
                            className={`py-2 px-2.5 rounded-lg font-medium border text-left flex items-center gap-1.5 transition-colors ${
                              deliveryLocation === loc
                                ? 'bg-[#1D6B57] text-white border-[#154F41] shadow-[2px_2px_0_rgba(21,79,65,0.2)]'
                                : 'bg-[#F8F3EC] text-[#211712] border-[#E4D9C8] hover:bg-[#F5EADC]'
                            }`}
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{loc}</span>
                          </button>
                        ))}
                      </div>

                      {deliveryLocation === 'Autre' && (
                        <input
                          type="text"
                          required
                          placeholder="Précisez la ville / quartier (ex: Bingerville, Bouaké, San Pedro...)"
                          value={customLocation}
                          onChange={(e) => setCustomLocation(e.target.value)}
                          className="w-full mt-2 text-sm px-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#E6572B] bg-white"
                        />
                      )}

                      <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          MaTable transmet ces indications au commerçant. MaTable ne gère ni la livraison ni les frais associés : convenez-en directement avec la boutique.
                        </span>
                      </div>
                    </div>

                    {/* Food Delivery Slot */}
                    {shop.category === 'food' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Créneau souhaité pour vos plats
                        </label>
                        <select
                          value={deliverySlot}
                          onChange={(e) => setDeliverySlot(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#E4D9C8] bg-white font-bold text-[#211712]"
                        >
                          <option value="Dès que prêt (30-45 min)">Dès que prêt (30-45 min)</option>
                          <option value="Ce midi (12h - 13h30)">Ce midi (12h - 13h30)</option>
                          <option value="Ce soir (19h - 21h)">Ce soir (19h - 21h)</option>
                          <option value="Demain midi">Demain midi</option>
                        </select>
                      </div>
                    )}

                    {/* Delivery Note */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Précision pour le livreur (Optionnel)
                      </label>
                      <input 
                        type="text"
                        placeholder="Ex: Face pharmacie Saint-Jean, portail vert..."
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        className="w-full text-sm px-3.5 py-2 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#E6572B] bg-white"
                      />
                    </div>

                    {/* Payment method */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Mode de paiement souhaité
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'wave', label: 'Wave', icon: '🌊' },
                          { id: 'mobile_money', label: 'Mobile Money', icon: '📱' },
                          { id: 'cash', label: 'Espèces', icon: '💵' },
                          { id: 'to_confirm', label: 'À convenir', icon: '💬' },
                        ].map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPaymentMethod(p.id as any)}
                            className={`p-2 rounded-xl border text-center font-bold text-xs transition-colors ${
                              paymentMethod === p.id 
                                ? 'bg-slate-900 border-slate-900 text-white' 
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span className="text-base block mb-0.5">{p.icon}</span>
                            <span>{p.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Le paiement est discuté directement entre le client et le vendeur. MaTable.ci ne collecte pas d’argent.
                      </p>
                    </div>

                    {/* Total & Submit Button */}
                    <div className="pt-4 border-t border-slate-200">
                      <div className="flex flex-col mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-700">Total des articles :</span>
                          <span className="text-xl font-black text-slate-900">
                            {formatFCFA(totalCartAmount)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          *(Frais de livraison à régler au coursier selon la commune)*
                        </span>
                      </div>

                      <button
                        id="submit-order-whatsapp-btn"
                        type="submit"
                        disabled={isSubmitting || !shop.is_open}
                        className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-base shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Phone className="w-5 h-5 fill-white" />
                        <span>{isSubmitting ? 'Validation...' : 'Commander sur WhatsApp'}</span>
                      </button>
                      <p className="text-center text-[11px] text-slate-400 mt-2">
                        Décrémente le stock en direct et ouvre WhatsApp avec votre reçu pré-rempli.
                      </p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>, document.body)
      )}
    </div>
  );
};