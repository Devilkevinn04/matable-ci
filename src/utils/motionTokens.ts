export const motionTokens = {
  duration: {
    instant: 0,
    fast: 0.16,
    standard: 0.26,
    deliberate: 0.42,
  },
  ease: {
    standard: [0.22, 1, 0.36, 1],
    entrance: [0.16, 1, 0.3, 1],
  },
  distance: {
    subtle: 6,
    standard: 12,
  },
} as const;
