import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnalyticsSource } from '../server/routes/telemetry.ts';

test('classifies consented analytics referrals without retaining the referring URL', () => {
  assert.equal(classifyAnalyticsSource('', 'matable.ci'), 'direct');
  assert.equal(classifyAnalyticsSource('https://www.google.ci/search?q=shop', 'matable.ci'), 'search');
  assert.equal(classifyAnalyticsSource('https://l.instagram.com/?u=shop', 'matable.ci'), 'social');
  assert.equal(classifyAnalyticsSource('https://partner.example/article', 'matable.ci'), 'referral');
  assert.equal(classifyAnalyticsSource('https://www.matable.ci/categorie', 'matable.ci'), 'internal');
  assert.equal(classifyAnalyticsSource('https://google.com.example.org/', 'matable.ci'), 'referral');
  assert.equal(classifyAnalyticsSource('not a URL', 'matable.ci'), 'direct');
});