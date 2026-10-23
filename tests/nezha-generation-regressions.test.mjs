import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGenerationContext } from '../lib/storyboard/generation-context.ts';
import { splitPromptResults, readShotImageResult, prepareGeneration } from '../lib/storyboard/generation-results.ts';

const shot = { id: 'saved-shot', clientId: 'p_shot_1', confirmed: true, visualDescription: '新分镜字段', characterAssetIds: [], propAssetIds: [] };
const state = { projectId: 'project', sourceUnitId: 'episode', revision: 3, scenes: [{ id: 'scene', shots: [shot] }], idMap: {} };
test('generation reads current scoped state and preserves confirmation and new shot fields', async () => {
  const calls = [];
  const result = await loadGenerationContext({ ownerId: 'owner', projectId: 'project', sourceUnitId: 'episode', shotIds: ['saved-shot'] }, async (path, init) => {
    calls.push([path, init]);
    if (path.includes('get_storyboard_state')) return state;
    return [{ id: 'production', aspect_ratio: '9:16', visual_bible: {} }];
  });
  assert.equal(result.shots[0].confirmed, true);
  assert.equal(result.shots[0].visualDescription, '新分镜字段');
  assert.match(calls[1][0], /source_unit_id=eq.episode/);
});
test('generation persists first and submits server IDs with returned revision', async () => {
  const result = await prepareGeneration({ projectId: 'project', sourceUnitId: 'episode', expectedRevision: 2, scenes: [], deletedSceneIds: [], deletedShotIds: [] }, ['p_shot_1'], async () => ({ ...state, idMap: { p_shot_1: 'saved-shot' } }));
  assert.deepEqual(result.shotIds, ['saved-shot']);
  assert.equal(result.state.revision, 3);
});
test('generation stops on persistence failure instead of reporting a submitted shot', async () => {
  await assert.rejects(prepareGeneration({ projectId: 'project', sourceUnitId: 'episode' }, ['p_shot_1'], async () => { throw new Error('REVISION_CONFLICT'); }), /REVISION_CONFLICT/);
});
test('failed prompt items never enter renderable prompt map; mixed successes are retained', () => {
  const good = { shotId: 'one', imagePrompt: 'frame', jimengVideoPrompt: 'video', negativePrompt: '', referenceVersionIds: [], inputHash: 'hash' };
  const bad = { shotId: 'two', error: '分镜未保存', code: 'SHOT_NOT_FOUND' };
  assert.deepEqual(splitPromptResults([good, bad]), { prompts: [good], failures: [bad] });
});
test('shot image response maps real images array and rejects empty or running jobs', () => {
  assert.deepEqual(readShotImageResult({ status: 'completed', images: [{ previewUrl: 'https://cdn/frame.png', versionId: 'version', provider: 'atlas', model: 'seedream' }], inputHash: 'hash' }), { imageUrl: 'https://cdn/frame.png', versionId: 'version', provider: 'atlas', model: 'seedream', inputHash: 'hash' });
  assert.throws(() => readShotImageResult({ status: 'running', images: [] }), /尚未完成/);
});

test('analysis proposal asset IDs never reach UUID database filters', async () => {
  const { loadApprovedVersions } = await import('../lib/storyboard/assets/store.ts');
  let calls = 0;
  const result = await loadApprovedVersions(async () => { calls++; throw new Error('invalid input syntax for type uuid'); }, ['p_asset_character_1', 'p_asset_location_1']);
  assert.equal(calls, 0);
  assert.equal(result.size, 0);
});

test('saving remaps IDs while preserving edits made during an in-flight save', async () => {
  const { mergeSavedStoryboard } = await import('../lib/storyboard/generation-results.ts');
  const submitted = [{clientId:'s',shots:[{clientId:'p',visualDescription:'before'}]}];
  const edited = [{clientId:'s',shots:[{clientId:'p',visualDescription:'typed while saving'}]}];
  const response = {scenes:[{id:'scene',clientId:'scene',shots:[{id:'shot',visualDescription:'before'}]}],idMap:{s:'scene',p:'shot'}};
  const result = mergeSavedStoryboard(edited, submitted, response);
  assert.equal(result[0].shots[0].visualDescription,'typed while saving');
  assert.equal(result[0].shots[0].id,'shot');
  assert.deepEqual(mergeSavedStoryboard(submitted, submitted, response),response.scenes);
});
