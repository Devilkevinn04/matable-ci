import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation } from './components/Navigation';
import { CustomerStorefront } from './components/CustomerStorefront';
import { MerchantDashboard } from './components/MerchantDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { PublicDirectory } from './components/PublicDirectory';
import { ToastProvider } from './components/Toast';
import { Footer } from './components/Footer';
import { LegalPageKey, LegalPages } from './components/LegalPages';
import { CookieBanner } from './components/CookieBanner';

export default function App() {
  const [isBooting, setIsBooting] = useState(false);
  const initialPath = window.location.pathname;
  const legalPageMap: Record<string, LegalPageKey> = {
    'mentions-legales': 'mentions-legales',
    confidentialite: 'confidentialite',
    cgu: 'cgu',
    cookies: 'cookies',
  };
  const initialLegalPage = legalPageMap[initialPath.replace(/^\//, '').replace(/\/$/, '')] || null;
  const initialRole = initialPath.includes('/admin') ? 'admin' : initialPath.includes('/app') ? 'merchant' : 'storefront';
  const initialShopSlug = initialPath.length > 1 && initialRole === 'storefront'
    ? initialPath.substring(1).split('/')[0]
    : 'aya-chic';
  const [currentRole, setCurrentRole] = useState<'storefront' | 'merchant' | 'admin'>(initialRole);
  const [selectedShopSlug, setSelectedShopSlug] = useState<string>(initialShopSlug);
  const [showDirectory, setShowDirectory] = useState(initialPath === '/');
  const [availableShops, setAvailableShops] = useState<{ slug: string; name: string; category?: string }[]>([
    { slug: 'demo-boutique', name: 'Boutique de démonstration', category: 'Mode de test' },
  ]);

  const loadingSteps = ['Quartier', 'Boutiques', 'Commandes', 'Émotion'];

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
    const path = window.location.pathname;
    if (initialLegalPage) {
      setCurrentRole('storefront');
      setShowDirectory(false);
    } else if (path.includes('/admin')) {
      setCurrentRole('admin');
      setShowDirectory(false);
    } else if (path.includes('/app')) {
      setCurrentRole('merchant');
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

  return (
    <ToastProvider>
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
                <Navigation
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
                  selectedShopSlug={selectedShopSlug}
                  onSelectShopSlug={setSelectedShopSlug}
                  availableShops={availableShops}
                />

                <div className="flex-1 app-shell">
                  {initialLegalPage ? (
                    <LegalPages page={initialLegalPage} />
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
                          window.history.pushState({}, '', '/app');
                        }}
                      />
                    ) : (
                      <CustomerStorefront
                        shopSlug={selectedShopSlug}
                        onSelectShop={(slug) => setSelectedShopSlug(slug)}
                      />
                    )
                  )}

                  {currentRole === 'merchant' && (
                    <MerchantDashboard
                      currentShopSlug={selectedShopSlug}
                      onOpenStorefront={(slug) => {
                        setSelectedShopSlug(slug);
                        setCurrentRole('storefront');
                      }}
                    />
                  )}

                  {currentRole === 'admin' && (
                    <AdminDashboard />
                  )}
                </div>
                <Footer compact={Boolean(initialLegalPage)} />
              </div>
            </div>
            <CookieBanner />
          </motion.div>
        )}
      </AnimatePresence>
    </ToastProvider>
  );
}
