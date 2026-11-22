import React from 'react';

interface MeterBarProps {
  value: number;
  max: number;
  color: string;
  className?: string;
}

/** Barre de comparaison décorative : le libellé et la valeur sont toujours écrits à côté. */
export const MeterBar: React.FC<MeterBarProps> = ({ value, max, color, className = 'h-2' }) => {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div aria-hidden="true" className={`overflow-hidden rounded-full ${className}`} style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, white)` }}>
      <div
        className="h-full w-full rounded-full transition-transform duration-[var(--mt-motion-deliberate)]"
        style={{ backgroundColor: color, transform: `translateX(${(ratio - 1) * 100}%)` }}
      />
    </div>
  );
};
