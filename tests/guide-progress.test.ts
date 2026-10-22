import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGuideProgressKey,
  parseGuideProgress,
  toggleGuideStep,
} from '../src/utils/guideProgress.ts';

test('guide progress is parsed, deduplicated and limited to known step ids', () => {
  assert.deepEqual(parseGuideProgress('["first","first","unknown",2]', ['first', 'second']), ['first']);
  assert.deepEqual(parseGuideProgress('{invalid', ['first']), []);
  assert.deepEqual(parseGuideProgress({ first: true }, ['first']), []);
  assert.equal(getGuideProgressKey('merchant'), 'matable:guide-progress:merchant:default');
  assert.equal(getGuideProgressKey('merchant', 12), 'matable:guide-progress:merchant:12');
  assert.notEqual(getGuideProgressKey('customer', 12), getGuideProgressKey('customer', 13));
});

test('guide steps can be marked complete and toggled back', () => {
  assert.deepEqual(toggleGuideStep([], 'first'), ['first']);
  assert.deepEqual(toggleGuideStep(['first', 'second'], 'first'), ['second']);
});
