import test from 'node:test';
import assert from 'node:assert/strict';
import { findEarliestBoostStart } from '../server/services/boosts.ts';
import { getBoostPrice } from '../src/utils/boostPricing.ts';

test('boost prices apply the Pro discount and reject unsupported durations', () => {
  assert.equal(getBoostPrice(7, false), 2000);
  assert.equal(getBoostPrice(15, false), 2800);
  assert.equal(getBoostPrice(30, false), 3000);
  assert.equal(getBoostPrice(7, true), 1700);
  assert.equal(getBoostPrice(15, true), 2380);
  assert.equal(getBoostPrice(30, true), 2550);
  assert.equal(getBoostPrice(14, false), null);
});

test('boost scheduling starts immediately when fewer than five intervals overlap', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const intervals = Array.from({ length: 4 }, (_, index) => ({
    starts_at: new Date(now.getTime() - 86400000).toISOString(),
    ends_at: new Date(now.getTime() + 10 * 86400000 + index * 86400000).toISOString(),
  }));

  assert.equal(findEarliestBoostStart(intervals, 7, now).toISOString(), now.toISOString());
});

test('boost scheduling finds the first time one of five occupied slots expires', () => {
  const now = new Date('2026-10-03T00:00:00.000Z');
  const intervals = Array.from({ length: 5 }, (_, index) => ({
    starts_at: new Date(now.getTime() - 86400000).toISOString(),
    ends_at: new Date(now.getTime() + (index + 7) * 86400000).toISOString(),
  }));

  assert.equal(
    findEarliestBoostStart(intervals, 7, now).toISOString(),
    new Date(now.getTime() + 7 * 86400000).toISOString(),
  );
});
