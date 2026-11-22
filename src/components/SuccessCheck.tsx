import React from 'react';

/** Coche de confirmation qui se trace une fois ; fixe si le système demande moins de mouvement. */
export const SuccessCheck: React.FC<{ className?: string }> = ({ className = 'h-9 w-9' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" pathLength={1} className="mt-draw" />
    <path d="m8.5 12.2 2.4 2.4 4.8-5" pathLength={1} className="mt-draw mt-draw-late" />
  </svg>
);
