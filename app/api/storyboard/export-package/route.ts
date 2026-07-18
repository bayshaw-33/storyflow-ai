/**
 * POST /api/storyboard/export-package — PRD §10 TRAE-PW-P0-006
 *
 * 服务端构建完整生产包 ZIP（script + storyboard + assets + images + videos + manifest）。
 *
 * 安全边界：
 *   - 必须登录 + projectId + sourceUnitId 作用域校验
 *   - draft projectId 拒绝（403）—— 草稿不含云端权威数据
 *   - 所有文件从 Supabase Storage 用 service role key 直接拉取，不依赖客户端签名 URL
 *   - Provider 临时 URL 永不进入 ZIP（只从 storage_path 拉取）
 *   - 部分失败标为 partial_failure，manifest 记录缺失项
 *   - 跨 owner / 跨项目返回 403/404
 */

import { NextRequest } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { loadStoryboardState } from "@/lib/storyboard/state-api";
import { buildProductionPackage } from "@/lib/storyboard/export-package";
import { recordEvidenceEvent } from "@/lib/evidence/ledger";
import { exportEvidenceEvent } from "@/lib/evidence/hooks";
import { isEvidenceLedgerEnabled } from "@/lib/evidence/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductionProjectRow = {
  id: string;
  title: string;
  source_summary: string;
  owner_id: string;
};

type AssetRow = {
  id: string;
  asset_type: string;
  storage_path: string | null;
  metadata: Record<string, unknown>;
};

type JobRow = {
  id: string;
  target_id: string | null;
  result_url: string | null;
  storage_path: string | null;
  result_metadata: Record<string, unknown>;
  input_params: Record<string, unknown>;
};

function errorResponse(status: number, code: string, error: string) {
  return Response.json({ success: false, error, code }, { status });
}

export async function POST(request: NextRequest) {
  // --- 1. Auth ---
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHORIZED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(503, "STORAGE_NOT_CONFIGURED", "存储服务未配置。");
  }

  // --- 2. Scope validation ---
  const body = await request.json().catch(() => ({})) as { projectId?: string; sourceUnitId?: string };
  const projectId = String(body.projectId || "").trim();
  const sourceUnitId = String(body.sourceUnitId || "").trim();
  if (!projectId || !sourceUnitId) {
    return errorResponse(422, "MISSING_SCOPE", "缺少 projectId 或 sourceUnitId。");
  }
  // draft 拒绝：草稿不含云端权威数据
  if (projectId.startsWith("draft-")) {
    return errorResponse(403, "DRAFT_NOT_ARCHIVED", "请先归档草稿为正式项目再导出。");
  }

  try {
    // --- 3. Load production project (title + manuscript) ---
    const projectRows = await serviceFetch<ProductionProjectRow[]>(
      `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id,title,source_summary,owner_id&limit=1`,
    );
    const project = projectRows?.[0];
    if (!project) {
      return errorResponse(404, "PROJECT_NOT_FOUND", "项目不存在或无权访问。");
    }

    // --- 4. Load storyboard state (scenes + revision) ---
    const state = await loadStoryboardState(userId, projectId, sourceUnitId);
    const scenes = state?.scenes ?? [];
    const revision = state?.revision ?? 0;

    // --- 5. Query art assets for the project ---
    const assetRows = await serviceFetch<AssetRow[]>(
      `/rest/v1/storyflow_assets?user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,asset_type,storage_path,metadata&order=created_at.desc&limit=500`,
    );
    const assets = (assetRows ?? [])
      .filter((row) => row.storage_path)
      .map((row) => ({
        id: row.id,
        assetType: normalizeAssetType(row.asset_type),
        storagePath: row.storage_path,
        displayName: String((row.metadata as { displayName?: string }).displayName || (row.metadata as { name?: string }).name || row.id),
      }));

    // --- 6. Query storyboard image jobs (completed) ---
    const imageJobRows = await serviceFetch<JobRow[]>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.image&target_type=eq.storyboard_shot&project_id=eq.${encodeURIComponent(projectId)}&status=eq.completed&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(sourceUnitId)}&order=created_at.desc&limit=200&select=id,target_id,result_url,storage_path,result_metadata,input_params`,
    );
    const storyboardImages = (imageJobRows ?? []).map((row) => {
      const meta = row.result_metadata as { storagePath?: string; contentType?: string };
      const inputParams = row.input_params as { shotId?: string };
      return {
        jobId: row.id,
        shotId: inputParams.shotId || row.target_id || row.id,
        storagePath: (meta.storagePath as string | undefined) || row.storage_path || null,
        resultUrl: row.result_url,
        contentType: meta.contentType || "image/png",
      };
    });

    // --- 7. Query video jobs (completed + storage_path) ---
    const videoJobRows = await serviceFetch<JobRow[]>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.video&target_type=eq.storyboard_shot_video&project_id=eq.${encodeURIComponent(projectId)}&status=eq.completed&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(sourceUnitId)}&order=created_at.desc&limit=200&select=id,target_id,storage_path,result_metadata,input_params`,
    );
    const videos = (videoJobRows ?? [])
      .filter((row) => row.storage_path)
      .map((row) => {
        const meta = row.result_metadata as { contentType?: string };
        const inputParams = row.input_params as { shotId?: string };
        return {
          jobId: row.id,
          shotId: inputParams.shotId || row.target_id || row.id,
          storagePath: row.storage_path as string,
          contentType: meta.contentType || "video/mp4",
        };
      });

    // --- 8. Build ZIP ---
    const result = await buildProductionPackage({
      userId,
      projectId,
      sourceUnitId,
      projectTitle: project.title,
      manuscript: project.source_summary,
      revision,
      scenes,
      assets,
      storyboardImages,
      videos,
      fetchStorageBytes: fetchStorageBytes,
    });

    // --- 9. Evidence event ---
    if (isEvidenceLedgerEnabled()) {
      try {
        await recordEvidenceEvent(exportEvidenceEvent({
          ownerId: userId,
          projectId,
          sourceUnitId,
          exportId: `production-package-${Date.now()}`,
          exportType: "archive",
          contentId: result.manifest.entries.find((e) => e.path === "manifest.json")?.sha256 || "",
          metadataHash: null,
        }));
      } catch (evidenceError) {
        // 留痕失败不阻塞导出（PRD §11.3）
        console.error("[evidence] export package trace failed", evidenceError);
      }
    }

    // --- 10. Return ZIP ---
    const safeTitle = (project.title || "production").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
    const filename = `${safeTitle}-${sourceUnitId}-production-package.zip`;
    return new Response(result.zipBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(result.zipBytes.length),
        "X-Export-Status": result.manifest.overallStatus,
        "X-Export-Failed-Count": String(result.manifest.counts.failed),
      },
    });
  } catch (error) {
    console.error("[storyboard/export-package] export failed", error);
    return errorResponse(500, "EXPORT_FAILED", "导出失败，请稍后重试。");
  }
}

/**
 * 从 Supabase Storage 用 service role key 直接拉取文件 bytes。
 * 不使用签名 URL，避免过期问题（PRD §10.3）。
 */
async function fetchStorageBytes(bucket: string, storagePath: string): Promise<Uint8Array> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceKey) {
    throw new Error("MISSING_SUPABASE_STORAGE_CONFIG");
  }
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${storagePath}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!resp.ok) {
    const status = resp.status;
    // PRD §10.3：不能把 HTTP 404/403 响应体当文件写进 ZIP
    throw new Error(`STORAGE_FETCH_FAILED:${status}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function normalizeAssetType(raw: string): "character" | "location" | "prop" {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("location") || lower.includes("scene")) return "location";
  if (lower.includes("prop")) return "prop";
  return "character";
}
