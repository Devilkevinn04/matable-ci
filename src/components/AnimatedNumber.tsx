import React, { useLayoutEffect, useRef } from 'react';
import { interpolateLabel } from '../utils/animatedLabel';
import { MOTION_SECONDS } from '../utils/motionTokens';

/**
 * Chiffre qui évolue quand sa valeur change. Le premier affichage est immédiat
 * et la dernière image est toujours le libellé exact reçu.
 */
export const AnimatedNumber: React.FC<{ children: string | number }> = ({ children }) => {
  const label = String(children);
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef(label);

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = label;
    // Le nœud texte reste celui de React : seule sa valeur change pendant l’animation.
    const node = element.current?.firstChild;
    if (!node || from === label || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const first = interpolateLabel(from, label, 0);
    if (first === null) return;

    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const elapsed = Math.min(1, Math.max(0, (now - start) / (MOTION_SECONDS.deliberate * 1000)));
      node.nodeValue = interpolateLabel(from, label, 1 - (1 - elapsed) ** 3) ?? label;
      if (elapsed < 1) frame = requestAnimationFrame(step);
    };
    node.nodeValue = first;
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      node.nodeValue = label;
    };
  }, [label]);

  return <span ref={element} className="tabular-nums">{label}</span>;
};
