import React, { useId } from 'react';
import type { ChartSegment } from '../../utils/chartData';
import { AnimatedNumber } from '../AnimatedNumber';

/** Répartition d’un tout : barre fine et liste chiffrée, pour ne jamais dépendre de la couleur seule. */
export const SegmentedBar: React.FC<{ title: string; description?: string; segments: ChartSegment[]; className?: string }> = ({ title, description, segments, className = '' }) => {
  const titleId = useId();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return null;
  return (
    <figure aria-labelledby={titleId} className={`min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5 ${className}`}>
      <figcaption>
        <h3 id={titleId} className="font-extrabold text-[#183b31]">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>}
      </figcaption>
      <div aria-hidden="true" className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {segments.filter((segment) => segment.value > 0).map((segment) => (
          <span key={segment.id} style={{ flexGrow: segment.value, flexBasis: 0, minWidth: 4, backgroundColor: segment.color }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segments.map((segment) => (
          <li key={segment.id} className="min-w-0 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />{segment.label}</span>
            <span className="mt-0.5 block text-sm font-black text-[#183b31]"><AnimatedNumber>{segment.value}</AnimatedNumber> <span className="text-xs font-semibold text-slate-600">· {Math.round(segment.value / total * 100)} %</span></span>
          </li>
        ))}
      </ul>
    </figure>
  );
};
