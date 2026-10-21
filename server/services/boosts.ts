import {
  MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
  type BoostPlacement,
} from '../../src/utils/boostPricing.ts';

export {
  BOOST_DURATIONS_DAYS,
  BOOST_MINIMUM_PRODUCT_COUNT,
  MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
} from '../../src/utils/boostPricing.ts';

export interface BoostInterval {
  starts_at: string;
  ends_at: string;
}

export function getBoostCapacityScope(placement: BoostPlacement | 'directory', city: string, category: string) {
  if (placement === 'home') return { lockKey: 'boost:placement:home', where: 'placement = ?', params: ['home'] };
  if (placement === 'category') {
    return { lockKey: `boost:placement:category:${category}`, where: 'placement = ? AND category = ?', params: ['category', category] };
  }
  if (placement === 'city') {
    return { lockKey: `boost:placement:city:${city}`, where: 'placement = ? AND city = ?', params: ['city', city] };
  }
  return {
    lockKey: `boost:placement:directory:${city}:${category}`,
    where: 'placement = ? AND city = ? AND category = ?',
    params: ['directory', city, category],
  };
}

export function findEarliestBoostStart(
  intervals: BoostInterval[],
  durationDays: number,
  now = new Date(),
  capacity = MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
): Date {
  const validIntervals = intervals
    .map((interval) => ({ start: Date.parse(interval.starts_at), end: Date.parse(interval.ends_at) }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start);
  let candidate = now.getTime();
  const duration = durationDays * 86400000;

  for (let attempt = 0; attempt <= validIntervals.length; attempt += 1) {
    const overlapping = validIntervals.filter((interval) => interval.start < candidate + duration && interval.end > candidate);
    const occupancyEvents = overlapping.flatMap((interval) => [
      { time: Math.max(candidate, interval.start), change: 1 },
      { time: Math.min(candidate + duration, interval.end), change: -1 },
    ]).sort((left, right) => left.time - right.time || left.change - right.change);
    let occupancy = 0;
    let peakOccupancy = 0;
    for (const event of occupancyEvents) {
      occupancy += event.change;
      peakOccupancy = Math.max(peakOccupancy, occupancy);
    }
    if (peakOccupancy < capacity) return new Date(candidate);
    const nextStart = Math.min(...overlapping.map((interval) => interval.end));
    if (nextStart <= candidate) throw new Error('Boost reservation intervals cannot be scheduled.');
    candidate = nextStart;
  }
  throw new Error('Unable to find an available boost reservation window.');
}
