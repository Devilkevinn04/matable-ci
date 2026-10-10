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
  Menu,
  ShieldCheck,
  CreditCard,
  MessageCircle,
  LogOut,
} from 'lucide-react';
import { Shop, Product, Order, FlashBilan, ShopCategory, OrderStatus, ShopDeliveryZone, ShopSocialLinks } from '../../types';
import { formatFCFA, compressImageClientSide, cleanPhoneForWhatsApp } from '../../utils/format';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { useToast } from '../Toast';
import { CATEGORY_DEFAULTS, getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { getSubscriptionAccessCutoff, TRIAL_CATALOG_LIMIT } from '../../utils/subscriptionFeatures';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';

interface MerchantDashboardProps {
  currentShopSlug?: string;
  onOpenStorefront: (slug: string) => void;
  onBackToDirectory: () => void;
  onCustomerLogin: () => void;
  openRegistration?: boolean;
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

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront, onBackToDirectory, onCustomerLogin, openRegistration = false }) => {

  const merchantState = useMerchantDashboard(onOpenStorefront, openRegistration);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
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
  const isShopLaunchReady = isShopPublished;
  const productChecklistTarget = currentShop.subscription?.status === 'trialing' ? TRIAL_CATALOG_LIMIT : 3;

  // Filter products for catalog tab
  const filteredProducts = products.filter(p => {
    // Search match
    const matchesSearch = !catalogSearch.trim() ||
      p.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(catalogSearch.toLowerCase()));

    if (!matchesSearch) return false;

    // Filter match
    if (catalogFilter === 'in_stock') return p.stock > 3 && p.is_available !== false;
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

  return (
    <div className="merchant-dashboard min-h-screen pb-20 bg-[#fffaf2]">
      {currentShop.admin_mode && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-xs font-bold text-white">
          <span>Mode super-admin · Gestion complète de {currentShop.name}</span>
          <button type="button" onClick={() => window.location.assign('/admin')} className="rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">Retour à l’administration</button>
        </div>
      )}
      {/* Top Shop Control Bar */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {currentShop.theme_config?.logo_url ? (
              <img
                src={currentShop.theme_config.logo_url}
                alt={currentShop.name}
                className="w-10 h-10 rounded-xl object-cover border border-slate-200 bg-white shadow-xs shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-xs shrink-0"
                style={{ backgroundColor: currentShop.theme_config?.primary_color || currentShop.theme_color || '#0F172A' }}
              >
                <span aria-hidden="true">{getCategoryDefaults(currentShop.category).icon}</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="max-w-full truncate font-black text-slate-900 text-base sm:text-lg">{currentShop.name}</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {getCategoryDefaults(currentShop.category).icon} {getCategoryDefaults(currentShop.category).label}
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${currentShop.subscription?.status === 'trialing' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : currentShop.subscription?.status === 'expired' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  {currentShop.subscription?.status === 'trialing' ? `ESSAI · ${currentShop.subscription.trialDaysRemaining} j` : currentShop.subscription?.status === 'expired' ? 'ESSAI TERMINÉ' : 'ABONNÉE'}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">
                Vitrine : <span className="font-mono text-slate-800">matable.ci/{currentShop.slug}</span>
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
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

            <button
              type="button"
              aria-label="Ouvrir le menu commerçant"
              aria-expanded={isSettingsDrawerOpen}
              aria-controls="merchant-menu-drawer"
              onClick={() => setIsSettingsDrawerOpen(true)}
              className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4 shrink-0" />Menu
            </button>
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

      {!isShopVerified && (
        <div role="status" className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Votre boutique reste en veille jusqu’à la vérification Didit. Une fois votre identité confirmée, elle réapparaîtra sur le site ; un abonnement actif restera nécessaire pour recevoir des commandes.</span>
          </p>
          <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('verification'); }} className="min-h-10 shrink-0 self-start rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950 hover:bg-amber-100 sm:self-auto">
            Vérifier mon identité
          </button>
        </div>
      )}

      {activeTab === 'overview' && currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining <= 10 && (
        <div className={`flex flex-col gap-2 border-t px-4 py-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between ${currentShop.subscription.trialDaysRemaining <= 1 ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
          <span>{currentShop.subscription.trialDaysRemaining <= 1 ? 'Votre essai se termine demain.' : `Votre essai se termine dans ${currentShop.subscription.trialDaysRemaining} jours.`} Le renouvellement KadevPay sera disponible à la fin de l’essai.</span>
          <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="self-start font-extrabold underline underline-offset-2 sm:self-auto">Voir mon forfait</button>
        </div>
      )}

      {activeTab === 'overview' && (
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <section className="overflow-hidden rounded-[26px] border border-[#e7dfd3] bg-gradient-to-br from-[#fffdf8] via-[#fefaf4] to-[#edf7f0] p-4 shadow-[0_16px_36px_rgba(37,35,31,0.05)] sm:p-5" aria-labelledby="setup-checklist-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Lancement boutique</p>
              <h2 id="setup-checklist-title" className="mt-1 text-xl font-black text-[#211712] sm:text-2xl">Votre vitrine est presque prête</h2>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-[#e8e0d6] sm:self-auto">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Progression</span>
              <span className="rounded-full bg-[#eaf4ef] px-2.5 py-1 text-xs font-black text-[#155544]">
                {[Boolean(currentShop.name), Boolean(currentShop.theme_config?.logo_url), products.length > 0, products.length >= productChecklistTarget, isShopLaunchReady, isShopPublished].filter(Boolean).length}/6
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: 'Nom boutique', done: Boolean(currentShop.name), action: () => { setActiveTab('settings'); setSettingsSubTab('general'); } },
                { label: 'Logo / photo', done: Boolean(currentShop.theme_config?.logo_url), action: () => { setActiveTab('settings'); setSettingsSubTab('themes'); } },
                { label: 'Premier produit', done: products.length > 0, action: () => { setActiveTab('catalog'); handleOpenAddModal(); } },
                { label: `${productChecklistTarget} produits minimum`, done: products.length >= productChecklistTarget, action: () => { setActiveTab('catalog'); handleOpenAddModal(); } },
              ].map((step) => (
                <button key={step.label} type="button" onClick={step.action} className="flex min-h-[74px] items-start gap-3 rounded-2xl border border-[#e8e0d6] bg-white/90 px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-[#f8fdf9]">
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-[#0f4d3d] text-white' : 'border-2 border-slate-300 bg-slate-50 text-transparent'}`}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Étape</span>
                    <span className="mt-1 block text-sm font-bold text-[#211712]">{step.label}</span>
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
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isShopLaunchReady ? 'bg-[#0f4d3d] text-white' : 'bg-white text-[#0f4d3d] ring-1 ring-[#dfe8dd]'}`}>
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
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
          <nav aria-label="Navigation principale commerçant" className="hidden min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-2 lg:sticky lg:top-28 lg:flex lg:flex-col lg:gap-1">
            <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Espace commerçant</p>
            {[
              { id: 'overview' as const, label: 'Accueil', icon: LayoutDashboard },
              { id: 'catalog' as const, label: 'Catalogue', count: products.length, icon: Package },
              { id: 'orders' as const, label: 'Commandes', count: actionableOrderCount, icon: ShoppingBag },
            ].map(({ id, label, icon: Icon, count }) => (
              <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`flex min-h-11 min-w-0 items-center justify-start gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all sm:text-sm lg:w-full ${activeTab === id ? 'border-[#1D6B57]/10 bg-[#eaf4ef] text-[#155544]' : 'border-transparent bg-white text-slate-700 hover:bg-[#f7f4ee]'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${id === 'orders' ? 'bg-[#e6572b] text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
                )}
              </button>
            ))}
            <button type="button" aria-current={activeTab === 'settings' ? 'page' : undefined} onClick={() => { setSettingsSubTab('general'); setActiveTab('settings'); }} className={`inline-flex min-h-11 min-w-max items-center justify-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-xs font-bold transition hover:bg-[#f7f4ee] sm:text-sm lg:w-full ${activeTab === 'settings' ? 'bg-[#eaf4ef] text-[#155544]' : 'bg-white text-slate-700'}`}>
            <Store className="h-4 w-4 shrink-0" /><span>Paramètres</span>
            </button>
            <button type="button" onClick={handleLogout} className="mt-2 inline-flex min-h-11 min-w-max items-center justify-start gap-3 rounded-xl border-t border-[#eee8dc] px-3 py-2.5 text-left text-xs font-bold text-slate-500 transition hover:bg-[#fff6ea] hover:text-[#b94c24] sm:text-sm lg:w-full">
            <LogOut className="h-4 w-4 shrink-0" /><span>Déconnexion</span>
            </button>
          </nav>

          <div className="min-w-0">
          {activeTab === 'overview' && (
            <section className="space-y-4">
              <div className="flex flex-col gap-4 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#1D6B57]">Vue d’ensemble</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-[#211712]">Bonjour, {currentShop.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">Les informations essentielles de votre boutique.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { setActiveTab('catalog'); if (currentShop.admin_mode || !(currentShop.subscription?.status === 'trialing' && products.length >= TRIAL_CATALOG_LIMIT)) handleOpenAddModal(); }} disabled={!currentShop.admin_mode && currentShop.subscription?.status === 'trialing' && products.length >= TRIAL_CATALOG_LIMIT} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1D6B57] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#155544] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Ajouter un article</button>
                </div>
              </div>
              {(actionableOrderCount > 0 || lowStockCount > 0 || outOfStockCount > 0) && (
                <section aria-labelledby="merchant-priorities-title" className="rounded-2xl border border-[#edc59c] bg-[#fff6ea] p-4">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fce7d6] text-[#b94c24]"><AlertTriangle className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 id="merchant-priorities-title" className="text-sm font-black text-[#211712]">À traiter en priorité</h3>
                      <p className="mt-0.5 text-xs text-slate-600">Commandes en cours et articles à réapprovisionner.</p>
                    </div>
                    <div className="flex w-full flex-wrap justify-start gap-2 sm:w-auto sm:justify-end">
                      {actionableOrderCount > 0 && (
                        <button
                          type="button"
                          onClick={() => { setOrderSearch(''); setOrderPaymentFilter('all'); setOrderStatusFilter('actionable'); setActiveTab('orders'); }}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#1D6B57] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#155544]"
                        >
                          <ShoppingBag className="h-4 w-4" />
                          {actionableOrderCount} commande{actionableOrderCount > 1 ? 's' : ''}
                        </button>
                      )}
                      {outOfStockCount > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCatalogSearch(''); setCatalogFilter('out_of_stock'); setActiveTab('catalog'); }}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e6572b]/30 bg-white px-3 py-2 text-xs font-bold text-[#a43b1d] transition hover:bg-[#fff0e8]"
                        >
                          <Package className="h-4 w-4" />
                          {outOfStockCount} épuisé{outOfStockCount > 1 ? 's' : ''}
                        </button>
                      )}
                      {lowStockCount > 0 && (
                        <button
                          type="button"
                          onClick={() => { setCatalogSearch(''); setCatalogFilter('low_stock'); setActiveTab('catalog'); }}
                          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-50"
                        >
                          <AlertTriangle className="h-4 w-4" />
                          {lowStockCount} stock{lowStockCount > 1 ? 's' : ''} bas
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'À traiter', value: actionableOrderCount, hint: `${orders.length} commande${orders.length === 1 ? '' : 's'} au total`, tone: 'text-[#b94c24]', icon: ShoppingBag },
                  { label: 'Articles', value: `${products.length}${currentShop.subscription?.status === 'trialing' ? ` / ${TRIAL_CATALOG_LIMIT}` : ''}`, hint: 'Dans votre catalogue', tone: 'text-[#1D6B57]', icon: Package },
                  { label: 'Statut boutique', value: currentShop.is_open ? 'Ouverte' : 'Fermée', hint: isShopPublished ? 'Vitrine publiée' : isAdminSuspended ? 'Suspendue par l’administration' : !isShopVerified ? 'Vérification en cours' : 'Vitrine en veille', tone: currentShop.is_open ? 'text-[#1D6B57]' : 'text-amber-700', icon: Store },
                  ...(currentShop.subscription?.status === 'trialing' ? [{ label: 'Essai gratuit', value: `${currentShop.subscription.trialDaysRemaining} j`, hint: 'Restants', tone: 'text-[#b94c24]', icon: Clock }] : []),
                ].map((metric) => <div key={metric.label} className="flex min-h-[104px] items-start gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] ${metric.tone}`}><metric.icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{metric.label}</p><strong className="mt-1 block truncate text-xl font-black text-[#211712]">{metric.value}</strong><p className="mt-1 truncate text-[11px] text-slate-500">{metric.hint}</p></div></div>)}
              </div>
            </section>
        )}

        {activeTab === 'catalog' && <CatalogTab state={merchantState} filteredProducts={filteredProducts} />}
        {activeTab === 'orders' && <OrdersTab state={merchantState} filteredOrders={filteredOrders} orderValue={orderValue} averageOrderValue={avgBasket} />}
          {activeTab === 'settings' && <SettingsTab state={merchantState} />}
          </div>
        </div>
      </div>

      {isSettingsDrawerOpen && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" aria-label="Fermer le menu" onClick={() => setIsSettingsDrawerOpen(false)} className="absolute inset-0 bg-[#211712]/55" />
          <aside id="merchant-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="merchant-menu-title" className="absolute inset-y-0 right-0 flex h-dvh w-full flex-col overflow-y-auto border-l-[3px] border-[#211712] bg-[#fffaf2] p-5 shadow-2xl sm:w-1/2">
            <header className="flex items-start justify-between gap-3 border-b border-[#ded8ce] pb-4">
              <div><p className="text-[10px] font-black uppercase text-[#e6572b]">MaTable.ci</p><h2 id="merchant-menu-title" className="mt-1 text-xl font-black text-[#211712]">Ma boutique</h2></div>
              <button type="button" onClick={() => setIsSettingsDrawerOpen(false)} aria-label="Fermer le menu" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"><X className="h-4 w-4" /></button>
            </header>
            <nav className="mt-5 space-y-5" aria-label="Navigation et réglages commerçant">
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Espace commerçant</p><div className="space-y-1">
                {[
                  { id: 'overview' as const, label: 'Accueil', icon: LayoutDashboard },
                  { id: 'catalog' as const, label: 'Catalogue', count: products.length, icon: Package },
                  { id: 'orders' as const, label: 'Commandes', count: actionableOrderCount, icon: ShoppingBag },
                ].map(({ id, label, icon: Icon, count }) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => { setActiveTab(id); setIsSettingsDrawerOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${activeTab === id ? 'bg-[#eaf4ef] text-[#155544]' : 'text-slate-800 hover:bg-[#f7f4ee]'}`}><Icon className="h-4 w-4 text-[#1D6B57]" /><span className="flex-1">{label}</span>{count !== undefined && count > 0 && <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${id === 'orders' ? 'bg-[#e6572b] text-white' : 'bg-slate-100 text-slate-600'}`}>{count}</span>}</button>)}
              </div></div>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Boutique</p><div className="space-y-1">
                {[
                  ['themes', 'Apparence', Palette],
                  ['general', 'Informations & livraison', Store],
                  ['hours', 'Horaires', Clock],
                ].map(([tab, label, Icon]) => <button key={tab as string} type="button" onClick={() => { setSettingsSubTab(tab as typeof settingsSubTab); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><Icon className="h-4 w-4 text-emerald-800" />{label as string}</button>)}
              </div></div>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Vérification</p><button type="button" onClick={() => { setSettingsSubTab('verification'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><ShieldCheck className="h-4 w-4 text-emerald-800" />Identité</button></div>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Abonnement</p><button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><CreditCard className="h-4 w-4 text-emerald-800" />Mon forfait</button></div>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Analyse</p><button type="button" onClick={() => { setSettingsSubTab('bilan'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><Send className="h-4 w-4 text-emerald-800" />Bilan WhatsApp</button></div>
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
