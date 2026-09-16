export const CONTRAST_TEXT = {
  dark: '#0f172a',
  light: '#ffffff',
} as const;

export const SAFE_THEME_COLORS = [
  '#0F172A', '#E11D48', '#C2410C', '#15803D', '#7C3AED', '#0EA5E9', '#F59E0B', '#F97316', '#A16207', '#111827', '#EC4899', '#14B8A6',
] as const;

export const getLuminance = (hex: string): number => {
  const raw = String(hex || '#0F172A').replace('#', '').trim();
  const normalized = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const channels = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

export const getContrastTextColor = (hex: string): string => {
  const luminance = getLuminance(hex);
  return luminance > 0.52 ? CONTRAST_TEXT.dark : CONTRAST_TEXT.light;
};

export const normalizeHex = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '#0F172A';
  const sanitized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(sanitized) ? sanitized : '#0F172A';
};

const clampChannel = (value: number): number => Math.min(255, Math.max(0, value));

const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (channel: number) => clampChannel(channel).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

export const estimateDominantColorFromPixels = (pixels: Uint8ClampedArray, width: number, height: number): string => {
  const bucketMap = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];

    const quantizedR = Math.round(r / 32) * 32;
    const quantizedG = Math.round(g / 32) * 32;
    const quantizedB = Math.round(b / 32) * 32;
    const key = `${quantizedR}-${quantizedG}-${quantizedB}`;

    const existing = bucketMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bucketMap.set(key, { count: 1, r: quantizedR, g: quantizedG, b: quantizedB });
    }
  }

  if (bucketMap.size === 0) return '#0F172A';

  let dominant = { count: 0, r: 15, g: 23, b: 42 };
  for (const bucket of bucketMap.values()) {
    if (bucket.count > dominant.count) {
      dominant = bucket;
    }
  }

  return rgbToHex(dominant.r, dominant.g, dominant.b);
};

export const mixHexColors = (baseHex: string, targetHex: string, ratio: number): string => {
  const base = normalizeHex(baseHex);
  const target = normalizeHex(targetHex);
  const a = base.replace('#', '');
  const b = target.replace('#', '');

  const parse = (hex: string) => Number.parseInt(hex, 16);
  const start = {
    r: parse(a.length === 3 ? a[0] + a[0] : a.slice(0, 2)),
    g: parse(a.length === 3 ? a[1] + a[1] : a.slice(2, 4)),
    b: parse(a.length === 3 ? a[2] + a[2] : a.slice(4, 6)),
  };

  const end = {
    r: parse(b.length === 3 ? b[0] + b[0] : b.slice(0, 2)),
    g: parse(b.length === 3 ? b[1] + b[1] : b.slice(2, 4)),
    b: parse(b.length === 3 ? b[2] + b[2] : b.slice(4, 6)),
  };

  const mixed = {
    r: Math.round(start.r * (1 - ratio) + end.r * ratio),
    g: Math.round(start.g * (1 - ratio) + end.g * ratio),
    b: Math.round(start.b * (1 - ratio) + end.b * ratio),
  };

  return rgbToHex(mixed.r, mixed.g, mixed.b);
};
