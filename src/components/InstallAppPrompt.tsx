import React, { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_KEY = 'matable-install-dismissed-at';
const VISITS_KEY = 'matable-storefront-visits';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_VISITS = 2;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIosSafari = () => {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

const readNumber = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

// Invite à installer l'application à partir de la 2e visite, jamais si elle est déjà installée ni pendant 14 jours après un refus.
export const InstallAppPrompt: React.FC<{ shopName?: string }> = ({ shopName }) => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios] = useState(() => typeof window !== 'undefined' && isIosSafari());

  useEffect(() => {
    if (typeof window === 'undefined' || isStandalone()) return undefined;
    try {
      localStorage.setItem(VISITS_KEY, String(readNumber(VISITS_KEY) + 1));
    } catch {
      // Stockage indisponible : l'invitation reste simplement masquée.
    }
    const snoozed = Date.now() - readNumber(DISMISSED_KEY) < SNOOZE_MS;
    const eligible = !snoozed && readNumber(VISITS_KEY) >= MIN_VISITS;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (eligible) setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    if (ios && eligible) setVisible(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [ios]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Sans stockage, la bannière se masque pour cette session seulement.
    }
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'dismissed') dismiss();
    else setVisible(false);
  };

  if (!visible || (!installEvent && !ios)) return null;

  return (
    <div
      role="dialog"
      aria-label="Installer MaTable sur votre écran d’accueil"
      className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[45] mx-auto w-full max-w-lg px-4"
    >
      <div className="rounded-2xl border border-[#ded8ce] bg-white p-4 shadow-[0_12px_32px_rgba(32,23,18,0.18)]">
        <div className="flex items-start gap-3">
          <img src="/brand-kit/icon-192.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Installez MaTable</p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">
              {shopName ? `Retrouvez ${shopName} et vos commandes` : 'Retrouvez vos boutiques et vos commandes'} en un geste depuis votre écran d’accueil.
            </p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Fermer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {installEvent ? (
          <button type="button" onClick={() => void install()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-4 text-sm font-black text-white active:scale-[0.98]">
            <Download className="h-4 w-4" aria-hidden="true" />Installer l’application
          </button>
        ) : (
          <ol className="mt-3 space-y-2 rounded-xl bg-[#f7f3ed] p-3 text-xs font-semibold text-slate-700">
            <li className="flex items-center gap-2"><Share className="h-4 w-4 shrink-0 text-[var(--mt-green-deep)]" aria-hidden="true" />Touchez le bouton Partager de Safari</li>
            <li className="flex items-center gap-2"><PlusSquare className="h-4 w-4 shrink-0 text-[var(--mt-green-deep)]" aria-hidden="true" />Choisissez « Sur l’écran d’accueil »</li>
          </ol>
        )}
      </div>
    </div>
  );
};
