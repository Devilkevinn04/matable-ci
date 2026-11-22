// Interpolation d’un libellé chiffré (« 12 500 FCFA », « 4,5 % ») entre deux valeurs.

const NUMBER = /[-−]?\d+(?:[\s  ]\d{3})*(?:[.,]\d+)?/g;

interface ParsedLabel { prefix: string; suffix: string; value: number; decimals: number }

/** Un libellé n’est animable que s’il contient un seul nombre : jamais une date ni une fraction. */
export const parseLabel = (label: string): ParsedLabel | null => {
  const matches = [...label.matchAll(NUMBER)];
  if (matches.length !== 1) return null;
  const [raw] = matches[0];
  const start = matches[0].index;
  const normalized = raw.replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return { prefix: label.slice(0, start), suffix: label.slice(start + raw.length), value, decimals: normalized.split('.')[1]?.length ?? 0 };
};

/** Renvoie null quand les deux libellés ne décrivent pas la même mesure. */
export const interpolateLabel = (from: string, to: string, progress: number): string | null => {
  if (progress >= 1) return to;
  const target = parseLabel(to);
  if (!target) return null;
  // Un état d’attente (« … ») part de zéro ; un libellé d’une autre forme s’affiche d’un coup.
  const origin = from === '…' ? { ...target, value: 0 } : parseLabel(from);
  if (!origin || origin.prefix !== target.prefix || origin.suffix !== target.suffix) return null;
  const current = origin.value + (target.value - origin.value) * progress;
  const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: target.decimals, maximumFractionDigits: target.decimals }).format(current);
  return `${target.prefix}${formatted}${target.suffix}`;
};
