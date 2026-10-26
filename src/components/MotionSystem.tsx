import React from 'react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import { motionTokens } from '../utils/motionTokens';

interface MotionSystemProviderProps {
  children: React.ReactNode;
}

interface PublicRouteEnterProps {
  children: React.ReactNode;
  enabled: boolean;
  routeKey: string;
}

interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const MotionSystemProvider: React.FC<MotionSystemProviderProps> = ({ children }) => (
  <MotionConfig
    reducedMotion="user"
    transition={{
      duration: motionTokens.duration.standard,
      ease: motionTokens.ease.standard,
    }}
  >
    {children}
  </MotionConfig>
);

export const PublicRouteEnter: React.FC<PublicRouteEnterProps> = ({ children, enabled, routeKey }) => {
  const prefersReducedMotion = useReducedMotion();

  if (!enabled) return <>{children}</>;

  return (
    <motion.div
      key={routeKey}
      initial={prefersReducedMotion ? false : { opacity: 0, y: motionTokens.distance.standard }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? motionTokens.duration.instant : motionTokens.duration.standard,
        ease: motionTokens.ease.entrance,
      }}
      className="min-h-full"
    >
      {children}
    </motion.div>
  );
};

export const MotionReveal: React.FC<MotionRevealProps> = ({ children, className, delay = 0 }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: motionTokens.distance.standard }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{
        duration: prefersReducedMotion ? motionTokens.duration.instant : motionTokens.duration.deliberate,
        delay: prefersReducedMotion ? 0 : delay,
        ease: motionTokens.ease.entrance,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
