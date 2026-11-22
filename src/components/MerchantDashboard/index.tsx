import React, { useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from '../AnimatedNumber';
import { SegmentedBar } from '../charts/SegmentedBar';
import { groupOrdersByStatus } from '../../utils/chartData';
import { useTabFade } from '../useTabFade';
import { createPortal } from 'react-dom';
import {
  Store,
  ShoppingBag,
  Package,
  Plus,
  Clock,
  Check,
  Send,
  ExternalLink,
  ChevronRight,
  UserPlus,
  X,
  Search,
  TrendingUp,
  DollarSign,
  Palette,
  Key,
  AlertTriangle,
  Copy,
  QrCode,
  RotateCcw,
  LayoutDashboard,
  ShieldCheck,
  CreditCard,
  MessageCircle,
  LogOut,
  BarChart3,
  MoreHorizontal,
  Bell,
  BookOpen,
  Star,
  Gift,
} from 'lucide-react';
import { OrderStatus } from '../../types';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { getMerchantVocabulary } from '../../utils/merchantVocabulary';
import { getSubscriptionAccessCutoff, getSubscriptionProductLimit, TRIAL_CATALOG_LIMIT } from '../../utils/subscriptionFeatures';
import { hasShopPublicationSubscriptionAccess, isShopPubliclyVisible } from '../../utils/shopPublication';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';
import { Link } from 'react-router-dom';
import { CategoryIcon } from '../CategoryIcon';


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

interface PaymentReturnNotice {
  paymentId: string;
  status: 'checking' | 'success' | 'error' | 'pending';
  message: string;
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

import { useMerchantDashboard } from './useMerchant';
import { AuthScreens } from './AuthScreens';
import { CatalogTab } from './CatalogTab';
import { OrdersTab } from './OrdersTab';
import { SettingsTab } from './SettingsTab';
import { ProductModal } from './ProductModal';
import { MerchantTrialOnboarding } from './MerchantTrialOnboarding';
import { ProAnalyticsPanel } from './ProAnalyticsPanel';
import { LoyaltyTab } from './LoyaltyTab';
import { MerchantQrShareKit } from './MerchantQrShareKit';
import { MerchantPushPrompt } from './MerchantPushPrompt';
import { PendingOrdersQueue } from './PendingOrdersQueue';
import { ConfirmSheetView } from '../ui/ConfirmSheet';
import { lockBodyScroll } from '../../utils/scrollLock';

// Une seule palette d’états : orange = à traiter, vert = en cours ou réussie, gris = terminée sans suite.
const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'bg-orange-50 text-orange-900',
  confirmed: 'bg-[#e2eee8] text-[var(--mt-green-hover)]',
  preparing: 'bg-[#e2eee8] text-[var(--mt-green-hover)]',
  ready: 'bg-[#e2eee8] text-[var(--mt-green-hover)]',
  delivered: 'bg-[var(--mt-green-deep)] text-white',
  cancelled: 'bg-slate-100 text-slate-600',
  rejected: 'bg-slate-100 text-slate-600',
  expired: 'bg-slate-100 text-slate-600',
};

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront, onBackToDirectory, onCustomerLogin, openRegistration = false }) => {

  const merchantState = useMerchantDashboard(onOpenStorefront, openRegistration);
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isLoyaltyOpen, setIsLoyaltyOpen] = useState(false);
  const settingsDrawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isIdentityGuideOpen, setIsIdentityGuideOpen] = useState(false);
  const [isQrKitOpen, setIsQrKitOpen] = useState(false);
  const [privateAccessLinkForCopy, setPrivateAccessLinkForCopy] = useState<string | null>(null);
  const [subscriptionReminderDay, setSubscriptionReminderDay] = useState<number | null>(null);
  const [paymentIdToCheck, setPaymentIdToCheck] = useState<string | null>(null);
  const [paymentReturnNonce, setPaymentReturnNonce] = useState(0);
  const [paymentReturnNotice, setPaymentReturnNotice] = useState<PaymentReturnNotice | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [shopReviews, setShopReviews] = useState<MerchantReview[]>([]);
  const [shopReviewSummary, setShopReviewSummary] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const reviewShop = merchantState.currentShop;
  const reviewShopIsPublished = Boolean(reviewShop && isShopPubliclyVisible(reviewShop));

  useEffect(() => {
    if (merchantState.currentShop) return;
    setIsSettingsDrawerOpen(false);
    setIsIdentityGuideOpen(false);
    setIsQrKitOpen(false);
    setSubscriptionReminderDay(null);
  }, [merchantState.currentShop?.id]);

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
    if (!isSettingsDrawerOpen) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unlockScroll = lockBodyScroll();
    settingsDrawerCloseButtonRef.current?.focus();

    const handleDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsDrawerOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const drawer = document.getElementById('merchant-menu-drawer');
      if (!drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleDrawerKeyDown);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', handleDrawerKeyDown);
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, [isSettingsDrawerOpen]);

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
    const identityStatus = shop?.identity_verification_status || shop?.merchant_verification_status;
    if (!shop || shop.admin_mode || !identityStatus
      || !['pending', 'rejected', 'action_required'].includes(identityStatus)) {
      setIsIdentityGuideOpen(false);
      return;
    }

    const guideKey = `matable:merchant-identity-guide:${shop.id}`;
    try {
      if (window.localStorage.getItem(guideKey) !== 'seen') setIsIdentityGuideOpen(true);
    } catch {
      setIsIdentityGuideOpen(true);
    }
  }, [
    merchantState.currentShop?.id,
    merchantState.currentShop?.admin_mode,
    merchantState.currentShop?.merchant_verification_status,
    merchantState.currentShop?.identity_verification_status,
  ]);
  const {
    currentShop,
    confirmModal,
    handleUpdateOrderStatus,
    activeTab,
    settingsSubTab,
    products,
    orders,
    catalogSearch,
    catalogFilter,
    orderSearch,
    orderPaymentFilter,
    orderStatusFilter,
    hoursEnabled,
    manualOverride,
    setConfirmModal,
    setActiveTab,
    setSettingsSubTab,
    setCatalogSearch,
    setCatalogFilter,
    setOrderSearch,
    setOrderPaymentFilter,
    setOrderStatusFilter,
    handleStartTrial,
    handleLogout,
    handleToggleShopStatus,
    handlePublicationStatusChange,
    handleResetManualOverride,
    handleOpenAddModal,
    toast,
    copyOwnerLink
  } = merchantState;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab, settingsSubTab]);
  const tabPanel = useTabFade(activeTab);

  // L’onglet Fidélité n’apparaît que pour les boutiques auxquelles les points sont ouverts.
  const loyaltyShopId = merchantState.currentShop?.id;
  useEffect(() => {
    setIsLoyaltyOpen(false);
    if (!loyaltyShopId) return undefined;
    let active = true;
    fetch(`/api/shops/${loyaltyShopId}/loyalty/program`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { is_open?: boolean } | null) => { if (active) setIsLoyaltyOpen(data?.is_open === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [loyaltyShopId]);

  const requestPrivateAccessLink = () => {
    setConfirmModal({
      title: 'Générer un nouveau lien privé ?',
      message: 'Le lien actuel cessera de fonctionner. Toute personne qui l’utilise perdra l’accès à la gestion de votre boutique.',
      confirmLabel: 'Générer un nouveau lien',
      cancelLabel: 'Garder le lien actuel',
      onConfirm: () => {
        void copyOwnerLink('private').then((link) => {
          if (link) setPrivateAccessLinkForCopy(link);
        });
      },
    });
  };

  const retryCopyPrivateAccessLink = async () => {
    if (!privateAccessLinkForCopy) return;
    try {
      await navigator.clipboard.writeText(privateAccessLinkForCopy);
      setPrivateAccessLinkForCopy(null);
      toast.success('Lien privé copié.');
    } catch {
      toast.error('La copie a échoué. Sélectionnez le lien manuellement.');
    }
  };

  useEffect(() => {
    const returnUrl = new URL(window.location.href);
    const returnedPaymentId = returnUrl.searchParams.get('payment_id');
    if (!returnedPaymentId) return;
    returnUrl.searchParams.delete('payment_id');
    window.history.replaceState(window.history.state, '', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    setPaymentIdToCheck(returnedPaymentId);
  }, []);

  // Retour depuis Didit : ouvrir l’onglet de vérification et laisser le
  // composant rafraîchir immédiatement puis toutes les 10 s pendant 2 minutes.
  useEffect(() => {
    const returnUrl = new URL(window.location.href);
    if (returnUrl.searchParams.get('verification') !== 'complete') return;
    returnUrl.searchParams.delete('verification');
    window.history.replaceState(window.history.state, '', `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    try {
      window.sessionStorage.setItem('matable:didit-return-at', String(Date.now()));
    } catch {
      // Stockage indisponible : le composant retombera sur le rafraîchissement normal.
    }
    setActiveTab('settings');
    setSettingsSubTab('verification');
  }, [setActiveTab, setSettingsSubTab]);

  useEffect(() => {
    if (!paymentIdToCheck || !currentShop || currentShop.admin_mode) return;
    let cancelled = false;
    setPaymentReturnNotice({ paymentId: paymentIdToCheck, status: 'checking', message: 'Retour de GeniusPay. Vérification sécurisée en cours…' });
    const checkReturnedPayment = async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/api/shops/${currentShop.id}/subscription-payments/${encodeURIComponent(paymentIdToCheck)}`, { credentials: 'include' });
          if ([401, 403, 404].includes(response.status)) {
            if (!cancelled) setPaymentReturnNotice({ paymentId: paymentIdToCheck, status: 'error', message: 'Impossible de retrouver ce paiement pour cette session boutique.' });
            return;
          }
          if (!response.ok) throw new Error('Payment status request failed.');
          const payment = await response.json();
          if (payment.status === 'paid') {
            if (payment.payment_type === 'subscription' && payment.subscription) {
              merchantState.setCurrentShop((previousShop) => previousShop
                ? { ...previousShop, subscription: payment.subscription }
                : previousShop);
            }
            const boostStart = payment.boost?.starts_at ? new Date(payment.boost.starts_at) : null;
            const publicationStatus = currentShop.publication_status ?? (currentShop.is_active ? 'active' : 'suspended');
            const message = payment.payment_type === 'promotion'
              ? boostStart && boostStart.getTime() > Date.now()
                ? `Paiement confirmé. Votre boost commencera le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(boostStart)}.`
                : 'Paiement confirmé. Votre boost est activé.'
              : !payment.subscription?.isActive
                ? 'Paiement confirmé, mais les droits de la boutique restent suspendus par une intervention administrative. Contactez l’équipe pour vérifier l’accès.'
                : !currentShop.is_active
                  ? 'Paiement confirmé. Votre abonnement est actif, mais la boutique reste désactivée. Réactivez-la depuis votre espace commerçant ou contactez l’équipe.'
                  : publicationStatus !== 'active'
                    ? publicationStatus === 'draft'
                      ? 'Paiement confirmé. Votre abonnement est actif. Publiez la boutique depuis votre espace commerçant pour la rendre visible.'
                      : 'Paiement confirmé. Votre abonnement est actif, mais la publication de la boutique est suspendue. Réactivez-la depuis votre espace commerçant.'
                    : !['approved', 'verified', 'not_required'].includes(
                      currentShop.identity_verification_status || currentShop.merchant_verification_status || '',
                    )
                      ? 'Paiement confirmé. Votre abonnement est actif, mais la boutique restera masquée jusqu’à la validation de son identité.'
                      : 'Paiement confirmé. Votre abonnement est actif et votre boutique peut être visible.';
            if (!cancelled) setPaymentReturnNotice({ paymentId: paymentIdToCheck, status: 'success', message });
            return;
          }
          if (payment.status === 'refunded') {
            if (!cancelled) setPaymentReturnNotice({
              paymentId: paymentIdToCheck,
              status: 'error',
              message: 'GeniusPay signale un remboursement. L’équipe va vérifier le dossier ; l’accès n’est pas automatiquement désactivé.',
            });
            return;
          }
          if (['failed', 'cancelled', 'expired'].includes(payment.status)) {
            const message = payment.status === 'expired'
              ? 'Cette demande de paiement a expiré. Vous pouvez en créer une nouvelle.'
              : payment.status === 'cancelled'
                ? 'Le paiement a été interrompu. Aucun service n’a été activé.'
                : 'Le paiement a été refusé. Aucun service n’a été activé.';
            if (!cancelled) setPaymentReturnNotice({ paymentId: paymentIdToCheck, status: 'error', message });
            return;
          }
        } catch {
          // Keep checking while GeniusPay delivers the signed webhook.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      if (!cancelled) {
        setPaymentReturnNotice({
          paymentId: paymentIdToCheck,
          status: 'pending',
          message: 'Le paiement attend encore la confirmation de GeniusPay. Vous pouvez vérifier à nouveau dans quelques instants.',
        });
      }
    };
    void checkReturnedPayment();
    return () => { cancelled = true; };
  }, [paymentIdToCheck, paymentReturnNonce, currentShop?.id, currentShop?.admin_mode]);

  const paymentReturnBanner = paymentReturnNotice && (
    <div
      role={paymentReturnNotice.status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`mx-auto mt-3 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${paymentReturnNotice.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : paymentReturnNotice.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
    >
      <span>{paymentReturnNotice.message}</span>
      {paymentReturnNotice.status === 'pending' && (
        <button type="button" onClick={() => setPaymentReturnNonce((nonce) => nonce + 1)} className="min-h-11 rounded-md border border-current px-3 text-xs font-bold">
          Vérifier à nouveau
        </button>
      )}
    </div>
  );

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
    const unlockScroll = lockBodyScroll();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsSettingsDrawerOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSettingsDrawerOpen]);

  useEffect(() => {
    if (!isIdentityGuideOpen) return;
    const unlockScroll = lockBodyScroll();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissIdentityGuide(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      unlockScroll();
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
    const unlockScroll = lockBodyScroll();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismissSubscriptionReminder(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      unlockScroll();
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [subscriptionReminderDay]);

  if (!merchantState.currentShop) return <AuthScreens state={merchantState} onBackToDirectory={onBackToDirectory} onCustomerLogin={onCustomerLogin} />;
  if (!merchantState.currentShop.admin_mode && merchantState.currentShop.subscription?.status === 'not_started') {
    return <>
      <div className="fixed right-4 top-4 z-10 flex gap-2">
        <button type="button" onClick={onBackToDirectory} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Annuaire</button>
        <button type="button" onClick={handleLogout} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">Déconnexion</button>
      </div>
      {paymentReturnBanner}
      <MerchantTrialOnboarding shop={merchantState.currentShop} isStarting={false} mode="plans" />
    </>;
  }

  const identityStatus = merchantState.currentShop.identity_verification_status
    || merchantState.currentShop.merchant_verification_status
    || 'pending';
  const identityVerificationRequired = !['not_required', 'not_submitted', 'approved', 'verified'].includes(identityStatus);
  if (!merchantState.currentShop.admin_mode
    && !identityVerificationRequired
    && ['expired', 'past_due', 'suspended', 'cancelled'].includes(merchantState.currentShop.subscription?.status || '')) {
    return <>
      {paymentReturnBanner}
      <MerchantTrialOnboarding shop={merchantState.currentShop} isStarting={false} onStart={handleStartTrial} mode="expired" />
    </>;
  }
  // 2. AUTHENTICATED -> MERCHANT DASHBOARD
  const valuedOrders = orders.filter((order) => !['cancelled', 'rejected', 'expired'].includes(order.status || 'pending'));
  const orderValue = valuedOrders.reduce((sum, order) => sum + order.total_amount, 0);
  const dashboardSupportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour la boutique ${currentShop.name}.`);
  const avgBasket = valuedOrders.length > 0 ? Math.round(orderValue / valuedOrders.length) : 0;
  const lowStockCount = products.filter(p => p.is_available !== false && p.stock > 0 && p.stock <= 3).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;
  const actionableOrderCount = orders.filter((order) =>
    !['delivered', 'cancelled', 'rejected', 'expired'].includes(order.status || 'pending'),
  ).length;
  const hasPublicationSubscriptionAccess = hasShopPublicationSubscriptionAccess(currentShop.subscription);
  const isAdminSuspended = !currentShop.is_active || currentShop.publication_status === 'suspended';
  const isShopPublished = isShopPubliclyVisible(currentShop);
  // Tant que la vitrine n’est pas publiée, la vérification d’identité figure dans « Premiers pas » :
  // l’alerte séparée ne reste que lorsqu’il y a des corrections à apporter.
  const showIdentityAlert = identityVerificationRequired
    && (isShopPublished || ['rejected', 'action_required'].includes(identityStatus));
  const trialCatalogLimited = !currentShop.admin_mode
    && currentShop.subscription?.status === 'trialing'
    && currentShop.subscription.trialDaysRemaining > 0;
  const dashboardProductLimit = currentShop.admin_mode ? Number.POSITIVE_INFINITY
    : trialCatalogLimited ? TRIAL_CATALOG_LIMIT : getSubscriptionProductLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
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
        { id: 'general', label: 'Coordonnées de la boutique', icon: Store },
        { id: 'hours', label: 'Horaires', icon: Clock },
      ],
    },
    {
      label: 'Mon activité',
      items: [
        { id: 'bilan', label: 'Flash bilan', icon: Send },
      ],
    },
    {
      label: 'Préférences',
      items: [
        { id: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
  ];
  const priorityNotificationCount = Number(identityVerificationRequired)
    + Number(subscriptionNeedsAttention);
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
    if (catalogFilter === 'promotions') return p.sale_price !== null && p.sale_price !== undefined;
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
      if (['delivered', 'cancelled', 'rejected', 'expired'].includes(currentStatus)) return false;
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

  const identityAlertCopy = identityStatus === 'rejected' || identityStatus === 'action_required'
    ? { title: 'Action requise pour votre identité', description: 'Consultez le motif dans Vérification d’identité et ajoutez les justificatifs demandés.' }
    : ['submitted', 'under_review'].includes(identityStatus)
      ? { title: 'Examen de l’identité en cours', description: 'Le statut sera actualisé dans votre espace.' }
      : { title: 'Complétez votre dossier d’identité', description: 'Vous pouvez transmettre les justificatifs depuis Vérification d’identité.' };

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
    delivered: 'Remise',
    cancelled: 'Annulée',
    rejected: 'Refusée',
    expired: 'Expirée',
  };
  const uniqueCustomerCount = new Set(orders.map((order) => order.customer_phone || order.customer_name.trim().toLocaleLowerCase()).filter(Boolean)).size;

  return (
    <div className="merchant-dashboard min-h-screen pb-20 bg-[var(--mt-surface)]">
      {paymentReturnBanner}
      {currentShop.admin_mode && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-xs font-bold text-white">
          <span>Mode super-admin · Gestion complète de {currentShop.name}</span>
          <button type="button" onClick={() => window.location.assign('/admin')} className="rounded-md bg-white/15 px-3 py-1.5 hover:bg-white/25">Retour à l’administration</button>
        </div>
      )}
      <MerchantPushPrompt shop={currentShop} deferred={isIdentityGuideOpen} />
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
                <CategoryIcon category={currentShop.category} className={isHeaderCompact ? 'h-4 w-4' : 'h-5 w-5'} />
              </div>
            )}
            <div className="min-w-0">
              <div className={`flex min-w-0 items-center ${isHeaderCompact ? 'gap-1.5' : 'flex-wrap gap-2'}`}>
                <h1 className={`max-w-full truncate font-black text-slate-900 ${isHeaderCompact ? 'text-sm' : 'text-base sm:text-lg'}`}>{currentShop.name}</h1>
                <span className="hidden items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 sm:inline-flex">
                  <CategoryIcon category={currentShop.category} className="h-3 w-3" /> {getCategoryDefaults(currentShop.category).label}
                </span>
                <span className={`${isHeaderCompact ? 'hidden md:inline' : ''} shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${subscriptionStatus === 'active' || subscriptionStatus === 'trialing' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : subscriptionStatus === 'past_due' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  {subscriptionStatusLabel}
                </span>
              </div>
              <p className={`truncate text-xs text-slate-500 ${isHeaderCompact ? 'hidden' : 'hidden sm:block'}`}>
                {isShopPublished ? 'Vitrine publique :' : 'Adresse publique après publication :'} <span className="font-mono text-slate-800">{window.location.host}/{currentShop.slug}</span>
              </p>
            </div>
          </div>

          {isHeaderCompact && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
              <button
                type="button"
                onClick={handleToggleShopStatus}
                aria-label={`Commandes ${currentShop.is_open ? 'ouvertes' : 'fermées'} : toucher pour ${currentShop.is_open ? 'fermer' : 'ouvrir'} les commandes`}
                className={`flex h-9 items-center gap-1.5 rounded-full border px-2 text-[10px] font-bold ${currentShop.is_open ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
              >
                <span className={`h-2 w-2 rounded-full ${currentShop.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {currentShop.is_open ? 'Ouvert' : 'Fermé'}
              </button>
              {isAdminSuspended ? (
                <span className="max-w-16 truncate text-[9px] font-bold text-rose-700" title="Suspendue par l’administration">Suspendue</span>
              ) : identityVerificationRequired ? (
                <button type="button" onClick={openIdentityVerification} className="max-w-16 truncate text-[9px] font-bold text-amber-800">Identité à vérifier</button>
              ) : !hasPublicationSubscriptionAccess ? (
                <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="max-w-16 truncate text-[9px] font-bold text-amber-800">Forfait</button>
              ) : !isShopPublished ? (
                <button type="button" onClick={() => void handlePublicationStatusChange('active')} className="max-w-16 truncate text-[9px] font-bold text-emerald-800">Publier</button>
              ) : (
                null
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
              <span className={`h-2 w-2 shrink-0 rounded-full ${currentShop.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="truncate">{currentShop.is_open ? 'Commandes ouvertes' : 'Commandes fermées'}</span>
            </button>

            {isAdminSuspended ? (
              <span className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-[11px] font-bold text-rose-950 sm:text-xs md:flex-none">
                Suspendue par l’administration
              </span>
            ) : identityVerificationRequired ? (
              <button type="button" onClick={openIdentityVerification} className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs md:flex-none">
                <span className="truncate">Identité à vérifier</span>
              </button>
            ) : isShopPublished ? (
              <button
                onClick={() => onOpenStorefront(currentShop.slug)}
                className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--mt-green-primary)] px-3 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-[var(--mt-green-hover)] sm:text-xs md:flex-none"
              >
                <span className="truncate">Voir ma vitrine</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : !hasPublicationSubscriptionAccess ? (
              <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-950 transition-colors hover:bg-amber-100 sm:text-xs md:flex-none">
                Abonnement requis
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handlePublicationStatusChange('active')}
                className="flex min-h-10 min-w-0 flex-1 items-center justify-center rounded-xl bg-[var(--mt-green-primary)] px-3 py-2 text-center text-[11px] font-bold text-white shadow-2xs transition-colors hover:bg-[var(--mt-green-hover)] sm:text-xs md:flex-none"
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
                  <strong>Forçage manuel actif :</strong> Prise de commandes <strong>{currentShop.is_open ? 'activée' : 'désactivée'}</strong>. Le planning automatique est temporairement suspendu.
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
                enterKeyHint="search"
                value={dashboardSearch}
                onChange={(event) => setDashboardSearch(event.target.value)}
                placeholder="Commande, produit ou client"
                className="min-h-12 min-w-0 w-full rounded-full border border-[#e7dfd3] bg-white py-3 pl-11 pr-4 text-base shadow-sm sm:text-sm focus:border-[var(--mt-green-hover)] focus:outline-none"
              />
              {/* Sur mobile, la touche « Rechercher » du clavier suffit. */}
              <button type="submit" className="hidden min-h-10 shrink-0 rounded-full bg-[var(--mt-green-deep)] px-4 text-xs font-bold text-white hover:bg-[var(--mt-green-hover)] sm:block">Rechercher</button>
            </div>
          </form>
          {/* Ce que le commerçant vient chercher : les demandes qui attendent sa réponse. */}
          <div className="mb-4">
            <PendingOrdersQueue
              orders={orders}
              inProgressCount={orders.filter((order) => ['confirmed', 'preparing', 'ready'].includes(order.status || 'pending')).length}
              onUpdateStatus={handleUpdateOrderStatus}
              onOpenOrders={(filter) => { setOrderSearch(''); setOrderPaymentFilter('all'); setOrderStatusFilter(filter); setActiveTab('orders'); }}
              isShopPublished={isShopPublished}
            />
          </div>
          <div className="flex flex-col gap-4 rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[var(--mt-gray-900)] sm:text-2xl">Bonjour, {currentShop.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{isShopPublished ? 'Votre vitrine est en ligne.' : 'Votre vitrine n’est pas encore visible.'}</p>
            </div>
            <button type="button" onClick={() => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); }} disabled={dashboardCatalogFull} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--mt-green-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--mt-green-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />{dashboardCatalogFull ? 'Limite du forfait atteinte' : getMerchantVocabulary(currentShop.category).addItem}</button>
          </div>
          {currentShop.theme_config?.event_mode_enabled && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
              <p className="text-sm font-bold">Événement actif sur votre vitrine</p>
              <button type="button" onClick={() => { setSettingsSubTab('themes'); setActiveTab('settings'); }} className="inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-3 text-xs font-bold hover:bg-amber-100">Gérer l’événement</button>
            </div>
          )}
        </section>
      )}

      {activeTab === 'overview' && (showIdentityAlert || subscriptionNeedsAttention || isAdminSuspended || outOfStockCount > 0 || lowStockCount > 0) && (
        <section aria-labelledby="merchant-priority-notifications" aria-live="polite" className="mx-auto w-full max-w-7xl space-y-2 px-4 pt-3 lg:ml-64 lg:w-auto lg:max-w-none">
          <h2 id="merchant-priority-notifications" className="sr-only">À faire en priorité</h2>
          {showIdentityAlert && (
            <article className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <div><h3 className="text-sm font-extrabold">{identityAlertCopy.title}</h3><p className="mt-1 text-xs leading-5">{identityAlertCopy.description}</p></div>
              </div>
              <button type="button" onClick={openIdentityVerification} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-950 px-4 text-xs font-bold text-white hover:bg-amber-900">{['rejected', 'action_required'].includes(identityStatus) ? 'Voir les corrections' : ['submitted', 'under_review'].includes(identityStatus) ? 'Voir le statut' : 'Compléter le dossier'}</button>
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
              <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mt-gray-900)] px-4 text-xs font-bold text-white hover:bg-slate-800">Voir mon forfait</button>
            </article>
          )}
          {(outOfStockCount > 0 || lowStockCount > 0) && (
            <div className="flex flex-wrap gap-2">
              {outOfStockCount > 0 && <button type="button" onClick={() => { setCatalogSearch(''); setCatalogFilter('out_of_stock'); setActiveTab('catalog'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-xs font-bold text-rose-900 hover:bg-rose-50"><Package className="h-4 w-4" />{getMerchantVocabulary(currentShop.category).soldOutChip(outOfStockCount)}</button>}
              {lowStockCount > 0 && <button type="button" onClick={() => { setCatalogSearch(''); setCatalogFilter('low_stock'); setActiveTab('catalog'); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-xs font-bold text-amber-900 hover:bg-amber-50"><AlertTriangle className="h-4 w-4" />{getMerchantVocabulary(currentShop.category).lowStockChip(lowStockCount)}</button>}
            </div>
          )}
        </section>
      )}

      {activeTab === 'overview' && (() => {
        // Une seule liste d’étapes, dans l’ordre, avec un seul bouton pour la suivante.
        const setupSteps = [
          { key: 'details', label: 'Compléter vos coordonnées', detail: 'Nom, WhatsApp et ville', done: Boolean(currentShop.name && currentShop.whatsapp_number && currentShop.city), action: () => { setActiveTab('settings'); setSettingsSubTab('general'); } },
          { key: 'products', label: getMerchantVocabulary(currentShop.category).addItem, detail: 'Avec une photo, si possible', done: products.length > 0, action: () => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); } },
          { key: 'identity', label: 'Faire vérifier votre identité', detail: 'Pièce d’identité du responsable', done: !identityVerificationRequired, action: openIdentityVerification },
          { key: 'plan', label: 'Activer votre formule', detail: 'Essai gratuit ou abonnement', done: hasPublicationSubscriptionAccess, action: () => { setActiveTab('settings'); setSettingsSubTab('subscription'); } },
          { key: 'publish', label: 'Publier votre vitrine', detail: 'Elle devient visible sur MaTable', done: isShopPublished, action: () => void handlePublicationStatusChange('active') },
        ];
        const doneCount = setupSteps.filter((step) => step.done).length;
        const nextStep = setupSteps.find((step) => !step.done);
        return (
          <div className="mx-auto max-w-7xl space-y-4 px-4 pt-4 lg:ml-64 lg:max-w-none">
            {nextStep && !isAdminSuspended ? (
              <section aria-labelledby="setup-checklist-title" className="rounded-3xl border border-[#e7dfd3] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="setup-checklist-title" className="text-lg font-black text-[var(--mt-gray-900)]">Premiers pas</h2>
                  <span className="text-sm font-bold tabular-nums text-slate-500">{doneCount} sur {setupSteps.length}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ebe6dc]" role="progressbar" aria-label="Avancement des premiers pas" aria-valuemin={0} aria-valuemax={setupSteps.length} aria-valuenow={doneCount}>
                  <div className="h-full rounded-full bg-[var(--mt-green-primary)] transition-[width] duration-[var(--mt-motion-deliberate)]" style={{ width: `${(doneCount / setupSteps.length) * 100}%` }} />
                </div>
                <ol className="mt-4 space-y-1">
                  {setupSteps.map((step) => {
                    const isNext = step === nextStep;
                    return (
                      <li key={step.key}>
                        <button
                          type="button"
                          onClick={step.action}
                          aria-current={isNext ? 'step' : undefined}
                          className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition ${isNext ? 'bg-[#f0f8f4]' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${step.done ? 'bg-[var(--mt-green-deep)] text-white' : isNext ? 'border-2 border-[var(--mt-green-primary)] bg-white' : 'border-2 border-slate-300 bg-white'}`}>
                            {step.done && <Check className="h-4 w-4" aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-sm ${step.done ? 'font-semibold text-slate-500 line-through decoration-slate-300' : 'font-bold text-slate-900'}`}>{step.label}</span>
                            {isNext && <span className="block text-xs text-slate-600">{step.detail}</span>}
                          </span>
                          {isNext && <ChevronRight className="h-5 w-5 shrink-0 text-[var(--mt-green-hover)]" aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <button type="button" onClick={nextStep.action} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-primary)] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[var(--mt-green-hover)] active:scale-[0.98]">
                  {nextStep.label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <Link to="/guide?role=merchant" state={{ guideAccountId: currentShop.id }} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 text-sm font-semibold text-[var(--mt-green-hover)]">
                  <BookOpen className="h-4 w-4" aria-hidden="true" /> Voir le guide pas à pas
                </Link>
              </section>
            ) : null}
            {/* Après le lancement : ce qui rend la vitrine attirante dans l’annuaire et sur l’accueil MaTable. */}
            {!nextStep && !isAdminSuspended && (() => {
              const productsWithoutPhoto = products.filter((product) => !product.image_url).length;
              const missingBanner = !currentShop.theme_config?.custom_banner_url;
              if (!missingBanner && productsWithoutPhoto === 0) return null;
              return (
                <section aria-label="Rendre la vitrine plus visible" className="rounded-3xl border border-[#e7dfd3] bg-white p-4 shadow-sm">
                  <h2 className="text-base font-extrabold text-[var(--mt-gray-900)]">Rendez votre vitrine plus attirante</h2>
                  <p className="mt-1 text-sm text-slate-600">Les boutiques avec des photos apparaissent en premier sur MaTable.</p>
                  <div className="mt-3 space-y-2">
                    {missingBanner && (
                      <button type="button" onClick={() => { setSettingsSubTab('themes'); setActiveTab('settings'); }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[#f0f8f4] px-3 text-left">
                        <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">Ajouter une photo de bannière</span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--mt-green-hover)]" aria-hidden="true" />
                      </button>
                    )}
                    {productsWithoutPhoto > 0 && (
                      <button type="button" onClick={() => { setCatalogSearch(''); setCatalogFilter('all'); setActiveTab('catalog'); }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-[#f0f8f4] px-3 text-left">
                        <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{productsWithoutPhoto} article{productsWithoutPhoto > 1 ? 's' : ''} sans photo</span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-[var(--mt-green-hover)]" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </section>
              );
            })()}
            {!nextStep && isShopPublished ? (
              <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-[#e7dfd3] bg-white p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[var(--mt-green-deep)]"><Check className="h-5 w-5" aria-hidden="true" /></span>
                <p className="min-w-0 flex-1 text-sm text-slate-700"><span className="font-bold text-slate-900">Votre vitrine est en ligne.</span> Partagez son lien pour recevoir des commandes.</p>
                <button type="button" onClick={() => void copyOwnerLink('public')} className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-[#dfe8dd] bg-white px-4 text-sm font-bold text-[var(--mt-green-hover)] hover:bg-[#edf7f0]">Copier le lien</button>
              </section>
            ) : null}
          </div>
        );
      })()}

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 lg:ml-64 lg:max-w-none lg:pb-6">
        <div className="grid gap-6 lg:grid-cols-1 lg:items-start">
          <nav aria-label="Navigation principale commerçant" className="merchant-sidebar hidden min-w-0 flex-col gap-1 overflow-y-auto p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64">
            <div className="mb-5 px-3 pt-3">
              <p className="text-2xl font-black tracking-tight text-white">MaTable</p>
              <p className="mt-1 text-sm text-white/70">Espace commerçant</p>
            </div>
            {[
              { id: 'overview' as const, label: 'Tableau de bord', icon: LayoutDashboard },
              { id: 'catalog' as const, label: 'Catalogue', count: products.length, icon: Package },
              { id: 'orders' as const, label: 'Commandes', count: actionableOrderCount, icon: ShoppingBag },
              { id: 'stats' as const, label: 'Statistiques', icon: BarChart3 },
              ...(isLoyaltyOpen ? [{ id: 'loyalty' as const, label: 'Fidélité', icon: Gift }] : []),
            ].map(({ id, label, icon: Icon, count }) => (
              <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`flex min-h-11 min-w-0 items-center justify-start gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all sm:text-sm lg:w-full ${activeTab === id ? 'border-transparent bg-[var(--mt-green-hover)] text-white' : 'border-transparent bg-transparent text-white/90 hover:bg-[var(--mt-green-hover)] hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[10px] font-black ${id === 'orders' ? 'bg-[var(--mt-orange-bright)] text-white' : 'bg-white/15 text-white'}`}>{count}</span>
                )}
              </button>
            ))}
            <div className="my-2 border-t border-white/15" />
            <p className="px-3 pb-1 pt-1 text-xs font-bold text-white/70">À suivre</p>
            {[
              { id: 'visibility' as const, label: 'Campagnes et boosts', icon: TrendingUp, badge: '' },
              { id: 'subscription' as const, label: 'Abonnement', icon: CreditCard, badge: subscriptionNeedsAttention ? 'Échéance' : '' },
              { id: 'verification' as const, label: 'Vérification d’identité', icon: ShieldCheck, badge: identityVerificationRequired ? 'Identité en attente' : '' },
            ].map(({ id, label, icon: Icon, badge }) => (
              <button key={id} type="button" aria-current={activeTab === 'settings' && settingsSubTab === id ? 'page' : undefined} onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); }} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${activeTab === 'settings' && settingsSubTab === id ? 'bg-[var(--mt-green-hover)] text-white' : 'text-white/90 hover:bg-[var(--mt-green-hover)] hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span>{badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-900">{badge}</span>}
              </button>
            ))}
            <div className="my-2 border-t border-white/15" />
            <p className="px-3 pb-1 pt-1 text-xs font-bold text-white/70">Paramètres</p>
            {settingsNavigationGroups.map((group) => (
              <section key={group.label} className="mb-2">
                <h2 className="px-3 pb-1 text-xs font-bold text-white/60">{group.label}</h2>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <button key={id} type="button" aria-current={activeTab === 'settings' && settingsSubTab === id ? 'page' : undefined} onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); }} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${activeTab === 'settings' && settingsSubTab === id ? 'bg-[var(--mt-green-hover)] text-white' : 'text-white/90 hover:bg-[var(--mt-green-hover)] hover:text-white'}`}>
                    <Icon className="h-4 w-4 shrink-0" /><span>{label}</span>
                  </button>
                ))}
              </section>
            ))}
            <p className="px-3 pb-1 pt-1 text-xs font-bold text-white/70">Partage</p>
            <button type="button" disabled={!isShopPublished} onClick={() => void copyOwnerLink('public')} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/90 hover:bg-[var(--mt-green-hover)] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"><Copy className="h-4 w-4 shrink-0" />Lien vitrine</button>
            <button type="button" disabled={!isShopPublished} onClick={() => setIsQrKitOpen(true)} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/90 hover:bg-[var(--mt-green-hover)] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"><QrCode className="h-4 w-4 shrink-0" />QR code et affiche</button>
            {!isShopPublished && <p className="px-3 py-1 text-[10px] leading-4 text-white/65">Lien vitrine et QR code disponibles après publication.</p>}
            <button type="button" onClick={requestPrivateAccessLink} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-white/90 hover:bg-[var(--mt-green-hover)] sm:text-sm"><Key className="h-4 w-4 shrink-0" />Lien d’accès privé</button>
            {dashboardSupportUrl && <a href={dashboardSupportUrl} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/90 hover:bg-[var(--mt-green-hover)] sm:text-sm"><MessageCircle className="h-4 w-4 shrink-0" />Centre d’aide</a>}
            <button type="button" onClick={handleLogout} className="mt-2 inline-flex min-h-11 min-w-max items-center justify-start gap-3 rounded-xl border-t border-white/15 px-3 py-2.5 text-left text-xs font-bold text-white/80 transition hover:bg-[var(--mt-green-hover)] hover:text-white sm:text-sm lg:w-full">
            <LogOut className="h-4 w-4 shrink-0" /><span>Déconnexion</span>
            </button>
          </nav>

          <div ref={tabPanel} className="min-w-0" role="main">
          {activeTab === 'overview' && (
            <section className="space-y-4">
              {orders.length > 0 && <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
                {[
                  { label: 'Commandes', value: orders.length, hint: `${actionableOrderCount} à traiter`, tone: 'text-[#C2410C]', icon: ShoppingBag },
                  { label: 'Montant des commandes', value: formatFCFA(orderValue), hint: 'Paiements non suivis par MaTable', tone: 'text-[#087F62]', icon: DollarSign },
                  { label: 'Clients', value: uniqueCustomerCount, hint: 'Clients ayant commandé', tone: 'text-[#087F62]', icon: UserPlus },
                  { label: 'Articles', value: `${products.length} / ${Number.isFinite(dashboardProductLimit) ? dashboardProductLimit : '∞'}`, hint: currentShop.admin_mode ? 'Limites ignorées en mode super-admin' : 'Dans votre catalogue', tone: 'text-[#087F62]', icon: Package },
                ].map((metric) => <div key={metric.label} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[#e7dfd3] bg-white p-3 sm:min-h-[104px] sm:flex-row sm:items-start sm:gap-3 sm:p-4"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f7f4ee] sm:mt-0.5 sm:h-9 sm:w-9 ${metric.tone}`}><metric.icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-500">{metric.label === 'Montant des commandes' ? <><span className="sm:hidden">Montant</span><span className="hidden sm:inline">{metric.label}</span></> : metric.label}</p><strong className="mt-0.5 block truncate text-lg font-black tabular-nums text-[var(--mt-gray-900)] sm:mt-1 sm:text-xl"><AnimatedNumber>{metric.value}</AnimatedNumber></strong><p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500 sm:mt-1 sm:truncate">{metric.hint}</p></div></div>)}
              </div>}
              <SegmentedBar title="Répartition des commandes" description="Selon leur état actuel." segments={groupOrdersByStatus(orders)} />
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <section aria-labelledby="merchant-recent-orders-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#eee8dc] pb-3">
                    <h3 id="merchant-recent-orders-title" className="text-lg font-black text-[var(--mt-green-hover)]">Commandes récentes</h3>
                    <button type="button" onClick={() => setActiveTab('orders')} className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-[var(--mt-green-hover)] underline underline-offset-2">Voir tout</button>
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
                          <li key={order.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f8f1e7] text-[var(--mt-orange-deep)]"><ShoppingBag className="h-4 w-4" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-[var(--mt-gray-900)]">{orderItemName}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-500">N° {order.id} · {isToday ? 'Aujourd’hui' : orderDateLabel}, {orderTime}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <strong className="text-sm font-black tabular-nums text-[var(--mt-gray-900)]">{formatFCFA(order.total_amount)}</strong>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ORDER_STATUS_TONE[order.status || 'pending']}`}>{orderStatusLabels[order.status || 'pending']}</span>
                            </div>
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
                        {currentShop.theme_config?.logo_url ? <img src={currentShop.theme_config.logo_url} alt="" className="h-full w-full rounded-full object-cover" /> : <CategoryIcon category={currentShop.category} className="h-6 w-6 text-[var(--mt-green-hover)]" />}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 id="merchant-shop-card-title" className="font-black text-[var(--mt-green-hover)]">{currentShop.name}</h3>
                        {!identityVerificationRequired && <span className="rounded-full bg-[#e2eee8] px-2 py-0.5 text-[10px] font-bold text-[var(--mt-green-hover)]">Identité vérifiée</span>}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{currentShop.city || 'Localisation à compléter'} · {currentShop.is_open ? 'Commandes ouvertes' : 'Commandes fermées'}</p>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('general'); }} className="mt-3 min-h-10 w-full rounded-full border border-[var(--mt-green-hover)] px-3 text-xs font-bold text-[var(--mt-green-hover)] hover:bg-[#d1fae5]">Modifier ma boutique</button>
                    </div>
                  </section>
                  <section aria-labelledby="merchant-quick-actions-title" className="rounded-2xl border border-[#e7dfd3] bg-white p-4">
                    <h3 id="merchant-quick-actions-title" className="mb-3 font-black text-[var(--mt-green-hover)]">Accès rapides</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => { setActiveTab('catalog'); if (!dashboardCatalogFull) handleOpenAddModal(); }} disabled={dashboardCatalogFull} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[var(--mt-gray-900)] hover:bg-[#d1fae5] disabled:opacity-50"><Package className="mb-1 h-4 w-4 text-[var(--mt-green-hover)]" />Ajouter un produit</button>
                      <button type="button" onClick={() => setActiveTab('orders')} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[var(--mt-gray-900)] hover:bg-[#d1fae5]"><ShoppingBag className="mb-1 h-4 w-4 text-[var(--mt-green-hover)]" />Voir les commandes</button>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('hours'); }} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[var(--mt-gray-900)] hover:bg-[#d1fae5]"><Clock className="mb-1 h-4 w-4 text-[var(--mt-green-hover)]" />Gérer les horaires</button>
                      <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('profile'); }} className="min-h-16 rounded-xl bg-[#f7f4ee] p-3 text-left text-xs font-bold text-[var(--mt-gray-900)] hover:bg-[#d1fae5]"><Key className="mb-1 h-4 w-4 text-[var(--mt-green-hover)]" />Profil et sécurité</button>
                    </div>
                  </section>
                </div>
              </div>
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
                <div className="min-w-0 space-y-4">
                  <ProAnalyticsPanel shop={currentShop} compact />
                  <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e7dfd3] bg-[#f9f0e6] p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--mt-orange-bright)] text-white"><TrendingUp className="h-5 w-5" /></span>
                      <div>
                        <h3 className="font-black text-[#93602e]">Boostez votre visibilité</h3>
                        <p className="mt-0.5 text-xs text-slate-600">Mettez votre boutique en avant dans l’annuaire.</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setActiveTab('settings'); setSettingsSubTab('subscription'); }} className="min-h-10 rounded-full bg-[var(--mt-green-deep)] px-5 text-xs font-bold text-white hover:bg-[var(--mt-green-hover)]">Découvrir</button>
                  </section>
                </div>
                <section aria-labelledby="merchant-latest-reviews-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 border-b border-[#eee8dc] pb-3">
                    <div>
                      <h3 id="merchant-latest-reviews-title" className="text-lg font-black text-[var(--mt-green-hover)]">Derniers avis</h3>
                      {shopReviewSummary.average !== null && <p className="mt-1 text-xs font-semibold text-slate-500">{shopReviewSummary.average.toLocaleString('fr-FR')} / 5 · {shopReviewSummary.count} avis</p>}
                    </div>
                  </div>
                  {reviewsLoading && <p role="status" className="py-5 text-sm text-slate-500">Chargement des avis…</p>}
                  {reviewsError && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{reviewsError}</p>}
                  {!reviewsLoading && !reviewsError && !reviewShopIsPublished && <p className="py-5 text-sm text-slate-500">Les avis apparaîtront après la publication de votre boutique.</p>}
                  {!reviewsLoading && !reviewsError && reviewShopIsPublished && shopReviews.length === 0 && <p className="py-5 text-sm text-slate-500">Aucun avis pour le moment.</p>}
                  {!reviewsLoading && !reviewsError && shopReviews.slice(0, 2).map((review) => (
                    <article key={review.id} className="flex gap-3 border-b border-[#eee8dc] py-3 last:border-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e2eee8] text-xs font-black text-[var(--mt-green-hover)]">{review.author_name.slice(0, 2).toLocaleUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--mt-gray-900)]">{review.author_name} <span className="font-normal text-slate-500">· {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(review.created_at))}</span></p>
                        <p className="mt-1 inline-flex text-[#93602e]" aria-label={`${review.rating} sur 5 étoiles`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-3 w-3 ${index < Math.round(review.rating) ? 'fill-current' : 'text-slate-300'}`} aria-hidden="true" />)}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-slate-600">{review.comment}</p>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </section>
        )}

        {activeTab === 'catalog' && <CatalogTab state={merchantState} filteredProducts={filteredProducts} />}
        {activeTab === 'orders' && <OrdersTab state={merchantState} filteredOrders={filteredOrders} orderValue={orderValue} averageOrderValue={avgBasket} isShopPublished={isShopPublished} />}
          {activeTab === 'stats' && <ProAnalyticsPanel shop={currentShop} />}
          {activeTab === 'loyalty' && isLoyaltyOpen && <LoyaltyTab key={currentShop.id} shopId={currentShop.id} shopName={currentShop.name} isReadOnly={Boolean(currentShop.admin_mode)} />}
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
          <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => { setActiveTab(id); setIsSettingsDrawerOpen(false); }} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold ${activeTab === id ? 'text-[var(--mt-green-hover)]' : 'text-slate-500'}`}>
            <Icon className="h-5 w-5" />
            <span>{label}</span>
            {count !== undefined && count > 0 && <span className="absolute right-[calc(50%-20px)] top-1 min-w-4 rounded-full bg-[var(--mt-orange-bright)] px-1 text-center text-[9px] leading-4 text-white">{count}</span>}
          </button>
        ))}
        <button type="button" aria-label={mobileNotificationCount > 0 ? `Plus, ${mobileNotificationCount} priorité${mobileNotificationCount === 1 ? '' : 's'} à consulter` : 'Plus'} aria-expanded={isSettingsDrawerOpen} aria-controls="merchant-menu-drawer" onClick={() => setIsSettingsDrawerOpen(true)} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-t-lg text-[10px] font-bold ${isSettingsDrawerOpen || activeTab === 'settings' ? 'text-[var(--mt-green-hover)]' : 'text-slate-500'}`}>
          <MoreHorizontal className="h-5 w-5" /><span>Plus</span>
          {mobileNotificationCount > 0 && <span aria-hidden="true" className="absolute right-[calc(50%-18px)] top-0 min-w-4 rounded-full bg-[var(--mt-orange-bright)] px-1 text-center text-[9px] leading-4 text-white">{mobileNotificationCount > 9 ? '9+' : mobileNotificationCount}</span>}
        </button>
      </nav>

      {isIdentityGuideOpen && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--mt-gray-900)]/60 p-0 sm:items-center sm:p-4">
          <button type="button" aria-label="Fermer le guide" onClick={dismissIdentityGuide} className="absolute inset-0" />
          <section role="dialog" aria-modal="true" aria-labelledby="identity-guide-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <button type="button" aria-label="Fermer le guide" onClick={dismissIdentityGuide} className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-900"><ShieldCheck className="h-6 w-6" /></span>
            <p className="mt-4 text-xs font-bold text-amber-800">Première étape</p>
            <h2 id="identity-guide-title" className="mt-1 pr-8 text-2xl font-black text-[var(--mt-gray-900)]">Bienvenue dans votre espace boutique</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Vérifiez l’identité de la personne responsable pour activer la publication. Aucun justificatif sur l’existence ou l’activité de la boutique n’est demandé.</p>
            <ol className="mt-5 space-y-3">
              {[
                ['Vérifier l’identité', 'CNI recto-verso ou passeport du responsable.'],
                ['Compléter votre vitrine', 'Ajoutez un logo, vos coordonnées et vos produits.'],
                ['Publier et partager', 'Après validation de l’identité et de l’abonnement, vos clients pourront vous trouver.'],
              ].map(([title, description], index) => <li key={title} className="flex items-start gap-3 rounded-xl border border-[#e7dfd3] bg-white p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#d1fae5] text-xs font-black text-[var(--mt-green-hover)]">{index + 1}</span><span><strong className="block text-sm text-[var(--mt-gray-900)]">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span></span></li>)}
            </ol>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={dismissIdentityGuide} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Plus tard</button>
              <button type="button" onClick={openIdentityVerification} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-hover)] px-4 text-sm font-bold text-white hover:bg-[#0f4538]">Commencer la vérification<ChevronRight className="h-4 w-4" /></button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {subscriptionReminderDay !== null && createPortal(
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-[var(--mt-gray-900)]/60 p-0 sm:items-center sm:p-4">
          <button type="button" aria-label="Fermer le rappel d’abonnement" onClick={dismissSubscriptionReminder} className="absolute inset-0" />
          <section role="dialog" aria-modal="true" aria-labelledby="subscription-reminder-title" className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#fffdf8] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <button type="button" aria-label="Fermer le rappel d’abonnement" onClick={dismissSubscriptionReminder} className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            <span className={`grid h-12 w-12 place-items-center rounded-2xl ${subscriptionReminderDay <= 3 ? 'bg-rose-100 text-rose-900' : 'bg-orange-100 text-orange-900'}`}><Clock className="h-6 w-6" /></span>
            <p className="mt-4 text-xs font-bold text-orange-800">Rappel d’échéance · J−{subscriptionReminderDay}</p>
            <h2 id="subscription-reminder-title" className="mt-1 pr-8 text-2xl font-black text-[var(--mt-gray-900)]">{subscriptionReminderDay === 1 ? 'Votre forfait se termine demain' : `Votre forfait se termine dans ${subscriptionReminderDay} jours`}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{subscriptionStatus === 'trialing' ? 'Consultez les options de votre forfait pour préparer la suite après l’essai.' : 'Renouvelez votre forfait avant cette date pour conserver l’accès aux fonctionnalités incluses.'} Ce rappel restera dans votre tableau de bord jusqu’à son échéance.</p>
            <p className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">Les rappels WhatsApp suivent un calendrier séparé (J−14, J−7, J−3 et J−1) lorsque vous y avez consenti et que le service est configuré.</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={dismissSubscriptionReminder} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Me le rappeler plus tard</button>
              <button type="button" onClick={() => { dismissSubscriptionReminder(); setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-hover)] px-4 text-sm font-bold text-white hover:bg-[#0f4538]">Voir mon forfait<ChevronRight className="h-4 w-4" /></button>
            </div>
          </section>
        </div>,
        document.body,
      )}

      {isSettingsDrawerOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--mt-surface)] lg:hidden">
          <button type="button" aria-label="Fermer le menu" onClick={() => setIsSettingsDrawerOpen(false)} className="absolute inset-0 bg-[var(--mt-gray-900)]/55" />
          <aside id="merchant-menu-drawer" role="dialog" aria-modal="true" aria-labelledby="merchant-menu-title" className="absolute inset-x-0 top-0 bottom-[calc(3.8125rem+env(safe-area-inset-bottom))] flex h-auto w-full flex-col overscroll-contain overflow-y-auto bg-[var(--mt-surface)] px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pb-5">
            <header className="flex items-start justify-between gap-3 border-b border-[#ded8ce] pb-4">
              <div><p className="text-[10px] font-black uppercase text-[var(--mt-orange-deep)]">MaTable</p><h2 id="merchant-menu-title" className="mt-1 text-xl font-black text-[var(--mt-gray-900)]">Plus</h2></div>
              <button ref={settingsDrawerCloseButtonRef} type="button" onClick={() => setIsSettingsDrawerOpen(false)} aria-label="Fermer le menu" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700"><X className="h-5 w-5" /></button>
            </header>
            <nav className="mt-4 space-y-4" aria-label="Navigation et réglages commerçant">
              <section>
                <h3 className="mb-1 px-3 text-xs font-bold text-slate-500">Ma boutique</h3>
                <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
                  {[
                    { id: 'themes' as const, label: 'Apparence de la vitrine', icon: Palette },
                    { id: 'hours' as const, label: 'Horaires et disponibilité', icon: Clock },
                    { id: 'general' as const, label: 'Informations publiques', icon: Store },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-12 w-full items-center gap-3 border-b border-[#eee9e1] px-3 text-left text-sm font-semibold text-slate-800 last:border-0 hover:bg-emerald-50">
                      <Icon className="h-4 w-4 shrink-0 text-emerald-800" /><span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-1 px-3 text-xs font-bold text-slate-500">{isLoyaltyOpen ? 'Visibilité et fidélité' : 'Visibilité'}</h3>
                <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
                  <button type="button" onClick={() => { setSettingsSubTab('visibility'); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50">
                    <TrendingUp className="h-4 w-4 shrink-0 text-emerald-800" /><span className="flex-1">Campagnes et boosts</span><ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                  {isLoyaltyOpen && (
                    <button type="button" onClick={() => { setActiveTab('loyalty'); setIsSettingsDrawerOpen(false); }} className="flex min-h-12 w-full items-center gap-3 border-t border-[#eee9e1] px-3 text-left text-sm font-semibold text-slate-800 hover:bg-[#f7f4ee]">
                      <Gift className="h-4 w-4 shrink-0 text-emerald-800" /><span className="flex-1">Fidélité</span><ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  )}
                </div>
              </section>
              <section>
                <h3 className="mb-1 px-3 text-xs font-bold text-slate-500">Mon activité</h3>
                <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
                  {[
                    { id: 'bilan' as const, label: 'Flash bilan', icon: Send },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-12 w-full items-center gap-3 border-b border-[#eee9e1] px-3 text-left text-sm font-semibold text-slate-800 last:border-0 hover:bg-emerald-50">
                      <Icon className="h-4 w-4 shrink-0 text-emerald-800" /><span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-1 px-3 text-xs font-bold text-slate-500">Mon compte</h3>
                <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
                  {[
                    { id: 'subscription' as const, label: 'Mon abonnement', icon: CreditCard, badge: subscriptionNeedsAttention ? 'Échéance' : currentShop.subscription?.plan || '' },
                    { id: 'verification' as const, label: 'Vérification d’identité', icon: ShieldCheck, badge: identityVerificationRequired ? 'Identité en attente' : '' },
                    { id: 'notifications' as const, label: 'Notifications', icon: Bell, badge: '' },
                    { id: 'profile' as const, label: 'Profil et mes données', icon: Key, badge: '' },
                  ].map(({ id, label, icon: Icon, badge }) => (
                    <button key={id} type="button" onClick={() => { setSettingsSubTab(id); setActiveTab('settings'); setIsSettingsDrawerOpen(false); }} className="flex min-h-12 w-full items-center gap-3 border-b border-[#eee9e1] px-3 text-left text-sm font-semibold text-slate-800 last:border-0 hover:bg-emerald-50">
                      <Icon className="h-4 w-4 shrink-0 text-emerald-800" /><span className="flex-1">{label}</span>{badge && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black capitalize text-amber-900">{badge}</span>}<ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
              <div><p className="mb-2 text-[10px] font-black uppercase text-slate-500">Partage</p>
                <button type="button" disabled={!isShopPublished} onClick={() => void copyOwnerLink('public')} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"><Copy className="h-4 w-4 text-emerald-800" />Lien vitrine</button>
                <button type="button" disabled={!isShopPublished} onClick={() => { setIsQrKitOpen(true); setIsSettingsDrawerOpen(false); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"><QrCode className="h-4 w-4 text-emerald-800" />QR code et affiche</button>
                <button type="button" onClick={requestPrivateAccessLink} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-800 hover:bg-emerald-50"><Key className="h-4 w-4 text-emerald-800" />Lien d’accès privé</button>
                {!isShopPublished && <p className="px-3 text-[11px] leading-5 text-slate-500">Le lien public et le QR code seront disponibles après publication.</p>}
              </div>
            </nav>
            <Link to="/guide?role=merchant" state={{ guideAccountId: currentShop.id }} className="mt-2 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"><BookOpen className="h-4 w-4" />Guide marchand</Link>
            {dashboardSupportUrl && <a href={dashboardSupportUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"><MessageCircle className="h-4 w-4" />Aide et assistance</a>}
            <button type="button" onClick={handleLogout} className="mt-auto flex min-h-11 items-center gap-3 border-t border-[#ded8ce] pt-4 text-sm font-bold text-rose-800"><X className="h-4 w-4" />Déconnexion</button>
          </aside>
        </div>
      )}
      {confirmModal && (
        <ConfirmSheetView
          withReason={false}
          options={{ title: confirmModal.title, message: confirmModal.message, confirmLabel: confirmModal.confirmLabel, cancelLabel: confirmModal.cancelLabel, tone: 'danger' }}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => { const confirmAction = confirmModal.onConfirm; setConfirmModal(null); confirmAction(); }}
        />
      )}
      {privateAccessLinkForCopy && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="private-access-link-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 id="private-access-link-title" className="text-base font-black text-slate-900">Copiez votre nouveau lien privé</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">L’ancien lien a été invalidé. Conservez ce nouveau lien en lieu sûr : il permet d’accéder à la gestion de votre boutique.</p>
            <label htmlFor="private-access-link" className="mt-4 block text-sm font-bold text-slate-800">Lien privé</label>
            <input id="private-access-link" type="text" readOnly value={privateAccessLinkForCopy} onFocus={(event) => event.currentTarget.select()} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPrivateAccessLinkForCopy(null)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Fermer</button>
              <button type="button" onClick={() => void retryCopyPrivateAccessLink()} className="min-h-10 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900">Copier le lien</button>
            </div>
          </section>
        </div>
      )}
      {isQrKitOpen && <MerchantQrShareKit shop={currentShop} onClose={() => setIsQrKitOpen(false)} />}
      <ProductModal state={merchantState} />
    </div>
  );
};
