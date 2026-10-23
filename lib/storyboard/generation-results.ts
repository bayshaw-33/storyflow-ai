import type { StoryboardPromptResult, SaveRequest, SaveResponse, StoryboardScene, StoryboardShot } from './contracts.ts';
export type PromptFailure = { shotId: string; error: string; code: string };
export function splitPromptResults(items: Array<StoryboardPromptResult | PromptFailure>) {
  const prompts: StoryboardPromptResult[] = [];
  const failures: PromptFailure[] = [];
  for (const item of items) {
    if ('error' in item) failures.push(item);
    else if (Array.isArray(item.referenceVersionIds)) prompts.push(item);
    else failures.push({ shotId: item.shotId, error: '提示词响应不完整，请重试。', code: 'INVALID_RESPONSE' });
  }
  return { prompts, failures };
}
export function readShotImageResult(payload: {
  status: string; images: Array<{ previewUrl: string; versionId: string; provider: string; model: string }>; inputHash?: string;
}) {
  const frame = payload.images?.[0];
  if (payload.status !== 'completed' || !frame?.previewUrl) throw new Error('分镜图尚未完成，请稍后重试。');
  return { imageUrl: frame.previewUrl, versionId: frame.versionId, provider: frame.provider, model: frame.model, inputHash: payload.inputHash || '' };
}

/** Persist before calling paid APIs; use stable IDs returned by the save, never proposal IDs. */
export async function prepareGeneration(request: SaveRequest, shotIds: string[], save: (request: SaveRequest) => Promise<SaveResponse>) {
  if (!request.projectId || !request.sourceUnitId || /^draft(?:-|$)/.test(request.projectId)) {
    throw new Error('请先选择正式项目和剧集并保存分镜。');
  }
  const state = await save(request);
  const persistedIds = new Set(state.scenes.flatMap(scene => scene.shots.map(shot => shot.id)));
  const resolved = shotIds.map(id => state.idMap[id] || id);
  if (resolved.some(id => !persistedIds.has(id))) throw new Error('分镜尚未保存，请刷新后重试。');
  return { state, shotIds: resolved };
}

/** A save acknowledgement must not overwrite text typed while that request was in flight. */
export function mergeSavedStoryboard(
  current: StoryboardScene[],
  submitted: StoryboardScene[],
  response: Pick<SaveResponse, 'scenes' | 'idMap'>,
): StoryboardScene[] {
  if (JSON.stringify(current) === JSON.stringify(submitted)) return response.scenes;
  return current.map((scene): StoryboardScene => {
    const sceneId = response.idMap[scene.id ?? scene.clientId ?? ''] || scene.id;
    const shots = scene.shots.map((shot): StoryboardShot => {
      const id = response.idMap[shot.id ?? shot.clientId ?? ''] || shot.id;
      const nextSceneId = sceneId || shot.sceneId;
      return id ? { ...shot, id, idSource: 'server', sceneId: nextSceneId } : { ...shot, sceneId: nextSceneId };
    });
    return sceneId ? { ...scene, id: sceneId, idSource: 'server', shots } : { ...scene, shots };
  });
}
