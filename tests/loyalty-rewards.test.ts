import test from 'node:test';
import assert from 'node:assert/strict';
import { getRewardDraftError, isRewardOffered, toRewardDraft, toRewardPayload, type LoyaltyRewardDraft } from '../src/utils/loyaltyRewards.ts';

const TODAY = '2026-11-22';
const draft = (extra: Partial<LoyaltyRewardDraft> = {}): LoyaltyRewardDraft => ({
  key: 'a', id: null, label: 'Jus offert', conditions: '', cost: '5', remaining: '', savedRemaining: null, endsOn: '', isActive: true, ...extra,
});

test('reward drafts are checked with the same limits as the server', () => {
  assert.equal(getRewardDraftError(draft(), TODAY), null);
  for (const bad of [{ label: ' a ' }, { cost: '' }, { cost: '0' }, { cost: '51' }, { cost: '2.5' }, { cost: '-1' }, { remaining: 'x' }, { remaining: '-2' }, { endsOn: '2026-11-21' }]) {
    assert.ok(getRewardDraftError(draft(bad), TODAY), JSON.stringify(bad));
  }
  assert.equal(getRewardDraftError(draft({ endsOn: TODAY }), TODAY), null, 'le jour même est inclus');
  assert.equal(getRewardDraftError(draft({ endsOn: '2026-11-21', isActive: false }), TODAY), null);
});

test('reward drafts convert to and from the server format', () => {
  assert.deepEqual(toRewardPayload(draft({ id: 4, label: ' Jus ', remaining: '20', endsOn: TODAY })), {
    id: 4, label: 'Jus', conditions: '', cost_points: 5, remaining: 20, ends_at: '2026-11-22T23:59:59.999Z', is_active: true,
  });
  const payload = toRewardPayload(draft());
  assert.equal('id' in payload, false);
  assert.deepEqual([payload.remaining, payload.ends_at], [null, null]);
  const saved = { id: 4, label: 'Jus', conditions: 'Sur place', cost_points: 5, remaining: null, ends_at: '2026-11-22T23:59:59.999Z', is_active: true };
  assert.deepEqual(toRewardPayload(toRewardDraft(saved)), saved, 'aller-retour sans perte');
  assert.equal(toRewardPayload({ ...toRewardDraft({ ...saved, remaining: 20 }), remaining: '25' }).previous_remaining, 20);
});

test('only visible, available and unexpired rewards are offered', () => {
  assert.equal(isRewardOffered(draft(), TODAY), true);
  assert.equal(isRewardOffered(draft({ isActive: false }), TODAY), false);
  assert.equal(isRewardOffered(draft({ remaining: '0' }), TODAY), false);
  assert.equal(isRewardOffered(draft({ endsOn: '2026-11-21' }), TODAY), false);
});
