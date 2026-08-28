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
  if (!candidate.camera || !Array.isArray(candidate.objects)) throw new Error("Invalid previs scene data");
  return parsed as PrevisScene;
}
