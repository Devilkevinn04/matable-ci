import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Info, Lightbulb } from 'lucide-react';

interface ContextualHelpProps {
  label: string;
  children: string;
  variant?: 'question' | 'info' | 'tip';
}

export function ContextualHelp({ label, children, variant = 'question' }: ContextualHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipLeft, setTooltipLeft] = useState(0);
  const helpRef = useRef<HTMLSpanElement>(null);
  const helpId = useId();
  const positionTooltip = useCallback(() => {
    const trigger = helpRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const tooltipWidth = Math.min(256, window.innerWidth - 32);
    const left = Math.min(Math.max(trigger.left, 16), window.innerWidth - tooltipWidth - 16);
    setTooltipLeft(left - trigger.left);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    positionTooltip();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !helpRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('resize', positionTooltip);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', positionTooltip);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, positionTooltip]);

  return (
    <span
      ref={helpRef}
      className="relative inline-flex align-middle"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          positionTooltip();
          setIsOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setIsOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Aide : ${label}`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? helpId : undefined}
        onClick={() => {
          positionTooltip();
          setIsOpen(true);
        }}
        className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-600 transition group-hover:border-emerald-700 group-hover:text-emerald-800">
          {variant === 'question' ? '?' : variant === 'info' ? <Info className="h-3.5 w-3.5" aria-hidden="true" /> : <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />}
        </span>
      </button>
      {isOpen && (
        <span
          id={helpId}
          role="tooltip"
          style={{ left: tooltipLeft }}
          className="absolute top-full z-[80] mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-medium leading-5 text-slate-700 shadow-xl"
        >
          {children}
        </span>
      )}
    </span>
  );
}
