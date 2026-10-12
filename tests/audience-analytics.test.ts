import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAnalyticsSource, normalizeAnalyticsCampaign } from '../server/routes/telemetry.ts';
import { formatAudienceChange } from '../src/components/adminDashboardTypes.ts';

test('classifies consented analytics referrals without retaining the referring URL', () => {
  assert.equal(classifyAnalyticsSource('', 'matable.ci'), 'direct');
  assert.equal(classifyAnalyticsSource('https://www.google.ci/search?q=shop', 'matable.ci'), 'search');
  assert.equal(classifyAnalyticsSource('https://l.instagram.com/?u=shop', 'matable.ci'), 'social');
  assert.equal(classifyAnalyticsSource('https://partner.example/article', 'matable.ci'), 'referral');
  assert.equal(classifyAnalyticsSource('https://www.matable.ci/categorie', 'matable.ci'), 'internal');
  assert.equal(classifyAnalyticsSource('https://google.com.example.org/', 'matable.ci'), 'referral');
  assert.equal(classifyAnalyticsSource('not a URL', 'matable.ci'), 'direct');
});

test('normalizes campaign labels for analytics without accepting URLs or unbounded input', () => {
  assert.equal(normalizeAnalyticsCampaign(' TikTok_launch-1 '), 'tiktok_launch-1');
  assert.equal(normalizeAnalyticsCampaign('wa.me/order'), null);
  assert.equal(normalizeAnalyticsCampaign('x'.repeat(81)), null);
  assert.equal(normalizeAnalyticsCampaign(null), null);
});

test('formats audience comparisons explicitly when the previous period has no activity', () => {
  assert.equal(formatAudienceChange(0, 0), '0 dans les deux périodes');
  assert.equal(formatAudienceChange(1250, 0), '0 → 1 250');
  assert.equal(formatAudienceChange(4.5, 0, true), '0 → 4.5 pt');
});