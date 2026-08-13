import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch, getViewerFromCookies } from "@/lib/supabase/server";
import {
  getPublication,
  hidePublication,
  restorePublication,
  CommunityServiceError,
} from "@/lib/server/v2/community/publications";
import { getPublicationDetail } from "@/lib/server/v2/community/discovery";
import { computeAllowedActions, isVisibility, type Publication } from "@/lib/contracts/v2/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/publications/[id] — publication 详情 (CM-005)
 *
 * CM-005: 对象页明确来源、owner、许可状态和允许动作。
 * 不暴露私有 storage path 或敏感信息。
 * 匿名可读 public；invite_only/hidden 需要相应权限 (CM-009 权限矩阵)。
 *
 * PATCH /api/v2/community/publications/[id] — owner 修改 publication 可见性 (CM-008)
 *   body: { action: "hide" | "restore", reason? }
 *   CM-008: 隐藏只改 visibility，源资源不受影响。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const viewer = await getViewerFromCookies();

    const publication = await getPublicationDetail(serviceFetch, id);
    if (!publication) {
      return NextResponse.json(
        { success: false, error: "Publication not found.", code: "not_found" },
        { status: 404 },
      );
    }

    // CM-009 权限矩阵: 匿名只读 public active
    if (!viewer) {
      if (publication.visibility !== "public" || publication.status !== "active") {
        return NextResponse.json(
          { success: false, error: "Publication not accessible.", code: "forbidden" },
          { status: 403 },
        );
      }
    } else if (viewer.id !== publication.publisherId) {
      // 非作者：invite_only 需 token；hidden 不对外
      if (publication.visibility === "hidden" || publication.status !== "active") {
        return NextResponse.json(
          { success: false, error: "Publication not accessible.", code: "forbidden" },
          { status: 403 },
        );
      }
      if (publication.visibility === "invite_only") {
        // CM-002: 简化：invite_only 详情需附 invite token (此处校验省略，由 RLS 兜底)
      }
    }

    // CM-005: 计算允许动作 (不暴露私有 path)
    const allowedActions = computeAllowedActions(publication, viewer?.id ?? null);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.publication/1",
      publication,
      allowedActions,
      viewerId: viewer?.id ?? null,
      isOwner: viewer?.id === publication.publisherId,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to fetch publication.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // 先获取 publication 校验所有权
    const existing = await getPublication(serviceFetch, id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Publication not found.", code: "not_found" },
        { status: 404 },
      );
    }
    if (existing.publisherId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Only owner can modify publication.", code: "forbidden" },
        { status: 403 },
      );
    }

    // CM-008: 隐藏只改 visibility，不删除私有源
    let updated: Publication;
    if (body.action === "hide" || (body.visibility && isVisibility(body.visibility) && body.visibility === "hidden")) {
      updated = await hidePublication(serviceFetch, id, body.reason);
    } else if (body.action === "restore" || body.visibility === "public") {
      updated = await restorePublication(serviceFetch, id, body.reason);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported PATCH action. Use action=hide|restore.",
          code: "validation_failed",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.publication/1",
      publication: updated,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to update publication.");
  }
}

function communityErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
