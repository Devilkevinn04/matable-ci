import React, { useId, useMemo } from 'react';
import { pickTrendShape, summarizePoints, type ChartPoint } from '../../utils/chartData';

const TrendPlot = React.lazy(() => import('./TrendPlot'));

/** Sans le module graphique (réseau coupé), les chiffres restent lisibles dans le tableau. */
class PlotBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (!this.state.failed) return this.props.children;
    return <p className="grid h-full place-items-center rounded-xl bg-[#faf9f5] px-4 text-center text-sm text-slate-600">Graphique indisponible. Les chiffres sont dans le tableau.</p>;
  }
}

interface TrendChartProps {
  title: string;
  description?: string;
  points: ChartPoint[];
  color: string;
  formatValue: (value: number) => string;
  emptyMessage: string;
  /** Colonne du tableau : « Jour » ou « Mois ». */
  periodLabel?: string;
  /** À désactiver quand un tableau équivalent est déjà affiché à côté. */
  hasTable?: boolean;
  className?: string;
}

/** Évolution d’une mesure : total, pic, graphique et tableau équivalent. */
export function TrendChart({ title, description, points, color, formatValue, emptyMessage, periodLabel = 'Jour', hasTable = true, className = '' }: TrendChartProps) {
  const titleId = useId();
  const { total, peak } = useMemo(() => summarizePoints(points), [points]);
  return (
    <figure aria-labelledby={titleId} className={`min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5 ${className}`}>
      <figcaption>
        <h3 id={titleId} className="font-extrabold text-[#183b31]">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>}
        {peak && (
          <p className="mt-2 text-xs text-slate-600">
            Total <strong className="text-sm font-black text-[#183b31]">{formatValue(total)}</strong>
            {points.length > 1 && <> · pic : <strong className="text-[#183b31]">{formatValue(peak.value)}</strong>, {peak.longLabel}</>}
          </p>
        )}
      </figcaption>
      {peak ? (
        <>
          <div className="mt-3 h-48 w-full min-w-0">
            <PlotBoundary>
              <React.Suspense fallback={<div role="status" className="mt-skeleton h-full w-full rounded-xl"><span className="sr-only">Chargement du graphique…</span></div>}>
                <TrendPlot points={points} shape={pickTrendShape(points.length)} color={color} formatValue={formatValue} />
              </React.Suspense>
            </PlotBoundary>
          </div>
          {hasTable && <details className="mt-2">
            <summary className="flex min-h-11 w-fit cursor-pointer items-center text-xs font-bold text-[var(--mt-green-hover)] underline underline-offset-2">Voir les chiffres</summary>
            <div tabIndex={0} role="region" aria-label={`${title} : tableau`} className="max-h-60 overflow-auto rounded-xl border border-[#eee8dc]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#faf9f5] text-slate-600">
                  <tr><th scope="col" className="px-3 py-2">{periodLabel}</th><th scope="col" className="px-3 py-2 text-right">{title}</th></tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.id} className="border-t border-[#f0eee8]">
                      <th scope="row" className="px-3 py-2 font-semibold text-slate-700 first-letter:uppercase">{point.longLabel}</th>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-[#183b31]">{formatValue(point.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>}
        </>
      ) : (
        <p className="mt-4 grid min-h-28 place-items-center rounded-xl bg-[#faf9f5] px-4 text-center text-sm text-slate-600">{emptyMessage}</p>
      )}
    </figure>
  );
}
