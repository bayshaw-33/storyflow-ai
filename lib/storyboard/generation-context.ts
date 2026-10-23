import type { PersistedStoryboardShot } from './contracts.ts';
import { loadStoryboardState, type StoryboardFetch } from './state-api.ts';

/** The save RPC is the authoritative shot model; legacy flat columns lose flags and prompts. */
export async function loadGenerationContext(scope: {
  ownerId: string; projectId: string; sourceUnitId: string; shotIds: string[];
}, fetcher: StoryboardFetch) {
  const state = await loadStoryboardState(scope.ownerId, scope.projectId, scope.sourceUnitId, fetcher);
  const projects = await fetcher<Array<{ id: string; aspect_ratio: string; visual_bible: Record<string, unknown> }>>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(scope.projectId)}&owner_id=eq.${encodeURIComponent(scope.ownerId)}&source_unit_id=eq.${encodeURIComponent(scope.sourceUnitId)}&select=id,aspect_ratio,visual_bible&limit=1`,
  );
  const project = projects[0];
  const selected = new Set(scope.shotIds);
  return {
    shots: (state?.scenes.flatMap(scene => scene.shots).filter(shot => selected.has(shot.id)) ?? []) as PersistedStoryboardShot[],
    productionProjectId: project?.id ?? '',
    aspectRatio: project?.aspect_ratio || '9:16',
    visualStyle: typeof project?.visual_bible?.visualStyle === 'string' ? project.visual_bible.visualStyle : '',
    revision: state?.revision ?? 0,
  };
}
