import type { ArtWorkbenchState, ArtAsset, ArtAssetVariant, ArtAssetVersion } from '../art-workbench.ts';
import type { ArtChatDraft } from './chat-workflow.ts';

type Fetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value : '';

/** Read an existing art project into a stable workbench scope; never create a replacement project. */
export async function loadLegacyArtDraft(ownerId: string, projectId: string, fetcher: Fetcher, sign: (path: string) => Promise<string>): Promise<ArtChatDraft> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) throw new Error('LEGACY_ART_PROJECT_INVALID');
  const projects = await fetcher<Row[]>(`/rest/v1/storyflow_art_projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,name,visual_style,updated_at&limit=1`);
  const project = projects[0];
  if (!project) throw new Error('LEGACY_ART_PROJECT_NOT_FOUND');
  const assets = await fetcher<Row[]>(`/rest/v1/storyflow_art_assets?project_id=eq.${encodeURIComponent(projectId)}&status=neq.archived&select=*&order=updated_at.desc`);
  const assetIds = assets.map(row => text(row.id));
  const variants = assetIds.length ? await fetcher<Row[]>(`/rest/v1/storyflow_art_asset_variants?asset_id=in.(${assetIds.map(encodeURIComponent).join(',')})&select=*&order=created_at.asc`) : [];
  const variantIds = variants.map(row => text(row.id));
  const versions = variantIds.length ? await fetcher<Row[]>(`/rest/v1/storyflow_art_asset_versions?variant_id=in.(${variantIds.map(encodeURIComponent).join(',')})&select=*&order=created_at.desc`) : [];
  const signed = new Map(await Promise.all([...new Set(versions.map(row => text(row.storage_path)).filter(Boolean))].map(async path => [path, await sign(path)] as const)));
  const mappedAssets: ArtAsset[] = assets.map(row => {
    const mappedVariants: ArtAssetVariant[] = variants.filter(variant => variant.asset_id === row.id).map(variant => {
      const mappedVersions: ArtAssetVersion[] = versions.filter(version => version.variant_id === variant.id).map(version => ({
        id: text(version.id), imageUrl: signed.get(text(version.storage_path)) || '', storagePath: text(version.storage_path),
        source: version.source === 'uploaded' ? 'uploaded' : 'generated', provider: text(version.provider), model: text(version.model), prompt: text(version.prompt), createdAt: text(version.created_at),
      }));
      return { id: text(variant.id), name: text(variant.name), type: variant.variant_type === 'appearance' || variant.variant_type === 'state' ? variant.variant_type : 'master', prompt: text(variant.prompt), approvedVersionId: text(variant.approved_version_id) || undefined, versions: mappedVersions };
    });
    const master = mappedVariants.find(variant => variant.type === 'master') || mappedVariants[0];
    const preview = master?.versions.find(version => version.id === master.approvedVersionId) || master?.versions[0];
    return { id: text(row.id), kind: row.kind === 'scene' || row.kind === 'prop' ? row.kind : 'character', name: text(row.name), role: text(row.narrative_role), description: text(row.description), prompt: text(row.prompt), negativePrompt: text(row.negative_prompt), identityAnchor: text(row.identity_anchor), actorId: text(row.actor_id) || undefined, variants: mappedVariants, approvedVersionId: master?.approvedVersionId, referenceSheetUrl: preview?.imageUrl, status: preview ? 'ready' : 'draft', updatedAt: text(row.updated_at) };
  });
  const state: ArtWorkbenchState = { id: `legacy-art-${projectId}`, title: text(project.name), visualStyle: text(project.visual_style), sourceText: '', sourceFiles: [], assets: mappedAssets, updatedAt: text(project.updated_at) };
  return { state, messages: [{ id: `legacy-art-open-${projectId}`, role: 'assistant', content: '已载入这个美术项目的资产与版本。后续编辑保存在当前项目对应的工作草稿中。' }], jobs: [] };
}
