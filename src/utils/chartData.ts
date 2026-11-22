import type { OrderStatus } from '../types';

/**
 * Couleurs des graphiques, dans un ordre fixe. La suite a été contrôlée pour les
 * daltonismes courants et un contraste d’au moins 3:1 sur fond blanc : ne pas
 * remplacer une valeur sans refaire ce contrôle.
 */
export const CHART_COLORS = { amber: '#c98500', blue: '#2a78d6', green: '#087c5b', rust: '#c2410c' } as const;

export interface ChartPoint {
  id: string;
  /** Libellé de l’axe. */
  label: string;
  /** Libellé complet, pour l’infobulle et le tableau. */
  longLabel: string;
  value: number;
}

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthDate = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const compactNumber = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const plainNumber = new Intl.NumberFormat('fr-FR');

export const toDailyPoints = <T extends { date: string }>(rows: readonly T[], valueFor: (row: T) => number): ChartPoint[] => rows.map((row) => {
  // Midi évite qu’un fuseau décale la date d’un jour.
  const date = new Date(`${row.date}T12:00:00`);
  return { id: row.date, label: shortDate.format(date), longLabel: longDate.format(date), value: valueFor(row) };
});

const DAY_MS = 86_400_000;
const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * Ajoute à zéro les jours sans activité : sans eux, deux dates éloignées se touchent
 * sur le graphique. Une ligne plus ancienne que la période est conservée.
 */
export const fillDailyRows = <T extends { date: string }>(rows: readonly T[], from: string, to: string, empty: (date: string) => T): T[] => {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const dates = [...byDate.keys()].sort();
  const first = dates[0] && dates[0] < from ? dates[0] : from;
  const last = dates.length && dates[dates.length - 1] > to ? dates[dates.length - 1] : to;
  const filled: T[] = [];
  for (let time = Date.parse(`${first}T12:00:00Z`), end = Date.parse(`${last}T12:00:00Z`); time <= end; time += DAY_MS) {
    const date = dayKey(time);
    filled.push(byDate.get(date) ?? empty(date));
  }
  return filled;
};

/** Premier jour d’une période de `days` jours finissant aujourd’hui (Abidjan est à l’heure UTC). */
export const periodStart = (days: number, now = Date.now()): string => dayKey(now - (days - 1) * DAY_MS);

export const toMonthlyPoints = <T extends { month: string; label: string }>(rows: readonly T[], valueFor: (row: T) => number): ChartPoint[] => rows.map((row) => ({
  id: row.month,
  label: row.label,
  longLabel: monthDate.format(new Date(`${row.month}-01T12:00:00.000Z`)),
  value: valueFor(row),
}));

/** Graduations courtes, dans un seul style par axe : le montant exact reste dans l’infobulle et le tableau. */
export const createTickFormatter = (max: number) => (value: number): string => (max >= 10_000 && value !== 0 ? compactNumber : plainNumber).format(value);

/** Graduations rondes (1, 2 ou 5 × 10ⁿ), de zéro au-dessus du maximum, sans décimale. */
export const niceTicks = (max: number, intervals = 4): number[] => {
  const raw = Math.max(1, max) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 5, 10].find((factor) => factor * magnitude >= raw) ?? 10) * magnitude);
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, index) => index * step);
};

export interface ChartSummary { total: number; peak: ChartPoint | null }

export const summarizePoints = (points: readonly ChartPoint[]): ChartSummary => {
  let total = 0;
  let peak: ChartPoint | null = null;
  for (const point of points) {
    total += point.value;
    if (point.value > 0 && (!peak || point.value > peak.value)) peak = point;
  }
  return { total, peak };
};

/** Au-delà d’un mois, des barres deviennent trop fines sur un téléphone. */
export const pickTrendShape = (pointCount: number): 'bars' | 'area' => (pointCount > 31 ? 'area' : 'bars');

export interface ChartSegment { id: string; label: string; value: number; color: string }

const ORDER_GROUPS: ReadonlyArray<{ id: string; label: string; color: string; statuses: readonly OrderStatus[] }> = [
  { id: 'pending', label: 'En attente', color: CHART_COLORS.amber, statuses: ['pending'] },
  { id: 'active', label: 'En cours', color: CHART_COLORS.blue, statuses: ['confirmed', 'preparing', 'ready'] },
  { id: 'delivered', label: 'Remises', color: CHART_COLORS.green, statuses: ['delivered'] },
  { id: 'closed', label: 'Non abouties', color: CHART_COLORS.rust, statuses: ['cancelled', 'rejected', 'expired'] },
];

/** Chaque commande compte une seule fois ; la couleur suit l’état, jamais le rang. */
export const groupOrdersByStatus = (orders: ReadonlyArray<{ status: string }>): ChartSegment[] => ORDER_GROUPS.map(({ id, label, color, statuses }) => ({
  id,
  label,
  color,
  value: orders.filter((order) => (statuses as readonly string[]).includes(order.status)).length,
}));

/** Ramène une série longue à une courbe lisible en gardant le premier et le dernier point. */
export const sampleSeries = (series: readonly number[], size = 12): number[] => (series.length <= size
  ? [...series]
  : Array.from({ length: size }, (_, index) => series[Math.round(index * (series.length - 1) / (size - 1))]));
