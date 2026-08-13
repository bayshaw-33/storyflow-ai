// 短剧样板工作流领域类型定义（K2-T-08）。
// 通过 WorkbenchAdapter 接入 K2-T-02 工作台外壳，不自建 contract_version，
// 引用 Codex 冻结的 v2 契约（lib/contracts/v2/index.ts）与外壳 StepStatus。
//
// 链路：剧本 → 美术 → 分镜 → 视频 → 导出，已确认资产跨阶段传递，
// 完成后生成 Universe Change Proposal 候选（不自动改写 Canon）。

import type { ChangeProposalStatus } from "../../../contracts/v2/index.ts";
import type { StepStatus } from "../workbench/types.ts";

// 从外壳重新导出契约版本，供短剧流内统一引用。
export {
  CONTRACT_VERSION,
  assertContractVersion,
} from "../workbench/types.ts";
export type { StepStatus };

// 5 个阶段 id，固定顺序：剧本 → 美术 → 分镜 → 视频 → 导出。
export type ShortDramaStageId =
  | "script"
  | "art"
  | "storyboard"
  | "video"
  | "export";

// 阶段顺序（用于状态机前置校验）。
export const STAGE_ORDER: ShortDramaStageId[] = [
  "script",
  "art",
  "storyboard",
  "video",
  "export",
];

// 阶段状态对齐外壳 StepStatus：completed | current | locked | available。
export type ShortDramaStageStatus = StepStatus;

// 剧本分析候选项（角色/场景/道具），由 AI 结构分析产出，用户勾选确认。
export interface ScriptCandidate {
  id: string;
  name: string;
  kind: "character" | "scene" | "prop";
  summary: string;
}

// 剧本阶段数据。
export interface ScriptStageData {
  status: ShortDramaStageStatus;
  // 剧本原文（上传或输入）。
  script: string;
  // AI 结构分析结果：角色/场景/道具候选。
  analysis: {
    characters: ScriptCandidate[];
    scenes: ScriptCandidate[];
    props: ScriptCandidate[];
  };
  // 用户已确认的候选 id（跨阶段传递的资产来源）。
  confirmed: {
    characterIds: string[];
    sceneIds: string[];
    propIds: string[];
  };
}

// 美术母版版本。url 为相对路径或稳定引用，不依赖临时签名 URL。
export interface ArtVersion {
  id: string;
  url: string;
  locked: boolean;
}

// 美术资产（继承自剧本确认的候选）。
export interface ArtAsset {
  id: string;
  name: string;
  type: "character" | "scene" | "prop";
  // 来源剧本候选 id，体现跨阶段传递。
  sourceCandidateId: string;
  versions: ArtVersion[];
  // 锁定的主版本 id（null 表示尚未锁定主版本）。
  mainVersionId: string | null;
}

// 美术阶段数据。
export interface ArtStageData {
  status: ShortDramaStageStatus;
  assets: ArtAsset[];
  // 待确认的候选（继承自剧本，尚未生成美术母版）。
  pendingConfirm: ScriptCandidate[];
}

// 分镜帧。
export interface StoryboardFrame {
  id: string;
  // 引用场景候选 id 或美术场景资产 id。
  sceneRef: string;
  shotDescription: string;
  confirmed: boolean;
}

// 分镜阶段数据。
export interface StoryboardStageData {
  status: ShortDramaStageStatus;
  frames: StoryboardFrame[];
}

// 视频镜头状态。
export type VideoShotStatus = "completed" | "failed" | "pending";

// 视频镜头。
export interface VideoShot {
  id: string;
  // 引用分镜帧 id，体现跨阶段传递。
  frameRef: string;
  status: VideoShotStatus;
  // 相对路径，不依赖临时 URL。
  url?: string;
  failureReason?: string;
}

// 视频阶段数据。
export interface VideoStageData {
  status: ShortDramaStageStatus;
  shots: VideoShot[];
}

// 导出包种类。
export type ExportPackageKind =
  | "script"
  | "shot_list"
  | "reference_image"
  | "storyboard_frame"
  | "video_shot"
  | "subtitle"
  | "prompt"
  | "evidence";

// 导出包状态。partial 表示部分内容缺失，不伪造为 ready。
export type ExportPackageStatus = "ready" | "missing" | "partial";

// 导出包。
export interface ExportPackage {
  id: string;
  kind: ExportPackageKind;
  label: string;
  status: ExportPackageStatus;
  missingReason?: string;
  // 稳定内容引用（相对路径或内联标识），不依赖临时 URL。
  contentRef: string;
}

// 导出阶段数据。
export interface ExportStageData {
  status: ShortDramaStageStatus;
  packages: ExportPackage[];
}

// 已确认资产集合（跨阶段传递的载体）。
export interface ConfirmedAssets {
  characterIds: string[];
  sceneIds: string[];
  propIds: string[];
}

// 资产流动记录：某个候选从剧本流经哪些阶段。
export interface AssetFlowRecord {
  candidateId: string;
  name: string;
  kind: "character" | "scene" | "prop";
  // 经过的阶段（顺序）。
  flow: ShortDramaStageId[];
}

// 回流候选：Universe Change Proposal，不自动改写 Canon。
export interface ShortDramaProposal {
  id: string;
  universeId: string;
  sourceProjectId: string;
  sourceStage: ShortDramaStageId;
  status: ChangeProposalStatus;
  confidence: number;
  fieldDiffs: { path: string; before: unknown; after: unknown }[];
  createdAt: string;
}

// 中断恢复点。
export interface RecoveryPoint {
  stage: ShortDramaStageId;
  confirmedAssets: ConfirmedAssets;
  lastSavedAt: string;
}

// 阶段数据联合（用于状态机遍历）。
export interface ShortDramaStages {
  script: ScriptStageData;
  art: ArtStageData;
  storyboard: StoryboardStageData;
  video: VideoStageData;
  export: ExportStageData;
}

// 短剧流聚合数据（fixture / API 共用结构）。
export interface ShortDramaData {
  contractVersion: string;
  project: {
    id: string;
    title: string;
    workflowType: string;
    currentStage: ShortDramaStageId;
    lastSavedAt: string;
  };
  universeBinding: {
    bound: boolean;
    universeId?: string;
    universeName?: string;
  };
  stages: ShortDramaStages;
  assetFlow: AssetFlowRecord[];
  proposals: ShortDramaProposal[];
  recoveryPoint: RecoveryPoint;
}

// localStorage 草稿结构（中断恢复用，明确未同步云端）。
export interface ShortDramaDraft {
  contractVersion: string;
  projectId: string;
  stage: ShortDramaStageId;
  confirmedAssets: ConfirmedAssets;
  // 草稿时间戳，用于判断是否过期。
  savedAt: string;
  // 显式标记：仅本地草稿，不等同于云端已同步。
  cloudSynced: false;
  // 可选：关联的继承快照 id（若恢复时尝试云端快照优先，记录所用快照 id）。
  // 缺失时表示该草稿从未关联云端快照。保持向后兼容：旧草稿无此字段。
  snapshotId?: string | null;
}

// ─── 端到端接线（K2-I-03）补充 DTO ───

// Universe 继承快照 payload 内的实体条目（对齐 C-03 服务端 toSnapshotDto 输出）。
// 注意：inheritance snapshot 用 type 字段（不是 kind），对齐 entity.type。
export interface SnapshotEntity {
  id: string;
  type: string;
  name: string;
  summary: string;
  status: string;
  updatedAt: string;
}

// Universe 继承快照 payload（C-03 GET /universe/snapshot 返回的 snapshot.payload）。
export interface ShortDramaSnapshotPayload {
  entities: SnapshotEntity[];
}

// 继承快照（C-03 GET /universe/snapshot 返回的 snapshot 字段）。
export interface InheritanceSnapshotBundle {
  id: string;
  projectId: string;
  universeId: string;
  universeVersion: string;
  includedObjectIds: string[];
  createdAt: string;
  payload: ShortDramaSnapshotPayload;
}

// C-03 快照 diff 返回的 fields 项（对齐 diffInheritanceSnapshot 输出）。
export interface SnapshotDiffField {
  path: string;
  before: unknown;
  after: unknown;
  impact: "added" | "changed" | "removed";
}

// C-03 快照 diff 响应（GET /universe/snapshot/diff 返回）。
export interface SnapshotDiffResult {
  snapshot: InheritanceSnapshotBundle;
  fields: SnapshotDiffField[];
  upgradeRequired: boolean;
  impacts: Array<{ path: string; reason: string }>;
}

// C-04 提交回流的 ProposalInput（对齐 lib/server/v2/proposals ProposalInput）。
export interface ProposalSubmitInput {
  sourceProjectId: string;
  sourceStep: string;
  originalText?: string;
  sourceAssetId?: string;
  sourceReference?: { kind: "text" | "asset" | "decision"; label: string };
  confidence: number;
  fieldDiffs: { path: string; before: unknown; after: unknown }[];
  suggestedAction: string;
  idempotencyKey: string;
  target: { objectType: string; objectId?: string };
  proposedPayload: Record<string, unknown>;
  currentPayload?: Record<string, unknown>;
}

// buildExportAndSubmitPayload 输出：回流提交 payload + 证据引用。
export interface ExportAndSubmitPayload {
  inputs: ProposalSubmitInput[];
  evidenceRefs: string[];
}
