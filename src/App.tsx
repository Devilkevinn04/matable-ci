import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { CustomerStorefront } from './components/CustomerStorefront';
import { MerchantDashboard } from './components/MerchantDashboard/index';
import { AdminDashboard } from './components/AdminDashboard';
import { PublicDirectory } from './components/PublicDirectory';
import { ToastProvider } from './components/Toast';
import { Footer } from './components/Footer';
import { LegalPageKey, LegalPages } from './components/LegalPages';
import { CookieBanner } from './components/CookieBanner';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';
import { CustomerAccount, CustomerAuth, CustomerUser } from './components/CustomerAuth';
import { FaqPage } from './components/FaqPage';
import { AccountRecoveryPage } from './components/AccountRecoveryPage';
import { ProductModal } from './components/MerchantDashboard/ProductModal';
import type { MerchantState } from './components/MerchantDashboard/useMerchant';

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
  title: 'MaTable.ci — Boutiques locales en Côte d’Ivoire',
  description: 'Découvrez des boutiques locales en Côte d’Ivoire, consultez leurs catalogues et commandez directement sur WhatsApp avec MaTable.ci.',
};
const faqMetadata = {
  title: 'Questions fréquentes | MaTable.ci',
  description: 'Réponses aux questions fréquentes sur les commandes, les comptes clients et les boutiques MaTable.ci.',
};
const recoveryMetadata = {
  title: 'Récupérer l’accès à votre compte | MaTable.ci',
  description: 'Contacter l’assistance pour récupérer l’accès à un compte client ou commerçant MaTable.ci.',
};

function StorefrontRoute({ customerUser, onCustomerAuthenticated }: {
  customerUser: CustomerUser | null;
  onCustomerAuthenticated: (user: CustomerUser) => void;
}) {
  const { slug = '' } = useParams();
  return <CustomerStorefront shopSlug={slug} customerUser={customerUser} onCustomerAuthenticated={onCustomerAuthenticated} />;
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
  const [isBooting, setIsBooting] = useState(true);
  const path = location.pathname;
  const normalizedPath = path.replace(/^\//, '').replace(/\/$/, '');
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
  const [availableShops, setAvailableShops] = useState<{ slug: string; name: string; category?: string }[]>([]);
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(null);
  const [openMerchantRegistration, setOpenMerchantRegistration] = useState(false);
  const isProductModalPreview = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true && path === '/__preview/article-form';
  const hasStandaloneAccountFlow = customerView !== 'none' || currentRole === 'merchant' || isRecoveryPage || isProductModalPreview;
  const isCustomerStorefront = currentRole === 'storefront' && path !== '/' && !legalPage && !isFaqPage && customerView === 'none';

  const loadingSteps = ['Découvrir', 'Boutiques', 'Catalogue', 'Commander'];

  useEffect(() => {
    const bootTimer = window.setTimeout(() => setIsBooting(false), 1800);
    return () => window.clearTimeout(bootTimer);
  }, []);

  useEffect(() => {
    fetch('/api/shops')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableShops(data);
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    fetch('/api/auth/customer-session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) setCustomerUser(data.user);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const isPrivateRoute = path === '/app' || path.startsWith('/app/') || path === '/admin' || path.startsWith('/admin/') || path === '/compte';
    const isInvalidNestedRoute = !legalPage && !isFaqPage && !isRecoveryPage && !isPrivateRoute && !isProductModalPreview && path.split('/').filter(Boolean).length > 1;
    const metadata = isProductModalPreview
      ? { title: 'Aperçu du formulaire article | MaTable.ci', description: 'Prévisualisation locale du formulaire de création d’article.' }
      : legalPage
      ? legalMetadata[legalPage]
      : isFaqPage
        ? faqMetadata
        : isRecoveryPage
          ? recoveryMetadata
        : isInvalidNestedRoute
          ? { title: 'Page introuvable | MaTable.ci', description: 'La page demandée est introuvable sur MaTable.ci.' }
          : defaultPageMetadata;
    const canonicalUrl = `${window.location.origin}${path || '/'}`;
    document.title = metadata.title;
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = metadata.description;
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = isPrivateRoute || isInvalidNestedRoute || isProductModalPreview ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
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
  }, [path, legalPage, isFaqPage, isRecoveryPage]);

  const renderCustomerAuth = (initialMode: 'login' | 'register') => (
    <CustomerAuth
      initialMode={initialMode}
      onModeChange={(mode) => navigate(mode === 'register' ? '/inscription' : '/connexion')}
      onAuthenticated={(user) => { setCustomerUser(user); navigate('/compte'); }}
      onBack={() => navigate('/')}
      onMerchantLogin={() => { setOpenMerchantRegistration(false); navigate('/app'); }}
      onMerchantRegister={() => { setOpenMerchantRegistration(true); navigate('/app'); }}
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
      <AnimatePresence mode="wait">
        {isBooting ? (
          <motion.div
            key="boot"
            className="loading-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="loading-shell"
              initial={{ opacity: 0, scale: 0.94, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <motion.div
                className="pulse-orb pulse-orb-primary"
                animate={{ x: [0, 18, -10, 0], y: [0, -22, 10, 0], scale: [1, 1.08, 0.96, 1] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pulse-orb pulse-orb-secondary"
                animate={{ x: [0, -18, 12, 0], y: [0, 18, -8, 0], scale: [1, 0.94, 1.08, 1] }}
                transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="brand-mark brand-mark-hero"
                initial={{ rotate: -6, scale: 0.8 }}
                animate={{ rotate: [0, 4, -4, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                M
              </motion.div>
              <div className="loading-copy">
                <motion.span
                  className="eyebrow"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  MaTable.ci
                </motion.span>
                <motion.h2
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  On prépare votre quartier.
                </motion.h2>
                <div className="loading-progress">
                  <motion.div
                    className="loading-progress-bar"
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1.4, ease: 'easeInOut' }}
                  />
                </div>
                <div className="loading-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="loading-steps">
                  {loadingSteps.map((step, index) => (
                    <motion.span
                      key={step}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 + index * 0.12 }}
                    >
                      {step}
                    </motion.span>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            className="min-h-screen flex flex-col bg-transparent font-sans"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: 'easeOut' }}
          >
            <div className="page-shell">
              <div className="surface-shell">
                {!hasStandaloneAccountFlow && currentRole !== 'admin' && !isCustomerStorefront && <Navigation
                  currentRole={currentRole}
                  onChangeRole={(role) => navigate(role === 'admin' ? '/admin' : role === 'merchant' ? '/app' : '/')}
                  onOpenDirectory={() => navigate('/')}
                  isDirectory={path === '/'}
                  isLegalPage={Boolean(legalPage)}
                  customerUser={customerUser}
                  onOpenCustomerAuth={() => navigate('/connexion')}
                  onOpenCustomerAccount={() => navigate('/compte')}
                  onLogoutCustomer={logoutCustomer}
                />}

                <div id="main-content" className="flex-1 app-shell" tabIndex={-1}>
                  <Routes>
                    <Route path="/__preview/article-form" element={isProductModalPreview ? <ProductModalDevPreview /> : <NotFoundPage />} />
                    <Route path="/" element={<PublicDirectory shops={availableShops} onOpenShop={(slug) => navigate(`/${slug}`)} onCreateShop={() => { setOpenMerchantRegistration(true); navigate('/app'); }} />} />
                    <Route path="/faq" element={<FaqPage />} />
                    <Route path="/recuperation-acces" element={<AccountRecoveryPage initialAccountType={new URLSearchParams(location.search).get('type') === 'merchant' ? 'merchant' : 'customer'} onBack={() => navigate(new URLSearchParams(location.search).get('type') === 'merchant' ? '/app' : '/connexion')} />} />
                    <Route path="/mentions-legales" element={<LegalPages page="mentions-legales" />} />
                    <Route path="/confidentialite" element={<LegalPages page="confidentialite" />} />
                    <Route path="/cgu" element={<LegalPages page="cgu" />} />
                    <Route path="/cookies" element={<LegalPages page="cookies" />} />
                    <Route path="/connexion" element={renderCustomerAuth('login')} />
                    <Route path="/inscription" element={renderCustomerAuth('register')} />
                    <Route path="/compte" element={customerUser
                      ? <CustomerAccount user={customerUser} onLogout={logoutCustomer} onBack={() => navigate('/')} />
                      : renderCustomerAuth('login')
                    } />
                    <Route path="/app/*" element={<MerchantDashboard openRegistration={openMerchantRegistration} onBackToDirectory={() => { setOpenMerchantRegistration(false); navigate('/'); }} onOpenStorefront={(slug) => navigate(`/${slug}`)} />} />
                    <Route path="/admin/*" element={<AdminDashboard />} />
                    <Route path="/:slug" element={<StorefrontRoute customerUser={customerUser} onCustomerAuthenticated={setCustomerUser} />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </div>
                {!hasStandaloneAccountFlow && currentRole !== 'admin' && <Footer compact={Boolean(legalPage)} />}
              </div>
            </div>
            <CookieBanner />
            {currentRole !== 'admin' && !hasStandaloneAccountFlow && <WhatsAppFloatingButton />}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastProvider>
  );
}
