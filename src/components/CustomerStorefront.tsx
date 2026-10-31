import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { 
  ShoppingBag, 
  Bookmark,
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
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { Order, Shop, Product } from '../types';
import { formatFCFA, generateWhatsAppOrderReceipt, getProductUnitPrice } from '../utils/format';
import { getContrastTextColor, normalizeHex } from '../utils/color';
import { getDefaultSelectedModifiers } from '../utils/cart';
import { getBannerImageForDisplay, getCategoryDefaults, getProductImageForDisplay, getWelcomeMessageForDisplay } from '../utils/categoryDefaults';
import { CategoryProductImage } from './CategoryProductImage';
import { CustomerProductCard } from './CustomerProductCard';
import { useToast } from './Toast';
import { hasAnalyticsConsent } from '../utils/cookieConsent';
import { ABIDJAN_COMMUNES } from '../utils/abidjanCommunes';
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
import { CustomerUser } from './CustomerAuth';
import { CustomerCheckoutAuth } from './CustomerCheckoutAuth';
import { CustomerTrustPanel } from './CustomerTrustPanel';
import { getCanonicalOrigin } from '../utils/seoCanonical';
import { getActiveProductPrice } from '../utils/productPricing';
import { normalizeShopEventType, SHOP_EVENT_VISUALS } from '../utils/shopEventVisuals';
import { useCustomerCart } from './useCustomerCart';
import { isAgeRestrictedProduct } from '../utils/ageRestrictedProducts';

interface CustomerStorefrontProps {
  shopSlug: string;
  onSelectShop?: (slug: string) => void;
  customerUser?: CustomerUser | null;
  onCustomerAuthenticated?: (user: CustomerUser) => void;
}

const paymentPreferenceOptions: {
  id: Order['payment_method_preference'];
  label: string;
  icon: string;
  explanation: string;
}[] = [
  { id: 'wave', label: 'Wave', icon: '🌊', explanation: 'Vous réglerez directement au vendeur après confirmation de la commande.' },
  { id: 'mobile_money', label: 'Mobile Money', icon: '📱', explanation: 'Convenez avec la boutique de l’opérateur et du paiement après confirmation.' },
  { id: 'cash', label: 'Espèces', icon: '💵', explanation: 'Le paiement en espèces sera à convenir avec la boutique, au retrait ou à la remise.' },
  { id: 'to_confirm', label: 'À convenir', icon: '💬', explanation: 'Vous choisirez le mode de règlement avec la boutique sur WhatsApp.' },
];

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({ shopSlug, customerUser, onCustomerAuthenticated }) => {
  const toast = useToast();
  const prefersReducedMotion = useReducedMotion();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [saleRefresh, setSaleRefresh] = useState(Date.now());
  const [hasAgeRestrictedProducts, setHasAgeRestrictedProducts] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageDenied, setAgeDenied] = useState(false);
  const [ageConfirmationComplete, setAgeConfirmationComplete] = useState(false);
  const [isAgeGateClosing, setIsAgeGateClosing] = useState(false);
  const [ageVerificationError, setAgeVerificationError] = useState('');
  const [isVerifyingAge, setIsVerifyingAge] = useState(false);
  const ageDialogRef = useRef<HTMLElement>(null);
  const ageExitButtonRef = useRef<HTMLAnchorElement>(null);
  const ageConfirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<number>>(new Set());
  const [likedProductIds, setLikedProductIds] = useState<Set<number>>(new Set());
  const [pendingLikeProductIds, setPendingLikeProductIds] = useState<Set<number>>(new Set());
  const pendingLikeRequests = useRef(new Set<number>());
  const [isFavoriteShop, setIsFavoriteShop] = useState(false);
  const [loading, setLoading] = useState(true);
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
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [customLocation, setCustomLocation] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('Dès que prêt (30-45 min)');
  const [deliveryOptions, setDeliveryOptions] = useState<{
    available: boolean;
    originZone: string | null;
    zones: { id: number; label: string; amount: number }[];
  } | null>(null);
  const [deliveryZoneId, setDeliveryZoneId] = useState<number | null>(null);
  const [deliveryOptionsLoading, setDeliveryOptionsLoading] = useState(false);
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
    deliveryFee: number;
    deliveryTicket: string | null;
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

  useEffect(() => {
    if (!shop?.id || !isCartOpen) return;
    let cancelled = false;
    setDeliveryOptionsLoading(true);
    fetch(`/api/shops/${shop.id}/delivery-options`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setDeliveryOptions(null);
          return;
        }
        const data = await response.json() as {
          available?: boolean;
          origin_zone?: string | null;
          zones?: { id: number; label: string; amount: number }[];
        };
        const zones = Array.isArray(data.zones)
          ? data.zones.filter((zone) => Number.isSafeInteger(zone.id) && Number.isFinite(zone.amount))
          : [];
        if (cancelled) return;
        setDeliveryOptions({
          available: Boolean(data.available) && zones.length > 0,
          originZone: typeof data.origin_zone === 'string' ? data.origin_zone : null,
          zones,
        });
        setDeliveryZoneId((current) => zones.some((zone) => zone.id === current) ? current : null);
      })
      .catch(() => {
        if (!cancelled) setDeliveryOptions(null);
      })
      .finally(() => {
        if (!cancelled) setDeliveryOptionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [shop?.id, isCartOpen]);

  const selectedDeliveryOption = deliveryOptions?.zones.find((zone) => zone.id === deliveryZoneId) || null;
  const deliveryFee = selectedDeliveryOption ? Number(selectedDeliveryOption.amount) : 0;
  const orderTotalDue = totalCartAmount + deliveryFee;

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

  const handleAgeVerification = async () => {
    if (isVerifyingAge) return;
    setAgeVerificationError('');
    setIsVerifyingAge(true);
    try {
      const loaded = await fetchShopData(new AbortController().signal, true);
      if (loaded) {
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
    } finally {
      setIsVerifyingAge(false);
    }
  };

  useEffect(() => () => {
    if (ageConfirmationTimerRef.current) clearTimeout(ageConfirmationTimerRef.current);
  }, []);

  useEffect(() => {
    if (!hasAgeRestrictedProducts || ageVerified) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    ageDialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [hasAgeRestrictedProducts, ageVerified]);

  useEffect(() => {
    if (!hasAgeRestrictedProducts || ageVerified) return;
    if (ageDenied) ageExitButtonRef.current?.focus();
    else ageDialogRef.current?.focus();
  }, [ageDenied, hasAgeRestrictedProducts, ageVerified]);

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

  // Handle WhatsApp Checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || cart.length === 0) return;
    trackCheckoutStart(shop.id, totalCartCount, totalCartAmount);
    if (!ageVerified && cart.some((item) => isAgeRestrictedProduct(item.product))) {
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
    const finalLocation = deliveryLocation === 'Autre'
      ? customLocation.trim()
      : deliveryLocation;

    if (!finalLocation) {
      toast.error(deliveryLocation === 'Autre'
        ? 'Veuillez préciser votre ville ou votre quartier.'
        : 'Veuillez choisir votre commune ou votre quartier.');
      return;
    }

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
          delivery_zone_id: deliveryZoneId ?? undefined,
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
        deliveryFee: Number(data.order.delivery_fee || 0),
        deliveryTicket: data.delivery?.ticket_number ?? null,
      });
      trackOrderCreated(
        shop.id,
        Number(data.order.id),
        totalCartCount,
        Number(data.order.total_amount || totalCartAmount),
        Number(data.order.delivery_fee || 0),
      );
      setMessageCopied(false);
      toast.success(data.delivery
        ? 'Commande enregistrée. Livraison MaTable en attente d’un livreur.'
        : 'Demande enregistrée. Confirmez les modalités directement avec la boutique sur WhatsApp.');

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
      <div className="page-loading-wrap" role="main">
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
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">Indiquez où vous souhaitez récupérer votre commande ou être contacté pour en convenir avec la boutique.</p>
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
      <div className="not-found-page" role="main">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#047857]">Erreur 404</p>
        <h1 className="text-2xl font-black text-slate-900">Cette page n’existe pas</h1>
        <p className="text-sm text-slate-600 mt-2 mb-6">
          La boutique ou l’adresse demandée n’existe pas ou a été déplacée.
        </p>
        <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-[#047857] px-5 py-3 font-bold text-white">Retour aux boutiques</Link>
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
  // Every Abidjan commune, with the shop's own commune first since most buyers order nearby.
  const shopCommune = ABIDJAN_COMMUNES.find((commune) => commune !== 'Autre ville / commune'
    && (shop.city || '').toLowerCase().includes(commune.toLowerCase()));
  const checkoutLocations = [
    ...(shopCommune ? [shopCommune] : []),
    ...ABIDJAN_COMMUNES.filter((commune) => commune !== 'Autre ville / commune' && commune !== shopCommune),
    'Autre',
  ];
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
  const glowStyle = shop.theme_config?.advanced_css?.accentGlow ? { boxShadow: `0 0 20px ${primaryColor}40` } : {};

  const openingHours = shop.opening_hours;
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
      className={`storefront-page min-h-screen transition-colors ${totalCartCount > 0 && !isCartOpen ? 'pb-28 sm:pb-32' : 'pb-8'}`}
      style={{ 
        background: 'linear-gradient(180deg, #faf8f3 0%, #f1eee7 100%)',
        fontFamily: `"${fontFamily}", system-ui, sans-serif`
      }}
    >
      {/* 1. Header & Shop Identity */}
      <header className="bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#ded8ce] sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Link to="/" aria-label="Retour à l’annuaire" title="Retour à l’annuaire" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop.name}
                className="h-11 w-11 rounded-xl object-cover shrink-0 border border-slate-200 bg-white"
              />
            ) : (
              <div 
                className="h-11 w-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0"
                style={{ backgroundColor: primaryColor, color: primaryTextColor }}
              >
                <span aria-hidden="true">{categoryDefaults.icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <h1 className="max-w-full truncate text-sm font-black text-[#292d2a] sm:text-lg">{shop.name}</h1>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`text-[11px] font-semibold sm:text-xs ${shop.is_open ? 'text-[#047857]' : 'text-[#8a5a12]'}`}>
                    {shop.is_open ? 'Ouverte' : 'Fermée'}
                  </span>
                  {shop.merchant_verification_status === 'verified' && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e3f4ea] px-1.5 py-0.5 text-[10px] font-extrabold text-[#065f46]" title="Le commerçant a fait vérifier son identité">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Vérifié
                    </span>
                  )}
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
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-semibold transition sm:w-auto sm:gap-1.5 sm:px-3 ${isFavoriteShop ? 'border-[#c8dbd0] bg-[#d1fae5] text-[#065f46]' : 'border-[#ded8ce] bg-white text-[#47534b] hover:border-[#047857]'}`}
            >
              <Bookmark className={`h-4 w-4 ${isFavoriteShop ? 'fill-current' : ''}`} />
              <span className="hidden sm:inline">{isFavoriteShop ? 'Enregistrée' : 'Enregistrer'}</span>
            </button>
            <button
              id="cart-header-btn"
              onClick={() => totalCartCount > 0 ? setIsCartOpen(true) : document.getElementById('store-catalogue')?.scrollIntoView({ behavior: 'smooth' })}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#065f46] text-sm font-semibold text-white transition hover:bg-[#047857] sm:w-auto sm:gap-2 sm:px-3.5"
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
            <section role="dialog" aria-modal="true" aria-labelledby="shop-switch-title" className="w-full max-w-md rounded-2xl border-2 border-[#292d2a] bg-[#FFFFFF] p-5 shadow-2xl">
              <h2 id="shop-switch-title" className="text-lg font-black text-[#292d2a]">Votre panier appartient à une autre boutique</h2>
              <p className="mt-2 text-sm leading-6 text-[#47534b]">Pour commander chez {shop?.name}, il faut remplacer le panier de « {cartShopSlug} ». Votre commande restera liée à une seule boutique.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPendingShopSwitchProduct(null)} className="min-h-11 rounded-xl border-2 border-[#ded8ce] bg-white px-4 text-sm font-bold text-[#292d2a]">Garder ce panier</button>
                <button type="button" onClick={() => { const product = pendingShopSwitchProduct; setPendingShopSwitchProduct(null); addToCart(product, true); }} className="min-h-11 rounded-xl border-2 border-[#292d2a] bg-[#047857] px-4 text-sm font-bold text-white">Vider et continuer</button>
              </div>
            </section>
          </div>,
          document.body,
        )
      )}

      {bannerUrl && (
        <div className="max-w-6xl mx-auto px-4 pt-3 sm:pt-4">
          <div className="group relative overflow-hidden rounded-[1.35rem] border border-white/70 bg-slate-900 shadow-[0_18px_45px_rgba(33,23,18,0.12)]">
            <div aria-hidden="true" className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: secondaryColor, color: primaryColor }}>
              <span className="text-7xl">{categoryDefaults.icon}</span>
              <span className="text-xs font-black uppercase">{categoryDefaults.label}</span>
            </div>
            <img
              src={bannerUrl}
              alt={`Illustration de la boutique ${shop.name}`}
              className="relative z-10 h-36 w-full object-cover transition-transform duration-700 group-hover:scale-[1.02] sm:h-60 lg:h-64"
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
            <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:p-6">
              <div className="max-w-2xl text-white drop-shadow-sm">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {categoryDefaults.label} <span className="text-white/45">/</span> {shop.city || 'Côte d’Ivoire'}
                </p>
                <p className="mt-1 line-clamp-1 max-w-xl text-xs font-medium leading-5 text-white sm:mt-2 sm:line-clamp-2 sm:text-base sm:leading-6">{getWelcomeMessageForDisplay(shop.welcome_message, shop.category)}</p>
              </div>
              <a href="#store-catalogue" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/70 bg-[#FFFFFF] px-3 py-1.5 text-[11px] font-extrabold text-[#065f46] transition hover:-translate-y-0.5 hover:bg-white sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm">Découvrir la sélection<ArrowRight className="h-4 w-4" /></a>
            </div>
          </div>
        </div>
      )}

      {isEventMode && eventBannerText && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="flex justify-center sm:justify-start">
            <div className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-[9px] font-extrabold shadow-[0_4px_14px_rgba(33,23,18,0.05)] sm:px-4 sm:py-2.5 sm:text-xs ${eventVisual.bannerClass}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base ${eventVisual.badgeClass}`} aria-hidden="true">{eventVisual.icon}</span>
              <span className="min-w-0"><span className="block text-[8px] uppercase tracking-[0.1em] opacity-70 sm:text-[9px]">{eventVisual.label}</span><span className="line-clamp-2">{eventBannerText}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* Main storefront content */}
      <main className="max-w-6xl mx-auto px-4 pt-4">
        <details className="mb-5 rounded-2xl border border-[#ded8ce] bg-[#FFFFFF] px-4 py-3 shadow-[0_8px_24px_rgba(33,23,31,0.05)] sm:p-5">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-black text-[#292d2a] sm:text-lg">Comment commander ?</span>
              <span className="shrink-0 rounded-full bg-[#d1fae5] px-3 py-1.5 text-[10px] font-bold text-[#065f46]">3 étapes</span>
            </span>
          </summary>
          <div className="mt-3 border-t border-[#eee8dc] pt-3">
          <div className="grid auto-rows-fr gap-2 sm:grid-cols-3 sm:gap-3">
            {[
              { number: '01', title: 'Choisissez vos articles', description: 'Ajoutez vos envies au panier.' },
              { number: '02', title: 'Écrivez à la boutique', description: 'Envoyez votre récapitulatif sur WhatsApp.' },
              { number: '03', title: 'Convenez avec le commerçant', description: 'Retrait ou livraison : les modalités et frais sont confirmés avec lui.' },
            ].map((step) => (
              <div key={step.number} className="flex min-h-24 items-center gap-3 rounded-xl bg-[#f8f3ec] p-3 sm:min-h-28 sm:items-start sm:p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d1fae5] text-xs font-black text-[#065f46]">{step.number}</span>
                <div className="min-w-0">
                  <h3 className="text-xs font-black text-[#292d2a]">{step.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#647067]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[#647067]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857]" />
            MaTable met en relation le client et la boutique et peut organiser la livraison dans les zones couvertes, avec des frais affichés au moment de la commande.
          </p>
          </div>
        </details>

        {/* Closed warning */}
        {!shop.is_open && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Boutique actuellement fermée aux commandes</p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                {shop.opening_hours?.enabled && !shop.opening_hours.manual_override && hoursRange
                  ? `Plage horaire de prise de commande : ${hoursRange.replace('–', ' à ')}. Les commandes reprendront automatiquement dès l'ouverture.`
                  : 'La boutique est fermée aux commandes pour le moment. Contactez le commerçant pour connaître les prochaines disponibilités.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="min-w-0">
        {/* Catalog Section Header */}
        <div id="store-catalogue" className="scroll-mt-24 mb-4 flex flex-col items-start justify-between gap-3 border-b border-[#ded8ce] pb-4 sm:flex-row sm:items-end">
          <div className="relative pl-4">
            <span aria-hidden="true" className="absolute bottom-1 left-0 top-1 w-[3px] rounded-full bg-[#c2410c]" />
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#8c5a36]">{categoryDefaults.label} <span className="px-1 text-[#c5b6a3]">/</span> La sélection</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#292d2a] sm:text-3xl">À découvrir</h2>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <span className="rounded-full bg-[#eee9df] px-3 py-1.5 text-[11px] font-bold text-[#647067]">{products.length} {shop.category === 'food' || /rest/i.test(shop.category || '') ? 'plat' : 'article'}{products.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setTrustTarget({ type: 'shop', id: shop.id, name: shop.name })} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#c8dbd0] bg-white px-3 text-[11px] font-bold text-[#065f46] transition hover:bg-[#d1fae5]">
              <span aria-hidden="true">★</span>Avis boutique
            </button>
          </div>
        </div>

        {/* Search Bar & Category Filter */}
        {(products.length > 4 || categories.length > 1) && (
        <div className="sticky top-[3.5rem] z-20 -mx-4 mb-5 flex flex-col gap-3 border-y border-[#ded8ce] bg-[#faf8f3]/95 px-4 py-3 shadow-sm backdrop-blur-md sm:top-[4.25rem] sm:flex-row sm:items-center sm:justify-between">
          {products.length > 4 && <div className="relative w-full sm:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Rechercher dans le catalogue de ${shop.name}`}
              placeholder="Rechercher dans le catalogue..."
              className="w-full rounded-full border border-[#ded8ce] bg-[#FFFFFF] py-2.5 pl-10 pr-9 text-xs font-medium shadow-[0_4px_14px_rgba(33,23,18,0.04)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#047857]"
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
            <label className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-[#ded8ce] bg-[#FFFFFF] px-3 text-xs font-bold text-[#647067] shadow-[0_4px_14px_rgba(33,23,18,0.04)] sm:w-auto">
              <span className="shrink-0">Catégorie</span>
              <select
                aria-label="Filtrer les produits par catégorie"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-2 text-[#292d2a] outline-none sm:w-56 sm:flex-none"
              >
                <option value="all">Toutes les catégories ({products.length})</option>
                {categories.map((category) => {
                  const count = products.filter(product => product.category === category).length;
                  return <option key={category} value={category}>{category} ({count})</option>;
                })}
              </select>
            </label>
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
            <motion.div
              key="age-gate"
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: isAgeGateClosing ? 0 : 1 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.42, ease: 'easeOut' }}
              className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[rgba(10,28,22,0.42)] p-4 backdrop-blur-[8px]"
            >
              <motion.section
                initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
                animate={isAgeGateClosing ? { opacity: 0, y: -18, scale: 0.96 } : { opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
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
                  <motion.span
                    animate={prefersReducedMotion ? undefined : { opacity: [0.7, 0], scale: [0.92, 1.35] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
                    aria-hidden="true"
                    className="absolute -inset-[7px] rounded-full border-2 border-[#047857]"
                  />
                  <AnimatePresence mode="wait" initial={false}>
                    {ageConfirmationComplete ? (
                      <motion.span
                        key="age-confirmed"
                        initial={prefersReducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute grid place-items-center text-[#7fe3bf]"
                        aria-label="Accès autorisé"
                      >
                        <CheckCircle2 className="h-[30px] w-[30px]" aria-hidden="true" />
                      </motion.span>
                    ) : (
                      <motion.span key="age-label" exit={{ opacity: 0 }}>
                        18+
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {ageDenied ? (
                    <motion.div
                      key="age-denied"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
                    >
                      <h2 id="age-gate-title" className="mb-2 text-[22px] font-bold leading-tight tracking-[-0.015em]">
                        Merci pour votre réponse
                      </h2>
                      <p id="age-gate-question" className="mb-[22px] text-base leading-6 text-[#5d6f69]">
                        Cette sélection n’est pas accessible aux moins de 18 ans. Vous pouvez continuer à explorer les autres boutiques.
                      </p>
                      <motion.a
                        ref={ageExitButtonRef}
                        href="/"
                        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#047857] px-4 text-base font-semibold text-white shadow-[0_14px_26px_-14px_rgba(23,107,85,0.8)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#047857]"
                      >
                        Voir les autres boutiques
                      </motion.a>
                      <p className="mt-4 text-[13px] text-[#5d6f69]">
                        L’accès à cette sélection reste fermé pendant cette visite.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="age-question"
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: 'easeOut' }}
                    >
                      <h2 id="age-gate-title" className="mb-1.5 text-[22px] font-bold leading-tight tracking-[-0.015em]">
                        Cette sélection est réservée aux adultes
                      </h2>
                      <p id="age-gate-question" className="mb-[22px] text-base text-[#5d6f69]">
                        Avez-vous 18 ans ou plus ?
                      </p>

                      {ageVerificationError && (
                        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                          {ageVerificationError}
                        </p>
                      )}

                      <motion.button
                        type="button"
                        onClick={() => void handleAgeVerification()}
                        disabled={isVerifyingAge || ageConfirmationComplete}
                        whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-[#047857] px-4 text-[17px] font-semibold text-white shadow-[0_14px_26px_-14px_rgba(23,107,85,0.8)] transition-colors hover:bg-[#145d4a] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#047857] disabled:cursor-wait disabled:opacity-80"
                      >
                        {isVerifyingAge ? 'Vérification en cours…' : ageConfirmationComplete ? 'Accès autorisé' : 'Oui, j’ai 18 ans ou plus'}
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setAgeDenied(true)}
                        disabled={isVerifyingAge || ageConfirmationComplete}
                        whileHover={prefersReducedMotion ? undefined : { backgroundColor: 'rgba(127,127,127,0.08)' }}
                        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                        className="mt-2.5 flex h-14 w-full items-center justify-center rounded-2xl border-[1.5px] border-[#e2e6e3] bg-transparent px-4 text-[17px] font-semibold text-[#12362d] transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#047857] disabled:cursor-wait disabled:opacity-60"
                      >
                        Non, j’ai moins de 18 ans
                      </motion.button>

                      <details className="mt-4 text-left text-sm text-[#5d6f69]">
                        <summary className="cursor-pointer list-none text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#047857]">
                          Pourquoi cette question ?
                        </summary>
                        <p className="mt-2.5 leading-[1.5]">
                          Certains articles de cette boutique sont interdits aux mineurs. Votre réponse n’est pas enregistrée dans votre compte. Une pièce d’identité peut être demandée à la livraison.
                        </p>
                      </details>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            </motion.div>
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
          <div className={filteredProducts.length === 1
            ? 'mx-auto grid w-full max-w-md grid-cols-1 gap-3 sm:gap-4'
            : 'grid grid-cols-2 gap-2 sm:gap-4'
          }>
            {filteredProducts.map((product) => {
              const activeModifiers = selectedModifiers[product.id] || [];
              const cartIndex = cart.findIndex((item) => item.product.id === product.id);
              return (
                <div key={product.id} data-analytics-product-id={product.id} className="min-w-0">
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
                </div>
              );
            })}
          </div>
        )}

        <details className="mt-8 rounded-xl border border-[#ded8ce] bg-[#FFFFFF] px-4 py-3 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase text-slate-500">Informations pratiques</p><h3 className="mt-1 text-sm font-black text-slate-900">Horaires, remise & contact</h3></div>
            {shop.city && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#52645c]"><MapPin className="h-3.5 w-3.5" />{shop.city}</span>}
          </summary>
          {hoursSummary && <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><Clock className="h-3.5 w-3.5 text-[#087F62]" />Horaires</span><span className="text-right text-[11px] font-black text-slate-800">{hoursSummary}</span></div>}
          {shop.theme_config?.social_links && Object.values(shop.theme_config.social_links).some(Boolean) &&           <div className="mt-3 flex flex-wrap gap-2 border-b border-[#e5d9ca] pb-3">{shop.theme_config.social_links.instagram && <a href={shop.theme_config.social_links.instagram} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Instagram</a>}{shop.theme_config.social_links.facebook && <a href={shop.theme_config.social_links.facebook} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Facebook</a>}{shop.theme_config.social_links.website && <a href={shop.theme_config.social_links.website} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Site web</a>}{shop.theme_config.social_links.whatsapp && <a href={shop.theme_config.social_links.whatsapp} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">WhatsApp</a>}</div>}
          {shop.theme_config?.delivery_zones && shop.theme_config.delivery_zones.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[11px] font-bold text-slate-600">Zones et tarifs communiqués par la boutique :</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {shop.theme_config.delivery_zones.map((zone, index) => (
                  <div key={`${zone.label}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-800">{zone.label}</span>
                      <span className="text-[10px] font-bold uppercase text-slate-500">{zone.mode}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>{zone.description || 'Modalité à confirmer'}</span>
                      <span className="font-black text-[#087F62]">{typeof zone.fee === 'number' ? zone.fee === 0 ? 'Offert' : `${zone.fee.toLocaleString('fr-FR')} FCFA` : 'Tarif à confirmer'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Ces indications de la boutique sont à confirmer directement avec elle. Si MaTable couvre votre zone, les frais de livraison sont calculés et ajoutés au total au moment de la commande.</p>
            </div>
          )}
        </details>
        </div>

        <aside aria-label="Récapitulatif de la commande" className="hidden xl:block">
          <div className="sticky top-24 rounded-2xl border border-[#ded8ce] bg-[#FFFFFF] p-4 shadow-[0_12px_32px_rgba(33,23,18,0.08)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#e5d9ca] pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#8c5a36]">Votre sélection</p>
                <h2 className="mt-1 text-base font-black text-[#292d2a]">Ma commande</h2>
              </div>
              <span className="rounded-full bg-[#d1fae5] px-2.5 py-1 text-xs font-black text-[#065f46]">{totalCartCount}</span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="mx-auto h-8 w-8 text-[#c5b6a3]" />
                <p className="mt-2 text-sm font-bold text-[#47534b]">Votre panier est vide</p>
                <p className="mt-1 text-xs leading-5 text-[#647067]">Ajoutez des articles pour préparer votre commande.</p>
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
                        className="h-12 w-12 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#292d2a]">{item.product.title}</p>
                        <p className="mt-0.5 text-[11px] text-[#647067]">{formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers))}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button type="button" onClick={() => updateQuantity(index, -1)} aria-label={`Retirer un ${item.product.title}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ded8ce] bg-white text-[#47534b] hover:bg-[#f8f3ec]"><Minus className="h-3 w-3" /></button>
                          <span className="min-w-4 text-center text-xs font-black tabular-nums text-[#292d2a]">{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(index, 1)} disabled={item.quantity >= item.product.stock} aria-label={`Ajouter un ${item.product.title}`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ded8ce] bg-white text-[#47534b] hover:bg-[#f8f3ec] disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3 w-3" /></button>
                        </div>
                      </div>
                      <span className="shrink-0 text-right text-xs font-black text-[#292d2a]">{formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers) * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-[#e5d9ca] pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-[#47534b]">Total des articles</span>
                    <span className="text-base font-black text-[#292d2a]">{formatFCFA(totalCartAmount)}</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-[#065f46]">Livraison MaTable</span>
                      <span className="text-sm font-black text-[#065f46]">{formatFCFA(deliveryFee)}</span>
                    </div>
                  )}
                  {deliveryFee > 0 && (
                    <div className="mt-1 flex items-center justify-between gap-3 border-t border-[#e5d9ca] pt-1">
                      <span className="text-sm font-black text-[#292d2a]">Total à régler</span>
                      <span className="text-base font-black text-[#292d2a]">{formatFCFA(orderTotalDue)}</span>
                    </div>
                  )}
                  <p className="mt-1 text-[10px] leading-4 text-[#647067]">
                    {deliveryFee > 0
                      ? 'Règlement des articles et de la livraison à convenir avec la boutique ou le livreur.'
                      : 'Hors livraison et frais éventuels, à convenir directement avec la boutique.'}
                  </p>
                  <button type="button" onClick={() => setIsCartOpen(true)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#065f46] px-4 text-sm font-black text-white transition hover:bg-[#047857]">
                    Préparer ma commande <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </aside>
        </div>

      </main>

      {/* 4. FLOATING BOTTOM BAR (Cart Summary) */}
      {totalCartCount > 0 && !isCartOpen && (
        createPortal(<div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-lg px-4 xl:hidden">
          <button
            id="floating-cart-btn"
            onClick={() => setIsCartOpen(true)}
            className="w-full text-white p-4 rounded-2xl shadow-[0_10px_25px_rgba(32,23,18,0.2)] flex items-center justify-between gap-3 active:scale-[0.99] transition-transform border-[2px] border-[#292d2a]"
            style={{ background: 'linear-gradient(135deg, #087F62 0%, #F97316 100%)', ...glowStyle }}
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
            className="bg-[#FFFDF9] w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-[0_18px_40px_rgba(34,32,27,0.18)] overflow-hidden animate-in slide-in-from-bottom-6 duration-200 border-[3px] border-[#292d2a] sm:border"
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
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Fermer le récapitulatif de commande"
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
                  <div className="success-mark w-16 h-16 bg-[#E3F1EA] text-[#087F62] rounded-full flex items-center justify-center mx-auto mb-4 ring-8 ring-[#F4F8F5]">
                    <CheckCircle2 className="w-9 h-9" strokeWidth={2.4} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8A948E]">Récapitulatif de commande</p>
                  <h4 className="mt-1 text-xl font-extrabold text-[#103E32]">
                    Demande enregistrée
                  </h4>
                  <div className="mt-2 inline-flex items-baseline gap-1.5 rounded-xl border border-[#E4D9C8] bg-[#FAF8F2] px-3 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A948E]">N°</span>
                    <span className="font-mono text-sm font-black text-[#103E32]">{orderSuccess.orderId}</span>
                  </div>
                  <p className="mt-3 text-xs text-[#0F6B54] bg-[#E3F1EA] px-3 py-1.5 rounded-full inline-block font-semibold mb-4">
                    {orderSuccess.deliveryFee > 0 ? '✓ Articles réservés · livraison MaTable demandée' : '✓ Articles réservés · récapitulatif prêt'}
                  </p>
                  {orderSuccess.deliveryFee > 0 ? (
                    <div className="mx-auto mb-4 max-w-sm rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left">
                      <p className="text-xs font-black text-emerald-950">Livraison MaTable confirmée</p>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">
                        {orderSuccess.deliveryTicket ? `Course ${orderSuccess.deliveryTicket} · ` : ''}
                        frais de livraison {formatFCFA(orderSuccess.deliveryFee)} ajoutés au total. Un livreur va être recherché.{authenticatedCustomer ? ' Suivez la course depuis votre compte client.' : ' Conservez votre numéro de ticket pour le suivi.'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6 leading-relaxed">
                      Envoyez votre récapitulatif au commerçant sur WhatsApp pour confirmer la disponibilité, le retrait ou la livraison et les frais éventuels.
                    </p>
                  )}
                  {orderSuccess.deliveryFee > 0 && (
                    <p className="text-sm text-slate-600 max-w-sm mx-auto mb-6 leading-relaxed">
                      Confirmez le règlement des articles et des frais de livraison avec la boutique ou le livreur.
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
                    className="w-full py-4 px-6 rounded-2xl bg-[#087F62] hover:bg-[#066B52] text-white font-black text-base shadow-lg hover:shadow-[#087F62]/25 flex items-center justify-center gap-3 transition-all"
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
                          </div>
                          <span className="text-xs font-semibold text-slate-600 block mt-0.5">
                            {formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers))} x {item.quantity} = {formatFCFA(getProductUnitPrice(item.product, item.selected_modifiers) * item.quantity)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, -1)}
                            aria-label={`Diminuer la quantité de ${item.product.title}`}
                            className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-extrabold text-xs px-2 text-slate-900">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(idx, 1)}
                            disabled={item.quantity >= item.product.stock}
                            aria-label={`Augmenter la quantité de ${item.product.title}`}
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
                        className="mt-2 text-xs font-bold text-[#047857] underline underline-offset-2"
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
                      <label htmlFor="checkout-customer-name" className="block text-xs font-bold text-slate-700 mb-1">
                        Votre Nom complet *
                      </label>
                      <input 
                        id="checkout-customer-name"
                        type="text"
                        required
                        placeholder="Ex: Kouassi Ange, Fatou Traoré..."
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#F97316] bg-white"
                      />
                    </div>

                    {/* Customer Phone */}
                    <div>
                      <label htmlFor="checkout-customer-phone" className="block text-xs font-bold text-slate-700 mb-1">
                        Numéro de Téléphone (WhatsApp) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-semibold">
                          🇨🇮 +225
                        </span>
                        <input 
                          id="checkout-customer-phone"
                          type="tel"
                          required
                          placeholder="07 00 11 22 33"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="w-full text-sm pl-20 pr-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#F97316] bg-white font-mono"
                        />
                      </div>
                    </div>

                    {/* Delivery Location / Commune */}
                    <div>
                      <p id="checkout-delivery-location-label" className="block text-xs font-bold text-slate-700 mb-1">
                        Commune ou quartier souhaité *
                      </p>
                      <p className="mb-2 text-[11px] leading-5 text-slate-500">
                        Indiquez où vous souhaitez récupérer votre commande ou être contacté pour convenir de la livraison.
                      </p>
                      <div role="group" aria-labelledby="checkout-delivery-location-label" className="grid grid-cols-2 gap-2 text-xs">
                        {checkoutLocations.map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => setDeliveryLocation(loc)}
                            aria-pressed={deliveryLocation === loc}
                            className={`py-2 px-2.5 rounded-lg font-medium border text-left flex items-center gap-1.5 transition-colors ${
                              deliveryLocation === loc
                                ? 'bg-[#087F62] text-white border-[#154F41] shadow-[2px_2px_0_rgba(21,79,65,0.2)]'
                                : 'bg-[#F8F3EC] text-[#292d2a] border-[#E4D9C8] hover:bg-[#F5EADC]'
                            }`}
                          >
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{loc}</span>
                          </button>
                        ))}
                      </div>

                      {deliveryLocation === 'Autre' && (
                        <label htmlFor="checkout-custom-location" className="mt-2 block">
                          <span className="sr-only">Précisez la ville ou le quartier</span>
                          <input
                            id="checkout-custom-location"
                            type="text"
                            required
                            minLength={2}
                            placeholder="Précisez la ville / quartier (ex: Bingerville, Bouaké, San Pedro...)"
                            value={customLocation}
                            onChange={(e) => setCustomLocation(e.target.value)}
                            className="w-full text-sm px-3.5 py-2.5 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#F97316] bg-white"
                          />
                        </label>
                      )}

                      {deliveryOptionsLoading && (
                        <p role="status" className="mt-2.5 text-[11px] font-semibold text-slate-500">
                          Vérification des zones de livraison MaTable…
                        </p>
                      )}

                      {deliveryOptions?.available && (
                        <div className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                          <p className="text-[11px] font-black text-emerald-950">Livraison MaTable (optionnel)</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-emerald-900">
                            {deliveryOptions.originZone ? `Départ ${deliveryOptions.originZone}. ` : ''}
                            Les frais sont ajoutés au total et la course est créée dès la commande.
                          </p>
                          <div role="radiogroup" aria-label="Zone de livraison MaTable" className="mt-2 grid gap-1.5">
                            <button
                              type="button"
                              role="radio"
                              aria-checked={deliveryZoneId === null}
                              onClick={() => setDeliveryZoneId(null)}
                              className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[11px] font-semibold transition-colors ${
                                deliveryZoneId === null
                                  ? 'border-emerald-700 bg-white text-emerald-950 ring-1 ring-emerald-700'
                                  : 'border-emerald-200 bg-white/70 text-emerald-900 hover:bg-white'
                              }`}
                            >
                              <span>Je m’organise / à convenir</span>
                              <span className="shrink-0 text-[10px] font-bold uppercase text-emerald-700">Sans frais MaTable</span>
                            </button>
                            {deliveryOptions.zones.map((zone) => (
                              <button
                                key={zone.id}
                                type="button"
                                role="radio"
                                aria-checked={deliveryZoneId === zone.id}
                                onClick={() => setDeliveryZoneId(zone.id)}
                                className={`flex min-h-10 items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[11px] font-semibold transition-colors ${
                                  deliveryZoneId === zone.id
                                    ? 'border-emerald-700 bg-white text-emerald-950 ring-1 ring-emerald-700'
                                    : 'border-emerald-200 bg-white/70 text-emerald-900 hover:bg-white'
                                }`}
                              >
                                <span className="truncate">{zone.label}</span>
                                <span className="shrink-0 font-black text-emerald-800">{formatFCFA(zone.amount)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!deliveryOptionsLoading && !deliveryOptions?.available && (
                        <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            MaTable transmet ces indications au commerçant. La livraison MaTable n’est pas disponible pour cette boutique : convenez du retrait ou de la livraison et des frais éventuels directement avec elle.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Food Delivery Slot */}
                    {shop.category === 'food' && (
                      <div>
                        <label htmlFor="checkout-delivery-slot" className="block text-xs font-bold text-slate-700 mb-1">
                          Créneau souhaité pour vos plats
                        </label>
                        <select
                          id="checkout-delivery-slot"
                          value={deliverySlot}
                          onChange={(e) => setDeliverySlot(e.target.value)}
                          className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#E4D9C8] bg-white font-bold text-[#292d2a]"
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
                      <label htmlFor="checkout-delivery-note" className="block text-xs font-bold text-slate-700 mb-1">
                        Repère ou précision pour la boutique (optionnel)
                      </label>
                      <input 
                        id="checkout-delivery-note"
                        type="text"
                        placeholder="Ex. : retrait sur place ou repère de quartier..."
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        className="w-full text-sm px-3.5 py-2 rounded-xl border-[2px] border-[#E4D9C8] focus:outline-none focus:ring-2 focus:ring-[#F97316] bg-white"
                      />
                    </div>

                    {/* Payment method */}
                    <div>
                    <p className="mb-1 block text-xs font-bold text-slate-700">Mode de règlement souhaité</p>
                    <div role="radiogroup" aria-label="Mode de règlement souhaité" className="grid grid-cols-2 gap-2">
                      {paymentPreferenceOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          role="radio"
                          aria-checked={paymentMethod === option.id}
                          onClick={() => setPaymentMethod(option.id)}
                          className={`min-h-14 rounded-xl border p-2 text-center font-bold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                            paymentMethod === option.id
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <span className="mb-0.5 block text-base" aria-hidden="true">{option.icon}</span>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-700">{paymentPreferenceOptions.find((option) => option.id === paymentMethod)?.explanation}</p>
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-950">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Ce choix est une préférence uniquement : aucun paiement en ligne n’est effectué ni confirmé par MaTable.ci.
                    </p>
                    </div>

                    {/* Total & Submit Button */}
                    <div className="pt-4 border-t border-slate-200">
                      <div className="flex flex-col mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-700">Articles :</span>
                          <span className="text-sm font-black text-slate-900">
                            {formatFCFA(totalCartAmount)}
                          </span>
                        </div>
                        {deliveryFee > 0 && (
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-sm font-bold text-emerald-800">Livraison MaTable ({selectedDeliveryOption?.label}) :</span>
                            <span className="text-sm font-black text-emerald-800">
                              {formatFCFA(deliveryFee)}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                          <span className="text-sm font-black text-slate-900">Total à régler :</span>
                          <span className="text-xl font-black text-slate-900">
                            {formatFCFA(orderTotalDue)}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {deliveryFee > 0
                            ? 'Le règlement des articles et des frais de livraison est à convenir avec la boutique ou le livreur. MaTable suit la course sans encaisser le paiement.'
                            : 'Remise ou livraison et frais éventuels à convenir directement avec la boutique sur WhatsApp.'}
                        </span>
                      </div>

                      <button
                        id="submit-order-whatsapp-btn"
                        type="submit"
                        disabled={isSubmitting || !shop.is_open}
                        className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-base shadow-lg hover:shadow-emerald-600/30 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Phone className="w-5 h-5 fill-white" />
                        <span>{isSubmitting ? 'Préparation...' : 'Préparer ma commande'}</span>
                      </button>
                      <p className="text-center text-[11px] text-slate-400 mt-2">
                        Enregistre la demande et réserve le stock. Vous pourrez ensuite ouvrir WhatsApp pour confirmer les détails avec la boutique.
                      </p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>, document.body)
      )}
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