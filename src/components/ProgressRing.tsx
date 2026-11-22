import React from 'react';

/** Anneau de progression : valeur lisible au centre et annoncée aux lecteurs d’écran. */
export const ProgressRing: React.FC<{ value: number; max: number; label: string; size?: number }> = ({ value, max, label, size = 72 }) => {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#e3ece6" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={radius} fill="none" stroke="var(--mt-green-primary)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[var(--mt-motion-deliberate)]"
        />
      </svg>
      <span aria-hidden="true" className="absolute text-sm font-black tabular-nums text-[var(--mt-green-deep)]">{value}/{max}</span>
    </span>
  );
};
