/**
 * Export Request/Status/Download API 共享类型。
 *
 * 关联任务卡：KIIKIS-TR-G0-002。
 * 仅服务端使用，不进入客户端 bundle。
 */

import type { ContentKind, JurisdictionProfile, VisibleDisclosureMode } from "@/lib/compliance/types";

/** 客户端允许提交的 AI 来源标签（服务端会据此推导 aiGenerated/aiModified 布尔）。 */
export type AiOrigin = "ai_generated" | "ai_modified" | "human_only" | "unknown";

/** 客户端允许提交的导出格式（Phase 0 仅 project_json/project_markdown 走 Gate；其余走 /api/compliance/export multipart）。 */
export type ExportSourceKind =
  | "project_json"
  | "project_markdown"
  | "universe_json"
  | "production_script"
  | "production_assembly"
  | "archive_manifest"
  | "viral_script"
  | "video_render"
  | "art_asset"
  | "custom";

/** 客户端允许提交的导出类型。 */
export type ExportType = "markdown" | "json" | "docx" | "pdf" | "image" | "audio" | "video" | "archive" | "compliance_package";

/** storyflow_exports.status 状态机取值。 */
export type ExportStatus =
  | "pending_request"
  | "marking"
  | "verifying"
  | "ready"
  | "downloaded"
  | "blocked"
  | "failed"
  | "completed";

/** POST /api/exports/request 请求体。 */
export interface ExportRequestInput {
  projectId: string;
  exportType: ExportType;
  sourceKind: ExportSourceKind;
  jurisdictionProfile: JurisdictionProfile;
  aiOrigin: AiOrigin;
  providerCode: string;
  visibleDisclosureMode: VisibleDisclosureMode;
  episodeId?: string;
  /** 仅 audio 类导出需要；其它类型应省略。 */
  syntheticVoice?: boolean;
  voiceLicenseStatus?: string;
  referenceRightsStatus?: string;
  /** 可选，仅用于幂等重试：客户端上次拿到的 exportId。 */
  idempotencyKey?: string;
}

/** Request API 返回体。 */
export interface ExportRequestResponse {
  exportId: string;
  contentId: string;
  status: ExportStatus;
  blockingCode?: string;
  /** 仅当 status='ready' 时返回；过期时间由 download_url_expires_at 决定。 */
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
  complianceRunId?: string;
  labelRecordId?: string;
  metadataHash?: string;
}

/** storyflow_exports 行形状（API 内部使用，不直接对外）。 */
export interface ExportRow {
  id: string;
  user_id: string;
  project_id: string;
  export_type: ExportType;
  format: string | null;
  storage_path: string | null;
  file_url: string | null;
  payload_json: unknown;
  metadata: Record<string, unknown> | null;
  status: ExportStatus;
  created_at: string;
  jurisdiction_profile: JurisdictionProfile | null;
  ai_origin: AiOrigin | null;
  content_id: string | null;
  provider_code: string | null;
  visible_disclosure_mode: VisibleDisclosureMode | null;
  compliance_run_id: string | null;
  label_record_id: string | null;
  metadata_hash: string | null;
  verification_status: "pending" | "verified" | "failed" | "blocked" | null;
  blocking_reason_code: string | null;
  download_url_signed: string | null;
  download_url_expires_at: string | null;
  source_kind: ExportSourceKind | null;
  updated_at: string | null;
}

/** 把 AiOrigin 推导为 Gate 需要的 aiGenerated/aiModified 布尔。 */
export function deriveAiFlags(aiOrigin: AiOrigin): { aiGenerated: boolean; aiModified: boolean } {
  if (aiOrigin === "ai_generated") return { aiGenerated: true, aiModified: false };
  if (aiOrigin === "ai_modified") return { aiGenerated: false, aiModified: true };
  return { aiGenerated: false, aiModified: false };
}

/** 把 sourceKind 推导为 Gate 需要的 contentKind。 */
export function resolveContentKind(sourceKind: ExportSourceKind): ContentKind {
  if (sourceKind === "video_render") return "video";
  if (sourceKind === "art_asset") return "image";
  if (sourceKind === "production_assembly") return "audio";
  return "text";
}

/** 把 exportType 映射到文件扩展名（用于 inputPath/outputPath）。 */
export function extensionForExportType(exportType: ExportType): string {
  if (exportType === "markdown") return "md";
  if (exportType === "json") return "json";
  if (exportType === "docx") return "docx";
  if (exportType === "pdf") return "pdf";
  if (exportType === "image") return "png";
  if (exportType === "audio") return "wav";
  if (exportType === "video") return "mp4";
  if (exportType === "archive") return "zip";
  return "bin";
}
