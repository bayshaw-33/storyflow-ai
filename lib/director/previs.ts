export type PrevisAspectRatio = "9:16";
export type PrevisVector3 = [number, number, number];

export interface PrevisTransform {
  position: PrevisVector3;
  rotation: PrevisVector3;
  scale: PrevisVector3;
}

export interface PrevisKeyframe {
  timeSeconds: number;
  transform: PrevisTransform;
}

export type PrevisObjectKind = "room" | "actor_proxy" | "prop";

export interface PrevisObject {
  id: string;
  kind: PrevisObjectKind;
  name: string;
  /** Stable project asset identity when this object came from the storyboard. */
  assetId?: string;
  source?: "storyboard" | "manual";
  transform: PrevisTransform;
  keyframes: PrevisKeyframe[];
}

export interface PrevisCamera {
  position: PrevisVector3;
  rotation: PrevisVector3;
  focalLength: number;
  keyframes: PrevisKeyframe[];
}

export interface PrevisScene {
  schemaVersion: 1;
  aspectRatio: PrevisAspectRatio;
  durationSeconds: 5 | 10;
  camera: PrevisCamera;
  objects: PrevisObject[];
}

const transform = (position: PrevisVector3): PrevisTransform => ({
  position,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

export function createDefaultPrevisScene(): PrevisScene {
  return {
    schemaVersion: 1,
    aspectRatio: "9:16",
    durationSeconds: 5,
    camera: {
      position: [0, 2.2, 8],
      rotation: [0, 0, 0],
      focalLength: 35,
      keyframes: [],
    },
    objects: [
      {
        id: "room",
        kind: "room",
        name: "基础空间",
        transform: transform([0, 0, 0]),
        keyframes: [],
      },
      {
        id: "actor-1",
        kind: "actor_proxy",
        name: "人物替身 1",
        transform: transform([0, 0, 0]),
        keyframes: [],
      },
    ],
  };
}

export function interpolateTransform(
  from: PrevisTransform,
  to: PrevisTransform,
  progress: number,
): PrevisTransform {
  const t = Math.max(0, Math.min(1, progress));
  const mix = (a: PrevisVector3, b: PrevisVector3): PrevisVector3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  return {
    position: mix(from.position, to.position),
    rotation: mix(from.rotation, to.rotation),
    scale: mix(from.scale, to.scale),
  };
}

function cloneScene(scene: PrevisScene): PrevisScene {
  return JSON.parse(JSON.stringify(scene)) as PrevisScene;
}

function isVector3(value: unknown): value is PrevisVector3 {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isTransform(value: unknown): value is PrevisTransform {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PrevisTransform>;
  return isVector3(candidate.position) && isVector3(candidate.rotation) && isVector3(candidate.scale);
}

function isKeyframes(value: unknown): value is PrevisKeyframe[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<PrevisKeyframe>;
    return typeof candidate.timeSeconds === "number" && Number.isFinite(candidate.timeSeconds) && isTransform(candidate.transform);
  });
}

function isPrevisCamera(value: unknown): value is PrevisCamera {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PrevisCamera>;
  return isVector3(candidate.position)
    && isVector3(candidate.rotation)
    && typeof candidate.focalLength === "number"
    && Number.isFinite(candidate.focalLength)
    && isKeyframes(candidate.keyframes);
}

function isPrevisObject(value: unknown): value is PrevisObject {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PrevisObject>;
  return typeof candidate.id === "string"
    && (candidate.kind === "room" || candidate.kind === "actor_proxy" || candidate.kind === "prop")
    && typeof candidate.name === "string"
    && isTransform(candidate.transform)
    && isKeyframes(candidate.keyframes);
}

export function upsertKeyframe(
  scene: PrevisScene,
  objectId: string,
  keyframe: PrevisKeyframe,
): PrevisScene {
  const next = cloneScene(scene);
  const object = next.objects.find((item) => item.id === objectId);
  if (!object) throw new Error(`Unknown previs object: ${objectId}`);
  object.keyframes = [
    ...object.keyframes.filter((item) => item.timeSeconds !== keyframe.timeSeconds),
    keyframe,
  ].sort((a, b) => a.timeSeconds - b.timeSeconds);
  return next;
}

export function serializePrevisScene(scene: PrevisScene): string {
  return JSON.stringify(scene, null, 2);
}

export function parsePrevisScene(serialized: string): PrevisScene {
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid previs scene");
  const candidate = parsed as Partial<PrevisScene>;
  if (candidate.schemaVersion !== 1) throw new Error("Invalid previs schemaVersion");
  if (candidate.aspectRatio !== "9:16") throw new Error("Invalid previs aspectRatio");
  if (candidate.durationSeconds !== 5 && candidate.durationSeconds !== 10) {
    throw new Error("Invalid previs durationSeconds");
  }
  if (!isPrevisCamera(candidate.camera) || !Array.isArray(candidate.objects) || !candidate.objects.every(isPrevisObject)) {
    throw new Error("Invalid previs scene data");
  }
  return parsed as PrevisScene;
}
