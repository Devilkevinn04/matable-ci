import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, FocusEvent } from 'react';
import type { RefObject } from 'react';
import { useReducedMotion } from 'motion/react';

interface AutoScrollRailHandlers {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

export function useAutoScrollRail<T extends HTMLElement>(
  enabled: boolean,
  itemCount: number,
  intervalMs = 4500,
): { railRef: RefObject<T | null>; handlers: AutoScrollRailHandlers } {
  const railRef = useRef<T>(null);
  const prefersReducedMotion = useReducedMotion();
  const [pointerInside, setPointerInside] = useState(false);
  const [pointerDown, setPointerDown] = useState(false);
  const [focused, setFocused] = useState(false);
  const interacting = pointerInside || pointerDown || focused;

  useEffect(() => {
    const rail = railRef.current;
    if (!enabled || prefersReducedMotion || interacting || !rail || itemCount < 2) return undefined;

    let isVisible = true;
    const observer = typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(([entry]) => { isVisible = entry.isIntersecting; });
    observer?.observe(rail);

    const interval = window.setInterval(() => {
      if (!isVisible || document.hidden || rail.scrollWidth <= rail.clientWidth + 4) return;
      const firstItem = rail.firstElementChild;
      const itemWidth = firstItem?.getBoundingClientRect().width || rail.clientWidth * 0.7;
      const gap = Number.parseFloat(getComputedStyle(rail).columnGap || getComputedStyle(rail).gap) || 0;
      const maxScroll = rail.scrollWidth - rail.clientWidth;
      if (rail.scrollLeft + itemWidth + gap >= maxScroll - 8) {
        rail.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        rail.scrollBy({ left: itemWidth + gap, behavior: 'smooth' });
      }
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
      observer?.disconnect();
    };
  }, [enabled, intervalMs, interacting, itemCount, prefersReducedMotion]);

  return {
    railRef,
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType !== 'touch') setPointerInside(true);
      },
      onPointerLeave: () => setPointerInside(false),
      onPointerDown: () => setPointerDown(true),
      onPointerUp: () => setPointerDown(false),
      onPointerCancel: () => setPointerDown(false),
      onFocus: () => setFocused(true),
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      },
    },
  };
}
