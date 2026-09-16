import React, { useState, useEffect } from 'react';
import { 
  Store, 
  ShoppingBag, 
  Package, 
  Plus, 
  Edit3, 
  Trash2, 
  Sparkles, 
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
  Upload
} from 'lucide-react';
import { Shop, Product, Order, FlashBilan, ShopCategory, SubscriptionTier, OrderStatus } from '../types';
import { formatFCFA, compressImageClientSide, cleanPhoneForWhatsApp } from '../utils/format';
import { MarketingStoryStudio } from './MarketingStoryStudio';
import { ThemeCustomizer } from './ThemeCustomizer';
import { useToast } from './Toast';

interface MerchantDashboardProps {
  currentShopSlug?: string;
  onOpenStorefront: (slug: string) => void;
}

const shopCategoryOptions: { value: ShopCategory; label: string; icon: string }[] = [
  { value: 'fashion', label: 'Mode, lingerie et accessoires', icon: '👗' },
  { value: 'food', label: 'Restauration et alimentation', icon: '🍲' },
  { value: 'beauty', label: 'Beauté, coiffure et bien-être', icon: '✨' },
  { value: 'electronics', label: 'Électronique et informatique', icon: '💻' },
  { value: 'home', label: 'Maison, déco et ameublement', icon: '🏠' },
  { value: 'services', label: 'Services aux particuliers et entreprises', icon: '🧰' },
  { value: 'health', label: 'Santé et parapharmacie', icon: '💚' },
  { value: 'crafts', label: 'Artisanat et créations locales', icon: '🧵' },
  { value: 'education', label: 'Éducation et formation', icon: '📚' },
  { value: 'automotive', label: 'Automobile et mobilité', icon: '🚗' },
  { value: 'other', label: 'Autre activité', icon: '🏪' },
];

const abidjanCommunes = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody',
  'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville',
  'Yopougon', 'Autre ville / commune',
];

const shopCategoryLabels: Record<ShopCategory, string> = {
  fashion: 'Mode',
  food: 'Food',
  beauty: 'Beauté',
  electronics: 'Électronique',
  home: 'Maison',
  services: 'Services',
  health: 'Santé',
  crafts: 'Artisanat',
  education: 'Éducation',
  automotive: 'Automobile',
  other: 'Commerce',
};

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ onOpenStorefront }) => {
  const toast = useToast();

  // Authentication state
  const [currentShop, setCurrentShop] = useState<Shop | null>(null);
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
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState<{ message: string; status: string; url?: string; challengeId?: string } | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [forgotPinInfo, setForgotPinInfo] = useState<{ message: string; whatsappUrl: string } | null>(null);

  // Quick Register Modal state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('+225');
  const [regPin, setRegPin] = useState('');
  const [regCity, setRegCity] = useState('Abidjan');
  const [regCityOther, setRegCityOther] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCategory, setRegCategory] = useState<ShopCategory>('fashion');
  const [regTier, setRegTier] = useState<SubscriptionTier>('standard');
  const [regLoading, setRegLoading] = useState(false);
  const [registrationLinks, setRegistrationLinks] = useState<{
    publicUrl: string;
    privateUrl: string;
    whatsappUrl: string;
    emailUrl: string;
    paymentLink?: string;
    paymentProvider?: 'whatsapp' | 'paystack';
  } | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'marketing' | 'settings'>('catalog');
  const [settingsSubTab, setSettingsSubTab] = useState<'themes' | 'general' | 'hours' | 'bilan'>('themes');

  // Products & Orders data
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [flashBilan, setFlashBilan] = useState<FlashBilan | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // Catalog search & filter
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'hidden'>('all');

  // Orders search & filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'wave' | 'mobile_money'>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');

  // Product Add/Edit Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodTitle, setProdTitle] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodPrice, setProdPrice] = useState<number | ''>('');
  const [prodStock, setProdStock] = useState<number | ''>(10);
  const [prodImage, setProdImage] = useState('');
  const [prodLookbookImage, setProdLookbookImage] = useState('');
  const [prodSizes, setProdSizes] = useState('');
  const [prodColors, setProdColors] = useState('');
  const [prodPrepTime, setProdPrepTime] = useState<number | ''>('');
  const [prodModifiers, setProdModifiers] = useState('');
  const [prodModifierMaxSelections, setProdModifierMaxSelections] = useState<number | ''>(2);
  const [prodIsAvailable, setProdIsAvailable] = useState(true);
  const [imageCompressing, setImageCompressing] = useState(false);
  const [compressedSizeKB, setCompressedSizeKB] = useState<number | null>(null);
  const [originalImageSizeKB, setOriginalImageSizeKB] = useState<number | null>(null);

  // Shop Settings state
  const [settingsName, setSettingsName] = useState('');
  const [settingsWelcome, setSettingsWelcome] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsCity, setSettingsCity] = useState('Abidjan');
  const [settingsNewPin, setSettingsNewPin] = useState('');
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

  // Check persistent session on mount
  useEffect(() => {
    const savedRegistrationLinks = localStorage.getItem('matable_registration_links');
    if (savedRegistrationLinks) {
      try {
        setRegistrationLinks(JSON.parse(savedRegistrationLinks));
      } catch {
        localStorage.removeItem('matable_registration_links');
      }
    }

    const savedShop = localStorage.getItem('matable_merchant_session');
    if (savedShop) {
      try {
        const parsed = JSON.parse(savedShop);
        setCurrentShop(parsed);
        syncShopSettings(parsed);
        loadShopData(parsed.id);
      } catch {
        localStorage.removeItem('matable_merchant_session');
      }
    }
  }, []);

  useEffect(() => {
    const accessToken = new URLSearchParams(window.location.search).get('access');
    if (!accessToken || currentShop) return;

    const openSession = (data: any) => {
      window.history.replaceState({}, '', '/app');
      setCurrentShop(data.shop);
      localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
      syncShopSettings(data.shop);
      loadShopData(data.shop.id);
    };

    fetch('/api/auth/merchant-access-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lien privé invalide.');
      }
      openSession(data);
    }).catch((error: Error) => setAuthError(error.message));
  }, [currentShop]);

  const syncShopSettings = (shop: Shop) => {
    setSettingsName(shop.name);
    setSettingsWelcome(shop.welcome_message || '');
    setSettingsOpen(shop.is_open);
    setSettingsPhone(shop.whatsapp_number || '');
    setSettingsCity(shop.city || 'Abidjan');
    setSettingsNewPin('');

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
    setDataLoading(true);
    try {
      // 1. Load shop details & products
      const shopRes = await fetch(`/api/shops/${shopId}`);
      if (shopRes.ok) {
        const sData = await shopRes.json();
        setCurrentShop(sData.shop);
        syncShopSettings(sData.shop);
        setProducts(sData.products || []);
      }

      // 2. Load orders
      const ordersRes = await fetch(`/api/shops/${shopId}/orders`);
      if (ordersRes.status === 401) {
        localStorage.removeItem('matable_merchant_session');
        setCurrentShop(null);
        setProducts([]);
        setOrders([]);
        setFlashBilan(null);
        setAuthError('Votre session a expiré. Veuillez vous reconnecter.');
        return;
      }
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(Array.isArray(oData) ? oData : (oData.orders || []));
      }

      // 3. Load Flash Bilan
      const bilanRes = await fetch(`/api/shops/${shopId}/flash-bilan`);
      if (bilanRes.status === 401) {
        localStorage.removeItem('matable_merchant_session');
        setCurrentShop(null);
        setProducts([]);
        setOrders([]);
        setFlashBilan(null);
        setAuthError('Votre session a expiré. Veuillez vous reconnecter.');
        return;
      }
      if (bilanRes.ok) {
        const bData = await bilanRes.json();
        setFlashBilan(bData);
      }
    } catch (err) {
      console.error('Error loading merchant data', err);
    } finally {
      setDataLoading(false);
    }
  };

  // Secure access handler using the unique merchant access link/token generated at shop creation.
  const handlePrivateAccessLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotPinInfo(null);
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
      localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
      syncShopSettings(data.shop);
      loadShopData(data.shop.id);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Erreur lors de la connexion');
    } finally {
      setAuthLoading(false);
    }
  };

  // Legacy fallback retained only for compatibility while the public flow is being phased out.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setForgotPinInfo(null);
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
      localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
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
    if (!regName.trim() || !regPhone.trim() || !/^\d{6}$/.test(regPin.trim())) {
      toast.error('Renseignez le nom, le WhatsApp et un PIN de 6 chiffres.');
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
          email: regEmail.trim() || undefined,
          subscription_tier: regTier,
          welcome_message: regCategory === 'food' 
            ? 'Commandez nos plats chauds du jour livrés directement à Abidjan !'
            : 'Découvrez notre collection raffinée livrée en toute discrétion à Abidjan.',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création de la boutique');
      }

      setCurrentShop(data.shop);
      localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
      syncShopSettings(data.shop);
      setIsRegisterModalOpen(false);
      const publicUrl = `${window.location.origin}/${data.shop.slug}`;
      const privateUrl = `${window.location.origin}/app`;
      const accessMessage = `Votre boutique ${data.shop.name} est créée sur MaTable.ci. Vitrine : ${publicUrl} | Connexion : ${privateUrl} | Identifiant : ${data.shop.whatsapp_number} | Mot de passe : le code PIN choisi.`;
      setRegistrationLinks({
        publicUrl,
        privateUrl,
        whatsappUrl: `https://wa.me/${data.shop.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(accessMessage)}`,
        emailUrl: `mailto:${regEmail.trim()}?subject=${encodeURIComponent(`Accès MaTable.ci - ${data.shop.name}`)}&body=${encodeURIComponent(accessMessage)}`,
        paymentLink: data.payment_link || undefined,
        paymentProvider: data.payment_provider || 'whatsapp',
      });
      localStorage.setItem('matable_registration_links', JSON.stringify({
        publicUrl,
        privateUrl,
        whatsappUrl: `https://wa.me/${data.shop.whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(accessMessage)}`,
        emailUrl: `mailto:${regEmail.trim()}?subject=${encodeURIComponent(`Accès MaTable.ci - ${data.shop.name}`)}&body=${encodeURIComponent(accessMessage)}`,
        paymentLink: data.payment_link || undefined,
        paymentProvider: data.payment_provider || 'whatsapp',
      }));
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

  // Forgot PIN handler
  const handleForgotPin = async () => {
    if (!phoneInput.trim()) {
      setAuthError('Veuillez d’abord renseigner votre numéro de téléphone.');
      return;
    }

    try {
      const res = await fetch('/api/auth/merchant-forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Numéro introuvable');
      }

      setForgotPinInfo(data);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Erreur lors de la récupération du code PIN');
    }
  };

  const handleRecoveryRequest = async () => {
    if (!phoneInput.trim()) {
      setAuthError('Veuillez renseigner votre numéro de téléphone pour récupérer l’accès.');
      return;
    }

    setRecoveryLoading(true);
    setAuthError(null);
    setRecoveryInfo(null);

    try {
      const res = await fetch('/api/auth/merchant-recovery-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Impossible de lancer la récupération.');
      }

      setRecoveryInfo({
        message: data.message || (data.whatsapp_sent ? 'Un lien de récupération a été envoyé sur WhatsApp.' : 'La demande de récupération a été enregistrée.'),
        status: data.whatsapp_status || 'ok',
        url: data.fallback_url,
        challengeId: data.challenge_id,
      });
      setRecoveryCodeInput('');
      setAccessCodeInput('');
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Erreur lors de la récupération de l’accès.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleRecoveryCodeVerification = async () => {
    if (!recoveryInfo?.challengeId || !/^\d{6}$/.test(recoveryCodeInput.trim())) {
      setAuthError('Saisissez le code de récupération à 6 chiffres reçu sur WhatsApp.');
      return;
    }

    setRecoveryLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/merchant-recovery-verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: recoveryInfo.challengeId, code: recoveryCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.owner_access_token) {
        throw new Error(data.error || 'Code de récupération invalide.');
      }
      window.location.assign(`/app?access=${encodeURIComponent(data.owner_access_token)}`);
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message || 'Impossible de vérifier le code de récupération.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem('matable_merchant_session');
    setCurrentShop(null);
    setProducts([]);
    setOrders([]);
    setFlashBilan(null);
  };

  const handleMarketingTab = () => {
    setActiveTab('marketing');
  };

  // Toggle Shop Open/Closed (toggle-status)
  const handleToggleShopStatus = async () => {
    if (!currentShop) return;
    const newStatus = !currentShop.is_open;
    try {
      const res = await fetch(`/api/shops/${currentShop.id}/toggle-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentShop(prev => (prev ? { ...prev, is_open: data.is_open } : null));
        setSettingsOpen(data.is_open);
        setManualOverride(true);
      }
    } catch (e) {
      console.error('Erreur toggle status', e);
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
        localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
        setHoursSaved(true);
        setTimeout(() => setHoursSaved(false), 3000);
      }
    } catch (err) {
      console.error('Erreur sauvegarde horaires', err);
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
      }
    } catch (err) {
      console.error('Erreur réinitialisation forçage', err);
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
      }
    } catch (err) {
      console.error('Erreur actualisation du bilan', err);
    } finally {
      setCronRunning(false);
    }
  };

  // Quick Stock Step (+1 or -1)
  const handleQuickStockChange = async (productId: number, delta: number) => {
    if (!currentShop) return;
    try {
      // Optimistic update
      setProducts(prev => prev.map(p => {
        if (p.id === productId) {
          const newStock = Math.max(0, p.stock + delta);
          return { ...p, stock: newStock };
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
      }
    } catch (e) {
      console.error('Erreur stock step', e);
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
      }
    } catch (e) {
      console.error('Erreur toggle visibility', e);
    }
  };

  // Open modal for new product
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setProdTitle('');
    setProdCategory('');
    setProdDescription('');
    setProdPrice('');
    setProdStock(10);
    setProdLookbookImage('');
    setProdImage(
      currentShop?.category === 'food'
        ? 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'
    );
    setProdSizes(currentShop?.category === 'fashion' ? 'S, M, L, XL' : '');
    setProdColors(currentShop?.category === 'fashion' ? 'Noir, Rouge' : '');
    setProdPrepTime(currentShop?.category === 'food' ? 20 : '');
    setProdModifiers(currentShop?.category === 'food' ? 'Sauce pimentée, Alloco en plus, Boisson fraîche' : '');
    setProdModifierMaxSelections(2);
    setProdIsAvailable(true);
    setCompressedSizeKB(null);
    setOriginalImageSizeKB(null);
    setIsProductModalOpen(true);
  };

  // Open modal for editing product
  const handleOpenEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setProdTitle(prod.title);
    setProdCategory(prod.category || '');
    setProdDescription(prod.description || '');
    setProdPrice(prod.price);
    setProdStock(prod.stock);
    setProdImage(prod.image_url);
    setProdLookbookImage(prod.lookbook_image || '');
    setProdSizes(prod.sizes ? prod.sizes.join(', ') : '');
    
    // Parse colors
    if (prod.colors && Array.isArray(prod.colors)) {
      const cList = prod.colors.map(c => typeof c === 'string' ? c : c.name);
      setProdColors(cList.join(', '));
    } else {
      setProdColors('');
    }

    setProdPrepTime(prod.prep_time || '');
    
    // Parse modifiers
    if (prod.modifier_groups && Array.isArray(prod.modifier_groups)) {
      const modStrings = prod.modifier_groups.map(g => {
        const optLabels = g.options.map(o => typeof o === 'string' ? o : o.label).join(', ');
        return `${g.name}: ${optLabels}`;
      });
      setProdModifiers(modStrings.join(' | '));
      setProdModifierMaxSelections(prod.modifier_groups[0]?.max_selections || 2);
    } else {
      setProdModifiers('');
      setProdModifierMaxSelections(2);
    }

    setProdIsAvailable(prod.is_available !== false);
    setCompressedSizeKB(null);
    setOriginalImageSizeKB(null);
    setIsProductModalOpen(true);
  };

  // Update Order Status (with automatic restock on cancellation)
  const handleUpdateOrderStatus = async (orderId: number, newStatus: OrderStatus) => {
    if (!currentShop) return;

    if (newStatus === 'cancelled') {
      const confirmed = confirm("Annuler cette commande ? Les articles seront automatiquement remis en stock.");
      if (!confirmed) return;
    }

    try {
      const res = await fetch(`/api/shops/${currentShop.id}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur de mise à jour du statut.');
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success(data.message || 'Statut mis à jour.');

      // Refresh products to sync restocked quantities
      const prodRes = await fetch(`/api/shops/${currentShop.id}/products`);
      if (prodRes.ok) {
        const prods = await prodRes.json();
        setProducts(prods);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la mise à jour du statut.');
    }
  };

  // Handle client-side image compression (< 100 KB)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImageCompressing(true);
      setOriginalImageSizeKB(Math.round(file.size / 1024));
      const { dataUrl, sizeKB } = await compressImageClientSide(file, 900, 100);
      setProdImage(dataUrl);
      setCompressedSizeKB(sizeKB);
    } catch {
      toast.error("Erreur lors de la compression de l'image.");
    } finally {
      setImageCompressing(false);
    }
  };

  // Save Product (Add or Edit)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop || !prodTitle.trim() || prodPrice === '') return;

    const parsedSizes = prodSizes
      ? prodSizes.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    const parsedColors = prodColors
      ? prodColors.split(',').map(c => c.trim()).filter(Boolean)
      : undefined;
    const parsedPrepTime = prodPrepTime !== '' ? Number(prodPrepTime) : undefined;

    // Parse food modifiers
    let parsedModifiers = undefined;
    if (currentShop.category === 'food' && prodModifiers.trim()) {
      const maxSelections = Math.min(2, Math.max(1, Number(prodModifierMaxSelections) || 1));
      parsedModifiers = prodModifiers.split('|').map((groupStr, idx) => {
        const parts = groupStr.split(':');
        const name = parts.length > 1 ? parts[0].trim() : `Options ${idx + 1}`;
        const rawOptions = (parts.length > 1 ? parts[1] : parts[0]).split(',').map(o => o.trim()).filter(Boolean);
        return {
          id: `mod-${idx}`,
          name,
          required: false,
          max_selections: maxSelections,
          options: rawOptions.map(label => ({
            id: `opt-${label.toLowerCase().replace(/\s+/g, '-')}`,
            name: label,
            label,
            price_delta: 0
          }))
        };
      }).filter(g => g.options.length > 0);
    }

    const payload = {
      title: prodTitle.trim(),
      category: prodCategory.trim() || undefined,
      description: prodDescription.trim(),
      price: Number(prodPrice),
      stock: prodStock === '' ? 0 : Number(prodStock),
      image_url: prodImage,
      lookbook_image: prodLookbookImage.trim() || undefined,
      sizes: parsedSizes,
      colors: parsedColors,
      prep_time: parsedPrepTime,
      modifier_groups: parsedModifiers,
      is_available: prodIsAvailable,
    };

    try {
      if (editingProduct) {
        // Edit existing
        const res = await fetch(`/api/shops/${currentShop.id}/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setProducts(prev => prev.map(p => (p.id === editingProduct.id ? data.product : p)));
          setIsProductModalOpen(false);
          toast.success('Article modifié avec succès !');
        }
      } else {
        // Add new
        const res = await fetch(`/api/shops/${currentShop.id}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setProducts(prev => [data.product, ...prev]);
          setIsProductModalOpen(false);
          toast.success('Article ajouté au catalogue !');
        }
      }
    } catch {
      toast.error("Erreur lors de l'enregistrement de l'article");
    }
  };

  // Delete Product
  const handleDeleteProduct = async (productId: number) => {
    if (!currentShop) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet article du catalogue ?')) return;

    try {
      const res = await fetch(`/api/shops/${currentShop.id}/products/${productId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== productId));
        toast.success('Article supprimé du catalogue.');
      }
    } catch {
      toast.error("Erreur lors de la suppression de l'article");
    }
  };

  // Save General Shop Settings
  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShop) return;

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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentShop(data.shop);
        localStorage.setItem('matable_merchant_session', JSON.stringify(data.shop));
        setSettingsSaved(true);
        setSettingsNewPin('');
        toast.success('Paramètres enregistrés avec succès !');
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch {
      toast.error('Erreur lors de la mise à jour des paramètres');
    }
  };

  // 1. UN-AUTHENTICATED -> LOGIN VIEW
  if (!currentShop) {
    return (
      <div className="merchant-login min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-md overflow-hidden rounded-[30px] border-[3px] border-[#211712] bg-[#fffaf2] p-5 shadow-[10px_10px_0_rgba(33,23,18,0.96)] sm:p-7">
          <div className="absolute -right-10 top-8 h-24 w-24 rounded-full bg-[#f0d6a5]/60 blur-2xl" />
          <div className="absolute -left-8 bottom-8 h-20 w-20 rounded-full bg-[#dfe9fb]/80 blur-2xl" />

          <div className="relative text-center mb-5">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#211712] text-[#f4e6c8] mb-3 shadow-[4px_4px_0_#e2461b]">
              <Store className="w-7 h-7" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border-[2px] border-[#211712] bg-[#edf7f2] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#155c3d] mb-3">
              <span className="h-2 w-2 rounded-full bg-[#1e7a52]" />
              Accès protégé
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#211712] tracking-tight">
              Connexion à mon espace boutique
            </h2>
            <p className="text-xs text-[#4a3a30] mt-2 max-w-xs mx-auto leading-relaxed">
              Connectez-vous avec l’identifiant et le mot de passe de votre boutique.
            </p>
          </div>

          {authError && (
            <div className="relative mb-4 p-3 rounded-xl bg-[#fdf1ee] border-[2px] border-[#b93712] text-[#b93712] text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#b93712]" />
              <span>{authError}</span>
            </div>
          )}

          {false && recoveryInfo && (
            <div className="relative mb-4 p-3 rounded-xl bg-[#f8eed7] border-[2px] border-[#211712] text-[#211712] text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#155c3d]" />
                <span>{recoveryInfo.message}</span>
              </div>
              {recoveryInfo.url && (
                <a
                  href={recoveryInfo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1b3a63] underline"
                >
                  <span>Ouvrir WhatsApp (lien de secours)</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {recoveryInfo.challengeId && (
                <div className="space-y-2 pt-1">
                  <label className="block text-[10px] font-bold text-[#4a3a30]" htmlFor="recovery-code">
                    Code reçu sur WhatsApp
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="recovery-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={recoveryCodeInput}
                      onChange={(event) => setRecoveryCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="min-w-0 flex-1 rounded-lg border-[2px] border-[#211712] bg-white px-3 py-2 text-center text-sm font-black tracking-[0.25em] text-[#211712]"
                    />
                    <button
                      type="button"
                      onClick={handleRecoveryCodeVerification}
                      disabled={recoveryLoading || recoveryCodeInput.length !== 6}
                      className="rounded-lg border-[2px] border-[#211712] bg-[#155c3d] px-3 py-2 text-[10px] font-black text-white shadow-[2px_2px_0_rgba(33,23,18,0.94)] disabled:opacity-50"
                    >
                      Vérifier
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[#4a3a30]">Statut : {recoveryInfo.status}</p>
            </div>
          )}

          {false && forgotPinInfo && (
            <div className="relative mb-4 p-3 rounded-xl bg-[#edf7f2] border-[2px] border-[#211712] text-[#155c3d] text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#155c3d]" />
                <span>{forgotPinInfo.message}</span>
              </div>
              <a
                href={forgotPinInfo.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#155c3d] underline"
              >
                <span>Envoyer le rappel sur WhatsApp</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {false ? (
            <form onSubmit={handlePrivateAccessLogin} className="relative space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                  Lien privé ou code d’accès
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-[#4a3a30] absolute left-3 top-3.5" />
                  <input
                    type={showAccessCode ? 'text' : 'password'}
                    required
                    placeholder="Collez votre lien privé ou le code unique reçu"
                    value={accessCodeInput}
                    onChange={(e) => setAccessCodeInput(e.target.value)}
                    className="w-full text-xs py-3 pl-10 pr-12 rounded-xl border-[2px] border-[#211712] bg-[#fff] font-mono text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                  />
                  <button type="button" onClick={() => setShowAccessCode((visible) => !visible)} aria-label={showAccessCode ? 'Masquer le lien privé' : 'Afficher le lien privé'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#4a3a30] hover:bg-[#f7f1e6]">
                    {showAccessCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#1b3a63] hover:bg-[#122744] text-white font-extrabold text-sm shadow-[4px_4px_0_rgba(33,23,18,0.96)] border-[2px] border-[#211712] transition-colors flex items-center justify-center gap-2"
              >
                <span>{authLoading ? 'Vérification...' : 'Accéder via mon lien privé'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="relative space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                  Identifiant de la boutique
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#4a3a30] absolute left-3 top-3.5" />
                  <input
                    type="tel"
                    required
                    placeholder="+2250708091011"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full text-xs py-3 pl-10 pr-3 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#4a3a30] absolute left-3 top-3.5" />
                  <input
                    type={showPinInput ? 'text' : 'password'}
                    required
                    inputMode="numeric"
                    pattern="[0-9]*"
                    minLength={4}
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full text-xs py-3 pl-10 pr-12 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                  />
                  <button type="button" onClick={() => setShowPinInput((visible) => !visible)} aria-label={showPinInput ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#4a3a30] hover:bg-[#f7f1e6]">
                    {showPinInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-[#e2461b] hover:bg-[#c53916] text-white font-extrabold text-sm shadow-[4px_4px_0_rgba(33,23,18,0.96)] border-[2px] border-[#211712] transition-colors flex items-center justify-center gap-2"
              >
                <span>{authLoading ? 'Connexion...' : 'Se connecter'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {false && <div className="relative mt-4 pt-3 border-t-[2px] border-[#211712]">
            <div className="space-y-2.5">
              <span className="block font-bold text-[#211712] text-[11px]">J’ai perdu mon accès ?</span>
              <p className="text-[10px] text-[#4a3a30] leading-relaxed">
                En cas de perte, contactez l’administrateur avec le numéro de votre boutique pour obtenir un nouveau lien sécurisé.
              </p>

              <div>
                <label className="block text-[10px] font-bold text-[#4a3a30] mb-1">
                  Numéro WhatsApp de votre boutique
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Ex. +2250708091011"
                  className="w-full text-[11px] py-2.5 px-3 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                />
              </div>

              <button
                type="button"
                onClick={() => setAuthError('La récupération automatique est désactivée. Contactez l’administrateur avec le numéro de votre boutique.')}
                disabled={false}
                className="w-full inline-flex items-center justify-center rounded-lg border-[2px] border-[#211712] bg-[#f7e7c7] px-3 py-2 text-[11px] font-extrabold text-[#211712] hover:bg-[#f0d6a5] disabled:opacity-60 transition-colors shadow-[3px_3px_0_rgba(33,23,18,0.94)]"
              >
                Contacter l’administrateur
              </button>
            </div>
          </div>}

          {false && (<>
          <div className="relative mt-5 rounded-2xl border-[2px] border-[#211712] bg-[#fffaf2] p-3 shadow-[3px_3px_0_rgba(33,23,18,0.94)]">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] mb-2">
              Comment l’utiliser ?
            </p>
            <ol className="space-y-1.5 text-[11px] text-[#4a3a30] list-decimal list-inside">
              <li>Utilisez le lien privé reçu lors de la création de votre boutique.</li>
              <li>Collez-le dans le champ ci-dessus pour accéder directement à votre espace.</li>
              <li>Ne partagez jamais ce lien dans un groupe public ou un canal ouvert.</li>
              <li>En cas de perte, contactez l’administrateur pour générer un nouveau lien sécurisé.</li>
            </ol>
          </div>

          <div className="relative mt-5 rounded-2xl border-[2px] border-[#211712] bg-[#edf7f2] p-3 shadow-[3px_3px_0_rgba(33,23,18,0.94)]">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#155c3d] mb-2">
              Bonnes pratiques
            </p>
            <ul className="space-y-1.5 text-[11px] text-[#4a3a30]">
              <li>• Le lien privé est unique par boutique.</li>
              <li>• Le numéro WhatsApp ne doit pas servir de clé d’accès principale.</li>
              <li>• Le lien est la vraie clé d’accès sécurisé de votre espace.</li>
            </ul>
          </div>
          </>)}

          <div className="relative mt-5 pt-4 border-t-[2px] border-[#211712] text-center">
            <p className="text-xs text-[#4a3a30] max-w-sm mx-auto mb-3">
              Vous n’avez pas encore de boutique ? Créez-la ici. Vous vous connecterez ensuite avec votre identifiant et votre mot de passe.
            </p>
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(true)}
              className="text-xs font-extrabold text-[#211712] hover:text-[#1b3a63] flex items-center justify-center gap-1.5 mx-auto py-1"
            >
              <UserPlus className="w-4 h-4" />
              <span>Créer ma boutique</span>
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-400 mt-4">
            MaTable.ci • Espace boutique professionnel
          </p>
        </div>

        {/* REGISTER NEW SHOP MODAL */}
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211712]/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-[28px] border-[3px] border-[#211712] bg-[#fffaf2] p-4 shadow-[10px_10px_0_rgba(33,23,18,0.96)] sm:p-6">
              <div className="flex items-center justify-between border-b-[2px] border-[#211712] pb-3">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-[#211712]" />
                  <div>
                    <h3 className="font-extrabold text-[#211712] text-base">Créer ma boutique</h3>
                    <p className="text-[10px] text-[#6b5548] mt-0.5">Quelques informations pour préparer votre espace.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  aria-label="Fermer le formulaire"
                  className="w-8 h-8 rounded-full border-[2px] border-[#211712] bg-[#f7e7c7] hover:bg-[#f0d6a5] flex items-center justify-center text-[#211712]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#6b5548]">
                <div className="rounded-xl border-[2px] border-[#211712] bg-white px-2 py-2 text-[#1b3a63]"><span className="block text-sm">1</span>Infos</div>
                <div className="rounded-xl border-[2px] border-[#211712] bg-[#f7e7c7] px-2 py-2 text-[#8a5a12]"><span className="block text-sm">2</span>Accès gratuit</div>
                <div className="rounded-xl border-[2px] border-[#211712] bg-[#edf7f2] px-2 py-2 text-[#155c3d]"><span className="block text-sm">3</span>Accès</div>
              </div>

              <form onSubmit={handleRegisterShop} className="mt-5 space-y-5">
                <section className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63]">Identité de la boutique</p>
                    <p className="text-[11px] text-[#6b5548] mt-1">Ces informations seront visibles par vos clients.</p>
                  </div>
                  <input
                    type="text"
                    aria-label="Nom de votre boutique"
                    required
                    placeholder="Ex: Glamour Abidjan, Babi Braisé..."
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full text-sm p-3 rounded-xl border-[2px] border-[#211712] bg-white font-bold text-[#211712] placeholder:text-slate-400"
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                      Secteur d'activité *
                    </label>
                    <select
                      value={regCategory}
                      onChange={(e) => setRegCategory(e.target.value as ShopCategory)}
                      className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#211712] bg-white font-bold text-[#211712]"
                    >
                      {shopCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#4a3a30] mb-1">Ville / Commune *</label>
                    <select
                      required
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712]"
                    >
                      <option value="Abidjan">Abidjan</option>
                      {abidjanCommunes.map((commune) => <option key={commune} value={commune}>{commune}</option>)}
                    </select>
                    {regCity === 'Autre ville / commune' && (
                      <input
                        type="text"
                        required
                        value={regCityOther}
                        onChange={(e) => setRegCityOther(e.target.value)}
                        placeholder="Saisissez votre ville ou commune"
                        className="mt-2 w-full text-xs p-2.5 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712]"
                      />
                    )}
                  </div>
                </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63]">Accès et contact</p>
                    <p className="text-[11px] text-[#6b5548] mt-1">Votre numéro sert de contact public pour les commandes. Conservez votre lien privé de gestion.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                      Numéro WhatsApp *
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      required
                      placeholder="+225 07 00 11 22 33"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#211712] bg-white font-mono text-[#211712]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4a3a30] mb-1">
                      Code PIN (6 chiffres) *
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPin ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        placeholder="6 chiffres"
                        value={regPin}
                        onChange={(e) => setRegPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full text-xs p-2.5 pr-12 rounded-xl border-[2px] border-[#211712] bg-white font-mono text-center tracking-widest text-[#211712]"
                      />
                      <button type="button" onClick={() => setShowRegPin((visible) => !visible)} aria-label={showRegPin ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                        {showRegPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4a3a30] mb-1">Email de réception <span className="font-normal text-slate-500">(optionnel)</span></label>
                    <input
                      type="email"
                      placeholder="vous@exemple.ci"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712]"
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63]">Accès complet inclus</p>
                    <p className="text-[11px] text-[#6b5548] mt-1">Toutes les fonctionnalités sont incluses gratuitement pour chaque boutique.</p>
                  </div>
                  <div className="rounded-2xl border-[2px] border-[#211712] bg-[#edf7f2] p-3 text-[11px] text-[#155c3d] leading-relaxed">
                    Après la création, vous recevez votre lien privé et votre lien vitrine. Catalogue, personnalisation, promotions et studio marketing sont immédiatement disponibles.
                  </div>
                </section>

                <div className="pt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="py-3 px-4 rounded-xl border-[2px] border-[#211712] bg-[#fff] text-[#211712] font-bold text-xs shadow-[3px_3px_0_rgba(33,23,18,0.94)] sm:w-auto"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={regLoading}
                    className="py-3 px-5 rounded-xl bg-[#1b3a63] text-white font-bold text-xs border-[2px] border-[#211712] shadow-[4px_4px_0_rgba(33,23,18,0.95)] sm:w-auto"
                  >
                    {regLoading ? 'Création...' : 'Créer ma boutique'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
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
        {currentShop && currentShop.payment_status === 'pending' && (
          <div className="border-b-[2px] border-[#211712] bg-gradient-to-r from-[#ecf0f8] via-[#f7e7c7] to-[#f8dcd0] px-4 py-3">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-[#211712]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-2.5 py-1 font-black text-white">
                  <Sparkles className="w-3.5 h-3.5" />
                  Activation administrateur
                </span>
                <span className="font-semibold text-slate-700">
                  Contactez l’administrateur pour réactiver cette boutique.
                </span>
              </div>
            </div>
          </div>
        )}
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
                {currentShop.category === 'food' ? <UtensilsCrossed className="w-5 h-5" /> : <Shirt className="w-5 h-5" />}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="max-w-full truncate font-black text-slate-900 text-base sm:text-lg">{currentShop.name}</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {currentShop.category === 'food' ? '🍲' : '🏪'} {shopCategoryLabels[currentShop.category]}
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  {currentShop.subscription_tier.toUpperCase()}
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
              <a href={registrationLinks.whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Partager sur WhatsApp</a>
              {regEmail.trim() && <a href={registrationLinks.emailUrl} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Préparer un email</a>}
              <button type="button" onClick={copyRegistrationLinks} className="px-3 py-2 rounded-xl bg-white border border-emerald-200 text-emerald-900 text-xs font-bold">Copier les liens privés</button>
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
            onClick={handleMarketingTab}
            className={`py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shrink-0 border-[2px] ${
              activeTab === 'marketing'
                ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.95)]'
                : 'bg-[#fffaf2] text-[#211712] border-[#211712] hover:bg-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-[#e8a93a]" />
            <span>Studio Marketing 9:16</span>
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

        {/* TAB 1: CATALOG MANAGEMENT */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            {/* Header with Search and Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Articles du catalogue</h2>
                <p className="text-xs text-slate-500">
                  {currentShop.category === 'food' 
                    ? 'Gérez vos plats, temps de préparation et disponibilités.' 
                    : 'Gérez vos vêtements, tailles, couleurs et stocks.'}
                </p>
              </div>

              <button
                id="add-product-modal-btn"
                onClick={handleOpenAddModal}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter un article</span>
              </button>
            </div>

            {/* Filter pills & search bar */}
            <div className="bg-[#fffaf2] p-3 rounded-2xl border-[2px] border-[#211712] shadow-[4px_4px_0_rgba(33,23,18,0.94)] flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#4a3a30] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Rechercher un article..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setCatalogFilter('all')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'all'
                      ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-white text-[#211712] border-[#211712] hover:bg-[#f7f0e7]'
                  }`}
                >
                  Tous ({products.length})
                </button>
                <button
                  onClick={() => setCatalogFilter('in_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'in_stock'
                      ? 'bg-[#155c3d] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#edf7f2] text-[#155c3d] border-[#211712] hover:bg-[#e3f3ea]'
                  }`}
                >
                  En stock ({products.filter(p => p.stock > 3 && p.is_available !== false).length})
                </button>
                <button
                  onClick={() => setCatalogFilter('low_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'low_stock'
                      ? 'bg-[#b93712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#f9e7d6] text-[#b93712] border-[#211712] hover:bg-[#f4d9c0]'
                  }`}
                >
                  Stock bas ({lowStockCount})
                </button>
                <button
                  onClick={() => setCatalogFilter('out_of_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'out_of_stock'
                      ? 'bg-[#b93712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#fdf1ee] text-[#b93712] border-[#211712] hover:bg-[#fbe5df]'
                  }`}
                >
                  Épuisé ({outOfStockCount})
                </button>
                <button
                  onClick={() => setCatalogFilter('hidden')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'hidden'
                      ? 'bg-[#211712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#f3f4f6] text-[#211712] border-[#211712] hover:bg-[#eceef1]'
                  }`}
                >
                  Masqués ({products.filter(p => p.is_available === false).length})
                </button>
              </div>
            </div>

            {/* Product Cards Grid */}
            {dataLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3" aria-label="Chargement du catalogue">
                {[1, 2, 3].map((skeleton) => (
                  <div key={skeleton} className="h-72 animate-pulse rounded-[1.5rem] border-[2px] border-slate-200 bg-white" />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">Aucun article trouvé</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
                  {catalogSearch || catalogFilter !== 'all'
                    ? 'Aucun produit ne correspond à vos filtres actuels.'
                    : 'Ajoutez vos articles en renseignant le prix en FCFA, le stock et une photo compressée.'}
                </p>
                <button
                  onClick={handleOpenAddModal}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter un article</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredProducts.map(prod => (
                  <div 
                    key={prod.id}
                    className={`bg-[#fffaf2] rounded-[1.5rem] border-[2px] ${prod.is_available === false ? 'border-dashed border-[#211712] opacity-75' : 'border-[#211712]'} overflow-hidden shadow-[5px_5px_0_rgba(33,23,18,0.92)] flex flex-col transition-all hover:-translate-y-0.5`}
                  >
                    <div className="relative aspect-4/3 bg-[#f3efe8]">
                      <img
                        src={prod.image_url}
                        alt={prod.title}
                        className="w-full h-full object-cover"
                      />
                      {prod.prep_time && (
                        <span className="absolute top-2 left-2 bg-[#211712]/85 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#e8a93a]" />
                          <span>{prod.prep_time} min</span>
                        </span>
                      )}

                      {prod.is_available === false && (
                        <span className="absolute bottom-2 left-2 bg-[#211712]/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <EyeOff className="w-3 h-3 text-[#f4e6c8]" />
                          <span>Masqué</span>
                        </span>
                      )}

                      {prod.stock <= 0 ? (
                        <span className="absolute top-2 right-2 bg-[#b93712] text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs">
                          Épuisé
                        </span>
                      ) : prod.stock <= 3 ? (
                        <span className="absolute top-2 right-2 bg-[#e8a93a] text-[#211712] text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                          Stock bas ({prod.stock})
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 bg-[#1b3a63] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Stock: {prod.stock}
                        </span>
                      )}
                    </div>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-extrabold text-[#211712] text-sm line-clamp-1">
                          {prod.title}
                        </h3>
                        <span className="font-black text-[#211712] text-sm shrink-0">
                          {formatFCFA(prod.price)}
                        </span>
                      </div>

                      {prod.description && (
                        <p className="text-[#4a3a30] text-xs line-clamp-2 mb-2 leading-relaxed">
                          {prod.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1 mb-2">
                        {prod.sizes && prod.sizes.map(s => (
                          <span key={s} className="text-[10px] bg-[#f1f3f5] font-bold px-1.5 py-0.5 rounded text-[#211712] border border-[#211712]/10">
                            Taille {s}
                          </span>
                        ))}
                        {prod.colors && prod.colors.map(c => {
                          const label = typeof c === 'string' ? c : c.name;
                          return (
                            <span key={label} className="text-[10px] bg-[#f1f3f5] font-bold px-1.5 py-0.5 rounded text-[#211712] border border-[#211712]/10">
                              {label}
                            </span>
                          );
                        })}
                      </div>

                      <div className="mt-auto pt-3 border-t-[2px] border-[#211712]/15 flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-[#f2efe9] p-1 rounded-xl border-[2px] border-[#211712]">
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, -1)}
                            disabled={prod.stock <= 0}
                            className="w-6 h-6 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712] disabled:opacity-40"
                            title="Décrémenter le stock"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-1.5 min-w-[24px] text-center text-[#211712]">
                            {prod.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, 1)}
                            className="w-6 h-6 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712]"
                            title="Incrémenter le stock"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleQuickToggleVisibility(prod.id)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#f7e7c7]"
                            title={prod.is_available === false ? "Rendre visible" : "Masquer de la vitrine"}
                          >
                            {prod.is_available === false ? <EyeOff className="w-4 h-4 text-[#b93712]" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(prod)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#edf2fb]"
                            title="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#fdf1ee]"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4 text-[#b93712]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ORDERS MANAGEMENT */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Orders Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Chiffre d'Affaires
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(totalRevenue)}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Commandes
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {orders.length}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Panier Moyen
                  </span>
                  <span className="font-black text-slate-900 text-lg">
                    {formatFCFA(avgBasket)}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Orders */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Rechercher par client, tél ou #..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setOrderPaymentFilter('all')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Toutes ({orders.length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('wave')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'wave'
                      ? 'bg-sky-600 text-white'
                      : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                  }`}
                >
                  Wave ({orders.filter(o => o.payment_method_preference === 'wave').length})
                </button>
                <button
                  onClick={() => setOrderPaymentFilter('mobile_money')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 ${
                    orderPaymentFilter === 'mobile_money'
                      ? 'bg-orange-600 text-white'
                      : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                  }`}
                >
                  Mobile Money ({orders.filter(o => ['mobile_money', 'orange_money', 'mtn_money', 'moov_money'].includes(o.payment_method_preference)).length})
                </button>
              </div>

              {/* Status filter bar */}
              <div className="flex items-center gap-1.5 w-full overflow-x-auto pb-1 mt-2">
                <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Statut :</span>
                {[
                  { id: 'all', label: 'Toutes', count: orders.length },
                  { id: 'pending', label: '⏳ En attente', count: orders.filter(o => (o.status || 'pending') === 'pending').length },
                  { id: 'confirmed', label: '✓ Confirmées', count: orders.filter(o => o.status === 'confirmed').length },
                  { id: 'delivered', label: '✨ Livrées', count: orders.filter(o => o.status === 'delivered').length },
                  { id: 'cancelled', label: '✕ Annulées', count: orders.filter(o => o.status === 'cancelled').length },
                ].map(st => (
                  <button
                    key={st.id}
                    onClick={() => setOrderStatusFilter(st.id as any)}
                    className={`text-[11px] font-bold py-1 px-2.5 rounded-lg transition-colors shrink-0 ${
                      orderStatusFilter === st.id
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {st.label} ({st.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">Aucune commande trouvée</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Modifiez vos critères de recherche ou de filtre pour afficher les commandes correspondantes.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map(order => {
                  return (
                    <div 
                      key={order.id} 
                      className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        order.status === 'cancelled'
                          ? 'border-rose-200 bg-rose-50/20 opacity-80'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            #{order.id}
                          </span>
                          <span className="font-black text-slate-900 text-sm sm:text-base">
                            {order.customer_name}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            {order.customer_phone}
                          </span>
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {order.payment_method_preference.toUpperCase()}
                          </span>

                          {/* Status Badge */}
                          {order.status === 'confirmed' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              ✓ Confirmée
                            </span>
                          )}
                          {order.status === 'delivered' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✨ Livrée
                            </span>
                          )}
                          {order.status === 'cancelled' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                              ✕ Annulée (Stock remis)
                            </span>
                          )}
                          {(!order.status || order.status === 'pending') && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              ⏳ En attente
                            </span>
                          )}

                          <span className="text-[10px] text-slate-400 ml-auto md:ml-0">
                            {new Date(order.created_at).toLocaleString('fr-FR')}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span><strong>{order.delivery_location}</strong></span>
                          {order.delivery_note && <span className="text-slate-500 italic">({order.delivery_note})</span>}
                          {order.delivery_slot && <span className="text-amber-700 font-bold ml-1.5">⏰ {order.delivery_slot}</span>}
                        </p>

                        <div className="bg-slate-50 p-2.5 rounded-xl text-xs text-slate-600 flex flex-wrap gap-2">
                          {(order.items ?? []).map((it, i) => (
                            <div key={i} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-medium">
                              <strong>{it.quantity}x</strong> {it.product_title}
                              {it.selected_size && <span className="text-slate-500 ml-1">(T:{it.selected_size})</span>}
                              {it.selected_color && <span className="text-slate-500 ml-1">({it.selected_color})</span>}
                              {it.selected_modifiers && <span className="text-slate-500 ml-1">+ {it.selected_modifiers}</span>}
                              <span className="text-slate-400 font-mono ml-1.5">({formatFCFA(it.unit_price * it.quantity)})</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col sm:items-end justify-between gap-2.5 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        <span className="font-black text-lg text-slate-900">
                          {formatFCFA(order.total_amount)}
                        </span>

                        {/* Order status action buttons */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(!order.status || order.status === 'pending') && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                              >
                                Confirmer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'confirmed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Marquer livrée
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'delivered' && (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                              <Check className="w-3.5 h-3.5" /> Commande terminée
                            </span>
                          )}

                          {order.status === 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            >
                              Réactiver la commande
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MARKETING STUDIO */}
        {activeTab === 'marketing' && (
          <MarketingStoryStudio shop={currentShop} products={products} />
        )}

        {/* TAB 4: SETTINGS & THEMES */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Settings Sub-Tab Navigation */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200 flex flex-wrap sm:flex-nowrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsSubTab('themes')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors ${
                  settingsSubTab === 'themes'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Palette className="w-4 h-4" />
                <span>Thèmes & Style</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('general')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors ${
                  settingsSubTab === 'general'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Coordonnées</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('hours')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors ${
                  settingsSubTab === 'hours'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Horaires d'Ouverture</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('bilan')}
                className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors ${
                  settingsSubTab === 'bilan'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Flash Bilan 20h</span>
              </button>
            </div>

            {/* Sub-Tab 1: THEME CUSTOMIZER */}
            {settingsSubTab === 'themes' && (
              <ThemeCustomizer
                shop={currentShop}
                onUpdateShop={(updated) => {
                  setCurrentShop(updated);
                  localStorage.setItem('matable_merchant_session', JSON.stringify(updated));
                }}
              />
            )}

            {/* Sub-Tab 2: GENERAL SETTINGS */}
            {settingsSubTab === 'general' && (
              <form onSubmit={handleSaveGeneralSettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Coordonnées de la boutique & Sécurité
                </h3>

                {settingsSaved && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Modifications enregistrées avec succès !</span>
                  </div>
                )}

                {/* Shop Name & City */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nom commercial de la boutique *
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Ville / Commune
                    </label>
                    <input
                      type="text"
                      value={settingsCity}
                      onChange={(e) => setSettingsCity(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Slogan */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Slogan / Message de bienvenue sur la vitrine
                  </label>
                  <textarea
                    rows={2}
                    value={settingsWelcome}
                    onChange={(e) => setSettingsWelcome(e.target.value)}
                    placeholder="Ex: Nuisettes soyeuses & lingerie fine. Livraison discrète à Abidjan..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* WhatsApp Contact Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Numéro WhatsApp de réception des commandes *
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsPhone}
                    onChange={(e) => setSettingsPhone(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Les clients seront automatiquement redirigés vers ce numéro WhatsApp avec leur panier validé.
                  </p>
                </div>

                {/* Change PIN Code */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-slate-500" />
                    <span>Modifier mon code PIN secret à 6 chiffres</span>
                  </label>
                  <div className="relative w-full sm:w-64">
                    <input
                      type={showSettingsPin ? 'text' : 'password'}
                      maxLength={6}
                      placeholder="Laissez vide pour conserver l'actuel"
                      value={settingsNewPin}
                      onChange={(e) => setSettingsNewPin(e.target.value)}
                      className="w-full text-xs p-2.5 pr-12 rounded-lg border border-slate-300 bg-white font-mono tracking-widest text-center"
                    />
                    <button type="button" onClick={() => setShowSettingsPin((visible) => !visible)} aria-label={showSettingsPin ? 'Masquer le PIN' : 'Afficher le PIN'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                      {showSettingsPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <span className="block text-[11px] text-slate-400 mt-1">
                    Le code PIN est indispensable pour accéder à votre espace de gestion.
                  </span>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    Enregistrer les coordonnées
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tab 3: OPENING HOURS & AUTOMATION */}
            {settingsSubTab === 'hours' && (
              <form onSubmit={handleSaveOpeningHours} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Automatisation des Horaires d'Ouverture
                      </h3>
                      <p className="text-xs text-slate-500">
                        Gestion automatique des prises de commande selon vos plages horaires (Fuseau GMT / UTC+0 Abidjan).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs ${
                      currentShop.is_open
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${currentShop.is_open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>{currentShop.is_open ? 'Actuellement Ouvert' : 'Actuellement Fermé'}</span>
                    </span>
                  </div>
                </div>

                {hoursSaved && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Planning des horaires enregistré avec succès !</span>
                  </div>
                )}

                {/* Manual Override Alert */}
                {manualOverride && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-black text-amber-950">Forçage manuel actuellement actif</p>
                        <p className="text-amber-800 text-[11px]">
                          La boutique a été basculée manuellement en mode <strong>{currentShop.is_open ? 'Ouverte' : 'Fermée'}</strong>. Ce choix reste prioritaire jusqu'à sa réinitialisation.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetManualOverride}
                      className="py-2 px-3 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reprendre le planning automatique</span>
                    </button>
                  </div>
                )}

                {/* Automation Toggle */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <label htmlFor="hours-enable-toggle" className="font-extrabold text-slate-900 text-sm cursor-pointer">
                      Activer le planning automatique
                    </label>
                    <p className="text-xs text-slate-500">
                      Lorsque ce mode est activé, la vitrine bascule automatiquement entre Ouvert et Fermé. <strong>Lorsque la boutique est fermée, les clients ne peuvent plus valider de commandes.</strong>
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      id="hours-enable-toggle"
                      type="checkbox"
                      checked={hoursEnabled}
                      onChange={(e) => setHoursEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-12 h-6.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5.5 after:w-5.5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {hoursEnabled && (
                  <div className="space-y-5 animate-fadeIn">
                    {/* Time Slots */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Heure d'ouverture quotidienne *
                        </label>
                        <input
                          type="time"
                          value={openTime}
                          onChange={(e) => setOpenTime(e.target.value)}
                          className="w-full text-base font-mono font-bold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <span className="text-[11px] text-slate-400 block">
                          Heure d'ouverture des prises de commande (ex: 08:00)
                        </span>
                      </div>

                      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Heure de fermeture quotidienne *
                        </label>
                        <input
                          type="time"
                          value={closeTime}
                          onChange={(e) => setCloseTime(e.target.value)}
                          className="w-full text-base font-mono font-bold p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <span className="text-[11px] text-slate-400 block">
                          Heure de clôture des prises de commande (ex: 22:00)
                        </span>
                      </div>
                    </div>

                    {/* Active Days Selection */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <span>Jours d'ouverture hebdomadaires</span>
                        </label>

                        {/* Presets */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5, 6, 0])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            7j/7
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5, 6])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Lun - Sam
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveDays([1, 2, 3, 4, 5])}
                            className="text-[11px] font-bold py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            Lun - Ven
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 pt-1">
                        {[
                          { day: 1, label: 'Lundi' },
                          { day: 2, label: 'Mardi' },
                          { day: 3, label: 'Mercredi' },
                          { day: 4, label: 'Jeudi' },
                          { day: 5, label: 'Vendredi' },
                          { day: 6, label: 'Samedi' },
                          { day: 0, label: 'Dimanche' },
                        ].map(({ day, label }) => {
                          const isSelected = activeDays.includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (activeDays.length > 1) {
                                    setActiveDays(activeDays.filter(d => d !== day));
                                  }
                                } else {
                                  setActiveDays([...activeDays, day]);
                                }
                              }}
                              className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between gap-3">
                  <button
                    type="submit"
                    className="py-2.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    Enregistrer la programmation des horaires
                  </button>
                </div>
              </form>
            )}

            {/* Sub-Tab 4: FLASH BILAN 20H */}
            {settingsSubTab === 'bilan' && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        Flash Bilan Automatisé de 20h
                      </h3>
                      <p className="text-xs text-slate-500">
                        Résumé quotidien généré automatiquement chaque soir pour le commerçant avec récapitulatif WhatsApp.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Copy Bilan */}
                    {flashBilan && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(flashBilan.whatsapp_message);
                          setCopiedBilan(true);
                          setTimeout(() => setCopiedBilan(false), 2500);
                        }}
                        className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        {copiedBilan ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedBilan ? 'Copié !' : 'Copier le texte'}</span>
                      </button>
                    )}

                    {/* Send WhatsApp */}
                    {flashBilan && (
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(currentShop.whatsapp_number)}?text=${encodeURIComponent(flashBilan.whatsapp_message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Envoyer sur mon WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Recap Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Ventes du jour</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? formatFCFA(flashBilan.total_sales) : formatFCFA(totalRevenue)}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Commandes</span>
                    <span className="text-base font-black text-slate-900">
                      {flashBilan ? flashBilan.total_orders : orders.length}
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-amber-600 block">Stock bas</span>
                    <span className="text-base font-black text-amber-700">
                      {flashBilan ? flashBilan.low_stock_products.length : lowStockCount} article(s)
                    </span>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-rose-600 block">Rupture stock</span>
                    <span className="text-base font-black text-rose-700">
                      {flashBilan ? flashBilan.out_of_stock_products.length : outOfStockCount} article(s)
                    </span>
                  </div>
                </div>

                {/* Top Selling Products calculation */}
                {flashBilan?.top_selling_products && flashBilan.top_selling_products.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-indigo-600" />
                      <span>Top des articles les plus vendus aujourd'hui :</span>
                    </h4>
                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
                      {flashBilan.top_selling_products.map((item, idx) => (
                        <div key={idx} className="p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-black text-[10px] flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-slate-900">{item.title}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500 font-medium">{item.quantity_sold} vendus</span>
                            <span className="font-black text-slate-900">{formatFCFA(item.revenue)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message preview */}
                {flashBilan && (
                  <div>
                    <span className="text-xs font-bold text-slate-700 block mb-2">
                      Aperçu du message WhatsApp pré-formaté :
                    </span>
                    <div className="p-4 rounded-xl bg-slate-900 text-white font-mono text-xs leading-relaxed whitespace-pre-wrap selection:bg-indigo-500">
                      {flashBilan.whatsapp_message}
                    </div>
                  </div>
                )}

                {cronResult && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {cronResult.message} ({cronResult.bilans?.length || 0} boutique(s) traitée(s)).
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRODUCT ADD/EDIT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">
                {editingProduct ? "Modifier l'article" : 'Ajouter un article au catalogue'}
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Product Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom de l'article *
                </label>
                <input
                  type="text"
                  required
                  placeholder={currentShop.category === 'food' ? "Ex: Poulet braisé kédjénou" : "Ex: Nuisette en soie dentelle noire"}
                  value={prodTitle}
                  onChange={(e) => setProdTitle(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Product Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Catégorie d'article (optionnelle)
                  </label>
                  <span className="text-[10px] text-slate-400">Pour le filtrage côté client</span>
                </div>
                <input
                  type="text"
                  placeholder={currentShop.category === 'food' ? "Ex: Grillades, Sauces, Boissons, Desserts" : "Ex: Robes, Lingerie, Chaussures, Sacs"}
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(currentShop.category === 'food'
                    ? ['Plats', 'Grillades', 'Boissons', 'Accompagnements', 'Desserts']
                    : ['Robes', 'Lingerie', 'Chaussures', 'Accessoires', 'Ensembles']
                  ).map((catSuggestion) => (
                    <button
                      key={catSuggestion}
                      type="button"
                      onClick={() => setProdCategory(catSuggestion)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                        prodCategory === catSuggestion
                          ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {catSuggestion}
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Description */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Descriptif court (taille, matière, ingrédients, conseils)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-mono ${prodDescription.length > 200 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                      {prodDescription.length}/200 car.
                    </span>
                  </div>
                </div>
                <textarea
                  rows={3}
                  placeholder={currentShop.category === 'food' 
                    ? "Ex: Accompagné d'attiéké à l'huile rouge et piment vert frais. Portion généreuse pour 2 personnes."
                    : "Ex: Matière satin soyeux, bonnets doublés. Conseils : lavage délicat à la main."}
                  value={prodDescription}
                  onChange={(e) => setProdDescription(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Category-Specific Fields */}
              {currentShop.category === 'fashion' ? (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Tailles (séparées par virgule)
                    </label>
                    <input
                      type="text"
                      placeholder="S, M, L, XL"
                      value={prodSizes}
                      onChange={(e) => setProdSizes(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Couleurs (séparées par virgule)
                    </label>
                    <input
                      type="text"
                      placeholder="Noir, Rouge, Doré"
                      value={prodColors}
                      onChange={(e) => setProdColors(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      ⏱️ Temps de préparation estimé (minutes)
                    </label>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      placeholder="20"
                      value={prodPrepTime}
                      onChange={(e) => setProdPrepTime(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Sauces / Options au choix (séparées par virgule)
                    </label>
                    <input
                      type="text"
                      placeholder="Sauce pimentée, Alloco en plus, Boisson fraîche"
                      value={prodModifiers}
                      onChange={(e) => setProdModifiers(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Nombre maximum de choix par groupe
                    </label>
                    <select
                      value={prodModifierMaxSelections}
                      onChange={(e) => setProdModifierMaxSelections(Number(e.target.value))}
                      className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white font-bold"
                    >
                      <option value={1}>1 choix</option>
                      <option value={2}>Jusqu’à 2 choix</option>
                    </select>
                    <p className="text-[10px] text-amber-800 mt-1">Séparez plusieurs groupes avec `|`, par exemple : Sauce : Piment, Doux | Accompagnement : Alloco, Attiéké.</p>
                  </div>
                </div>
              )}

              {/* Price & Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Prix (en FCFA) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={100}
                    placeholder="15000"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantité en stock
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="10"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs p-3 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              {/* Product Photo Upload with client compression */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Photo produit
                </label>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 flex items-center gap-3">
                  <img
                    src={prodImage}
                    alt="Aperçu du produit"
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                  />
                  <div className="flex-1">
                    <input
                      id="product-photo-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      onChange={handleImageUpload}
                      className="sr-only"
                    />
                    <label htmlFor="product-photo-upload" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-xs font-black cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Choisir une photo HD
                    </label>
                    <p className="text-[11px] text-slate-500 mt-2">JPG, PNG, WebP ou AVIF. L’image est redimensionnée et compressée automatiquement pour un chargement rapide.</p>
                    {imageCompressing && (
                      <span className="text-[11px] text-amber-700 font-bold block mt-2">Optimisation de la photo en cours...</span>
                    )}
                    {compressedSizeKB && (
                      <span className="text-[11px] text-emerald-600 font-bold block mt-2">
                        ✓ Photo prête : {originalImageSizeKB || '?'} KB → {compressedSizeKB} KB
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Image secondaire / lookbook <span className="font-normal text-slate-400">(optionnelle)</span></label>
                <input
                  type="url"
                  value={prodLookbookImage}
                  onChange={(e) => setProdLookbookImage(e.target.value)}
                  placeholder="https://.../photo-lookbook.jpg"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-mono"
                />
                <p className="mt-1 text-[10px] text-slate-500">Cette image sera affichée sous la photo principale sur votre vitrine.</p>
              </div>

              {/* Visibility Checkbox */}
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="prod-available"
                  checked={prodIsAvailable}
                  onChange={(e) => setProdIsAvailable(e.target.checked)}
                  className="rounded text-slate-900 focus:ring-slate-900"
                />
                <label htmlFor="prod-available" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Afficher immédiatement cet article dans la vitrine client
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  {editingProduct ? 'Enregistrer les modifications' : 'Ajouter au catalogue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
