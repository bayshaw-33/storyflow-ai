/**
 * GET /api/exports/[id]/status — Export Status API
 *
 * 任务卡：KIIKIS-TR-G0-002-4
 *
 * 鉴权后按 id + user_id 查询 storyflow_exports 行，返回当前状态、
 * blockingCode、downloadUrl（如已就绪）、compliance 审计 ID 等字段。
 *
 * 客户端轮询此接口判断导出是否就绪；ready/downloaded/completed 可走 download。
 */

import type { NextRequest } from "next/server";

import { apiError, ok } from "@/lib/api/responses";
import type { ExportRow } from "@/lib/exports/types";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ExportStatusResponse {
  exportId: string;
  status: ExportRow["status"];
  contentId?: string;
  blockingCode?: string;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
  complianceRunId?: string;
  labelRecordId?: string;
  metadataHash?: string;
  verificationStatus?: string;
  storagePath?: string;
  sourceKind?: string;
  exportType?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(_request);
    if (!hasServiceRoleConfig()) {
      return apiError(new Error("SUPABASE_SERVICE_ERROR:not_configured"), "导出服务未配置。", 503);
    }

    const { id: exportId } = await params;
    if (!exportId) {
      return apiError(new Error("MISSING_EXPORT_ID"), "缺少导出 ID。", 400);
    }

    const rows = await serviceFetch<ExportRow[]>(
      `/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
    );

    const row = rows?.[0];
    if (!row) {
      return apiError(new Error("EXPORT_NOT_FOUND"), "未找到导出记录。", 404);
    }

    const response: ExportStatusResponse = {
      exportId: row.id,
      status: row.status,
      contentId: row.content_id ?? undefined,
      blockingCode: row.blocking_reason_code ?? undefined,
      downloadUrl: row.download_url_signed ?? undefined,
      downloadUrlExpiresAt: row.download_url_expires_at ?? undefined,
      complianceRunId: row.compliance_run_id ?? undefined,
      labelRecordId: row.label_record_id ?? undefined,
      metadataHash: row.metadata_hash ?? undefined,
      verificationStatus: row.verification_status ?? undefined,
      storagePath: row.storage_path ?? undefined,
      sourceKind: row.source_kind ?? undefined,
      exportType: row.export_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    };
    return ok(response);
  } catch (error) {
    return apiError(error, "查询导出状态失败。");
  }
}
