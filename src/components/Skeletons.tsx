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

export const StorefrontSkeleton: React.FC = () => (
  <main className="mx-auto min-h-[70vh] max-w-[1184px] space-y-5 px-5 py-8" role="status" aria-label="Chargement de la boutique">
    <Block className="h-12 w-full" />
    <Block className="h-56 w-full rounded-3xl" />
    <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((item) => <Block key={item} className="aspect-square" />)}</div>
  </main>
);
