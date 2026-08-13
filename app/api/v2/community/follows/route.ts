import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  toggleFollow,
  listFollows,
  isFollowing,
  CommunityServiceError,
} from "@/lib/server/v2/community/interactions";
import { isFollowTargetType } from "@/lib/contracts/v2/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/follows — 列出当前用户的关注
 *   query: targetType?, limit?, offset?
 *   query: targetId=xxx&check=1 — 检查是否已关注某 target
 *
 * POST /api/v2/community/follows — 切换关注状态 (CM-003, 幂等 toggle)
 *   body: { targetType, targetId }
 *   返回 { following: boolean }，已关注则取消，未关注则关注
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType");
    const targetId = url.searchParams.get("targetId");
    const check = url.searchParams.get("check") === "1";

    // check 模式: 返回是否已关注
    if (check && targetType && targetId) {
      if (!isFollowTargetType(targetType)) {
        return NextResponse.json(
          { success: false, error: "Invalid targetType.", code: "validation_failed" },
          { status: 400 },
        );
      }
      const following = await isFollowing(serviceFetch, {
        followerId: user.id,
        targetType,
        targetId,
      });
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.community.follow/1",
        following,
      });
    }

    const items = await listFollows(
      serviceFetch,
      user.id,
      {
        targetType: targetType && isFollowTargetType(targetType) ? targetType : undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
        offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
      },
    );

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.follow/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list follows.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!isFollowTargetType(body.targetType)) {
      return NextResponse.json(
        { success: false, error: "Invalid targetType.", code: "validation_failed" },
        { status: 400 },
      );
    }
    if (!body.targetId) {
      return NextResponse.json(
        { success: false, error: "targetId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-003: 幂等 toggle (已关注→取消, 未关注→关注)
    const { following } = await toggleFollow(serviceFetch, {
      targetType: body.targetType,
      targetId: body.targetId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.follow/1",
      following,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to toggle follow.");
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
