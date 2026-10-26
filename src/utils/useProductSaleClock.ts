import { useEffect, useState } from 'react';

export function useProductSaleClock(startsAt?: string | null, endsAt?: string | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const nextBoundary = [startsAt, endsAt]
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextBoundary - Date.now() + 25));
    return () => window.clearTimeout(timer);
  }, [startsAt, endsAt, now]);

  return now;
}
