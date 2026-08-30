import { parsePrevisScene, type PrevisScene } from "./previs.ts";

export type PrevisCapabilityTranslation = {
  mode: "firstframe_prompt" | "native_motion_reference";
  preserved: string[];
  lossy: string[];
};

export type PrevisVersionSnapshotV1 = {
  schemaVersion: 1;
  kind: "kiikis.previs.version";
  projectId: string;
  workId: string;
  sourceUnitId: string;
  storyboardRevision: number;
  sceneId: string;
  shotId: string;
  shotLabel: string;
  previs: PrevisScene;
  adoptedInput: {
    firstframeJobId: string;
    firstframeUrlAtSave: string;
    prompt: string;
    promptInputHash: string;
    referenceVersionIds: string[];
    durationSeconds: 5 | 10;
    aspectRatio: "9:16";
  };
  capabilityTranslation: PrevisCapabilityTranslation;
  snapshotHash: string;
  createdAt: string;
};

export type PrevisVersionRecord = {
  id: string;
  versionNo: number;
  snapshot: PrevisVersionSnapshotV1;
};

export type PrevisVersionSummary = {
  id: string;
  versionNo: number;
  shotId: string;
  shotLabel: string;
  firstframeUrl: string;
  prompt: string;
  capabilityTranslation: PrevisCapabilityTranslation;
  createdAt: string;
};

function invalid(): never {
  throw new Error("INVALID_PREVIS_VERSION");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

export function buildPrevisCapabilityTranslation(): PrevisCapabilityTranslation {
  return {
    mode: "firstframe_prompt",
    preserved: ["first_frame", "text_prompt", "duration", "aspect_ratio"],
    lossy: ["camera_path", "actor_blocking", "focus_pull"],
  };
}

export function parsePrevisVersionSnapshot(value: unknown): PrevisVersionSnapshotV1 {
  if (!value || typeof value !== "object") invalid();
  const input = value as Partial<PrevisVersionSnapshotV1>;
  const adopted = input.adoptedInput as Partial<PrevisVersionSnapshotV1["adoptedInput"]> | undefined;
  const capability = input.capabilityTranslation as Partial<PrevisCapabilityTranslation> | undefined;

  if (
    input.schemaVersion !== 1
    || input.kind !== "kiikis.previs.version"
    || !nonEmpty(input.projectId)
    || !nonEmpty(input.workId)
    || !nonEmpty(input.sourceUnitId)
    || !Number.isInteger(input.storyboardRevision)
    || Number(input.storyboardRevision) < 0
    || !nonEmpty(input.sceneId)
    || !nonEmpty(input.shotId)
    || !nonEmpty(input.shotLabel)
    || !nonEmpty(input.snapshotHash)
    || !nonEmpty(input.createdAt)
    || !adopted
    || !nonEmpty(adopted.firstframeJobId)
    || !nonEmpty(adopted.firstframeUrlAtSave)
    || !nonEmpty(adopted.prompt)
    || !nonEmpty(adopted.promptInputHash)
    || !stringArray(adopted.referenceVersionIds)
    || (adopted.durationSeconds !== 5 && adopted.durationSeconds !== 10)
    || adopted.aspectRatio !== "9:16"
    || !capability
    || (capability.mode !== "firstframe_prompt" && capability.mode !== "native_motion_reference")
    || !stringArray(capability.preserved)
    || !stringArray(capability.lossy)
  ) {
    invalid();
  }

  let previs: PrevisScene;
  try {
    previs = parsePrevisScene(JSON.stringify(input.previs));
  } catch {
    invalid();
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: "kiikis.previs.version",
    projectId: input.projectId,
    workId: input.workId,
    sourceUnitId: input.sourceUnitId,
    storyboardRevision: Number(input.storyboardRevision),
    sceneId: input.sceneId,
    shotId: input.shotId,
    shotLabel: input.shotLabel,
    previs,
    adoptedInput: {
      firstframeJobId: adopted.firstframeJobId,
      firstframeUrlAtSave: adopted.firstframeUrlAtSave,
      prompt: adopted.prompt,
      promptInputHash: adopted.promptInputHash,
      referenceVersionIds: [...adopted.referenceVersionIds],
      durationSeconds: adopted.durationSeconds,
      aspectRatio: "9:16" as const,
    },
    capabilityTranslation: {
      mode: capability.mode,
      preserved: [...capability.preserved],
      lossy: [...capability.lossy],
    },
    snapshotHash: input.snapshotHash,
    createdAt: input.createdAt,
  });
}

export function summarizePrevisVersion(record: PrevisVersionRecord): PrevisVersionSummary {
  return {
    id: record.id,
    versionNo: record.versionNo,
    shotId: record.snapshot.shotId,
    shotLabel: record.snapshot.shotLabel,
    firstframeUrl: record.snapshot.adoptedInput.firstframeUrlAtSave,
    prompt: record.snapshot.adoptedInput.prompt,
    capabilityTranslation: record.snapshot.capabilityTranslation,
    createdAt: record.snapshot.createdAt,
  };
}
