import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShoppingBag, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Plus, 
  Minus, 
  ArrowRight, 
  Info,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
  Search
} from 'lucide-react';
import { Shop, Product, CartItem } from '../types';
import { formatFCFA, generateWhatsAppOrderReceipt, getProductUnitPrice } from '../utils/format';
import { getContrastTextColor, normalizeHex } from '../utils/color';
import { requiresShopSwitchConfirmation } from '../utils/cart';
import { getBannerImageForDisplay, getCategoryDefaults, getProductImageForDisplay, getWelcomeMessageForDisplay } from '../utils/categoryDefaults';
import { CategoryProductImage } from './CategoryProductImage';
import { CustomerProductCard } from './CustomerProductCard';
import { useToast } from './Toast';
import { hasAnalyticsConsent } from './CookieBanner';
import { CustomerUser } from './CustomerAuth';
import { CustomerCheckoutAuth } from './CustomerCheckoutAuth';

interface CustomerStorefrontProps {
  shopSlug: string;
  onSelectShop?: (slug: string) => void;
  customerUser?: CustomerUser | null;
  onCustomerAuthenticated?: (user: CustomerUser) => void;
}

const ACTIVE_CART_STORAGE_KEY = 'matable_active_cart';
type CartState = { shopSlug: string; items: CartItem[] };

function validCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CartItem =>
    Boolean(item && typeof item === 'object' && item.product && typeof item.product.id === 'number' && Number.isInteger(item.quantity) && item.quantity > 0)
  );
}

function readStoredCart(shopSlug: string): CartState {
  try {
    const activeCart = sessionStorage.getItem(ACTIVE_CART_STORAGE_KEY);
    if (activeCart) {
      const parsed: unknown = JSON.parse(activeCart);
      if (parsed && typeof parsed === 'object' && 'shopSlug' in parsed && 'items' in parsed) {
        const saved = parsed as { shopSlug: unknown; items: unknown };
        if (typeof saved.shopSlug === 'string') return { shopSlug: saved.shopSlug, items: validCartItems(saved.items) };
      }
    }

    const legacyCart = sessionStorage.getItem(`matable_cart_${shopSlug}`);
    return { shopSlug, items: legacyCart ? validCartItems(JSON.parse(legacyCart)) : [] };
  } catch {
    return { shopSlug, items: [] };
  }
}

export const CustomerStorefront: React.FC<CustomerStorefrontProps> = ({ shopSlug, customerUser, onCustomerAuthenticated }) => {
  const toast = useToast();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Category Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Keep an in-progress cart when a customer opens another page and returns.
  const [cartState, setCartState] = useState<CartState>(() => readStoredCart(shopSlug));
  const cart = cartState.shopSlug === shopSlug ? cartState.items : [];
  const setCart: React.Dispatch<React.SetStateAction<CartItem[]>> = (update) => {
    setCartState((previous) => {
      const currentItems = previous.shopSlug === shopSlug ? previous.items : [];
      return {
        shopSlug,
        items: typeof update === 'function' ? update(currentItems) : update,
      };
    });
  };
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartHistoryEntry = useRef(false);
  const [pendingShopSwitchProduct, setPendingShopSwitchProduct] = useState<Product | null>(null);

  // Truncation toggle map for product descriptions
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<number, boolean>>({});

  // Product interactive selection state (Fashion sizes/colors, Food modifiers)
  const [selectedSizes, setSelectedSizes] = useState<Record<number, string>>({});
  const [selectedColors, setSelectedColors] = useState<Record<number, string>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, string[]>>({});

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
  const [checkoutAuthUser, setCheckoutAuthUser] = useState<CustomerUser | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: number; whatsappUrl: string; whatsappText: string; whatsappTrackingToken: string } | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);
  const [formStartedAt] = useState(() => Date.now());
  const [website, setWebsite] = useState('');

  useEffect(() => {
    if (!isCartOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsCartOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isCartOpen]);

  useEffect(() => {
    const restoreCartDrawer = () => {
      const drawerIsInHistory = Boolean(window.history.state?.matableCartDrawer);
      cartHistoryEntry.current = drawerIsInHistory;
      setIsCartOpen(drawerIsInHistory);
    };
    window.addEventListener('popstate', restoreCartDrawer);
    return () => window.removeEventListener('popstate', restoreCartDrawer);
  }, []);

  useEffect(() => {
    if (isCartOpen) {
      if (!window.history.state?.matableCartDrawer) {
        window.history.pushState({ ...(window.history.state || {}), matableCartDrawer: true }, '', window.location.href);
      }
      cartHistoryEntry.current = true;
      return;
    }

    if (cartHistoryEntry.current && window.history.state?.matableCartDrawer) {
      cartHistoryEntry.current = false;
      window.history.back();
    }
  }, [isCartOpen]);

  useEffect(() => {
    if (cartState.shopSlug !== shopSlug) return;
    try {
      if (cartState.items.length > 0) sessionStorage.setItem(ACTIVE_CART_STORAGE_KEY, JSON.stringify(cartState));
      else sessionStorage.removeItem(ACTIVE_CART_STORAGE_KEY);
    } catch {
      // The in-memory cart remains available when browser storage is disabled.
    }
  }, [cartState, shopSlug]);

  // Ces deux useMemo doivent être déclarés avant les "return" conditionnels
  // ci-dessous (loading / error / boutique inactive), sinon React appelle un
  // nombre de hooks différent selon l'état, ce qui casse le rendu (page blanche).
  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        `${p.title} ${p.description || ''} ${p.category || ''}`.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const fetchShopData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/shops/${shopSlug}`);
      if (!res.ok) {
        throw new Error('Boutique introuvable');
      }
      const data = await res.json();
      setShop(data.shop);
      setProducts(data.products || []);

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
        if (p.modifier_groups && p.modifier_groups.length > 0 && p.modifier_groups[0].options.length > 0) {
          const firstOpt = p.modifier_groups[0].options[0];
          const optLabel = typeof firstOpt === 'string' ? firstOpt : firstOpt.label;
          initModifiers[p.id] = [optLabel];
        }
      });

      setSelectedSizes(initSizes);
      setSelectedColors(initColors);
      setSelectedModifiers(initModifiers);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopData();
    setOrderSuccess(null);
  }, [shopSlug]);

  useEffect(() => {
    if (!customerUser) return;
    setCustomerName(customerUser.name);
    setCustomerPhone(customerUser.phone);
  }, [customerUser]);

  useEffect(() => {
    if (!shop?.id || !hasAnalyticsConsent()) return;
    const storageKey = `matable_page_view_${shop.id}`;
    if (sessionStorage.getItem(storageKey)) return;
    const sessionId = sessionStorage.getItem('matable_analytics_session') || crypto.randomUUID();
    sessionStorage.setItem('matable_analytics_session', sessionId);
    sessionStorage.setItem(storageKey, '1');
    fetch('/api/analytics/page-view', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: shop.id, session_id: sessionId, path: window.location.pathname }),
    }).catch(() => undefined);
  }, [shop?.id]);

  useEffect(() => {
    if (!shop) return;

    const origin = window.location.origin;
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
      document.title = 'MaTable.ci — Boutiques locales en Côte d’Ivoire';
      const defaultDescription = 'Découvrez des boutiques locales en Côte d’Ivoire, consultez leurs catalogues et commandez directement sur WhatsApp avec MaTable.ci.';
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

  // Cart actions with variant support
  const addToCart = (product: Product, replaceOtherShop = false) => {
    if (product.stock <= 0) return;
    const currentSize = selectedSizes[product.id];
    const currentColor = selectedColors[product.id];
    const currentMods = selectedModifiers[product.id] || [];
    const addProduct = (items: CartItem[]) => {
      const existingIndex = items.findIndex((item) =>
        item.product.id === product.id
        && item.selected_size === currentSize
        && item.selected_color === currentColor
        && JSON.stringify(item.selected_modifiers || []) === JSON.stringify(currentMods)
      );
      if (existingIndex > -1) {
        const existing = items[existingIndex];
        if (existing.quantity >= product.stock) return items;
        const updated = [...items];
        updated[existingIndex] = { ...existing, quantity: existing.quantity + 1 };
        return updated;
      }
      return [...items, { product, quantity: 1, selected_size: currentSize, selected_color: currentColor, selected_modifiers: currentMods }];
    };

    if (requiresShopSwitchConfirmation(cartState.shopSlug, shopSlug, cartState.items.length)) {
      if (!replaceOtherShop) {
        setPendingShopSwitchProduct(product);
        return;
      }
      setCartState({ shopSlug, items: addProduct([]) });
      return;
    }

    setCart(addProduct);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const item = prev[index];
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      if (newQty > item.product.stock) return prev;
      const copy = [...prev];
      copy[index] = { ...item, quantity: newQty };
      return copy;
    });
  };

  const getProductQuantityInCart = (productId: number): number => {
    return cart
      .filter(i => i.product.id === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartAmount = cart.reduce((sum, item) => {
    const unitPrice = getProductUnitPrice(item.product, item.selected_modifiers);
    return sum + item.quantity * unitPrice;
  }, 0);

  const authenticatedCustomer = customerUser || checkoutAuthUser;

  // Handle WhatsApp Checkout
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || cart.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Veuillez renseigner votre nom et votre numéro de téléphone.');
      return;
    }
    if (!authenticatedCustomer) {
      setShowCheckoutAuth(true);
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
          customer_name: customerName,
          customer_phone: customerPhone,
          delivery_location: finalLocation,
          delivery_note: deliveryNote,
          delivery_slot: shop.category === 'food' ? deliverySlot : undefined,
          payment_method_preference: paymentMethod,
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

      const confirmedCart = (data.order.items || []).map((item: any) => {
        const localProduct = products.find((product) => product.id === item.product_id);
        if (!localProduct) return null;
        return {
          product: {
            ...localProduct,
            title: item.product_title || localProduct.title,
            price: Number(item.unit_price),
            modifier_groups: [],
          },
          quantity: Number(item.quantity),
          selected_size: item.selected_size,
          selected_color: item.selected_color,
          selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
        };
      }).filter(Boolean);

      // 2. Prepare WhatsApp from the server-confirmed order.
      const { text, url } = generateWhatsAppOrderReceipt(
        shop,
        customerName,
        customerPhone,
        finalLocation,
        deliveryNote,
        paymentMethod,
        confirmedCart,
        Number(data.order.total_amount),
        shop.category === 'food' ? deliverySlot : undefined
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

  const serviceHighlights = [
    shop.is_open ? 'Boutique ouverte' : 'Commande à la reprise',
    shop.theme_config?.delivery_zones?.length ? `${shop.theme_config.delivery_zones.length} zones de service` : 'Service local',
    shop.theme_config?.social_links && Object.values(shop.theme_config.social_links).some(Boolean) ? 'Réseaux publics vérifiés' : 'Contact direct WhatsApp',
    shop.city ? `Service à ${shop.city}` : 'Abidjan & environs',
  ];

  return (
    <div 
      className="storefront-page min-h-screen pb-32 transition-colors"
      style={{ 
        background: 'linear-gradient(180deg, #faf8f3 0%, #f1eee7 100%)',
        fontFamily: `"${fontFamily}", system-ui, sans-serif`
      }}
    >
      {/* 1. Header & Shop Identity */}
      <header className="bg-[#fffdf9]/95 backdrop-blur-md border-b border-[#ded8ce] sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop.name}
                className="w-11 h-11 rounded-xl object-cover shrink-0 border border-slate-200 bg-white shadow-sm"
              />
            ) : (
              <div 
                className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shrink-0 shadow-sm transition-transform hover:scale-105"
                style={{ backgroundColor: primaryColor, color: primaryTextColor }}
              >
                <span aria-hidden="true">{categoryDefaults.icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-black text-[#211712] text-base sm:text-lg truncate">{shop.name}</h1>
                {shop.is_open ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#154F41] bg-[#E9F3EF] px-2 py-0.5 rounded-full shrink-0 border border-[#1D6B57]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1D6B57] animate-pulse" /> Ouvert
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#8A5A12] bg-[#F7E7C7] px-2 py-0.5 rounded-full shrink-0 border border-[#C48A18]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EFAE24]" /> Fermé
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate">
                <span>matable.ci/{shop.slug}</span>
                {shop.city ? <span className="text-slate-300">•</span> : null}
                {shop.city ? <span>{shop.city}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider"
              style={{ color: primaryColor }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Commande rapide</span>
            </div>
            <button
              id="cart-header-btn"
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-all flex items-center gap-1.5"
              aria-label="Voir le panier"
            >
              <ShoppingBag className="w-5 h-5 text-slate-800" />
              {totalCartCount > 0 && (
                <span 
                  className="absolute -top-1.5 -right-1.5 font-black text-xs w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-scale"
                  style={{ backgroundColor: primaryColor, color: primaryTextColor }}
                >
                  {totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {pendingShopSwitchProduct && requiresShopSwitchConfirmation(cartState.shopSlug, shopSlug, cartState.items.length) && (
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingShopSwitchProduct(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="shop-switch-title" className="w-full max-w-md rounded-2xl border-2 border-[#211712] bg-[#fffaf2] p-5 shadow-2xl">
              <h2 id="shop-switch-title" className="text-lg font-black text-[#211712]">Votre panier appartient à une autre boutique</h2>
              <p className="mt-2 text-sm leading-6 text-[#4a3a30]">Pour commander chez {shop?.name}, il faut remplacer le panier de « {cartState.shopSlug} ». Votre commande restera liée à une seule boutique.</p>
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
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xs">
            <img
              src={bannerUrl}
              alt={`Illustration de la boutique ${shop.name}`}
              className="h-40 w-full object-cover sm:h-52"
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
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
            <p className="absolute bottom-3 left-4 right-4 text-sm font-black text-white drop-shadow sm:text-base">{shop.name}</p>
          </div>
        </div>
      )}

      {isEventMode && eventBannerText && (
        <div className="max-w-3xl mx-auto px-4 pt-3">
          <div className="rounded-xl px-3 py-2 text-center text-xs font-black" style={{ backgroundColor: primaryColor, color: primaryTextColor }}>
            {eventBannerText}
          </div>
        </div>
      )}

      {/* 2. Boutique overview + checklist flow */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="mb-4 p-4 rounded-2xl bg-[#fffdf9] border border-[#ded8ce] shadow-sm surface-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ui-kicker">Boutique</p>
              <h2 className="text-lg font-black text-slate-900 mt-1">{shop.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="primary-button px-3 py-2 text-xs"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Commander
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
            <span className="rounded-full bg-slate-100 px-2 py-1">{categoryDefaults.label}</span>
            {shop.city && <span className="rounded-full bg-slate-100 px-2 py-1">{shop.city}</span>}
            <span className="rounded-full bg-slate-100 px-2 py-1">{shop.is_open ? 'Ouvert' : 'Fermé'}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">Sur place / livraison</span>
          </div>
        </div>

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

        {/* Welcome message / Slogan */}
        {getWelcomeMessageForDisplay(shop.welcome_message, shop.category) && (
          <div className="p-4 rounded-2xl bg-[#fffdf9] border border-[#ded8ce] shadow-sm mb-5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              <Sparkles className="w-3.5 h-3.5" style={{ color: primaryColor }} />
              <span>{shop.welcome_message ? 'Mot du commerçant' : 'Présentation'}</span>
            </div>
            <p className="text-slate-800 text-sm font-medium leading-relaxed italic">
              « {getWelcomeMessageForDisplay(shop.welcome_message, shop.category)} »
            </p>
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-[#ded8ce] bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Confiance & service</p>
              <h3 className="text-base font-black text-slate-900 mt-1">Pourquoi choisir cette boutique</h3>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-[#edf7f2] px-2 py-1 text-[10px] font-black text-[#155c3d]">
              <MapPin className="w-3 h-3" />
              {shop.city || 'Abidjan'}
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-[#1D6B57] shrink-0" />
              <span>Horaires</span>
            </div>
            <span className="text-[11px] font-black text-slate-800">{hoursSummary}</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {serviceHighlights.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] font-bold text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1D6B57] shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {(shop.theme_config?.social_links || shop.theme_config?.delivery_zones?.length) && (
          <div className="mb-5 rounded-2xl border border-[#ded8ce] bg-[#fffdf9] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Contact & livraison</p>
                <h3 className="text-base font-black text-slate-900 mt-1">Réseaux et zones de service</h3>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-[#edf7f2] px-2 py-1 text-[10px] font-black text-[#155c3d]">
                <MapPin className="w-3 h-3" />
                {shop.city || 'Abidjan'}
              </div>
            </div>

            {shop.theme_config?.social_links && Object.values(shop.theme_config.social_links).some(Boolean) && (
              <div className="flex flex-wrap gap-2 mb-3">
                {shop.theme_config.social_links.instagram && (
                  <a href={shop.theme_config.social_links.instagram} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Instagram</a>
                )}
                {shop.theme_config.social_links.facebook && (
                  <a href={shop.theme_config.social_links.facebook} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Facebook</a>
                )}
                {shop.theme_config.social_links.website && (
                  <a href={shop.theme_config.social_links.website} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">Site web</a>
                )}
                {shop.theme_config.social_links.whatsapp && (
                  <a href={shop.theme_config.social_links.whatsapp} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700">WhatsApp</a>
                )}
              </div>
            )}

            {shop.theme_config?.delivery_zones && shop.theme_config.delivery_zones.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {shop.theme_config.delivery_zones.map((zone, index) => (
                  <div key={`${zone.label}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-800">{zone.label}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{zone.mode}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>{zone.description || 'Service disponible'}</span>
                      <span className="font-black text-[#1D6B57]">{zone.fee ? `${zone.fee.toLocaleString('fr-FR')} FCFA` : 'Gratuit'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Catalog Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-slate-900 text-lg sm:text-xl">
              Catalogue ({products.length})
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {categoryDefaults.catalogDescription}
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
            FCFA nets
          </span>
        </div>

        {/* Search Bar & Category Filter */}
        <div className="mb-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un plat, un article ou un mot-clé..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs placeholder:text-slate-400"
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
          </div>

          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
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
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. DYNAMIC PRODUCT GRID
            Applies:
            - Fashion: 3:4 portrait grid with size/color options
            - Food: 1:1 or 16:9 landscape cards with prep_time & modifiers
        */}
        {products.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium text-sm">Le catalogue est en cours de mise à jour.</p>
          </div>
        ) : filteredProducts.length === 0 ? (
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
        ) : (
          <div className={
            layoutStyle === 'grid_portrait'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
              : 'grid grid-cols-1 sm:grid-cols-2 gap-4'
          }>
            {filteredProducts.map((product) => {
              const activeModifiers = selectedModifiers[product.id] || [];
              const cartIndex = cart.findIndex((item) => item.product.id === product.id);
              return (
                <CustomerProductCard
                  key={product.id}
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
                  onAddToCart={() => addToCart(product)}
                  onDecreaseQuantity={() => { if (cartIndex > -1) updateQuantity(cartIndex, -1); }}
                />
              );
            })}
          </div>
        )}
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
                <span className="text-xs text-slate-300 block">Total panier</span>
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

                  {showCheckoutAuth && !authenticatedCustomer && (
                    <CustomerCheckoutAuth
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
                      Informations de livraison
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
                        Quartier / Commune de livraison *
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
                          <strong>Frais de livraison :</strong> Les frais de course (selon votre commune à Abidjan) ne sont pas inclus dans le total panier et sont réglés directement au coursier lors de la livraison.
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
                          <span className="text-sm font-bold text-slate-700">Total panier :</span>
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