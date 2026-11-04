import React from 'react';

interface MotionRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const MotionReveal: React.FC<MotionRevealProps> = ({ children, className }) => {
  return <div className={`mt-reveal ${className || ''}`}>{children}</div>;
};
