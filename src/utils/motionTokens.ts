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

// Raccourcis pour Motion. tests/motion-charter.test.ts vérifie que ces valeurs
// restent identiques à --mt-motion-* dans src/index.css.
const { fast, standard, deliberate } = motionTokens.duration;

/** fast : bouton, compteur. standard : panneau, article. deliberate : entrée de section, chiffre. */
export const MOTION_SECONDS = { fast, standard, deliberate };
export const MOTION_EASE = motionTokens.ease.standard;

const transition = (duration: number) => ({ duration, ease: MOTION_EASE });

export const motionFast = transition(fast);
export const motionStandard = transition(standard);
export const motionDeliberate = transition(deliberate);
