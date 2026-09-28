import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const initialPath = window.location.pathname;
  const legalPageMap: Record<string, LegalPageKey> = {
    'mentions-legales': 'mentions-legales',
    confidentialite: 'confidentialite',
    cgu: 'cgu',
    cookies: 'cookies',
  };
  const initialLegalPage = legalPageMap[initialPath.replace(/^\//, '').replace(/\/$/, '')] || null;
  const initialFaqPage = initialPath.replace(/^\//, '').replace(/\/$/, '') === 'faq';
  const initialRole = initialPath.includes('/admin') ? 'admin' : initialPath.includes('/app') ? 'merchant' : 'storefront';
  const initialCustomerView = initialPath === '/connexion' ? 'auth' : initialPath === '/inscription' ? 'register' : initialPath === '/compte' ? 'account' : 'none';
  const initialShopSlug = initialPath.length > 1 && initialRole === 'storefront'
    ? initialPath.substring(1).split('/')[0]
    : 'aya-chic';
  const [currentRole, setCurrentRole] = useState<'storefront' | 'merchant' | 'admin'>(initialRole);
  const [selectedShopSlug, setSelectedShopSlug] = useState<string>(initialShopSlug);
  const [showDirectory, setShowDirectory] = useState(initialPath === '/');
  const [isFaqPage, setIsFaqPage] = useState(initialFaqPage);
  const [availableShops, setAvailableShops] = useState<{ slug: string; name: string; category?: string }[]>([]);
  const [customerUser, setCustomerUser] = useState<CustomerUser | null>(null);
  const [customerView, setCustomerView] = useState<'none' | 'auth' | 'register' | 'account'>(initialCustomerView);
  const [openMerchantRegistration, setOpenMerchantRegistration] = useState(false);
  const hasStandaloneAccountFlow = customerView !== 'none' || currentRole === 'merchant';

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
  }, [currentRole]);

  useEffect(() => {
    fetch('/api/auth/customer-session', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) setCustomerUser(data.user);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (initialLegalPage || initialFaqPage) {
      setCurrentRole('storefront');
      setShowDirectory(false);
    } else if (path.includes('/admin')) {
      setCurrentRole('admin');
      setShowDirectory(false);
    } else if (path.includes('/app')) {
      setCurrentRole('merchant');
      setShowDirectory(false);
    } else if (path === '/connexion' || path === '/inscription' || path === '/compte') {
      setCurrentRole('storefront');
      setCustomerView(path === '/inscription' ? 'register' : path === '/compte' ? 'account' : 'auth');
      setShowDirectory(false);
    } else if (path.length > 1) {
      const slug = path.substring(1).split('/')[0];
      if (slug) {
        setSelectedShopSlug(slug);
        setCurrentRole('storefront');
        setShowDirectory(false);
      }
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const faqPath = path.replace(/^\//, '').replace(/\/$/, '') === 'faq';
      setIsFaqPage(faqPath);
      if (faqPath) {
        setCurrentRole('storefront');
        setCustomerView('none');
        setShowDirectory(false);
        return;
      }
      if (path === '/connexion' || path === '/inscription' || path === '/compte') {
        setCurrentRole('storefront');
        setCustomerView(path === '/inscription' ? 'register' : path === '/compte' ? 'account' : 'auth');
        setShowDirectory(false);
        return;
      }
      if (path.includes('/admin')) {
        setCurrentRole('admin');
        setCustomerView('none');
        setShowDirectory(false);
        return;
      }
      if (path.includes('/app')) {
        setCurrentRole('merchant');
        setCustomerView('none');
        setShowDirectory(false);
        return;
      }
      if (path === '/') {
        setCurrentRole('storefront');
        setCustomerView('none');
        setShowDirectory(true);
        return;
      }
      setCurrentRole('storefront');
      setCustomerView('none');
      setSelectedShopSlug(path.substring(1).split('/')[0]);
      setShowDirectory(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!initialLegalPage) return;
    const legalMeta: Record<LegalPageKey, { title: string; description: string }> = {
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
    const metadata = legalMeta[initialLegalPage];
    document.title = metadata.title;
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = metadata.description;
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}/${initialLegalPage}`;
  }, [initialLegalPage]);

  useEffect(() => {
    if (!isFaqPage) return;
    document.title = 'Questions fréquentes | MaTable.ci';
    const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = 'Réponses aux questions fréquentes sur les commandes, les comptes clients et les boutiques MaTable.ci.';
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `${window.location.origin}/faq`;
  }, [isFaqPage]);

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
                {!hasStandaloneAccountFlow && <Navigation
                  currentRole={currentRole}
                  onChangeRole={(role) => {
                    setCurrentRole(role);
                    setShowDirectory(false);
                    window.history.pushState({}, '', role === 'admin' ? '/admin' : role === 'merchant' ? '/app' : '/');
                  }}
                  onOpenDirectory={() => {
                    setCurrentRole('storefront');
                    setShowDirectory(true);
                    window.history.pushState({}, '', '/');
                  }}
                  isDirectory={currentRole === 'storefront' && showDirectory}
                  isLegalPage={Boolean(initialLegalPage)}
                  customerUser={customerUser}
                  onOpenCustomerAuth={() => { setCurrentRole('storefront'); setCustomerView('auth'); setShowDirectory(false); window.history.pushState({}, '', '/connexion'); }}
                  onOpenCustomerAccount={() => { setCurrentRole('storefront'); setCustomerView('account'); setShowDirectory(false); window.history.pushState({}, '', '/compte'); }}
                  onLogoutCustomer={async () => { await fetch('/api/auth/customer-logout', { method: 'POST', credentials: 'include' }); setCustomerUser(null); setCustomerView('none'); setShowDirectory(true); window.history.pushState({}, '', '/'); }}
                />}

                <div id="main-content" className="flex-1 app-shell" tabIndex={-1}>
                  {isFaqPage ? (
                    <FaqPage />
                  ) : initialLegalPage ? (
                    <LegalPages page={initialLegalPage} />
                  ) : customerView === 'auth' || customerView === 'register' ? (
                    <CustomerAuth
                      initialMode={customerView === 'register' ? 'register' : 'login'}
                      onAuthenticated={(user) => { setCustomerUser(user); setCustomerView('account'); window.history.pushState({}, '', '/compte'); }}
                      onBack={() => { setCustomerView('none'); setShowDirectory(true); window.history.pushState({}, '', '/'); }}
                      onMerchantLogin={() => { setCurrentRole('merchant'); setCustomerView('none'); setShowDirectory(false); setOpenMerchantRegistration(false); window.history.pushState({}, '', '/app'); }}
                      onMerchantRegister={() => { setCurrentRole('merchant'); setCustomerView('none'); setShowDirectory(false); setOpenMerchantRegistration(true); window.history.pushState({}, '', '/app'); }}
                    />
                  ) : customerView === 'account' ? (
                    customerUser ? <CustomerAccount user={customerUser} onLogout={async () => { await fetch('/api/auth/customer-logout', { method: 'POST', credentials: 'include' }); setCustomerUser(null); setCustomerView('none'); setShowDirectory(true); window.history.pushState({}, '', '/'); }} onBack={() => { setCustomerView('none'); setShowDirectory(true); window.history.pushState({}, '', '/'); }} /> : <CustomerAuth onBack={() => { setCustomerView('none'); setShowDirectory(true); window.history.pushState({}, '', '/'); }} onAuthenticated={(user) => { setCustomerUser(user); setCustomerView('account'); }} onMerchantLogin={() => { setCurrentRole('merchant'); setCustomerView('none'); setShowDirectory(false); setOpenMerchantRegistration(false); window.history.pushState({}, '', '/app'); }} onMerchantRegister={() => { setCurrentRole('merchant'); setCustomerView('none'); setShowDirectory(false); setOpenMerchantRegistration(true); window.history.pushState({}, '', '/app'); }} />
                  ) : currentRole === 'storefront' && (
                    showDirectory ? (
                      <PublicDirectory
                        shops={availableShops}
                        onOpenShop={(slug) => {
                          setSelectedShopSlug(slug);
                          setShowDirectory(false);
                          window.history.pushState({}, '', `/${slug}`);
                        }}
                        onCreateShop={() => {
                          setCurrentRole('merchant');
                          setShowDirectory(false);
                          setOpenMerchantRegistration(true);
                          window.history.pushState({}, '', '/app');
                        }}
                      />
                    ) : (
                      <CustomerStorefront
                        shopSlug={selectedShopSlug}
                        customerUser={customerUser}
                        onCustomerAuthenticated={setCustomerUser}
                        onSelectShop={(slug) => setSelectedShopSlug(slug)}
                      />
                    )
                  )}

                  {currentRole === 'merchant' && (
                    <MerchantDashboard
                      openRegistration={openMerchantRegistration}
                      currentShopSlug={selectedShopSlug}
                      onBackToDirectory={() => {
                        setCurrentRole('storefront');
                        setCustomerView('none');
                        setShowDirectory(true);
                        setOpenMerchantRegistration(false);
                        window.history.pushState({}, '', '/');
                      }}
                      onOpenStorefront={(slug) => {
                        setSelectedShopSlug(slug);
                        setCurrentRole('storefront');
                        setShowDirectory(false);
                        window.history.pushState({}, '', `/${slug}`);
                      }}
                    />
                  )}

                  {currentRole === 'admin' && (
                    <AdminDashboard />
                  )}
                </div>
                {!hasStandaloneAccountFlow && <Footer compact={Boolean(initialLegalPage)} />}
              </div>
            </div>
            <CookieBanner />
            <WhatsAppFloatingButton />
          </motion.div>
        )}
      </AnimatePresence>
    </ToastProvider>
  );
}
