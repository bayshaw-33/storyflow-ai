/**
 * Export API 客户端辅助函数（浏览器端）。
 *
 * 任务卡：KIIKIS-TR-G0-002-7
 *
 * 封装对 /api/exports/request、/api/exports/[id]/status、/api/exports/[id]/download
 * 三个端点的调用，供客户端组件迁移旧 Blob 导出时使用。
 *
 * Auth 模式与 lib/production/hooks.ts 一致：调用方传入 access_token，
 * 本模块负责拼装 Authorization: Bearer 头。
 */

import type { ExportRequestInput, ExportRequestResponse } from "@/lib/exports/types";

export interface ExportStatusResponse {
  exportId: string;
  status: "pending_request" | "marking" | "verifying" | "ready" | "downloaded" | "blocked" | "failed" | "completed";
  contentId?: string;
  blockingCode?: string;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
  complianceRunId?: string;
  labelRecordId?: string;
  metadataHash?: string;
  verificationStatus?: string;
  sourceKind?: string;
  exportType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class ExportApiError extends Error {
  readonly statusCode: number;
  readonly code: string | null;
  constructor(message: string, statusCode: number, code: string | null = null) {
    super(message);
    this.name = "ExportApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * 调用 POST /api/exports/request 创建合规导出。
 *
 * Phase 0 同步返回最终状态（ready/blocked/failed）；
 * 后续 Phase 可能返回 pending_request 需要轮询。
 */
export async function requestExport(
  token: string,
  input: ExportRequestInput,
): Promise<ExportRequestResponse> {
  const res = await fetch("/api/exports/request", {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => null);
  if (!data || data.success !== true) {
    const message = (data && typeof data.error === "string" && data.error) || "导出请求失败。";
    const code = (data && typeof data.code === "string" && data.code) || null;
    throw new ExportApiError(message, res.status, code);
  }
  const { success: _success, ...response } = data;
  return response as ExportRequestResponse;
}

/**
 * 查询导出状态：GET /api/exports/[id]/status
 */
export async function getExportStatus(
  token: string,
  exportId: string,
): Promise<ExportStatusResponse> {
  const res = await fetch(`/api/exports/${encodeURIComponent(exportId)}/status`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!data || data.success !== true) {
    const message = (data && typeof data.error === "string" && data.error) || "查询导出状态失败。";
    throw new ExportApiError(message, res.status);
  }
  const { success: _success, ...response } = data;
  return response as ExportStatusResponse;
}

/**
 * 触发下载：浏览器导航到 GET /api/exports/[id]/download（302 重定向到签名 URL）。
 *
 * 不使用 fetch（因为 fetch 不触发浏览器下载对话框）；
 * 直接设置 window.location.href 让浏览器处理 302 重定向。
 */
export function downloadExport(exportId: string): void {
  window.location.href = `/api/exports/${encodeURIComponent(exportId)}/download`;
}

/**
 * 便捷方法：创建导出 → 如果 ready 则直接下载，否则返回状态供调用方处理。
 *
 * Phase 0 的 Request API 是同步的，ready 时直接附带 downloadUrl；
 * 此函数优先使用返回的 downloadUrl（省一次 round-trip），仅在没有时回退到 download 端点。
 */
export async function requestExportAndDownload(
  token: string,
  input: ExportRequestInput,
): Promise<{ response: ExportRequestResponse; downloaded: boolean }> {
  const response = await requestExport(token, input);

  if (response.status === "ready" && response.downloadUrl) {
    const link = document.createElement("a");
    link.href = response.downloadUrl;
    link.download = "";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { response, downloaded: true };
  }

  if (response.status === "ready") {
    downloadExport(response.exportId);
    return { response, downloaded: true };
  }

  return { response, downloaded: false };
}

/**
 * 轮询导出状态直到 ready/blocked/failed 或超时。
 *
 * Phase 0 同步返回，通常不需要轮询；此函数留给 Phase 1 异步导出场景使用。
 */
export async function pollExportUntilReady(
  token: string,
  exportId: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<ExportStatusResponse> {
  const interval = options?.intervalMs ?? 1500;
  const timeout = options?.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await getExportStatus(token, exportId);
    if (
      status.status === "ready" ||
      status.status === "blocked" ||
      status.status === "failed" ||
      status.status === "downloaded" ||
      status.status === "completed"
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new ExportApiError("导出超时，请稍后重试。", 408);
}
