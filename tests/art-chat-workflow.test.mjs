import test from 'node:test';
import assert from 'node:assert/strict';
import { applyArtChatActions, resolveStandaloneArtDraftKey, addGeneratedArtCandidates } from '../lib/art/chat-workflow.ts';
import { createArtAsset, createEmptyArtWorkbenchState } from '../lib/art-workbench.ts';

test('standalone drafts isolate both account and new draft, no global fallback', () => {
  assert.equal(resolveStandaloneArtDraftKey(undefined, 'draft-a'), null);
  assert.notEqual(resolveStandaloneArtDraftKey('alice', 'draft-a'), resolveStandaloneArtDraftKey('bob', 'draft-a'));
  assert.notEqual(resolveStandaloneArtDraftKey('alice', 'old'), resolveStandaloneArtDraftKey('alice', 'new'));
});

test('safe actions create variant, attach durable reference, do not replace locked master', () => {
  const asset = createArtAsset('character');
  asset.variants[0].approvedVersionId = 'locked';
  const state = { ...createEmptyArtWorkbenchState(), assets: [asset] };
  const result = applyArtChatActions(state, [
    { type: 'create_variant', assetId: asset.id, name: '雨衣', description: '黄色雨衣' },
    { type: 'attach_upload', assetId: asset.id, uploadId: 'ref', purpose: 'master' },
    { type: 'request_confirmation', reason: '删除资产需要确认。', pendingAction: { type: 'delete_asset', assetId: asset.id } },
  ], [{ id: 'ref', name: '脸部', url: 'https://example.test/ref.png', storagePath: 'alice/references/ref.png' }]);
  assert.equal(result.state.assets[0].variants[0].approvedVersionId, 'locked');
  assert.equal(result.state.assets[0].variants[1].name, '雨衣');
  assert.equal(result.state.assets[0].variants[0].versions[0].storagePath, 'alice/references/ref.png');
  assert.match(result.feedback.join(' '), /确认/);
});

test('generated images are durable candidates, replay is idempotent and master stays locked', () => {
  const asset = createArtAsset('scene');
  asset.variants[0].approvedVersionId = 'locked';
  const state = { ...createEmptyArtWorkbenchState(), assets: [asset] };
  const input = { assetId: asset.id, variantId: asset.variants[0].id, prompt: '雨夜', images: [{ storagePath: 'alice/project/generated/1.png', previewUrl: 'https://example.test/1.png', provider: 'flux', model: 'flux-2-pro' }] };
  const updated = addGeneratedArtCandidates(state, input);
  assert.equal(updated.assets[0].variants[0].versions.length, 1);
  assert.equal(updated.assets[0].variants[0].approvedVersionId, 'locked');
  assert.equal(addGeneratedArtCandidates(updated, input).assets[0].variants[0].versions.length, 1);
  const removed = addGeneratedArtCandidates({ ...state, assets: [] }, input);
  assert.equal(removed.assets.length, 0, 'late results never recreate deleted assets');
});
