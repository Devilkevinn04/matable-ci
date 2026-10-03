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
} from 'lucide-react';
import { Shop, Product, Order, FlashBilan, ShopCategory, OrderStatus, ShopDeliveryZone, ShopSocialLinks } from '../../types';
import { formatFCFA, compressImageClientSide, cleanPhoneForWhatsApp } from '../../utils/format';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { useToast } from '../Toast';
import { CATEGORY_DEFAULTS, getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';

interface MerchantDashboardProps {
  currentShopSlug?: string;
  onOpenStorefront: (slug: string) => void;
  onBackToDirectory: () => void;
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
import { MerchantIdentityVerification } from './MerchantIdentityVerification';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront, onBackToDirectory, openRegistration = false }) => {

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
    prodModifiers,
    prodModifierMaxSelections,
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
    setProdModifiers,
    setProdModifierMaxSelections,
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

  if (!merchantState.currentShop) return <AuthScreens state={merchantState} onBackToDirectory={onBackToDirectory} />;

  const merchantIdentityVerified = !merchantState.currentShop.merchant_verification_status
    || ['not_required', 'verified'].includes(merchantState.currentShop.merchant_verification_status);
  if (merchantState.currentShop.subscription?.status === 'not_started') {
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
  if (['expired', 'past_due', 'suspended', 'cancelled'].includes(merchantState.currentShop.subscription?.status || '')) {
    return <MerchantTrialOnboarding shop={merchantState.currentShop} isStarting={false} onStart={handleStartTrial} mode="expired" />;
  }
  if (!merchantIdentityVerified) {
    const verificationSupportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour la vérification de ${merchantState.currentShop.name}.`);
    return (
      <main className="merchant-pre-dashboard min-h-screen bg-[#f4f6f1] px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex justify-end gap-2">
            <button type="button" onClick={onBackToDirectory} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Annuaire</button>
            {verificationSupportUrl && <a href={verificationSupportUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900"><MessageCircle className="h-3.5 w-3.5" />Aide</a>}
            <button type="button" onClick={handleLogout} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Déconnexion</button>
          </div>
          <p className="mb-4 text-sm font-bold text-slate-600">Essai gratuit · {merchantState.currentShop.subscription?.trialDaysRemaining ?? 0} jours restants</p>
          <MerchantIdentityVerification
            shopId={merchantState.currentShop.id}
            onStatusChange={(status) => setCurrentShop((shop) => shop ? { ...shop, merchant_verification_status: status.status as Shop['merchant_verification_status'] } : null)}
          />
        </div>
      </main>
    );
  }

  // 2. AUTHENTICATED -> MERCHANT DASHBOARD
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const dashboardSupportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour la boutique ${currentShop.name}.`);
  const avgBasket = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= 3).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;
  const isShopVerified = !currentShop.merchant_verification_status || ['not_required', 'verified'].includes(currentShop.merchant_verification_status);
  const hasActiveSubscription = currentShop.subscription?.isActive !== false;
  const isShopPublished = hasActiveSubscription && (currentShop.publication_status
    ? currentShop.publication_status === 'active'
    : currentShop.is_active && isShopVerified);
  const isShopLaunchReady = isShopPublished;

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
    if (orderStatusFilter !== 'all') {
      const currentStatus = o.status || 'pending';
      if (currentStatus !== orderStatusFilter) {
        return false;
      }
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
    <div className="merchant-dashboard min-h-screen pb-20">
      {/* Top Shop Control Bar */}
      <div className="bg-[#fffaf2] border-b-[3px] border-[#211712] sticky top-0 z-30 shadow-[0_8px_0_rgba(33,23,18,0.08)]">
        <div className="mx-auto grid max-w-5xl gap-3 px-4 py-3">
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

          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              onClick={handleToggleShopStatus}
              className={`flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-bold transition-colors sm:text-xs ${
                currentShop.is_open
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${currentShop.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="truncate">{currentShop.is_open ? 'Boutique ouverte' : 'Boutique fermée'}</span>
            </button>

            {!isShopVerified ? (
              <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('verification'); }} className="flex min-h-11 min-w-0 w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs">
                <span className="truncate">Identité à vérifier</span>
              </button>
            ) : !hasActiveSubscription ? (
              <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="flex min-h-11 min-w-0 w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs">
                Abonnement requis
              </button>
            ) : isShopPublished ? (
              <button
                onClick={() => onOpenStorefront(currentShop.slug)}
                className="flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-slate-800 sm:text-xs"
              >
                <span className="truncate">Voir ma vitrine</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handlePublicationStatusChange('active')}
                className="flex min-h-11 min-w-0 w-full items-center justify-center rounded-xl bg-slate-900 px-2 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-slate-800 sm:text-xs"
              >
                <span className="truncate">Publier ma boutique</span>
              </button>
            )}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="min-h-11 min-w-0 w-full truncate rounded-xl border border-slate-200 px-2 py-2 text-center text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 sm:text-xs"
              title="Se déconnecter"
            >
              Déconnexion
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

      {currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining <= 10 && (
        <div className={`flex flex-col gap-2 border-t px-4 py-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between ${currentShop.subscription.trialDaysRemaining <= 1 ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
          <span>{currentShop.subscription.trialDaysRemaining <= 1 ? 'Votre essai se termine demain.' : `Votre essai se termine dans ${currentShop.subscription.trialDaysRemaining} jours.`} Le renouvellement KadevPay sera disponible à la fin de l’essai.</span>
          <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="self-start font-extrabold underline underline-offset-2 sm:self-auto">Voir mon forfait</button>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pt-5">
        <section className="rounded-2xl border-2 border-[#211712] bg-[#fffaf2] p-4 shadow-[4px_4px_0_rgba(33,23,18,0.18)]" aria-labelledby="setup-checklist-title">
          <details className="group">
            <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e6572b]">Mise en route</p>
                <h2 id="setup-checklist-title" className="mt-1 text-base font-black text-[#211712]">Votre boutique est presque prête</h2>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <span className="rounded-full bg-[#edf7f2] px-3 py-1 text-xs font-black text-[#155c3d]">
                  {[Boolean(currentShop.name), Boolean(currentShop.theme_config?.logo_url), products.length > 0, products.length >= 3, isShopLaunchReady, isShopPublished].filter(Boolean).length}/6 étapes
                </span>
                <span className="text-xs font-bold text-[#176b55] group-open:hidden">Voir les étapes</span>
                <span className="hidden text-xs font-bold text-[#176b55] group-open:inline">Masquer</span>
                <ChevronRight className="h-4 w-4 text-[#176b55] transition-transform group-open:rotate-90" />
              </div>
            </summary>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'Ajouter le nom de ma boutique', done: Boolean(currentShop.name), action: () => { setActiveTab('settings'); setSettingsSubTab('general'); } },
                { label: 'Ajouter une photo ou un logo', done: Boolean(currentShop.theme_config?.logo_url), action: () => { setActiveTab('settings'); setSettingsSubTab('themes'); } },
                { label: 'Ajouter mon premier produit', done: products.length > 0, action: () => { setActiveTab('catalog'); handleOpenAddModal(); } },
                { label: 'Ajouter au moins 3 produits', done: products.length >= 3, action: () => { setActiveTab('catalog'); handleOpenAddModal(); } },
                {
                  label: !isShopVerified
                    ? 'Vérifier mon identité'
                    : !hasActiveSubscription
                      ? 'Abonnement requis'
                      : isShopPublished ? 'Boutique publiée' : 'Publier ma boutique',
                  done: isShopLaunchReady,
                  action: !isShopVerified
                    ? () => { setActiveTab('settings'); setSettingsSubTab('verification'); }
                    : !hasActiveSubscription
                      ? () => { setSettingsSubTab('subscription'); setActiveTab('settings'); }
                      : isShopPublished
                        ? () => onOpenStorefront(currentShop.slug)
                        : () => void handlePublicationStatusChange('active'),
                },
                { label: 'Partager ma boutique', done: isShopPublished, action: () => isShopPublished ? copyOwnerLink('public') : toast.error('Publiez votre boutique avant de partager son lien public.') },
              ].map((step) => (
                <button key={step.label} type="button" onClick={step.action} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#ded8ce] bg-white px-3 py-2.5 text-left text-xs font-bold text-[#34463d] transition hover:border-[#176b55] hover:bg-[#edf7f2]">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-[#155c3d] text-white' : 'border-2 border-[#b7c1b9] text-transparent'}`}>
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span>{step.label}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      </div>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6 border-b-[2px] border-[#211712] pb-3">
          <nav aria-label="Navigation principale commerçant" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { id: 'overview' as const, label: 'Accueil', icon: LayoutDashboard },
              { id: 'catalog' as const, label: `Catalogue (${products.length})`, icon: Package },
              { id: 'orders' as const, label: `Commandes (${orders.length})`, icon: ShoppingBag },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border-[2px] px-2 py-2.5 text-center text-xs font-bold transition-all sm:px-3 sm:text-sm ${activeTab === id ? 'border-[#211712] bg-[#1b3a63] text-white shadow-[3px_3px_0_rgba(33,23,18,0.95)]' : 'border-[#211712] bg-[#fffaf2] text-[#211712] hover:bg-white'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="truncate">{label}</span>
              </button>
            ))}
            <button type="button" aria-expanded={isSettingsDrawerOpen} onClick={() => setIsSettingsDrawerOpen(true)} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border-[2px] border-[#211712] bg-[#fffaf2] px-3 py-2.5 text-xs font-bold text-[#211712] transition hover:bg-white sm:text-sm">
              <Menu className="h-4 w-4 shrink-0" /><span>Menu</span>
            </button>
          </nav>
        </div>

        {activeTab === 'overview' && (
          <section className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-bold uppercase text-[#176b55]">Vue d’ensemble</p><h2 className="mt-1 text-xl font-black text-[#211712]">Bonjour, {currentShop.name}</h2><p className="mt-1 text-sm text-slate-600">Votre espace de travail pour aujourd’hui.</p></div>
              <span className={`self-start rounded-full px-3 py-1.5 text-xs font-extrabold ${isShopPublished ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>{isShopPublished ? 'Boutique publiée' : !isShopVerified ? 'Vérification en cours' : 'Boutique en brouillon'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Commandes', value: orders.length },
                { label: 'Articles au catalogue', value: `${products.length}${currentShop.subscription?.status === 'trialing' ? '/6' : ''}` },
                { label: 'Essai restant', value: currentShop.subscription?.status === 'trialing' ? `${currentShop.subscription.trialDaysRemaining} jours` : '—' },
                { label: 'Ouverture commerciale', value: currentShop.is_open ? 'Ouverte' : 'Fermée' },
              ].map((metric) => <div key={metric.label} className="rounded-xl border border-[#dce4dc] bg-white p-4"><p className="text-xs font-semibold text-slate-500">{metric.label}</p><strong className="mt-2 block text-xl font-black text-[#211712]">{metric.value}</strong></div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setActiveTab('catalog'); if (!(currentShop.subscription?.status === 'trialing' && products.length >= 6)) handleOpenAddModal(); }} disabled={currentShop.subscription?.status === 'trialing' && products.length >= 6} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f4d3d] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />Ajouter un article</button>
              <button type="button" onClick={() => setActiveTab('orders')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800"><ShoppingBag className="h-4 w-4" />Consulter les commandes</button>
            </div>
          </section>
        )}

        {activeTab === 'catalog' && <CatalogTab state={merchantState} filteredProducts={filteredProducts} />}
        {activeTab === 'orders' && <OrdersTab state={merchantState} filteredOrders={filteredOrders} totalRevenue={totalRevenue} avgBasket={avgBasket} />}
        {activeTab === 'settings' && <SettingsTab state={merchantState} />}
      </div>

      {isSettingsDrawerOpen && (
        <div className="fixed inset-0 z-[70]">
          <button type="button" aria-label="Fermer le menu" onClick={() => setIsSettingsDrawerOpen(false)} className="absolute inset-0 bg-[#211712]/55" />
          <aside role="dialog" aria-modal="true" aria-labelledby="merchant-menu-title" className="absolute inset-y-0 right-0 flex h-dvh w-full flex-col overflow-y-auto border-l-[3px] border-[#211712] bg-[#fffaf2] p-5 shadow-2xl sm:w-1/2">
            <header className="flex items-start justify-between gap-3 border-b border-[#ded8ce] pb-4">
              <div><p className="text-[10px] font-black uppercase text-[#e6572b]">MaTable.ci</p><h2 id="merchant-menu-title" className="mt-1 text-xl font-black text-[#211712]">Ma boutique</h2></div>
              <button type="button" onClick={() => setIsSettingsDrawerOpen(false)} aria-label="Fermer le menu" className="rounded-lg border border-slate-300 bg-white p-2 text-slate-700"><X className="h-4 w-4" /></button>
            </header>
            <nav className="mt-5 space-y-5" aria-label="Réglages et services">
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
      <ProductModal state={merchantState} />
    </div>
  );
};
