/**
 * TRAE-V2-05 Video Model Gateway V1
 * 类型定义：Provider 接口、Job 请求/响应、状态机
 *
 * 设计原则：
 * - 复用现有 storyflow_generation_jobs 表（不新建 video_jobs）
 * - 复用现有 lib/ai/video/ 作为底层实现
 * - API Key 只走环境变量，永不返回浏览器
 * - Provider 临时 URL 不入库
 * - 只有结果转存并建立正式 Asset 后才能进入 completed
 */

// ============================================================
// Provider 接口
// ============================================================

/** Provider 名称（与 storyflow_generation_jobs.provider 一致） */
export type VideoGatewayProviderName =
  | "atlas" // Atlas Cloud 兼容路径（含 Seedance via atlascloud）
  | "minimax" // MiniMax Hailuo
  | "runway" // Runway（首期 stub）
  | "seedance"; // 火山引擎 Seedance 直连（首期 stub）

/** 提交生成的输入 */
export type VideoGatewaySubmitInput = {
  prompt: string;
  /** 首帧图 URL（已确认的分镜示意图，由服务端解析） */
  firstframeUrl: string;
  /** 时长秒数：5 / 10 */
  duration?: number;
  /** 画幅：9:16 / 16:9 / 1:1 */
  aspectRatio?: string;
  /** Provider 特定参数（seed/guidance 等） */
  providerParams?: Record<string, unknown>;
};

/** 提交结果 */
export type VideoGatewaySubmitResult = {
  providerTaskId: string;
  /** Provider 诊断信息（非敏感） */
  provider: {
    name: VideoGatewayProviderName;
    model: string;
  };
  /** 原始响应（仅日志用） */
  raw: Record<string, unknown>;
};

/** 轮询状态 */
export type VideoGatewayPollStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "cancelled";

/** 轮询结果 */
export type VideoGatewayPollResult = {
  status: VideoGatewayPollStatus;
  /** done 时 provider 返回的视频临时 URL（需转存到自有 Storage） */
  videoUrl?: string;
  /** error 时的原始状态字符串 */
  rawStatus?: string;
  /** 完成时的元信息（duration/dimensions 等） */
  metadata?: Record<string, unknown>;
};

/** Provider 接口 */
export type VideoGatewayProvider = {
  readonly name: VideoGatewayProviderName;
  /** 默认模型 ID */
  readonly defaultModel: string;
  /** 是否当前可用（API Key 已配置等） */
  isAvailable(): boolean;
  /** 不可用时返回原因码 */
  unavailableReason?: string;
  /** 提交任务 */
  submit(input: VideoGatewaySubmitInput): Promise<VideoGatewaySubmitResult>;
  /** 查询任务 */
  poll(providerTaskId: string): Promise<VideoGatewayPollResult>;
  /** 取消任务（best-effort，provider 不支持时返回 false） */
  cancel?(providerTaskId: string): Promise<boolean>;
};

// ============================================================
// Catalog（UI 展示用）
// ============================================================

export type ProviderCapability =
  | "image-to-video"
  | "text-to-video"
  | "first-frame"
  | "last-frame"
  | "loop";

export type ProviderCatalogEntry = {
  name: VideoGatewayProviderName;
  displayName: string;
  description: string;
  capabilities: ProviderCapability[];
  available: boolean;
  unavailableReason?: string;
  defaultModel: string;
  /** UI 显示的预计能力标签 */
  tags: string[];
};

// ============================================================
// Job 状态机
// ============================================================

/**
 * Generation Job 主状态（与现有 storyflow_generation_jobs.status CHECK 约束一致）
 * 细粒度子状态通过 result_metadata.sub_status 承载
 */
export type VideoJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * 细粒度子状态（PRD V2-05 §Job 状态）
 * 通过 result_metadata.sub_status 承载，不修改表 CHECK 约束
 */
export type VideoJobSubStatus =
  | "draft" // 草稿（创建后未提交）
  | "pending_confirm" // 待用户确认
  | "queued" // 已入队
  | "generating" // provider 已接受，正在生成
  | "result_ingesting" // 结果下载 + 转存中
  | "completed" // 全部完成（已建立 Asset）
  | "partial_failure" // 部分失败（如 sign 失败但 upload 成功）
  | "failed" // 完全失败
  | "cancel_requested" // 用户请求取消
  | "cancelled" // 已取消
  | "moderation_blocked" // 内容审核阻止
  | "expired" // provider 超时未完成
  | "needs_user_action" // 需要用户操作（如重试）
  | "provider_timeout"; // provider 超时

// ============================================================
// 请求/响应
// ============================================================

export type VideoGenerateRequest = {
  projectId: string;
  sourceUnitId: string;
  shotId: string;
  prompt: string;
  firstframeUrl: string;
  duration?: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  /** 用户选择的 provider；"auto" 表示由 gateway 路由 */
  provider: VideoGatewayProviderName | "auto";
  /** Provider 特定参数 */
  providerParams?: Record<string, unknown>;
  /** 幂等键（shotId + prompt hash，由服务端计算） */
  idempotencyKey?: string;
};

export type VideoGenerateResponse = {
  success: boolean;
  jobId: string;
  providerTaskId: string;
  provider: VideoGatewayProviderName;
  model: string;
  status: VideoJobStatus;
  subStatus: VideoJobSubStatus;
  /** 预计完成时间（秒），仅用于 UI 显示 */
  estimatedDurationSeconds?: number;
};

export type VideoJobStatusResponse = {
  success: boolean;
  jobId: string;
  status: VideoJobStatus;
  subStatus: VideoJobSubStatus;
  storagePath?: string;
  /** 完成时返回的签名 URL（短期） */
  signedUrl?: string;
  /** 完成时的资产 ID */
  assetId?: string;
  /** 失败原因（非敏感错误码） */
  errorCode?: string;
  errorMessage?: string;
  provider: VideoGatewayProviderName;
  model: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type VideoCancelResponse = {
  success: boolean;
  jobId: string;
  status: VideoJobStatus;
  subStatus: VideoJobSubStatus;
  /** provider 是否接受了取消请求 */
  providerAccepted: boolean;
};

export type VideoRetryResponse = VideoGenerateResponse;

// ============================================================
// 错误
// ============================================================

export type VideoGatewayErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "SCOPE_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_CALL_FAILED"
  | "RESULT_INGEST_FAILED"
  | "ASSET_NOT_FOUND"
  | "JOB_NOT_FOUND"
  | "JOB_ALREADY_COMPLETED"
  | "JOB_NOT_CANCELLABLE"
  | "DUPLICATE_JOB_IN_FLIGHT"
  | "VALIDATION_FAILED";

export class VideoGatewayError extends Error {
  code: VideoGatewayErrorCode;
  details?: Record<string, unknown>;
  constructor(
    code: VideoGatewayErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VideoGatewayError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isVideoGatewayError(
  error: unknown,
): error is VideoGatewayError {
  return error instanceof VideoGatewayError;
}
