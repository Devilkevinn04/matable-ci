import React from 'react';

const Block: React.FC<{ className: string }> = ({ className }) => <span className={`mt-skeleton block rounded-2xl ${className}`} aria-hidden="true" />;

export const PageSkeleton: React.FC = () => (
  <main className="mx-auto min-h-[70vh] max-w-[1184px] space-y-5 px-5 py-10" role="status" aria-label="Chargement de la page">
    <Block className="h-10 w-2/3" />
    {[1, 2, 3, 4, 5].map((line) => <Block key={line} className="h-5 w-full" />)}
  </main>
);

export const DirectorySkeleton: React.FC = () => (
  <main className="mx-auto min-h-[70vh] max-w-[1280px] space-y-6 px-5 py-10" role="status" aria-label="Chargement des boutiques">
    <Block className="h-14 w-full rounded-full" />
    <div className="flex gap-3 overflow-hidden">{[1, 2, 3, 4].map((item) => <Block key={item} className="h-11 min-w-32" />)}</div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4, 5, 6].map((item) => <Block key={item} className="aspect-[1.2]" />)}</div>
  </main>
);

export const HomeSkeleton: React.FC = () => (
  <main className="mx-auto min-h-[70vh] max-w-[1440px] space-y-6 px-5 py-12" role="status" aria-label="Chargement de l’accueil">
    <Block className="h-12 w-2/3 sm:h-20" />
    <Block className="h-14 w-full max-w-xl rounded-full" />
    <Block className="h-[470px] w-full" />
  </main>
);

const SLOW_CONNECTION_DELAY_MS = 8000;

// Reproduit les dimensions réelles de la vitrine mobile pour éviter tout saut de mise en page.
export const StorefrontLoadingSkeleton: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const [slow, setSlow] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_CONNECTION_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="min-h-screen bg-[#faf8f3]" role="status" aria-live="polite" aria-label="Chargement de la boutique">
      <div className="flex items-center gap-2 border-b border-[#ded8ce] bg-white px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Block className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-1.5"><Block className="h-4 w-3/4 rounded-md" /><Block className="h-3 w-1/2 rounded-md" /></div>
        <Block className="h-11 w-11 shrink-0 rounded-xl" />
      </div>
      <main className="mx-auto max-w-6xl space-y-3 px-4 pt-3">
        <Block className="h-60 w-full rounded-3xl sm:h-72" />
        <Block className="h-[3.25rem] w-full rounded-2xl" />
        <Block className="h-12 w-full rounded-full" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="flex min-h-[7.5rem] gap-3 rounded-2xl border border-[#ded8ce] bg-white p-2.5">
              <Block className="h-[6.25rem] w-[6.25rem] shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2"><Block className="h-4 w-4/5 rounded-md" /><Block className="h-3 w-full rounded-md" /><div className="mt-auto flex items-end justify-between"><Block className="h-5 w-24 rounded-md" /><Block className="h-11 w-11 rounded-full" /></div></div>
            </div>
          ))}
        </div>
        {slow && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-semibold text-amber-900">
            La connexion est lente. Vos données sont en cours de chargement.
            {onRetry && <button type="button" onClick={onRetry} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--mt-green-deep)] px-4 font-black text-white">Réessayer</button>}
          </div>
        )}
      </main>
    </div>
  );
};

export const StorefrontSkeleton: React.FC = () => <StorefrontLoadingSkeleton />;
