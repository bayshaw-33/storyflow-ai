import type { CreativeAsset, CreativePackage, CreativeScene } from "@/lib/universe/creative-package";
import type { ProductionProjectState, ProductionShot } from "./types";

export type ProductionUniverseSnapshot = {
  type: "production_storyboard_video";
  title: string;
  contentType: "short_drama" | "mv";
  aspectRatio: string;
  shotCount: number;
  completedImageCount: number;
  completedVideoCount: number;
  characters: unknown[];
  scenes: unknown[];
  shots: ProductionShot[];
  assets: Array<{
    type: "image" | "video";
    shotId: string;
    title: string;
    url: string;
    provider?: string;
  }>;
};

export function buildProductionUniverseSnapshot(state: ProductionProjectState): ProductionUniverseSnapshot {
  return {
    type: "production_storyboard_video",
    title: state.title,
    contentType: state.contentType,
    aspectRatio: state.aspectRatio,
    shotCount: state.shots.length,
    completedImageCount: state.shots.filter((shot) => Boolean(shot.imageUrl)).length,
    completedVideoCount: state.shots.filter((shot) => Boolean(shot.videoUrl)).length,
    characters: [],
    scenes: groupShotsByScene(state).map(([title, shots]) => ({ title, shotCount: shots.length })),
    shots: state.shots,
    assets: state.shots.flatMap((shot) => [
      ...(shot.imageUrl
        ? [{
            type: "image" as const,
            shotId: shot.id,
            title: `分镜 ${shot.index} 图片`,
            url: shot.imageUrl,
            provider: shot.imageProvider,
          }]
        : []),
      ...(shot.videoUrl
        ? [{
            type: "video" as const,
            shotId: shot.id,
            title: `分镜 ${shot.index} 视频`,
            url: shot.videoUrl,
            provider: shot.videoProvider,
          }]
        : []),
    ]),
  };
}

export function buildProductionCreativePackage(state: ProductionProjectState): CreativePackage {
  const now = new Date().toISOString();
  return {
    id: state.id,
    workflowType: state.shots.some((shot) => shot.videoUrl) || state.mode === "editor" ? "video" : "storyboard",
    title: state.title,
    summary: state.storyBrief.storySummary || state.storyBrief.logline || `${state.shots.length} production shots`,
    language: state.language,
    universeId: state.universeId || null,
    sourceProjectId: state.projectId || null,
    scenes: buildCreativeScenes(state),
    assets: buildCreativeAssets(state),
    sourceText: state.sourceSummary,
    metadata: {
      contentType: state.contentType,
      aspectRatio: state.aspectRatio,
      shotCount: state.shots.length,
      completedImageCount: state.shots.filter((shot) => Boolean(shot.imageUrl)).length,
      completedVideoCount: state.shots.filter((shot) => Boolean(shot.videoUrl)).length,
      productionSnapshot: buildProductionUniverseSnapshot(state),
    },
    createdAt: now,
    updatedAt: state.updatedAt || now,
  };
}

function buildCreativeScenes(state: ProductionProjectState): CreativeScene[] {
  return groupShotsByScene(state).map(([title, shots], index) => ({
    id: `production-scene-${index + 1}`,
    title,
    summary: shots.map((shot) => `分镜 ${shot.index}: ${shot.description}`).join("\n"),
    shots: shots.map((shot) => ({
      id: shot.id,
      title: `分镜 ${shot.index}`,
      prompt: shot.videoPrompt || shot.imagePrompt || shot.description,
      duration: shot.duration,
      assetUrl: shot.videoUrl || shot.imageUrl,
    })),
  }));
}

function buildCreativeAssets(state: ProductionProjectState): CreativeAsset[] {
  return state.shots.flatMap((shot) => [
    ...(shot.imageUrl
      ? [{
          id: `${shot.id}-image`,
          type: "image" as const,
          title: `分镜 ${shot.index} 图片`,
          url: shot.imageUrl,
          prompt: shot.imagePrompt,
          sourceShotId: shot.id,
          metadata: { provider: shot.imageProvider, status: shot.status },
        }]
      : []),
    ...(shot.videoUrl
      ? [{
          id: `${shot.id}-video`,
          type: "video" as const,
          title: `分镜 ${shot.index} 视频`,
          url: shot.videoUrl,
          prompt: shot.videoPrompt,
          sourceShotId: shot.id,
          metadata: { provider: shot.videoProvider, status: shot.status },
        }]
      : []),
  ]);
}

function groupShotsByScene(state: ProductionProjectState): Array<[string, ProductionShot[]]> {
  const sceneMap = new Map<string, ProductionShot[]>();
  state.shots.forEach((shot) => {
    const title = shot.sceneTitle || "Scene";
    sceneMap.set(title, [...(sceneMap.get(title) || []), shot]);
  });
  return Array.from(sceneMap.entries());
}
