import type {
  PrevisObject,
  PrevisScene,
  PrevisTransform,
  PrevisVector3,
} from "./previs.ts";
import { createDefaultPrevisScene } from "./previs.ts";
import type {
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
} from "@/lib/storyboard/contracts";

export type PrevisAsset = StoryboardAssetUsage;

export type PrevisShotOption = {
  shotId: string;
  sceneId: string;
  sceneLabel: string;
  shotLabel: string;
  durationSeconds: number;
  cameraMovement: string;
  angle: string;
  shotSize: string;
  visualDescription: string;
  dialogue: string;
  characterAssetIds: string[];
  sceneAssetId: string | null;
  propAssetIds: string[];
  storyboardImageUrl: string | null;
  videoPrompt: string;
  promptInputHash: string;
  referenceVersionIds: string[];
};

export type PrevisFrameMap = Record<string, { imageUrl: string }>;
export type PrevisPromptMap = Record<string, {
  jimengVideoPrompt: string;
  inputHash?: string;
  referenceVersionIds?: string[];
}>;

export type VideoHandoffPackage = {
  schemaVersion: 1;
  kind: "kiikis.previs.video-handoff";
  projectId: string;
  workId: string;
  unitId: string | null;
  sceneId: string;
  shotId: string;
  shotLabel: string;
  aspectRatio: "9:16";
  durationSeconds: 5 | 10;
  firstframeUrl: string | null;
  prompt: string;
  motionSummary: string;
  manualConfirmationRequired: true;
  createdAt: string;
  previs: Pick<PrevisScene, "camera" | "objects">;
};

const objectTransform = (position: PrevisVector3): PrevisTransform => ({
  position,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

function identityOf<T extends { id?: string; clientId?: string }>(value: T): string {
  return value.id ?? value.clientId ?? "";
}

function assetById(assets: PrevisAsset[], assetId: string | null | undefined): PrevisAsset | undefined {
  return assetId ? assets.find((asset) => asset.assetId === assetId) : undefined;
}

export function buildPrevisShotOptions(
  scenes: StoryboardScene[],
  assets: { characters: PrevisAsset[]; locations: PrevisAsset[]; props: PrevisAsset[] },
  frames: PrevisFrameMap,
  prompts: PrevisPromptMap,
): PrevisShotOption[] {
  return scenes.flatMap((scene) => scene.shots.map((shot) => {
    const shotId = identityOf(shot);
    return {
      shotId,
      sceneId: identityOf(scene),
      sceneLabel: `场 ${scene.order} · ${scene.heading || scene.location}`,
      shotLabel: `镜头 ${shot.order} · ${shot.shotSize}`,
      durationSeconds: shot.durationSeconds,
      cameraMovement: shot.cameraMovement,
      angle: shot.angle,
      shotSize: shot.shotSize,
      visualDescription: shot.visualDescription,
      dialogue: shot.dialogue,
      characterAssetIds: [...shot.characterAssetIds],
      sceneAssetId: shot.sceneAssetId,
      propAssetIds: [...shot.propAssetIds],
      storyboardImageUrl: frames[shotId]?.imageUrl ?? null,
      videoPrompt: prompts[shotId]?.jimengVideoPrompt ?? "",
      promptInputHash: prompts[shotId]?.inputHash ?? "",
      referenceVersionIds: [...(prompts[shotId]?.referenceVersionIds ?? [])],
    };
  }));
}

export function buildPrevisSceneForShot(
  shot: PrevisShotOption,
  assets: { characters: PrevisAsset[]; locations: PrevisAsset[]; props: PrevisAsset[] },
): PrevisScene {
  const base = createDefaultPrevisScene();
  const sceneAsset = assetById(assets.locations, shot.sceneAssetId);
  const characters = shot.characterAssetIds
    .map((assetId) => assetById(assets.characters, assetId))
    .filter((asset): asset is PrevisAsset => Boolean(asset));
  const props = shot.propAssetIds
    .map((assetId) => assetById(assets.props, assetId))
    .filter((asset): asset is PrevisAsset => Boolean(asset));
  const objects: PrevisObject[] = [{
    id: `scene-room:${shot.sceneId}`,
    kind: "room",
    assetId: sceneAsset?.assetId ?? shot.sceneAssetId ?? undefined,
    source: "storyboard",
    name: sceneAsset?.name ?? shot.sceneLabel,
    transform: objectTransform([0, 0, 0]),
    keyframes: [],
  }];

  characters.forEach((asset, index) => objects.push({
    id: `actor:${asset.assetId}`,
    kind: "actor_proxy",
    assetId: asset.assetId,
    source: "storyboard",
    name: asset.name,
    transform: objectTransform([(index - (characters.length - 1) / 2) * 1.4, 0, 0]),
    keyframes: [],
  }));
  props.forEach((asset, index) => objects.push({
    id: `prop:${asset.assetId}`,
    kind: "prop",
    assetId: asset.assetId,
    source: "storyboard",
    name: asset.name,
    transform: objectTransform([-(index + 1) * 1.2, 0, -1]),
    keyframes: [],
  }));

  return {
    ...base,
    durationSeconds: shot.durationSeconds >= 7.5 ? 10 : 5,
    objects: objects.length > 1 ? objects : [{ ...objects[0] }, {
      id: "actor:placeholder",
      kind: "actor_proxy",
      source: "manual",
      name: "人物替身",
      transform: objectTransform([0, 0, 0]),
      keyframes: [],
    }],
  };
}

export function buildVideoHandoffPackage(input: {
  projectId: string;
  workId: string;
  unitId: string | null;
  shot: PrevisShotOption;
  scene: PrevisScene;
  firstframeUrl?: string | null;
  prompt?: string;
  createdAt?: string;
}): VideoHandoffPackage {
  const durationSeconds = input.scene.durationSeconds;
  const firstframeUrl = input.firstframeUrl ?? null;
  const prompt = input.prompt?.trim() || input.shot.visualDescription || "";
  const motionSummary = [input.shot.cameraMovement, input.shot.angle, input.shot.shotSize]
    .filter(Boolean)
    .join(" · ");
  return {
    schemaVersion: 1,
    kind: "kiikis.previs.video-handoff",
    projectId: input.projectId,
    workId: input.workId,
    unitId: input.unitId,
    sceneId: input.shot.sceneId,
    shotId: input.shot.shotId,
    shotLabel: `${input.shot.sceneLabel} · ${input.shot.shotLabel}`,
    aspectRatio: "9:16",
    durationSeconds,
    firstframeUrl,
    prompt,
    motionSummary,
    manualConfirmationRequired: true,
    createdAt: input.createdAt ?? new Date().toISOString(),
    previs: {
      camera: input.scene.camera,
      objects: input.scene.objects,
    },
  };
}

export function previsHandoffStorageKey(projectId: string, workId: string, unitId: string | null, shotId: string): string {
  return `kiikis:previs:handoff:v1:${projectId}:${workId}:${unitId ?? "none"}:${shotId}`;
}

export type { StoryboardShot };
