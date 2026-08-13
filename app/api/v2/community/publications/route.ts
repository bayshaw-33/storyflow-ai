import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  createPublication,
  listPublicationsByPublisher,
  CommunityServiceError,
} from "@/lib/server/v2/community/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/publications — 列出当前用户发布的 publications
 *
 * POST /api/v2/community/publications — 创建 publication (CM-001)
 *   CM-001: publisherId 由服务端从认证用户注入，客户端不可传入。
 *   body: { sourceType, sourceId, sourceVersion?, title, summary?, coverUrl?, visibility?, inviteTokenHash?, idempotencyKey? }
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
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");

    const items = await listPublicationsByPublisher(serviceFetch, user.id, {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.publication/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list publications.");
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

    // CM-001 / RG-001: publisherId 由服务端注入，不接受客户端传入
    // idempotencyKey 缺失时由服务端生成确定性 key
    const idempotencyKey =
      body.idempotencyKey ||
      `pub:${user.id}:${body.sourceType}:${body.sourceId}:${body.sourceVersion ?? "latest"}`;

    const publication = await createPublication(serviceFetch, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      sourceVersion: body.sourceVersion ?? null,
      publisherId: user.id,
      title: body.title,
      summary: body.summary ?? "",
      coverUrl: body.coverUrl ?? null,
      visibility: body.visibility ?? "public",
      inviteTokenHash: body.inviteTokenHash ?? null,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.community.publication/1",
        publication,
      },
      { status: 201 },
    );
  } catch (error) {
    return communityErrorResponse(error, "Unable to create publication.");
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
