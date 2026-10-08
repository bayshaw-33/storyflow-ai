import { ART_WORKBENCH_STORAGE_KEY, createArtAsset, appendArtVersions, type ArtWorkbenchState } from '../art-workbench.ts';
import type { ArtAction } from './types.ts';

export type ArtReference = { id: string; name: string; url: string; storagePath: string };
export type ArtChatImage = { previewUrl: string; storagePath: string; provider?: string; model?: string };
export type ArtChatMessage = { id: string; role: 'user' | 'assistant'; content: string; note?: string; images?: ArtChatImage[]; assetId?: string };
export type ArtChatJob = { id: string; assetId: string; variantId: string; prompt: string; status: 'running' | 'completed' | 'failed'; error?: string; createdAt: string; images?: ArtChatImage[] };
export type ArtChatDraft = { state: ArtWorkbenchState; messages: ArtChatMessage[]; jobs: ArtChatJob[] };
export type ArtChatScope = { projectId?: string; workId?: string; draftId?: string };

export function resolveStandaloneArtDraftKey(userId?: string, draftId?: string): string | null {
  if (!userId || !draftId) return null;
  return [ART_WORKBENCH_STORAGE_KEY, userId, 'draft', draftId].map(encodeURIComponent).join(':');
}

export function applyArtChatActions(state: ArtWorkbenchState, actions: ArtAction[], references: ArtReference[]) {
  let assets = [...state.assets];
  const feedback: string[] = [];
  let createdAssetId: string | undefined;
  for (const action of actions) {
    if (action.type === 'create_asset') {
      const asset = createArtAsset(action.kind, { name: action.name, role: action.narrativeRole, description: action.description });
      assets = [asset, ...assets];
      createdAssetId = asset.id;
    } else if (action.type === 'update_asset') {
      assets = assets.map(asset => asset.id === action.assetId ? { ...asset, name: action.patch.name ?? asset.name, role: action.patch.narrativeRole ?? asset.role, description: action.patch.description ?? asset.description, identityAnchor: action.patch.identityAnchor ?? asset.identityAnchor, updatedAt: new Date().toISOString() } : asset);
    } else if (action.type === 'create_variant') {
      assets = assets.map(asset => asset.id === action.assetId ? { ...asset, variants: [...(asset.variants || []), { id: crypto.randomUUID(), name: action.name, type: asset.kind === 'character' ? 'appearance' as const : 'state' as const, prompt: action.description, versions: [] }] } : asset);
    } else if (action.type === 'attach_upload') {
      const ref = references.find(item => item.id === action.uploadId);
      const assetId = action.assetId || createdAssetId;
      const target = assets.find(item => item.id === assetId);
      const variant = target?.variants?.[0];
      if (!ref || !target || !variant) { feedback.push('请指定参考图要关联的资产。'); continue; }
      if (action.purpose === 'master') feedback.push('图片已加入候选；请在资产编辑器确认后锁定母版，不会覆盖现有终稿。');
      const updated = appendArtVersions(target, variant.id, [{ id: crypto.randomUUID(), imageUrl: ref.url, storagePath: ref.storagePath, source: 'uploaded', prompt: ref.name, createdAt: new Date().toISOString() }]);
      assets = assets.map(item => item.id === target.id ? updated : item);
    } else if (action.type === 'request_confirmation') {
      feedback.push(`${action.reason}请进入对应资产编辑器手动确认；本次未执行。`);
    }
  }
  return { state: { ...state, assets, updatedAt: new Date().toISOString() }, createdAssetId, feedback };
}

export function addGeneratedArtCandidates(state: ArtWorkbenchState, input: { assetId: string; variantId: string; prompt: string; images: ArtChatImage[] }): ArtWorkbenchState {
  return { ...state, updatedAt: new Date().toISOString(), assets: state.assets.map(asset => {
    if (asset.id !== input.assetId) return asset;
    const variant = asset.variants?.find(item => item.id === input.variantId);
    if (!variant) return asset;
    const versions = input.images.filter(image => !variant.versions.some(version => version.storagePath === image.storagePath)).map(image => ({ id: crypto.randomUUID(), imageUrl: image.previewUrl, storagePath: image.storagePath, provider: image.provider, model: image.model, source: 'generated' as const, prompt: input.prompt, createdAt: new Date().toISOString() }));
    return appendArtVersions(asset, variant.id, versions);
  }) };
}
