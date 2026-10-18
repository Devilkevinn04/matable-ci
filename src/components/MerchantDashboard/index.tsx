import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Store,
  ShoppingBag,
  Package,
  Plus,
  Edit3,
  Trash2,
  Phone,
  Lock,
  Clock,
  Check,
  Send,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  UserPlus,
  X,
  UtensilsCrossed,
  Shirt,
  Search,
  Eye,
  EyeOff,
  Minus,
  TrendingUp,
  DollarSign,
  MapPin,
  Palette,
  Key,
  AlertTriangle,
  Copy,
  RotateCcw,
  Calendar,
  Upload,
  Boxes,
  LayoutDashboard,
  ShieldCheck,
  CreditCard,
  MessageCircle,
  LogOut,
  BarChart3,
  MoreHorizontal,
  Bell,
} from 'lucide-react';
import { Shop, Product, Order, FlashBilan, ShopCategory, OrderStatus, ShopDeliveryZone, ShopSocialLinks } from '../../types';
import { formatFCFA, compressImageClientSide, cleanPhoneForWhatsApp } from '../../utils/format';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { useToast } from '../Toast';
import { CATEGORY_DEFAULTS, getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { getSubscriptionAccessCutoff, getSubscriptionProductLimit, TRIAL_CATALOG_LIMIT } from '../../utils/subscriptionFeatures';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';

interface MerchantDashboardProps {
  currentShopSlug?: string;
  onOpenStorefront: (slug: string) => void;
  onBackToDirectory: () => void;
  onCustomerLogin: () => void;
  openRegistration?: boolean;
}

interface MerchantReview {
  id: number;
  rating: number;
  comment: string;
  created_at: string;
  author_name: string;
}

interface MerchantReviewsResponse {
  reviews: MerchantReview[];
  average_rating: number | null;
  review_count: number;
}

function isMerchantReview(value: unknown): value is MerchantReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Record<string, unknown>;
  return typeof review.id === 'number'
    && typeof review.rating === 'number'
    && typeof review.comment === 'string'
    && typeof review.created_at === 'string'
    && typeof review.author_name === 'string';
}

function isMerchantReviewsResponse(value: unknown): value is MerchantReviewsResponse {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.reviews)
    && payload.reviews.every(isMerchantReview)
    && (payload.average_rating === null || typeof payload.average_rating === 'number')
    && typeof payload.review_count === 'number';
}

const shopCategoryOptions: { value: ShopCategory; label: string; icon: string }[] = SHOP_CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_DEFAULTS[value].label,
  icon: CATEGORY_DEFAULTS[value].icon,
}));

const abidjanCommunes = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody',
  'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville',
  'Yopougon', 'Autre ville / commune',
];

import { useMerchantDashboard } from './useMerchant';
import { AuthScreens } from './AuthScreens';
import { CatalogTab } from './CatalogTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { ProductModal } from './ProductModal';
import { MerchantIdentityVerification } from './lazyMerchantIdentityVerification';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';
import { ProAnalyticsPanel } from './ProAnalyticsPanel';

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront, onBackToDirectory, onCustomerLogin, openRegistration = false }) => {

  const merchantState = useMerchantDashboard(onOpenStorefront, openRegistration);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isSetupChecklistExpanded, setIsSetupChecklistExpanded] = useState(false);
  const [isIdentityGuideOpen, setIsIdentityGuideOpen] = useState(false);
  const [subscriptionReminderDay, setSubscriptionReminderDay] = useState<number | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [shopReviews, setShopReviews] = useState<MerchantReview[]>([]);
  const [shopReviewSummary, setShopReviewSummary] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const reviewShop = merchantState.currentShop;
  const reviewShopIsPublished = Boolean(reviewShop
    && !(!reviewShop.is_active || reviewShop.publication_status === 'suspended')
    && (reviewShop.merchant_verification_status === 'verified'
      || reviewShop.subscription?.isActive !== false && (reviewShop.publication_status
        ? reviewShop.publication_status === 'active'
        : reviewShop.is_active && (!reviewShop.merchant_verification_status
          || ['not_required', 'verified'].includes(reviewShop.merchant_verification_status)))));

  useEffect(() => {
    const updateHeader = () => setIsHeaderCompact(window.innerWidth < 768 && window.scrollY > 56);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    window.addEventListener('resize', updateHeader);
    return () => {
      window.removeEventListener('scroll', updateHeader);
      window.removeEventListener('resize', updateHeader);
    };
  }, []);

  useEffect(() => {
    if (!reviewShop || !reviewShopIsPublished) {
      setShopReviews([]);
      setShopReviewSummary({ average: null, count: 0 });
      setReviewsError('');
      setReviewsLoading(false);
      return;
    }

    let isCurrentRequest = true;
    setReviewsLoading(true);
    setReviewsError('');
    fetch(`/api/customer-engagement/reviews?target_type=shop&target_id=${reviewShop.id}`)
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const errorMessage = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger les avis de votre boutique.';
          throw new Error(errorMessage);
        }
        if (!isMerchantReviewsResponse(payload)) throw new Error('La réponse des avis est invalide.');
        return payload;
      })
      .then((payload) => {
        if (!isCurrentRequest) return;
        setShopReviews(payload.reviews);
        setShopReviewSummary({ average: payload.average_rating, count: payload.review_count });
      })
      .catch((error: unknown) => {
        if (isCurrentRequest) setReviewsError(error instanceof Error ? error.message : 'Impossible de charger les avis de votre boutique.');
      })
      .finally(() => {
        if (isCurrentRequest) setReviewsLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [reviewShop?.id, reviewShopIsPublished]);

  useEffect(() => {
    const shop = merchantState.currentShop;
    if (!shop || shop.admin_mode || !shop.merchant_verification_status
      || ['not_required', 'verified'].includes(shop.merchant_verification_status)) return;
    if (!['pending', 'rejected'].includes(shop.merchant_verification_status)) return;

    const guideKey = `matable:merchant-identity-guide:${shop.id}`;
    try {
      if (window.localStorage.getItem(guideKey) !== 'seen') setIsIdentityGuideOpen(true);
    } catch {
      setIsIdentityGuideOpen(true);
    }
  }, [merchantState.currentShop?.id, merchantState.currentShop?.admin_mode, merchantState.currentShop?.merchant_verification_status]);
  const {
    addDeliveryZone,
    updateDeliveryZone,
    removeDeliveryZone,
    currentShop,
    isSessionLoading,
    confirmModal,
    phoneInput,
    pinInput,
    accessCodeInput,
    showAccessCode,
    showPinInput,
    showRegPin,
    showSettingsPin,
    authMode,
    authError,
    authLoading,
    isRegisterModalOpen,
    regName,
    regPhone,
    regPin,
    regCity,
    regCityOther,
    regEmail,
    regCategory,
    regLoading,
    trialStarting,
    activeTab,
    settingsSubTab,
    products,
    orders,
    flashBilan,
    dataLoading,
    catalogSearch,
    catalogFilter,
    orderSearch,
    orderPaymentFilter,
    orderStatusFilter,
    isProductModalOpen,
    editingProduct,
    prodTitle,
    prodCategory,
    prodDescription,
    prodPrice,
    prodStock,
    prodImage,
    prodLookbookImage,
    prodSizes,
    prodColors,
    prodPrepTime,
    prodIsAvailable,
    imageCompressing,
    compressedSizeKB,
    originalImageSizeKB,
    settingsName,
    settingsWelcome,
    settingsOpen,
    settingsPhone,
    settingsCity,
    settingsNewPin,
    settingsSocialLinks,
    settingsDeliveryZones,
    settingsSaved,
    hoursEnabled,
    openTime,
    closeTime,
    activeDays,
    manualOverride,
    hoursSaved,
    cronRunning,
    cronResult,
    copiedBilan,
    setCurrentShop,
    setIsSessionLoading,
    setConfirmModal,
    setPhoneInput,
    setPinInput,
    setAccessCodeInput,
    setShowAccessCode,
    setShowPinInput,
    setShowRegPin,
    setShowSettingsPin,
    setAuthMode,
    setAuthError,
    setAuthLoading,
    setIsRegisterModalOpen,
    setRegName,
    setRegPhone,
    setRegPin,
    setRegCity,
    setRegCityOther,
    setRegEmail,
    setRegCategory,
    setRegLoading,
    setRegistrationLinks,
    setActiveTab,
    setSettingsSubTab,
    setProducts,
    setOrders,
    setFlashBilan,
    setDataLoading,
    setCatalogSearch,
    setCatalogFilter,
    setOrderSearch,
    setOrderPaymentFilter,
    setOrderStatusFilter,
    setIsProductModalOpen,
    setEditingProduct,
    setProdTitle,
    setProdCategory,
    setProdDescription,
    setProdPrice,
    setProdStock,
    setProdImage,
    setProdLookbookImage,
    setProdSizes,
    setProdColors,
    setProdPrepTime,
    setProdIsAvailable,
    setImageCompressing,
    setCompressedSizeKB,
    setOriginalImageSizeKB,
    setSettingsName,
    setSettingsWelcome,
    setSettingsOpen,
    setSettingsPhone,
    setSettingsCity,
    setSettingsNewPin,
    setSettingsSocialLinks,
    setSettingsDeliveryZones,
    setSettingsSaved,
    setHoursEnabled,
    setOpenTime,
    setCloseTime,
    setActiveDays,
    setManualOverride,
    setHoursSaved,
    setCronRunning,
    setCronResult,
    setCopiedBilan,
    handlePrivateAccessLogin,
    handleLogin,
    handleRegisterShop,
      handleStartTrial,
    handleLogout,
    handleToggleShopStatus,
    handlePublicationStatusChange,
    handleSaveOpeningHours,
    handleResetManualOverride,
    handleTriggerCronBilan,
    handleQuickStockChange,
    handleQuickToggleVisibility,
    handleOpenAddModal,
    handleOpenEditModal,
    handleUpdateOrderStatus,
    handleImageUpload,
    handleSaveProduct,
    handleDeleteProduct,
    handleSaveGeneralSettings,
    toast,
    loadShopData,
    syncShopSettings,
    copyOwnerLink
  } = merchantState;

  useEffect(() => {
    const subscription = currentShop?.subscription;
    const expiresAt = subscription?.status === 'trialing'
      ? subscription.trialEnd
      : subscription?.status === 'active'
        ? subscription.expiresAt
        : null;
    if (!expiresAt) return;
    const accessCutoff = getSubscriptionAccessCutoff(expiresAt);
    if (accessCutoff === null) return;

    let timeoutId: number | undefined;
    const refreshAtExpiry = () => {
      const remaining = accessCutoff - Date.now();
      if (remaining <= 0) {
        window.location.reload();
        return;
      }
      timeoutId = window.setTimeout(refreshAtExpiry, Math.min(remaining, 6 * 60 * 60 * 1000));
    };
    refreshAtExpiry();
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [currentShop?.id, currentShop?.subscription?.status, currentShop?.subscription?.trialEnd, currentShop?.subscription?.expiresAt]);

  useEffect(() => {
    if (!isSettingsDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsSettingsDrawerOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSettingsDrawerOpen]);

  useEffect(() => {
    if (!isIdentityGuideOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissIdentityGuide(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isIdentityGuideOpen]);

  useEffect(() => {
    const shop = merchantState.currentShop;
    const status = shop?.subscription?.status;
    const expiresAt = status === 'trialing'
      ? shop.subscription?.trialEnd
      : status === 'active'
        ? shop.subscription?.expiresAt
        : null;
    const expiryTime = expiresAt ? Date.parse(expiresAt) : NaN;
    const daysRemaining = Number.isFinite(expiryTime)
      ? Math.max(0, Math.ceil((expiryTime - Date.now()) / 86_400_000))
      : status === 'trialing'
        ? shop?.subscription?.trialDaysRemaining ?? null
        : null;

    if (!shop || shop.admin_mode || isIdentityGuideOpen
      || !['trialing', 'active'].includes(status || '')
      || !expiresAt || ![14, 7, 3, 1].includes(daysRemaining ?? -1)) {
      setSubscriptionReminderDay(null);
      return;
    }
    const key = `matable:subscription-reminder:${shop.id}:${expiresAt}:${daysRemaining}`;
    try {
      if (window.localStorage.getItem(key) === 'seen') {
        setSubscriptionReminderDay(null);
        return;
      }
    } catch {
      setSubscriptionReminderDay(daysRemaining);
      return;
    }
    setSubscriptionReminderDay(daysRemaining);
  }, [
    merchantState.currentShop?.id,
    merchantState.currentShop?.admin_mode,
    merchantState.currentShop?.subscription?.status,
    merchantState.currentShop?.subscription?.trialEnd,
    merchantState.currentShop?.subscription?.trialDaysRemaining,
    merchantState.currentShop?.subscription?.expiresAt,
    isIdentityGuideOpen,
  ]);

  useEffect(() => {
    if (subscriptionReminderDay === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissSubscriptionReminder(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [subscriptionReminderDay]);

  if (!merchantState.currentShop) return <AuthScreens state={merchantState} onBackToDirectory={onBackToDirectory} onCustomerLogin={onCustomerLogin} />;

  const identityVerificationRequired = Boolean(merchantState.currentShop.merchant_verification_status
    && !['not_required', 'verified'].includes(merchantState.currentShop.merchant_verification_status));
  if (!merchantState.currentShop.admin_mode
    && !identityVerificationRequired
    && merchantState.currentShop.subscription?.status === 'not_started') {
    return (
      <>
        <div className="fixed right-4 top-4 z-10 flex gap-2">
          <button type="button" onClick={onBackToDirectory} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Annuaire</button>
          <button type="button" onClick={handleLogout} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Déconnexion</button>
        </div>
        <MerchantTrialOnboarding shop={merchantState.currentShop} isStarting={trialStarting} onStart={handleStartTrial} />
      </>
    );
  }
  if (!merchantState.currentShop.admin_mode
    && !identityVerificationRequired
    && ['expired', 'past_due', 'suspended', 'cancelled'].includes(merchantState.currentShop.subscription?.status || '')) {
    return <MerchantTrialOnboarding shop={merchantState.currentShop} isStarting={false} onStart={handleStartTrial} mode="expired" />;
  }
  // 2. AUTHENTICATED -> MERCHANT DASHBOARD
  const activeOrders = orders.filter((order) => !['cancelled', 'expired'].includes(order.status || 'pending'));
  const orderValue = activeOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const dashboardSupportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour la boutique ${currentShop.name}.`);
  const avgBasket = activeOrders.length > 0 ? Math.round(orderValue / activeOrders.length) : 0;
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= 3).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;
  const actionableOrderCount = orders.filter((order) =>
    !['delivered', 'cancelled', 'expired'].includes(order.status || 'pending'),
  ).length;
  const isShopVerified = !currentShop.merchant_verification_status || ['not_required', 'verified'].includes(currentShop.merchant_verification_status);
  const isDiditVerified = currentShop.merchant_verification_status === 'verified';
  const hasActiveSubscription = currentShop.subscription?.isActive !== false;
  const isAdminSuspended = !currentShop.is_active || currentShop.publication_status === 'suspended';
  const isShopPublished = !isAdminSuspended && (isDiditVerified || hasActiveSubscription && (currentShop.publication_status
    ? currentShop.publication_status === 'active'
    : currentShop.is_active && isShopVerified));
  const trialCatalogLimited = !currentShop.admin_mode
    && currentShop.subscription?.status === 'trialing'
    && currentShop.subscription.trialDaysRemaining > 0;
  const dashboardProductLimit = trialCatalogLimited ? TRIAL_CATALOG_LIMIT : getSubscriptionProductLimit(currentShop.subscription?.plan);
  const dashboardCatalogFull = !currentShop.admin_mode
    && Number.isFinite(dashboardProductLimit)
    && products.length >= dashboardProductLimit;
  const subscriptionStatus = currentShop.subscription?.status || 'not_started';
  const subscriptionExpiry = subscriptionStatus === 'trialing'
    ? currentShop.subscription?.trialEnd
    : subscriptionStatus === 'active'
      ? currentShop.subscription?.expiresAt
      : null;
  const parsedExpiryTime = subscriptionExpiry ? Date.parse(subscriptionExpiry) : NaN;
  const subscriptionDaysRemaining = Number.isFinite(parsedExpiryTime)
    ? Math.max(0, Math.ceil((parsedExpiryTime - Date.now()) / 86_400_000))
    : subscriptionStatus === 'trialing'
      ? currentShop.subscription?.trialDaysRemaining ?? null
      : null;
  const subscriptionNeedsAttention = subscriptionStatus === 'past_due'
    || (['trialing', 'active'].includes(subscriptionStatus)
      && subscriptionDaysRemaining !== null
      && subscriptionDaysRemaining <= 14);
  const identityStatus = currentShop.merchant_verification_status || 'pending';
  const settingsNavigationGroups: {
    label: string;
    items: {
      id: typeof settingsSubTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: string;
    }[];
  }[] = [
    {
      label: 'Compte',
      items: [
        { id: 'profile', label: 'Profil personnel', icon: Key },
      ],
    },
    {
      label: 'Ma boutique',
      items: [
        { id: 'themes', label: 'Apparence', icon: Palette },
        { id: 'general', label: 'Coordonnées et livraison', icon: Store },
        { id: 'hours', label: 'Horaires', icon: Clock },
      ],
    },
    {
      label: 'Mon activité',
      items: [
        { id: 'bilan', label: 'Flash bilan', icon: Send },
        { id: 'analytics', label: 'Statistiques Pro', icon: BarChart3 },
      ],
    },
    {
      label: 'Préférences',
      items: [
        { id: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];
  const priorityNotificationCount = Number(!isShopVerified) + Number(subscriptionNeedsAttention);
  const mobileNotificationCount = priorityNotificationCount
    + Number(actionableOrderCount > 0)
    + Number(outOfStockCount > 0)
    + Number(lowStockCount > 0)
    + Number(isAdminSuspended);
  const subscriptionReminderExpiryKey = subscriptionExpiry || '';

  const subscriptionStatusLabel = subscriptionStatus === 'trialing'
    ? `ESSAI · ${currentShop.subscription?.trialDaysRemaining ?? 0} j`
    : subscriptionStatus === 'active'
      ? `${currentShop.subscription?.plan?.toUpperCase() || 'STANDARD'} · ACTIF`
      : subscriptionStatus === 'past_due'
        ? 'ÉCHÉANCE PROCHE'
        : subscriptionStatus === 'not_started'
          ? 'À ACTIVER'
          : 'ABONNEMENT INACTIF';

  // Filter products for catalog tab
  const filteredProducts = products.filter(p => {
    // Search match
    const matchesSearch = !catalogSearch.trim() ||
      p.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(catalogSearch.toLowerCase()));

    if (!matchesSearch) return false;

    // Filter match
    if (catalogFilter === 'in_stock') return p.stock > 0 && p.is_available !== false;
    if (catalogFilter === 'low_stock') return p.stock > 0 && p.stock <= 3 && p.is_available !== false;
    if (catalogFilter === 'out_of_stock') return p.stock === 0;
    if (catalogFilter === 'hidden') return p.is_available === false;
    return true;
  });

  // Filter orders for orders tab
  const filteredOrders = orders.filter(o => {
    // Search match
    const matchesSearch = !orderSearch.trim() ||
      o.customer_name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer_phone.includes(orderSearch) ||
      o.id.toString().includes(orderSearch);

    if (!matchesSearch) return false;

    // Status filter
    const currentStatus = o.status || 'pending';
    if (orderStatusFilter === 'actionable') {
      if (['delivered', 'cancelled', 'expired'].includes(currentStatus)) return false;
    } else if (orderStatusFilter !== 'all' && currentStatus !== orderStatusFilter) {
      return false;
    }

    // Payment preference filter
    if (orderPaymentFilter !== 'all') {
      if (orderPaymentFilter === 'mobile_money') {
        if (o.payment_method_preference !== 'mobile_money') {
          return false;
        }
      } else if (orderPaymentFilter === 'cash' || orderPaymentFilter === 'to_confirm') {
        if (o.payment_method_preference !== orderPaymentFilter) return false;
      } else if (o.payment_method_preference !== orderPaymentFilter) {
        return false;
      }
    }
    return true;
  });

  function handleDashboardSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = dashboardSearch.trim();
    if (!query) return;
    const normalizedQuery = query.toLocaleLowerCase();
    const matchingOrder = orders.some((order) =>
      `${order.id} ${order.customer_name} ${order.customer_phone}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
    if (matchingOrder) {
      setOrderSearch(query);
      setOrderStatusFilter('all');
      setOrderPaymentFilter('all');
      setActiveTab('orders');
      setDashboardSearch('');
      return;
    }

    const matchingProduct = products.some((product) =>
      `${product.title} ${product.description || ''}`.toLocaleLowerCase().includes(normalizedQuery),
    );
    if (matchingProduct) {
      setCatalogSearch(query);
      setCatalogFilter('all');
      setActiveTab('catalog');
      setDashboardSearch('');
      return;
    }

    const matchingOrderItem = orders.some((order) =>
      (order.items || []).some((item) => item.product_title?.toLocaleLowerCase().includes(normalizedQuery)),
    );
    if (matchingOrderItem) {
      setOrderSearch(query);
      setOrderStatusFilter('all');
      setOrderPaymentFilter('all');
      setActiveTab('orders');
      setDashboardSearch('');
      return;
    }
    toast.error('Aucune commande, aucun client ou produit trouvé pour cette recherche.');
  }

  function dismissIdentityGuide() {
    try {
      window.localStorage.setItem(`matable:merchant-identity-guide:${currentShop.id}`, 'seen');
    } catch {
      // Keep the guide dismissible even when browser storage is unavailable.
    }
    setIsIdentityGuideOpen(false);
  }

  function openIdentityVerification() {
    dismissIdentityGuide();
    setSettingsSubTab('verification');
    setActiveTab('settings');
  }

  function dismissSubscriptionReminder() {
    if (subscriptionReminderDay === null) return;
    try {
      window.localStorage.setItem(
        `matable:subscription-reminder:${currentShop.id}:${subscriptionReminderExpiryKey}:${subscriptionReminderDay}`,
        'seen',
      );
    } catch {
      // Keep the reminder dismissible when browser storage is unavailable.
    }
    setSubscriptionReminderDay(null);
  }

  const identityAlertCopy = identityStatus === 'rejected'
    ? { title: 'Vérification à reprendre', description: 'Didit n’a pas transmis le motif détaillé à MaTable.ci. Consultez les indications affichées par Didit ou contactez l’assistance.' }
    : ['submitted', 'under_review'].includes(identityStatus)
      ? { title: 'Vérification en cours', description: 'La vérification est en cours. Votre boutique sera publiable une fois l’identité confirmée.' }
      : { title: 'Vérifiez votre identité', description: 'Cette étape est nécessaire pour publier votre boutique et recevoir des commandes.' };

  const subscriptionAlertCopy = subscriptionStatus === 'past_due'
    ? { title: 'Abonnement à régulariser', description: 'Consultez votre forfait pour réactiver les fonctions liées à votre abonnement.' }
    : subscriptionDaysRemaining === 0
      ? { title: 'Échéance aujourd’hui', description: 'Consultez votre abonnement pour éviter une interruption de service.' }
      : { title: `Échéance dans ${subscriptionDaysRemaining} jour${subscriptionDaysRemaining === 1 ? '' : 's'}`, description: subscriptionStatus === 'trialing' ? 'Préparez la suite de votre essai depuis les options de forfait.' : 'Pensez à renouveler votre forfait avant cette date.' };
  const recentOrders = [...orders]
    .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at))
    .slice(0, 4);
  const orderStatusLabels: Record<OrderStatus, string> = {
    pending: 'À confirmer',
    confirmed: 'Confirmée',
    preparing: 'En préparation',
    ready: 'Prête',
    delivered: 'Livrée',
    cancelled: 'Annulée',
    expired: 'Expirée',
  };
  const uniqueCustomerCount = new Set(orders.map((order) => order.customer_phone || order.customer_name.trim().toLocaleLowerCase()).filter(Boolean)).size;

  return (
    <div className="merchant-dashboard min-h-screen pb-20 bg-[#fffaf2]">
      {currentShop.admin_mode && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-xs font-bold text-white">
          <span>Mode super-admin · Gestion complète de {currentShop.name}</span>
          <button type="button" onClick={() => window.location.assign('/admin')} className="rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">Retour à l’administration</button>
        </div>
      )}
      {/* Top Shop Control Bar */}
      <div className={`sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm transition-[box-shadow] ${isHeaderCompact ? 'shadow-md' : ''}`}>
        <div className={`mx-auto flex max-w-7xl transition-[padding,gap] lg:ml-64 lg:max-w-none ${isHeaderCompact ? 'items-center gap-2 px-3 py-2' : 'flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between'}`}>
          <div className={`flex min-w-0 items-center ${isHeaderCompact ? 'gap-2' : 'gap-3'}`}>
            {currentShop.theme_config?.logo_url ? (
              <img
                src={currentShop.theme_config.logo_url}
                alt={currentShop.name}
                className={`${isHeaderCompact ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl'} shrink-0 border border-slate-200 bg-white object-cover shadow-xs`}
              />
            ) : (
              <div
                className={`${isHeaderCompact ? 'h-8 w-8 rounded-lg text-sm' : 'h-10 w-10 rounded-xl text-lg'} flex shrink-0 items-center justify-center font-black text-white shadow-xs`}
                style={{ backgroundColor: currentShop.theme_config?.primary_color || currentShop.theme_color || '#0F172A' }}
              >
                <span aria-hidden="true">{getCategoryDefaults(currentShop.category).icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className={`flex min-w-0 items-center ${isHeaderCompact ? 'gap-1.5' : 'flex-wrap gap-2'}`}>
                <h1 className={`max-w-full truncate font-black text-slate-900 ${isHeaderCompact ? 'text-sm' : 'text-base sm:text-lg'}`}>{currentShop.name}</h1>
                <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 sm:inline-flex">
                  {getCategoryDefaults(currentShop.category).icon} {getCategoryDefaults(currentShop.category).label}
                </span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : subscriptionStatus === 'past_due' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  {subscriptionStatusLabel}
                </span>
              </div>
              <p className={`truncate text-xs text-slate-500 ${isHeaderCompact ? 'hidden' : 'hidden sm:block'}`}>
                Vitrine : <span className="font-mono text-slate-800">{window.location.host}/{currentShop.slug}</span>
              </p>
            </div>
          </div>

          {isHeaderCompact && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
              <button
                type="button"
                onClick={handleToggleShopStatus}
                aria-label={`Boutique ${currentShop.is_open ? 'ouverte' : 'fermée'} : toucher pour ${currentShop.is_open ? 'fermer' : 'ouvrir'}`}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold ${currentShop.is_open ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                <span className={`h-2 w-2 rounded-full ${currentShop.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {currentShop.is_open ? 'Ouverte' : 'Fermée'}
              </button>
              {isAdminSuspended ? (
                <span className="max-w-16 truncate text-[9px] font-bold text-rose-700" title="Suspendue par l’administration">Suspendue</span>
              ) : !isShopVerified ? (
                <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('verification'); }} className="max-w-16 truncate text-[9px] font-bold text-amber-800">Vérifier</button>
              ) : !hasActiveSubscription ? (
                <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="max-w-16 truncate text-[9px] font-bold text-amber-800">Forfait</button>
              ) : !isShopPublished ? (
                <button type="button" onClick={() => void handlePublicationStatusChange('active')} className="max-w-16 truncate text-[9px] font-bold text-emerald-800">Publier</button>
              ) : (
                <span className="text-[9px] font-bold text-emerald-800">Publiée</span>
              )}
            </div>
          )}

          <div className={`w-full flex-wrap gap-2 md:w-auto md:justify-end ${isHeaderCompact ? 'hidden md:flex' : 'flex'}`}>
            <button
              onClick={handleToggleShopStatus}
              className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-center text-[11px] font-bold transition-colors sm:text-xs md:flex-none ${
                currentShop.is_open
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${currentShop.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="truncate">{currentShop.is_open ? 'Boutique ouverte' : 'Boutique fermée'}</span>
            </button>

            {!isShopVerified ? (
              <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('verification'); }} className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs md:flex-none">
                <span className="truncate">Identité à vérifier</span>
              </button>
            ) : isAdminSuspended ? (
              <span className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-[11px] font-bold text-rose-950 sm:text-xs md:flex-none">
                Suspendue par l’administration
              </span>
            ) : isShopPublished ? (
              <button
                onClick={() => onOpenStorefront(currentShop.slug)}
                className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1D6B57] px-3 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-[#155544] sm:text-xs md:flex-none"
              >
                <span className="truncate">Voir ma vitrine</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : !hasActiveSubscription ? (
              <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs md:flex-none">
                Abonnement requis
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handlePublicationStatusChange('active')}
                className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-[#1D6B57] px-3 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-[#155544] sm:text-xs md:flex-none"
              >
                <span className="truncate">Publier ma boutique</span>
              </button>
            )}

          </div>
        </div>

        {/* Manual Override Notice when opening hours are enabled */}
        {hoursEnabled && manualOverride && (
          <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 text-xs text-amber-900">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Forçage manuel actif :</strong> Boutique basculée sur <strong>{currentShop.is_open ? 'Ouverte' : 'Fermée'}</strong>. Le planning automatique est temporairement suspendu.
                </span>
              </span>
              <button
                type="button"
                onClick={handleResetManualOverride}
                className="py-1 px-2.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[11px] flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reprendre le planning automatique</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
        <section className="mx-auto max-w-7xl px-4 pt-5 lg:ml-64 lg:max-w-none">
          <form onSubmit={handleDashboardSearch} role="search" className="mb-4">
            <label className="sr-only" htmlFor="merchant-dashboard-search">Rechercher une commande, un produit ou un client</label>
            <div className="relative flex max-w-4xl items-center gap-2">
              <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-500" />
              <input
                id="merchant-dashboard-search"
                type="search"
                value={dashboardSearch}
                onChange={(event) => setDashboardSearch(event.target.value)}
                placeholder="Rechercher une commande, un produit, un client"
                className="min-h-12 min-w-0 w-full rounded-full border border-[#e7dfd3] bg-white py-3 pl-11 pr-4 text-sm shadow-sm focus:border-[#176b55] focus:outline-none"
              />
              <button type="submit" className="min-h-10 shrink-0 rounded-full bg-[#0f4d3d] px-3 text-xs font-bold text-white hover:bg-[#176b55] sm:px-4">Rechercher</button>
            </div>
          </form>
          <div className="flex flex-col gap-4 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#1D6B57]">Vue d’ensemble</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#155544]">Bonjour, {currentShop.name}</h2>
              <p className="mt-1 text-sm text-slate-600">Voici l’activité de votre boutique aujourd’hui.</p>
            </div>
            <button type="button" onClick={() => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); }} disabled={dashboardCatalogFull} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1D6B57] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#155544] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />{dashboardCatalogFull ? 'Limite du forfait atteinte' : 'Ajouter un article'}</button>
          </div>
        </section>
      )}

      {activeTab === 'overview' && (identityVerificationRequired || subscriptionNeedsAttention || isAdminSuspended || actionableOrderCount > 0 || outOfStockCount > 0 || lowStockCount > 0) && (
        <section aria-labelledby="merchant-priority-notifications" aria-live="polite" className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-3 lg:ml-64 lg:w-auto lg:max-w-none">
          <h2 id="merchant-priority-notifications" className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">À faire en priorité</h2>
          {identityVerificationRequired && (
            <article className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div><h3 className="text-sm font-extrabold">{identityAlertCopy.title}</h3><p className="mt-1 text-xs leading-5">{identityAlertCopy.description} La boutique reste en veille jusque-là.</p></div>
              </div>
              <button type="button" onClick={openIdentityVerification} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-950 px-4 text-xs font-bold text-white hover:bg-amber-900">{identityStatus === 'rejected' ? 'Reprendre la vérification' : ['submitted', 'under_review'].includes(identityStatus) ? 'Voir le statut' : 'Commencer la vérification'}</button>
            </article>
          )}
          {isAdminSuspended && (
            <article className="flex flex-col gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-950 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex min-w-0 items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="text-sm font-extrabold">Boutique suspendue</h3><p className="mt-1 text-xs leading-5">Contactez l’assistance pour connaître la marche à suivre.</p></div></div>
              <a href={dashboardSupportUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-rose-950 px-4 text-xs font-bold text-white hover:bg-rose-900">Contacter l’assistance</a>
            </article>
          )}
          {subscriptionNeedsAttention && (
            <article className={`flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${subscriptionDaysRemaining !== null && subscriptionDaysRemaining <= 3 || subscriptionStatus === 'past_due' ? 'border-rose-300 bg-rose-50 text-rose-950' : 'border-orange-200 bg-orange-50 text-orange-950'}`}>
              <div className="flex min-w-0 items-start gap-3"><Clock className="mt-0.5 h-5 w-5 shrink-0" /><div><h3 className="text-sm font-extrabold">{subscriptionAlertCopy.title}</h3><p className="mt-1 text-xs leading-5">{subscriptionAlertCopy.description}</p></div></div>
              <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#211712] px-4 text-xs font-bold text-white hover:bg-slate-800">Voir mon forfait</button>
            </article>
          )}
          {(actionableOrderCount > 0 || outOfStockCount > 0 || lowStockCount > 0) && (
            <div className="flex flex-wrap gap-2">
              {actionableOrderCount > 0 && <button type="button" onClick={() => { setOrderSearch(''); setOrderPaymentFilter('all'); setOrderStatusFilter('actionable'); setActiveTab('orders'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-orange-200 bg-white px-3 text-xs font-bold text-orange-900 hover:bg-orange-50"><ShoppingBag className="h-4 w-4" />{actionableOrderCount} commande{actionableOrderCount > 1 ? 's' : ''} à traiter</button>}
              {outOfStockCount > 0 && <button type="button" onClick={() => { setCatalogSearch(''); setCatalogFilter('out_of_stock'); setActiveTab('catalog'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-900 hover:bg-rose-50"><Package className="h-4 w-4" />{outOfStockCount} produit{outOfStockCount > 1 ? 's' : ''} épuisé{outOfStockCount > 1 ? 's' : ''}</button>}
              {lowStockCount > 0 && <button type="button" onClick={() => { setCatalogSearch(''); setCatalogFilter('low_stock'); setActiveTab('catalog'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-50"><AlertTriangle className="h-4 w-4" />{lowStockCount} stock{lowStockCount > 1 ? 's' : ''} bas</button>}
            </div>
          )}
        </section>
      )}

      {activeTab === 'overview' && (
      <div className="mx-auto max-w-7xl px-4 pt-4 lg:ml-64 lg:max-w-none">
        <section className="overflow-hidden rounded-[26px] border border-[#e7dfd3] bg-gradient-to-br from-[#fffdf8] via-[#fefaf4] to-[#edf7f0] p-4 shadow-[0_16px_36px_rgba(37,35,31,0.05)] sm:p-5" aria-labelledby="setup-checklist-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Lancement boutique</p>
              <h2 id="setup-checklist-title" className="mt-1 text-xl font-black text-[#211712] sm:text-2xl">Votre vitrine est presque prête</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-[#e8e0d6]">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Progression</span>
                <span className="rounded-full bg-[#eaf4ef] px-2.5 py-1 text-xs font-black text-[#155544]">
                  {[Boolean(currentShop.name && currentShop.whatsapp_number && currentShop.city), Boolean(currentShop.theme_config?.logo_url), products.length > 0, isShopVerified, hasActiveSubscription, isShopPublished].filter(Boolean).length}/6
                </span>
              </div>
              <button
                type="button"
                aria-expanded={isSetupChecklistExpanded}
                aria-controls="merchant-setup-steps"
                onClick={() => setIsSetupChecklistExpanded((expanded) => !expanded)}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#dfe8dd] bg-white px-3 text-xs font-bold text-[#155544] lg:hidden"
              >
                {isSetupChecklistExpanded ? 'Masquer les étapes' : 'Voir les étapes'}
                <ChevronDown className={`h-4 w-4 transition-transform ${isSetupChecklistExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
            <div id="merchant-setup-steps" className={`grid gap-2 sm:grid-cols-2 ${isSetupChecklistExpanded ? 'max-lg:grid' : 'max-lg:hidden'}`}>
              {[
                { label: 'Nom et coordonnées', detail: 'Nom, WhatsApp et localisation', done: Boolean(currentShop.name && currentShop.whatsapp_number && currentShop.city), action: () => { setActiveTab('settings'); setSettingsSubTab('general'); } },
                { label: 'Logo de la boutique', detail: 'Aidez vos clients à vous reconnaître', done: Boolean(currentShop.theme_config?.logo_url), action: () => { setActiveTab('settings'); setSettingsSubTab('themes'); } },
                { label: 'Ajouter vos premiers produits', detail: `${products.length} article${products.length === 1 ? '' : 's'} · limite du forfait : ${Number.isFinite(dashboardProductLimit) ? dashboardProductLimit : 'illimitée'}`, done: products.length > 0, action: () => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); } },
                { label: 'Vérifier votre identité', detail: isShopVerified ? 'Identité confirmée' : 'Requis avant la publication', done: isShopVerified, action: () => { setActiveTab('settings'); setSettingsSubTab('verification'); } },
                { label: 'Essai ou abonnement actif', detail: hasActiveSubscription ? 'Votre accès est actif' : 'Choisissez une formule pour publier', done: hasActiveSubscription, action: () => { setActiveTab('settings'); setSettingsSubTab('subscription'); } },
                { label: 'Publier votre boutique', detail: isShopPublished ? 'Votre vitrine est visible' : 'Activez la publication après les étapes requises', done: isShopPublished, action: () => {
                  if (isShopPublished) onOpenStorefront(currentShop.slug);
                  else if (!isShopVerified) { setActiveTab('settings'); setSettingsSubTab('verification'); }
                  else if (!hasActiveSubscription) { setActiveTab('settings'); setSettingsSubTab('subscription'); }
                  else void handlePublicationStatusChange('active');
                } },
              ].map((step, index) => (
                <button key={step.label} type="button" onClick={step.action} aria-label={`${step.done ? 'Modifier' : 'Compléter'} : ${step.label}`} className="flex min-h-[82px] items-start gap-3 rounded-2xl border border-[#e8e0d6] bg-white/90 px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-[#f8fdf9]">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${step.done ? 'bg-[#0f4d3d] text-white' : 'border-2 border-slate-300 bg-slate-50 text-slate-500'}`}>
                    {step.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-[#211712]">{step.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{step.detail}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-[22px] border border-[#dfe8dd] bg-[#f3faf6] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Action clé</p>
                  <h3 className="mt-1 text-lg font-black text-[#211712]">
                    {!isShopVerified
                      ? 'Vérifier mon identité'
                      : isAdminSuspended
                        ? 'Suspension administrative'
                        : isShopPublished
                          ? 'Boutique publiée'
                          : !hasActiveSubscription
                            ? 'Abonnement requis'
                            : 'Publier ma boutique'}
                  </h3>
                </div>
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isShopPublished ? 'bg-[#0f4d3d] text-white' : 'bg-white text-[#0f4d3d] ring-1 ring-[#dfe8dd]'}`}>
                  <Check className="h-4 w-4" />
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#4b5a52]">
                {!isShopVerified
                  ? 'La vérification de votre identité est nécessaire avant que votre boutique soit visible publiquement.'
                  : isAdminSuspended
                    ? 'Votre boutique a une restriction administrative. Contactez l’assistance pour la réactiver.'
                    : isShopPublished
                      ? 'Votre boutique est prête à recevoir des commandes et à être partagée.'
                      : !hasActiveSubscription
                        ? 'Un abonnement est nécessaire pour activer la publication et les commandes commerciales.'
                        : 'Activez immédiatement votre boutique pour qu’elle soit visible et commandeable.'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={!isShopVerified
                    ? () => { setActiveTab('settings'); setSettingsSubTab('verification'); }
                    : isAdminSuspended
                      ? () => toast.error('Contactez l’administration pour faire réexaminer la suspension.')
                    : isShopPublished
                      ? () => onOpenStorefront(currentShop.slug)
                      : !hasActiveSubscription
                        ? () => { setSettingsSubTab('subscription'); setActiveTab('settings'); }
                        : () => void handlePublicationStatusChange('active')}
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#0f4d3d] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#155544]"
                >
                  {isShopPublished ? 'Voir la boutique' : 'Continuer'}
                </button>
                <button
                  type="button"
                  onClick={() => isShopPublished ? copyOwnerLink('public') : toast.error('Publiez votre boutique avant de partager son lien public.')}
                  className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#dfe8dd] bg-white px-4 py-2 text-xs font-bold text-[#155544] transition hover:bg-[#edf7f0]"
                >
                  Partager le lien
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 lg:ml-64 lg:max-w-none lg:pb-6">
        <div className="grid gap-6 lg:grid-cols-1 lg:items-start">
          <nav aria-label="Navigation principale commerçant" className="merchant-sidebar hidden min-w-0 flex-col gap-1 overflow-y-auto p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64">
            <div className="mb-5 px-3 pt-3">
              <p className="text-2xl font-black tracking-tight text-white">MaTable.ci</p>
              <p className="mt-1 text-sm text-white/70">Espace commerçant</p>
            </div>
            {[
              { id: 'overview' as const, label: 'Tableau de bord', icon: LayoutDashboard },
              { id: 'catalog' as const, label: 'Catalogue', count: products.length, icon: Package },
              { id: 'orders' as const, label: 'Commandes', count: actionableOrderCount, icon: ShoppingBag },
              { id: 'stats' as const, label: 'Statistiques', icon: BarChart3 },
            ].map(({ id, label, icon: Icon, count }) => (
              <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`flex min-h-11 min-w-0 items-center justify-start gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all sm:text-sm lg:w-full ${activeTab === id ? 'border-transparent bg-[#176b55] text-white' : 'border-transparent bg-transparent text-white/90 hover:bg-[#176b55] hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${id === 'orders' ? 'bg-[#e6572b] text-white' : 'bg-white/15 text-white'}`}>{count}</span>
                )}
              </button>
            ))}
            <div className="my-2 border-t border-white/15" />
            <p className="px-3 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">À suivre</p>
            {[
              { id: 'subscription' as const, label: 'Abonnement', icon: CreditCard, badge: subscriptionNeedsAttention ? 'Échéance' : '' },
              { id: 'verification' as const, label: identityStatus === 'verified' ? 'Identité vérifiée' : 'Vérification d’identité', icon: ShieldCheck, badge: identityVerificationRequired ? 'À faire' : '' },
            ].map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" aria-current={activeTab === 'settings' && settingsSubTab === id ? 'page' : undefined} onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); }} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${activeTab === 'settings' && settingsSubTab === id ? 'bg-[#176b55] text-white' : 'text-white/90 hover:bg-[#176b55] hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>{badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-900">{badge}</span>}
              </button>
            ))}
            <div className="my-2 border-t border-white/15" />
            <p className="px-3 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Paramètres</p>
            {settingsNavigationGroups.map((group) => (
              <section key={group.label} className="mb-2">
                <h2 className="px-3 pb-1 text-[9px] font-black uppercase tracking-wide text-white/60">{group.label}</h2>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-current={activeTab === 'settings' && settingsSubTab === id ? 'page' : undefined} onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); }} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${activeTab === 'settings' && settingsSubTab === id ? 'bg-[#176b55] text-white' : 'text-white/90 hover:bg-[#176b55] hover:text-white'}`}>
                    <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
                  </button>
                ))}
              </section>
            ))}
            <p className="px-3 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/70">Partage</p>
            <button type="button" disabled={!isShopPublished} onClick={() => void copyOwnerLink('public')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/90 hover:bg-[#176b55] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"><Copy className="h-4 w-4 shrink-0" />Lien vitrine</button>
            <button type="button" onClick={() => void copyOwnerLink('private')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/90 hover:bg-[#176b55] sm:text-sm"><Key className="h-4 w-4 shrink-0" />Lien d’accès privé</button>
            {dashboardSupportUrl && <a href={dashboardSupportUrl} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/90 hover:bg-[#176b55] sm:text-sm"><MessageCircle className="h-4 w-4 shrink-0" />Centre d’aide</a>}
            <button type="button" onClick={handleLogout} className="mt-2 inline-flex min-h-11 min-w-max items-center justify-start gap-3 rounded-xl border-t border-white/15 px-3 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-[#176b55] hover:text-white sm:text-sm lg:w-full">
            <LogOut className="h-4 w-4 shrink-0" /><span>Déconnexion</span>
            </button>
          </nav>

          <div className="min-w-0">
          {activeTab === 'overview' && (
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Commandes', value: orders.length, hint: `${actionableOrderCount} à traiter`, tone: 'text-[#b94c24]', icon: ShoppingBag },
                  { label: 'Valeur des commandes', value: formatFCFA(orderValue), hint: 'Hors annulation et expiration', tone: 'text-[#1D6B57]', icon: DollarSign },
                  { label: 'Clients', value: uniqueCustomerCount, hint: 'Clients ayant commandé', tone: 'text-[#1D6B57]', icon: UserPlus },
                  { label: 'Articles', value: `${products.length} / ${Number.isFinite(dashboardProductLimit) ? dashboardProductLimit : '∞'}`, hint: 'Dans votre catalogue', tone: 'text-[#1D6B57]', icon: Package },
                ].map((metric) => <div key={metric.label} className="flex min-h-[104px] items-start gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] ${metric.tone}`}><metric.icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{metric.label}</p><strong className="mt-1 block truncate text-xl font-black text-[#211712]">{metric.value}</strong><p className="mt-1 truncate text-[11px] text-slate-500">{metric.hint}</p></div></div>)}
              </div>
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <section aria-labelledby="merchant-recent-orders-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#eee8dc] pb-3">
                    <h3 id="merchant-recent-orders-title" className="text-lg font-black text-[#155544]">Commandes récentes</h3>
                    <button type="button" onClick={() => setActiveTab('orders')} className="text-xs font-bold text-[#155544] underline underline-offset-2">Voir tout</button>
                  </div>
                  {recentOrders.length === 0 ? (
                    <p className="py-5 text-sm text-slate-500">Vos nouvelles commandes apparaîtront ici.</p>
                  ) : (
                    <ul className="divide-y divide-[#eee8dc]">
                      {recentOrders.map((order) => {
                        const orderItemName = order.items?.[0]?.product_title || order.customer_name;
                        const createdAt = Date.parse(order.created_at);
                        const orderDate = Number.isFinite(createdAt) ? new Date(createdAt) : null;
                        const today = new Date();
                        const isToday = orderDate !== null
                          && orderDate.getFullYear() === today.getFullYear()
                          && orderDate.getMonth() === today.getMonth()
                          && orderDate.getDate() === today.getDate();
                        const orderDateLabel = orderDate
                          ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(orderDate)
                          : 'Date indisponible';
                        const orderTime = orderDate
                          ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(orderDate)
                          : 'Heure indisponible';
                        return (
                          <li key={order.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8f1e7] text-[#e6572b]"><ShoppingBag className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-[#211712]">N° {order.id} · {orderItemName}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{isToday ? 'Aujourd’hui' : orderDateLabel}, {orderTime}</p>
                            </div>
                            <span className="rounded-full bg-[#e2eee8] px-2.5 py-1 text-xs font-bold text-[#155544]">{orderStatusLabels[order.status]}</span>
                            <strong className="min-w-24 text-right text-sm font-black text-[#211712]">{formatFCFA(order.total_amount)}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <section aria-labelledby="merchant-shop-card-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white">
                    <div className="h-16 bg-[#e2eee8]" />
                    <div className="-mt-7 px-4 pb-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[#f9f0e6] text-xl">
                        {currentShop.theme_config?.logo_url ? <img src={currentShop.theme_config.logo_url} alt="" className="h-full w-full rounded-full object-cover" /> : getCategoryDefaults(currentShop.category).icon}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 id="merchant-shop-card-title" className="font-black text-[#155544]">{currentShop.name}</h3>
                        {isShopVerified && <span className="rounded-full bg-[#e2eee8] px-2 py-0.5 text-[10px] font-bold text-[#155544]">Vérifiée</span>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{currentShop.city || 'Localisation à compléter'} · {currentShop.is_open ? 'Ouverte' : 'Fermée'}</p>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('general'); }} className="mt-3 min-h-10 w-full rounded-full border border-[#155544] px-3 text-xs font-bold text-[#155544] hover:bg-[#eaf4ef]">Modifier ma boutique</button>
                    </div>
                  </section>
                  <section aria-labelledby="merchant-quick-actions-title" className="rounded-2xl border border-[#e7dfd3] bg-white p-4">
                    <h3 id="merchant-quick-actions-title" className="mb-3 font-black text-[#155544]">Accès rapides</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); }} disabled={dashboardCatalogFull} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[#211712] hover:bg-[#eaf4ef] disabled:opacity-50"><Package className="mb-1 h-4 w-4 text-[#155544]" />Ajouter un produit</button>
                      <button type="button" onClick={() => setActiveTab('orders')} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[#211712] hover:bg-[#eaf4ef]"><ShoppingBag className="mb-1 h-4 w-4 text-[#155544]" />Voir les commandes</button>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('hours'); }} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[#211712] hover:bg-[#eaf4ef]"><Clock className="mb-1 h-4 w-4 text-[#155544]" />Gérer les horaires</button>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('profile'); }} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[#211712] hover:bg-[#eaf4ef]"><Key className="mb-1 h-4 w-4 text-[#155544]" />Profil et sécurité</button>
                    </div>
                  </section>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <div className="min-w-0 space-y-4">
                  <ProAnalyticsPanel shop={currentShop} compact />
                  <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e7dfd3] bg-[#f9f0e6] p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e6572b] text-white"><TrendingUp className="h-5 w-5" /></span>
                      <div>
                        <h3 className="font-black text-[#93602e]">Boostez votre visibilité</h3>
                        <p className="mt-0.5 text-xs text-slate-600">Mettez votre boutique en avant dans l’annuaire.</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('subscription'); }} className="min-h-10 rounded-full bg-[#0f4d3d] px-5 text-xs font-bold text-white hover:bg-[#176b55]">Découvrir</button>
                  </section>
                </div>
                <section aria-labelledby="merchant-latest-reviews-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-[#eee8dc] pb-3">
                    <div>
                      <h3 id="merchant-latest-reviews-title" className="text-lg font-black text-[#155544]">Derniers avis</h3>
                      {shopReviewSummary.average !== null && <p className="mt-1 text-xs font-semibold text-slate-500">{shopReviewSummary.average.toLocaleString('fr-FR')} / 5 · {shopReviewSummary.count} avis</p>}
                    </div>
                  </div>
                  {reviewsLoading && <p role="status" className="py-5 text-sm text-slate-500">Chargement des avis…</p>}
                  {reviewsError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{reviewsError}</p>}
                  {!reviewsLoading && !reviewsError && !reviewShopIsPublished && <p className="py-5 text-sm text-slate-500">Les avis apparaîtront après la publication de votre boutique.</p>}
                  {!reviewsLoading && !reviewsError && reviewShopIsPublished && shopReviews.length === 0 && <p className="py-5 text-sm text-slate-500">Aucun avis pour le moment.</p>}
                  {!reviewsLoading && !reviewsError && shopReviews.slice(0, 2).map((review) => (
                    <article key={review.id} className="flex gap-3 border-b border-[#eee8dc] py-3 last:border-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e2eee8] text-xs font-black text-[#155544]">{review.author_name.slice(0, 2).toLocaleUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#211712]">{review.author_name} <span className="font-normal text-slate-500">· {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(review.created_at))}</span></p>
                        <p className="mt-1 text-xs font-bold text-[#93602e]" aria-label={`${review.rating} sur 5 étoiles`}>{'★'.repeat(Math.max(0, Math.min(5, Math.round(review.rating))))}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-slate-600">{review.comment}</p>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </section>
        )}

        {activeTab === 'catalog' && <CatalogTab state={merchantState} filteredProducts={filteredProducts} />}
        {activeTab === 'orders' && <OrdersTab state={merchantState} filteredOrders={filteredOrders} orderValue={orderValue} averageOrderValue={avgBasket} />}
          {activeTab === 'stats' && <ProAnalyticsPanel shop={currentShop} />}
          {activeTab === 'settings' && <SettingsTab state={merchantState} />}
          </div>
        </div>
      </div>

      <nav aria-label="Navigation rapide commerçant" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#e7dfd3] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(33,23,18,0.08)] backdrop-blur lg:hidden">
        {[
          { id: 'overview' as const, label: 'Accueil', icon: LayoutDashboard },
          { id: 'catalog' as const, label: 'Produits', icon: Package },
          { id: 'orders' as const, label: 'Commandes', icon: ShoppingBag, count: actionableOrderCount },
          { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
        ].map(({ id, label, icon: Icon, count }) => (
          <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => { setActiveTab(id); setIsSettingsDrawerOpen(false); }} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold ${activeTab === id ? 'text-[#155544]' : 'text-slate-500'}`}>
            <Icon className="h-5 w-5" />
            <span>{label}</span>
            {count !== undefined && count > 0 && <span className="absolute right-[calc(50%-20px)] top-1 min-w-4 rounded-full bg-[#e6572b] px-1 text-center text-[9px] leading-4 text-white">{count}</span>}
          </button>
        ))}
        <button type="button" aria-label={mobileNotificationCount > 0 ? `Plus, ${mobileNotificationCount} priorité${mobileNotificationCount === 1 ? '' : 's'} à consulter` : 'Plus'} aria-expanded={isSettingsDrawerOpen} aria-controls="merchant-menu-drawer" onClick={() => setIsSettingsDrawerOpen(true)} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold ${isSettingsDrawerOpen || activeTab === 'settings' ? 'text-[#155544]' : 'text-slate-500'}`}>
          <MoreHorizontal className="h-5 w-5" /><span>Plus</span>
          {mobileNotificationCount > 0 && <span aria-hidden="true" className="absolute right-[calc(50%-18px)] top-0 min-w-4 rounded-full bg-[#e6572b] px-1 text-center text-[9px] leading-4 text-white">{mobileNotificationCount > 9 ? '9+' : mobileNotificationCount}</span>}
        </button>
      </nav>

      {isIdentityGuideOpen && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#211712]/60 p-0 sm:items-center sm:p-4">
          <button type="button" aria-label="Fermer le guide" onClick={dismissIdentityGuide} className="absolute inset-0" />
          <section role="dialog" aria-modal="true" aria-labelledby="identity-guide-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <button type="button" aria-label="Fermer le guide" onClick={dismissIdentityGuide} className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-900"><ShieldCheck className="h-6 w-6" /></span>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">Première étape</p>
            <h2 id="identity-guide-title" className="mt-1 pr-8 text-2xl font-black text-[#211712]">Bienvenue dans votre espace boutique</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Pour apparaître dans l’annuaire et recevoir des commandes, commencez par vérifier l’identité du responsable. Vous pourrez ensuite compléter votre vitrine et la publier.</p>
            <ol className="mt-5 space-y-3">
              {[
                ['Vérifier votre identité', 'Étape nécessaire avant la publication.'],
                ['Compléter votre vitrine', 'Ajoutez un logo, vos coordonnées et vos produits.'],
                ['Publier et partager', 'Vos clients pourront découvrir la boutique et vous contacter.'],
              ].map(([title, description], index) => <li key={title} className="flex items-start gap-3 rounded-xl border border-[#e7dfd3] bg-white p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eaf4ef] text-xs font-black text-[#155544]">{index + 1}</span><span><strong className="block text-sm text-[#211712]">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span></span></li>)}
            </ol>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={dismissIdentityGuide} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Plus tard</button>
              <button type="button" onClick={openIdentityVerification} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#155544] px-4 text-sm font-bold text-white hover:bg-[#0f4538]">Commencer la vérification<ChevronRight className="h-4 w-4" /></button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {subscriptionReminderDay !== null && createPortal(
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-[#211712]/60 p-0 sm:items-center sm:p-4">
          <button type="button" aria-label="Fermer le rappel d’abonnement" onClick={dismissSubscriptionReminder} className="absolute inset-0" />
          <section role="dialog" aria-modal="true" aria-labelledby="subscription-reminder-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <button type="button" aria-label="Fermer le rappel d’abonnement" onClick={dismissSubscriptionReminder} className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            <span className={`grid h-12 w-12 place-items-center rounded-2xl ${subscriptionReminderDay <= 3 ? 'bg-rose-100 text-rose-900' : 'bg-orange-100 text-orange-900'}`}><Clock className="h-6 w-6" /></span>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.14em] text-orange-800">Rappel d’échéance · J−{subscriptionReminderDay}</p>
            <h2 id="subscription-reminder-title" className="mt-1 pr-8 text-2xl font-black text-[#211712]">{subscriptionReminderDay === 1 ? 'Votre forfait se termine demain' : `Votre forfait se termine dans ${subscriptionReminderDay} jours`}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subscriptionStatus === 'trialing' ? 'Consultez les options de votre forfait pour préparer la suite après l’essai.' : 'Renouvelez votre forfait avant cette date pour conserver l’accès aux fonctionnalités incluses.'} Ce rappel restera dans votre tableau de bord jusqu’à son échéance.</p>
            <p className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">Les rappels WhatsApp suivent un calendrier séparé (J−14, J−7, J−3 et J−1) lorsque vous y avez consenti et que le service est configuré.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={dismissSubscriptionReminder} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Me le rappeler plus tard</button>
              <button type="button" onClick={() => { dismissSubscriptionReminder(); setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#155544] px-4 text-sm font-bold text-white hover:bg-[#0f4538]">Voir mon forfait<ChevronRight className="h-4 w-4" /></button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {isSettingsDrawerOpen && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" aria-label="Fermer le menu" onClick={() => setIsSettingsDrawerOpen(false)} className="absolute inset-0 bg-[#211712]/55" />
          <aside id="merchant-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="merchant-menu-title" className="absolute inset-y-0 right-0 flex h-dvh w-full max-w-md flex-col overflow-y-auto border-l border-[#ded8ce] bg-[#fffaf2] p-4 shadow-2xl sm:p-5">
            <header className="flex items-start justify-between gap-3 border-b border-[#ded8ce] pb-4">
              <div><p className="text-[10px] font-black uppercase text-[#e6572b]">MaTable.ci</p><h2 id="merchant-menu-title" className="mt-1 text-xl font-black text-[#211712]">Ma boutique</h2></div>
              <button type="button" onClick={() => setIsSettingsDrawerOpen(false)} aria-label="Fermer le menu" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"><X className="h-4 w-4" /></button>
            </header>
            <nav className="mt-5 space-y-5" aria-label="Navigation et réglages commerçant">
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">À suivre</p><div className="space-y-1">
                <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><CreditCard className="h-4 w-4 text-emerald-800" /><span className="flex-1">Abonnement</span>{subscriptionNeedsAttention && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-900">Échéance</span>}</button>
                <button type="button" onClick={() => { setSettingsSubTab('verification'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><ShieldCheck className="h-4 w-4 text-emerald-800" /><span className="flex-1">{identityStatus === 'verified' ? 'Identité vérifiée' : identityStatus === 'rejected' ? 'Reprendre la vérification' : 'Vérifier mon identité'}</span>{identityVerificationRequired && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">À faire</span>}</button>
              </div></div>
              <div>
                <p className="mb-2 text-[10px] font-black uppercase text-slate-500">Paramètres</p>
                <div className="space-y-4">
                  {settingsNavigationGroups.map((group) => (
                    <section key={group.label}>
                      <h3 className="px-3 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{group.label}</h3>
                      <div className="space-y-1">
                        {group.items.map(({ id, label, icon: Icon, badge }) => {
                          const isActive = activeTab === 'settings' && settingsSubTab === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              aria-current={isActive ? 'page' : undefined}
                              onClick={() => {
                                setSettingsSubTab(id);
                                setActiveTab('settings');
                                setIsSettingsDrawerOpen(false);
                              }}
                              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${
                                isActive ? 'bg-[#eaf4ef] text-[#155544]' : 'text-slate-800 hover:bg-emerald-50'
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0 text-emerald-800" />
                              <span className="flex-1">{label}</span>
                              {badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">{badge}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Partage</p>
                <button type="button" disabled={!isShopPublished} onClick={() => void copyOwnerLink('public')} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"><Copy className="h-4 w-4 text-emerald-800" />Lien vitrine</button>
                <button type="button" onClick={() => void copyOwnerLink('private')} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><Key className="h-4 w-4 text-emerald-800" />Lien d’accès privé</button>
                {!isShopPublished && <p className="px-3 text-[11px] leading-5 text-slate-500">Le lien public sera disponible après publication.</p>}
              </div>
            </nav>
            {dashboardSupportUrl && <a href={dashboardSupportUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"><MessageCircle className="h-4 w-4" />Aide et assistance</a>}
            <button type="button" onClick={handleLogout} className="mt-auto flex min-h-11 items-center gap-3 border-t border-[#ded8ce] pt-4 text-sm font-bold text-rose-800"><X className="h-4 w-4" />Déconnexion</button>
          </aside>
        </div>
      )}
      {confirmModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="merchant-confirm-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="merchant-confirm-title" className="text-base font-black text-slate-900">Confirmer l’action</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{confirmModal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmModal(null)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Garder la commande</button>
              <button type="button" onClick={() => { const confirmAction = confirmModal.onConfirm; setConfirmModal(null); confirmAction(); }} className="min-h-10 rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800">Confirmer l’annulation</button>
            </div>
          </section>
        </div>
      )}
      <ProductModal state={merchantState} />
    </div>
  );
};
