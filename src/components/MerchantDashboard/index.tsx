import React, { useState, useEffect } from 'react';
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
  Boxes
} from 'lucide-react';
import { Shop, Product, Order, FlashBilan, ShopCategory, OrderStatus, ShopDeliveryZone, ShopSocialLinks } from '../../types';
import { formatFCFA, compressImageClientSide, cleanPhoneForWhatsApp } from '../../utils/format';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { useToast } from '../Toast';
import { CATEGORY_DEFAULTS, getCategoryDefaults, SHOP_CATEGORIES } from '../../utils/categoryDefaults';

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

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront, onBackToDirectory, openRegistration = false }) => {

  const merchantState = useMerchantDashboard(onOpenStorefront, openRegistration);
  const [verificationStarting, setVerificationStarting] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
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
    recoveryLoading,
    recoveryInfo,
    recoveryCodeInput,
    forgotPinInfo,
    isRegisterModalOpen,
    regName,
    regPhone,
    regPin,
    regCity,
    regCityOther,
    regEmail,
    regCategory,
    regLoading,
    registrationLinks,
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
    setRecoveryLoading,
    setRecoveryInfo,
    setRecoveryCodeInput,
    setForgotPinInfo,
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
    handleForgotPin,
    handleRecoveryRequest,
    handleRecoveryCodeVerification,
    handleLogout,
    handleToggleShopStatus,
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
    copyRegistrationLinks,
    copyOwnerLink
  } = merchantState;

  if (!merchantState.currentShop) return <AuthScreens state={merchantState} onBackToDirectory={onBackToDirectory} />;

  const verificationStatus = merchantState.currentShop.merchant_verification_status || 'not_required';
  if (!['approved', 'not_required'].includes(verificationStatus)) {
    const canRetry = verificationStatus === 'rejected' || verificationStatus === 'retry_required';
    const startVerification = async () => {
      if (!merchantState.currentShop || verificationStarting) return;
      setVerificationStarting(true);
      setVerificationError(null);
      try {
        const response = await fetch(`/api/shops/${merchantState.currentShop.id}/merchant-verification/start`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok || !result.verification_url) throw new Error(result.error || 'Impossible de lancer la vérification.');
        window.location.assign(result.verification_url);
      } catch (error) {
        setVerificationError((error as Error).message);
        setVerificationStarting(false);
      }
    };

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f3ed] px-4 py-10">
        <section className="w-full max-w-lg rounded-2xl border border-[#deded5] bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#edf3ec] text-[#0f4d3d]">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#e6572b]">Espace marchand</p>
          <h1 className="mt-2 text-2xl font-extrabold text-[#25231f]">{merchantState.currentShop.name}</h1>
          <h2 className="mt-5 text-lg font-bold text-[#0f4d3d]">
            {verificationStatus === 'pending' ? 'Vérification en cours' : verificationStatus === 'rejected' ? 'Vérification à reprendre' : 'Session de vérification expirée'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#68756c]">
            {verificationStatus === 'pending'
              ? 'Votre identité est en cours de vérification. Les outils de gestion seront ouverts après approbation.'
              : 'La vérification n’a pas abouti ou la session a expiré. Vous pouvez lancer une nouvelle vérification sécurisée.'}
          </p>
          {verificationError && <p role="alert" className="mt-4 rounded-lg bg-[#fdf1ee] px-3 py-2 text-sm text-[#b93712]">{verificationError}</p>}
          {canRetry && (
            <button type="button" onClick={startVerification} disabled={verificationStarting} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:opacity-60">
              {verificationStarting ? 'Ouverture sécurisée…' : 'Recommencer la vérification'}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={merchantState.handleLogout} className="mt-3 min-h-10 w-full rounded-full px-4 py-2 text-sm font-semibold text-[#68756c] hover:bg-[#f6f3ed]">
            Se déconnecter
          </button>
        </section>
      </main>
    );
  }

  // 2. AUTHENTICATED -> MERCHANT DASHBOARD
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_amount, 0);
  const avgBasket = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;
  const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= 3).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

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
        if (!['mobile_money', 'orange_money', 'mtn_money', 'moov_money'].includes(o.payment_method_preference)) {
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
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
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  GRATUIT
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">
                Vitrine : <span className="font-mono text-slate-800">matable.ci/{currentShop.slug}</span>
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {/* Open/Close toggle */}
            <button
              onClick={handleToggleShopStatus}
              className={`flex flex-1 justify-center py-2 px-3.5 rounded-xl font-bold text-xs items-center gap-1.5 transition-colors sm:flex-none ${
                currentShop.is_open
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${currentShop.is_open ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{currentShop.is_open ? 'Boutique Ouverte' : 'Boutique Fermée'}</span>
            </button>

            {/* View storefront preview */}
            <button
              onClick={() => onOpenStorefront(currentShop.slug)}
              className="flex flex-1 justify-center py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs items-center gap-1.5 transition-colors shadow-2xs sm:flex-none"
            >
              <span>Voir ma vitrine</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => copyOwnerLink('public')}
              className="flex flex-1 justify-center py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-xs items-center gap-1.5 transition-colors sm:flex-none"
            >
              <Copy className="w-3.5 h-3.5" /> Copier vitrine
            </button>

            <button
              type="button"
              onClick={() => copyOwnerLink('private')}
              className="flex flex-1 justify-center py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs items-center gap-1.5 transition-colors sm:flex-none"
            >
              <Key className="w-3.5 h-3.5" /> Copier accès
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors sm:flex-none"
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

      {registrationLinks && (
        <div className="max-w-5xl mx-auto px-4 pt-5">
          <div className="rounded-[1.6rem] border-[3px] border-[#211712] bg-gradient-to-r from-[#edf7f2] via-[#fffaf2] to-[#edf2fb] p-4 shadow-[5px_5px_0_rgba(33,23,18,0.96)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-black text-emerald-950 text-sm">Votre boutique est créée</h2>
                <p className="text-xs text-emerald-800 mt-1">Conservez votre lien vitrine et votre espace privé. Votre boutique est disponible dès maintenant.</p>
              </div>
            </div>
              <div className="mt-3 flex flex-wrap gap-2">
              <a href={registrationLinks.publicUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Voir ma vitrine</a>
              <button type="button" onClick={() => navigator.clipboard.writeText(registrationLinks.publicUrl).then(() => toast.success('Lien vitrine copié.')).catch(() => toast.error('La copie a échoué.'))} className="px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Copier la vitrine</button>
              <button type="button" onClick={() => navigator.clipboard.writeText(registrationLinks.privateUrl).then(() => toast.success('Lien privé copié.')).catch(() => toast.error('La copie a échoué.'))} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold">Copier l’accès</button>
              <a href={registrationLinks.whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Partager sur WhatsApp</a>
              {registrationLinks.emailUrl && <a href={registrationLinks.emailUrl} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Préparer un email</a>}
              <button type="button" onClick={copyRegistrationLinks} className="px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Copier les liens d’accès</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Navigation Tabs */}
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2 border-b-[2px] border-[#211712]">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shrink-0 border-[2px] ${
              activeTab === 'catalog'
                ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]'
                : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-white'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Catalogue ({products.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shrink-0 border-[2px] ${
              activeTab === 'orders'
                ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]'
                : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Commandes ({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shrink-0 border-[2px] ${
              activeTab === 'settings'
                ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]'
                : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-white'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Thème & Paramètres</span>
          </button>
        </div>

        {activeTab === 'catalog' && <CatalogTab state={merchantState} filteredProducts={filteredProducts} />}
        {activeTab === 'orders' && <OrdersTab state={merchantState} filteredOrders={filteredOrders} totalRevenue={totalRevenue} avgBasket={avgBasket} />}
        {activeTab === 'settings' && <SettingsTab state={merchantState} />}
      </div>
      <ProductModal state={merchantState} />
    </div>
  );
};
