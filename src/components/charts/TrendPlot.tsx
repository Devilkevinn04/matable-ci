// Seul fichier qui importe Recharts : il est téléchargé à l’ouverture d’un tableau de bord.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from 'motion/react';
import { createTickFormatter, niceTicks, type ChartPoint } from '../../utils/chartData';
import { MOTION_SECONDS } from '../../utils/motionTokens';

export interface TrendPlotProps {
  points: ChartPoint[];
  shape: 'bars' | 'area';
  color: string;
  formatValue: (value: number) => string;
}

const AXIS_TICK = { fill: '#64748b', fontSize: 11 };

const PlotTooltip = ({ active, payload, color, formatValue }: { active?: boolean; payload?: ReadonlyArray<{ payload?: ChartPoint }>; color: string; formatValue: (value: number) => string }) => {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-[#e7dfd3] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,.14)]">
      <p className="flex items-center gap-2 text-sm font-black text-[#183b31]">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
        {formatValue(point.value)}
      </p>
      <p className="mt-0.5 text-xs text-slate-600 first-letter:uppercase">{point.longLabel}</p>
    </div>
  );
};

export default function TrendPlot({ points, shape, color, formatValue }: TrendPlotProps) {
  const isAnimated = useReducedMotion() !== true;
  const animation = { isAnimationActive: isAnimated, animationDuration: MOTION_SECONDS.deliberate * 1000, animationEasing: 'ease-out' as const };
  const max = Math.max(...points.map((point) => point.value));
  const ticks = niceTicks(max);
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="#e8ece9" />
      <XAxis dataKey="id" tickFormatter={(id: string) => points.find((point) => point.id === id)?.label ?? id} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#d5ddd8' }} interval="preserveStartEnd" minTickGap={24} tickMargin={6} />
      <YAxis width="auto" domain={[0, ticks[ticks.length - 1]]} ticks={ticks} interval={0} tickFormatter={createTickFormatter(max)} tick={AXIS_TICK} tickLine={false} axisLine={false} />
      <Tooltip cursor={shape === 'bars' ? { fill: '#f1f5f2', stroke: 'none' } : { stroke: '#94a3b8', strokeWidth: 1 }} content={<PlotTooltip color={color} formatValue={formatValue} />} isAnimationActive={false} />
    </>
  );
  const margin = { top: 8, right: 8, bottom: 0, left: 0 };
  return (
    <ResponsiveContainer width="100%" height="100%">
      {shape === 'bars' ? (
        <BarChart data={points} margin={margin} barCategoryGap="18%">
          {axes}
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} {...animation} />
        </BarChart>
      ) : (
        <AreaChart data={points} margin={margin}>
          {axes}
          <Area dataKey="value" type="linear" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} {...animation} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
