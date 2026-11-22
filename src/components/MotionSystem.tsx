import React, { useLayoutEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { motionDeliberate, motionStandard } from '../utils/motionTokens';

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
    transition={{ ...motionDeliberate, delay }}
    className={`mt-reveal-motion ${className || ''}`}
  >
    {children}
  </m.div>;
};

/** Au-delà, recalculer la position de chaque carte devient coûteux sur un téléphone modeste. */
const ANIMATED_GRID_LIMIT = 24;

interface MotionGridItemProps extends Omit<React.ComponentProps<typeof m.div>, 'layout' | 'exit' | 'transition'> {
  /** Nombre de cartes de la grille. */
  count: number;
}

/** Carte qui glisse vers sa nouvelle place quand un filtre réorganise la grille. À placer dans un AnimatePresence popLayout. */
export const MotionGridItem = React.forwardRef<HTMLDivElement, MotionGridItemProps>(({ count, children, ...props }, ref) => {
  const still = useReducedMotion() === true || count > ANIMATED_GRID_LIMIT;
  return (
    <m.div
      ref={ref}
      layout={still ? false : 'position'}
      exit={still ? undefined : { opacity: 0 }}
      transition={still ? { duration: 0 } : motionStandard}
      {...props}
    >
      {children}
    </m.div>
  );
});
MotionGridItem.displayName = 'MotionGridItem';
