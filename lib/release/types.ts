/**
 * KM-G0-002C — 导出 artifact 发布链类型定义。
 * 仅使用可擦除语法（node:test 直接 import）。
 */

export type ArtifactStatus = "staged" | "released" | "bind_failed" | "rolled_back" | "cleaned";

export type QuarantineSource = "provider" | "upload" | "render";

/** storyflow_export_artifacts 行（与 migration 列一一对应）。 */
export interface ExportArtifactRow {
  id: string;
  owner_id: string;
  idempotency_key: string;
  status: ArtifactStatus;
  sha256: string;
  byte_length: number;
  content_type: string;
  staging_bucket: string;
  staging_path: string;
  final_bucket: string | null;
  final_key: string | null;
  bound_export_id: string | null;
  label_record_id: string | null;
  quarantine_source: QuarantineSource;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface StageInput {
  ownerId: string;
  /** 调用方提供的幂等键（同一 owner 下唯一；重试必须复用同一键）。 */
  idempotencyKey: string;
  bytes: Uint8Array;
  contentType?: string;
  source?: QuarantineSource;
  metadata?: Record<string, unknown>;
}

export interface ReleaseInput {
  /** stage() 返回的 artifact id。 */
  artifactId: string;
  ownerId: string;
  /** atomic DB bind 目标（TRAE Export Request 的记录 id）。 */
  exportId: string;
  /** 可选：Sprint 0 合规标识记录 id。 */
  labelRecordId?: string;
}

export interface SignDownloadInput {
  artifactId: string;
  /** 请求下载的用户；必须与 owner_id 一致且 authorize 通过。 */
  requesterId: string;
  /** 签名有效期（秒），封顶 MAX_DOWNLOAD_TTL_SECONDS。 */
  ttlSeconds?: number;
  /**
   * 额外授权钩子（由 API 层注入，例如 TRAE 接上 compliance run
   * decision=allowed 校验 / Codex 的权限策略）。返回 false 一律拒签。
   */
  authorize?: (artifact: ExportArtifactRow) => Promise<boolean>;
}

export interface SignedDownload {
  url: string;
  expiresIn: number;
  artifact: ExportArtifactRow;
}

export interface SweepResult {
  sweptObjects: number;
  markedCleaned: number;
  errors: string[];
}

/** 发布链错误：code 稳定，便于 API 层映射与测试断言。 */
export class ReleaseError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "ReleaseError";
  }
}

export const QUARANTINE_BUCKET = "export-quarantine";
export const ARTIFACTS_BUCKET = "export-artifacts";
export const MAX_DOWNLOAD_TTL_SECONDS = 300;
export const DEFAULT_DOWNLOAD_TTL_SECONDS = 120;
/** staging 超过该时长未完成 release 的对象视为孤儿，由 sweeper 收敛。 */
export const STAGING_ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;
