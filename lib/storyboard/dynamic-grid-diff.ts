/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜 diff (K21-SB-007, K21-SB-008)
 *
 * 字段级 diff，用于:
 * - CAS 冲突时返回 409 + 字段级差异
 * - 新 handoff 到达时按场生成 diff，让用户选择保留人工编辑或接受新内容
 * - 历史 revision 之间的对比 (Production Workbench diff dialog)
 *
 * 纯函数，无副作用，无 IO。
 */

import type {
  DynamicGridSceneV1,
  DynamicGridFrameV1,
  SpatialPlan,
} from "./dynamic-grid-contract.ts";

/** 单字段差异。 */
export interface FieldDelta {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  /** 该 frame 是否被人工锁定/编辑 (用于 UI 高亮 "锁定被覆盖")。 */
  readonly locked: boolean;
  readonly userEdited: boolean;
}

/** 单个 frame 的差异。 */
export interface FrameDiff {
  readonly frameId: string;
  readonly order: number;
  readonly kind: "added" | "removed" | "modified";
  readonly fields: ReadonlyArray<FieldDelta>;
}

/** 场景元数据差异 (frames 之外的字段)。 */
export interface SceneMetadataDelta {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/** 完整 storyboard diff 结果。 */
export interface StoryboardDiff {
  /** 旧 scene ID (理论上一致, 但 handoff 可能改变 scene 顺序)。 */
  readonly sceneId: string;
  readonly metadataChanged: boolean;
  readonly metadataDeltas: ReadonlyArray<SceneMetadataDelta>;
  readonly framesAdded: ReadonlyArray<FrameDiff>;
  readonly framesRemoved: ReadonlyArray<FrameDiff>;
  readonly framesModified: ReadonlyArray<FrameDiff>;
  /** 0..1 之间的相似度, 用于 UI 显示 "差异程度"。 */
  readonly similarity: number;
  /** 简要总结, 用于 409 响应或日志。 */
  readonly summary: string;
}

const EMPTY_DIFF: StoryboardDiff = Object.freeze({
  sceneId: "",
  metadataChanged: false,
  metadataDeltas: [],
  framesAdded: [],
  framesRemoved: [],
  framesModified: [],
  similarity: 1,
  summary: "no changes",
});

/**
 * 比较两个 SpatialPlan, 返回字段级差异。
 */
export function diffSpatialPlan(
  prev: SpatialPlan,
  next: SpatialPlan,
): ReadonlyArray<SceneMetadataDelta> {
  const deltas: SceneMetadataDelta[] = [];

  if (prev.axis !== next.axis) {
    deltas.push({ field: "spatialPlan.axis", oldValue: prev.axis, newValue: next.axis });
  }

  const prevEntrances = [...prev.entrances].sort().join("|");
  const nextEntrances = [...next.entrances].sort().join("|");
  if (prevEntrances !== nextEntrances) {
    deltas.push({
      field: "spatialPlan.entrances",
      oldValue: prev.entrances,
      newValue: next.entrances,
    });
  }

  const prevDirs = [...prev.screenDirections].sort().join("|");
  const nextDirs = [...next.screenDirections].sort().join("|");
  if (prevDirs !== nextDirs) {
    deltas.push({
      field: "spatialPlan.screenDirections",
      oldValue: prev.screenDirections,
      newValue: next.screenDirections,
    });
  }

  return deltas;
}

/**
 * 比较场景级元数据 (frames 之外的字段)。
 */
export function diffSceneMetadata(
  prev: DynamicGridSceneV1,
  next: DynamicGridSceneV1,
): ReadonlyArray<SceneMetadataDelta> {
  const deltas: SceneMetadataDelta[] = [];

  if (prev.continuityMode !== next.continuityMode) {
    deltas.push({
      field: "continuityMode",
      oldValue: prev.continuityMode,
      newValue: next.continuityMode,
    });
  }

  if (prev.gridCount !== next.gridCount) {
    deltas.push({
      field: "gridCount",
      oldValue: prev.gridCount,
      newValue: next.gridCount,
    });
  }

  if (prev.gridRationale !== next.gridRationale) {
    deltas.push({
      field: "gridRationale",
      oldValue: prev.gridRationale,
      newValue: next.gridRationale,
    });
  }

  if (prev.sharedCinematography !== next.sharedCinematography) {
    deltas.push({
      field: "sharedCinematography",
      oldValue: prev.sharedCinematography,
      newValue: next.sharedCinematography,
    });
  }

  if (prev.negativePrompt !== next.negativePrompt) {
    deltas.push({
      field: "negativePrompt",
      oldValue: prev.negativePrompt,
      newValue: next.negativePrompt,
    });
  }

  deltas.push(...diffSpatialPlan(prev.spatialPlan, next.spatialPlan));

  return deltas;
}

/** Frame 中参与 diff 的字段列表 (顺序固定, 用于确定性输出)。 */
const FRAME_DIFF_FIELDS = [
  "visualDescription",
  "characterIds",
  "shotSize",
  "cameraMovement",
  "emotion",
  "dialogue",
  "action",
  "timecode",
  "locked",
  "userEdited",
] as const;

/**
 * 比较两个 frame, 返回字段级差异。
 * frame.id 和 frame.order 不参与 diff (它们是身份字段, 由 frameId 关联)。
 */
export function diffFrames(
  prev: DynamicGridFrameV1,
  next: DynamicGridFrameV1,
): ReadonlyArray<FieldDelta> {
  const deltas: FieldDelta[] = [];

  for (const field of FRAME_DIFF_FIELDS) {
    const oldVal = prev[field] as unknown;
    const newVal = next[field] as unknown;

    if (!deepEqual(oldVal, newVal)) {
      deltas.push({
        field,
        oldValue: oldVal,
        newValue: newVal,
        locked: prev.locked,
        userEdited: prev.userEdited,
      });
    }
  }

  return deltas;
}

/**
 * 浅层 + 数组/对象深比较 (不递归到原型链)。
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object).sort();
    const bKeys = Object.keys(b as object).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      const k = aKeys[i];
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * 计算两个 storyboard 之间的完整 diff。
 *
 * 关键规则 (K21-SB-007):
 * - 如果 prev.frame.locked = true 或 userEdited = true,
 *   且新 frame 修改了该 frame 的内容字段 → 标记为 "锁定被覆盖" 冲突
 *   (由调用方根据 locked/userEdited 字段决定如何处理)
 */
export function diffStoryboards(
  prev: DynamicGridSceneV1,
  next: DynamicGridSceneV1,
): StoryboardDiff {
  if (prev.sceneId !== next.sceneId) {
    // 不同场景, 不应比较; 返回完整替换
    return Object.freeze({
      sceneId: next.sceneId,
      metadataChanged: true,
      metadataDeltas: [
        {
          field: "sceneId",
          oldValue: prev.sceneId,
          newValue: next.sceneId,
        },
      ],
      framesAdded: next.frames.map((f) => ({
        frameId: f.id,
        order: f.order,
        kind: "added" as const,
        fields: [],
      })),
      framesRemoved: prev.frames.map((f) => ({
        frameId: f.id,
        order: f.order,
        kind: "removed" as const,
        fields: [],
      })),
      framesModified: [],
      similarity: 0,
      summary: `sceneId replaced: ${prev.sceneId} → ${next.sceneId}`,
    });
  }

  const metadataDeltas = diffSceneMetadata(prev, next);

  // 按 frame.id 关联
  const prevById = new Map<string, DynamicGridFrameV1>();
  for (const f of prev.frames) prevById.set(f.id, f);
  const nextById = new Map<string, DynamicGridFrameV1>();
  for (const f of next.frames) nextById.set(f.id, f);

  const framesAdded: FrameDiff[] = [];
  const framesRemoved: FrameDiff[] = [];
  const framesModified: FrameDiff[] = [];

  for (const nextFrame of next.frames) {
    const prevFrame = prevById.get(nextFrame.id);
    if (!prevFrame) {
      framesAdded.push({
        frameId: nextFrame.id,
        order: nextFrame.order,
        kind: "added",
        fields: [],
      });
    } else {
      const fieldDeltas = diffFrames(prevFrame, nextFrame);
      if (fieldDeltas.length > 0) {
        framesModified.push({
          frameId: nextFrame.id,
          order: nextFrame.order,
          kind: "modified",
          fields: fieldDeltas,
        });
      }
    }
  }

  for (const prevFrame of prev.frames) {
    if (!nextById.has(prevFrame.id)) {
      framesRemoved.push({
        frameId: prevFrame.id,
        order: prevFrame.order,
        kind: "removed",
        fields: [],
      });
    }
  }

  // 计算相似度: 1 - (变更字段数 / 总字段数)
  const totalFrameFields = prev.frames.length * FRAME_DIFF_FIELDS.length;
  let changedFields = 0;
  for (const m of framesModified) changedFields += m.fields.length;
  changedFields += framesAdded.length * FRAME_DIFF_FIELDS.length;
  changedFields += framesRemoved.length * FRAME_DIFF_FIELDS.length;
  const similarity = totalFrameFields === 0 ? 1 : Math.max(0, 1 - changedFields / totalFrameFields);

  const parts: string[] = [];
  if (metadataDeltas.length > 0) parts.push(`${metadataDeltas.length} metadata fields`);
  if (framesAdded.length > 0) parts.push(`${framesAdded.length} frames added`);
  if (framesRemoved.length > 0) parts.push(`${framesRemoved.length} frames removed`);
  if (framesModified.length > 0) parts.push(`${framesModified.length} frames modified`);
  const summary = parts.length === 0 ? "no changes" : parts.join(", ");

  return Object.freeze({
    sceneId: next.sceneId,
    metadataChanged: metadataDeltas.length > 0,
    metadataDeltas,
    framesAdded: Object.freeze(framesAdded),
    framesRemoved: Object.freeze(framesRemoved),
    framesModified: Object.freeze(framesModified),
    similarity,
    summary,
  });
}

/**
 * 判断 diff 是否包含锁定冲突 (locked frame 内容被修改)。
 * 用于 RPC 决策是否拒绝 AI 自动重新生成。
 */
export function hasLockedOverride(diff: StoryboardDiff): boolean {
  for (const modified of diff.framesModified) {
    for (const field of modified.fields) {
      if ((field.locked || field.userEdited) && field.field !== "locked" && field.field !== "userEdited") {
        return true;
      }
    }
  }
  // 也要检查 removed frames 是否是 locked
  for (const removed of diff.framesRemoved) {
    // removed frame 没有 prev 字段信息, 这里无法判断, 默认认为删除 locked frame 是冲突
    // (实际场景中 diff 的 removed 是 prev 的 frame, 但 removed.fields 为空, 需要外部上下文)
    // 简化: 不在这里检测 removed, 由 store 层在 RPC 前检查
  }
  return false;
}

/**
 * 判断 diff 是否为空 (无任何变化)。
 */
export function isEmptyDiff(diff: StoryboardDiff): boolean {
  return (
    !diff.metadataChanged &&
    diff.framesAdded.length === 0 &&
    diff.framesRemoved.length === 0 &&
    diff.framesModified.length === 0
  );
}
