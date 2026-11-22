import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { StorefrontLoadingSkeleton } from './Skeletons';
import { InstallAppPrompt } from './InstallAppPrompt';
import { ContextualHelp } from './ContextualHelp';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { 
  ShoppingBag, 
  Bookmark,
  Phone, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Plus, 
  Minus, 
  ArrowLeft,
  ArrowRight, 
  Info,
  Clock,
  Search,
  ShieldCheck,
  Star,
  Waves,
  Smartphone,
  Banknote,
  MessageCircle,
  ChevronDown,
} from 'lucide-react';
import type { Order, Shop, Product } from '../types';
import { formatFCFA, generateWhatsAppOrderReceipt, getProductUnitPrice } from '../utils/format';
import { getContrastTextColor, normalizeHex } from '../utils/color';
import { getDefaultSelectedModifiers } from '../utils/cart';
import { getBannerImageForDisplay, getCategoryDefaults, getProductImageForDisplay, getWelcomeMessageForDisplay } from '../utils/categoryDefaults';
import { CategoryProductImage } from './CategoryProductImage';
import { CategoryIcon } from './CategoryIcon';
import { PhoneField, TextField } from './ui/fields';
import { readTrackedOrders, rememberTrackedOrder, trackingPath } from './OrderProgress';
import { ShopEventIcon } from './ShopEventIcon';
import { CustomerProductCard } from './CustomerProductCard';
import { useToast } from './Toast';
import { hasAnalyticsConsent } from '../utils/cookieConsent';
import { normalizeCustomerPhone } from '../utils/normalizeCustomerPhone';
import {
  trackCartEvent,
  trackCheckoutStart,
  trackOrderCreated,
  trackPageView,
  trackProductClick,
  trackProductView,
  trackWhatsAppClick,
} from '../utils/analyticsTracker';
import { getAnalyticsCampaignFromSearch, getStoredAnalyticsCampaign } from '../utils/analyticsAttribution';
import type { CustomerUser } from './CustomerAuth';
import { CustomerCheckoutAuth } from './CustomerCheckoutAuth';
import { CustomerTrustPanel } from './CustomerTrustPanel';
import { getCanonicalOrigin } from '../utils/seoCanonical';
import { getActiveProductPrice } from '../utils/productPricing';
import { normalizeShopEventType, SHOP_EVENT_VISUALS } from '../utils/shopEventVisuals';
import { getCartItemKey, useCustomerCart } from './useCustomerCart';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';
import { lockBodyScroll } from '../utils/scrollLock';
import { MOTION_EASE, MOTION_SECONDS, motionFast, motionStandard } from '../utils/motionTokens';
import { AnimatedNumber } from './AnimatedNumber';
import { MotionGridItem } from './MotionSystem';
import { SuccessCheck } from './SuccessCheck';

interface CustomerStorefrontProps {
  shopSlug: string;
  onSelectShop?: (slug: string) => void;
  customerUser?: CustomerUser | null;
  onCustomerAuthenticated?: (user: CustomerUser) => void;
}

const paymentPreferenceOptions: {
  id: Order['payment_method_preference'];
  label: string;
  explanation: string;
}[] = [
  { id: 'wave', label: 'Wave', explanation: 'Vous réglerez directement au vendeur après confirmation de la commande.' },
  { id: 'mobile_money', label: 'Mobile Money', explanation: 'Convenez avec la boutique de l’opérateur et du paiement après confirmation.' },
  { id: 'cash', label: 'Espèces', explanation: 'Le paiement en espèces sera à convenir avec la boutique, au retrait ou à la remise.' },
  { id: 'to_confirm', label: 'À convenir', explanation: 'Vous choisirez le mode de règlement avec la boutique sur WhatsApp.' },
];

const paymentMethodIcons: Record<Order['payment_method_preference'], React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  wave: Waves,
  mobile_money: Smartphone,
  cash: Banknote,
  to_confirm: MessageCircle,
};

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({ shopSlug, customerUser, onCustomerAuthenticated }) => {
  const toast = useToast();
  const prefersReducedMotion = useReducedMotion();
  const location = useLocation();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [saleRefresh, setSaleRefresh] = useState(Date.now());
  const [hasAgeRestrictedProducts, setHasAgeRestrictedProducts] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageVerificationToken, setAgeVerificationToken] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [ageDenied, setAgeDenied] = useState(false);
  const [ageConfirmationComplete, setAgeConfirmationComplete] = useState(false);
  const [isAgeGateClosing, setIsAgeGateClosing] = useState(false);
  const [ageVerificationError, setAgeVerificationError] = useState('');
  const [isVerifyingAge, setIsVerifyingAge] = useState(false);
  const ageDialogRef = useRef<HTMLElement>(null);
  const ageExitButtonRef = useRef<HTMLAnchorElement>(null);
  const ageConfirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const handledAnchorRef = useRef('');
  const [requestedProductId, setRequestedProductId] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  const [likedProductIds, setLikedProductIds] = useState<Set<number>>(new Set());
  const [pendingLikeProductIds, setPendingLikeProductIds] = useState<Set<number>>(new Set());
  const pendingLikeRequests = useRef(new Set<number>());
  const [isFavoriteShop, setIsFavoriteShop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const isCompactViewport = useMediaQuery('(max-width: 639px)');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextSaleBoundary = products
      .flatMap((product) => [product.sale_starts_at, product.sale_ends_at])
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextSaleBoundary) return;
    const timer = window.setTimeout(() => setSaleRefresh(Date.now()), Math.max(0, nextSaleBoundary - Date.now() + 25));
    return () => window.clearTimeout(timer);
  }, [products, saleRefresh]);

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
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<Order['payment_method_preference']>('to_confirm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCheckoutAuth, setShowCheckoutAuth] = useState(false);
  const [trustTarget, setTrustTarget] = useState<{ type: 'shop' | 'product'; id: number; name: string } | null>(null);

  const [checkoutAuthUser, setCheckoutAuthUser] = useState<CustomerUser | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: number;
    whatsappUrl: string;
    whatsappText: string;
    whatsappTrackingToken: string;
    emailReceiptStatus: 'sent' | 'failed' | 'not_requested';
    emailReceiptAddress: string;
  } | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);
  const [formStartedAt] = useState(() => Date.now());
  const [website, setWebsite] = useState('');

  // Ces deux useMemo doivent être déclarés avant les "return" conditionnels
  // ci-dessous (loading / error / boutique inactive), sinon React appelle un
  // nombre de hooks différent selon l'état, ce qui casse le rendu (page blanche).
  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
  }, [products]);

  // Le panier peut encore contenir les articles d’une autre boutique : le nom de
  // la boutique affichée ne s’applique qu’à ses propres produits.
  const isRestrictedHere = useCallback((product: Product) => isAgeRestrictedProduct(
    product,
    shop && product.shop_id === shop.id ? shop.name : '',
  ), [shop]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!ageVerified && isRestrictedHere(p)) return false;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        `${p.title} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory, ageVerified, isRestrictedHere]);

  useEffect(() => {
    const productAnchor = /^#product-(\d+)$/.exec(location.hash);
    const anchorKey = `${location.key}${location.hash}`;
    // Le contrôle d’âge passe toujours avant, et un rafraîchissement du catalogue ne rejoue pas l’ancre.
    if (!productAnchor || loading || products.length === 0 || handledAnchorRef.current === anchorKey
      || hasAgeRestrictedProducts && !ageVerified) return undefined;

    const timer = window.setTimeout(() => {
      handledAnchorRef.current = anchorKey;
      setRequestedProductId(Number(productAnchor[1]));
      const target = document.getElementById(`product-${productAnchor[1]}`)
        || document.getElementById('store-catalogue');
      target?.scrollIntoView({ behavior: prefersReducedMotion ? 'instant' : 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [location.key, location.hash, loading, products, hasAgeRestrictedProducts, ageVerified, prefersReducedMotion]);

  useEffect(() => {
    const anchorKey = `${location.key}${location.hash}`;
    if (location.hash !== '#panier' || loading || cart.length === 0 || handledAnchorRef.current === anchorKey
      || hasAgeRestrictedProducts && !ageVerified) return;
    handledAnchorRef.current = anchorKey;
    setIsCartOpen(true);
  }, [location.key, location.hash, loading, cart.length, hasAgeRestrictedProducts, ageVerified, setIsCartOpen]);

  const fetchShopData = async (signal: AbortSignal, ageToken = '', silent = false): Promise<boolean> => {
    try {
      if (!ageToken && !silent) {
        setLoading(true);
        setError(null);
        setShop(null);
        setProducts([]);
      }
      const res = await fetch(`/api/v1/catalog/storefronts/${encodeURIComponent(shopSlug)}`, {
        signal,
        cache: ageToken ? 'no-store' : undefined,
        headers: ageToken ? { 'X-MaTable-Age-Verification': ageToken } : undefined,
      });
      if (!res.ok) {
        throw new Error('Boutique introuvable');
      }
      const data = await res.json();
      if (signal.aborted) return false;
      setShop(data.shop);
      setProducts(data.products || []);
      setHasAgeRestrictedProducts(Boolean(data.has_age_restricted_products));
      if (silent) return true;

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
      if (silent) return false;
      if (ageToken) setAgeVerificationError('Impossible de charger les produits. Réessayez.');
      else setError(err.message || 'Erreur lors du chargement');
      return false;
    } finally {
      if (!signal.aborted && !ageToken && !silent) setLoading(false);
    }
  };

  const handleAgeVerification = async () => {
    if (isVerifyingAge) return;
    setAgeVerificationError('');
    if (!birthDate) {
      setAgeVerificationError('Saisissez votre date de naissance.');
      return;
    }
    setIsVerifyingAge(true);
    try {
      const verificationResponse = await fetch('/api/v1/catalog/storefronts/age-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_slug: shopSlug, birth_date: birthDate }),
      });
      const verification = await verificationResponse.json();
      if (!verificationResponse.ok || typeof verification.age_verification_token !== 'string') {
        setAgeVerificationError(verification.error || 'Impossible de vérifier votre âge. Réessayez.');
        return;
      }
      const token = verification.age_verification_token as string;
      const loaded = await fetchShopData(new AbortController().signal, token);
      if (loaded) {
        setAgeVerificationToken(token);
        setAgeConfirmationComplete(true);
        ageConfirmationTimerRef.current = setTimeout(
          () => {
            setIsAgeGateClosing(true);
            ageConfirmationTimerRef.current = setTimeout(
              () => setAgeVerified(true),
              prefersReducedMotion ? 0 : 400,
            );
          },
          prefersReducedMotion ? 0 : 650,
        );
      } else {
        setAgeVerificationError('Impossible de charger les produits. Réessayez.');
      }
    } catch {
      setAgeVerificationError('Impossible de vérifier votre âge. Réessayez.');
    } finally {
      setIsVerifyingAge(false);
    }
  };

  useEffect(() => () => {
    if (ageConfirmationTimerRef.current) clearTimeout(ageConfirmationTimerRef.current);
  }, []);

  useEffect(() => {
    if (!hasAgeRestrictedProducts || ageVerified) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockBodyScroll();
    ageDialogRef.current?.focus();

    return () => {
      unlockScroll();
      previousFocus?.focus();
    };
  }, [hasAgeRestrictedProducts, ageVerified]);

  useEffect(() => {
    if (!hasAgeRestrictedProducts || ageVerified) return;
    if (ageDenied) ageExitButtonRef.current?.focus();
    else ageDialogRef.current?.focus();
  }, [ageDenied, hasAgeRestrictedProducts, ageVerified]);

  useEffect(() => {
    if (ageVerified || !cart.some((item) => isRestrictedHere(item.product))) return;
    setCart((items) => items.filter((item) => !isRestrictedHere(item.product)));
  }, [ageVerified, cart, isRestrictedHere, setCart]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchShopData(controller.signal);
    setOrderSuccess(null);
    return () => controller.abort();
  }, [shopSlug, reloadKey]);

  const refreshCatalogue = useCallback(async () => {
    const controller = new AbortController();
    return fetchShopData(controller.signal, '', true);
  }, [shopSlug]);
  const pullToRefresh = usePullToRefresh(refreshCatalogue, !loading && !!shop);

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
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/connexion?return_to=${encodeURIComponent(returnTo)}`);
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
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/connexion?return_to=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (pendingLikeRequests.current.has(productId)) return;
    pendingLikeRequests.current.add(productId);
    setPendingLikeProductIds((previous) => new Set(previous).add(productId));
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
    } finally {
      pendingLikeRequests.current.delete(productId);
      setPendingLikeProductIds((previous) => {
        const next = new Set(previous);
        next.delete(productId);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!shop?.id) return;
    trackPageView(window.location.pathname, 'customer', shop.id);
  }, [shop?.id]);

  // Keep the sticky catalog bar flush under the real (variable) header height.
  useEffect(() => {
    const header = headerRef.current;
    const page = pageRef.current;
    if (!header || !page) return;
    const syncHeaderHeight = () => {
      page.style.setProperty('--storefront-header-h', `${header.offsetHeight}px`);
    };
    syncHeaderHeight();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHeaderHeight);
      return () => window.removeEventListener('resize', syncHeaderHeight);
    }
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, [shop?.id]);

  useEffect(() => {
    if (!shop?.id || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const productId = Number((entry.target as HTMLElement).dataset.analyticsProductId);
        if (Number.isInteger(productId)) trackProductView(shop.id, productId);
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.5 });
    document.querySelectorAll<HTMLElement>('[data-analytics-product-id]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [filteredProducts, shop?.id]);

  const reportProductClick = (productId: number) => {
    if (!shop?.id) return;
    trackProductClick(shop.id, productId);
  };

  useEffect(() => {
    if (!shop) return;

    const origin = getCanonicalOrigin(window.location.origin);
    const canonicalUrl = `${origin}/${shop.slug}`;
    const description = getWelcomeMessageForDisplay(shop.welcome_message, shop.category).slice(0, 160);
    const image = getBannerImageForDisplay(shop.theme_config?.custom_banner_url, shop.category)
      || (products[0] ? getProductImageForDisplay(products[0].image_url, shop.category) : '')
      || `${origin}/brand-kit/social-share.png`;
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

    document.title = `${shop.name} — Boutique locale en Côte d’Ivoire | MaTable`;
    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="robots"]', 'name', 'robots', 'index, follow, max-image-preview:large');
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', document.title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
    upsertMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', image);
    upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', shop.name);
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', document.title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
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
      address: {
        '@type': 'PostalAddress',
        ...(shop.city ? { addressLocality: shop.city } : {}),
        addressCountry: 'CI',
      },
      areaServed: 'Côte d’Ivoire',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Catalogue ${shop.name}`,
        itemListElement: products.filter(product => product.is_available && product.stock > 0).slice(0, 30).map(product => ({
          '@type': 'Offer',
          priceCurrency: 'XOF',
          price: getActiveProductPrice(product),
          availability: 'https://schema.org/InStock',
          itemOffered: {
            '@type': 'Product',
            name: product.title,
            description: product.description || undefined,
            image: getProductImageForDisplay(product.image_url, shop.category) || undefined,
          },
        })),
      },
    });

    return () => {
      document.title = 'Produits locaux à découvrir en Côte d’Ivoire | MaTable';
      const defaultDescription = 'Découvrez les produits des commerces locaux en Côte d’Ivoire, explorez les boutiques par ville et commandez directement sur WhatsApp avec MaTable.';
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

  useEffect(() => {
    setAgeVerified(false);
    setAgeVerificationToken('');
    setBirthDate('');
    setAgeConfirmationComplete(false);
    setAgeDenied(false);
    setIsAgeGateClosing(false);
  }, [shopSlug]);

  // Handle WhatsApp Checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || cart.length === 0) return;
    trackCheckoutStart(shop.id, totalCartCount, totalCartAmount);
    if (!ageVerified && cart.some((item) => isRestrictedHere(item.product))) {
      toast.error('Confirmez votre majorité avant de commander ces produits.');
      return;
    }

    const trimmedName = customerName.trim();
    const normalizedPhone = normalizeCustomerPhone(customerPhone);
    const digitsOnlyPhone = normalizedPhone.replace(/\D/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      toast.error('Veuillez renseigner un nom complet pour la commande.');
      return;
    }
    if (!normalizedPhone || digitsOnlyPhone.length < 10) {
      toast.error('Veuillez renseigner un numéro de téléphone WhatsApp valide.');
      return;
    }
    const emailReceiptAddress = authenticatedCustomer?.email.trim() || customerEmail.trim();

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
          customer_email: authenticatedCustomer ? undefined : customerEmail.trim() || undefined,
          payment_method_preference: paymentMethod,
          age_verification_token: ageVerified ? ageVerificationToken : undefined,
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
          attribution_campaign: hasAnalyticsConsent()
            ? getAnalyticsCampaignFromSearch(window.location.search) || getStoredAnalyticsCampaign()
            : null,
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
        emailReceiptStatus: data.email_receipt_status === 'sent'
          ? 'sent'
          : data.email_receipt_status === 'failed' ? 'failed' : 'not_requested',
        emailReceiptAddress,
      });
      if (data.whatsapp_tracking_token) {
        rememberTrackedOrder({
          id: Number(data.order.id),
          token: String(data.whatsapp_tracking_token),
          shopSlug: shop.slug,
          shopName: shop.name,
          createdAt: String(data.order.created_at || new Date().toISOString()),
        });
      }
      trackOrderCreated(
        shop.id,
        Number(data.order.id),
        totalCartCount,
        Number(data.order.total_amount || totalCartAmount),
      );
      setMessageCopied(false);

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
    return <StorefrontLoadingSkeleton onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  if (error || !shop) {
    return (
      <div className="not-found-page" role="main">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-bold text-[var(--mt-green-hover)]">Erreur 404</p>
        <h1 className="text-2xl font-black text-slate-900">Cette page n’existe pas</h1>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          La boutique ou l’adresse demandée n’existe pas ou a été déplacée.
        </p>
        <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-[var(--mt-green-hover)] px-5 py-3 font-bold text-white">Retour aux boutiques</Link>
      </div>
    );
  }

  // If shop subscription is OFF
  if (!shop.is_active) {
    return (
      <div className="max-w-lg mx-auto my-16 p-8 bg-white rounded-3xl border border-rose-100 shadow-xl text-center" role="main">
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
  const eventVisual = SHOP_EVENT_VISUALS[normalizeShopEventType(shop.theme_config?.event_type)];
  const primaryTextColor = getContrastTextColor(primaryColor);

  // Advanced CSS classes
  const cardRadius = shop.theme_config?.advanced_css?.borderRadius || 'rounded-2xl';
  const shadowClass = 
    shop.theme_config?.advanced_css?.shadowIntensity === 'none' ? 'shadow-none' :
    shop.theme_config?.advanced_css?.shadowIntensity === 'strong' ? 'shadow-lg' :
    shop.theme_config?.advanced_css?.shadowIntensity === 'soft' ? 'shadow-md' : 'shadow-2xs';
  // Dernière commande de moins de 24 h passée ici depuis cet appareil.
  const recentTrackedOrder = readTrackedOrders().find((tracked) =>
    tracked.shopSlug === shop.slug && Date.now() - Date.parse(tracked.createdAt) < 24 * 60 * 60 * 1000) ?? null;
  const glowStyle = shop.theme_config?.advanced_css?.accentGlow ? { boxShadow: `0 0 20px ${primaryColor}40` } : {};

  const openingHours = shop.opening_hours;
  const catalogUpdatedAt = shop.catalog_updated_at ? Date.parse(shop.catalog_updated_at) : Number.NaN;
  const catalogUpdatedLabel = Number.isFinite(catalogUpdatedAt)
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(catalogUpdatedAt)
    : null;
  const hoursRange = openingHours?.open_time && openingHours.close_time
    ? `${openingHours.open_time}–${openingHours.close_time}`
    : '';
  const daysSummary = openingHours?.days?.length
    ? openingHours.days.length === 7 ? '7 jours / semaine' : `${openingHours.days.length} jours / semaine`
    : '';
  const hoursSummary = openingHours?.enabled
    ? [hoursRange, daysSummary].filter(Boolean).join(' · ')
    : '';

  return (
    <div 
      ref={pageRef}
      className={`storefront-page min-h-screen transition-colors ${totalCartCount > 0 && !isCartOpen ? 'pb-28 sm:pb-32' : 'pb-8'}`}
      style={{ 
        background: 'linear-gradient(180deg, #faf8f3 0%, #f1eee7 100%)',
        fontFamily: `"${fontFamily}", system-ui, sans-serif`
      }}
    >
      {/* 1. Header & Shop Identity */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center transition-opacity sm:hidden"
        style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)', opacity: pullToRefresh.distance > 8 || pullToRefresh.refreshing || pullToRefresh.failed ? 1 : 0 }}
      >
        <span className="rounded-full bg-[var(--mt-green-deep)] px-4 py-2 text-xs font-black text-white shadow-lg">
          {pullToRefresh.failed ? 'Actualisation impossible. Réessayez.' : pullToRefresh.refreshing ? 'Actualisation du catalogue…' : pullToRefresh.ready ? 'Relâchez pour actualiser' : 'Tirez pour actualiser'}
        </span>
      </div>
      <header ref={headerRef} className="bg-[var(--mt-surface)]/95 backdrop-blur-md border-b border-[#ded8ce] sticky top-0 z-40 pt-[env(safe-area-inset-top)] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Link to="/" aria-label="Retour à l’annuaire" title="Retour à l’annuaire" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop.name}
                className="hidden h-11 w-11 rounded-xl object-cover shrink-0 border border-slate-200 bg-white sm:block"
              />
            ) : (
              <div 
                className="hidden h-11 w-11 rounded-xl items-center justify-center font-black text-lg shrink-0 sm:flex"
                style={{ backgroundColor: primaryColor, color: primaryTextColor }}
              >
                <CategoryIcon category={shop.category} className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <h1 className="line-clamp-1 max-w-full text-base font-black leading-tight text-[var(--mt-gray-900)] sm:text-lg">{shop.name}</h1>
                <span className="flex min-w-0 max-w-full items-center gap-2">
                  <span className={`inline-flex min-w-0 items-center gap-1.5 whitespace-normal leading-tight text-xs font-bold ${shop.is_open ? 'text-[var(--mt-green-hover)]' : 'text-[#8a5a12]'}`}>
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${shop.is_open ? 'bg-[var(--mt-green-hover)]' : 'bg-[#8a5a12]'}`} />
                    <span>{shop.is_open ? 'Ouverte' : 'Fermée'}<span className="hidden lg:inline"> aux commandes</span></span>{shop.city ? <span className="truncate sm:hidden">· {shop.city}</span> : null}
                  </span>
                  {['approved', 'verified'].includes(shop.identity_verification_status || shop.merchant_verification_status || '') && (
                    <span className="hidden items-center gap-0.5 rounded-full bg-[#e3f4ea] px-1.5 py-0.5 text-xs font-extrabold text-[var(--mt-green-deep)] sm:inline-flex" title="Le commerçant a fait vérifier son identité">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Vérifié
                    </span>
                  )}
                </span>
              </div>
              <div className="hidden min-w-0 text-xs text-slate-500 sm:block">
                {catalogUpdatedLabel && <p>Catalogue actualisé le {catalogUpdatedLabel}</p>}
                <div className="hidden items-center gap-2 truncate sm:flex">
                  <span>MaTable</span>
                  {shop.city ? <span className="text-slate-300">•</span> : null}
                  {shop.city ? <span className="truncate">{shop.city}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCustomerFavorite('shop', shop.id)}
              aria-pressed={isFavoriteShop}
              aria-label={isFavoriteShop ? 'Retirer cette boutique de vos favoris' : 'Ajouter cette boutique à vos favoris'}
              className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold transition sm:inline-flex sm:w-auto sm:gap-1.5 sm:px-3 ${isFavoriteShop ? 'border-[#c8dbd0] bg-[#d1fae5] text-[var(--mt-green-deep)]' : 'border-[#ded8ce] bg-white text-[#47534b] hover:border-[var(--mt-green-hover)]'}`}
            >
              <Bookmark className={`h-4 w-4 ${isFavoriteShop ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline">{isFavoriteShop ? 'Enregistrée' : 'Enregistrer'}</span>
            </button>
            <button
              id="cart-header-btn"
              onClick={() => totalCartCount > 0 ? setIsCartOpen(true) : document.getElementById('store-catalogue')?.scrollIntoView({ behavior: 'smooth' })}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--mt-green-deep)] text-sm font-semibold text-white transition hover:bg-[var(--mt-green-hover)] sm:w-auto sm:gap-2 sm:px-3.5"
              aria-label={totalCartCount > 0 ? 'Voir le panier' : 'Découvrir le catalogue'}
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">{totalCartCount > 0 ? 'Mon panier' : 'Catalogue'}</span>
              {totalCartCount > 0 && (
                <m.span
                  key={totalCartCount}
                  initial={prefersReducedMotion ? false : { scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: prefersReducedMotion ? 0 : MOTION_SECONDS.fast }}
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-xs font-black"
                  style={{ backgroundColor: primaryColor, color: primaryTextColor }}
                >
                  {totalCartCount}
                </m.span>
              )}
            </button>
          </div>
        </div>
      </header>

      {pendingShopSwitchProduct && requiresShopSwitch && (
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingShopSwitchProduct(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="shop-switch-title" className="w-full max-w-md rounded-2xl border-2 border-[var(--mt-gray-900)] bg-[var(--mt-surface)] p-5 shadow-2xl">
              <h2 id="shop-switch-title" className="text-lg font-black text-[var(--mt-gray-900)]">Votre panier appartient à une autre boutique</h2>
              <p className="mt-2 text-sm leading-6 text-[#47534b]">Pour commander chez {shop?.name}, il faut remplacer le panier de « {cartShopSlug} ». Votre commande restera liée à une seule boutique.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPendingShopSwitchProduct(null)} className="min-h-11 rounded-xl border-2 border-[#ded8ce] bg-white px-4 text-sm font-bold text-[var(--mt-gray-900)]">Garder ce panier</button>
                <button type="button" onClick={() => { const product = pendingShopSwitchProduct; setPendingShopSwitchProduct(null); addToCart(product, true); }} className="min-h-11 rounded-xl border-2 border-[var(--mt-gray-900)] bg-[var(--mt-green-hover)] px-4 text-sm font-bold text-white">Vider et continuer</button>
              </div>
            </section>
          </div>,
          document.body,
        )
      )}

      <div className="max-w-6xl mx-auto px-4 pt-3 sm:pt-4">
        <div className="group relative min-h-44 overflow-hidden rounded-[1.35rem] border border-white/70 shadow-[0_18px_45px_rgba(33,23,18,0.12)]" style={{ backgroundColor: bannerUrl ? primaryColor : secondaryColor }}>
          {bannerUrl && <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
          {bannerUrl && <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/25 to-transparent" />}
          {!bannerUrl && <div aria-hidden="true" className="mt-photo-fallback absolute inset-0" style={{ color: primaryColor }}><CategoryIcon category={shop.category} className="absolute -right-5 -top-4 h-32 w-32 rotate-[-12deg] opacity-[0.13]" /></div>}
          <div className={`relative z-10 flex min-h-44 flex-col items-start justify-end gap-2 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:p-6 ${bannerUrl ? 'text-white' : ''}`} style={!bannerUrl ? { color: primaryColor } : undefined}>
            <div className="max-w-2xl">
              <p className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${bannerUrl ? 'border border-white/25 bg-white/10 text-white/90' : 'border border-current/20 bg-white/70'}`}>
                {['approved', 'verified'].includes(shop.identity_verification_status || shop.merchant_verification_status || '') && <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                {['approved', 'verified'].includes(shop.identity_verification_status || shop.merchant_verification_status || '') ? 'Identité vérifiée · ' : ''}{categoryDefaults.label}
              </p>
              <h2 className="mt-2 line-clamp-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{shop.name}</h2>
              <p className="mt-1.5 line-clamp-2 max-w-xl text-sm font-medium leading-5 sm:text-base sm:leading-6">{getWelcomeMessageForDisplay(shop.welcome_message, shop.category)}</p>
            </div>
            <a href="#store-catalogue" className={`hidden min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5 sm:inline-flex sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${bannerUrl ? 'border border-white/70 bg-white text-[var(--mt-green-deep)]' : 'border border-current/30 bg-white/80'}`}>Découvrir la sélection<ArrowRight className="h-4 w-4" /></a>
          </div>
        </div>
      </div>

      {isEventMode && eventBannerText && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="flex justify-center sm:justify-start">
            <div className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-xs font-extrabold shadow-[0_4px_14px_rgba(33,23,18,0.05)] sm:px-4 sm:py-2.5 sm:text-sm ${eventVisual.bannerClass}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${eventVisual.badgeClass}`}><ShopEventIcon type={normalizeShopEventType(shop.theme_config?.event_type)} className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-xs opacity-70">{eventVisual.label}</span><span className="line-clamp-2">{eventBannerText}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* Main storefront content */}
      <main className="max-w-6xl mx-auto px-4 pt-3">
        {/* Commande récente passée depuis cet appareil : accès direct au suivi, même sans compte. */}
        {recentTrackedOrder && (
          <Link
            to={trackingPath(recentTrackedOrder)}
            className="mb-3 flex min-h-14 items-center gap-3 rounded-2xl border border-[#cfe3d8] bg-[#f0f8f4] px-4 text-sm text-[var(--mt-green-deep)]"
          >
            <Clock className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="font-extrabold">Commande n° {recentTrackedOrder.id}</span> · voir où elle en est</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        )}

        {/* Closed warning */}
        {!shop.is_open && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Boutique actuellement fermée aux commandes</p>
              <p className="mt-0.5 text-sm leading-relaxed text-amber-800">
                {shop.opening_hours?.enabled && !shop.opening_hours.manual_override && hoursRange
                  ? `Plage horaire de prise de commande : ${hoursRange.replace('–', ' à ')}. Les commandes reprendront automatiquement dès l'ouverture.`
                  : 'La boutique est fermée aux commandes pour le moment. Contactez le commerçant pour connaître les prochaines disponibilités.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0">
        <details className="mb-3 rounded-2xl border border-[#ded8ce] bg-white shadow-sm sm:mb-5">
          <summary className="cursor-pointer list-none px-4 py-3.5 sm:p-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 text-[15px] font-black text-[var(--mt-gray-900)] sm:text-lg">Comment commander ?</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-bold text-[var(--mt-green-deep)]">3 étapes<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></span>
            </span>
          </summary>
          <div className="mx-4 mb-3.5 border-t border-[#eee8dc] pt-3 sm:mx-5 sm:mb-5">
          <div className="grid auto-rows-fr gap-2 sm:grid-cols-3 sm:gap-3">
            {[
              { number: '01', title: 'Choisissez vos articles', description: 'Ajoutez vos envies au panier.' },
              { number: '02', title: 'Écrivez à la boutique', description: 'Envoyez votre récapitulatif sur WhatsApp.' },
              { number: '03', title: 'Convenez avec le commerçant', description: 'Confirmez ensemble la disponibilité et la remise.' },
            ].map((step) => (
              <div key={step.number} className="flex min-h-24 items-center gap-3 rounded-xl bg-[#f8f3ec] p-3 sm:min-h-28 sm:items-start sm:p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d1fae5] text-xs font-black text-[var(--mt-green-deep)]">{step.number}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-[var(--mt-gray-900)]">{step.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--mt-gray-600)]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm leading-5 text-[var(--mt-gray-600)]">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mt-green-hover)]" />
            Votre commande est une demande : le commerçant confirme la disponibilité et le montant final.
          </p>
          </div>
        </details>
        <span id="store-catalogue" className="block scroll-mt-24" aria-hidden="true" />
        {/* Catalog Section Header */}
        <div className="mb-3 hidden flex-col items-start justify-between gap-2 border-b border-[#ded8ce] pb-3 sm:flex sm:flex-row sm:items-end sm:mb-4 sm:pb-4">
          <div className="relative min-w-0 pl-4">
            <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-[var(--mt-orange-deep)]" />
            <p className="text-xs font-extrabold text-[#8c5a36]">{categoryDefaults.label} <span className="px-1 text-[#c5b6a3]">/</span> La sélection</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-[var(--mt-gray-900)] sm:text-3xl">À découvrir</h2>
              <span className="rounded-full bg-[#eee9df] px-3 py-1 text-xs font-bold text-[var(--mt-gray-600)]">{products.length} {shop.category === 'food' || /rest/i.test(shop.category || '') ? 'plat' : 'article'}{products.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button type="button" onClick={() => setTrustTarget({ type: 'shop', id: shop.id, name: shop.name })} className="hidden min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#c8dbd0] bg-white px-3 text-xs font-bold text-[var(--mt-green-deep)] transition hover:bg-[#d1fae5] sm:inline-flex">
            <Star className="h-3.5 w-3.5" aria-hidden="true" />Avis boutique
          </button>
        </div>

        {/* Search Bar & Category Filter */}
        {(products.length > 4 || categories.length > 1) && (
        <div className="sticky top-[var(--storefront-header-h,4rem)] z-30 -mx-4 mb-3 flex flex-col gap-2 border-y border-[#ded8ce] bg-[#faf8f3]/95 px-4 py-2 shadow-sm backdrop-blur-md sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
          {products.length > 4 && <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Rechercher dans le catalogue de ${shop.name}`}
              placeholder="Rechercher..."
              className="w-full rounded-full border border-[#ded8ce] bg-[var(--mt-surface)] py-2.5 pl-10 pr-9 text-sm font-medium shadow-[0_4px_14px_rgba(33,23,18,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--mt-orange-deep)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>}

          {categories.length > 1 && (
            <div role="tablist" aria-label="Filtrer les produits par catégorie" className="flex w-full min-w-0 gap-1 overflow-x-auto rounded-full bg-[#e8e2d6] p-1 [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden">
              {['all', ...categories].map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(category)}
                    className={`min-h-10 flex-1 whitespace-nowrap rounded-full px-4 text-sm font-extrabold transition ${active ? 'bg-white text-[var(--mt-green-deep)] shadow-sm' : 'text-[var(--mt-gray-600)] hover:text-[var(--mt-gray-900)]'}`}
                  >
                    {category === 'all' ? 'Tout' : category}
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
        {hasAgeRestrictedProducts && !ageVerified && typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            <m.div
              key="age-gate"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: isAgeGateClosing ? 0 : 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : MOTION_SECONDS.deliberate, ease: MOTION_EASE }}
              className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[rgba(10,28,22,0.42)] p-4 backdrop-blur-[8px]"
            >
              <m.section
                initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
                animate={isAgeGateClosing ? { opacity: 0, y: -18, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : MOTION_SECONDS.deliberate, ease: MOTION_EASE }}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="age-gate-title"
                aria-describedby="age-gate-question"
                tabIndex={-1}
                ref={ageDialogRef}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    return;
                  }
                  if (event.key !== 'Tab') return;

                  const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), a[href], summary',
                  );
                  const first = focusable[0];
                  const last = focusable[focusable.length - 1];
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                  }
                }}
                className="age-verification-dialog relative w-full max-w-[420px] rounded-[28px] bg-white px-6 pb-6 pt-8 text-center text-[#12362d] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.55)] focus:outline-none sm:px-7"
              >
                <div className="relative mx-auto mb-[18px] grid h-[68px] w-[68px] place-items-center rounded-full bg-[#0f2e26] text-[22px] font-extrabold text-white">
                  <AnimatePresence mode="wait" initial={false}>
                    {ageConfirmationComplete ? (
                      <m.span
                        key="age-confirmed"
                        initial={prefersReducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute grid place-items-center text-[#7fe3bf]"
                        aria-label="Accès autorisé"
                      >
                        <CheckCircle2 className="h-[30px] w-[30px]" aria-hidden="true" />
                      </m.span>
                    ) : (
                      <m.span key="age-label" exit={{ opacity: 0 }}>
                        18+
                      </m.span>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {ageDenied ? (
                    <m.div
                      key="age-denied"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: prefersReducedMotion ? 0 : MOTION_SECONDS.deliberate, ease: MOTION_EASE }}
                    >
                      <h2 id="age-gate-title" className="mb-2 text-[22px] font-bold leading-tight tracking-[-0.015em]">
                        Merci pour votre réponse
                      </h2>
                      <p id="age-gate-question" className="mb-[22px] text-base leading-6 text-[#5d6f69]">
                        Cette sélection n’est pas accessible aux moins de 18 ans. Vous pouvez continuer à explorer les autres boutiques.
                      </p>
                      <m.a
                        ref={ageExitButtonRef}
                        href="/"
                        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--mt-green-hover)] px-4 text-base font-semibold text-white shadow-[0_14px_26px_-14px_rgba(23,107,85,0.8)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--mt-green-hover)]"
                      >
                        Voir les autres boutiques
                      </m.a>
                      <p className="mt-4 text-[13px] text-[#5d6f69]">
                        L’accès à cette sélection reste fermé pendant cette visite.
                      </p>
                    </m.div>
                  ) : (
                    <m.div
                      key="age-question"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: prefersReducedMotion ? 0 : MOTION_SECONDS.deliberate, ease: MOTION_EASE }}
                    >
                      <h2 id="age-gate-title" className="mb-1.5 text-[22px] font-bold leading-tight tracking-[-0.015em]">
                        Cette sélection est réservée aux adultes
                      </h2>
                      <p id="age-gate-question" className="mb-[22px] text-base text-[#5d6f69]">
                        Saisissez votre date de naissance pour confirmer que vous avez 18 ans ou plus.
                      </p>

                      <label className="mb-4 block text-left text-sm font-semibold text-[#47534b]">
                        Date de naissance
                        <input
                          type="date"
                          required
                          max={new Date().toISOString().slice(0, 10)}
                          value={birthDate}
                          onChange={(event) => setBirthDate(event.target.value)}
                          className="mt-1.5 min-h-12 w-full rounded-xl border border-[#deded5] bg-white px-4 py-3 text-base font-normal text-[#292d2a] outline-none focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/10"
                        />
                      </label>
                      <p className="mb-4 text-xs leading-5 text-[#6b746f]">La date sert uniquement à calculer l’âge et n’est pas enregistrée.</p>

                      {ageVerificationError && (
                        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                          {ageVerificationError}
                        </p>
                      )}

                      <m.button
                        type="button"
                        onClick={() => void handleAgeVerification()}
                        disabled={isVerifyingAge || ageConfirmationComplete}
                        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-[var(--mt-green-hover)] px-4 text-[17px] font-semibold text-white shadow-[0_14px_26px_-14px_rgba(23,107,85,0.8)] transition-colors hover:bg-[#145d4a] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--mt-green-hover)] disabled:cursor-wait disabled:opacity-80"
                      >
                        {isVerifyingAge ? 'Vérification en cours…' : ageConfirmationComplete ? 'Accès autorisé' : 'Vérifier mon âge'}
                      </m.button>
                      <m.button
                        type="button"
                        onClick={() => setAgeDenied(true)}
                        disabled={isVerifyingAge || ageConfirmationComplete}
                        whileHover={prefersReducedMotion ? undefined : { backgroundColor: 'rgba(127,127,127,0.08)' }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="mt-2.5 flex h-14 w-full items-center justify-center rounded-2xl border-[1.5px] border-[#e2e6e3] bg-transparent px-4 text-[17px] font-semibold text-[#12362d] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--mt-green-hover)] disabled:cursor-wait disabled:opacity-60"
                      >
                        Non, j’ai moins de 18 ans
                      </m.button>

                      <details className="mt-4 text-left text-sm text-[#5d6f69]">
                        <summary className="cursor-pointer list-none text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mt-green-hover)]">
                          Pourquoi cette question ?
                        </summary>
                        <p className="mt-2.5 leading-[1.5]">
                          Certains articles de cette boutique sont interdits aux mineurs. Votre réponse n’est pas enregistrée dans votre compte. Une pièce d’identité peut être demandée pour vérifier votre majorité.
                        </p>
                      </details>
                    </m.div>
                  )}
                </AnimatePresence>
              </m.section>
            </m.div>
          </AnimatePresence>,
          document.body,
        )}
        {products.length === 0 && !hasAgeRestrictedProducts ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center sm:py-14">
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-black text-slate-900">La sélection arrive bientôt</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Cette boutique prépare son catalogue. Vous pouvez contacter le commerçant pour connaître les articles disponibles.</p>
            <a href={`https://wa.me/${shop.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour, je souhaite connaître les articles disponibles chez ${shop.name}.`)}`} target="_blank" rel="noreferrer" onClick={() => trackWhatsAppClick(shop.id, 'catalog')} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ backgroundColor: primaryColor }}><Phone className="h-4 w-4" />Demander le catalogue</a>
          </div>
        ) : filteredProducts.length === 0 ? (
          hasAgeRestrictedProducts && !ageVerified ? null : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-800 font-bold text-sm">Aucun article ne correspond à votre recherche.</p>
            <p className="mt-1 text-sm text-slate-500">Modifiez vos mots-clés ou sélectionnez une autre catégorie.</p>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
            >
              Afficher tout le catalogue
            </button>
          </div>
          )
        ) : (
          <div className={filteredProducts.length === 1
            ? 'mx-auto grid w-full max-w-md grid-cols-1 gap-2.5 sm:gap-4'
            : 'grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4'
          }>
            <AnimatePresence initial={false} mode="popLayout">
            {filteredProducts.map((product) => {
              const activeModifiers = selectedModifiers[product.id] || [];
              const cartIndex = cart.findIndex((item) => item.product.id === product.id);
              return (
                <MotionGridItem id={`product-${product.id}`} key={product.id} count={filteredProducts.length} data-analytics-product-id={product.id} className="min-w-0 scroll-mt-24">
                  <CustomerProductCard
                    product={product}
                    category={shop.category}
                    categoryDefaults={categoryDefaults}
                    isShopOpen={shop.is_open}
                    layoutStyle={layoutStyle}
                    compact={isCompactViewport}
                    openOnArrival={requestedProductId === product.id}
                    onOpenedOnArrival={() => setRequestedProductId(null)}
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
                    isLikePending={pendingLikeProductIds.has(product.id)}
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
                    onAddToCart={() => { reportProductClick(product.id); trackCartEvent('add_to_cart', shop.id, product.id, 1, totalCartCount + 1); addToCart(product); }}
                    onDecreaseQuantity={() => { if (cartIndex > -1) { updateQuantity(cartIndex, -1); trackCartEvent('remove_from_cart', shop.id, product.id, 1, Math.max(0, totalCartCount - 1)); } }}
                  />
                </MotionGridItem>
              );
            })}
            </AnimatePresence>
          </div>
        )}


        <details className="mt-6 rounded-2xl border border-[#ded8ce] bg-[var(--mt-surface)] px-4 py-3 shadow-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0"><p className="text-xs font-bold text-slate-500">Informations pratiques</p><h3 className="mt-0.5 text-sm font-black text-slate-900">Horaires, remise & contact</h3></div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          </summary>
          {hoursSummary && <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock className="h-3.5 w-3.5 text-[var(--mt-green-primary)]" />Horaires</span><span className="text-right text-sm font-black text-slate-800">{hoursSummary}</span></div>}
          {shop.theme_config?.social_links && Object.values(shop.theme_config.social_links).some(Boolean) &&           <div className="mt-3 flex flex-wrap gap-2 border-b border-[#e5d9ca] pb-3">{shop.theme_config.social_links.instagram && <a href={shop.theme_config.social_links.instagram} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">Instagram</a>}{shop.theme_config.social_links.facebook && <a href={shop.theme_config.social_links.facebook} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">Facebook</a>}{shop.theme_config.social_links.website && <a href={shop.theme_config.social_links.website} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">Site web</a>}{shop.theme_config.social_links.whatsapp && <a href={shop.theme_config.social_links.whatsapp} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700">WhatsApp</a>}</div>}
        </details>
        </div>

        <aside aria-label="Récapitulatif de la commande" className="hidden xl:block">
          <div className="sticky top-24 rounded-2xl border border-[#ded8ce] bg-[var(--mt-surface)] p-4 shadow-[0_12px_32px_rgba(33,23,18,0.08)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e5d9ca] pb-3">
              <div>
                <p className="text-xs font-bold text-[#8c5a36]">Votre sélection</p>
                <h2 className="mt-1 text-base font-black text-[var(--mt-gray-900)]">Ma commande</h2>
              </div>
              <span className="rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-black text-[var(--mt-green-deep)]">{totalCartCount}</span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="mx-auto h-8 w-8 text-[#c5b6a3]" />
                <p className="mt-2 text-sm font-bold text-[#47534b]">Votre panier est vide</p>
                <p className="mt-1 text-sm leading-5 text-[var(--mt-gray-600)]">Ajoutez des articles pour préparer votre commande.</p>
              </div>
            ) : (
              <>
                <ul className="my-3 max-h-[45vh] space-y-3 overflow-y-auto">
                  {cart.map((item, index) => (
                    <li key={`${item.product.id}-${index}`} className="flex items-start gap-2.5">
                      <CategoryProductImage
                        imageUrl={item.product.image_url}
                        category={shop.category}
                        title={item.product.title}
                        sizes="48px"
                        className="h-12 w-12 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-[var(--mt-gray-900)]">{item.product.title}</p>
                        <p className="mt-0.5 text-sm text-[var(--mt-gray-600)]">{formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers))}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button type="button" onClick={() => updateQuantity(index, -1)} aria-label={`Retirer un ${item.product.title}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ded8ce] bg-white text-[#47534b] hover:bg-[#f8f3ec]"><Minus className="h-3 w-3" /></button>
                          <span className="min-w-4 text-center text-xs font-black tabular-nums text-[var(--mt-gray-900)]">{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(index, 1)} disabled={item.quantity >= item.product.stock} aria-label={`Ajouter un ${item.product.title}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ded8ce] bg-white text-[#47534b] hover:bg-[#f8f3ec] disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <span className="shrink-0 text-right text-xs font-black text-[var(--mt-gray-900)]">{formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-[#e5d9ca] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-[#47534b]">Total des articles</span>
                    <span className="text-base font-black text-[var(--mt-gray-900)]">{formatFCFA(totalCartAmount)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[var(--mt-gray-600)]">
                    Le montant affiché concerne les articles. La boutique confirme la commande et les modalités de règlement.
                  </p>
                  <button type="button" onClick={() => setIsCartOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-4 text-sm font-black text-white transition hover:bg-[var(--mt-green-hover)]">
                    Préparer ma commande <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
        </div>

      </main>

      {totalCartCount === 0 && !isCartOpen && <InstallAppPrompt shopName={shop.name} />}

      {/* 4. FLOATING BOTTOM BAR (Cart Summary) */}
      {totalCartCount > 0 && !isCartOpen && (
        createPortal(<div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-lg px-4 xl:hidden">
          <button
            id="floating-cart-btn"
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label={`Voir le panier : ${totalCartCount} article${totalCartCount > 1 ? 's' : ''}, ${formatFCFA(totalCartAmount)}`}
            className="mt-sheet-enter flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-[var(--mt-green-deep)] py-2.5 pl-2.5 pr-2.5 text-white shadow-[0_14px_30px_-10px_rgba(16,62,50,0.7)] transition-transform active:scale-[0.98]"
            style={glowStyle}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-black text-white" style={{ backgroundColor: primaryColor }}>
                {totalCartCount}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold text-white/70">{totalCartCount > 1 ? `${totalCartCount} articles` : '1 article'}</span>
                <span className="block truncate text-lg font-black tabular-nums">{formatFCFA(totalCartAmount)}</span>
              </span>
            </span>
            <span className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-extrabold text-[var(--mt-green-deep)]">
              Voir le panier
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        </div>, document.body)
      )}

      {/* 5. CHECKOUT DRAWER / MODAL */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
        {isCartOpen && <m.div key="checkout" exit={prefersReducedMotion ? undefined : { opacity: 0, pointerEvents: 'none' }} transition={motionStandard} className="mt-fade-enter fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCartOpen(false); }}>
          <m.div
            exit={prefersReducedMotion ? undefined : { y: 32 }}
            transition={motionStandard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-dialog-title"
            className="bg-[#FFFDF9] w-full sm:max-w-lg rounded-t-[1.75rem] sm:rounded-3xl max-h-[92dvh] flex flex-col shadow-[0_-12px_40px_rgba(34,32,27,0.22)] overflow-hidden mt-drawer-enter"
          >
            {/* Modal Header */}
            <div className="relative px-4 pb-3 pt-4 sm:p-5 border-b border-[#EDE4D6] bg-[#FFFDF9] flex items-center justify-between">
              <div aria-hidden="true" className="absolute left-1/2 top-1.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-slate-300 sm:hidden" />
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: primaryColor }}
                >
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="checkout-dialog-title" className="font-black text-slate-900 text-base">{orderSuccess ? 'Demande envoyée' : 'Finaliser ma commande'}</h3>
                    <ContextualHelp label="Finaliser ma commande">
                      Votre demande ne vaut pas paiement. La boutique doit confirmer la commande ; contactez-la pour convenir de la remise et du règlement.
                    </ContextualHelp>
                  </div>
                  <p className="text-xs text-slate-500">{totalCartCount === 0 ? 'Panier vide' : `${totalCartCount} article${totalCartCount > 1 ? 's' : ''} · ${formatFCFA(totalCartAmount)}`}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Fermer le récapitulatif de commande"
                className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5">
              {orderSuccess ? (
                /* ORDER SUCCESS SCREEN WITH DIRECT WHATSAPP LAUNCH */
                <div className="text-center py-6">
                  <div className="success-mark w-16 h-16 bg-[#E3F1EA] text-[var(--mt-green-primary)] rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-[#F4F8F5]">
                    <SuccessCheck />
                  </div>
                  <h4 className="text-xl font-extrabold text-[var(--mt-green-deep)]">
                    Demande n° {orderSuccess.orderId} enregistrée
                  </h4>
                  <p className="mx-auto mb-5 mt-2 max-w-sm text-sm leading-6 text-slate-600">
                    Vos articles sont réservés 2 h, le temps que la boutique accepte votre demande. Envoyez-lui votre récapitulatif sur WhatsApp pour convenir de la remise et du règlement.
                  </p>
                  {orderSuccess.emailReceiptStatus !== 'not_requested' && (
                    <p
                      role={orderSuccess.emailReceiptStatus === 'sent' ? 'status' : 'alert'}
                      className={`mx-auto mb-4 max-w-sm rounded-xl border p-3 text-left text-xs leading-5 ${
                        orderSuccess.emailReceiptStatus === 'sent'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-amber-200 bg-amber-50 text-amber-950'
                      }`}
                    >
                      {orderSuccess.emailReceiptStatus === 'sent'
                        ? `Le récapitulatif a été envoyé à ${orderSuccess.emailReceiptAddress}.`
                        : `La demande est enregistrée, mais l’envoi du récapitulatif à ${orderSuccess.emailReceiptAddress} a échoué. Vous pouvez toujours utiliser WhatsApp.`}
                    </p>
                  )}
                  <a
                    href={orderSuccess.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      trackWhatsAppClick(shop.id, 'order');
                      if (orderSuccess.whatsappTrackingToken) {
                        void fetch(`/api/orders/${orderSuccess.orderId}/whatsapp-click`, {
                          method: 'POST',
                          keepalive: true,
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token: orderSuccess.whatsappTrackingToken }),
                        }).catch(() => undefined);
                      }
                    }}
                    className="w-full min-h-14 py-3.5 px-6 rounded-2xl bg-[#128C4B] hover:bg-[#0f7a41] text-white font-black text-base shadow-[0_10px_24px_-10px_rgba(18,140,75,0.8)] flex items-center justify-center gap-3 transition-[background-color,box-shadow,transform] active:scale-[0.98]"
                  >
                    <Phone className="w-5 h-5 fill-white" />
                    <span>Envoyer le récapitulatif sur WhatsApp</span>
                  </a>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    La boutique voit que vous avez ouvert WhatsApp, pas si le message est parti.
                  </p>
                  {orderSuccess.whatsappTrackingToken && (
                    <Link
                      to={trackingPath({ id: orderSuccess.orderId, token: orderSuccess.whatsappTrackingToken })}
                      className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#cfe3d8] bg-white px-4 text-sm font-extrabold text-[var(--mt-green-deep)]"
                    >
                      Suivre ma commande
                    </Link>
                  )}

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
                    className="mt-3 min-h-11 px-3 text-sm text-slate-700 hover:text-slate-900 font-semibold underline underline-offset-4"
                  >
                    {messageCopied ? 'Message copié' : 'Copier le message si WhatsApp ne s’ouvre pas'}
                  </button>

                  <button
                    onClick={() => {
                      setCart([]);
                      setOrderSuccess(null);
                      setIsCartOpen(false);
                    }}
                    type="button"
                    className="mt-1 block w-full min-h-11 text-sm text-slate-500 hover:text-slate-800 font-semibold"
                  >
                    Retour au catalogue
                  </button>
                </div>
              ) : cart.length === 0 ? (
                <div className="py-10 text-center">
                  <ShoppingBag className="mx-auto h-10 w-10 text-[var(--mt-green-primary)]" aria-hidden="true" />
                  <h4 className="mt-3 text-lg font-extrabold text-slate-900">Votre panier est vide</h4>
                  <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-600">Ajoutez un article pour préparer votre demande.</p>
                  <button type="button" onClick={() => setIsCartOpen(false)} className="mt-5 min-h-12 rounded-2xl bg-[var(--mt-green-deep)] px-6 text-sm font-extrabold text-white">
                    Retour au catalogue
                  </button>
                </div>
              ) : (
                <>
                  {/* Selected items list */}
                  <div className="space-y-2.5">
                    <h4 className="text-sm font-extrabold text-slate-900">Votre panier</h4>
                    <AnimatePresence initial={false} mode="popLayout">
                    {cart.map((item, idx) => (
                      <m.div
                        key={getCartItemKey(item)}
                        layout={prefersReducedMotion ? false : 'position'}
                        animate={{ opacity: 1, x: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, x: -24 }}
                        transition={motionStandard}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#F8F3EC] border border-[#E4D9C8]"
                      >
                        <CategoryProductImage
                          imageUrl={item.product.image_url}
                          category={shop.category}
                          title={item.product.title}
                          sizes="48px"
                          className="h-12 w-12 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-bold text-sm leading-5 text-slate-900">
                            {item.product.title}
                          </p>
                          <div className="flex flex-wrap gap-1 text-sm text-slate-500">
                            {item.selected_size && (
                              <span className="text-slate-600">Taille {item.selected_size}</span>
                            )}
                            {item.selected_size && item.selected_color && <span aria-hidden="true" className="text-slate-400">·</span>}
                            {item.selected_color && (
                              <span className="text-slate-600">{item.selected_color}</span>
                            )}
                            {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                              <span className="text-amber-700">+{item.selected_modifiers.join(', ')}</span>
                            )}
                          </div>
                          <span className="mt-0.5 block text-sm font-black tabular-nums text-slate-900">
                            {formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers) * item.quantity)}
                            {item.quantity > 1 && <span className="ml-1 text-xs font-semibold text-slate-500">({formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers))} l’unité)</span>}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, -1)}
                            aria-label={`Diminuer la quantité de ${item.product.title}`}
                            className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="min-w-6 text-center font-extrabold text-sm tabular-nums text-slate-900" aria-live="polite"><m.span key={item.quantity} initial={prefersReducedMotion ? false : { scale: 0.7 }} animate={{ scale: 1 }} transition={motionFast} className="inline-block">{item.quantity}</m.span></span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, 1)}
                            disabled={item.quantity >= item.product.stock}
                            aria-label={`Augmenter la quantité de ${item.product.title}`}
                            className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 disabled:opacity-30"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </m.div>
                    ))}
                    </AnimatePresence>
                  </div>

                  {authenticatedCustomer && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-emerald-800">Connecté en tant que</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{authenticatedCustomer.name}</p>
                          <p className="text-sm text-slate-600">{authenticatedCustomer.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCheckoutAuth(true)}
                          className="rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-700"
                        >
                          Changer
                        </button>
                      </div>
                    </div>
                  )}

                  {!authenticatedCustomer && !showCheckoutAuth && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm text-slate-600">
                        Vous pouvez commander sans compte. Connectez-vous si vous souhaitez retrouver cette commande dans votre historique.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCheckoutAuth(true)}
                        className="mt-2 text-xs font-bold text-[var(--mt-green-hover)] underline underline-offset-2"
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
                    <h4 className="text-sm font-extrabold text-slate-900">Vos coordonnées</h4>

                    <TextField
                      id="checkout-customer-name"
                      label="Nom complet"
                      required
                      autoComplete="name"
                      placeholder="Ex. : Fatou Traoré"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />

                    <PhoneField
                      id="checkout-customer-phone"
                      label="Numéro WhatsApp"
                      required
                      hint="La boutique vous répondra sur ce numéro."
                      value={customerPhone}
                      onValueChange={setCustomerPhone}
                    />

                    <details className="rounded-xl border border-[#E4D9C8] bg-white p-3">
                      <summary className="cursor-pointer text-sm font-bold text-slate-700">Recevoir le récapitulatif par e-mail (facultatif)</summary>
                      <div className="mt-3 space-y-3">
                        {authenticatedCustomer ? (
                          <p className="rounded-lg border border-[#E4EDE8] bg-[#F4F8F5] px-3 py-2 text-sm leading-5 text-[#47534b]">
                            Le récapitulatif de commande sera envoyé à l’adresse de votre compte : <strong>{authenticatedCustomer.email}</strong>.
                          </p>
                        ) : (
                          <TextField
                            id="checkout-customer-email"
                            label="Adresse e-mail"
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                            placeholder="vous@exemple.ci"
                            value={customerEmail}
                            onChange={(event) => setCustomerEmail(event.target.value)}
                            hint="Utilisée uniquement pour vous envoyer le récapitulatif de cette commande."
                          />
                        )}
                      </div>
                    </details>

                    {/* Payment method */}
                    <div>
                    <h4 className="mb-2 text-sm font-extrabold text-slate-900">Comment souhaitez-vous régler ?</h4>
                    <div role="radiogroup" aria-label="Mode de règlement souhaité" className="grid grid-cols-2 gap-2">
                      {paymentPreferenceOptions.map((option) => {
                        const PaymentIcon = paymentMethodIcons[option.id];
                        return (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={paymentMethod === option.id}
                          onClick={() => setPaymentMethod(option.id)}
                          className={`min-h-14 rounded-xl border p-2 text-center font-bold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                            paymentMethod === option.id
                              ? 'bg-[var(--mt-green-deep)] border-[var(--mt-green-deep)] text-white shadow-sm'
                              : 'bg-white border-[#E4D9C8] text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <PaymentIcon className="mx-auto mb-0.5 h-4 w-4" aria-hidden />
                          <span>{option.label}</span>
                        </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-sm leading-5 text-slate-600">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <span>{paymentPreferenceOptions.find((option) => option.id === paymentMethod)?.explanation} Aucun paiement n’est effectué sur MaTable.</span>
                    </p>
                    </div>

                    {/* Total & Submit Button */}
                    {/* Le total et l’envoi restent visibles en bas du tiroir pendant la saisie. */}
                    <div className="sticky bottom-[-1rem] z-10 -mx-4 border-t border-[#EDE4D6] bg-[#FFFDF9]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:bottom-[-1.25rem] sm:-mx-5 sm:px-5">
                      <div className="mb-3 flex items-baseline justify-between">
                        <span className="text-sm font-bold text-slate-700">Total</span>
                        <span className="text-xl font-black tabular-nums text-slate-900">
                          <AnimatedNumber>{formatFCFA(totalCartAmount)}</AnimatedNumber>
                        </span>
                      </div>

                      <m.button
                        id="submit-order-whatsapp-btn"
                        type="submit"
                        disabled={isSubmitting || !shop.is_open}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        transition={{ duration: MOTION_SECONDS.fast }}
                        className="w-full min-h-14 py-3.5 px-6 rounded-2xl bg-[#128C4B] hover:bg-[#0f7a41] text-white font-black text-base shadow-[0_10px_24px_-10px_rgba(18,140,75,0.8)] flex items-center justify-center gap-2.5 transition-[background-color,box-shadow,transform,opacity] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Phone className="w-5 h-5 fill-white" />
                        <span>{isSubmitting ? 'Préparation...' : 'Envoyer sur WhatsApp'}</span>
                      </m.button>
                      <p className="mt-2 text-center text-xs leading-5 text-slate-500">
                        Vos articles sont réservés 2 h. La boutique confirme ensuite avec vous sur WhatsApp.
                      </p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </m.div>
        </m.div>}
        </AnimatePresence>, document.body)}
      {trustTarget && (
        <CustomerTrustPanel
          targetType={trustTarget.type}
          targetId={trustTarget.id}
          targetName={trustTarget.name}
          isAuthenticated={Boolean(customerUser)}
          onClose={() => setTrustTarget(null)}
        />
      )}
    </div>
  );
};