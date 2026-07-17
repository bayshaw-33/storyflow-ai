/**
 * GET /api/exports/[id]/download — Download API
 *
 * 任务卡：KIIKIS-TR-G0-002-5
 *
 * 鉴权后查询 storyflow_exports：
 *   - blocked/failed → 409
 *   - 非 ready/downloaded/completed → 409（未就绪）
 *   - 签名 URL 未过期 → 302 重定向 + 异步标记 downloaded
 *   - 签名 URL 已过期 → 重新签名 → 更新记录 → 302 重定向
 *
 * 不直接流式返回文件字节：由 Supabase Storage 签名 URL 承担 CDN 分发，
 * API 路由仅做鉴权 + 状态机守卫 + 签名 URL 刷新。
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api/responses";
import { signExportArtifact } from "@/lib/exports/storage";
import type { ExportRow } from "@/lib/exports/types";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READY_STATUSES: readonly ExportRow["status"][] = ["ready", "downloaded", "completed"];
const BLOCKED_STATUSES: readonly ExportRow["status"][] = ["blocked", "failed"];

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

    if ((BLOCKED_STATUSES as readonly string[]).includes(row.status)) {
      return NextResponse.json(
        {
          success: false,
          error: "导出已被阻止或失败，无法下载。",
          code: row.blocking_reason_code,
        },
        { status: 409 },
      );
    }

    if (!(READY_STATUSES as readonly string[]).includes(row.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `导出尚未就绪（当前状态：${row.status}）。`,
          status: row.status,
        },
        { status: 409 },
      );
    }

    if (!row.storage_path) {
      return apiError(new Error("STORAGE_PATH_MISSING"), "导出记录缺少存储路径。", 500);
    }

    const nowMs = Date.now();
    const expiresMs = row.download_url_expires_at ? Date.parse(row.download_url_expires_at) : NaN;
    let downloadUrl = row.download_url_signed;
    let newExpiresAt = row.download_url_expires_at;

    // 签名 URL 缺失或已过期 → 重新签名
    if (!downloadUrl || Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      const reSigned = await signExportArtifact({ storagePath: row.storage_path });
      downloadUrl = reSigned.signedUrl;
      newExpiresAt = reSigned.expiresAt;

      await serviceFetch(`/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          download_url_signed: downloadUrl,
          download_url_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    // 异步标记 downloaded（fire-and-forget，不阻塞重定向）
    void serviceFetch(`/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "downloaded",
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {
      // 标记失败不影响下载本身
    });

    return NextResponse.redirect(downloadUrl!, { status: 302 });
  } catch (error) {
    return apiError(error, "下载失败。");
  }
}
