import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCompletedVersionReview } from '../lib/client/v2/screenplay-studio/review-state.ts';

test('review requires a successful reply for the exact current outline version', () => {
  const request = { role: 'user', content: '审查（大纲版本：v1）：请检查' };
  const response = { role: 'assistant', content: '审查报告' };
  assert.equal(hasCompletedVersionReview([request], '审查', 'v1'), false);
  assert.equal(hasCompletedVersionReview([request, response], '审查', 'v1'), true);
  assert.equal(hasCompletedVersionReview([request, response], '审查', 'v2'), false);
  assert.equal(hasCompletedVersionReview([request, { role: 'user', content: '新问题' }, response], '审查', 'v1'), false);
  assert.equal(hasCompletedVersionReview([request, response], '审查', null), false);
});
