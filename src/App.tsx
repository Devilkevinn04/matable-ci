import React, { useState, useEffect, useMemo } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { ToastProvider } from './components/Toast';
import { Footer } from './components/Footer';
import { LegalPageKey, LegalPages } from './components/LegalPages';
import { CookieBanner } from './components/CookieBanner';
import { CustomerAccount, CustomerAuth, CustomerUser } from './components/CustomerAuth';
import { FaqPage } from './components/FaqPage';
import { AccountRecoveryPage } from './components/AccountRecoveryPage';
import { ProductModal } from './components/MerchantDashboard/ProductModal';
import type { MerchantState } from './components/MerchantDashboard/useMerchant';
import type { Shop } from './types';
import { findPublicDiscoveryPage } from './utils/discoverySeo';
import { getCanonicalOrigin } from './utils/seoCanonical';

const CustomerStorefront = React.lazy(() => import('./components/CustomerStorefront').then((module) => ({ default: module.CustomerStorefront })));
const MerchantDashboard = React.lazy(() => import('./components/MerchantDashboard/index').then((module) => ({ default: module.MerchantDashboard })));
const AdminDashboard = React.lazy(() => import('./components/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const PublicDirectory = React.lazy(() => import('./components/PublicDirectory').then((module) => ({ default: module.PublicDirectory })));
const HowItWorksPage = React.lazy(() => import('./components/HowItWorksPage'));
const MerchantTrialOnboarding = React.lazy(() => import('./components/MerchantDashboard/MerchantTrialOnboarding').then((module) => ({ default: module.MerchantTrialOnboarding })));

const legalPageMap: Record<string, LegalPageKey> = {
  'mentions-legales': 'mentions-legales',
  confidentialite: 'confidentialite',
  cgu: 'cgu',
  cookies: 'cookies',
};
const legalMetadata: Record<LegalPageKey, { title: string; description: string }> = {
  'mentions-legales': {
    title: 'Mentions légales | MaTable.ci',
    description: 'Mentions légales et responsabilités de la plateforme MaTable.ci.',
  },
  confidentialite: {
    title: 'Politique de confidentialité | MaTable.ci',
    description: 'Politique de confidentialité et traitement des données sur MaTable.ci.',
  },
  cgu: {
    title: 'Conditions générales d’utilisation | MaTable.ci',
    description: 'Conditions générales d’utilisation des vitrines et services MaTable.ci.',
  },
  cookies: {
    title: 'Politique relative aux cookies | MaTable.ci',
    description: 'Informations sur les cookies et traceurs utilisés par MaTable.ci.',
  },
};
const defaultPageMetadata = {
  title: 'Produits locaux à découvrir en Côte d’Ivoire | MaTable.ci',
  description: 'Découvrez les produits des commerces locaux en Côte d’Ivoire, explorez les boutiques par ville et commandez directement sur WhatsApp avec MaTable.ci.',
};
const shopDirectoryMetadata = {
  title: 'Boutiques locales en Côte d’Ivoire | MaTable.ci',
  description: 'Découvrez les boutiques locales en Côte d’Ivoire, explorez les commerces par catégorie ou par ville et contactez directement les commerçants.',
};
const howItWorksMetadata = {
  title: 'Comment ça marche ? | MaTable.ci',
  description: 'Le guide pour découvrir une boutique locale, consulter sa vitrine, commander directement auprès du commerçant et convenir du retrait ou de la livraison.',
};
const faqMetadata = {
  title: 'Questions fréquentes | MaTable.ci',
  description: 'Réponses aux questions fréquentes sur les commandes, les comptes clients et les boutiques MaTable.ci.',
};
const recoveryMetadata = {
  title: 'Récupérer l’accès à votre compte | MaTable.ci',
  description: 'Contacter l’assistance pour récupérer l’accès à un compte client ou commerçant MaTable.ci.',
};
const merchantPlanPreviewShop: Shop = {
  id: 0,
  name: 'Atelier Awa',
  slug: 'atelier-awa',
  whatsapp_number: '+2250700000000',
  pin_code_hash: '',
  theme_color: '#176b55',
  welcome_message: null,
  is_open: true,
  is_active: true,
  last_notification_sent_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  category: 'fashion',
  city: 'Abidjan',
  subscription: {
    plan: 'premium',
    status: 'trialing',
    trialStart: null,
    trialEnd: null,
    expiresAt: null,
    trialDaysRemaining: 7,
    isActive: true,
  },
  theme_config: {
    primary_color: '#176b55',
    secondary_color: '#c98b4a',
    font_family: 'Plus Jakarta Sans',
    layout_style: 'grid_portrait',
  },
};

function StorefrontRoute({ customerUser, onCustomerAuthenticated }: {
  customerUser: CustomerUser | null;
  onCustomerAuthenticated: (user: CustomerUser) => void;
}) {
  const { slug = '' } = useParams();
  return <CustomerStorefront key={slug} shopSlug={slug} customerUser={customerUser} onCustomerAuthenticated={onCustomerAuthenticated} />;
}

function NotFoundPage() {
  return (
    <div className="not-found-page">
      <p className="text-sm font-black uppercase tracking-[0.18em] text-[#176b55]">Erreur 404</p>
      <h1 className="text-2xl font-black text-slate-900">Cette page n’existe pas</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">Vérifiez l’adresse ou revenez à l’annuaire.</p>
      <a href="/" className="inline-flex items-center justify-center rounded-xl bg-[#176b55] px-5 py-3 font-bold text-white">Retour aux boutiques</a>
    </div>
  );
}

function DirectoryPageLoading() {
  return (
    <main className="min-h-[75vh] bg-[#f7f3ee]" role="status" aria-label="Chargement de l’annuaire">
      <span className="sr-only">Préparation des boutiques près de chez vous…</span>
      <div className="animate-pulse bg-[#123b31]">
        <div className="mx-auto grid min-h-[390px] max-w-[1280px] gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_340px] lg:items-end lg:px-12 lg:py-16">
          <div className="space-y-5">
            <div className="h-4 w-36 rounded bg-white/20" />
            <div className="h-12 max-w-2xl rounded bg-white/15 sm:h-16" />
            <div className="h-5 max-w-lg rounded bg-white/10" />
            <div className="h-14 max-w-[610px] rounded-[18px] bg-white/15" />
          </div>
          <div className="h-48 rounded-[26px] bg-white/10" />
        </div>
      </div>
      <div className="mx-auto max-w-[1280px] space-y-7 px-5 py-10 sm:px-8 lg:px-12">
        <div className="h-7 w-56 animate-pulse rounded bg-[#e5ded3]" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[88px] min-w-[190px] animate-pulse rounded-2xl bg-[#e9e4da]" />)}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="overflow-hidden rounded-[22px] border border-[#e7ddd0] bg-white">
            <div className="h-40 animate-pulse bg-[#e5ded3] sm:h-[170px]" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-3/4 animate-pulse rounded bg-[#e9e4da]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-[#eee9df]" />
              <div className="h-10 animate-pulse rounded bg-[#f3efe9]" />
            </div>
          </div>)}
        </div>
      </div>
    </main>
  );
}

function ProductModalDevPreview() {
  const [isProductModalOpen, setIsProductModalOpen] = useState(true);
  const [prodTitle, setProdTitle] = useState('Poulet braisé entier');
  const [prodCategory, setProdCategory] = useState('Grillades');
  const [prodDescription, setProdDescription] = useState('Poulet mariné aux épices, braisé au feu de bois et servi avec son accompagnement.');
  const [prodPrice, setProdPrice] = useState<number | ''>(4500);
  const [prodStock, setProdStock] = useState<number | ''>(12);
  const [prodPrepTime, setProdPrepTime] = useState<number | ''>(25);
  const [prodModifiers, setProdModifiers] = useState('Accompagnement : Attiéké, Alloco (+500 F), Frites');
  const [prodModifierMaxSelections, setProdModifierMaxSelections] = useState<number | ''>(2);
  const [prodAttributes, setProdAttributes] = useState<Record<string, string>>({});
  const [prodIsAvailable, setProdIsAvailable] = useState(true);
  const [prodLookbookImage, setProdLookbookImage] = useState('');

  const previewState = {
    currentShop: { category: 'food' },
    isProductModalOpen,
    setIsProductModalOpen,
    editingProduct: null,
    prodTitle,
    setProdTitle,
    prodCategory,
    setProdCategory,
    prodDescription,
    setProdDescription,
    prodPrice,
    setProdPrice,
    prodStock,
    setProdStock,
    prodImage: '',
    setProdImage: () => undefined,
    prodLookbookImage,
    setProdLookbookImage,
    prodGalleryImages: [],
    prodSizes: '',
    setProdSizes: () => undefined,
    prodColors: '',
    setProdColors: () => undefined,
    prodPrepTime,
    setProdPrepTime,
    prodModifiers,
    setProdModifiers,
    prodModifierMaxSelections,
    setProdModifierMaxSelections,
    prodAttributes,
    setProdAttributes,
    prodIsAvailable,
    setProdIsAvailable,
    imageCompressing: false,
    compressedSizeKB: null,
    originalImageSizeKB: null,
    handleSaveProduct: (event: React.FormEvent) => event.preventDefault(),
    handleImageUpload: () => undefined,
    handleLookbookImageUpload: () => undefined,
    handleGalleryImageUpload: () => undefined,
    handleRemoveGalleryImage: () => undefined,
  } as unknown as MerchantState;

  return (
    <>
      <div className="min-h-screen bg-[#f6f3ed] p-4 text-slate-800 sm:p-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-800">Aperçu local · données fictives</p>
            <h1 className="mt-1 text-lg font-extrabold">Formulaire article</h1>
          </div>
          {!isProductModalOpen && (
            <button type="button" onClick={() => setIsProductModalOpen(true)} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900">
              Ouvrir le formulaire
            </button>
          )}
        </div>
      </div>
      <ProductModal state={previewState} />
    </>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const normalizedPath = path.replace(/^\//, '').replace(/\/$/, '');
  const isShopDirectoryRoute = path.replace(/\/+$/, '') === '/boutiques';
  const isHowItWorksRoute = path.replace(/\/+$/, '') === '/comment-ca-marche';
  const hasMerchantAccessToken = new URLSearchParams(location.search).has('access');
  const legalPage = legalPageMap[normalizedPath] || null;
  const isFaqPage = normalizedPath === 'faq';
  const isRecoveryPage = normalizedPath === 'recuperation-acces';
  const currentRole: 'storefront' | 'merchant' | 'admin' = path === '/admin' || path.startsWith('/admin/')
    ? 'admin'
    : path === '/app' || path.startsWith('/app/')
      ? 'merchant'
      : 'storefront';
  const customerView: 'none' | 'auth' | 'register' | 'account' = path === '/connexion'
    ? 'auth'
    : path === '/inscription'
      ? 'register'
      : path === '/compte'
        ? 'account'
        : 'none';
  const [availableShops, setAvailableShops] = useState<{ slug: string; name: string; category?: string; city?: string }[]>([]);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [shopsLoadError, setShopsLoadError] = useState(false);
  const [shopsRetryKey, setShopsRetryKey] = useState(0);
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(null);
  const [openMerchantRegistration, setOpenMerchantRegistration] = useState(false);
  const discoveryPage = useMemo(() => findPublicDiscoveryPage(path, availableShops), [path, availableShops]);
  const isDiscoveryRoute = path.startsWith('/boutiques/');
  const isProductModalPreview = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true && path === '/__preview/article-form';
  const isMerchantPlansPreview = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true && path === '/__preview/merchant-plans';
  const hasStandaloneAccountFlow = customerView !== 'none' || currentRole === 'merchant' || isRecoveryPage || isProductModalPreview || isMerchantPlansPreview;
  const isCustomerStorefront = currentRole === 'storefront' && path !== '/' && !isShopDirectoryRoute && !isHowItWorksRoute && !isDiscoveryRoute && !legalPage && !isFaqPage && customerView === 'none';
  const isUnknownStorefront = isCustomerStorefront && !isLoadingShops && !availableShops.some((shop) => shop.slug === normalizedPath);

  useEffect(() => {
    let isCurrentRequest = true;
    setIsLoadingShops(true);
    setShopsLoadError(false);
    fetch('/api/v1/catalog/storefronts')
      .then(res => {
        if (!res.ok) throw new Error(`Shop directory request failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Shop directory response is invalid.');
        if (isCurrentRequest) setAvailableShops(data);
      })
      .catch(() => {
        if (isCurrentRequest) setShopsLoadError(true);
      })
      .finally(() => {
        if (isCurrentRequest) setIsLoadingShops(false);
      });
    return () => { isCurrentRequest = false; };
  }, [shopsRetryKey]);

  useEffect(() => {
    fetch('/api/auth/customer-session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) setCustomerUser(data.user);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const isPrivateRoute = path === '/app' || path.startsWith('/app/') || path === '/admin' || path.startsWith('/admin/')
      || path === '/compte' || path === '/connexion' || path === '/inscription' || isRecoveryPage;
    const isInvalidNestedRoute = (!legalPage && !isFaqPage && !isRecoveryPage && !isPrivateRoute && !isProductModalPreview && !isMerchantPlansPreview && !isShopDirectoryRoute && !isHowItWorksRoute && !discoveryPage && path.split('/').filter(Boolean).length > 1)
      || isUnknownStorefront;
    const metadata = isProductModalPreview
      ? { title: 'Aperçu du formulaire article | MaTable.ci', description: 'Prévisualisation locale du formulaire de création d’article.' }
      : isMerchantPlansPreview
       ? { title: 'Aperçu des formules commerçants | MaTable.ci', description: 'Comparaison des formules Standard, Premium et Pro pour les commerçants MaTable.ci.' }
      : legalPage
      ? legalMetadata[legalPage]
      : isShopDirectoryRoute
        ? shopDirectoryMetadata
      : isHowItWorksRoute
        ? howItWorksMetadata
      : discoveryPage
        ? { title: discoveryPage.title, description: discoveryPage.description }
      : isFaqPage
        ? faqMetadata
        : isRecoveryPage
          ? recoveryMetadata
        : isInvalidNestedRoute
          ? { title: 'Page introuvable | MaTable.ci', description: 'La page demandée est introuvable sur MaTable.ci.' }
          : defaultPageMetadata;
    const canonicalPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
    const canonicalUrl = `${getCanonicalOrigin(window.location.origin)}${canonicalPath || '/'}`;
    document.title = metadata.title;
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = metadata.description;
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = isPrivateRoute || isInvalidNestedRoute || isProductModalPreview || isMerchantPlansPreview ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
    const openGraphTitle = document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (openGraphTitle) openGraphTitle.content = metadata.title;
    const openGraphDescription = document.head.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (openGraphDescription) openGraphDescription.content = metadata.description;
    const openGraphUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (openGraphUrl) openGraphUrl.content = canonicalUrl;
    const twitterTitle = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.content = metadata.title;
    const twitterDescription = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.content = metadata.description;
  }, [path, legalPage, isFaqPage, isRecoveryPage, discoveryPage, isShopDirectoryRoute, isHowItWorksRoute, isUnknownStorefront]);

  const renderCustomerAuth = (initialMode: 'login' | 'register') => (
    <CustomerAuth
      initialMode={initialMode}
      onModeChange={(mode) => navigate(mode === 'register' ? '/inscription' : '/connexion')}
      onAuthenticated={(user) => { setCustomerUser(user); navigate('/compte'); }}
      onBack={() => navigate('/')}
      onMerchantLogin={() => { setOpenMerchantRegistration(false); navigate('/app/connexion'); }}
      onMerchantRegister={() => { setOpenMerchantRegistration(false); navigate('/app/creer-boutique'); }}
    />
  );

  const logoutCustomer = async () => {
    await fetch('/api/auth/customer-logout', { method: 'POST', credentials: 'include' });
    setCustomerUser(null);
    navigate('/');
  };

  return (
    <ToastProvider>
      <a href="#main-content" className="skip-link">Aller au contenu</a>
      <div className="min-h-screen flex flex-col bg-transparent font-sans">
            <div className="w-full">
              <div className="min-h-screen">
                {!hasStandaloneAccountFlow && currentRole !== 'admin' && !isCustomerStorefront && <Navigation
                  currentRole={currentRole}
                  onChangeRole={(role) => navigate(role === 'admin' ? '/admin' : role === 'merchant' ? '/app' : '/')}
                  onOpenDirectory={() => navigate('/boutiques')}
                  isDirectory={path === '/' || isShopDirectoryRoute}
                  isLegalPage={Boolean(legalPage)}
                  customerUser={customerUser}
                  onOpenCustomerAuth={() => navigate('/connexion')}
                  onOpenCustomerAccount={() => navigate('/compte')}
                  onLogoutCustomer={logoutCustomer}
                />}

                <div id="main-content" className="flex-1 app-shell" tabIndex={-1}>
                  <React.Suspense fallback={isShopDirectoryRoute || isDiscoveryRoute ? <DirectoryPageLoading /> : <p role="status" className="p-6 text-center text-sm font-semibold text-slate-600">Chargement de la page…</p>}>
                    <Routes>
                      <Route path="/__preview/article-form" element={isProductModalPreview ? <ProductModalDevPreview /> : <NotFoundPage />} />
                      <Route path="/__preview/merchant-plans" element={isMerchantPlansPreview
                        ? <React.Suspense fallback={<p role="status" className="p-6 text-center text-sm font-semibold text-slate-600">Chargement de la page…</p>}><MerchantTrialOnboarding shop={merchantPlanPreviewShop} isStarting={false} mode="plans" previewOnly onBack={() => navigate('/boutiques')} /></React.Suspense>
                        : <NotFoundPage />
                      } />
                      <Route path="/" element={<PublicDirectory shops={availableShops} isLoading={isLoadingShops} loadError={shopsLoadError} onRetry={() => setShopsRetryKey(key => key + 1)} onOpenShop={(slug) => navigate(`/${slug}`)} onOpenDirectory={(query) => navigate(query?.trim() ? `/boutiques?q=${encodeURIComponent(query.trim())}` : '/boutiques')} onCreateShop={() => { setOpenMerchantRegistration(true); navigate('/app'); }} />} />
                      <Route path="/boutiques" element={<PublicDirectory shops={availableShops} isLoading={isLoadingShops} loadError={shopsLoadError} onRetry={() => setShopsRetryKey(key => key + 1)} onOpenShop={(slug) => navigate(`/${slug}`)} onOpenDirectory={(query) => navigate(query?.trim() ? `/boutiques?q=${encodeURIComponent(query.trim())}` : '/boutiques')} onCreateShop={() => { setOpenMerchantRegistration(true); navigate('/app'); }} isShopDirectoryPage />} />
                      <Route path="/comment-ca-marche" element={<HowItWorksPage />} />
                      <Route path="/faq" element={<FaqPage />} />
                      <Route path="/recuperation-acces" element={<AccountRecoveryPage initialAccountType={new URLSearchParams(location.search).get('type') === 'merchant' ? 'merchant' : 'customer'} onBack={() => navigate(new URLSearchParams(location.search).get('type') === 'merchant' ? '/app' : '/connexion')} />} />
                      <Route path="/mentions-legales" element={<LegalPages page="mentions-legales" />} />
                      <Route path="/confidentialite" element={<LegalPages page="confidentialite" />} />
                      <Route path="/cgu" element={<LegalPages page="cgu" />} />
                      <Route path="/cookies" element={<LegalPages page="cookies" />} />
                      <Route path="/boutiques/*" element={discoveryPage
                        ? <PublicDirectory shops={availableShops} isLoading={isLoadingShops} loadError={shopsLoadError} onRetry={() => setShopsRetryKey(key => key + 1)} onOpenShop={(slug) => navigate(`/${slug}`)} onOpenDirectory={() => navigate('/boutiques')} onCreateShop={() => { setOpenMerchantRegistration(true); navigate('/app'); }} discoveryPage={discoveryPage} />
                        : isLoadingShops
                          ? <DirectoryPageLoading />
                          : <NotFoundPage />
                      } />
                      <Route path="/connexion" element={renderCustomerAuth('login')} />
                      <Route path="/inscription" element={renderCustomerAuth('register')} />
                      <Route path="/compte" element={customerUser
                        ? <CustomerAccount user={customerUser} onLogout={logoutCustomer} onBack={() => navigate('/')} onUserUpdated={setCustomerUser} />
                        : renderCustomerAuth('login')
                      } />
                      <Route path="/app/*" element={normalizedPath === 'app' && !hasMerchantAccessToken
                        ? renderCustomerAuth('register')
                        : <MerchantDashboard openRegistration={openMerchantRegistration || normalizedPath === 'app/creer-boutique'} onBackToDirectory={() => { setOpenMerchantRegistration(false); navigate('/'); }} onOpenStorefront={(slug) => navigate(`/${slug}`)} />
                      } />
                      <Route path="/admin/*" element={<AdminDashboard />} />
                      <Route path="/:slug" element={<StorefrontRoute customerUser={customerUser} onCustomerAuthenticated={setCustomerUser} />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </React.Suspense>
                </div>
                {!hasStandaloneAccountFlow && currentRole !== 'admin' && <Footer compact={Boolean(legalPage)} />}
              </div>
            </div>
            <CookieBanner />
      </div>
    </ToastProvider>
  );
}
