import { useState, useEffect, useRef } from 'react';
import { useToast } from '../Toast';
import { Shop, Product, Order, FlashBilan, ShopCategory, OrderStatus, ShopDeliveryZone, ShopSocialLinks, SubscriptionTier } from '../../types';
import { formatFCFA, cleanPhoneForWhatsApp } from '../../utils/format';
import { CATEGORY_DEFAULTS } from '../../utils/categoryDefaults';
import { TRIAL_DURATION_DAYS } from '../../utils/subscriptionFeatures';
import { useMerchantProductEditor } from './useMerchantProductEditor';

export type MerchantOrderFilter = 'all' | 'actionable' | OrderStatus;

export const useMerchantDashboard = (onOpenStorefront: (slug: string) => void, openRegistration: boolean = false) => {
  const toast = useToast();

  // Authentication state
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
  // True while the initial session check is in-flight (prevents flash of login screen)
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  // Confirm modal (replaces native browser confirm())
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [showRegPin, setShowRegPin] = useState(false);
  const [showSettingsPin, setShowSettingsPin] = useState(false);
  const [authMode, setAuthMode] = useState<'private' | 'quick'>('private');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Quick Register Modal state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('+225');
  const [regPin, setRegPin] = useState('');
  const [regCity, setRegCity] = useState('Abidjan');
  const [regCityOther, setRegCityOther] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAcceptedTermsPrivacy, setRegAcceptedTermsPrivacy] = useState(false);
  const [regCategory, setRegCategory] = useState<ShopCategory>('fashion');
  const [regLoading, setRegLoading] = useState(false);
  const [trialStarting, setTrialStarting] = useState(false);
  const [registrationLinks, setRegistrationLinks] = useState<{
    publicUrl: string;
    privateUrl: string;
    whatsappUrl: string;
    emailUrl: string;
  } | null>(null);

  useEffect(() => {
    if (openRegistration && !currentShop) setIsRegisterModalOpen(true);
  }, [openRegistration, currentShop]);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'overview' | 'catalog' | 'orders' | 'settings'>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'themes' | 'general' | 'hours' | 'bilan' | 'verification' | 'subscription' | 'analytics'>('themes');

  // Products & Orders data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [flashBilan, setFlashBilan] = useState<FlashBilan | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const shopDataRequestId = useRef(0);

  // Catalog search & filter
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'hidden'>('all');

  // Orders search & filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'wave' | 'mobile_money' | 'cash' | 'to_confirm'>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<MerchantOrderFilter>('all');

  const productEditor = useMerchantProductEditor(currentShop, setProducts);
  const {
    isProductModalOpen,
    setIsProductModalOpen,
  } = productEditor;

  useEffect(() => {
    if (!isRegisterModalOpen && !isProductModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isProductModalOpen) setIsProductModalOpen(false);
      else setIsRegisterModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProductModalOpen, isRegisterModalOpen]);

  // Shop Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsWelcome, setSettingsWelcome] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsCity, setSettingsCity] = useState('Abidjan');
  const [settingsNewPin, setSettingsNewPin] = useState('');
  const [settingsSocialLinks, setSettingsSocialLinks] = useState<ShopSocialLinks>({
    instagram: '',
    facebook: '',
    tiktok: '',
    website: '',
    whatsapp: '',
  });
  const [settingsDeliveryZones, setSettingsDeliveryZones] = useState<ShopDeliveryZone[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Automated Opening Hours State
  const [hoursEnabled, setHoursEnabled] = useState(false);
  const [openTime, setOpenTime] = useState('08:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [manualOverride, setManualOverride] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  // Flash Bilan copy state
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<any>(null);
  const [copiedBilan, setCopiedBilan] = useState(false);

  // Restore session from server-side cookie — but ONLY when no ?access= token is in the URL.
  // If ?access= is present, the second useEffect handles auth and this one must stay silent
  // to avoid the race condition that causes a blank page (currentShop set too early).
  useEffect(() => {
    const adminShopId = new URLSearchParams(window.location.search).get('admin_shop_id');
    // If there is an access token in the URL, skip session restore entirely.
    // The access-token useEffect below will handle it.
    const hasAccessToken = Boolean(new URLSearchParams(window.location.search).get('access'));
    if (hasAccessToken) {
      setIsSessionLoading(false);
      return;
    }

    fetch(`/api/auth/session${adminShopId ? `?admin_shop_id=${encodeURIComponent(adminShopId)}` : ''}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.authenticated && data.userType === 'merchant' && data.shopId) {
          await loadShopData(Number(data.shopId));
        }
      })
      .catch(() => undefined)
      .finally(() => setIsSessionLoading(false));
  }, []);

  // Handle admin impersonation / magic-link via ?access= token.
  // Runs once on mount (dep array is empty-like: only runs when accessToken exists).
  useEffect(() => {
    const accessToken = new URLSearchParams(window.location.search).get('access');
    if (!accessToken) return;
    window.history.replaceState({}, '', '/app');

    const openSession = (data: { shop: Shop }) => {
      setCurrentShop(data.shop);
      syncShopSettings(data.shop);
      loadShopData(data.shop.id).finally(() => setIsSessionLoading(false));
    };

    fetch('/api/auth/merchant-access-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lien privé invalide.');
      openSession(data);
    }).catch((error: Error) => {
      setAuthError(error.message);
      setIsSessionLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncShopSettings = (shop: Shop) => {
    setSettingsName(shop.name);
    setSettingsWelcome(shop.welcome_message || '');
    setSettingsOpen(shop.is_open);
    setSettingsPhone(shop.whatsapp_number || '');
    setSettingsCity(shop.city || 'Abidjan');
    setSettingsNewPin('');
    setSettingsSocialLinks({
      instagram: shop.theme_config?.social_links?.instagram || '',
      facebook: shop.theme_config?.social_links?.facebook || '',
      tiktok: shop.theme_config?.social_links?.tiktok || '',
      website: shop.theme_config?.social_links?.website || '',
      whatsapp: shop.theme_config?.social_links?.whatsapp || '',
    });
    setSettingsDeliveryZones(Array.isArray(shop.theme_config?.delivery_zones) ? shop.theme_config.delivery_zones.map((zone) => ({
      label: String(zone.label || ''),
      mode: zone.mode === 'sur_place' || zone.mode === 'retirer' ? zone.mode : 'livraison',
      fee: Number(zone.fee || 0),
      description: zone.description ? String(zone.description).slice(0, 120) : '',
    })) : []);

    if (shop.opening_hours) {
      setHoursEnabled(Boolean(shop.opening_hours.enabled));
      setOpenTime(shop.opening_hours.open_time || '08:00');
      setCloseTime(shop.opening_hours.close_time || '22:00');
      setActiveDays(shop.opening_hours.days && shop.opening_hours.days.length > 0 ? shop.opening_hours.days : [1, 2, 3, 4, 5, 6, 0]);
      setManualOverride(Boolean(shop.opening_hours.manual_override));
    } else {
      setHoursEnabled(false);
      setOpenTime('08:00');
      setCloseTime('22:00');
      setActiveDays([1, 2, 3, 4, 5, 6, 0]);
      setManualOverride(false);
    }
  };

  // Fetch products, orders, and flash bilan
  const loadShopData = async (shopId: number) => {
    const requestId = ++shopDataRequestId.current;
    const isCurrentRequest = () => requestId === shopDataRequestId.current;
    setDataLoading(true);
    setProducts([]);
    setOrders([]);
    setFlashBilan(null);
    try {
      // 1. Load shop details & products
      const shopRes = await fetch(`/api/shops/${shopId}`);
      if (!isCurrentRequest()) return;
      if (shopRes.status === 401) {
        setCurrentShop(null);
        setProducts([]);
        setOrders([]);
        setFlashBilan(null);
        setAuthError('Votre session a expiré. Veuillez vous reconnecter.');
        return;
      }
      if (shopRes.ok) {
        const sData = await shopRes.json();
        if (!isCurrentRequest()) return;
        const loadedShop = sData.shop;
        setCurrentShop(loadedShop);
        syncShopSettings(loadedShop);
        setProducts(sData.products || []);
      }

      // 2. Load orders
      const ordersRes = await fetch(`/api/shops/${shopId}/orders`);
      if (!isCurrentRequest()) return;
      if (ordersRes.status === 401) {
        setCurrentShop(null);
        setProducts([]);
        setOrders([]);
        setFlashBilan(null);
        setAuthError('Votre session a expiré. Veuillez vous reconnecter.');
        return;
      }
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        if (!isCurrentRequest()) return;
        const shopOrders = Array.isArray(oData) ? oData : (oData.orders || []);
        setOrders(shopOrders.filter((order: Order) => order.shop_id === shopId));
      }

      // 3. Load Flash Bilan
      const bilanRes = await fetch(`/api/shops/${shopId}/flash-bilan`);
      if (!isCurrentRequest()) return;
      if (bilanRes.status === 401) {
        setCurrentShop(null);
        setProducts([]);
        setOrders([]);
        setFlashBilan(null);
        setAuthError('Votre session a expiré. Veuillez vous reconnecter.');
        return;
      }
      if (bilanRes.ok) {
        const bData = await bilanRes.json();
        if (!isCurrentRequest()) return;
        setFlashBilan(bData);
      }
    } catch (err) {
      if (isCurrentRequest()) console.error('Error loading merchant data', err);
    } finally {
      if (isCurrentRequest()) setDataLoading(false);
    }
  };

  // Secure access handler using the unique merchant access link/token generated at shop creation.
  const handlePrivateAccessLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!accessCodeInput.trim()) {
      setAuthError('Veuillez renseigner votre code d’accès privé.');
      return;
    }

    setAuthLoading(true);

    try {
      const res = await fetch('/api/auth/merchant-access-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessCodeInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Code d’accès invalide.');
      }

      window.history.replaceState({}, '', '/app');
      setCurrentShop(data.shop);
      syncShopSettings(data.shop);
      loadShopData(data.shop.id);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Erreur lors de la connexion');
    } finally {
      setAuthLoading(false);
    }
  };

  // Legacy compatibility retained only for older records; the public V2 model remains free and active.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (phoneInput.includes('@')) {
      setAuthError('Utilisez le numéro WhatsApp saisi lors de la création de la boutique, pas l’adresse email.');
      return;
    }

    setAuthLoading(true);

    try {
      const res = await fetch('/api/auth/merchant-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneInput.trim(),
          pin: pinInput.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Identifiants invalides');
      }

      setCurrentShop(data.shop);
      syncShopSettings(data.shop);
      loadShopData(data.shop.id);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Erreur lors de la connexion');
    } finally {
      setAuthLoading(false);
    }
  };

  // Register New Shop
  const handleRegisterShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim() || !regEmail.trim() || !/^\d{6}$/.test(regPin.trim())) {
      toast.error('Renseignez le nom, l’e-mail, le WhatsApp et un PIN de 6 chiffres.');
      return;
    }
    setRegLoading(true);
    try {
      const res = await fetch('/api/shops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          whatsapp_number: regPhone.trim(),
          pin: regPin.trim(),
          pin_code: regPin.trim(),
          city: regCity === 'Autre ville / commune' ? regCityOther.trim() : regCity.trim(),
          category: regCategory,
          email: regEmail.trim(),
          accepted_terms_privacy: regAcceptedTermsPrivacy,
          welcome_message: CATEGORY_DEFAULTS[regCategory].welcomeMessage,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création de la boutique');
      }

      setCurrentShop(data.shop);
      syncShopSettings(data.shop);
      setIsRegisterModalOpen(false);
      const publicUrl = `${window.location.origin}/${data.shop.slug}`;
      const privateUrl = `${window.location.origin}/app?access=${encodeURIComponent(data.owner_access_token)}`;
      const accessMessage = `Votre boutique ${data.shop.name} est créée sur MaTable.ci. Votre essai Standard gratuit de ${TRIAL_DURATION_DAYS} jours a commencé et votre espace marchand est accessible immédiatement. Vérifiez votre identité pour publier la boutique, recevoir des commandes et payer une formule après l’essai. Vitrine : ${publicUrl} | Espace privé : ${privateUrl} | Identifiant : ${data.shop.whatsapp_number} | Mot de passe : le code PIN choisi.`;
      setRegistrationLinks({
        publicUrl,
        privateUrl,
        whatsappUrl: `https://wa.me/${data.shop.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(accessMessage)}`,
        emailUrl: `mailto:${regEmail.trim()}?subject=${encodeURIComponent(`Accès MaTable.ci - ${data.shop.name}`)}&body=${encodeURIComponent(accessMessage)}`,
      });
      loadShopData(data.shop.id);
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || 'Erreur lors de la création de la boutique');
    } finally {
      setRegLoading(false);
    }
  };

  const copyRegistrationLinks = async () => {
    if (!registrationLinks) return;
    const text = `Vitrine : ${registrationLinks.publicUrl}\nConnexion : ${registrationLinks.privateUrl}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('copy_failed');
      }
      toast.success('Liens copiés dans le presse-papiers.');
    } catch {
      toast.error('La copie a échoué. Sélectionnez les liens manuellement.');
    }
  };

  const handleStartTrial = async (tier: SubscriptionTier) => {
    if (!currentShop) return;
    setTrialStarting(true);
    try {
      const response = await fetch(`/api/shops/${currentShop.id}/start-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de démarrer l’essai.');
      setCurrentShop(data.shop);
      syncShopSettings(data.shop);
      toast.success(`Votre essai Standard gratuit de ${TRIAL_DURATION_DAYS} jours a commencé.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de contacter le serveur.');
    } finally {
      setTrialStarting(false);
    }
  };

  const copyOwnerLink = async (kind: 'public' | 'private') => {
    if (!currentShop) return;
    try {
      let link = `${window.location.origin}/${currentShop.slug}`;
      if (kind === 'private') {
        const res = await fetch(`/api/shops/${currentShop.id}/access-link`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Impossible de générer le lien privé.');
        link = data.access_url;
      }
      await navigator.clipboard.writeText(link);
      toast.success(kind === 'public' ? 'Lien vitrine copié.' : 'Lien privé copié.');
    } catch {
      toast.error('La copie a échoué. Vérifiez les permissions du navigateur.');
    }
  };

  // Logout handler
  const handleLogout = () => {
    if (new URLSearchParams(window.location.search).has('admin_shop_id')) {
      window.location.assign('/admin');
      return;
    }
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setCurrentShop(null);
    setProducts([]);
    setOrders([]);
    setFlashBilan(null);
  };

  // Toggle Shop Open/Closed (toggle-status)
  const handleToggleShopStatus = async () => {
    if (!currentShop) return;
    const newStatus = !currentShop.is_open;
    try {
      const res = await fetch(`/api/shops/${currentShop.id}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentShop(prev => (prev ? { ...prev, is_open: data.is_open } : null));
        setSettingsOpen(data.is_open);
        setManualOverride(true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible de modifier le statut de la boutique.');
      }
    } catch {
      toast.error('Impossible de contacter le serveur.');
    }
  };

  const handlePublicationStatusChange = async (publicationStatus: 'draft' | 'active') => {
    if (!currentShop) return;
    try {
      const response = await fetch(`/api/shops/${currentShop.id}/publication-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publication_status: publicationStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier la publication.');
      setCurrentShop((shop) => shop ? { ...shop, publication_status: data.publication_status } : null);
      toast.success(publicationStatus === 'active' ? 'Votre boutique est publiée.' : 'Votre boutique n’est plus publiée.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de contacter le serveur.');
    }
  };

  // Save Opening Hours Configuration
  const handleSaveOpeningHours = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentShop) return;

    try {
      const updatedHours = {
        enabled: hoursEnabled,
        open_time: openTime,
        close_time: closeTime,
        days: activeDays,
        manual_override: manualOverride,
      };

      const res = await fetch(`/api/shops/${currentShop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening_hours: updatedHours,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentShop(data.shop);
        setHoursSaved(true);
        setTimeout(() => setHoursSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible de sauvegarder les horaires.');
      }
    } catch {
      toast.error('Erreur lors de la mise à jour des horaires.');
    }
  };

  // Reset manual override to follow automated schedule
  const handleResetManualOverride = async () => {
    if (!currentShop) return;
    try {
      const updatedHours = {
        ...(currentShop.opening_hours || { enabled: hoursEnabled, open_time: openTime, close_time: closeTime, days: activeDays }),
        manual_override: false,
      };

      const res = await fetch(`/api/shops/${currentShop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening_hours: updatedHours,
        }),
      });

      if (res.ok) {
        setManualOverride(false);
        await loadShopData(currentShop.id);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible de reprendre le planning.');
      }
    } catch {
      toast.error('Impossible de contacter le serveur.');
    }
  };

  // Refresh the merchant's own bilan; the global cron remains admin-controlled.
  const handleTriggerCronBilan = async () => {
    setCronRunning(true);
    try {
      if (!currentShop) return;
      const res = await fetch(`/api/shops/${currentShop.id}/flash-bilan`);
      if (res.ok) {
        const data = await res.json();
        setCronResult(data);
        if (currentShop) {
          await loadShopData(currentShop.id);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible d’actualiser le bilan.');
      }
    } catch {
      toast.error('Impossible de contacter le serveur.');
    } finally {
      setCronRunning(false);
    }
  };

  // Quick Stock Step (+1 or -1)
  const handleQuickStockChange = async (productId: number, delta: number) => {
    if (!currentShop) return;
    const previousProduct = products.find((product) => product.id === productId);
    if (!previousProduct) return;

    try {
      // Optimistic update
      setProducts(prev => prev.map(p => {
        if (p.id === productId) {
          const newStock = Math.max(0, p.stock + delta);
          return {
    addDeliveryZone,
    updateDeliveryZone,
    removeDeliveryZone, ...p, stock: newStock };
        }
        return p;
      }));

      const res = await fetch(`/api/shops/${currentShop.id}/products/${productId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(prev => prev.map(p => (p.id === productId ? { ...p, stock: data.stock } : p)));
      } else {
        setProducts(prev => prev.map(p => (p.id === productId ? previousProduct : p)));
        toast.error('Impossible de mettre à jour le stock.');
      }
    } catch {
      setProducts(prev => prev.map(p => (p.id === productId ? previousProduct : p)));
      toast.error('Impossible de mettre à jour le stock.');
    }
  };

  // Quick Toggle Visibility (Masquer / Afficher)
  const handleQuickToggleVisibility = async (productId: number) => {
    if (!currentShop) return;
    try {
      const res = await fetch(`/api/shops/${currentShop.id}/products/${productId}/toggle-visibility`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(prev => prev.map(p => (p.id === productId ? { ...p, is_available: data.is_available } : p)));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible de modifier la visibilité.');
      }
    } catch {
      toast.error('Impossible de contacter le serveur.');
    }
  };

  // Internal function — executes the actual status PATCH (called directly or via confirm modal)
  const executeUpdateOrderStatus = async (orderId: number, newStatus: OrderStatus) => {
    if (!currentShop) return;
    try {
      const res = await fetch(`/api/shops/${currentShop.id}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de mise à jour du statut.');

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success(data.message || 'Statut mis à jour.');

      // Refresh products to sync restocked quantities
      const prodRes = await fetch(`/api/shops/${currentShop.id}/products`);
      if (prodRes.ok) {
        const prods = await prodRes.json();
        setProducts(prods);
      }
    } catch (err: unknown) {
      const e = err as Error;
      toast.error(e.message || 'Erreur lors de la mise à jour du statut.');
    }
  };

  // Update Order Status (with automatic restock on cancellation)
  const handleUpdateOrderStatus = (orderId: number, newStatus: OrderStatus) => {
    if (!currentShop) return;

    if (newStatus === 'cancelled') {
      setConfirmModal({
        message: 'Annuler cette commande ? Les articles seront automatiquement remis en stock.',
        onConfirm: () => executeUpdateOrderStatus(orderId, newStatus),
      });
      return;
    }
    executeUpdateOrderStatus(orderId, newStatus);
  };

  const addDeliveryZone = () => {
    setSettingsDeliveryZones((prev) => [...prev, { label: '', mode: 'livraison', fee: 0, description: '' }]);
  };

  const updateDeliveryZone = (index: number, field: keyof ShopDeliveryZone, value: string | number) => {
    setSettingsDeliveryZones((prev) => prev.map((zone, zoneIndex) => {
      if (zoneIndex !== index) return zone;
      if (field === 'mode') {
        return { ...zone, mode: (value === 'sur_place' || value === 'retirer' ? value : 'livraison') as ShopDeliveryZone['mode'] };
      }
      if (field === 'fee') {
        return { ...zone, fee: Number(value || 0) };
      }
      return { ...zone, [field]: value };
    }));
  };

  const removeDeliveryZone = (index: number) => {
    setSettingsDeliveryZones((prev) => prev.filter((_, zoneIndex) => zoneIndex !== index));
  };

  // Save General Shop Settings
  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop) return;

    const sanitizedSocialLinks = {
      instagram: settingsSocialLinks.instagram?.trim() || '',
      facebook: settingsSocialLinks.facebook?.trim() || '',
      tiktok: settingsSocialLinks.tiktok?.trim() || '',
      website: settingsSocialLinks.website?.trim() || '',
      whatsapp: settingsSocialLinks.whatsapp?.trim() || '',
    };

    const sanitizedDeliveryZones = settingsDeliveryZones
      .filter((zone) => zone.label.trim() || (zone.description ?? '').trim() || Number(zone.fee || 0) > 0)
      .map((zone) => ({
        label: zone.label.trim() || 'Zone locale',
        mode: zone.mode === 'sur_place' || zone.mode === 'retirer' ? zone.mode : 'livraison',
        fee: Number(zone.fee || 0),
        description: (zone.description ?? '').trim(),
      }));

    try {
      const res = await fetch(`/api/shops/${currentShop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settingsName.trim() || currentShop.name,
          welcome_message: settingsWelcome,
          is_open: settingsOpen,
          whatsapp_number: settingsPhone.trim(),
          city: settingsCity.trim(),
          pin_code: settingsNewPin.trim() ? settingsNewPin.trim() : undefined,
          theme_config: {
            social_links: sanitizedSocialLinks,
            delivery_zones: sanitizedDeliveryZones,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const updatedShop = { ...data.shop, ...(currentShop.admin_mode ? { admin_mode: true } : {}) };
        setCurrentShop(updatedShop);
        syncShopSettings(updatedShop);
        setSettingsSaved(true);
        setSettingsNewPin('');
        toast.success('Paramètres enregistrés avec succès !');
        setTimeout(() => setSettingsSaved(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Impossible de sauvegarder les paramètres.');
      }
    } catch {
      toast.error('Erreur lors de la mise à jour des paramètres');
    }
  };


  return {
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
    regAcceptedTermsPrivacy,
    setRegAcceptedTermsPrivacy,
    regCategory,
    regLoading,
    trialStarting,
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
    ...productEditor,
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
    handleUpdateOrderStatus,
    handleSaveGeneralSettings,
    toast,
    addDeliveryZone,
    updateDeliveryZone,
    removeDeliveryZone,

    loadShopData,
    syncShopSettings,
    copyRegistrationLinks,
    copyOwnerLink
  };
};
export type MerchantState = ReturnType<typeof useMerchantDashboard>;
