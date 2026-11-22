import React from 'react';
import { sampleSeries } from '../../utils/chartData';

/** Mini-courbe décorative d’une tuile : la valeur et la comparaison sont écrites à côté. */
export const Sparkline: React.FC<{ series: readonly number[]; color: string; className?: string }> = ({ series, color, className = 'h-8' }) => {
  const points = sampleSeries(series);
  const max = Math.max(...points, 0);
  if (points.length < 2 || max === 0) return <div aria-hidden="true" className={`flex items-end ${className}`}><span className="h-px w-full bg-slate-200" /></div>;
  const y = (value: number) => 28 - (Math.max(0, value) / max) * 24;
  const path = points.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index / (points.length - 1) * 100).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <div aria-hidden="true" className={`relative mr-1 ${className}`}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={path} fill="none" stroke="#b6c2bb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute -right-1 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ top: `${y(last) / 32 * 100}%`, backgroundColor: color }} />
    </div>
  );
};
