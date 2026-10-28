import { useEffect, useRef } from 'react';

export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean,
) {
  const callbackRef = useRef(callback);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const tick = async () => {
      if (disposed || inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlightRef.current = true;
      try {
        await callbackRef.current();
      } catch {
        // Polling must never surface an unhandled rejection; screens keep their own error state.
      } finally {
        inFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => { void tick(); }, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
