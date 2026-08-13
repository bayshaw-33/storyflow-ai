/**
 * KIIKIS 2.1 Phase 2 — Dynamic Storyboards 服务入口
 *
 * 重导出 store 与 diff, 供 API routes 与 UI client 使用。
 */

export {
  DynamicGridStoreError,
  upsertStoryboardWithCAS,
  getCurrentStoryboard,
  listStoryboardsForHandoff,
  getStoryboardHistory,
  getStoryboardById,
  hashFrames,
  isCasConflict,
  isUpsertSuccess,
  type StoryboardFetcher,
  type UpsertStoryboardInput,
  type UpsertResult,
  type CasConflict,
  type CurrentStoryboardResult,
  type StoryboardHistoryEntry,
} from "../../../storyboard/dynamic-grid-store.ts";

export {
  diffStoryboards,
  diffFrames,
  diffSceneMetadata,
  diffSpatialPlan,
  hasLockedOverride,
  isEmptyDiff,
  type StoryboardDiff,
  type FrameDiff,
  type FieldDelta,
  type SceneMetadataDelta,
} from "../../../storyboard/dynamic-grid-diff.ts";
