import React, { useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';

interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Apparition douce, réservée au premier écran. Plus bas, le contenu est affiché directement :
 * sur un téléphone lent, il ne reste jamais invisible en attendant l’animation au défilement.
 */
export const MotionReveal: React.FC<MotionRevealProps> = ({ children, className, delay = 0 }) => {
  const prefersReducedMotion = useReducedMotion() === true;
  const ref = useRef<HTMLDivElement>(null);
  const [belowFold, setBelowFold] = useState(false);

  // Mesuré avant l’affichage : aucune image intermédiaire invisible.
  useLayoutEffect(() => {
    const top = ref.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight) setBelowFold(true);
  }, []);

  if (prefersReducedMotion || belowFold) {
    return <div className={`mt-reveal-motion ${className || ''}`}>{children}</div>;
  }

  return <m.div
    ref={ref}
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`mt-reveal-motion ${className || ''}`}
  >
    {children}
  </m.div>;
};
