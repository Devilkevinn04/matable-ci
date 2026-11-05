import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const MotionReveal: React.FC<MotionRevealProps> = ({ children, className, delay = 0 }) => {
  const prefersReducedMotion = useReducedMotion() === true;

  return <motion.div
    initial={false}
    whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, amount: 0.16 }}
    transition={prefersReducedMotion ? undefined : { duration: 0.48, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`mt-reveal-motion ${className || ''}`}
  >
    {children}
  </motion.div>;
};
