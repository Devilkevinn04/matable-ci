import { useEffect, useRef, useState } from 'react';

const TRIGGER_DISTANCE = 72;
const MAX_PULL = 110;
const MIN_REFRESH_DISPLAY_MS = 600;

export type PullToRefreshState = {
  distance: number;
  refreshing: boolean;
  ready: boolean;
  failed: boolean;
};

// Geste « tirer pour actualiser » : actif seulement en haut de page, avec un seul doigt et un tirage vertical.
export function usePullToRefresh(onRefresh: () => Promise<boolean>, enabled: boolean): PullToRefreshState {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const pulling = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return undefined;

    const setPull = (value: number) => {
      distanceRef.current = value;
      setDistance(value);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = event.touches[0].clientY;
      startX.current = event.touches[0].clientX;
      pulling.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY.current === null) return;
      const deltaY = event.touches[0].clientY - startY.current;
      const deltaX = Math.abs(event.touches[0].clientX - startX.current);
      if (!pulling.current) {
        if (deltaY < 8 || deltaX > deltaY) return;
        if (window.scrollY > 0) {
          startY.current = null;
          return;
        }
        pulling.current = true;
      }
      setPull(Math.min(MAX_PULL, deltaY * 0.5));
    };

    const onTouchEnd = async () => {
      const shouldRefresh = pulling.current && distanceRef.current >= TRIGGER_DISTANCE;
      startY.current = null;
      pulling.current = false;
      if (!shouldRefresh) {
        setPull(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setFailed(false);
      setPull(TRIGGER_DISTANCE * 0.7);
      const startedAt = Date.now();
      const ok = await refreshRef.current().catch(() => false);
      const remaining = MIN_REFRESH_DISPLAY_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      refreshingRef.current = false;
      setRefreshing(false);
      setFailed(!ok);
      setPull(0);
      if (!ok) window.setTimeout(() => setFailed(false), 3000);
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled]);

  return { distance, refreshing, ready: distance >= TRIGGER_DISTANCE, failed };
}
