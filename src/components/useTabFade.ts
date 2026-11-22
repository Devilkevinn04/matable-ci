import { useLayoutEffect, useRef } from 'react';
import { MOTION_EASE, MOTION_SECONDS } from '../utils/motionTokens';

/** Fondu du contenu quand l’onglet change, sans remonter les composants : aucune saisie n’est perdue. */
export const useTabFade = <T extends HTMLElement = HTMLDivElement>(tab: string) => {
  const panel = useRef<T>(null);
  const previous = useRef(tab);

  useLayoutEffect(() => {
    if (previous.current === tab) return;
    previous.current = tab;
    if (!panel.current?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = panel.current.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: MOTION_SECONDS.standard * 1000,
      easing: `cubic-bezier(${MOTION_EASE.join(',')})`,
    });
    return () => animation.cancel();
  }, [tab]);

  return panel;
};
