// Kiikis 2.0 工作台外壳领域类型定义
// 对应 K2-T-02：统一工作台外壳的适配器接口与数据契约。
// contract_version 引用 Codex 冻结的 v2 契约（lib/contracts/v2/index.ts），不自建。

import type { ReactNode } from "react";
import {
  assertContractVersion as assertV2ContractVersion,
  CONTRACT_VERSION as V2_CONTRACT_VERSION,
  type AssetStatus,
  type GenerationJobStatus,
} from "../../../contracts/v2/index.ts";

// 从 v2 契约重新导出，供外壳内统一引用，避免各处重复引用契约路径。
export const CONTRACT_VERSION = V2_CONTRACT_VERSION;
export type { AssetStatus, GenerationJobStatus };

// 工作台资产类型（外壳视角，比契约 AssetKind 更贴近创作语义）
export type WorkbenchAssetType = "character" | "scene" | "prop" | "storyboard" | "video";

// 保存状态：已保存 / 保存中 / 未保存
export type SaveStatus = "saved" | "saving" | "unsaved";

// Universe 绑定建议
export type UniverseBindingSuggestion = "bind_new" | "bind_existing" | "skip";

// 步骤状态机：已完成 / 当前 / 锁定 / 可进入
export type StepStatus = "completed" | "current" | "locked" | "available";

// 上下文切换类型（触发未保存提醒的场景）
export type ContextSwitchType = "project" | "universe" | "stage";

// 工作台项目元数据
export interface WorkbenchProject {
  id: string;
  title: string;
  workflowType: string;
  currentStage: string;
  lastSavedAt: string;
}

// Universe 绑定状态
export interface UniverseBinding {
  bound: boolean;
  universeId?: string;
  universeName?: string;
  suggestion?: UniverseBindingSuggestion;
}

// 生产步骤
export interface WorkbenchStep {
  id: string;
  label: string;
  status: StepStatus;
}

// 工作台资产
export interface WorkbenchAsset {
  id: string;
  name: string;
  type: WorkbenchAssetType;
  version: number;
  status: AssetStatus;
  locked: boolean;
}

// 运行中任务（外壳视角，stage 对齐契约 GenerationJobStatus）
export interface WorkbenchJob {
  id: string;
  name: string;
  type: string;
  stage: GenerationJobStatus;
  completed: number;
  total: number;
  failureReason?: string;
  resultUrl?: string;
}

// AI 消息
export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// AI 面板上下文
export interface AiContext {
  suggestions: string[];
  recentMessages: AiMessage[];
}

// 模型设置
export interface ModelSettings {
  mode: "smart" | "manual";
  currentModel?: string;
  recommendationReason?: string;
}

// 工作台外壳聚合数据（fixture / API 共用结构）
export interface WorkbenchData {
  contractVersion: string;
  project: WorkbenchProject;
  universeBinding: UniverseBinding;
  saveStatus: SaveStatus;
  steps: WorkbenchStep[];
  assets: WorkbenchAsset[];
  runningJobs: WorkbenchJob[];
  aiContext: AiContext;
  modelSettings: ModelSettings;
}

// 外壳加载状态
export type WorkbenchShellStatus = "loading" | "ready" | "error" | "unauthenticated";

// 校验 contract_version 是否匹配 Codex 冻结契约。
export function assertContractVersion(version: string): void {
  assertV2ContractVersion(version);
}

/**
 * 工作台适配器接口：各工作台实现后注入外壳。
 *
 * 这是 K2-T-08 短剧流接入的基础，接口需保持稳定。
 * 各工作台（novel/script/art/production/video/song）实现此接口后，
 * 把工作台主体内容作为 workbenchContent 传入，外壳负责统一呈现顶部栏、
 * 左侧步骤/资产、右侧 AI 面板、底部任务浮层。
 *
 * Phase 1 Task 1.5: workId 和版本指针是 Work 身份会话恢复的基础。
 * 当 workId 缺失时，外壳显示阻断错误而非本地假保存。
 */
export interface WorkbenchAdapter {
  // 工作台类型标识，如 "novel" | "script" | "art" | "production" | "video" | "song"
  workbenchType: string;
  // 当前项目元数据
  project: WorkbenchProject;
  // Universe 绑定状态
  universeBinding: UniverseBinding;
  // 保存状态
  saveStatus: SaveStatus;
  // 生产步骤导航（剧本→结构分析→角色→美术→分镜→视频→导出 等）
  steps: WorkbenchStep[];
  // 当前步骤 id
  currentStep: string;
  // 资产和版本列表
  assets: WorkbenchAsset[];
  // 运行中任务（浮层 TaskBar 展示）
  runningJobs: WorkbenchJob[];
  // AI 面板上下文
  aiContext: AiContext;
  // 模型设置
  modelSettings: ModelSettings;
  // 工作台主体内容，嵌入中间区 ContentArea
  workbenchContent: ReactNode;
  // 保存回调
  onSave: () => Promise<void> | void;
  // 切换步骤回调
  onStepChange: (stepId: string) => Promise<void> | void;
  // Phase 1 Task 1.5: Work 身份（缺失时外壳显示阻断错误）
  workId?: string | null;
  // 当前版本指针（来自 storyflow_works）
  currentVersionId?: string | null;
  // 最新 checkpoint 版本 ID
  latestCheckpointId?: string | null;
  // 已定稿版本 ID
  finalizedVersionId?: string | null;
  // Checkpoint 回调（创建不可变快照）
  onCreateCheckpoint?: () => Promise<void> | void;
  // Finalize 回调（定稿当前版本，不可逆）
  onFinalize?: () => Promise<void> | void;
  // Evidence 包下载回调
  onDownloadEvidence?: () => Promise<void> | void;
}
